// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package authentication

import (
	"errors"
	"fmt"
	"maps"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/go-crypt/crypt/algorithm"

	"github.com/authelia/authelia/v4/internal/configuration/schema"
)

// ErrUserExists is returned when attempting to create a user which already exists.
var ErrUserExists = errors.New("user already exists")

var reUsernameAdmin = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._@+-]{0,99}$`)

// UserManagementProvider is implemented by user providers which allow users to be managed.
type UserManagementProvider interface {
	ListUsers() (users []UserManagementDetails, err error)
	GetUser(username string) (user *UserManagementDetails, err error)
	CreateUser(user UserManagementDetails, password string) (err error)
	UpdateUser(user UserManagementDetails) (err error)
	DeleteUser(username string) (err error)
	SetUserPassword(username, password string) (err error)
}

// UserManagementDetails represents the details of a user which can be managed by an administrator.
type UserManagementDetails struct {
	Username       string   `json:"username"`
	DisplayName    string   `json:"display_name"`
	Email          string   `json:"email"`
	Groups         []string `json:"groups"`
	Disabled       bool     `json:"disabled"`
	GivenName      string   `json:"given_name"`
	MiddleName     string   `json:"middle_name"`
	FamilyName     string   `json:"family_name"`
	Nickname       string   `json:"nickname"`
	PhoneNumber    string   `json:"phone_number"`
	PhoneExtension string   `json:"phone_extension"`
	ZoneInfo       string   `json:"zoneinfo"`
}

func newUserManagementDetails(details FileUserDatabaseUserDetails) UserManagementDetails {
	groups := details.Groups
	if groups == nil {
		groups = []string{}
	}

	return UserManagementDetails{
		Username:       details.Username,
		DisplayName:    details.DisplayName,
		Email:          details.Email,
		Groups:         groups,
		Disabled:       details.Disabled,
		GivenName:      details.GivenName,
		MiddleName:     details.MiddleName,
		FamilyName:     details.FamilyName,
		Nickname:       details.Nickname,
		PhoneNumber:    details.PhoneNumber,
		PhoneExtension: details.PhoneExtension,
		ZoneInfo:       details.ZoneInfo,
	}
}

func (u UserManagementDetails) apply(details *FileUserDatabaseUserDetails) {
	details.DisplayName = strings.TrimSpace(u.DisplayName)
	details.Email = strings.TrimSpace(u.Email)
	details.Groups = normalizeGroups(u.Groups)
	details.Disabled = u.Disabled
	details.GivenName = strings.TrimSpace(u.GivenName)
	details.MiddleName = strings.TrimSpace(u.MiddleName)
	details.FamilyName = strings.TrimSpace(u.FamilyName)
	details.Nickname = strings.TrimSpace(u.Nickname)
	details.PhoneNumber = strings.TrimSpace(u.PhoneNumber)
	details.PhoneExtension = strings.TrimSpace(u.PhoneExtension)
	details.ZoneInfo = strings.TrimSpace(u.ZoneInfo)
}

func normalizeGroups(groups []string) (normalized []string) {
	normalized = make([]string, 0, len(groups))

	for _, group := range groups {
		if group = strings.TrimSpace(group); group != "" && !slices.Contains(normalized, group) {
			normalized = append(normalized, group)
		}
	}

	return normalized
}

func (p *FileUserProvider) fileDatabase() (database *FileUserDatabase, err error) {
	var ok bool

	if database, ok = p.database.(*FileUserDatabase); !ok || database == nil {
		return nil, fmt.Errorf("the file user database does not support user management")
	}

	return database, nil
}

// ListUsers implements UserManagementProvider.
func (p *FileUserProvider) ListUsers() (users []UserManagementDetails, err error) {
	var database *FileUserDatabase

	if database, err = p.fileDatabase(); err != nil {
		return nil, err
	}

	database.RLock()

	defer database.RUnlock()

	users = make([]UserManagementDetails, 0, len(database.Users))

	for _, username := range slices.Sorted(maps.Keys(database.Users)) {
		users = append(users, newUserManagementDetails(database.Users[username]))
	}

	return users, nil
}

// GetUser implements UserManagementProvider.
func (p *FileUserProvider) GetUser(username string) (user *UserManagementDetails, err error) {
	var database *FileUserDatabase

	if database, err = p.fileDatabase(); err != nil {
		return nil, err
	}

	database.RLock()

	defer database.RUnlock()

	details, ok := database.Users[username]
	if !ok {
		return nil, ErrUserNotFound
	}

	u := newUserManagementDetails(details)

	return &u, nil
}

// CreateUser implements UserManagementProvider.
func (p *FileUserProvider) CreateUser(user UserManagementDetails, password string) (err error) {
	user.Username = strings.TrimSpace(user.Username)

	if !reUsernameAdmin.MatchString(user.Username) {
		return fmt.Errorf("the username '%s' is invalid: it must start with a letter or number and only contain letters, numbers, and the characters '.', '_', '@', '+', '-'", user.Username)
	}

	if strings.TrimSpace(user.DisplayName) == "" {
		user.DisplayName = user.Username
	}

	if p.config.Search.CaseInsensitive {
		user.Username = strings.ToLower(user.Username)
	}

	var digest algorithm.Digest

	if digest, err = p.hashPassword(password); err != nil {
		return err
	}

	details := &FileUserDatabaseUserDetails{
		Username: user.Username,
		Password: schema.NewPasswordDigest(digest),
	}

	user.apply(details)

	return p.modify(func(database *FileUserDatabase) error {
		if _, ok := database.Users[user.Username]; ok {
			return ErrUserExists
		}

		database.Users[user.Username] = *details

		return nil
	})
}

// UpdateUser implements UserManagementProvider.
func (p *FileUserProvider) UpdateUser(user UserManagementDetails) (err error) {
	if strings.TrimSpace(user.DisplayName) == "" {
		return fmt.Errorf("the display name must not be empty")
	}

	return p.modify(func(database *FileUserDatabase) error {
		details, ok := database.Users[user.Username]
		if !ok {
			return ErrUserNotFound
		}

		user.apply(&details)

		database.Users[user.Username] = details

		return nil
	})
}

// DeleteUser implements UserManagementProvider.
func (p *FileUserProvider) DeleteUser(username string) (err error) {
	return p.modify(func(database *FileUserDatabase) error {
		if _, ok := database.Users[username]; !ok {
			return ErrUserNotFound
		}

		delete(database.Users, username)

		return nil
	})
}

// SetUserPassword implements UserManagementProvider. Unlike UpdatePassword it also works for disabled users.
func (p *FileUserProvider) SetUserPassword(username, password string) (err error) {
	var digest algorithm.Digest

	if digest, err = p.hashPassword(password); err != nil {
		return err
	}

	return p.modify(func(database *FileUserDatabase) error {
		details, ok := database.Users[username]
		if !ok {
			return ErrUserNotFound
		}

		details.Password = schema.NewPasswordDigest(digest)

		database.Users[username] = details

		return nil
	})
}

func (p *FileUserProvider) hashPassword(password string) (digest algorithm.Digest, err error) {
	if password == "" {
		return nil, fmt.Errorf("the password must not be empty")
	}

	if p.hash == nil {
		return nil, fmt.Errorf("the password hashing algorithm is not initialized")
	}

	return p.hash.Hash(password)
}

// modify applies a change to the user database, validates the result, and persists it. If the change is invalid or
// can't be persisted the in-memory database is restored to its previous state.
func (p *FileUserProvider) modify(change func(database *FileUserDatabase) error) (err error) {
	var database *FileUserDatabase

	if database, err = p.fileDatabase(); err != nil {
		return err
	}

	p.mutex.Lock()

	defer p.mutex.Unlock()

	database.Lock()

	previous := maps.Clone(database.Users)

	restore := func() {
		database.Users = previous

		_ = database.LoadAliases()
	}

	if err = change(database); err != nil {
		restore()
		database.Unlock()

		return err
	}

	if err = database.LoadAliases(); err != nil {
		restore()
		database.Unlock()

		return err
	}

	database.Unlock()

	p.setTimeoutReload(time.Now())

	if err = database.Save(); err != nil {
		database.Lock()
		restore()
		database.Unlock()

		return fmt.Errorf("error saving the user database: %w", err)
	}

	return nil
}
