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
		valid      bool
	}{
		{
			"ShouldAllowSecretInFileRoots",
			func(t *testing.T, path string) string {
				file := filepath.Join(testSecretsDir(path), "new_secret.txt")
				require.NoError(t, os.WriteFile(file, []byte("another_secret_value_for_tests_123456"), 0600))

				return `{{ secret "` + file + `" | mindent 0 "|" | msquote }}`
			},
			true,
		},
		{
			"ShouldRejectSecretOutsideFileRoots",
			func(t *testing.T, path string) string {
				file := filepath.Join(t.TempDir(), "outside.txt")
				require.NoError(t, os.WriteFile(file, []byte("outside_secret_value_for_tests_123456"), 0600))

				return `{{ secret "` + file + `" | mindent 0 "|" | msquote }}`
			},
			false,
		},
		{
			"ShouldRejectSecretThroughLinkOutOfFileRoots",
			func(t *testing.T, path string) string {
				outside := t.TempDir()
				require.NoError(t, os.WriteFile(filepath.Join(outside, "outside.txt"), []byte("outside_secret_value_for_tests_123456"), 0600))
				require.NoError(t, os.Symlink(outside, filepath.Join(testSecretsDir(path), "link")))

				return `{{ secret "` + filepath.Join(testSecretsDir(path), "link", "outside.txt") + `" }}`
			},
			false,
		},
		{
			"ShouldRejectRelativeSecret",
			func(t *testing.T, path string) string {
				return `{{ secret "secrets/jwt_secret.txt" }}`
			},
			false,
		},
		{
			"ShouldRejectEnv",
			func(t *testing.T, path string) string {
				return `'{{ env "HOME" }}'`
			},
			false,
		},
		{
			"ShouldRejectFileContent",
			func(t *testing.T, path string) string {
				return `{{ fileContent "/etc/hosts" | msquote }}`
			},
			false,
		},
		{
			"ShouldRejectSecretWithOtherFunctions",
			func(t *testing.T, path string) string {
				return `{{ secret "` + filepath.Join(testSecretsDir(path), "jwt_secret.txt") + `" | b64enc }}`
			},
			false,
		},
		{
			"ShouldRejectMultilineExpression",
			func(t *testing.T, path string) string {
				return "{{ env\n  \"HOME\" }}"
			},
			false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			manager, path := newTemplatedTestManager(t)

			expression := tc.expression(t, path)
			content := testReplaceInFile(t, manager, path, `{{ secret "`+testSecretsDir(path)+`/storage_encryption_key.txt" | mindent 0 "|" | msquote }}`, expression)

			result, err := manager.Validate(path, content)
			require.NoError(t, err)

			assert.Equal(t, tc.valid, result.Valid, "errors: %v", result.Errors)

			if !tc.valid {
				require.Len(t, result.Errors, 1)
				assert.Contains(t, result.Errors[0], "can't be added from the administration area")
			}

			saved, err := manager.Save(path, content)
			require.NoError(t, err)
			assert.Equal(t, tc.valid, saved.Valid)

			written, err := manager.Read(path)
			require.NoError(t, err)
			assert.Equal(t, tc.valid, strings.Contains(string(written), expression))
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
		valid   bool
	}{
		{"ShouldAllowUnchanged", func(string) []string { return nil }, func(string) string { return "" }, true},
		{"ShouldAllowSameRoots", func(dir string) []string { return []string{dir} }, func(dir string) string { return "administration:\n  file_roots:\n    - '" + dir + "'\n" }, true},
		{"ShouldRejectAddedRoots", func(string) []string { return nil }, func(string) string { return "administration:\n  file_roots:\n    - '/'\n" }, false},
		{"ShouldRejectRemovedRoots", func(dir string) []string { return []string{dir} }, func(string) string { return "" }, false},
		{"ShouldRejectChangedRoots", func(dir string) []string { return []string{dir} }, func(string) string { return "administration:\n  file_roots:\n    - '/'\n" }, false},
		{"ShouldRejectRootsFromAnAlias", func(string) []string { return nil }, func(string) string {
			return "x-roots: &roots\n  file_roots:\n    - '/'\nadministration: *roots\n"
		}, false},
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

			assert.Equal(t, tc.valid, result.Valid, "errors: %v", result.Errors)

			if !tc.valid {
				assert.Contains(t, strings.Join(result.Errors, "\n"), "administration: file_roots: option can't be changed from the administration area")
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

	result, err := manager.Save(path, content)
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
