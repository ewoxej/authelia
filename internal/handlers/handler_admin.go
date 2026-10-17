// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package handlers

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/valyala/fasthttp"

	authelia "github.com/authelia/authelia/v4"
	"github.com/authelia/authelia/v4/internal/admin"
	"github.com/authelia/authelia/v4/internal/authentication"
	"github.com/authelia/authelia/v4/internal/middlewares"
	"github.com/authelia/authelia/v4/internal/storage"
	"github.com/authelia/authelia/v4/internal/utils"
)

// adminRequestRestart is a variable so it can be replaced in tests.
var adminRequestRestart = admin.RequestRestart

const (
	adminDefaultPageLimit = 50
	adminMaximumPageLimit = 500
)

// AdminOverviewGET returns general information used by the administration UI.
func AdminOverviewGET(ctx *middlewares.AutheliaCtx) {
	body := adminOverviewBody{
		Version:          utils.Version(),
		ForkVersion:      authelia.ForkVersion(),
		AdminGroup:       ctx.Configuration.Administration.AdminGroup,
		RestartEnabled:   !ctx.Configuration.Administration.DisableRestart,
		UsersManageable:  adminUserManager(ctx) != nil,
		StorageSupported: adminStorage(ctx) != nil,
	}

	switch {
	case ctx.Configuration.AuthenticationBackend.File != nil:
		body.AuthenticationBackend = "file"
	case ctx.Configuration.AuthenticationBackend.LDAP != nil:
		body.AuthenticationBackend = "ldap"
	}

	body.Host = adminHost(&ctx.Configuration)
	body.Components = newAdminComponents(&ctx.Configuration)
	body.Regulation = adminRegulationBody{
		Modes:      ctx.Configuration.Regulation.Modes,
		MaxRetries: ctx.Configuration.Regulation.MaxRetries,
		FindTime:   int64(ctx.Configuration.Regulation.FindTime.Seconds()),
		BanTime:    int64(ctx.Configuration.Regulation.BanTime.Seconds()),
	}

	if userSession, err := ctx.GetSession(); err == nil && !userSession.IsAnonymous() {
		body.Username, body.DisplayName = userSession.Username, userSession.DisplayName
	}

	if m := ctx.Providers.AdminConfiguration; m != nil {
		body.ConfigurationFilters = m.FilterNames()

		if files, err := m.Files(); err == nil {
			body.ConfigurationFiles = files
		} else {
			ctx.Logger.WithError(err).Error("Error occurred listing the configuration files")
		}
	}

	adminReplyJSON(ctx, body)
}

// AdminRestartPOST requests a graceful restart of Authelia.
func AdminRestartPOST(ctx *middlewares.AutheliaCtx) {
	if ctx.Configuration.Administration.DisableRestart {
		adminReplyError(ctx, fasthttp.StatusForbidden, nil, "Restarting from the administration area is disabled.")

		return
	}

	adminAudit(ctx, "restart").Warn("Administrator requested a restart of Authelia")

	ctx.ReplyOK()

	// Give the response a moment to be flushed to the client before the server shuts down.
	time.AfterFunc(time.Second, adminRequestRestart)
}

// AdminUsersGET returns the list of users.
func AdminUsersGET(ctx *middlewares.AutheliaCtx) {
	manager := adminUserManager(ctx)
	if manager == nil {
		adminReplyError(ctx, fasthttp.StatusNotImplemented, nil, "The configured authentication backend does not support listing users.")

		return
	}

	users, err := manager.ListUsers()
	if err != nil {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to list the users.")

		return
	}

	banned := map[string]bool{}

	if bans, err := ctx.Providers.StorageProvider.LoadBannedUsers(ctx, adminMaximumPageLimit, 0); err == nil {
		for _, ban := range bans {
			banned[ban.Username] = true
		}
	}

	provider := adminStorage(ctx)
	items := make([]adminUserListItem, 0, len(users))

	for _, user := range users {
		item := adminUserListItem{UserManagementDetails: user, Banned: banned[user.Username]}

		if info, err := ctx.Providers.StorageProvider.LoadUserInfo(ctx, user.Username); err == nil {
			item.SecondFactor = adminUserSecondFactorSummary{Method: info.Method, HasTOTP: info.HasTOTP, HasWebAuthn: info.HasWebAuthn, HasDuo: info.HasDuo}
		}

		if provider != nil {
			if last, err := provider.LoadLastSuccessfulAuthentication(ctx, user.Username); err == nil {
				item.LastSignIn = last
			}
		}

		items = append(items, item)
	}

	adminReplyJSON(ctx, items)
}

