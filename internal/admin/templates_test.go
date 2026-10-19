// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package admin

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/authelia/authelia/v4/internal/configuration"
)

const testTemplatedConfiguration = `server:
  address: 'tcp4://:9091'

identity_validation:
  reset_password:
    jwt_secret: {{ secret "SECRETS/jwt_secret.txt" | mindent 0 "|" | msquote }}

authentication_backend:
  file:
    path: 'USERS'

session:
  name: 'authelia_session'
  secret: {{ secret "SECRETS/session_secret.txt" | mindent 0 "|" | msquote }}
  cookies:
    - domain: '{{ env "TEST_ADMIN_DOMAIN" }}'
      authelia_url: 'https://idm.{{ env "TEST_ADMIN_DOMAIN" }}'

storage:
  encryption_key: {{ secret "SECRETS/storage_encryption_key.txt" | mindent 0 "|" | msquote }}
  local:
    path: 'DB'

notifier:
  filesystem:
    filename: 'NOTIFICATIONS'

access_control:
  default_policy: 'deny'
  rules:
    - domain: '{{ env "TEST_ADMIN_DOMAIN" }}'
      policy: 'two_factor'
`

func newTemplatedTestManager(t *testing.T) (manager *ConfigurationManager, path string) {
	t.Helper()

	dir := t.TempDir()
	secrets := filepath.Join(dir, "secrets")

	require.NoError(t, os.Mkdir(secrets, 0700))

	for name, value := range map[string]string{
		"jwt_secret.txt":             "a_very_important_secret_for_jwt_tokens_123456",
		"session_secret.txt":         "a_very_important_secret_for_sessions_123456",
		"storage_encryption_key.txt": "a_very_important_secret_for_storage_123456",
	} {
		require.NoError(t, os.WriteFile(filepath.Join(secrets, name), []byte(value), 0600))
	}

	users := filepath.Join(dir, "users.yml")
	require.NoError(t, os.WriteFile(users, []byte("users: {}\n"), 0600))

	content := strings.NewReplacer(
		"SECRETS", secrets,
		"USERS", users,
		"DB", filepath.Join(dir, "db.sqlite3"),
		"NOTIFICATIONS", filepath.Join(dir, "notification.txt"),
	).Replace(testTemplatedConfiguration)

	path = filepath.Join(dir, "configuration.yml")
	require.NoError(t, os.WriteFile(path, []byte(content), 0600))

	t.Setenv("TEST_ADMIN_DOMAIN", "example.com")

	filters, err := configuration.NewFileFilters(nil, "", "", "template")
	require.NoError(t, err)

	return NewConfigurationManager([]string{path}, filters, nil), path
}

func TestConfigurationManagerTemplatesSection(t *testing.T) {
	manager, path := newTemplatedTestManager(t)

	value, err := manager.Section(path, "session")
	require.NoError(t, err)

	session := value.(map[string]any)

	assert.Equal(t, "authelia_session", session["name"])
	assert.True(t, strings.HasPrefix(session["secret"].(string), `{{ secret "`), "got %v", session["secret"])

	cookie := session["cookies"].([]any)[0].(map[string]any)

	assert.Equal(t, `{{ env "TEST_ADMIN_DOMAIN" }}`, cookie["domain"])
	assert.Equal(t, `https://idm.{{ env "TEST_ADMIN_DOMAIN" }}`, cookie["authelia_url"])
}

