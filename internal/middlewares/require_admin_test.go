// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package middlewares_test

import (
	"encoding/json"
	"net/url"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"

	"github.com/authelia/authelia/v4/internal/middlewares"
	"github.com/authelia/authelia/v4/internal/mocks"
)

func TestRequireAdminConfirmed(t *testing.T) {
	testCases := []struct {
		name     string
		ago      time.Duration
		never    bool
		expected int
	}{
		{"ShouldPassRecentSecondFactor", time.Minute * 2, false, fasthttp.StatusOK},
		{"ShouldRequireConfirmationWhenExpired", time.Minute * 11, false, fasthttp.StatusForbidden},
		{"ShouldRequireConfirmationWithoutSecondFactor", 0, true, fasthttp.StatusForbidden},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)

			defer mock.Close()

			mock.Ctx.Configuration.IdentityValidation.ElevatedSession.ElevationLifespan = time.Minute * 10
			mock.Ctx.Providers.Clock = &mock.Clock

			userSession, err := mock.Ctx.GetSession()
			require.NoError(t, err)

			userSession.Username = john
			userSession.AuthenticationMethodRefs.UsernameAndPassword = true
			userSession.AuthenticationMethodRefs.WebAuthn = true

			if !tc.never {
				userSession.SecondFactorAuthnTimestamp = mock.Clock.Now().Add(-tc.ago).Unix()
			}

			require.NoError(t, mock.Ctx.SaveSession(userSession))

			middlewares.RequireAdminConfirmed(NilHandler)(mock.Ctx)

			assert.Equal(t, tc.expected, mock.Ctx.Response.StatusCode())

			if tc.expected == fasthttp.StatusForbidden {
				data := &struct {
					Data middlewares.ElevatedForbiddenResponse `json:"data"`
				}{}

				require.NoError(t, json.Unmarshal(mock.Ctx.Response.Body(), data))

				assert.True(t, data.Data.SecondFactor)
				assert.False(t, data.Data.Elevation)
			}
		})
	}
}

func TestRequireAdminSameOrigin(t *testing.T) {
	testCases := []struct {
		name        string
		method      string
		site        string
		origin      string
		contentType string
		expected    int
	}{
		{"ShouldPassGetFromAnotherSite", fasthttp.MethodGet, "same-site", "https://app.example.com", "", fasthttp.StatusOK},
		{"ShouldPassSameOriginJSON", fasthttp.MethodPost, "same-origin", "https://auth.example.com", "application/json", fasthttp.StatusOK},
		{"ShouldPassSameOriginJSONWithCharset", fasthttp.MethodPut, "same-origin", "", "application/json; charset=utf-8", fasthttp.StatusOK},
		{"ShouldPassSameOriginDeleteWithoutBody", fasthttp.MethodDelete, "same-origin", "", "", fasthttp.StatusOK},
		{"ShouldPassMatchingOriginWithoutFetchMetadata", fasthttp.MethodPost, "", "https://auth.example.com", "application/json", fasthttp.StatusOK},
		{"ShouldPassWithoutBrowserHeaders", fasthttp.MethodPost, "", "", "application/json", fasthttp.StatusOK},
		{"ShouldRejectSameSite", fasthttp.MethodPost, "same-site", "https://app.example.com", "application/json", fasthttp.StatusForbidden},
		{"ShouldRejectCrossSite", fasthttp.MethodPost, "cross-site", "https://evil.com", "text/plain", fasthttp.StatusForbidden},
		{"ShouldRejectSameSiteDelete", fasthttp.MethodDelete, "same-site", "https://app.example.com", "", fasthttp.StatusForbidden},
		{"ShouldRejectFetchMetadataOverMatchingOrigin", fasthttp.MethodPost, "same-site", "https://auth.example.com", "application/json", fasthttp.StatusForbidden},
		{"ShouldRejectOtherOriginWithoutFetchMetadata", fasthttp.MethodPost, "", "https://app.example.com", "application/json", fasthttp.StatusForbidden},
		{"ShouldRejectOtherSchemeWithoutFetchMetadata", fasthttp.MethodPost, "", "http://auth.example.com", "application/json", fasthttp.StatusForbidden},
		{"ShouldRejectTextPlain", fasthttp.MethodPost, "same-origin", "", "text/plain", fasthttp.StatusUnsupportedMediaType},
		{"ShouldRejectForm", fasthttp.MethodPost, "same-origin", "", "application/x-www-form-urlencoded", fasthttp.StatusUnsupportedMediaType},
		{"ShouldRejectMissingContentType", fasthttp.MethodPut, "same-origin", "", "", fasthttp.StatusUnsupportedMediaType},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)

			defer mock.Close()

			mock.Ctx.Request.Header.SetMethod(tc.method)
			mock.Ctx.Request.Header.Set(fasthttp.HeaderXForwardedProto, "https")
			mock.Ctx.Request.Header.Set(fasthttp.HeaderXForwardedHost, "auth.example.com")
			mock.Ctx.Request.Header.Del(fasthttp.HeaderContentType)

			if tc.site != "" {
				mock.Ctx.Request.Header.Set("Sec-Fetch-Site", tc.site)
			}

			if tc.origin != "" {
				mock.Ctx.Request.Header.Set(fasthttp.HeaderOrigin, tc.origin)
			}

			if tc.contentType != "" {
				mock.Ctx.Request.Header.SetContentType(tc.contentType)
			}

			called := false

			middlewares.RequireAdminSameOrigin(func(ctx *middlewares.AutheliaCtx) {
				called = true
			})(mock.Ctx)

			assert.Equal(t, tc.expected == fasthttp.StatusOK, called)
			assert.Equal(t, tc.expected, mock.Ctx.Response.StatusCode())
		})
	}
}

