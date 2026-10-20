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
)

const (
	testExpressionJWTSecret = `{{ secret "SECRETS/jwt_secret.txt" | mindent 0 "|" | msquote }}`
	testValueJWTSecret      = "a_very_important_secret_for_jwt_tokens_123456"
)

func testReplaceInFile(t *testing.T, manager *ConfigurationManager, path, old, replacement string) []byte {
	t.Helper()

	content, err := manager.Read(path)
	require.NoError(t, err)
	require.Contains(t, string(content), old)

	return []byte(strings.Replace(string(content), old, replacement, 1))
}

func testSecretsDir(path string) string {
	return filepath.Join(filepath.Dir(path), "secrets")
}

func TestConfigurationPolicyNewExpressions(t *testing.T) {
	testCases := []struct {
		name       string
		expression func(t *testing.T, path string) string
		reason     string
	}{
		{
			"ShouldAllowSecretInFileRoots",
			func(t *testing.T, path string) string {
				file := filepath.Join(testSecretsDir(path), "new_secret.txt")
				require.NoError(t, os.WriteFile(file, []byte("another_secret_value_for_tests_123456"), 0600))

				return `{{ secret "` + file + `" | mindent 0 "|" | msquote }}`
			},
			"",
		},
		{
			"ShouldConfirmSecretOutsideFileRoots",
			func(t *testing.T, path string) string {
				file := filepath.Join(t.TempDir(), "outside.txt")
				require.NoError(t, os.WriteFile(file, []byte("outside_secret_value_for_tests_123456"), 0600))

				return `{{ secret "` + file + `" | mindent 0 "|" | msquote }}`
			},
			"outside the directories the file picker can browse",
		},
		{
			"ShouldConfirmSecretThroughLinkOutOfFileRoots",
			func(t *testing.T, path string) string {
				outside := t.TempDir()
				require.NoError(t, os.WriteFile(filepath.Join(outside, "outside.txt"), []byte("outside_secret_value_for_tests_123456"), 0600))
				require.NoError(t, os.Symlink(outside, filepath.Join(testSecretsDir(path), "link")))

				return `{{ secret "` + filepath.Join(testSecretsDir(path), "link", "outside.txt") + `" }}`
			},
			"outside the directories the file picker can browse",
		},
		{
			"ShouldConfirmRelativeSecret",
			func(t *testing.T, path string) string {
				return `{{ secret "secrets/jwt_secret.txt" }}`
			},
			"reads the secret file 'secrets/jwt_secret.txt'",
		},
		{
			"ShouldConfirmUnusedEnvironmentVariable",
			func(t *testing.T, path string) string {
				return `'{{ env "TEST_ADMIN_UNUSED_SECRET" }}'`
			},
			"uses the environment variable 'TEST_ADMIN_UNUSED_SECRET'",
		},
		{
			"ShouldConfirmFileContent",
			func(t *testing.T, path string) string {
				return `{{ fileContent "/nonexistent/file" | msquote }}`
			},
			`adds the template expression '{{ fileContent "/nonexistent/file" | msquote }}'`,
		},
		{
			"ShouldConfirmSecretWithOtherFunctions",
			func(t *testing.T, path string) string {
				return `{{ secret "` + filepath.Join(testSecretsDir(path), "jwt_secret.txt") + `" | b64enc }}`
			},
			"adds the template expression",
		},
		{
			"ShouldConfirmMultilineExpression",
			func(t *testing.T, path string) string {
				return "{{ env\n  \"HOME\" }}"
			},
			"uses the environment variable 'HOME'",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			manager, path := newTemplatedTestManager(t)

			// The value isn't readable before the change is confirmed.
			t.Setenv("TEST_ADMIN_UNUSED_SECRET", "an_unused_environment_secret_123456")

			original, err := manager.Read(path)
			require.NoError(t, err)

			expression := tc.expression(t, path)
			content := testReplaceInFile(t, manager, path, `{{ secret "`+testSecretsDir(path)+`/storage_encryption_key.txt" | mindent 0 "|" | msquote }}`, expression)

			result, err := manager.Validate(path, content)
			require.NoError(t, err)

			// The expressions which need a confirmation aren't evaluated, so they can't fail or show their value.
			assert.True(t, result.Valid, "errors: %v", result.Errors)

			if tc.reason == "" {
				assert.Empty(t, result.Confirmations)
			} else {
				require.Len(t, result.Confirmations, 1)
				assert.Contains(t, result.Confirmations[0], tc.reason)
			}

			saved, pending, err := manager.Save(path, content, "john")
			require.NoError(t, err)
			assert.True(t, saved.Valid)

			written, err := manager.Read(path)
			require.NoError(t, err)

			if tc.reason == "" {
				assert.Nil(t, pending)
				assert.Contains(t, string(written), expression)

				return
			}

			require.NotNil(t, pending)
			assert.Equal(t, string(original), string(written), "the file is only written once the change is confirmed")
			assert.Equal(t, string(content), pending.Content)
			assert.Equal(t, "john", pending.Username)
			assert.Equal(t, PendingStatusPending, pending.Status)
		})
	}
}