func TestConfigurationManagerTemplatesRoundTrip(t *testing.T) {
	manager, path := newTemplatedTestManager(t)

	original, err := manager.Read(path)
	require.NoError(t, err)

	result, err := manager.Validate(path, original)
	require.NoError(t, err)
	require.True(t, result.Valid, "errors: %v", result.Errors)

	session, err := manager.Section(path, "session")
	require.NoError(t, err)

	storage, err := manager.Section(path, "storage")
	require.NoError(t, err)

	// Change a value next to the templates and add a new template expression.
	session.(map[string]any)["name"] = "renamed_session"
	cookie := session.(map[string]any)["cookies"].([]any)[0].(map[string]any)
	cookie["default_redirection_url"] = `https://home.{{ env "TEST_ADMIN_DOMAIN" }}`

	content, err := manager.WithSections(path, map[string]any{"session": session, "storage": storage})
	require.NoError(t, err)

	text := string(content)

	assert.Regexp(t, `\n  secret: \{\{ secret "[^"]+/session_secret.txt" \| mindent 0 "\|" \| msquote \}\}\n`, text, "unquoted expressions stay unquoted")
	assert.Regexp(t, `\n  encryption_key: \{\{ secret "[^"]+/storage_encryption_key.txt" \| mindent 0 "\|" \| msquote \}\}\n`, text)
	assert.Contains(t, text, `- domain: '{{ env "TEST_ADMIN_DOMAIN" }}'`, "quoted expressions stay quoted")
	assert.Contains(t, text, `authelia_url: 'https://idm.{{ env "TEST_ADMIN_DOMAIN" }}'`)
	assert.Contains(t, text, `default_redirection_url: 'https://home.{{ env "TEST_ADMIN_DOMAIN" }}'`)
	assert.Contains(t, text, "name: renamed_session")
	assert.Contains(t, text, `jwt_secret: {{ secret "`, "untouched sections are not modified")
	assert.NotContains(t, text, "authelia_admin_template_")
	assert.Regexp(t, `\nsession:\n  name: renamed_session\n  secret: `, text, "the original key order is kept")
	assert.Regexp(t, `- domain: '[^\n]+'\n      authelia_url: '[^\n]+'\n      default_redirection_url: `, text, "new keys are added after the existing ones")

	result, err = manager.Validate(path, content)
	require.NoError(t, err)
	assert.True(t, result.Valid, "errors: %v\n%s", result.Errors, text)
}

func TestConfigurationManagerTemplatesDisabled(t *testing.T) {
	manager, path := newTemplatedTestManager(t)

	manager.filters = nil

	_, err := manager.Section(path, "session")
	assert.Error(t, err, "without the template filter the expressions are YAML flow mappings")
}

func TestTemplatesManyExpressions(t *testing.T) {
	var b strings.Builder

	for i := range 12 {
		b.WriteString("key" + strings.Repeat("x", i) + `: {{ env "VAR_` + strings.Repeat("y", i) + `" }}` + "\n")
	}

	content := []byte(b.String())
	tpl := newTemplates(true, content)

	assert.Equal(t, string(content), tpl.restore(string(tpl.protect(content))), "placeholders must not be prefixes of each other")
}

func TestIsQuotedContext(t *testing.T) {
	testCases := []struct {
		prefix   string
		expected bool
	}{
		{"  secret: ", false},
		{"    - domain: '", true},
		{"      - 'https://", true},
		{`    sender: 'Authelia <noreply@`, true},
		{`  issuer: "`, true},
		{"  - ", false},
	}

	for _, tc := range testCases {
		assert.Equal(t, tc.expected, isQuotedContext(tc.prefix), tc.prefix)
	}
}

func TestConfigurationManagerTemplatesSectionsText(t *testing.T) {
	manager, path := newTemplatedTestManager(t)

	text, err := manager.SectionsText(path, []string{"session"})
	require.NoError(t, err)
	assert.Contains(t, text, `  secret: {{ secret "`)
	assert.Contains(t, text, `    - domain: '{{ env "TEST_ADMIN_DOMAIN" }}'`)

	content, err := manager.WithSectionsText(path, []string{"session"}, strings.Replace(text, "authelia_session", "renamed", 1))
	require.NoError(t, err)

	result, err := manager.Validate(path, content)
	require.NoError(t, err)
	assert.True(t, result.Valid, "errors: %v", result.Errors)
}

func TestTemplatesRestoreMindentAuto(t *testing.T) {
	tmpl := newTemplates(true, nil)

	secret := tmpl.add(`{{ secret "/secrets/a" | mindent auto "|" | msquote }}`, false)
	plain := tmpl.add(`{{ secret "/secrets/b" | mindent 0 "|" | msquote }}`, false)

	text := "jwks:\n      - key: " + secret + "\n  secret: " + secret + "\nother: " + plain + "\n"

	assert.Equal(t,
		"jwks:\n      - key: {{ secret \"/secrets/a\" | mindent 10 \"|\" | msquote }}\n"+
			"  secret: {{ secret \"/secrets/a\" | mindent 4 \"|\" | msquote }}\n"+
			"other: {{ secret \"/secrets/b\" | mindent 0 \"|\" | msquote }}\n",
		tmpl.restore(text))
}
