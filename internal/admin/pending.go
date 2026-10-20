// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package admin

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

const (
	// pendingDirName is the directory next to the configuration where pending changes are kept.
	pendingDirName = ".janus-pending"

	// pendingLifespan is how long a pending change can be confirmed.
	pendingLifespan = 24 * time.Hour

	// pendingRetention is how long decided and expired changes are listed before they're removed.
	pendingRetention = 7 * 24 * time.Hour

	pendingIDAlphabet = "abcdefghijkmnpqrstuvwxyz23456789"
	pendingIDLength   = 8
)

// The states of a pending change.
const (
	PendingStatusPending   = "pending"
	PendingStatusApplied   = "applied"
	PendingStatusRejected  = "rejected"
	PendingStatusCancelled = "cancelled"
	PendingStatusExpired   = "expired"
)

var (
	// ErrPendingChangeUnknown is returned when there's no pending change with the ID.
	ErrPendingChangeUnknown = errors.New("there's no pending change with this ID")

	// ErrPendingChangeDecided is returned when the change was already applied, rejected or cancelled.
	ErrPendingChangeDecided = errors.New("the change was already applied, rejected or cancelled")

	// ErrPendingChangeExpired is returned when the change can no longer be confirmed.
	ErrPendingChangeExpired = errors.New("the change has expired and has to be submitted again")

	// ErrPendingChangeStale is returned when the configuration file changed after the change was submitted.
	ErrPendingChangeStale = errors.New("the configuration file was changed after the change was submitted, it has to be submitted again")

	rePendingID = regexp.MustCompile(`^[` + pendingIDAlphabet + `]{` + fmt.Sprint(pendingIDLength) + `}$`)
)

// PendingChange is a change of a configuration file which waits for the confirmation of someone with access to the
// server.
type PendingChange struct {
	ID       string     `json:"id"`
	Path     string     `json:"path"`
	Username string     `json:"username"`
	Reasons  []string   `json:"reasons"`
	Status   string     `json:"status"`
	Created  time.Time  `json:"created"`
	Expires  time.Time  `json:"expires"`
	Decided  *time.Time `json:"decided,omitempty"`

	// Content is the new content of the file.
	Content string `json:"content"`

	// BaseHash is the SHA-256 of the file the change was made to, so it isn't applied over later changes.
	BaseHash string `json:"base_hash"`
}

// PendingChanges returns the pending changes, the newest first, including the decided and expired ones of the last
// week. Older ones are removed.
func (m *ConfigurationManager) PendingChanges() (changes []PendingChange, err error) {
	var dir string

	if dir, err = m.pendingDir(); err != nil {
		return nil, err
	}

	var entries []os.DirEntry

	if entries, err = os.ReadDir(dir); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []PendingChange{}, nil
		}

		return nil, err
	}

	changes = []PendingChange{}
	now := time.Now()

	for _, entry := range entries {
		id, ok := strings.CutSuffix(entry.Name(), ".json")
		if !ok || !rePendingID.MatchString(id) {
			continue
		}

		change, err := m.loadPendingChange(id)
		if err != nil {
			continue
		}

		ended := change.Expires

		if change.Decided != nil {
			ended = *change.Decided
		}

		if change.Status != PendingStatusPending && now.Sub(ended) > pendingRetention {
			_ = os.Remove(filepath.Join(dir, entry.Name()))

			continue
		}

		changes = append(changes, *change)
	}

	sort.Slice(changes, func(i, j int) bool { return changes[i].Created.After(changes[j].Created) })

	return changes, nil
}

// PendingChange returns the pending change with the ID.
func (m *ConfigurationManager) PendingChange(id string) (change *PendingChange, err error) {
	return m.loadPendingChange(id)
}

// ReviewPendingChange returns the pending change with the ID, the current content of its file and the result of
// validating it again, which lists what needs the confirmation now.
func (m *ConfigurationManager) ReviewPendingChange(id string) (change *PendingChange, current []byte, result *ConfigurationValidationResult, err error) {
	m.mutex.Lock()

	defer m.mutex.Unlock()

	if change, err = m.loadPendingChange(id); err != nil {
		return nil, nil, nil, err
	}

	var path string

	if path, err = m.resolve(change.Path); err != nil {
		return nil, nil, nil, err
	}

	if current, err = os.ReadFile(path); err != nil {
		return nil, nil, nil, err
	}

	if result, err = m.validate(path, []byte(change.Content), true); err != nil {
		return nil, nil, nil, err
	}

	return change, current, result, nil
}

// ApplyPendingChange validates the pending change with everything evaluated and writes it. The result is returned
// without writing anything when it's invalid.
func (m *ConfigurationManager) ApplyPendingChange(id string) (result *ConfigurationValidationResult, err error) {
	m.mutex.Lock()

	defer m.mutex.Unlock()

	var (
		change *PendingChange
		path   string
	)

	if change, path, err = m.decidablePendingChange(id); err != nil {
		return nil, err
	}

	if result, err = m.validate(path, []byte(change.Content), false); err != nil || !result.Valid {
		return result, err
	}

	if err = writeFileAtomic(path, []byte(change.Content)); err != nil {
		return nil, fmt.Errorf("error writing the configuration file: %w", err)
	}

	return result, m.decidePendingChange(change, PendingStatusApplied)
}

