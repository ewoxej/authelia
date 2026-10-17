// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/authelia/authelia/v4/internal/model"
)

// AdminProvider is implemented by storage providers which support the administration API.
type AdminProvider interface {
	// LoadAuthenticationLogs loads authentication log entries ordered from newest to oldest which match the filter.
	LoadAuthenticationLogs(ctx context.Context, filter AuthenticationLogFilter, limit, page int) (attempts []model.AuthenticationAttempt, err error)

	// LoadAuthenticationLogsSince loads at most limit authentication log entries newer than since, newest first.
	LoadAuthenticationLogsSince(ctx context.Context, since time.Time, limit int) (attempts []model.AuthenticationAttempt, err error)

	// LoadLastSuccessfulAuthentication loads the time of the last successful authentication of a user.
	LoadLastSuccessfulAuthentication(ctx context.Context, username string) (last *time.Time, err error)

	// LoadBannedUsersHistory loads user bans including expired and revoked ones, newest first.
	LoadBannedUsersHistory(ctx context.Context, limit int) (bans []model.BannedUser, err error)

	// LoadBannedIPsHistory loads IP bans including expired and revoked ones, newest first.
	LoadBannedIPsHistory(ctx context.Context, limit int) (bans []model.BannedIP, err error)

	// LoadOAuth2ConsentPreConfigurationsAdmin loads the active OAuth 2.0 consent pre-configurations, optionally
	// filtered by username.
	LoadOAuth2ConsentPreConfigurationsAdmin(ctx context.Context, username string, limit, page int) (consents []model.OAuth2ConsentPreConfigAdmin, err error)

	// RevokeOAuth2ConsentPreConfiguration revokes an OAuth 2.0 consent pre-configuration given its id.
	RevokeOAuth2ConsentPreConfiguration(ctx context.Context, id int64) (err error)
}

// Authentication log kinds used by AuthenticationLogFilter.
const (
	AuthenticationLogKindSignIn       = "sign-in"
	AuthenticationLogKindFailed       = "failed"
	AuthenticationLogKindSecondFactor = "2fa"
	AuthenticationLogKindBanned       = "banned"
)

// AuthenticationLogFilter filters the authentication log.
type AuthenticationLogFilter struct {
	// Username only matches the entries of this user exactly.
	Username string

	// Query matches entries whose username or remote IP contain it.
	Query string

	// Kind is one of the AuthenticationLogKind constants.
	Kind string
}

func (f AuthenticationLogFilter) where() (where string, args []any) {
	var conditions []string

	if username := strings.TrimSpace(f.Username); username != "" {
		conditions = append(conditions, "username = ?")
		args = append(args, username)
	}

	if query := strings.TrimSpace(f.Query); query != "" {
		pattern := "%" + escapeLike(query) + "%"

		conditions = append(conditions, "(username LIKE ? ESCAPE '!' OR remote_ip LIKE ? ESCAPE '!')")
		args = append(args, pattern, pattern)
	}

	switch f.Kind {
	case AuthenticationLogKindSignIn:
		conditions = append(conditions, "successful = TRUE AND auth_type IN ('1FA', 'Passkey')")
	case AuthenticationLogKindFailed:
		conditions = append(conditions, "successful = FALSE AND banned = FALSE")
	case AuthenticationLogKindSecondFactor:
		conditions = append(conditions, "auth_type IN ('TOTP', 'WebAuthn', 'Duo', 'Password')")
	case AuthenticationLogKindBanned:
		conditions = append(conditions, "banned = TRUE")
	}

	if len(conditions) == 0 {
		return "", args
	}

	return "WHERE " + strings.Join(conditions, " AND "), args
}

func escapeLike(value string) string {
	return strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(value)
}

const (
	queryFmtSelectAuthenticationLogs = `
		SELECT id, time, successful, banned, username, auth_type, remote_ip, request_uri, request_method
		FROM %s
		%s
		ORDER BY time DESC
		LIMIT ?
		OFFSET ?;`

	queryFmtSelectAuthenticationLogsSince = `
		SELECT id, time, successful, banned, username, auth_type, remote_ip, request_uri, request_method
		FROM %s
		WHERE time > ?
		ORDER BY time DESC
		LIMIT ?;`

	queryFmtSelectLastSuccessfulAuthentication = `
		SELECT time
		FROM %s
		WHERE username = ? AND successful = TRUE
		ORDER BY time DESC
		LIMIT 1;`

	queryFmtSelectBannedUsersHistory = `
		SELECT id, time, expires, expired, revoked, username, source, reason
		FROM %s
		ORDER BY time DESC
		LIMIT ?;`

	queryFmtSelectBannedIPsHistory = `
		SELECT id, time, expires, expired, revoked, ip, source, reason
		FROM %s
		ORDER BY time DESC
		LIMIT ?;`

	queryFmtSelectOAuth2ConsentPreConfigurationsAdmin = `
		SELECT c.id, c.client_id, c.subject, u.username, c.created_at, c.expires_at, c.scopes, c.audience
		FROM %s c
		INNER JOIN %s u ON u.identifier = c.subject
		WHERE c.revoked = FALSE AND (c.expires_at IS NULL OR c.expires_at >= ?)%s
		ORDER BY c.created_at DESC
		LIMIT ?
		OFFSET ?;`

	queryFmtRevokeOAuth2ConsentPreConfiguration = `
		UPDATE %s
		SET revoked = TRUE
		WHERE id = ?;`
)