// AdminUserGET returns the details of a single user including second factor information.
func AdminUserGET(ctx *middlewares.AutheliaCtx) {
	username := adminPathValue(ctx, "username")

	body := adminUserBody{}

	if manager := adminUserManager(ctx); manager != nil {
		user, err := manager.GetUser(username)

		switch {
		case errors.Is(err, authentication.ErrUserNotFound):
			adminReplyError(ctx, fasthttp.StatusNotFound, nil, "The user does not exist.")

			return
		case err != nil:
			adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to load the user.")

			return
		}

		body.User = *user
	} else {
		details, err := ctx.Providers.UserProvider.GetDetailsExtended(username)
		if err != nil {
			adminReplyError(ctx, fasthttp.StatusNotFound, err, "The user does not exist.")

			return
		}

		body.User = authentication.UserManagementDetails{
			Username:    details.Username,
			DisplayName: details.DisplayName,
			Groups:      details.Groups,
			GivenName:   details.GivenName,
			FamilyName:  details.FamilyName,
			MiddleName:  details.MiddleName,
			Nickname:    details.Nickname,
			PhoneNumber: details.PhoneNumber,
		}

		if len(details.Emails) != 0 {
			body.User.Email = details.Emails[0]
		}

		body.ReadOnly = true
	}

	var err error

	if body.SecondFactor, err = adminLoadSecondFactor(ctx, username); err != nil {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to load the second factor information of the user.")

		return
	}

	if bans, err := ctx.Providers.StorageProvider.LoadBannedUser(ctx, username); err == nil {
		body.Bans = newAdminBanBodiesUser(bans)
	} else if !errors.Is(err, storage.ErrNoCurrentBans) {
		ctx.Logger.WithError(err).WithField("username", username).Error("Error occurred loading the bans of the user")
	}

	if body.Bans == nil {
		body.Bans = []adminBanBody{}
	}

	adminReplyJSON(ctx, body)
}

// AdminUserPOST creates a user.
func AdminUserPOST(ctx *middlewares.AutheliaCtx) {
	manager := adminUserManager(ctx)
	if manager == nil {
		adminReplyError(ctx, fasthttp.StatusNotImplemented, nil, "The configured authentication backend does not support creating users.")

		return
	}

	body := adminUserCreateRequestBody{}

	if err := ctx.ParseBody(&body); err != nil {
		adminReplyError(ctx, fasthttp.StatusBadRequest, err, "The request body is invalid.")

		return
	}

	if err := ctx.Providers.PasswordPolicy.Check(body.Password); err != nil {
		adminReplyError(ctx, fasthttp.StatusBadRequest, nil, "The password does not meet the password policy.")

		return
	}

	if err := manager.CreateUser(body.UserManagementDetails, body.Password); err != nil {
		if errors.Is(err, authentication.ErrUserExists) {
			adminReplyError(ctx, fasthttp.StatusConflict, nil, "A user with this username already exists.")

			return
		}

		adminReplyError(ctx, fasthttp.StatusBadRequest, err, err.Error())

		return
	}

	adminAudit(ctx, "user.create").WithField("target", body.Username).Info("Administrator created a user")

	ctx.ReplyOK()
}

// AdminUserPUT updates a user.
func AdminUserPUT(ctx *middlewares.AutheliaCtx) {
	manager := adminUserManager(ctx)
	if manager == nil {
		adminReplyError(ctx, fasthttp.StatusNotImplemented, nil, "The configured authentication backend does not support updating users.")

		return
	}

	body := authentication.UserManagementDetails{}

	if err := ctx.ParseBody(&body); err != nil {
		adminReplyError(ctx, fasthttp.StatusBadRequest, err, "The request body is invalid.")

		return
	}

	body.Username = adminPathValue(ctx, "username")

	if err := adminCheckSelfLockout(ctx, body.Username, body.Disabled, body.Groups); err != nil {
		adminReplyError(ctx, fasthttp.StatusBadRequest, nil, err.Error())

		return
	}

	if err := manager.UpdateUser(body); err != nil {
		if errors.Is(err, authentication.ErrUserNotFound) {
			adminReplyError(ctx, fasthttp.StatusNotFound, nil, "The user does not exist.")

			return
		}

		adminReplyError(ctx, fasthttp.StatusBadRequest, err, err.Error())

		return
	}

	adminAudit(ctx, "user.update").WithField("target", body.Username).Info("Administrator updated a user")

	ctx.ReplyOK()
}

