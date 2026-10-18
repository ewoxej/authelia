// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package handlers

import (
	"errors"
	"path/filepath"

	"github.com/valyala/fasthttp"

	"github.com/authelia/authelia/v4/internal/admin"
	"github.com/authelia/authelia/v4/internal/middlewares"
	"github.com/authelia/authelia/v4/internal/random"
)

// AdminFilesGET lists the names of the files in one of the directories the file picker is allowed to browse. Without
// a path it lists the allowed directories.
func AdminFilesGET(ctx *middlewares.AutheliaCtx) {
	roots := ctx.Configuration.Administration.FileRoots

	if len(roots) == 0 {
		roots = adminConfigurationDirectories(ctx)
	}

	path := string(ctx.QueryArgs().Peek("path"))

	listing, err := admin.NewFileBrowser(roots).List(path)

	switch {
	case err == nil:
		ctx.Logger.WithFields(map[string]any{"path": path}).Debug("Administration file picker listed a directory")

		adminReplyJSON(ctx, listing)
	case errors.Is(err, admin.ErrFilePathOutsideRoots), errors.Is(err, admin.ErrFilePathNotDirectory):
		adminReplyError(ctx, fasthttp.StatusBadRequest, nil, err.Error())
	default:
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, err.Error())
	}
}

type adminFilesCreateRequestBody struct {
	Path   string `json:"path"`
	Length int    `json:"length"`
}

const (
	adminSecretDefaultLength = 64
	adminSecretMinLength     = 16
	adminSecretMaxLength     = 256
)

func adminFileBrowser(ctx *middlewares.AutheliaCtx) *admin.FileBrowser {
	roots := ctx.Configuration.Administration.FileRoots

	if len(roots) == 0 {
		roots = adminConfigurationDirectories(ctx)
	}

	return admin.NewFileBrowser(roots)
}

func adminReplyFilesCreateError(ctx *middlewares.AutheliaCtx, err error) {
	switch {
	case errors.Is(err, admin.ErrFilePathOutsideRoots), errors.Is(err, admin.ErrFilePathExists), errors.Is(err, admin.ErrFilePathParentMissing):
		adminReplyError(ctx, fasthttp.StatusBadRequest, nil, err.Error())
	default:
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, err.Error())
	}
}

// AdminFilesDirectoryPOST creates a directory in one of the directories the file picker is allowed to browse.
func AdminFilesDirectoryPOST(ctx *middlewares.AutheliaCtx) {
	body := adminFilesCreateRequestBody{}

	if err := ctx.ParseBody(&body); err != nil {
		adminReplyError(ctx, fasthttp.StatusBadRequest, err, "The request body is invalid.")

		return
	}

	created, err := adminFileBrowser(ctx).CreateDirectory(body.Path)
	if err != nil {
		adminReplyFilesCreateError(ctx, err)

		return
	}

	adminAudit(ctx, "files.directory.create").WithField("path", created).Info("Administrator created a directory")

	adminReplyJSON(ctx, map[string]string{"path": created})
}

// AdminFilesSecretPOST creates a new file holding a random secret, readable only by its owner, and replies with the path.
// The secret itself is never sent back.
func AdminFilesSecretPOST(ctx *middlewares.AutheliaCtx) {
	body := adminFilesCreateRequestBody{}

	if err := ctx.ParseBody(&body); err != nil {
		adminReplyError(ctx, fasthttp.StatusBadRequest, err, "The request body is invalid.")

		return
	}

	length := body.Length
	if length == 0 {
		length = adminSecretDefaultLength
	}

	if length < adminSecretMinLength || length > adminSecretMaxLength {
		adminReplyError(ctx, fasthttp.StatusBadRequest, nil, "The length of the secret is invalid.")

		return
	}

	secret, err := random.New().StringCustomErr(length, random.CharSetAlphaNumeric)
	if err != nil {
		adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to generate the secret.")

		return
	}

	created, err := adminFileBrowser(ctx).CreateFile(body.Path, []byte(secret))
	if err != nil {
		adminReplyFilesCreateError(ctx, err)

		return
	}

	adminAudit(ctx, "files.secret.create").WithFields(map[string]any{"path": created, "length": length}).Warn("Administrator generated a secret file")

	adminReplyJSON(ctx, map[string]string{"path": created})
}

// adminConfigurationDirectories returns the directories of the loaded configuration files.
func adminConfigurationDirectories(ctx *middlewares.AutheliaCtx) (directories []string) {
	manager := ctx.Providers.AdminConfiguration
	if manager == nil {
		return nil
	}

	files, err := manager.Files()
	if err != nil {
		return nil
	}

	for _, file := range files {
		directories = append(directories, filepath.Dir(file.Path))
	}

	return directories
}
