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

func TestConfigurationPolicyGuardedChanges(t *testing.T) {
	const notifier = "notifier:\n  filesystem:\n    filename: "

	testCases := []struct {
		name   string
		change func(t *testing.T, dir string, content string) string
		reason string
	}{
		{
			"ShouldAllowUnrelatedChanges",
			func(_ *testing.T, _ string, content string) string {
				return strings.Replace(content, "default_policy: 'deny'", "default_policy: 'two_factor'", 1)
			},
			"",
		},
		{
			"ShouldConfirmSMTPServer",
			func(_ *testing.T, dir string, content string) string {
				return strings.Replace(content, notifier+"'"+filepath.Join(dir, "notification.txt")+"'",
					"notifier:\n  smtp:\n    address: 'submission://mail.example.org:587'\n    sender: 'Janus <janus@example.com>'", 1)
			},
			"the address of the SMTP server (notifier.smtp.address) from '' to 'submission://mail.example.org:587'",
		},
		{
			"ShouldConfirmRedisServer",
			func(_ *testing.T, _ string, content string) string {
				return strings.Replace(content, "  name: 'authelia_session'\n", "  name: 'authelia_session'\n  redis:\n    host: 'redis.example.org'\n", 1)
			},
			"the address of the Redis server (session.redis.host)",
		},
		{
			"ShouldConfirmWrittenFileOutsideFileRoots",
			func(t *testing.T, dir string, content string) string {
				return strings.Replace(content, filepath.Join(dir, "notification.txt"), filepath.Join(t.TempDir(), "notification.txt"), 1)
			},
			"(notifier.filesystem.filename) to",
		},
		{
			"ShouldConfirmOverwritingAFile",
			func(_ *testing.T, dir string, content string) string {
				return strings.Replace(content, filepath.Join(dir, "notification.txt"), filepath.Join(dir, "users.yml"), 1)
			},
			"which exists already and would be overwritten",
		},
		{
			"ShouldAllowNewFileInFileRoots",
			func(_ *testing.T, dir string, content string) string {
				return strings.Replace(content, filepath.Join(dir, "notification.txt"), filepath.Join(dir, "emails.txt"), 1)
			},
			"",
		},
		{
			"ShouldConfirmRelativePath",
			func(_ *testing.T, dir string, content string) string {
				return strings.Replace(content, filepath.Join(dir, "db.sqlite3"), "db.sqlite3", 1)
			},
			"points the SQLite database (storage.local.path) to 'db.sqlite3', which is outside",
		},
		{
			"ShouldAllowLogInFileRoots",
			func(_ *testing.T, dir string, content string) string {
				return content + "log:\n  file_path: '" + filepath.Join(dir, "janus.%d.log") + "'\n"
			},
			"",
		},
		{
			"ShouldConfirmTrustedCertificatesOutsideFileRoots",
			func(_ *testing.T, _ string, content string) string {
				return content + "certificates_directory: '/etc/ssl/certs'\n"
			},
			"points the trusted certificates (certificates_directory) to '/etc/ssl/certs'",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			manager, path := newTemplatedTestManager(t)
			dir := filepath.Dir(path)

			content, err := manager.Read(path)
			require.NoError(t, err)

			changed := tc.change(t, dir, string(content))
			require.NotEqual(t, string(content), changed)

			result, err := manager.Validate(path, []byte(changed))
			require.NoError(t, err)

			if tc.reason == "" {
				assert.Empty(t, result.Confirmations)

				return
			}

			require.Len(t, result.Confirmations, 1, "%v", result.Confirmations)
			assert.Contains(t, result.Confirmations[0], tc.reason)
		})
	}
}

func TestConfigurationPolicyGuardedChangesAreSavedAsPending(t *testing.T) {
	manager, path := newTemplatedTestManager(t)

	content := testReplaceInFile(t, manager, path, filepath.Join(filepath.Dir(path), "notification.txt"), filepath.Join(filepath.Dir(path), "users.yml"))

	before, err := os.ReadFile(path)
	require.NoError(t, err)

	result, pending, err := manager.Save(path, content, "admin")
	require.NoError(t, err)
	require.NotNil(t, pending)
	assert.NotEmpty(t, result.Confirmations)

	after, err := os.ReadFile(path)
	require.NoError(t, err)
	assert.Equal(t, before, after)

	// Confirmed on the server the change is written.
	result, err = manager.ApplyPendingChange(pending.ID)
	require.NoError(t, err)
	assert.True(t, result.Valid, "%v", result.Errors)

	after, err = os.ReadFile(path)
	require.NoError(t, err)
	assert.Equal(t, content, after)
}
