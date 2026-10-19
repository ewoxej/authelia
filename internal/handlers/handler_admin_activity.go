// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package handlers

import (
	"database/sql"
	"errors"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/valyala/fasthttp"

	"github.com/authelia/authelia/v4/internal/middlewares"
	"github.com/authelia/authelia/v4/internal/model"
	"github.com/authelia/authelia/v4/internal/storage"
)

const adminBanSource = "admin"

// AdminAuthenticationLogsGET returns the authentication logs.
func AdminAuthenticationLogsGET(ctx *middlewares.AutheliaCtx) {
	provider := adminStorage(ctx)
	if provider == nil {
		adminReplyError(ctx, fasthttp.StatusNotImplemented, nil, "The configured storage backend does not support the authentication log.")

		return
	}

	limit, page := adminQueryPage(ctx)

	filter := storage.AuthenticationLogFilter{
		Username: string(ctx.QueryArgs().Peek("username")),
		Query:    string(ctx.QueryArgs().Peek("q")),
		Kind:     string(ctx.QueryArgs().Peek("kind")),
	}

	attempts, err := provider.LoadAuthenticationLogs(ctx, filter, limit, page)
	if err != nil {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to load the authentication log.")

		return
	}

	body := make([]adminAuthenticationLogBody, 0, len(attempts))

	for _, a := range attempts {
		body = append(body, adminAuthenticationLogBody{
			ID:            a.ID,
			Time:          a.Time,
			Successful:    a.Successful,
			Banned:        a.Banned,
			Username:      a.Username,
			Type:          a.Type,
			RemoteIP:      a.RemoteIP.String(),
			RequestURI:    a.RequestURI,
			RequestMethod: a.RequestMethod,
		})
	}

	adminReplyJSON(ctx, body)
}

// AdminBansGET returns the active user and IP bans, or every ban when the history is requested.
func AdminBansGET(ctx *middlewares.AutheliaCtx) {
	limit, page := adminQueryPage(ctx)

	if string(ctx.QueryArgs().Peek("history")) == "true" {
		provider := adminStorage(ctx)
		if provider == nil {
			adminReplyError(ctx, fasthttp.StatusNotImplemented, nil, "The configured storage backend does not support the ban history.")

			return
		}

		users, err := provider.LoadBannedUsersHistory(ctx, limit)
		if err != nil {
			adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to load the user bans.")

			return
		}

		ips, err := provider.LoadBannedIPsHistory(ctx, limit)
		if err != nil {
			adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to load the IP bans.")

			return
		}

		adminReplyJSON(ctx, adminBansBody{Users: newAdminBanBodiesUser(users), IPs: newAdminBanBodiesIP(ips)})

		return
	}

	users, err := ctx.Providers.StorageProvider.LoadBannedUsers(ctx, limit, page)
	if err != nil && !errors.Is(err, storage.ErrNoCurrentBans) {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to load the user bans.")

		return
	}

	ips, err := ctx.Providers.StorageProvider.LoadBannedIPs(ctx, limit, page)
	if err != nil && !errors.Is(err, storage.ErrNoCurrentBans) {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to load the IP bans.")

		return
	}

	adminReplyJSON(ctx, adminBansBody{Users: newAdminBanBodiesUser(users), IPs: newAdminBanBodiesIP(ips)})
}

// AdminUserBanPOST bans a user.
func AdminUserBanPOST(ctx *middlewares.AutheliaCtx) {
	username := adminPathValue(ctx, "username")

	if userSession, err := ctx.GetSession(); err == nil && userSession.Username == username {
		adminReplyError(ctx, fasthttp.StatusBadRequest, nil, "You can't ban yourself.")

		return
	}

	body := adminBanRequestBody{}

	if err := ctx.ParseBody(&body); err != nil || body.Duration < 0 {
		adminReplyError(ctx, fasthttp.StatusBadRequest, err, "The request body is invalid.")

		return
	}

	now := ctx.GetClock().Now()

	ban := &model.BannedUser{
		Time:     now,
		Username: username,
		Source:   adminBanSource,
	}

	if body.Duration > 0 {
		ban.Expires = sql.NullTime{Valid: true, Time: now.Add(time.Duration(body.Duration) * time.Second)}
	}

	if reason := strings.TrimSpace(body.Reason); reason != "" {
		ban.Reason = sql.NullString{Valid: true, String: reason}
	}

	if err := ctx.Providers.StorageProvider.SaveBannedUser(ctx, ban); err != nil {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to ban the user.")

		return
	}

	adminAudit(ctx, "user.ban").WithFields(map[string]any{"target": username, "duration": body.Duration}).Warn("Administrator banned a user")

	ctx.ReplyOK()
}

