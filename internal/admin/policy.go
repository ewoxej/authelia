// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package admin

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/authelia/authelia/v4/internal/configuration"
)

// The administration area can't be used to read files or environment variables the configuration doesn't already use.
// Template expressions are evaluated when a configuration is validated and when Janus restarts, so a new expression
// could read any file and show it in a validation error or in a setting which is displayed somewhere. A new expression
// therefore has to read a secret from a file in one of the directories the file picker can browse, which is what the
// web UI writes, and those directories can't be changed from the administration area.

const (
	redacted = "<redacted>"

	// redactedMinLength is the length below which values aren't redacted, as short values would hide unrelated text.
	redactedMinLength = 4

	// redactedPrefixLength is the length of the start of a value which is redacted when an error message shortens it.
	redactedPrefixLength = 12

	// redactedMaxFileSize is the size above which the files referenced by the environment aren't read.
	redactedMaxFileSize = 1 << 16
)

var (
	// reAllowedSecretArguments matches what may follow the path of a new secret expression: the functions which format
	// the content of the file.
	reAllowedSecretArguments = `((?:\s*\|\s*(?:mindent|nindent|indent|msquote|mquote|squote|quote|trim)(?:\s+(?:\d+|auto|"(?:[^"\\]|\\.)*"))*)*)`

	// reSensitiveFunction matches the template functions which read files or environment variables.
	reSensitiveFunction = regexp.MustCompile(`\b(?:secret|fileContent|env|expandenv)\b`)

	secretEnvSuffixes = []string{"KEY", "SECRET", "PASSWORD", "TOKEN", "CERTIFICATE_CHAIN"}
)

// templateFilter returns the template filter applied to the configuration files, if there is one.
func (m *ConfigurationManager) templateFilter() *configuration.TemplateBytesFilter {
	for _, filter := range m.filters {
		if f, ok := filter.(*configuration.TemplateBytesFilter); ok {
			return f
		}
	}

	return nil
}

// templateExpressions returns the template actions in the content, including actions which span several lines.
func templateExpressions(filter *configuration.TemplateBytesFilter, content []byte) []string {
	left, right := filter.Delimiters()

	return regexp.MustCompile(`(?s)`+regexp.QuoteMeta(left)+`.*?`+regexp.QuoteMeta(right)).FindAllString(string(content), -1)
}

// policyErrors returns the reasons the content can't be saved from the administration area. It runs before anything in
// the content is evaluated.
func (m *ConfigurationManager) policyErrors(content []byte) (errs []string, err error) {
	filter := m.templateFilter()
	if filter == nil {
		return nil, nil
	}

	var paths []string

	if paths, err = m.expand(); err != nil {
		return nil, err
	}

	existing := map[string]bool{}

	for _, path := range paths {
		var current []byte

		if current, err = os.ReadFile(path); err != nil {
			return nil, err
		}

		for _, expression := range templateExpressions(filter, current) {
			existing[expression] = true
		}
	}

	left, right := filter.Delimiters()

	reSecret := regexp.MustCompile(`^` + regexp.QuoteMeta(left) + `-?\s*secret\s+("(?:[^"\\]|\\.)*")` + reAllowedSecretArguments + `\s*-?` + regexp.QuoteMeta(right) + `$`)

	var browser *FileBrowser

	for _, expression := range templateExpressions(filter, content) {
		if existing[expression] {
			continue
		}

		if browser == nil {
			browser = NewFileBrowser(m.secretRoots(paths))
		}

		if match := reSecret.FindStringSubmatch(expression); match != nil {
			if path, err := strconv.Unquote(match[1]); err == nil && filepath.IsAbs(path) && browser.Allowed(path) {
				continue
			}
		}

		errs = append(errs, fmt.Sprintf("the template expression '%s' can't be added from the administration area: only secrets from the directories the file picker can browse can be added, other expressions have to be added to the file on the server", expression))
	}

	return errs, nil
}

// secretRoots returns the directories new secret expressions can read from, which are the directories the file picker
// can browse.
func (m *ConfigurationManager) secretRoots(paths []string) []string {
	if len(m.fileRoots) != 0 {
		return m.fileRoots
	}

	roots := make([]string, 0, len(paths))

	for _, path := range paths {
		roots = append(roots, filepath.Dir(path))
	}

	return roots
}

// fileRootsError returns an error if the configuration changes the directories the file picker can browse.
func (m *ConfigurationManager) fileRootsError(roots []string) string {
	if slices.Equal(roots, m.fileRoots) {
		return ""
	}

	return "administration: file_roots: option can't be changed from the administration area, it has to be changed in the file on the server"
}

// sensitiveValues returns the values the template expressions which read files or environment variables evaluate to,
// and the secrets given to the configuration with environment variables, so they can be removed from validation errors.
func (m *ConfigurationManager) sensitiveValues(contents ...[]byte) (values []string) {
	seen := map[string]bool{}

	add := func(value string) {
		value = strings.TrimSpace(value)

		candidates := []string{value}

		for _, line := range strings.Split(value, "\n") {
			candidates = append(candidates, strings.Trim(strings.TrimSpace(line), `'"`))
		}

		for _, candidate := range candidates {
			if len(candidate) >= redactedMinLength && !seen[candidate] {
				seen[candidate] = true
				values = append(values, candidate)
			}
		}
	}

	if filter := m.templateFilter(); filter != nil {
		for _, content := range contents {
			for _, expression := range templateExpressions(filter, content) {
				if !reSensitiveFunction.MatchString(expression) {
					continue
				}

				if out, err := filter.Filter([]byte(expression)); err == nil {
					add(string(out))
				}
			}
		}
	}

	for _, env := range os.Environ() {
		key, value, ok := strings.Cut(env, "=")
		if !ok || !strings.HasPrefix(key, configuration.DefaultEnvPrefix) {
			continue
		}

		switch name := strings.TrimSuffix(key, "_FILE"); {
		case name != key:
			if info, err := os.Stat(value); err == nil && info.Mode().IsRegular() && info.Size() <= redactedMaxFileSize {
				if data, err := os.ReadFile(value); err == nil {
					add(string(data))
				}
			}
		case slices.ContainsFunc(secretEnvSuffixes, func(suffix string) bool { return strings.HasSuffix(key, suffix) }):
			add(value)
		}
	}

	// Longer values first so a value which contains a shorter one is replaced whole.
	sort.SliceStable(values, func(i, j int) bool { return len(values[i]) > len(values[j]) })

	return values
}

// redact replaces the sensitive values in a message. Values which the message only contains the start of, as some errors
// shorten long values, are replaced up to the end of the quoted or space separated word they're in.
func redact(message string, values []string) string {
	for _, value := range values {
		message = strings.ReplaceAll(message, value, redacted)

		if quoted := strconv.Quote(value); len(quoted) > len(value)+2 {
			message = strings.ReplaceAll(message, quoted[1:len(quoted)-1], redacted)
		}

		if len(value) < redactedPrefixLength {
			continue
		}

		prefix := value[:redactedPrefixLength]

		for {
			start := strings.Index(message, prefix)
			if start == -1 {
				break
			}

			end := start + len(prefix)

			for end < len(message) && !strings.ContainsRune("`'\" \n", rune(message[end])) {
				end++
			}

			message = message[:start] + redacted + message[end:]
		}
	}

	return message
}