func TestConfigurationPolicyEnvironmentVariablesInUse(t *testing.T) {
	testCases := []struct {
		name, expression string
	}{
		{"ShouldAllowSpaced", `{{ env "TEST_ADMIN_DOMAIN" }}`},
		{"ShouldAllowCompact", `{{env "TEST_ADMIN_DOMAIN"}}`},
		{"ShouldAllowTrimmed", `{{- env "TEST_ADMIN_DOMAIN" -}}`},
	}

	for _, tc := range testCases {
		expression := tc.expression

		t.Run(tc.name, func(t *testing.T) {
			manager, path := newTemplatedTestManager(t)

			content := testReplaceInFile(t, manager, path, "name: 'authelia_session'", "name: '"+expression+"'")

			result, err := manager.Validate(path, content)
			require.NoError(t, err)

			assert.True(t, result.Valid, "errors: %v", result.Errors)
			assert.Empty(t, result.Confirmations)
		})
	}
}

func TestConfigurationPolicyExistingExpressions(t *testing.T) {
	manager, path := newTemplatedTestManager(t)

	// An expression the configuration already has can be used elsewhere.
	expression := strings.ReplaceAll(testExpressionJWTSecret, "SECRETS", testSecretsDir(path))
	content := testReplaceInFile(t, manager, path, `{{ secret "`+testSecretsDir(path)+`/storage_encryption_key.txt" | mindent 0 "|" | msquote }}`, expression)

	result, err := manager.Validate(path, content)
	require.NoError(t, err)
	assert.True(t, result.Valid, "errors: %v", result.Errors)
}

func TestConfigurationPolicyFileRoots(t *testing.T) {
	testCases := []struct {
		name    string
		running func(dir string) []string
		section func(dir string) string
		confirm bool
	}{
		{"ShouldAllowUnchanged", func(string) []string { return nil }, func(string) string { return "" }, false},
		{"ShouldAllowSameRoots", func(dir string) []string { return []string{dir} }, func(dir string) string { return "administration:\n  file_roots:\n    - '" + dir + "'\n" }, false},
		{"ShouldConfirmAddedRoots", func(string) []string { return nil }, func(string) string { return "administration:\n  file_roots:\n    - '/'\n" }, true},
		{"ShouldConfirmRemovedRoots", func(dir string) []string { return []string{dir} }, func(string) string { return "" }, true},
		{"ShouldConfirmChangedRoots", func(dir string) []string { return []string{dir} }, func(string) string { return "administration:\n  file_roots:\n    - '/'\n" }, true},
		{"ShouldConfirmRootsFromAnAlias", func(string) []string { return nil }, func(string) string {
			return "x-roots: &roots\n  file_roots:\n    - '/'\nadministration: *roots\n"
		}, true},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			manager, path := newTemplatedTestManager(t)
			dir := filepath.Dir(path)

			manager.WithFileRoots(tc.running(dir))

			content, err := manager.Read(path)
			require.NoError(t, err)

			content = append(content, []byte(tc.section(dir))...)

			result, err := manager.Validate(path, content)
			require.NoError(t, err)

			if tc.confirm {
				require.Len(t, result.Confirmations, 1)
				assert.Contains(t, result.Confirmations[0], "administration.file_roots")
			} else {
				assert.Empty(t, result.Confirmations)
			}
		})
	}
}

