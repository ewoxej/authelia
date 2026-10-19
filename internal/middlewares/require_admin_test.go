// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package middlewares_test

import (
	"encoding/json"
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
