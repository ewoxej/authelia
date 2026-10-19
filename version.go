// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

// Package authelia holds information about this fork of Authelia.
package authelia

import (
	_ "embed"
	"strings"
)

// UpstreamVersion is the Authelia release this fork is based on. A local build has no release information, so the
// version is shown as this instead of the one from the build. Update it when merging a newer release.
const UpstreamVersion = "v4.39.28"

//go:embed VERSION
var forkVersion string

// ForkVersion returns the version of this fork from the VERSION file.
func ForkVersion() string {
	return strings.TrimSpace(forkVersion)
}
