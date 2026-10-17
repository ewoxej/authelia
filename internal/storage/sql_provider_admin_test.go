// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAuthenticationLogFilterWhere(t *testing.T) {
	where, args := AuthenticationLogFilter{}.where()
	assert.Empty(t, where)
	assert.Empty(t, args)

	where, args = AuthenticationLogFilter{Username: "john", Query: "10_0%!", Kind: AuthenticationLogKindFailed}.where()
	assert.Equal(t, "WHERE username = ? AND (username LIKE ? ESCAPE '!' OR remote_ip LIKE ? ESCAPE '!') AND successful = FALSE AND banned = FALSE", where)
	assert.Equal(t, []any{"john", "%10!_0!%!!%", "%10!_0!%!!%"}, args, "LIKE wildcards in the query are escaped")

	where, _ = AuthenticationLogFilter{Kind: AuthenticationLogKindSecondFactor}.where()
	assert.Contains(t, where, "auth_type IN")
}
