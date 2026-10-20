// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package handlers

import (
	"errors"
	"strings"

	"github.com/valyala/fasthttp"

	"github.com/authelia/authelia/v4/internal/admin"
	"github.com/authelia/authelia/v4/internal/middlewares"
)

// AdminConfigurationFileGET returns the raw content of a configuration file.
func AdminConfigurationFileGET(ctx *middlewares.AutheliaCtx) {
	manager := adminConfigurationManager(ctx)
	if manager == nil {
		return
	}

	path := string(ctx.QueryArgs().Peek("path"))

	content, err := manager.Read(path)
	if err != nil {
		adminReplyConfigurationError(ctx, err, "Failed to read the configuration file.")

		return
	}

	adminReplyJSON(ctx, adminConfigurationFileBody{Path: path, Content: string(content)})
}

// AdminConfigurationValidatePOST validates the content of a configuration file without saving it.
func AdminConfigurationValidatePOST(ctx *middlewares.AutheliaCtx) {
	manager := adminConfigurationManager(ctx)
	if manager == nil {
		return
	}

	body := adminConfigurationFileBody{}

	if err := ctx.ParseBody(&body); err != nil {
		adminReplyError(ctx, fasthttp.StatusBadRequest, err, "The request body is invalid.")

		return
	}

	result, err := manager.Validate(body.Path, []byte(body.Content))
	if err != nil {
		adminReplyConfigurationError(ctx, err, "Failed to validate the configuration.")

		return
	}

	adminReplyJSON(ctx, result)
}

// AdminConfigurationFilePUT validates and saves the content of a configuration file.
func AdminConfigurationFilePUT(ctx *middlewares.AutheliaCtx) {
	manager := adminConfigurationManager(ctx)
	if manager == nil {
		return
	}

	body := adminConfigurationFileBody{}

	if err := ctx.ParseBody(&body); err != nil {
		adminReplyError(ctx, fasthttp.StatusBadRequest, err, "The request body is invalid.")

		return
	}

	adminSaveConfiguration(ctx, manager, body.Path, []byte(body.Content), "configuration.save")
}

// AdminConfigurationSectionGET returns a top level section of a configuration file.
func AdminConfigurationSectionGET(ctx *middlewares.AutheliaCtx) {
	manager := adminConfigurationManager(ctx)
	if manager == nil {
		return
	}

	path := string(ctx.QueryArgs().Peek("path"))

	value, err := manager.Section(path, adminPathValue(ctx, "section"))
	if err != nil {
		adminReplyConfigurationError(ctx, err, "Failed to read the configuration section.")

		return
	}

	adminReplyJSON(ctx, adminConfigurationSectionBody{Path: path, Value: value})
}

// AdminConfigurationSectionsPUT replaces top level sections of a configuration file, then validates and saves it. When
// the request only asks for validation the resulting content is validated and returned without being saved.
func AdminConfigurationSectionsPUT(ctx *middlewares.AutheliaCtx) {
	manager := adminConfigurationManager(ctx)
	if manager == nil {
		return
	}

	body := adminConfigurationSectionsBody{}

	if err := ctx.ParseBody(&body); err != nil || len(body.Values) == 0 {
		adminReplyError(ctx, fasthttp.StatusBadRequest, err, "The request body is invalid.")

		return
	}

	content, err := manager.WithSections(body.Path, body.Values)
	if err != nil {
		adminReplyConfigurationError(ctx, err, "Failed to update the configuration sections.")

		return
	}

	if body.ValidateOnly {
		result, err := manager.Validate(body.Path, content)
		if err != nil {
			adminReplyConfigurationError(ctx, err, "Failed to validate the configuration.")

			return
		}

		adminReplyJSON(ctx, adminConfigurationSaveBody{Saved: false, Validation: result, Content: string(content)})

		return
	}

	adminSaveConfiguration(ctx, manager, body.Path, content, "configuration.sections.save")
}

// AdminConfigurationSectionsTextGET returns the YAML text of top level keys of a configuration file as written.
func AdminConfigurationSectionsTextGET(ctx *middlewares.AutheliaCtx) {
	manager := adminConfigurationManager(ctx)
	if manager == nil {
		return
	}

	path := string(ctx.QueryArgs().Peek("path"))

	text, err := manager.SectionsText(path, adminQueryKeys(ctx))
	if err != nil {
		adminReplyConfigurationError(ctx, err, "Failed to read the configuration sections.")

		return
	}

	adminReplyJSON(ctx, adminConfigurationFileBody{Path: path, Content: text})
}

// AdminConfigurationSectionsTextPUT replaces the YAML text of top level keys of a configuration file, then validates and
// saves it. When the request only asks for validation the resulting content is validated and returned without being
// saved.
func AdminConfigurationSectionsTextPUT(ctx *middlewares.AutheliaCtx) {
	manager := adminConfigurationManager(ctx)
	if manager == nil {
		return
	}

	body := adminConfigurationSectionsTextBody{}

	if err := ctx.ParseBody(&body); err != nil || len(body.Keys) == 0 {
		adminReplyError(ctx, fasthttp.StatusBadRequest, err, "The request body is invalid.")

		return
	}

	content, err := manager.WithSectionsText(body.Path, body.Keys, body.Content)
	if err != nil {
		adminReplyConfigurationError(ctx, err, "Failed to update the configuration sections.")

		return
	}

	if body.ValidateOnly {
		result, err := manager.Validate(body.Path, content)
		if err != nil {
			adminReplyConfigurationError(ctx, err, "Failed to validate the configuration.")

			return
		}

		adminReplyJSON(ctx, adminConfigurationSaveBody{Saved: false, Validation: result, Content: string(content)})

		return
	}

	adminSaveConfiguration(ctx, manager, body.Path, content, "configuration.sections.text.save")
}