// RejectPendingChange rejects the pending change with the ID.
func (m *ConfigurationManager) RejectPendingChange(id string) (err error) {
	return m.endPendingChange(id, PendingStatusRejected)
}

// CancelPendingChange cancels the pending change with the ID, which is how the administration area withdraws it.
func (m *ConfigurationManager) CancelPendingChange(id string) (err error) {
	return m.endPendingChange(id, PendingStatusCancelled)
}

func (m *ConfigurationManager) endPendingChange(id, status string) (err error) {
	m.mutex.Lock()

	defer m.mutex.Unlock()

	var change *PendingChange

	if change, err = m.loadPendingChange(id); err != nil {
		return err
	}

	if change.Status != PendingStatusPending {
		return ErrPendingChangeDecided
	}

	return m.decidePendingChange(change, status)
}

// decidablePendingChange returns the pending change if it can still be applied, and the path of its file.
func (m *ConfigurationManager) decidablePendingChange(id string) (change *PendingChange, path string, err error) {
	if change, err = m.loadPendingChange(id); err != nil {
		return nil, "", err
	}

	switch change.Status {
	case PendingStatusPending:
	case PendingStatusExpired:
		return nil, "", ErrPendingChangeExpired
	default:
		return nil, "", ErrPendingChangeDecided
	}

	if path, err = m.resolve(change.Path); err != nil {
		return nil, "", err
	}

	var current []byte

	if current, err = os.ReadFile(path); err != nil {
		return nil, "", err
	}

	if hash(current) != change.BaseHash {
		return nil, "", ErrPendingChangeStale
	}

	return change, path, nil
}

func (m *ConfigurationManager) submit(path string, content []byte, username string, reasons []string) (change *PendingChange, err error) {
	var current []byte

	if current, err = os.ReadFile(path); err != nil {
		return nil, err
	}

	var id string

	if id, err = newPendingID(); err != nil {
		return nil, err
	}

	now := time.Now().UTC().Truncate(time.Second)

	change = &PendingChange{
		ID:       id,
		Path:     path,
		Username: username,
		Reasons:  reasons,
		Status:   PendingStatusPending,
		Created:  now,
		Expires:  now.Add(pendingLifespan),
		Content:  string(content),
		BaseHash: hash(current),
	}

	var dir string

	if dir, err = m.pendingDir(); err != nil {
		return nil, err
	}

	if err = os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}

	if err = m.savePendingChange(change); err != nil {
		return nil, err
	}

	return change, nil
}

func (m *ConfigurationManager) decidePendingChange(change *PendingChange, status string) error {
	now := time.Now().UTC().Truncate(time.Second)

	change.Status = status
	change.Decided = &now

	return m.savePendingChange(change)
}

func (m *ConfigurationManager) loadPendingChange(id string) (change *PendingChange, err error) {
	if !rePendingID.MatchString(id) {
		return nil, ErrPendingChangeUnknown
	}

	var (
		dir  string
		data []byte
	)

	if dir, err = m.pendingDir(); err != nil {
		return nil, err
	}

	if data, err = os.ReadFile(filepath.Join(dir, id+".json")); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, ErrPendingChangeUnknown
		}

		return nil, err
	}

	change = &PendingChange{}

	if err = json.Unmarshal(data, change); err != nil || change.ID != id {
		return nil, fmt.Errorf("the pending change '%s' is damaged", id)
	}

	if change.Status == PendingStatusPending && time.Now().After(change.Expires) {
		change.Status = PendingStatusExpired
	}

	return change, nil
}

func (m *ConfigurationManager) savePendingChange(change *PendingChange) (err error) {
	var (
		dir  string
		data []byte
	)

	if dir, err = m.pendingDir(); err != nil {
		return err
	}

	if data, err = json.MarshalIndent(change, "", "  "); err != nil {
		return err
	}

	path := filepath.Join(dir, change.ID+".json")

	// Replacing the file keeps its owner, so Janus can still read it after it was decided by root.
	if _, err = os.Stat(path); err == nil {
		return writeFileAtomic(path, data)
	}

	return os.WriteFile(path, data, 0o600)
}

// pendingDir returns the directory the pending changes are kept in, next to the first configuration file.
func (m *ConfigurationManager) pendingDir() (dir string, err error) {
	if len(m.paths) == 0 {
		return "", errors.New("no configuration files are loaded")
	}

	var info os.FileInfo

	if info, err = os.Stat(m.paths[0]); err != nil {
		return "", err
	}

	dir = m.paths[0]

	if !info.IsDir() {
		dir = filepath.Dir(dir)
	}

	return filepath.Join(dir, pendingDirName), nil
}

func newPendingID() (string, error) {
	random := make([]byte, pendingIDLength)

	if _, err := rand.Read(random); err != nil {
		return "", err
	}

	id := make([]byte, pendingIDLength)

	for i, b := range random {
		id[i] = pendingIDAlphabet[int(b)%len(pendingIDAlphabet)]
	}

	return string(id), nil
}

func hash(content []byte) string {
	sum := sha256.Sum256(content)

	return hex.EncodeToString(sum[:])
}