// AdminUserDELETE deletes a user.
func AdminUserDELETE(ctx *middlewares.AutheliaCtx) {
	manager := adminUserManager(ctx)
	if manager == nil {
		adminReplyError(ctx, fasthttp.StatusNotImplemented, nil, "The configured authentication backend does not support deleting users.")

		return
	}

	username := adminPathValue(ctx, "username")

	if userSession, err := ctx.GetSession(); err == nil && userSession.Username == username {
		adminReplyError(ctx, fasthttp.StatusBadRequest, nil, "You can't delete your own account.")

		return
	}

	if err := manager.DeleteUser(username); err != nil {
		if errors.Is(err, authentication.ErrUserNotFound) {
			adminReplyError(ctx, fasthttp.StatusNotFound, nil, "The user does not exist.")

			return
		}

		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to delete the user.")

		return
	}

	adminAudit(ctx, "user.delete").WithField("target", username).Warn("Administrator deleted a user")

	ctx.ReplyOK()
}

// AdminUserPasswordPOST sets the password of a user.
func AdminUserPasswordPOST(ctx *middlewares.AutheliaCtx) {
	manager := adminUserManager(ctx)
	if manager == nil {
		adminReplyError(ctx, fasthttp.StatusNotImplemented, nil, "The configured authentication backend does not support setting passwords.")

		return
	}

	body := adminUserPasswordRequestBody{}

	if err := ctx.ParseBody(&body); err != nil {
		adminReplyError(ctx, fasthttp.StatusBadRequest, err, "The request body is invalid.")

		return
	}

	if err := ctx.Providers.PasswordPolicy.Check(body.Password); err != nil {
		adminReplyError(ctx, fasthttp.StatusBadRequest, nil, "The password does not meet the password policy.")

		return
	}

	username := adminPathValue(ctx, "username")

	if err := manager.SetUserPassword(username, body.Password); err != nil {
		if errors.Is(err, authentication.ErrUserNotFound) {
			adminReplyError(ctx, fasthttp.StatusNotFound, nil, "The user does not exist.")

			return
		}

		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to set the password.")

		return
	}

	adminAudit(ctx, "user.password").WithField("target", username).Info("Administrator set the password of a user")

	ctx.ReplyOK()
}

// AdminUserTOTPDELETE removes the TOTP configuration of a user.
func AdminUserTOTPDELETE(ctx *middlewares.AutheliaCtx) {
	username := adminPathValue(ctx, "username")

	if err := ctx.Providers.StorageProvider.DeleteTOTPConfiguration(ctx, username); err != nil {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to delete the one-time password configuration.")

		return
	}

	adminAudit(ctx, "user.totp.delete").WithField("target", username).Info("Administrator removed the TOTP configuration of a user")

	ctx.ReplyOK()
}

// AdminUserWebAuthnDELETE removes a WebAuthn credential of a user.
func AdminUserWebAuthnDELETE(ctx *middlewares.AutheliaCtx) {
	username := adminPathValue(ctx, "username")

	id, err := strconv.Atoi(adminPathValue(ctx, "id"))
	if err != nil {
		adminReplyError(ctx, fasthttp.StatusBadRequest, err, "The credential id is invalid.")

		return
	}

	credential, err := ctx.Providers.StorageProvider.LoadWebAuthnCredentialByID(ctx, id)
	if err != nil || credential == nil || credential.Username != username {
		adminReplyError(ctx, fasthttp.StatusNotFound, err, "The credential does not exist.")

		return
	}

	if err = ctx.Providers.StorageProvider.DeleteWebAuthnCredential(ctx, credential.KID.String()); err != nil {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to delete the credential.")

		return
	}

	adminAudit(ctx, "user.webauthn.delete").WithFields(map[string]any{"target": username, "credential": id}).Info("Administrator removed a WebAuthn credential of a user")

	ctx.ReplyOK()
}

// AdminUserDuoDELETE removes the preferred Duo device of a user.
func AdminUserDuoDELETE(ctx *middlewares.AutheliaCtx) {
	username := adminPathValue(ctx, "username")

	if err := ctx.Providers.StorageProvider.DeletePreferredDuoDevice(ctx, username); err != nil {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to delete the Duo device.")

		return
	}

	adminAudit(ctx, "user.duo.delete").WithField("target", username).Info("Administrator removed the Duo device of a user")

	ctx.ReplyOK()
}

