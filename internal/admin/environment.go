// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package admin

import (
	"os"
	"regexp"
	"slices"
	"sort"
	"strings"
)

// EnvironmentVariable is an environment variable the configuration can reference. Its value is never exposed.
type EnvironmentVariable struct {
	Name string `json:"name"`

	// Used is true when the configuration already references it, so it can be added without a confirmation.
	Used bool `json:"used"`

	// Set is true when the process has it, a referenced variable which isn't set evaluates to an empty value.
	Set bool `json:"set"`
}

var (
	reEnvironmentName = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

	// environmentNoise are the variables of the operating system, shells and tools which aren't useful in the
	// configuration, and the ones Janus reads itself.
	environmentNoise = []string{
		"_", "COLORTERM", "COMMAND_MODE", "DISPLAY", "EDITOR", "HOME", "HOSTNAME", "HOSTTYPE", "LANG", "LANGUAGE",
		"LOGNAME", "LS_COLORS", "MACHTYPE", "MAIL", "MANPATH", "OLDPWD", "OSTYPE", "PAGER", "PATH", "PGID", "PUID", "PWD",
		"SHELL", "SHLVL", "TERM", "TMPDIR", "TZ", "UMASK", "USER", "VISUAL", "LESS", "LESSOPEN", "LESSCLOSE",
		"LAUNCHINSTANCEID", "WSLENV", "GOPATH", "GOROOT", "GOBIN", "GOCACHE", "GOMODCACHE", "GOENV", "GOFLAGS", "GOPROXY",
		"GOPRIVATE", "GOSUMDB", "GODEBUG", "GOTOOLCHAIN", "GOMAXPROCS", "GOOS", "GOARCH", "FPATH", "INFOPATH",
		"MALLOCNANOZONE", "FORCE_COLOR", "NO_COLOR", "CLICOLOR", "NODEFAULTCURRENTDIRECTORYINEXEPATH", "HISTFILE",
		"HISTSIZE", "PS1", "PROMPT_COMMAND",
	}

	environmentNoisePrefixes = []string{
		"AUTHELIA_", "X_AUTHELIA_", "LC_", "XDG_", "SSH_", "TERM_", "ITERM", "VSCODE_", "GIT_", "CGO_", "NODE_", "NPM_",
		"PNPM_", "HOMEBREW_", "XPC_", "__CF", "SECURITYSESSIONID", "DBUS_", "VTE_", "WSL_", "KUBERNETES_", "CLAUDE",
		"ANTHROPIC_", "OTEL_", "MCP_", "ELECTRON_", "CHROME_", "APPLE_", "CONDA_", "VIRTUAL_ENV", "PYENV_", "NVM_",
	}
)

// EnvironmentVariables returns the environment variables the configuration can reference, without the noise of the
// operating system, shells and tools, and the ones the configuration references although they're not set.
func (m *ConfigurationManager) EnvironmentVariables() (variables []EnvironmentVariable, err error) {
	used := map[string]bool{}

	if filter := m.templateFilter(); filter != nil {
		var paths []string

		if paths, err = m.expand(); err != nil {
			return nil, err
		}

		for _, path := range paths {
			var content []byte

			if content, err = os.ReadFile(path); err != nil {
				return nil, err
			}

			for _, expression := range templateExpressions(filter, content) {
				for _, match := range reEnvName.FindAllStringSubmatch(expression, -1) {
					used[match[1]] = true
				}
			}
		}
	}

	found := map[string]*EnvironmentVariable{}

	for _, env := range os.Environ() {
		name, _, _ := strings.Cut(env, "=")

		if !reEnvironmentName.MatchString(name) || isEnvironmentNoise(name) {
			continue
		}

		found[name] = &EnvironmentVariable{Name: name, Set: true}
	}

	for name := range used {
		if variable, ok := found[name]; ok {
			variable.Used = true
		} else if reEnvironmentName.MatchString(name) {
			found[name] = &EnvironmentVariable{Name: name, Used: true}
		}
	}

	variables = make([]EnvironmentVariable, 0, len(found))

	for _, variable := range found {
		variables = append(variables, *variable)
	}

	sort.Slice(variables, func(i, j int) bool { return variables[i].Name < variables[j].Name })

	return variables, nil
}

func isEnvironmentNoise(name string) bool {
	upper := strings.ToUpper(name)

	return slices.Contains(environmentNoise, upper) ||
		slices.ContainsFunc(environmentNoisePrefixes, func(prefix string) bool { return strings.HasPrefix(upper, prefix) })
}
