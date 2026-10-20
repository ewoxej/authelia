// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package handlers

import (
	"database/sql"
	"time"

	"github.com/authelia/authelia/v4/internal/admin"
	"github.com/authelia/authelia/v4/internal/authentication"
	"github.com/authelia/authelia/v4/internal/model"
)

type adminSessionBody struct {
	Confirmed       bool  `json:"confirmed"`
	Expires         int64 `json:"expires"`
	FactorKnowledge bool  `json:"factor_knowledge"`
}

type adminOverviewBody struct {
	Version               string                    `json:"version"`
	ForkVersion           string                    `json:"fork_version"`
	AdminGroup            string                    `json:"admin_group"`
	AuthenticationBackend string                    `json:"authentication_backend"`
	UsersManageable       bool                      `json:"users_manageable"`
	StorageSupported      bool                      `json:"storage_supported"`
	RestartEnabled        bool                      `json:"restart_enabled"`
	ConfigurationFiles    []admin.ConfigurationFile `json:"configuration_files"`
	ConfigurationFilters  []string                  `json:"configuration_filters"`
	Host                  string                    `json:"host"`
	Theme                 string                    `json:"theme"`
	Username              string                    `json:"username"`
	DisplayName           string                    `json:"display_name"`
	Components            []adminComponentBody      `json:"components"`
	Regulation            adminRegulationBody       `json:"regulation"`
}

type adminComponentBody struct {
	Name   string `json:"name"`
	Detail string `json:"detail"`
	Status string `json:"status"`
	Label  string `json:"label"`
}

type adminRegulationBody struct {
	Modes      []string `json:"modes"`
	MaxRetries int      `json:"max_retries"`
	FindTime   int64    `json:"find_time"`
	BanTime    int64    `json:"ban_time"`
}

type adminStatsBody struct {
	Range             string             `json:"range"`
	Buckets           []adminStatsBucket `json:"buckets"`
	Total             int                `json:"total"`
	Successful        int                `json:"successful"`
	Failed            int                `json:"failed"`
	Banned            int                `json:"banned"`
	UniqueIPs         int                `json:"unique_ips"`
	SecondFactorShare int                `json:"second_factor_share"`
	UsersTotal        *int               `json:"users_total"`
	UsersDisabled     *int               `json:"users_disabled"`
	BansUsers         int                `json:"bans_users"`
	BansIPs           int                `json:"bans_ips"`
}

type adminStatsBucket struct {
	Start      time.Time `json:"start"`
	Successful int       `json:"successful"`
	Failed     int       `json:"failed"`
}

type adminUserListItem struct {
	authentication.UserManagementDetails

	SecondFactor adminUserSecondFactorSummary `json:"second_factor"`
	LastSignIn   *time.Time                   `json:"last_sign_in"`
	Banned       bool                         `json:"banned"`
}

type adminUserSecondFactorSummary struct {
	Method      string `json:"method"`
	HasTOTP     bool   `json:"has_totp"`
	HasWebAuthn bool   `json:"has_webauthn"`
	HasDuo      bool   `json:"has_duo"`
}

type adminBanIPRequestBody struct {
	IP       string `json:"ip"`
	Duration int64  `json:"duration"`
	Reason   string `json:"reason"`
}

type adminUserBody struct {
	User         authentication.UserManagementDetails `json:"user"`
	ReadOnly     bool                                 `json:"read_only"`
	SecondFactor adminSecondFactorBody                `json:"second_factor"`
	Bans         []adminBanBody                       `json:"bans"`
}

type adminUserCreateRequestBody struct {
	authentication.UserManagementDetails

	Password string `json:"password"`
}

type adminUserPasswordRequestBody struct {
	Password string `json:"password"`
}

type adminSecondFactorBody struct {
	PreferredMethod string                        `json:"preferred_method"`
	TOTP            *adminTOTPBody                `json:"totp"`
	WebAuthn        []adminWebAuthnCredentialBody `json:"webauthn"`
	Duo             *adminDuoBody                 `json:"duo"`
}

type adminTOTPBody struct {
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at"`
	Issuer     string     `json:"issuer"`
	Algorithm  string     `json:"algorithm"`
	Digits     uint32     `json:"digits"`
	Period     uint       `json:"period"`
}

type adminWebAuthnCredentialBody struct {
	ID           int        `json:"id"`
	CreatedAt    time.Time  `json:"created_at"`
	LastUsedAt   *time.Time `json:"last_used_at"`
	RPID         string     `json:"rpid"`
	Description  string     `json:"description"`
	Discoverable bool       `json:"discoverable"`
	CloneWarning bool       `json:"clone_warning"`
}

type adminDuoBody struct {
	Device string `json:"device"`
	Method string `json:"method"`
}

