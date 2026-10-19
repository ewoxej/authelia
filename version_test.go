// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package authelia

import (
	"regexp"
	"testing"
)

func TestForkVersion(t *testing.T) {
	if version := ForkVersion(); !regexp.MustCompile(`^\d+\.\d+\.\d+$`).MatchString(version) {
		t.Fatalf("expected a semantic version in the VERSION file, got %q", version)
	}
}

func TestUpstreamVersion(t *testing.T) {
	if !regexp.MustCompile(`^v\d+\.\d+\.\d+$`).MatchString(UpstreamVersion) {
		t.Fatalf("expected an Authelia release tag, got %q", UpstreamVersion)
	}
}
