// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

// Package authelia holds information about this fork of Authelia.
package authelia

import (
	_ "embed"
	"strings"
)

//go:embed VERSION
var forkVersion string

// ForkVersion returns the version of this fork from the VERSION file.
func ForkVersion() string {
	return strings.TrimSpace(forkVersion)
}