type adminBanBody struct {
	ID      int        `json:"id"`
	Time    time.Time  `json:"time"`
	Expires *time.Time `json:"expires"`
	Value   string     `json:"value"`
	Source  string     `json:"source"`
	Reason  string     `json:"reason"`
	Active  bool       `json:"active"`
}

type adminBansBody struct {
	Users []adminBanBody `json:"users"`
	IPs   []adminBanBody `json:"ips"`
}

type adminBanRequestBody struct {
	// Duration is the duration of the ban in seconds, 0 means the ban is permanent.
	Duration int64  `json:"duration"`
	Reason   string `json:"reason"`
}

type adminAuthenticationLogBody struct {
	ID            int       `json:"id"`
	Time          time.Time `json:"time"`
	Successful    bool      `json:"successful"`
	Banned        bool      `json:"banned"`
	Username      string    `json:"username"`
	Type          string    `json:"type"`
	RemoteIP      string    `json:"remote_ip"`
	RequestURI    string    `json:"request_uri"`
	RequestMethod string    `json:"request_method"`
}

type adminConsentBody struct {
	ID        int64      `json:"id"`
	ClientID  string     `json:"client_id"`
	Username  string     `json:"username"`
	CreatedAt time.Time  `json:"created_at"`
	ExpiresAt *time.Time `json:"expires_at"`
	Scopes    []string   `json:"scopes"`
	Audience  []string   `json:"audience"`
}

type adminConfigurationFileBody struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type adminConfigurationSectionBody struct {
	Path  string `json:"path"`
	Value any    `json:"value"`
}

type adminConfigurationSectionsBody struct {
	Path         string         `json:"path"`
	Values       map[string]any `json:"values"`
	ValidateOnly bool           `json:"validate_only"`
}

type adminConfigurationSectionsTextBody struct {
	Path         string   `json:"path"`
	Keys         []string `json:"keys"`
	Content      string   `json:"content"`
	ValidateOnly bool     `json:"validate_only"`
}

type adminConfigurationSaveBody struct {
	Saved      bool                                 `json:"saved"`
	Validation *admin.ConfigurationValidationResult `json:"validation"`
	Content    string                               `json:"content,omitempty"`

	// Pending is set when the change waits for a confirmation on the server instead of being saved.
	Pending *adminPendingChangeBody `json:"pending,omitempty"`
}

// adminPendingChangeBody is a configuration change which waits for a confirmation on the server, without its content.
type adminPendingChangeBody struct {
	ID       string     `json:"id"`
	Path     string     `json:"path"`
	Username string     `json:"username"`
	Reasons  []string   `json:"reasons"`
	Status   string     `json:"status"`
	Created  time.Time  `json:"created"`
	Expires  time.Time  `json:"expires"`
	Decided  *time.Time `json:"decided,omitempty"`

	// Command is what confirms the change on the server.
	Command string `json:"command"`
}

func newAdminPendingChangeBody(change *admin.PendingChange) *adminPendingChangeBody {
	return &adminPendingChangeBody{
		ID:       change.ID,
		Path:     change.Path,
		Username: change.Username,
		Reasons:  change.Reasons,
		Status:   change.Status,
		Created:  change.Created,
		Expires:  change.Expires,
		Decided:  change.Decided,
		Command:  "authelia admin changes apply " + change.ID,
	}
}

func newAdminBanBodiesUser(bans []model.BannedUser) (bodies []adminBanBody) {
	bodies = make([]adminBanBody, 0, len(bans))

	for _, ban := range bans {
		body := adminBanBody{ID: ban.ID, Time: ban.Time, Value: ban.Username, Source: ban.Source, Reason: ban.Reason.String, Active: adminBanActive(ban.Revoked, ban.Expired.Valid, ban.Expires)}

		if ban.Expires.Valid {
			body.Expires = &ban.Expires.Time
		}

		bodies = append(bodies, body)
	}

	return bodies
}

func newAdminBanBodiesIP(bans []model.BannedIP) (bodies []adminBanBody) {
	bodies = make([]adminBanBody, 0, len(bans))

	for _, ban := range bans {
		body := adminBanBody{ID: ban.ID, Time: ban.Time, Value: ban.IP.String(), Source: ban.Source, Reason: ban.Reason.String, Active: adminBanActive(ban.Revoked, ban.Expired.Valid, ban.Expires)}

		if ban.Expires.Valid {
			body.Expires = &ban.Expires.Time
		}

		bodies = append(bodies, body)
	}

	return bodies
}

func adminBanActive(revoked, expired bool, expires sql.NullTime) bool {
	return !revoked && !expired && (!expires.Valid || expires.Time.After(time.Now()))
}