// AdminBanIPPOST bans an IP address.
func AdminBanIPPOST(ctx *middlewares.AutheliaCtx) {
	body := adminBanIPRequestBody{}

	if err := ctx.ParseBody(&body); err != nil || body.Duration < 0 {
		adminReplyError(ctx, fasthttp.StatusBadRequest, err, "The request body is invalid.")

		return
	}

	ip := net.ParseIP(strings.TrimSpace(body.IP))
	if ip == nil {
		adminReplyError(ctx, fasthttp.StatusBadRequest, nil, "The IP address is invalid.")

		return
	}

	if ip.Equal(ctx.RemoteIP()) {
		adminReplyError(ctx, fasthttp.StatusBadRequest, nil, "You can't ban your own IP address.")

		return
	}

	now := ctx.GetClock().Now()

	ban := &model.BannedIP{
		Time:   now,
		IP:     model.NewIP(ip),
		Source: adminBanSource,
	}

	if body.Duration > 0 {
		ban.Expires = sql.NullTime{Valid: true, Time: now.Add(time.Duration(body.Duration) * time.Second)}
	}

	if reason := strings.TrimSpace(body.Reason); reason != "" {
		ban.Reason = sql.NullString{Valid: true, String: reason}
	}

	if err := ctx.Providers.StorageProvider.SaveBannedIP(ctx, ban); err != nil {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to ban the IP address.")

		return
	}

	adminAudit(ctx, "ip.ban").WithFields(map[string]any{"target": ip.String(), "duration": body.Duration}).Warn("Administrator banned an IP address")

	ctx.ReplyOK()
}

// AdminBanUserDELETE revokes a user ban.
func AdminBanUserDELETE(ctx *middlewares.AutheliaCtx) {
	id, err := strconv.Atoi(adminPathValue(ctx, "id"))
	if err != nil {
		adminReplyError(ctx, fasthttp.StatusBadRequest, err, "The ban id is invalid.")

		return
	}

	if err = ctx.Providers.StorageProvider.RevokeBannedUser(ctx, id, ctx.GetClock().Now()); err != nil {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to revoke the ban.")

		return
	}

	adminAudit(ctx, "ban.user.revoke").WithField("ban", id).Info("Administrator revoked a user ban")

	ctx.ReplyOK()
}

// AdminBanIPDELETE revokes an IP ban.
func AdminBanIPDELETE(ctx *middlewares.AutheliaCtx) {
	id, err := strconv.Atoi(adminPathValue(ctx, "id"))
	if err != nil {
		adminReplyError(ctx, fasthttp.StatusBadRequest, err, "The ban id is invalid.")

		return
	}

	if err = ctx.Providers.StorageProvider.RevokeBannedIP(ctx, id, ctx.GetClock().Now()); err != nil {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to revoke the ban.")

		return
	}

	adminAudit(ctx, "ban.ip.revoke").WithField("ban", id).Info("Administrator revoked an IP ban")

	ctx.ReplyOK()
}

// AdminConsentsGET returns the remembered OpenID Connect consents.
func AdminConsentsGET(ctx *middlewares.AutheliaCtx) {
	provider := adminStorage(ctx)
	if provider == nil {
		adminReplyError(ctx, fasthttp.StatusNotImplemented, nil, "The configured storage backend does not support listing consents.")

		return
	}

	limit, page := adminQueryPage(ctx)

	consents, err := provider.LoadOAuth2ConsentPreConfigurationsAdmin(ctx, string(ctx.QueryArgs().Peek("username")), limit, page)
	if err != nil {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to load the consents.")

		return
	}

	body := make([]adminConsentBody, 0, len(consents))

	for _, c := range consents {
		consent := adminConsentBody{
			ID:        c.ID,
			ClientID:  c.ClientID,
			Username:  c.Username,
			CreatedAt: c.CreatedAt,
			Scopes:    c.Scopes,
			Audience:  c.Audience,
		}

		if c.ExpiresAt.Valid {
			consent.ExpiresAt = &c.ExpiresAt.Time
		}

		body = append(body, consent)
	}

	adminReplyJSON(ctx, body)
}

// AdminConsentDELETE revokes a remembered OpenID Connect consent.
func AdminConsentDELETE(ctx *middlewares.AutheliaCtx) {
	provider := adminStorage(ctx)
	if provider == nil {
		adminReplyError(ctx, fasthttp.StatusNotImplemented, nil, "The configured storage backend does not support revoking consents.")

		return
	}

	id, err := strconv.ParseInt(adminPathValue(ctx, "id"), 10, 64)
	if err != nil {
		adminReplyError(ctx, fasthttp.StatusBadRequest, err, "The consent id is invalid.")

		return
	}

	if err = provider.RevokeOAuth2ConsentPreConfiguration(ctx, id); err != nil {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to revoke the consent.")

		return
	}

	adminAudit(ctx, "consent.revoke").WithField("consent", id).Info("Administrator revoked an OpenID Connect consent")

	ctx.ReplyOK()
}