func adminQueryKeys(ctx *middlewares.AutheliaCtx) (keys []string) {
	for _, key := range strings.Split(string(ctx.QueryArgs().Peek("keys")), ",") {
		if key = strings.TrimSpace(key); key != "" {
			keys = append(keys, key)
		}
	}

	return keys
}

func adminSaveConfiguration(ctx *middlewares.AutheliaCtx, manager *admin.ConfigurationManager, path string, content []byte, action string) {
	var username string

	if userSession, err := ctx.GetSession(); err == nil {
		username = userSession.Username
	}

	result, pending, err := manager.Save(path, content, username)
	if err != nil {
		adminReplyConfigurationError(ctx, err, "Failed to save the configuration.")

		return
	}

	switch {
	case pending != nil:
		adminAudit(ctx, action).WithFields(map[string]any{"file": path, "change": pending.ID, "reasons": pending.Reasons}).Warn("Administrator submitted a configuration change which has to be confirmed on the server")

		adminReplyJSON(ctx, adminConfigurationSaveBody{Validation: result, Content: string(content), Pending: newAdminPendingChangeBody(pending)})
	case result.Valid:
		adminAudit(ctx, action).WithField("file", path).Warn("Administrator saved the configuration")

		fallthrough
	default:
		adminReplyJSON(ctx, adminConfigurationSaveBody{Saved: result.Valid, Validation: result, Content: string(content)})
	}
}

// AdminConfigurationPendingGET returns the configuration changes which wait for a confirmation on the server, and the
// ones decided recently.
func AdminConfigurationPendingGET(ctx *middlewares.AutheliaCtx) {
	manager := adminConfigurationManager(ctx)
	if manager == nil {
		return
	}

	changes, err := manager.PendingChanges()
	if err != nil {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to list the pending changes.")

		return
	}

	bodies := make([]*adminPendingChangeBody, 0, len(changes))

	for i := range changes {
		bodies = append(bodies, newAdminPendingChangeBody(&changes[i]))
	}

	adminReplyJSON(ctx, bodies)
}

// AdminConfigurationPendingChangeGET returns a configuration change which waits for a confirmation on the server.
func AdminConfigurationPendingChangeGET(ctx *middlewares.AutheliaCtx) {
	manager := adminConfigurationManager(ctx)
	if manager == nil {
		return
	}

	change, err := manager.PendingChange(adminPathValue(ctx, "id"))
	if err != nil {
		adminReplyPendingChangeError(ctx, err)

		return
	}

	adminReplyJSON(ctx, newAdminPendingChangeBody(change))
}

// AdminConfigurationPendingChangeDELETE withdraws a configuration change which waits for a confirmation on the server.
func AdminConfigurationPendingChangeDELETE(ctx *middlewares.AutheliaCtx) {
	manager := adminConfigurationManager(ctx)
	if manager == nil {
		return
	}

	id := adminPathValue(ctx, "id")

	if err := manager.CancelPendingChange(id); err != nil {
		adminReplyPendingChangeError(ctx, err)

		return
	}

	adminAudit(ctx, "configuration.pending.cancel").WithField("change", id).Info("Administrator cancelled a pending configuration change")

	ctx.ReplyOK()
}

// AdminEnvironmentGET returns the names of the environment variables the configuration can reference. The values are
// never returned.
func AdminEnvironmentGET(ctx *middlewares.AutheliaCtx) {
	manager := adminConfigurationManager(ctx)
	if manager == nil {
		return
	}

	variables, err := manager.EnvironmentVariables()
	if err != nil {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to list the environment variables.")

		return
	}

	adminReplyJSON(ctx, variables)
}

func adminReplyPendingChangeError(ctx *middlewares.AutheliaCtx, err error) {
	switch {
	case errors.Is(err, admin.ErrPendingChangeUnknown):
		adminReplyError(ctx, fasthttp.StatusNotFound, nil, err.Error())
	case errors.Is(err, admin.ErrPendingChangeDecided):
		adminReplyError(ctx, fasthttp.StatusConflict, nil, err.Error())
	default:
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to read the pending change.")
	}
}

func adminConfigurationManager(ctx *middlewares.AutheliaCtx) *admin.ConfigurationManager {
	if ctx.Providers.AdminConfiguration == nil {
		adminReplyError(ctx, fasthttp.StatusNotImplemented, nil, "Configuration management is not available.")

		return nil
	}

	return ctx.Providers.AdminConfiguration
}

func adminReplyConfigurationError(ctx *middlewares.AutheliaCtx, err error, message string) {
	switch {
	case errors.Is(err, admin.ErrConfigurationFileUnknown), errors.Is(err, admin.ErrConfigurationSectionInvalid):
		adminReplyError(ctx, fasthttp.StatusBadRequest, nil, err.Error())
	default:
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, message+" "+err.Error())
	}
}
