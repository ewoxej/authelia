// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package admin

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// maxFileEntries is the maximum number of entries returned for a directory.
const maxFileEntries = 2000

var (
	// ErrFilePathOutsideRoots is returned when a path is not inside one of the allowed directories.
	ErrFilePathOutsideRoots = errors.New("the path is outside of the directories which can be browsed")

	// ErrFilePathNotDirectory is returned when the path to list is not a directory.
	ErrFilePathNotDirectory = errors.New("the path is not a directory")

	// ErrFilePathExists is returned when a file or directory already exists at the path to create.
	ErrFilePathExists = errors.New("something already exists at the path")

	// ErrFilePathParentMissing is returned when the directory to create something in doesn't exist.
	ErrFilePathParentMissing = errors.New("the directory to create it in doesn't exist")
)

// FileEntry is a file or directory in a listing.
type FileEntry struct {
	Name      string    `json:"name"`
	Directory bool      `json:"directory"`
	Size      int64     `json:"size"`
	Modified  time.Time `json:"modified"`
}

// FileListing is the content of a directory, or the allowed directories when Path is empty.
type FileListing struct {
	Path      string      `json:"path"`
	Parent    *string     `json:"parent"`
	Entries   []FileEntry `json:"entries"`
	Truncated bool        `json:"truncated"`
}

// FileBrowser lists the names of the files in a set of allowed directories. It never reads the content of files.
type FileBrowser struct {
	roots []string
}

// NewFileBrowser creates a FileBrowser which only lists the given directories and everything below them. Relative
// paths are made absolute and symbolic links are resolved so a link can't lead out of the directories.
func NewFileBrowser(roots []string) *FileBrowser {
	browser := &FileBrowser{}
	seen := map[string]bool{}

	for _, root := range roots {
		if strings.TrimSpace(root) == "" {
			continue
		}

		resolved, err := resolve(root)
		if err != nil || seen[resolved] {
			continue
		}

		if info, err := os.Stat(resolved); err != nil || !info.IsDir() {
			continue
		}

		seen[resolved] = true

		browser.roots = append(browser.roots, resolved)
	}

	sort.Strings(browser.roots)

	return browser
}

// Roots returns the allowed directories.
func (b *FileBrowser) Roots() []string {
	return append([]string(nil), b.roots...)
}

// List returns the entries of a directory, directories first. An empty path lists the allowed directories.
func (b *FileBrowser) List(path string) (listing *FileListing, err error) {
	if strings.TrimSpace(path) == "" {
		listing = &FileListing{Entries: make([]FileEntry, 0, len(b.roots))}

		for _, root := range b.roots {
			listing.Entries = append(listing.Entries, FileEntry{Name: root, Directory: true})
		}

		return listing, nil
	}

	var resolved string

	if resolved, err = resolve(path); err != nil {
		return nil, ErrFilePathOutsideRoots
	}

	root, ok := b.rootOf(resolved)
	if !ok {
		return nil, ErrFilePathOutsideRoots
	}

	var info os.FileInfo

	if info, err = os.Stat(resolved); err != nil {
		return nil, fmt.Errorf("failed to read the directory: %w", err)
	}

	if !info.IsDir() {
		return nil, ErrFilePathNotDirectory
	}

	var dirEntries []os.DirEntry

	if dirEntries, err = os.ReadDir(resolved); err != nil {
		return nil, fmt.Errorf("failed to read the directory: %w", err)
	}

	listing = &FileListing{Path: resolved, Entries: make([]FileEntry, 0, len(dirEntries))}

	if resolved != root {
		parent := filepath.Dir(resolved)
		listing.Parent = &parent
	} else {
		empty := ""
		listing.Parent = &empty
	}

	for _, entry := range dirEntries {
		if len(listing.Entries) >= maxFileEntries {
			listing.Truncated = true

			break
		}

		item := FileEntry{Name: entry.Name()}

		// Stat follows links so a link to a directory is shown as one. Following it later is checked again.
		if stat, err := os.Stat(filepath.Join(resolved, entry.Name())); err == nil {
			item.Directory = stat.IsDir()
			item.Modified = stat.ModTime()

			if !stat.IsDir() {
				item.Size = stat.Size()
			}
		}

		listing.Entries = append(listing.Entries, item)
	}

	sort.SliceStable(listing.Entries, func(i, j int) bool {
		a, c := listing.Entries[i], listing.Entries[j]

		if a.Directory != c.Directory {
			return a.Directory
		}

		return strings.ToLower(a.Name) < strings.ToLower(c.Name)
	})

	return listing, nil
}

// CreateDirectory creates a directory below one of the allowed directories. The directory above it has to exist.
func (b *FileBrowser) CreateDirectory(path string) (created string, err error) {
	if created, err = b.creatable(path); err != nil {
		return "", err
	}

	if err = os.Mkdir(created, 0o750); err != nil {
		return "", createError(err)
	}

	return created, nil
}

// CreateFile creates a new file with the content below one of the allowed directories. It never replaces a file and the
// file can only be read by its owner. The directory above it has to exist.
func (b *FileBrowser) CreateFile(path string, content []byte) (created string, err error) {
	if created, err = b.creatable(path); err != nil {
		return "", err
	}

	var file *os.File

	if file, err = os.OpenFile(created, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600); err != nil {
		return "", createError(err)
	}

	if _, err = file.Write(content); err != nil {
		_ = file.Close()
		_ = os.Remove(created)

		return "", fmt.Errorf("failed to write the file: %w", err)
	}

	if err = file.Close(); err != nil {
		return "", fmt.Errorf("failed to write the file: %w", err)
	}

	return created, nil
}

func (b *FileBrowser) creatable(path string) (resolved string, err error) {
	if strings.TrimSpace(path) == "" {
		return "", ErrFilePathOutsideRoots
	}

	if resolved, err = resolve(path); err != nil {
		return "", ErrFilePathOutsideRoots
	}

	if _, ok := b.rootOf(resolved); !ok {
		return "", ErrFilePathOutsideRoots
	}

	return resolved, nil
}

func createError(err error) error {
	switch {
	case errors.Is(err, os.ErrExist):
		return ErrFilePathExists
	case errors.Is(err, os.ErrNotExist):
		return ErrFilePathParentMissing
	default:
		return fmt.Errorf("failed to create it: %w", err)
	}
}

// Allowed returns true when the path, with links resolved, is one of the allowed directories or below one. The path
// itself doesn't have to exist, but its closest existing parent does.
func (b *FileBrowser) Allowed(path string) bool {
	resolved, err := resolve(path)
	if err != nil {
		return false
	}

	_, ok := b.rootOf(resolved)

	return ok
}

func (b *FileBrowser) rootOf(resolved string) (root string, ok bool) {
	for _, candidate := range b.roots {
		if resolved == candidate || strings.HasPrefix(resolved, candidate+string(filepath.Separator)) {
			return candidate, true
		}
	}

	return "", false
}

// resolve makes the path absolute and clean and resolves symbolic links. When the path doesn't exist the closest
// existing parent is resolved instead and the rest is appended.
func resolve(path string) (string, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}

	existing, rest := abs, ""

	for {
		resolved, err := filepath.EvalSymlinks(existing)
		if err == nil {
			return filepath.Join(resolved, rest), nil
		}

		if !errors.Is(err, os.ErrNotExist) {
			return "", err
		}

		parent := filepath.Dir(existing)
		if parent == existing {
			return "", err
		}

		rest = filepath.Join(filepath.Base(existing), rest)
		existing = parent
	}
}
