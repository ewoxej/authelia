// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package validator

import (
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/authelia/authelia/v4/internal/configuration/schema"
)

func TestValidateAdministrationEndpoint(t *testing.T) {
	testCases := []struct {
		name     string
		endpoint string
		err      string
	}{
		{"ShouldAllowNone", "", ""},
		{"ShouldAllowSubdomain", "https://idm-admin.example.com", ""},
		{"ShouldAllowPort", "https://idm-admin.example.com:8443/", ""},
		{"ShouldAllowCookieDomain", "https://example.com", ""},
		{"ShouldRefuseOtherDomain", "https://admin.example.org", "must be on the domain of one of the session cookies"},
		{"ShouldRefuseRelative", "idm-admin.example.com", "must be an absolute URL with the http or https scheme"},
		{"ShouldRefuseOtherScheme", "ftp://idm-admin.example.com", "must be an absolute URL with the http or https scheme"},
		{"ShouldRefusePath", "https://idm-admin.example.com/admin", "must not have a path"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			config := &schema.Configuration{}
			config.Session.Cookies = []schema.SessionCookie{{SessionCookieCommon: schema.SessionCookieCommon{}, Domain: "example.com"}}

			if tc.endpoint != "" {
				endpoint, err := url.Parse(tc.endpoint)
				require.NoError(t, err)

				config.Administration.Endpoint = endpoint
			}

			val := schema.NewStructValidator()

			ValidateAdministration(config, val)

			if tc.err == "" {
				assert.Empty(t, val.Errors())

				return
			}

			require.Len(t, val.Errors(), 1)
			assert.Contains(t, val.Errors()[0].Error(), tc.err)
		})
	}
}
