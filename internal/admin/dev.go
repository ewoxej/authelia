// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package admin

import (
	"fmt"
	"net"
	"os"

	"github.com/authelia/authelia/v4/internal/configuration/schema"
	"github.com/authelia/authelia/v4/internal/utils"
)

// EnvDevNoAuth is the environment variable which disables the authentication of the administration API in development
// builds so the web UI can be developed without signing in.
const EnvDevNoAuth = "X_AUTHELIA_ADMIN_DEV_NO_AUTH"

// DevNoAuth returns true if the authentication of the administration API is disabled. This requires a development build
// (the 'dev' build tag), the EnvDevNoAuth environment variable set to 'true', and the server to only listen on a
// loopback address. Release builds never disable the authentication.
func DevNoAuth(config *schema.Configuration) (enabled bool, err error) {
	return devNoAuth(utils.Dev, os.Getenv(EnvDevNoAuth), config)
}

func devNoAuth(dev bool, env string, config *schema.Configuration) (enabled bool, err error) {
	if env != "true" {
		return false, nil
	}

	if !dev {
		return false, fmt.Errorf("the environment variable '%s' is ignored as this isn't a development build", EnvDevNoAuth)
	}

	if config == nil || config.Server.Address == nil || !config.Server.Address.IsTCP() {
		return false, fmt.Errorf("the environment variable '%s' is ignored as the server address isn't a TCP loopback address", EnvDevNoAuth)
	}

	ip := net.ParseIP(config.Server.Address.Hostname())
	if ip == nil || !ip.IsLoopback() {
		return false, fmt.Errorf("the environment variable '%s' is ignored as the server address '%s' isn't a loopback address", EnvDevNoAuth, config.Server.Address.Hostname())
	}

	return true, nil
}
