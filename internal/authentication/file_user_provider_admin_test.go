// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package authentication

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestUserManagementProvider(t *testing.T, path string, searchEmail bool) *FileUserProvider {
	t.Helper()

	config := DefaultFileAuthenticationBackendConfiguration
	config.Path = path
	config.Search.Email = searchEmail

	provider := NewFileUserProvider(&config)

	require.NoError(t, provider.StartupCheck())

	return provider
}

func TestFileUserProviderListAndGetUsers(t *testing.T) {
	WithDatabase(t, UserDatabaseContent, func(path string) {
		provider := newTestUserManagementProvider(t, path, false)

		users, err := provider.ListUsers()
		require.NoError(t, err)
		require.NotEmpty(t, users)

		for i := 1; i < len(users); i++ {
			assert.Less(t, users[i-1].Username, users[i].Username, "users are sorted by username")
		}

		user, err := provider.GetUser("john")
		require.NoError(t, err)
		assert.Equal(t, "John Doe", user.DisplayName)
		assert.Equal(t, []string{"admins", "dev"}, user.Groups)

		_, err = provider.GetUser("nobody")
		assert.ErrorIs(t, err, ErrUserNotFound)
	})
}

func TestFileUserProviderCreateUser(t *testing.T) {
	WithDatabase(t, UserDatabaseContent, func(path string) {
		provider := newTestUserManagementProvider(t, path, false)

		err := provider.CreateUser(UserManagementDetails{
			Username: "alice",
			Email:    "alice@authelia.com",
			Groups:   []string{" dev ", "dev", "", "ops"},
		}, "a-strong-password")
		require.NoError(t, err)

		assert.ErrorIs(t, provider.CreateUser(UserManagementDetails{Username: "alice"}, "password"), ErrUserExists)
		assert.Error(t, provider.CreateUser(UserManagementDetails{Username: "-invalid"}, "password"))
		assert.Error(t, provider.CreateUser(UserManagementDetails{Username: "bad user"}, "password"))
		assert.Error(t, provider.CreateUser(UserManagementDetails{Username: "empty"}, ""))

		// Reload from disk to check the user was persisted.
		provider = newTestUserManagementProvider(t, path, false)

		user, err := provider.GetUser("alice")
		require.NoError(t, err)
		assert.Equal(t, "alice", user.DisplayName, "the display name defaults to the username")
		assert.Equal(t, []string{"dev", "ops"}, user.Groups)

		ok, err := provider.CheckUserPassword("alice", "a-strong-password")
		require.NoError(t, err)
		assert.True(t, ok)
	})
}

func TestFileUserProviderCreateUserDuplicateEmailRollsBack(t *testing.T) {
	WithDatabase(t, UserDatabaseContent, func(path string) {
		provider := newTestUserManagementProvider(t, path, true)

		err := provider.CreateUser(UserManagementDetails{Username: "johnny", Email: "john.doe@authelia.com"}, "password")
		require.Error(t, err)

		_, err = provider.GetUser("johnny")
		assert.ErrorIs(t, err, ErrUserNotFound, "the in-memory database is restored")

		details, err := provider.GetDetails("john.doe@authelia.com")
		require.NoError(t, err)
		assert.Equal(t, "john", details.Username, "the email aliases are restored")
	})
}

func TestFileUserProviderUpdateUser(t *testing.T) {
	WithDatabase(t, UserDatabaseContent, func(path string) {
		provider := newTestUserManagementProvider(t, path, false)

		err := provider.UpdateUser(UserManagementDetails{
			Username:    "harry",
			DisplayName: "Harry J. Potter",
			Email:       "harry@hogwarts.example",
			Groups:      []string{"wizards"},
			Disabled:    true,
		})
		require.NoError(t, err)

		assert.ErrorIs(t, provider.UpdateUser(UserManagementDetails{Username: "nobody", DisplayName: "x"}), ErrUserNotFound)
		assert.Error(t, provider.UpdateUser(UserManagementDetails{Username: "harry", DisplayName: " "}))

		provider = newTestUserManagementProvider(t, path, false)

		user, err := provider.GetUser("harry")
		require.NoError(t, err)
		assert.Equal(t, "Harry J. Potter", user.DisplayName)
		assert.Equal(t, "harry@hogwarts.example", user.Email)
		assert.Equal(t, []string{"wizards"}, user.Groups)
		assert.True(t, user.Disabled)

		_, err = provider.GetDetails("harry")
		assert.ErrorIs(t, err, ErrUserNotFound, "disabled users can't be used to sign in")
	})
}

func TestFileUserProviderDeleteUser(t *testing.T) {
	WithDatabase(t, UserDatabaseContent, func(path string) {
		provider := newTestUserManagementProvider(t, path, false)

		require.NoError(t, provider.DeleteUser("bob"))
		assert.ErrorIs(t, provider.DeleteUser("bob"), ErrUserNotFound)

		provider = newTestUserManagementProvider(t, path, false)

		_, err := provider.GetUser("bob")
		assert.ErrorIs(t, err, ErrUserNotFound)
	})
}

func TestFileUserProviderSetUserPassword(t *testing.T) {
	WithDatabase(t, UserDatabaseContent, func(path string) {
		provider := newTestUserManagementProvider(t, path, false)

		require.NoError(t, provider.UpdateUser(UserManagementDetails{Username: "harry", DisplayName: "Harry Potter", Disabled: true}))
		require.NoError(t, provider.SetUserPassword("harry", "new-password"), "works for disabled users")
		assert.ErrorIs(t, provider.SetUserPassword("nobody", "new-password"), ErrUserNotFound)

		require.NoError(t, provider.UpdateUser(UserManagementDetails{Username: "harry", DisplayName: "Harry Potter"}))

		ok, err := provider.CheckUserPassword("harry", "new-password")
		require.NoError(t, err)
		assert.True(t, ok)
	})
}