// LoadAuthenticationLogs implements AdminProvider.
func (p *SQLProvider) LoadAuthenticationLogs(ctx context.Context, filter AuthenticationLogFilter, limit, page int) (attempts []model.AuthenticationAttempt, err error) {
	where, args := filter.where()

	args = append(args, limit, limit*page)

	conn := p.conn(ctx)
	query := conn.Rebind(fmt.Sprintf(queryFmtSelectAuthenticationLogs, tableAuthenticationLogs, where))

	return selectAdmin[model.AuthenticationAttempt](ctx, conn, "authentication logs", query, args...)
}

// LoadAuthenticationLogsSince implements AdminProvider.
func (p *SQLProvider) LoadAuthenticationLogsSince(ctx context.Context, since time.Time, limit int) (attempts []model.AuthenticationAttempt, err error) {
	conn := p.conn(ctx)
	query := conn.Rebind(fmt.Sprintf(queryFmtSelectAuthenticationLogsSince, tableAuthenticationLogs))

	return selectAdmin[model.AuthenticationAttempt](ctx, conn, "authentication logs", query, since, limit)
}

// LoadLastSuccessfulAuthentication implements AdminProvider.
func (p *SQLProvider) LoadLastSuccessfulAuthentication(ctx context.Context, username string) (last *time.Time, err error) {
	conn := p.conn(ctx)
	query := conn.Rebind(fmt.Sprintf(queryFmtSelectLastSuccessfulAuthentication, tableAuthenticationLogs))

	var value time.Time

	if err = conn.QueryRowxContext(ctx, query, username).Scan(&value); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}

		return nil, fmt.Errorf("error selecting the last successful authentication of user '%s': %w", username, err)
	}

	return &value, nil
}

// LoadBannedUsersHistory implements AdminProvider.
func (p *SQLProvider) LoadBannedUsersHistory(ctx context.Context, limit int) (bans []model.BannedUser, err error) {
	conn := p.conn(ctx)
	query := conn.Rebind(fmt.Sprintf(queryFmtSelectBannedUsersHistory, tableBannedUser))

	return selectAdmin[model.BannedUser](ctx, conn, "banned user history", query, limit)
}

// LoadBannedIPsHistory implements AdminProvider.
func (p *SQLProvider) LoadBannedIPsHistory(ctx context.Context, limit int) (bans []model.BannedIP, err error) {
	conn := p.conn(ctx)
	query := conn.Rebind(fmt.Sprintf(queryFmtSelectBannedIPsHistory, tableBannedIP))

	return selectAdmin[model.BannedIP](ctx, conn, "banned ip history", query, limit)
}

// LoadOAuth2ConsentPreConfigurationsAdmin implements AdminProvider.
func (p *SQLProvider) LoadOAuth2ConsentPreConfigurationsAdmin(ctx context.Context, username string, limit, page int) (consents []model.OAuth2ConsentPreConfigAdmin, err error) {
	var (
		where string
		args  = []any{time.Now()}
	)

	if username = strings.TrimSpace(username); username != "" {
		where = " AND u.username = ?"
		args = append(args, username)
	}

	args = append(args, limit, limit*page)

	conn := p.conn(ctx)
	query := conn.Rebind(fmt.Sprintf(queryFmtSelectOAuth2ConsentPreConfigurationsAdmin, tableOAuth2ConsentPreConfiguration, tableUserOpaqueIdentifier, where))

	return selectAdmin[model.OAuth2ConsentPreConfigAdmin](ctx, conn, "oauth2 consent pre-configurations", query, args...)
}

// RevokeOAuth2ConsentPreConfiguration implements AdminProvider.
func (p *SQLProvider) RevokeOAuth2ConsentPreConfiguration(ctx context.Context, id int64) (err error) {
	conn := p.conn(ctx)

	if _, err = conn.ExecContext(ctx, conn.Rebind(fmt.Sprintf(queryFmtRevokeOAuth2ConsentPreConfiguration, tableOAuth2ConsentPreConfiguration)), id); err != nil {
		return fmt.Errorf("error revoking oauth2 consent pre-configuration with id '%d': %w", id, err)
	}

	return nil
}

func selectAdmin[T any](ctx context.Context, conn SQLXConnection, name, query string, args ...any) (rows []T, err error) {
	rows = []T{}

	if err = conn.SelectContext(ctx, &rows, query, args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return rows, nil
		}

		return nil, fmt.Errorf("error selecting %s: %w", name, err)
	}

	return rows, nil
}
