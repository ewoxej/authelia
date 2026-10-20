// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package admin

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testPendingEnvironmentSecret = "an_environment_secret_for_storage_123456"

// newTestPendingChange submits a change which uses an environment variable the configuration doesn't use yet.
func newTestPendingChange(t *testing.T) (manager *ConfigurationManager, path string, original []byte, change *PendingChange) {
	t.Helper()

	manager, path = newTemplatedTestManager(t)

	t.Setenv("TEST_ADMIN_STORAGE_KEY", testPendingEnvironmentSecret)

	var err error

	original, err = manager.Read(path)
	require.NoError(t, err)

	content := testReplaceInFile(t, manager, path, `{{ secret "`+testSecretsDir(path)+`/storage_encryption_key.txt" | mindent 0 "|" | msquote }}`, `'{{ env "TEST_ADMIN_STORAGE_KEY" }}'`)

	result, change, err := manager.Save(path, content, "john")
	require.NoError(t, err)
	require.True(t, result.Valid, "errors: %v", result.Errors)
	require.NotNil(t, change)

	return manager, path, original, change
}

func TestPendingChangeApply(t *testing.T) {
	manager, path, _, change := newTestPendingChange(t)

	changes, err := manager.PendingChanges()
	require.NoError(t, err)
	require.Len(t, changes, 1)
	assert.Equal(t, change.ID, changes[0].ID)
	assert.Equal(t, []string{"uses the environment variable 'TEST_ADMIN_STORAGE_KEY', which the configuration doesn't use yet"}, changes[0].Reasons)
	assert.Regexp(t, rePendingID, change.ID)

	reviewed, current, result, err := manager.ReviewPendingChange(change.ID)
	require.NoError(t, err)
	assert.Equal(t, change.Content, reviewed.Content)
	assert.NotEqual(t, change.Content, string(current))
	assert.Equal(t, change.Reasons, result.Confirmations)

	result, err = manager.ApplyPendingChange(change.ID)
	require.NoError(t, err)
	require.True(t, result.Valid, "errors: %v", result.Errors)
	assert.NotContains(t, result.Errors, testPendingEnvironmentSecret)

	written, err := manager.Read(path)
	require.NoError(t, err)
	assert.Equal(t, change.Content, string(written))

	applied, err := manager.PendingChange(change.ID)
	require.NoError(t, err)
	assert.Equal(t, PendingStatusApplied, applied.Status)
	assert.NotNil(t, applied.Decided)

	_, err = manager.ApplyPendingChange(change.ID)
	assert.ErrorIs(t, err, ErrPendingChangeDecided)

	// Once it's applied the environment variable is in use and needs no confirmation.
	validation, err := manager.Validate(path, written)
	require.NoError(t, err)
	assert.Empty(t, validation.Confirmations)
}

func TestPendingChangeApplyInvalid(t *testing.T) {
	manager, path, original, change := newTestPendingChange(t)

	// The value is only checked once everything is evaluated.
	t.Setenv("TEST_ADMIN_STORAGE_KEY", "short")

	result, err := manager.ApplyPendingChange(change.ID)
	require.NoError(t, err)
	assert.False(t, result.Valid)

	written, err := manager.Read(path)
	require.NoError(t, err)
	assert.Equal(t, string(original), string(written))

	pending, err := manager.PendingChange(change.ID)
	require.NoError(t, err)
	assert.Equal(t, PendingStatusPending, pending.Status)
}

func TestPendingChangeStale(t *testing.T) {
	manager, path, original, change := newTestPendingChange(t)

	require.NoError(t, os.WriteFile(path, append(original, []byte("\n# changed on the server\n")...), 0600))

	_, err := manager.ApplyPendingChange(change.ID)
	assert.ErrorIs(t, err, ErrPendingChangeStale)
}

func TestPendingChangeExpired(t *testing.T) {
	manager, _, _, change := newTestPendingChange(t)

	change.Expires = time.Now().Add(-time.Minute)
	require.NoError(t, manager.savePendingChange(change))

	expired, err := manager.PendingChange(change.ID)
	require.NoError(t, err)
	assert.Equal(t, PendingStatusExpired, expired.Status)

	_, err = manager.ApplyPendingChange(change.ID)
	assert.ErrorIs(t, err, ErrPendingChangeExpired)
}

func TestPendingChangeRejectAndCancel(t *testing.T) {
	testCases := []struct {
		name   string
		end    func(manager *ConfigurationManager, id string) error
		status string
	}{
		{"ShouldReject", (*ConfigurationManager).RejectPendingChange, PendingStatusRejected},
		{"ShouldCancel", (*ConfigurationManager).CancelPendingChange, PendingStatusCancelled},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			manager, path, original, change := newTestPendingChange(t)

			require.NoError(t, tc.end(manager, change.ID))

			ended, err := manager.PendingChange(change.ID)
			require.NoError(t, err)
			assert.Equal(t, tc.status, ended.Status)

			assert.ErrorIs(t, tc.end(manager, change.ID), ErrPendingChangeDecided)

			_, err = manager.ApplyPendingChange(change.ID)
			assert.ErrorIs(t, err, ErrPendingChangeDecided)

			written, err := manager.Read(path)
			require.NoError(t, err)
			assert.Equal(t, string(original), string(written))
		})
	}
}

func TestPendingChangeUnknown(t *testing.T) {
	manager, _, _, _ := newTestPendingChange(t)

	for _, id := range []string{"", "abcdefgh", "../../../etc/passwd", "ABCDEFGH", "abcdefg1"} {
		_, err := manager.PendingChange(id)
		assert.ErrorIs(t, err, ErrPendingChangeUnknown, id)
	}
}

func TestPendingChangesRemovesOldDecisions(t *testing.T) {
	manager, _, _, change := newTestPendingChange(t)

	require.NoError(t, manager.RejectPendingChange(change.ID))

	decided := time.Now().Add(-pendingRetention - time.Hour)

	dir, err := manager.pendingDir()
	require.NoError(t, err)

	data, err := os.ReadFile(filepath.Join(dir, change.ID+".json"))
	require.NoError(t, err)

	stored := &PendingChange{}
	require.NoError(t, json.Unmarshal(data, stored))

	stored.Decided = &decided
	require.NoError(t, manager.savePendingChange(stored))

	changes, err := manager.PendingChanges()
	require.NoError(t, err)
	assert.Empty(t, changes)

	assert.NoFileExists(t, filepath.Join(dir, change.ID+".json"))
}

func TestPendingChangesEmpty(t *testing.T) {
	manager, _ := newTemplatedTestManager(t)

	changes, err := manager.PendingChanges()
	require.NoError(t, err)
	assert.Empty(t, changes)
}