func adminCheckSelfLockout(ctx *middlewares.AutheliaCtx, username string, disabled bool, groups []string) error {
	userSession, err := ctx.GetSession()
	if err != nil || userSession.Username != username {
		return nil
	}

	if disabled {
		return fmt.Errorf("you can't disable your own account")
	}

	for _, group := range groups {
		if group == ctx.Configuration.Administration.AdminGroup {
			return nil
		}
	}

	return fmt.Errorf("you can't remove yourself from the '%s' group", ctx.Configuration.Administration.AdminGroup)
}

func adminUserManager(ctx *middlewares.AutheliaCtx) authentication.UserManagementProvider {
	if manager, ok := ctx.Providers.UserProvider.(authentication.UserManagementProvider); ok {
		return manager
	}

	return nil
}

func adminStorage(ctx *middlewares.AutheliaCtx) storage.AdminProvider {
	if provider, ok := ctx.Providers.StorageProvider.(storage.AdminProvider); ok {
		return provider
	}

	return nil
}

func adminLoadSecondFactor(ctx *middlewares.AutheliaCtx, username string) (body adminSecondFactorBody, err error) {
	info, err := ctx.Providers.StorageProvider.LoadUserInfo(ctx, username)
	if err != nil {
		return body, err
	}

	body.PreferredMethod = info.Method
	body.WebAuthn = []adminWebAuthnCredentialBody{}

	if info.HasTOTP {
		if config, err := ctx.Providers.StorageProvider.LoadTOTPConfiguration(ctx, username); err == nil {
			body.TOTP = &adminTOTPBody{
				CreatedAt: config.CreatedAt,
				Issuer:    config.Issuer,
				Algorithm: config.Algorithm,
				Digits:    config.Digits,
				Period:    config.Period,
			}

			if config.LastUsedAt.Valid {
				body.TOTP.LastUsedAt = &config.LastUsedAt.Time
			}
		} else if !errors.Is(err, storage.ErrNoTOTPConfiguration) {
			return body, err
		}
	}

	credentials, err := ctx.Providers.StorageProvider.LoadWebAuthnCredentialsByUsername(ctx, "", username)
	if err != nil && !errors.Is(err, storage.ErrNoWebAuthnCredential) {
		return body, err
	}

	for _, c := range credentials {
		credential := adminWebAuthnCredentialBody{
			ID:           c.ID,
			CreatedAt:    c.CreatedAt,
			RPID:         c.RPID,
			Description:  c.Description,
			Discoverable: c.Discoverable,
			CloneWarning: c.CloneWarning,
		}

		if c.LastUsedAt.Valid {
			credential.LastUsedAt = &c.LastUsedAt.Time
		}

		body.WebAuthn = append(body.WebAuthn, credential)
	}

	if info.HasDuo {
		if device, err := ctx.Providers.StorageProvider.LoadPreferredDuoDevice(ctx, username); err == nil {
			body.Duo = &adminDuoBody{Device: device.Device, Method: device.Method}
		} else if !errors.Is(err, storage.ErrNoDuoDevice) {
			return body, err
		}
	}

	return body, nil
}

func adminPathValue(ctx *middlewares.AutheliaCtx, name string) string {
	if value, ok := ctx.UserValue(name).(string); ok {
		return value
	}

	return ""
}

func adminQueryPage(ctx *middlewares.AutheliaCtx) (limit, page int) {
	limit, page = adminDefaultPageLimit, 0

	if v, err := strconv.Atoi(string(ctx.QueryArgs().Peek("limit"))); err == nil && v > 0 {
		limit = min(v, adminMaximumPageLimit)
	}

	if v, err := strconv.Atoi(string(ctx.QueryArgs().Peek("page"))); err == nil && v > 0 {
		page = v
	}

	return limit, page
}

func adminReplyJSON(ctx *middlewares.AutheliaCtx, body any) {
	if err := ctx.SetJSONBody(body); err != nil {
		ctx.Logger.WithError(err).Error("Error occurred encoding the administration API response")
	}
}

func adminReplyError(ctx *middlewares.AutheliaCtx, status int, err error, message string) {
	if err != nil {
		ctx.Logger.WithError(err).WithField("path", string(ctx.Path())).Error("Error occurred handling an administration API request")
	}

	ctx.SetStatusCode(status)
	ctx.SetJSONError(message)
}

func adminAudit(ctx *middlewares.AutheliaCtx, action string) *logrus.Entry {
	fields := map[string]any{"admin_action": action, "remote_ip": ctx.RemoteIP().String()}

	if userSession, err := ctx.GetSession(); err == nil {
		fields["admin"] = userSession.Username
	}

	return ctx.Logger.WithFields(fields)
}