func TestRequireAdmin(t *testing.T) {
	testCases := []struct {
		name      string
		endpoint  string
		host      string
		forwarded string
		groups    []string
		twoFactor bool
		expected  int
	}{
		{"ShouldPassAdministrator", "", "idm.example.com", "", []string{"admins"}, true, fasthttp.StatusOK},
		{"ShouldHideFromOtherUsers", "", "idm.example.com", "", []string{"dev"}, true, fasthttp.StatusNotFound},
		{"ShouldHideFromOtherUsersWithoutSecondFactor", "", "idm.example.com", "", []string{"dev"}, false, fasthttp.StatusNotFound},
		{"ShouldRequireSecondFactorFromAdministrator", "", "idm.example.com", "", []string{"admins"}, false, fasthttp.StatusForbidden},
		{"ShouldPassOnEndpoint", "https://idm-admin.example.com", "idm-admin.example.com", "", []string{"admins"}, true, fasthttp.StatusOK},
		{"ShouldPassOnEndpointWithDefaultPort", "https://idm-admin.example.com", "idm-admin.example.com:443", "", []string{"admins"}, true, fasthttp.StatusOK},
		{"ShouldHideOutsideEndpoint", "https://idm-admin.example.com", "idm.example.com", "", []string{"admins"}, true, fasthttp.StatusNotFound},
		{"ShouldHideWithOnlyForwardedHostOnEndpoint", "https://idm-admin.example.com", "idm.example.com", "idm-admin.example.com", []string{"admins"}, true, fasthttp.StatusNotFound},
		{"ShouldHideWithOnlyHostOnEndpoint", "https://idm-admin.example.com", "idm-admin.example.com", "idm.example.com", []string{"admins"}, true, fasthttp.StatusNotFound},
		{"ShouldHideOnOtherPort", "https://idm-admin.example.com:8443", "idm-admin.example.com", "", []string{"admins"}, true, fasthttp.StatusNotFound},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)

			defer mock.Close()

			mock.Ctx.Configuration.Administration.Enabled = true
			mock.Ctx.Configuration.Administration.AdminGroup = "admins"

			if tc.endpoint != "" {
				endpoint, err := url.Parse(tc.endpoint)
				require.NoError(t, err)

				mock.Ctx.Configuration.Administration.Endpoint = endpoint
			}

			// The proxy forwards the host it was asked for unless a case says otherwise.
			forwarded := tc.forwarded
			if forwarded == "" {
				forwarded = tc.host
			}

			mock.Ctx.Request.Header.SetHost(tc.host)
			mock.Ctx.Request.Header.Set(fasthttp.HeaderXForwardedHost, forwarded)

			userSession, err := mock.Ctx.GetSession()
			require.NoError(t, err)

			userSession.Username = john
			userSession.Groups = tc.groups
			userSession.AuthenticationMethodRefs.UsernameAndPassword = true
			userSession.AuthenticationMethodRefs.WebAuthn = tc.twoFactor

			require.NoError(t, mock.Ctx.SaveSession(userSession))

			middlewares.RequireAdmin(NilHandler)(mock.Ctx)

			assert.Equal(t, tc.expected, mock.Ctx.Response.StatusCode())
		})
	}
}
