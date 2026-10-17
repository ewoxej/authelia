// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package model

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// OAuth2ConsentPreConfigAdmin represents an OAuth 2.0 consent pre-configuration with the username of the subject, used
// by the administration API.
type OAuth2ConsentPreConfigAdmin struct {
	ID       int64     `db:"id"`
	ClientID string    `db:"client_id"`
	Subject  uuid.UUID `db:"subject"`
	Username string    `db:"username"`

	CreatedAt time.Time    `db:"created_at"`
	ExpiresAt sql.NullTime `db:"expires_at"`

	Scopes   StringSlicePipeDelimited `db:"scopes"`
	Audience StringSlicePipeDelimited `db:"audience"`
}
