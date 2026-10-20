// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package validator

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/authelia/authelia/v4/internal/configuration/schema"
)

// ValidateAdministration validates and updates the Administration configuration.
func ValidateAdministration(config *schema.Configuration, validator *schema.StructValidator) {
	config.Administration.AdminGroup = strings.TrimSpace(config.Administration.AdminGroup)

	if config.Administration.AdminGroup == "" {
		config.Administration.AdminGroup = schema.DefaultAdministrationConfiguration.AdminGroup
	}

	validateAdministrationEndpoint(config, validator)

	for _, root := range config.Administration.FileRoots {
		if !filepath.IsAbs(root) {
			validator.Push(fmt.Errorf("administration: file_roots: option '%s' must be an absolute path", root))
		}
	}
}

func validateAdministrationEndpoint(config *schema.Configuration, validator *schema.StructValidator) {
	endpoint := config.Administration.Endpoint
	if endpoint == nil {
		return
	}

	if (endpoint.Scheme != "https" && endpoint.Scheme != "http") || endpoint.Hostname() == "" {
		validator.Push(fmt.Errorf("administration: endpoint: option '%s' must be an absolute URL with the http or https scheme", endpoint))

		return
	}

	if endpoint.Path != "" && endpoint.Path != "/" {
		validator.Push(fmt.Errorf("administration: endpoint: option '%s' must not have a path as only its host is used", endpoint))
	}

	host := strings.ToLower(endpoint.Hostname())

	for _, cookie := range config.Session.Cookies {
		domain := strings.ToLower(strings.TrimPrefix(cookie.Domain, "."))

		if host == domain || strings.HasSuffix(host, "."+domain) {
			return
		}
	}

	if len(config.Session.Cookies) != 0 {
		validator.Push(fmt.Errorf("administration: endpoint: option '%s' must be on the domain of one of the session cookies so the session is available on it", endpoint))
	}
}
