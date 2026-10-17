// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package schema

// Administration represents the configuration of the administration web UI and API.
type Administration struct {
	Enabled bool `koanf:"enabled" yaml:"enabled" toml:"enabled" json:"enabled" jsonschema:"default=false,title=Enabled" jsonschema_description:"Enables the administration web UI and API."`

	AdminGroup string `koanf:"admin_group" yaml:"admin_group,omitempty" toml:"admin_group,omitempty" json:"admin_group,omitempty" jsonschema:"default=admins,title=Administrator Group" jsonschema_description:"The group whose members are allowed to use the administration web UI."`

	DisableRestart bool `koanf:"disable_restart" yaml:"disable_restart" toml:"disable_restart" json:"disable_restart" jsonschema:"default=false,title=Disable Restart" jsonschema_description:"Prevents the administration web UI from restarting Authelia after configuration changes."`
}

// DefaultAdministrationConfiguration represents the default values of the Administration configuration.
var DefaultAdministrationConfiguration = Administration{
	AdminGroup: "admins",
}
