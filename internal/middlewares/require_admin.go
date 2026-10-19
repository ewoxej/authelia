// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package middlewares

import (
	"bytes"
	"mime"
	"slices"
	"time"

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

// AdminConfirmationExpires returns when the second factor confirmation of the user session stops granting access to the
// administration API. The confirmation is the most recent second factor authentication and lasts for the elevation
// lifespan.
func AdminConfirmationExpires(ctx *AutheliaCtx, userSession *session.UserSession) time.Time {
	if userSession.SecondFactorAuthnTimestamp == 0 {
		return time.Unix(0, 0).UTC()
	}

	return userSession.GetSecondFactorAuthn().Add(ctx.Configuration.IdentityValidation.ElevatedSession.ElevationLifespan)
}

// RequireAdminConfirmed requires the user to have confirmed their second factor recently. It's used after RequireAdmin
// in place of the one-time code elevation.
func RequireAdminConfirmed(next RequestHandler) RequestHandler {
	return func(ctx *AutheliaCtx) {
		userSession, err := ctx.GetSession()
		if err != nil {
			ctx.Logger.WithError(err).Error("Error occurred retrieving the user session during an administrator confirmation check")

			ctx.ReplyForbidden()

			return
		}

		if ctx.GetClock().Now().Before(AdminConfirmationExpires(ctx, &userSession)) {
			next(ctx)

			return
		}

		ctx.Logger.WithFields(map[string]any{"username": userSession.Username}).Debug("Access to the administration API requires the second factor to be confirmed")

		if err = ctx.ReplyJSON(OKResponse{Status: "KO", Data: ElevatedForbiddenResponse{SecondFactor: true}}, fasthttp.StatusForbidden); err != nil {
			ctx.Logger.WithError(err).Error("Error occurred encoding JSON response during an administrator confirmation check")
		}
	}
}

// RequireAdminSameOrigin protects the administration API against cross-site request forgery. The session cookie is also
// sent by pages on other subdomains of the cookie domain since they're the same site, so requests which change something
// have to come from the same origin as the portal, and requests with a body have to be JSON, which a page on another
// origin can't send without a CORS preflight that the administration API never allows.
func RequireAdminSameOrigin(next RequestHandler) RequestHandler {
	return func(ctx *AutheliaCtx) {
		if ctx.IsGet() || ctx.IsHead() || ctx.IsOptions() {
			next(ctx)

			return
		}

		if !isAdminSameOrigin(ctx) {
			ctx.Logger.WithFields(map[string]any{"method": string(ctx.Method()), "origin": string(ctx.Request.Header.PeekBytes(headerOrigin)), "site": string(ctx.Request.Header.PeekBytes(headerSecFetchSite))}).Warn("Request to the administration API was rejected as it didn't come from the same origin")

			ctx.SetStatusCode(fasthttp.StatusForbidden)
			ctx.SetJSONError("Requests to the administration API have to come from the same origin.")

			return
		}

		if (ctx.IsPost() || ctx.IsPut() || ctx.IsPatch()) && !isContentTypeJSON(ctx.Request.Header.ContentType()) {
			ctx.SetStatusCode(fasthttp.StatusUnsupportedMediaType)
			ctx.SetJSONError("Requests to the administration API have to be JSON.")

			return
		}

		next(ctx)
	}
}

// isAdminSameOrigin uses the Sec-Fetch-Site header when the browser sends it, and otherwise compares the Origin header
// with the origin of the request. Requests without either header don't come from a browser, which always sends one of
// them with these methods, so they can't be forged by another page.
func isAdminSameOrigin(ctx *AutheliaCtx) bool {
	if site := ctx.Request.Header.PeekBytes(headerSecFetchSite); len(site) != 0 {
		return bytes.Equal(site, secFetchSiteSameOrigin)
	}

	origin := ctx.Request.Header.PeekBytes(headerOrigin)
	if len(origin) == 0 {
		return true
	}

	expected := make([]byte, 0, len(origin))
	expected = append(expected, ctx.XForwardedProto()...)
	expected = append(expected, "://"...)
	expected = append(expected, ctx.GetXForwardedHost()...)

	return bytes.EqualFold(origin, expected)
}

func isContentTypeJSON(value []byte) bool {
	mediaType, _, err := mime.ParseMediaType(string(value))

	return err == nil && mediaType == "application/json"
}
