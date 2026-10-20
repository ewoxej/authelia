// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package admin

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testConfiguration = `---
# The theme of the portal.
theme: 'dark'

identity_validation:
  reset_password:
    jwt_secret: 'a_very_important_secret_for_jwt_tokens_123456'

authentication_backend:
  file:
    path: '%s'

session:
  secret: 'a_very_important_secret_for_sessions_123456'
  cookies:
    - domain: 'example.com'
      authelia_url: 'https://auth.example.com'

storage:
  encryption_key: 'a_very_important_secret_for_storage_123456'
  local:
    path: '%s'

notifier:
  filesystem:
    filename: '%s'

# Access control comment.
access_control:
  default_policy: 'one_factor'
`

func newTestManager(t *testing.T) (manager *ConfigurationManager, path string) {
	t.Helper()

	dir := t.TempDir()

	path = filepath.Join(dir, "configuration.yml")

	users := filepath.Join(dir, "users.yml")
	require.NoError(t, os.WriteFile(users, []byte("users: {}\n"), 0600))

	content := []byte(sprintf(testConfiguration, users, filepath.Join(dir, "db.sqlite3"), filepath.Join(dir, "notification.txt")))
	require.NoError(t, os.WriteFile(path, content, 0600))

	return NewConfigurationManager([]string{path}, nil, nil), path
}

func TestConfigurationManagerFiles(t *testing.T) {
	manager, path := newTestManager(t)

	files, err := manager.Files()
	require.NoError(t, err)
	require.Len(t, files, 1)

	assert.Equal(t, path, files[0].Path)
	assert.True(t, files[0].Writable)
}

func TestConfigurationManagerFilesDirectory(t *testing.T) {
	dir := t.TempDir()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "b.yml"), []byte("theme: dark\n"), 0600))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "a.yaml"), []byte("theme: light\n"), 0600))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "c.txt"), []byte("ignored"), 0600))
	require.NoError(t, os.Mkdir(filepath.Join(dir, "sub"), 0700))

	manager := NewConfigurationManager([]string{dir}, nil, nil)

	files, err := manager.Files()
	require.NoError(t, err)
	require.Len(t, files, 2)

	assert.Equal(t, filepath.Join(dir, "a.yaml"), files[0].Path)
	assert.Equal(t, filepath.Join(dir, "b.yml"), files[1].Path)
}

func TestConfigurationManagerReadUnknownFile(t *testing.T) {
	manager, _ := newTestManager(t)

	_, err := manager.Read("/etc/passwd")
	assert.ErrorIs(t, err, ErrConfigurationFileUnknown)

	_, err = manager.Read("")
	assert.NoError(t, err, "an empty path resolves to the only configuration file")
}

func TestConfigurationManagerValidate(t *testing.T) {
	manager, path := newTestManager(t)

	content, err := manager.Read(path)
	require.NoError(t, err)

	result, err := manager.Validate(path, content)
	require.NoError(t, err)
	assert.True(t, result.Valid, "errors: %v", result.Errors)

	result, err = manager.Validate(path, append(content, []byte("\naccess_control:\n  default_policy: 'invalid'\n")...))
	require.NoError(t, err)
	assert.False(t, result.Valid)

	result, err = manager.Validate(path, []byte("theme: [unclosed"))
	require.NoError(t, err)
	assert.False(t, result.Valid)
	assert.NotEmpty(t, result.Errors)

	result, err = manager.Validate(path, append(content, []byte("\nnot_a_key: true\n")...))
	require.NoError(t, err)
	assert.False(t, result.Valid)
	assert.Contains(t, result.Errors[0], "not_a_key")
}

func TestConfigurationManagerSaveInvalidDoesNotWrite(t *testing.T) {
	manager, path := newTestManager(t)

	before, err := os.ReadFile(path)
	require.NoError(t, err)

	result, _, err := manager.Save(path, []byte("access_control:\n  default_policy: 'invalid'\n"), "john")
	require.NoError(t, err)
	assert.False(t, result.Valid)

	after, err := os.ReadFile(path)
	require.NoError(t, err)
	assert.Equal(t, before, after)
}

func TestConfigurationManagerSave(t *testing.T) {
	manager, path := newTestManager(t)

	original, err := os.ReadFile(path)
	require.NoError(t, err)

	content := append(original, []byte("\nregulation:\n  max_retries: 5\n")...)

	result, _, err := manager.Save(path, content, "john")
	require.NoError(t, err)
	require.True(t, result.Valid, "errors: %v", result.Errors)

	saved, err := os.ReadFile(path)
	require.NoError(t, err)
	assert.Equal(t, content, saved)

	matches, err := filepath.Glob(path + "*")
	require.NoError(t, err)
	assert.Equal(t, []string{path}, matches, "no backup or temporary files are left behind")
}

