// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package commands

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/authelia/authelia/v4/internal/admin"
	"github.com/authelia/authelia/v4/internal/configuration"
)

const testAdminConfiguration = `server:
  address: 'tcp4://:9091'

identity_validation:
  reset_password:
    jwt_secret: 'a_very_important_secret_for_jwt_tokens_123456'

authentication_backend:
  file:
    path: 'DIR/users.yml'

session:
  name: 'authelia_session'
  secret: 'a_very_important_secret_for_sessions_123456'
  cookies:
    - domain: 'example.com'
      authelia_url: 'https://idm.example.com'

storage:
  encryption_key: 'a_very_important_secret_for_storage_123456'
  local:
    path: 'DIR/db.sqlite3'

notifier:
  filesystem:
    filename: 'DIR/notification.txt'

access_control:
  default_policy: 'two_factor'
`

// newTestAdminChange writes a configuration and submits a change of it which needs a confirmation.
func newTestAdminChange(t *testing.T) (path string, original []byte, change *admin.PendingChange) {
	t.Helper()

	dir := t.TempDir()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "users.yml"), []byte("users: {}\n"), 0600))

	original = []byte(strings.ReplaceAll(testAdminConfiguration, "DIR", dir))
	path = filepath.Join(dir, "configuration.yml")

	require.NoError(t, os.WriteFile(path, original, 0600))

	t.Setenv("TEST_ADMIN_SESSION_NAME", "janus_session")

	filters, err := configuration.NewFileFilters(nil, "", "", "template")
	require.NoError(t, err)

	manager := admin.NewConfigurationManager([]string{path}, filters, nil)

	content := strings.Replace(string(original), "name: 'authelia_session'", `name: '{{ env "TEST_ADMIN_SESSION_NAME" }}'`, 1)

	result, change, err := manager.Save(path, []byte(content), "john")
	require.NoError(t, err)
	require.True(t, result.Valid, "errors: %v", result.Errors)
	require.NotNil(t, change)

	return path, original, change
}

func runTestAdminCmd(t *testing.T, path, input string, args ...string) (output string, err error) {
	t.Helper()

	cmd := NewRootCmd()
	buf := &bytes.Buffer{}

	cmd.SetOut(buf)
	cmd.SetErr(buf)
	cmd.SetIn(strings.NewReader(input))
	cmd.SetArgs(append(args, "--config", path, "--config.filters", "template"))

	err = cmd.Execute()

	return buf.String(), err
}

func TestAdminChangesList(t *testing.T) {
	path, _, change := newTestAdminChange(t)

	output, err := runTestAdminCmd(t, path, "", "admin", "changes")
	require.NoError(t, err)

	assert.Contains(t, output, "Change "+change.ID+" (pending)")
	assert.Contains(t, output, "by john")
	assert.Contains(t, output, "uses the environment variable 'TEST_ADMIN_SESSION_NAME'")
}

func TestAdminChangesShow(t *testing.T) {
	path, original, change := newTestAdminChange(t)

	output, err := runTestAdminCmd(t, path, "", "admin", "changes", "show", change.ID)
	require.NoError(t, err)

	assert.Contains(t, output, "-  name: 'authelia_session'")
	assert.Contains(t, output, `+  name: '{{ env "TEST_ADMIN_SESSION_NAME" }}'`)
	assert.NotContains(t, output, "janus_session", "the value isn't shown")

	written, err := os.ReadFile(path)
	require.NoError(t, err)
	assert.Equal(t, string(original), string(written))
}

func TestAdminChangesApply(t *testing.T) {
	testCases := []struct {
		name    string
		input   string
		args    []string
		applied bool
	}{
		{"ShouldApplyWhenConfirmed", "y\n", nil, true},
		{"ShouldApplyWithYes", "", []string{"--yes"}, true},
		{"ShouldNotApplyWhenDeclined", "n\n", nil, false},
		{"ShouldNotApplyWithoutAnswer", "", nil, false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			path, original, change := newTestAdminChange(t)

			output, err := runTestAdminCmd(t, path, tc.input, append([]string{"admin", "changes", "apply", change.ID}, tc.args...)...)
			require.NoError(t, err)

			written, err := os.ReadFile(path)
			require.NoError(t, err)

			if tc.applied {
				assert.Contains(t, output, "The change was applied.")
				assert.Equal(t, change.Content, string(written))
			} else {
				assert.Contains(t, output, "The change was not applied.")
				assert.Equal(t, string(original), string(written))
			}
		})
	}
}

func TestAdminChangesApplyDecided(t *testing.T) {
	path, _, change := newTestAdminChange(t)

	_, err := runTestAdminCmd(t, path, "", "admin", "changes", "reject", change.ID)
	require.NoError(t, err)

	_, err = runTestAdminCmd(t, path, "", "admin", "changes", "apply", change.ID, "--yes")
	assert.EqualError(t, err, "the change can't be applied as it's rejected")
}

func TestAdminChangesUnknown(t *testing.T) {
	path, _, _ := newTestAdminChange(t)

	_, err := runTestAdminCmd(t, path, "", "admin", "changes", "apply", "abcdefgh", "--yes")
	assert.ErrorIs(t, err, admin.ErrPendingChangeUnknown)
}
