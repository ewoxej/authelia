// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package middlewares

import (
	"slices"

	"github.com/valyala/fasthttp"

	"github.com/authelia/authelia/v4/internal/authentication"
	"github.com/authelia/authelia/v4/internal/session"
)

// IsAdministrator returns true if the administration UI is enabled and the user session belongs to an administrator.
func IsAdministrator(ctx *AutheliaCtx, userSession *session.UserSession) bool {
	if !ctx.Configuration.Administration.Enabled || userSession == nil || userSession.IsAnonymous() {
		return false
	}

	return slices.Contains(userSession.Groups, ctx.Configuration.Administration.AdminGroup)
}

// RequireAdmin requires the administration UI to be enabled and the user to be a member of the administrator group who
// has completed two-factor authentication.
func RequireAdmin(next RequestHandler) RequestHandler {
	return func(ctx *AutheliaCtx) {
		if !ctx.Configuration.Administration.Enabled {
			ctx.SetStatusCode(fasthttp.StatusNotFound)
			ctx.SetJSONError(fasthttp.StatusMessage(fasthttp.StatusNotFound))

			return
		}

		userSession, err := ctx.GetSession()
		if err != nil {
			ctx.Logger.WithError(err).Error("Error occurred retrieving the user session during an administrator check")

			ctx.ReplyForbidden()

			return
		}

		if userSession.AuthenticationLevel(ctx.Configuration.WebAuthn.EnablePasskey2FA) < authentication.TwoFactor {
			ctx.Logger.WithFields(map[string]any{"username": userSession.Username}).Debug("Access to the administration API was denied as the user has not completed two-factor authentication")

			ctx.SetStatusCode(fasthttp.StatusForbidden)
			ctx.SetJSONError("Two-factor authentication is required to access the administration area.")

			return
		}

		if !IsAdministrator(ctx, &userSession) {
			ctx.Logger.WithFields(map[string]any{"username": userSession.Username, "group": ctx.Configuration.Administration.AdminGroup}).Warn("Access to the administration API was denied as the user is not a member of the administrator group")

			ctx.SetStatusCode(fasthttp.StatusForbidden)
			ctx.SetJSONError("You are not an administrator.")

			return
		}

		next(ctx)
	}
}
