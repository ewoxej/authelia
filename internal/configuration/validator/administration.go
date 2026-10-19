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

	for _, root := range config.Administration.FileRoots {
		if !filepath.IsAbs(root) {
			validator.Push(fmt.Errorf("administration: file_roots: option '%s' must be an absolute path", root))
		}
	}
}
