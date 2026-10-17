// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package validator

import (
	"strings"

	"github.com/authelia/authelia/v4/internal/configuration/schema"
)

// ValidateAdministration validates and updates the Administration configuration.
func ValidateAdministration(config *schema.Configuration, _ *schema.StructValidator) {
	config.Administration.AdminGroup = strings.TrimSpace(config.Administration.AdminGroup)

	if config.Administration.AdminGroup == "" {
		config.Administration.AdminGroup = schema.DefaultAdministrationConfiguration.AdminGroup
	}
}
