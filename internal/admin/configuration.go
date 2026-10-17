// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package admin

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"go.yaml.in/yaml/v4"

	"github.com/authelia/authelia/v4/internal/configuration"
	"github.com/authelia/authelia/v4/internal/configuration/schema"
	"github.com/authelia/authelia/v4/internal/configuration/validator"
)

const (
	extYML  = ".yml"
	extYAML = ".yaml"
)

var (
	// ErrConfigurationFileUnknown is returned when a path isn't one of the loaded configuration files.
	ErrConfigurationFileUnknown = errors.New("the path is not a loaded configuration file")

	// ErrConfigurationSectionInvalid is returned when a section name is not a known top level configuration key.
	ErrConfigurationSectionInvalid = errors.New("the section is not a known configuration section")
)

// ConfigurationFile describes a configuration file which was loaded at startup.
type ConfigurationFile struct {
	Path     string    `json:"path"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
	Writable bool      `json:"writable"`
}

// ConfigurationValidationResult is the result of validating a configuration.
type ConfigurationValidationResult struct {
	Valid    bool     `json:"valid"`
	Errors   []string `json:"errors"`
	Warnings []string `json:"warnings"`
}

// ConfigurationManager manages the configuration files which were loaded at startup.
type ConfigurationManager struct {
	paths   []string
	filters []configuration.BytesFilter
	trusted *x509.CertPool

	mutex sync.Mutex
}

// NewConfigurationManager creates a new ConfigurationManager.
func NewConfigurationManager(paths []string, filters []configuration.BytesFilter, trusted *x509.CertPool) *ConfigurationManager {
	return &ConfigurationManager{
		paths:   paths,
		filters: filters,
		trusted: trusted,
	}
}

// FilterNames returns the names of the filters applied to the configuration files.
func (m *ConfigurationManager) FilterNames() (names []string) {
	names = make([]string, len(m.filters))

	for i, filter := range m.filters {
		names[i] = filter.Name()
	}

	return names
}

// Files returns the list of configuration files, expanding directories in the same order the configuration loader uses.
func (m *ConfigurationManager) Files() (files []ConfigurationFile, err error) {
	var paths []string

	if paths, err = m.expand(); err != nil {
		return nil, err
	}

	files = make([]ConfigurationFile, 0, len(paths))

	for _, path := range paths {
		var info os.FileInfo

		if info, err = os.Stat(path); err != nil {
			return nil, err
		}

		files = append(files, ConfigurationFile{
			Path:     path,
			Size:     info.Size(),
			Modified: info.ModTime().UTC(),
			Writable: isWritable(path),
		})
	}

	return files, nil
}

// Read returns the raw content of a configuration file.
func (m *ConfigurationManager) Read(path string) (content []byte, err error) {
	if path, err = m.resolve(path); err != nil {
		return nil, err
	}

	return os.ReadFile(path)
}

// Validate validates the full configuration as if the file at path had the given content.
func (m *ConfigurationManager) Validate(path string, content []byte) (result *ConfigurationValidationResult, err error) {
	if path, err = m.resolve(path); err != nil {
		return nil, err
	}

	return m.validate(path, content)
}

// Save validates the content and if it's valid replaces the file at path.
func (m *ConfigurationManager) Save(path string, content []byte) (result *ConfigurationValidationResult, err error) {
	if path, err = m.resolve(path); err != nil {
		return nil, err
	}

	m.mutex.Lock()

	defer m.mutex.Unlock()

	if result, err = m.validate(path, content); err != nil || !result.Valid {
		return result, err
	}

	if err = writeFileAtomic(path, content); err != nil {
		return nil, fmt.Errorf("error writing the configuration file: %w", err)
	}

	return result, nil
}

// Section returns the value of a top level key of the configuration file at path. It returns nil if it's not set.
func (m *ConfigurationManager) Section(path, section string) (value any, err error) {
	if !isSection(section) {
		return nil, ErrConfigurationSectionInvalid
	}

	var (
		content []byte
		doc     *yaml.Node
	)

	if content, err = m.Read(path); err != nil {
		return nil, err
	}

	t := m.templates(content)

	if doc, err = parseDocument(t.protect(content)); err != nil {
		return nil, err
	}

	node := mappingValue(doc.Content[0], section)
	if node == nil {
		return nil, nil
	}

	if err = node.Decode(&value); err != nil {
		return nil, fmt.Errorf("error decoding the '%s' section: %w", section, err)
	}

	return t.restoreValue(normalize(value)), nil
}

// WithSections returns the content of the configuration file at path with the given top level keys replaced by their
// values. Only the text of the replaced keys changes, so comments, blank lines and the formatting of the rest of the file
// are retained. A nil value removes the key.
func (m *ConfigurationManager) WithSections(path string, values map[string]any) (content []byte, err error) {
	for section := range values {
		if !isSection(section) {
			return nil, fmt.Errorf("%w: %s", ErrConfigurationSectionInvalid, section)
		}
	}

	var doc *yaml.Node

	if content, err = m.Read(path); err != nil {
		return nil, err
	}

	t := m.templates(content)
	protected := t.protect(content)

	if doc, err = parseDocument(protected); err != nil {
		return nil, err
	}

	lines := strings.Split(string(protected), "\n")
	regions := sectionRegions(doc.Content[0], lines)

	type replacement struct {
		start, end int
		text       []string
	}

	var (
		replacements []replacement
		appended     []string
	)

	for _, section := range slices.Sorted(maps.Keys(values)) {
		var text []string

		if values[section] != nil {
			if text, err = encodeSection(section, t.protectValue(values[section]), mappingValue(doc.Content[0], section), t); err != nil {
				return nil, err
			}
		}

		if region, ok := regions[section]; ok {
			replacements = append(replacements, replacement{start: region[0], end: region[1], text: text})
		} else if text != nil {
			appended = append(appended, text...)
		}
	}

	// Apply the replacements from the bottom of the file to the top so the line numbers stay valid.
	slices.SortFunc(replacements, func(a, b replacement) int { return b.start - a.start })

	for _, r := range replacements {
		lines = slices.Concat(lines[:r.start], r.text, lines[r.end:])
	}

	if len(appended) != 0 {
		for len(lines) != 0 && strings.TrimSpace(lines[len(lines)-1]) == "" {
			lines = lines[:len(lines)-1]
		}

		lines = slices.Concat(lines, []string{""}, appended, []string{""})
	}

	return []byte(t.restore(strings.Join(lines, "\n"))), nil
}

// SectionsText returns the YAML text of the given top level keys of the configuration file at path exactly as written in
// the file, in the order they appear in the file.
func (m *ConfigurationManager) SectionsText(path string, keys []string) (text string, err error) {
	var (
		content []byte
		regions []sectionRegion
	)

	if content, err = m.Read(path); err != nil {
		return "", err
	}

	if regions, err = m.sectionRegionsOf(content, keys); err != nil {
		return "", err
	}

	lines := strings.Split(string(content), "\n")
	parts := make([]string, 0, len(regions))

	for _, region := range regions {
		parts = append(parts, strings.Join(lines[region.start:region.end], "\n"))
	}

	if len(parts) == 0 {
		return "", nil
	}

	return strings.Join(parts, "\n\n") + "\n", nil
}

// WithSectionsText returns the content of the configuration file at path with the text of the given top level keys
// replaced by text. The text may only contain the given keys; it's inserted where the first of the keys was written, or
// appended when none of them existed.
func (m *ConfigurationManager) WithSectionsText(path string, keys []string, text string) (content []byte, err error) {
	var regions []sectionRegion

	if content, err = m.Read(path); err != nil {
		return nil, err
	}

	if regions, err = m.sectionRegionsOf(content, keys); err != nil {
		return nil, err
	}

	t := m.templates(content)

	var doc *yaml.Node

	if doc, err = parseDocument(t.protect([]byte(text))); err != nil {
		return nil, err
	}

	for i := 0; i+1 < len(doc.Content[0].Content); i += 2 {
		if key := doc.Content[0].Content[i].Value; !slices.Contains(keys, key) {
			return nil, fmt.Errorf("the key '%s' doesn't belong to this section, edit it in its own section", key)
		}
	}

	lines := strings.Split(string(content), "\n")
	inserted := strings.Split(strings.TrimRight(text, "\n"), "\n")

	if strings.TrimSpace(text) == "" {
		inserted = nil
	}

	if len(regions) == 0 {
		if inserted == nil {
			return content, nil
		}

		for len(lines) != 0 && strings.TrimSpace(lines[len(lines)-1]) == "" {
			lines = lines[:len(lines)-1]
		}

		return []byte(strings.Join(slices.Concat(lines, []string{""}, inserted, []string{""}), "\n")), nil
	}

	at := regions[0].start

	for i := len(regions) - 1; i >= 0; i-- {
		end := regions[i].end

		// Also remove the blank lines which separated the removed region from the next key.
		if i != 0 {
			for end < len(lines) && strings.TrimSpace(lines[end]) == "" {
				end++
			}
		}

		lines = slices.Concat(lines[:regions[i].start], lines[end:])
	}

	return []byte(strings.Join(slices.Concat(lines[:at], inserted, lines[at:]), "\n")), nil
}

type sectionRegion struct {
	key        string
	start, end int
}

func (m *ConfigurationManager) sectionRegionsOf(content []byte, keys []string) (regions []sectionRegion, err error) {
	for _, key := range keys {
		if !isSection(key) {
			return nil, fmt.Errorf("%w: %s", ErrConfigurationSectionInvalid, key)
		}
	}

	var doc *yaml.Node

	protected := m.templates(content).protect(content)

	if doc, err = parseDocument(protected); err != nil {
		return nil, err
	}

	for key, region := range sectionRegions(doc.Content[0], strings.Split(string(protected), "\n")) {
		if slices.Contains(keys, key) {
			regions = append(regions, sectionRegion{key: key, start: region[0], end: region[1]})
		}
	}

	slices.SortFunc(regions, func(a, b sectionRegion) int { return a.start - b.start })

	return regions, nil
}

// templates returns the template expression handler for a configuration file.
func (m *ConfigurationManager) templates(content []byte) *templates {
	return newTemplates(slices.Contains(m.FilterNames(), filterTemplate), content)
}

// sectionRegions returns the zero based [start, end) line ranges of each top level key of the root mapping. A range
// starts at the key and ends before the trailing blank lines and the comments which precede the next key.
func sectionRegions(root *yaml.Node, lines []string) (regions map[string][2]int) {
	regions = map[string][2]int{}

	keys := make([]*yaml.Node, 0, len(root.Content)/2)

	for i := 0; i+1 < len(root.Content); i += 2 {
		keys = append(keys, root.Content[i])
	}

	for i, key := range keys {
		start := key.Line - 1
		end := len(lines)

		if i+1 < len(keys) {
			end = keys[i+1].Line - 1
		}

		for end > start+1 {
			trimmed := strings.TrimSpace(lines[end-1])

			if trimmed != "" && !strings.HasPrefix(trimmed, "#") && trimmed != "---" && trimmed != "..." {
				break
			}

			end--
		}

		regions[key.Value] = [2]int{start, end}
	}

	return regions
}

func encodeSection(section string, value any, original *yaml.Node, t *templates) (lines []string, err error) {
	node := &yaml.Node{}

	if err = node.Encode(map[string]any{section: value}); err != nil {
		return nil, fmt.Errorf("error encoding the '%s' section: %w", section, err)
	}

	if len(node.Content) == 2 {
		orderLike(node.Content[1], original)
	}

	t.style(node)

	buf := &bytes.Buffer{}

	encoder := yaml.NewEncoder(buf)
	encoder.SetIndent(2)

	if err = encoder.Encode(node); err != nil {
		return nil, fmt.Errorf("error encoding the '%s' section: %w", section, err)
	}

	if err = encoder.Close(); err != nil {
		return nil, err
	}

	return strings.Split(strings.TrimRight(buf.String(), "\n"), "\n"), nil
}

func (m *ConfigurationManager) expand() (paths []string, err error) {
	for _, path := range m.paths {
		var info os.FileInfo

		if info, err = os.Stat(path); err != nil {
			return nil, err
		}

		if !info.IsDir() {
			paths = append(paths, path)

			continue
		}

		var entries []os.DirEntry

		if entries, err = os.ReadDir(path); err != nil {
			return nil, err
		}

		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}

			switch filepath.Ext(entry.Name()) {
			case extYML, extYAML:
				paths = append(paths, filepath.Join(path, entry.Name()))
			}
		}
	}

	return paths, nil
}

func (m *ConfigurationManager) resolve(path string) (resolved string, err error) {
	var paths []string

	if paths, err = m.expand(); err != nil {
		return "", err
	}

	if path == "" && len(paths) == 1 {
		return paths[0], nil
	}

	if slices.Contains(paths, path) {
		return path, nil
	}

	return "", ErrConfigurationFileUnknown
}

func (m *ConfigurationManager) validate(path string, content []byte) (result *ConfigurationValidationResult, err error) {
	result = &ConfigurationValidationResult{Errors: []string{}, Warnings: []string{}}

	var doc *yaml.Node

	if doc, err = parseDocument(content); err != nil && len(m.filters) == 0 {
		result.Errors = append(result.Errors, err.Error())

		return result, nil
	} else if err == nil && doc.Content[0].Kind != yaml.MappingNode {
		result.Errors = append(result.Errors, "the configuration file must contain a YAML mapping")

		return result, nil
	}

	var dir string

	if dir, err = os.MkdirTemp("", "authelia-admin-config-"); err != nil {
		return nil, err
	}

	defer os.RemoveAll(dir)

	var paths []string

	if paths, err = m.expand(); err != nil {
		return nil, err
	}

	files := make([]string, len(paths))

	for i, p := range paths {
		if p != path {
			files[i] = p

			continue
		}

		files[i] = filepath.Join(dir, fmt.Sprintf("%03d%s", i, filepath.Ext(p)))

		if err = os.WriteFile(files[i], content, 0600); err != nil {
			return nil, err
		}
	}

	val := schema.NewStructValidator()
	config := &schema.Configuration{}

	sources := configuration.NewDefaultSourcesWithDefaults(files, m.filters, configuration.DefaultEnvPrefix, configuration.DefaultEnvDelimiter, []configuration.Source{configuration.NewDefaultsSource()})

	var (
		definitions *schema.Definitions
		keys        []string
	)

	if definitions, err = configuration.LoadDefinitions(val, sources...); err != nil {
		result.Errors = append(result.Errors, err.Error())

		return result, nil
	}

	if keys, err = configuration.LoadAdvanced(val, "", config, definitions, sources...); err != nil {
		result.Errors = append(result.Errors, err.Error())

		return result, nil
	}

	validator.ValidateKeys(keys, configuration.GetMultiKeyMappedDeprecationKeys(), configuration.DefaultEnvPrefix, val)

	tc := &tls.Config{
		RootCAs:    m.trusted,
		MinVersion: tls.VersionTLS12,
		MaxVersion: tls.VersionTLS13,
	}

	validator.ValidateConfiguration(config, val, validator.WithTLSConfig(tc))

	for _, e := range val.Errors() {
		result.Errors = append(result.Errors, strings.ReplaceAll(e.Error(), dir+string(filepath.Separator), ""))
	}

	for _, w := range val.Warnings() {
		result.Warnings = append(result.Warnings, w.Error())
	}

	result.Valid = len(result.Errors) == 0

	return result, nil
}

func writeFileAtomic(path string, content []byte) (err error) {
	var info os.FileInfo

	if info, err = os.Stat(path); err != nil {
		return err
	}

	var f *os.File

	if f, err = os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".tmp-*"); err != nil {
		// The directory may not be writable (i.e. a bind mounted file), fallback to writing the file in place.
		return os.WriteFile(path, content, info.Mode().Perm())
	}

	name := f.Name()

	defer os.Remove(name)

	if _, err = f.Write(content); err != nil {
		_ = f.Close()

		return err
	}

	if err = f.Chmod(info.Mode().Perm()); err != nil {
		_ = f.Close()

		return err
	}

	if err = f.Close(); err != nil {
		return err
	}

	if err = os.Rename(name, path); err != nil {
		// Renaming over a bind mounted file fails, fallback to writing the file in place.
		return os.WriteFile(path, content, info.Mode().Perm())
	}

	return nil
}

func isWritable(path string) bool {
	f, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err != nil {
		return false
	}

	_ = f.Close()

	return true
}

func isSection(section string) bool {
	for _, key := range schema.Keys {
		if key == section || strings.HasPrefix(key, section+".") {
			return true
		}
	}

	return false
}

func parseDocument(content []byte) (doc *yaml.Node, err error) {
	doc = &yaml.Node{}

	if err = yaml.Unmarshal(content, doc); err != nil {
		return nil, fmt.Errorf("error parsing the YAML: %w", err)
	}

	if doc.Kind == 0 || len(doc.Content) == 0 {
		doc = &yaml.Node{Kind: yaml.DocumentNode, Content: []*yaml.Node{{Kind: yaml.MappingNode, Tag: "!!map"}}}
	}

	if doc.Content[0].Kind != yaml.MappingNode {
		return doc, fmt.Errorf("the configuration file must contain a YAML mapping")
	}

	return doc, nil
}

func mappingValue(node *yaml.Node, key string) *yaml.Node {
	for i := 0; i+1 < len(node.Content); i += 2 {
		if node.Content[i].Value == key {
			return node.Content[i+1]
		}
	}

	return nil
}

func removeMappingKey(node *yaml.Node, key string) {
	for i := 0; i+1 < len(node.Content); i += 2 {
		if node.Content[i].Value == key {
			node.Content = append(node.Content[:i], node.Content[i+2:]...)

			return
		}
	}
}

// orderLike orders the keys of the mappings in node like the keys of the matching mappings in original, so the keys
// which already existed keep their position and new keys are added after them.
func orderLike(node, original *yaml.Node) {
	if node == nil || original == nil || node.Kind != original.Kind {
		return
	}

	switch node.Kind {
	case yaml.MappingNode:
		position := make(map[string]int, len(original.Content)/2)
		values := make(map[string]*yaml.Node, len(original.Content)/2)

		for i := 0; i+1 < len(original.Content); i += 2 {
			position[original.Content[i].Value] = i / 2
			values[original.Content[i].Value] = original.Content[i+1]
		}

		type pair struct {
			key, value *yaml.Node
			index      int
		}

		pairs := make([]pair, 0, len(node.Content)/2)

		for i := 0; i+1 < len(node.Content); i += 2 {
			index, ok := position[node.Content[i].Value]
			if !ok {
				index = len(position) + i/2
			}

			pairs = append(pairs, pair{key: node.Content[i], value: node.Content[i+1], index: index})
		}

		slices.SortStableFunc(pairs, func(a, b pair) int { return a.index - b.index })

		node.Content = node.Content[:0]

		for _, p := range pairs {
			orderLike(p.value, values[p.key.Value])

			node.Content = append(node.Content, p.key, p.value)
		}
	case yaml.SequenceNode:
		for i := 0; i < len(node.Content) && i < len(original.Content); i++ {
			orderLike(node.Content[i], original.Content[i])
		}
	}
}

// normalize converts map[any]any values into map[string]any so they can be encoded as JSON.
func normalize(value any) any {
	switch v := value.(type) {
	case map[string]any:
		for k, item := range v {
			v[k] = normalize(item)
		}

		return v
	case map[any]any:
		m := make(map[string]any, len(v))

		for k, item := range v {
			m[fmt.Sprint(k)] = normalize(item)
		}

		return m
	case []any:
		for i, item := range v {
			v[i] = normalize(item)
		}

		return v
	default:
		return v
	}
}
