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