func TestConfigurationValidationRedactsSecrets(t *testing.T) {
	manager, path := newTemplatedTestManager(t)

	expression := strings.ReplaceAll(testExpressionJWTSecret, "SECRETS", testSecretsDir(path))

	content, err := manager.Read(path)
	require.NoError(t, err)

	content = append(content, []byte("theme: "+expression+"\n")...)

	t.Setenv("AUTHELIA_TEST_ADMIN_SECRET", "an_environment_secret_value_123456")

	result, err := manager.Validate(path, content)
	require.NoError(t, err)
	require.False(t, result.Valid)

	messages := strings.Join(append(result.Errors, result.Warnings...), "\n")

	assert.Contains(t, messages, "theme")
	assert.Contains(t, messages, redacted)
	assert.NotContains(t, messages, testValueJWTSecret)
	assert.NotContains(t, messages, testValueJWTSecret[:redactedPrefixLength])
}

func TestConfigurationSectionsKeepSecretExpressions(t *testing.T) {
	manager, path := newTemplatedTestManager(t)

	session, err := manager.Section(path, "session")
	require.NoError(t, err)

	values := session.(map[string]any)
	values["name"] = "janus_session"

	content, err := manager.WithSections(path, map[string]any{"session": values})
	require.NoError(t, err)

	result, _, err := manager.Save(path, content, "john")
	require.NoError(t, err)
	require.True(t, result.Valid, "errors: %v", result.Errors)

	written, err := manager.Read(path)
	require.NoError(t, err)

	assert.Contains(t, string(written), "janus_session")
	assert.Contains(t, string(written), `{{ secret "`+testSecretsDir(path)+`/session_secret.txt"`)

	for _, value := range []string{testValueJWTSecret, "a_very_important_secret_for_sessions_123456", "a_very_important_secret_for_storage_123456"} {
		assert.NotContains(t, string(written), value)
		assert.NotContains(t, string(content), value)
	}
}

func TestRedact(t *testing.T) {
	values := []string{"a_very_important_secret_for_jwt_tokens_123456", "line one\nline two"}

	testCases := []struct {
		name, message, expected string
	}{
		{"ShouldRedactWholeValue", "option 'x' is 'a_very_important_secret_for_jwt_tokens_123456'", "option 'x' is '<redacted>'"},
		{"ShouldRedactShortenedValue", "cannot unmarshal !!str `a_very_important_s...` into int", "cannot unmarshal !!str `<redacted>` into int"},
		{"ShouldRedactQuotedValue", `option is "line one\nline two"`, `option is "<redacted>"`},
		{"ShouldKeepOtherText", "option 'x' is invalid", "option 'x' is invalid"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.expected, redact(tc.message, values))
		})
	}
}

func TestEnvironmentVariables(t *testing.T) {
	manager, _ := newTemplatedTestManager(t)

	t.Setenv("TEST_ADMIN_APP_URL", "https://app.example.com")
	t.Setenv("AUTHELIA_TEST_ADMIN_SECRET", "hidden")
	t.Setenv("GOOGLE_TEST_ADMIN_ID", "shown")
	t.Setenv("LC_TEST_ADMIN", "hidden")
	t.Setenv("FORCE_COLOR", "1")

	variables, err := manager.EnvironmentVariables()
	require.NoError(t, err)

	byName := map[string]EnvironmentVariable{}

	for _, variable := range variables {
		byName[variable.Name] = variable
	}

	assert.Equal(t, EnvironmentVariable{Name: "TEST_ADMIN_APP_URL", Set: true}, byName["TEST_ADMIN_APP_URL"])
	assert.Equal(t, EnvironmentVariable{Name: "TEST_ADMIN_DOMAIN", Used: true, Set: true}, byName["TEST_ADMIN_DOMAIN"])
	assert.Contains(t, byName, "GOOGLE_TEST_ADMIN_ID")

	for _, name := range []string{"PATH", "HOME", "AUTHELIA_TEST_ADMIN_SECRET", "LC_TEST_ADMIN", "FORCE_COLOR"} {
		assert.NotContains(t, byName, name)
	}
}

func TestEnvironmentVariablesUsedButNotSet(t *testing.T) {
	manager, path := newTemplatedTestManager(t)

	content := testReplaceInFile(t, manager, path, "name: 'authelia_session'", `name: '{{ env "TEST_ADMIN_NOT_SET" }}'`)
	require.NoError(t, os.WriteFile(path, content, 0600))

	variables, err := manager.EnvironmentVariables()
	require.NoError(t, err)

	assert.Contains(t, variables, EnvironmentVariable{Name: "TEST_ADMIN_NOT_SET", Used: true})
}