func TestConfigurationManagerSectionsText(t *testing.T) {
	manager, path := newTestManager(t)

	text, err := manager.SectionsText(path, []string{"access_control", "theme"})
	require.NoError(t, err)
	assert.Equal(t, "theme: 'dark'\n\naccess_control:\n  default_policy: 'one_factor'\n", text, "keys are returned in file order as written")

	text, err = manager.SectionsText(path, []string{"regulation"})
	require.NoError(t, err)
	assert.Empty(t, text)

	_, err = manager.SectionsText(path, []string{"bad_key"})
	assert.ErrorIs(t, err, ErrConfigurationSectionInvalid)
}

func TestConfigurationManagerWithSectionsText(t *testing.T) {
	manager, path := newTestManager(t)

	original, err := manager.Read(path)
	require.NoError(t, err)

	content, err := manager.WithSectionsText(path, []string{"access_control"}, "access_control:\n  # Changed.\n  default_policy: 'two_factor'\n")
	require.NoError(t, err)

	expected := strings.Replace(string(original), "access_control:\n  default_policy: 'one_factor'", "access_control:\n  # Changed.\n  default_policy: 'two_factor'", 1)
	assert.Equal(t, expected, string(content), "only the section text changes, comments in it are kept")

	content, err = manager.WithSectionsText(path, []string{"regulation"}, "regulation:\n  max_retries: 5\n")
	require.NoError(t, err)
	assert.True(t, strings.HasSuffix(string(content), "\n\nregulation:\n  max_retries: 5\n"), "missing sections are appended")

	content, err = manager.WithSectionsText(path, []string{"theme"}, "")
	require.NoError(t, err)
	assert.NotContains(t, string(content), "theme:", "an empty text removes the keys")
	assert.Contains(t, string(content), "# The theme of the portal.")

	_, err = manager.WithSectionsText(path, []string{"theme"}, "theme: 'light'\nlog:\n  level: 'debug'\n")
	assert.ErrorContains(t, err, "the key 'log' doesn't belong to this section")

	_, err = manager.WithSectionsText(path, []string{"theme"}, "theme: [unclosed")
	assert.Error(t, err)

	result, err := manager.Validate(path, content)
	require.NoError(t, err)
	assert.True(t, result.Valid, "errors: %v", result.Errors)
}

func TestConfigurationManagerSections(t *testing.T) {
	manager, path := newTestManager(t)

	value, err := manager.Section(path, "access_control")
	require.NoError(t, err)
	assert.Equal(t, map[string]any{"default_policy": "one_factor"}, value)

	value, err = manager.Section(path, "regulation")
	require.NoError(t, err)
	assert.Nil(t, value)

	_, err = manager.Section(path, "not_a_section")
	assert.ErrorIs(t, err, ErrConfigurationSectionInvalid)

	content, err := manager.WithSections(path, map[string]any{
		"access_control": map[string]any{"default_policy": "two_factor"},
		"regulation":     map[string]any{"max_retries": 5},
		"theme":          nil,
	})
	require.NoError(t, err)

	text := string(content)

	assert.Contains(t, text, "# Access control comment.")
	assert.Contains(t, text, "default_policy: two_factor")
	assert.Contains(t, text, "max_retries: 5")
	assert.NotContains(t, text, "theme:")
	assert.NotContains(t, text, "# The theme of the portal.\ntheme", "the removed key is gone but its comment is kept")
	assert.Contains(t, text, "\n\nsession:\n  secret: 'a_very_important_secret_for_sessions_123456'\n", "untouched sections keep their formatting")
	assert.Contains(t, text, "\n\n# Access control comment.\naccess_control:\n  default_policy: two_factor\n")
	assert.Regexp(t, `\n\nregulation:\n  max_retries: 5\n$`, text, "new sections are appended")

	result, err := manager.Validate(path, content)
	require.NoError(t, err)
	assert.True(t, result.Valid, "errors: %v", result.Errors)

	_, err = manager.WithSections(path, map[string]any{"bad_key": 1})
	assert.ErrorIs(t, err, ErrConfigurationSectionInvalid)
}

func TestRestartRequested(t *testing.T) {
	assert.False(t, RestartRequested())

	RequestRestart()
	RequestRestart()

	assert.True(t, RestartRequested())

	select {
	case <-RestartRequestedChannel():
	default:
		t.Fatal("expected the restart channel to be closed")
	}
}

func sprintf(format string, args ...any) string {
	return fmt.Sprintf(format, args...)
}
