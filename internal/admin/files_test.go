// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package admin

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFileBrowser(t *testing.T) {
	base, err := filepath.EvalSymlinks(t.TempDir())
	require.NoError(t, err)

	root := filepath.Join(base, "config")
	outside := filepath.Join(base, "outside")

	require.NoError(t, os.MkdirAll(filepath.Join(root, "secrets"), 0o755))
	require.NoError(t, os.MkdirAll(outside, 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(root, "configuration.yml"), []byte("x"), 0o600))
	require.NoError(t, os.WriteFile(filepath.Join(root, "Alpha.txt"), []byte("abc"), 0o600))
	require.NoError(t, os.WriteFile(filepath.Join(outside, "passwd"), []byte("secret"), 0o600))
	require.NoError(t, os.Symlink(outside, filepath.Join(root, "escape")))

	browser := NewFileBrowser([]string{root, filepath.Join(base, "missing"), "", root})

	t.Run("ShouldOnlyKeepExistingUniqueRoots", func(t *testing.T) {
		assert.Equal(t, []string{root}, browser.Roots())
	})

	t.Run("ShouldListRootsWhenPathIsEmpty", func(t *testing.T) {
		listing, err := browser.List("")
		require.NoError(t, err)

		require.Len(t, listing.Entries, 1)
		assert.Equal(t, root, listing.Entries[0].Name)
		assert.True(t, listing.Entries[0].Directory)
	})

	t.Run("ShouldListDirectoriesFirstAndSorted", func(t *testing.T) {
		listing, err := browser.List(root)
		require.NoError(t, err)

		names := make([]string, 0, len(listing.Entries))
		for _, entry := range listing.Entries {
			names = append(names, entry.Name)
		}

		assert.Equal(t, []string{"escape", "secrets", "Alpha.txt", "configuration.yml"}, names)
		require.NotNil(t, listing.Parent)
		assert.Equal(t, "", *listing.Parent)
	})

	t.Run("ShouldReturnParentInsideRoot", func(t *testing.T) {
		listing, err := browser.List(filepath.Join(root, "secrets"))
		require.NoError(t, err)

		require.NotNil(t, listing.Parent)
		assert.Equal(t, root, *listing.Parent)
	})

	t.Run("ShouldRejectPathOutsideRoots", func(t *testing.T) {
		_, err := browser.List(outside)
		assert.ErrorIs(t, err, ErrFilePathOutsideRoots)

		_, err = browser.List(filepath.Join(root, "..", "outside"))
		assert.ErrorIs(t, err, ErrFilePathOutsideRoots)
	})

	t.Run("ShouldRejectSymlinkLeadingOutside", func(t *testing.T) {
		_, err := browser.List(filepath.Join(root, "escape"))
		assert.ErrorIs(t, err, ErrFilePathOutsideRoots)
		assert.False(t, browser.Allowed(filepath.Join(root, "escape", "passwd")))
	})

	t.Run("ShouldRejectFile", func(t *testing.T) {
		_, err := browser.List(filepath.Join(root, "Alpha.txt"))
		assert.ErrorIs(t, err, ErrFilePathNotDirectory)
	})

	t.Run("ShouldAllowNewFileInsideRoot", func(t *testing.T) {
		assert.True(t, browser.Allowed(filepath.Join(root, "secrets", "new.key")))
		assert.False(t, browser.Allowed(filepath.Join(outside, "new.key")))
	})

	t.Run("ShouldCreateDirectory", func(t *testing.T) {
		created, err := browser.CreateDirectory(filepath.Join(root, "new"))
		require.NoError(t, err)
		assert.Equal(t, filepath.Join(root, "new"), created)

		info, err := os.Stat(created)
		require.NoError(t, err)
		assert.True(t, info.IsDir())

		_, err = browser.CreateDirectory(created)
		assert.ErrorIs(t, err, ErrFilePathExists)
	})

	t.Run("ShouldNotCreateDirectoryWithoutParent", func(t *testing.T) {
		_, err := browser.CreateDirectory(filepath.Join(root, "missing", "deeper"))
		assert.ErrorIs(t, err, ErrFilePathParentMissing)
	})

	t.Run("ShouldNotCreateOutsideRoots", func(t *testing.T) {
		_, err := browser.CreateDirectory(filepath.Join(outside, "new"))
		assert.ErrorIs(t, err, ErrFilePathOutsideRoots)

		_, err = browser.CreateDirectory(filepath.Join(root, "escape", "new"))
		assert.ErrorIs(t, err, ErrFilePathOutsideRoots)

		_, err = browser.CreateFile(filepath.Join(root, "..", "outside", "x"), []byte("a"))
		assert.ErrorIs(t, err, ErrFilePathOutsideRoots)

		_, err = browser.CreateFile("", []byte("a"))
		assert.ErrorIs(t, err, ErrFilePathOutsideRoots)
	})

	t.Run("ShouldCreateFileReadableByOwnerOnlyAndNeverReplace", func(t *testing.T) {
		path := filepath.Join(root, "secrets", "key")

		created, err := browser.CreateFile(path, []byte("value"))
		require.NoError(t, err)
		assert.Equal(t, path, created)

		info, err := os.Stat(path)
		require.NoError(t, err)
		assert.Equal(t, os.FileMode(0o600), info.Mode().Perm())

		data, err := os.ReadFile(path)
		require.NoError(t, err)
		assert.Equal(t, "value", string(data))

		_, err = browser.CreateFile(path, []byte("other"))
		assert.ErrorIs(t, err, ErrFilePathExists)

		data, err = os.ReadFile(path)
		require.NoError(t, err)
		assert.Equal(t, "value", string(data))
	})
}
