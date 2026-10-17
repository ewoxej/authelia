// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package handlers

import (
	"errors"
	"fmt"
	"slices"
	"strconv"
	"time"

	"github.com/valyala/fasthttp"

	"github.com/authelia/authelia/v4/internal/configuration/schema"
	"github.com/authelia/authelia/v4/internal/middlewares"
	"github.com/authelia/authelia/v4/internal/model"
	"github.com/authelia/authelia/v4/internal/regulation"
	"github.com/authelia/authelia/v4/internal/storage"
)

const (
	adminStatsRange24h = "24h"
	adminStatsRange7d  = "7d"
	adminStatsRange30d = "30d"

	// adminStatsMaximumEvents limits the number of authentication log entries aggregated for the statistics.
	adminStatsMaximumEvents = 250000
)

// AdminStatsGET returns aggregated authentication statistics used by the overview and activity pages.
func AdminStatsGET(ctx *middlewares.AutheliaCtx) {
	statsRange := string(ctx.QueryArgs().Peek("range"))

	if !slices.Contains([]string{adminStatsRange24h, adminStatsRange7d, adminStatsRange30d}, statsRange) {
		statsRange = adminStatsRange24h
	}

	now := ctx.GetClock().Now()

	body := adminStatsBody{Range: statsRange, Buckets: []adminStatsBucket{}}

	if provider := adminStorage(ctx); provider != nil {
		attempts, err := provider.LoadAuthenticationLogsSince(ctx, now.Add(-adminStatsRangeDuration(statsRange)), adminStatsMaximumEvents)
		if err != nil {
			adminReplyError(ctx, fasthttp.StatusInternalServerError, err, "Failed to load the authentication log.")

			return
		}

		aggregateAdminStats(&body, attempts, now)
	}

	if manager := adminUserManager(ctx); manager != nil {
		if users, err := manager.ListUsers(); err == nil {
			total, disabled := len(users), 0

			for _, user := range users {
				if user.Disabled {
					disabled++
				}
			}

			body.UsersTotal, body.UsersDisabled = &total, &disabled
		}
	}

	if bans, err := ctx.Providers.StorageProvider.LoadBannedUsers(ctx, adminMaximumPageLimit, 0); err == nil || errors.Is(err, storage.ErrNoCurrentBans) {
		body.BansUsers = len(bans)
	}

	if bans, err := ctx.Providers.StorageProvider.LoadBannedIPs(ctx, adminMaximumPageLimit, 0); err == nil || errors.Is(err, storage.ErrNoCurrentBans) {
		body.BansIPs = len(bans)
	}

	adminReplyJSON(ctx, body)
}

func adminStatsRangeDuration(statsRange string) time.Duration {
	switch statsRange {
	case adminStatsRange7d:
		return 7 * 24 * time.Hour
	case adminStatsRange30d:
		return 30 * 24 * time.Hour
	default:
		return 24 * time.Hour
	}
}

// aggregateAdminStats aggregates the authentication attempts into hourly buckets for the 24 hour range and daily
// buckets otherwise, and computes the totals.
func aggregateAdminStats(body *adminStatsBody, attempts []model.AuthenticationAttempt, now time.Time) {
	duration := adminStatsRangeDuration(body.Range)

	step, count := time.Hour, 24

	if body.Range != adminStatsRange24h {
		step, count = 24*time.Hour, int(duration/(24*time.Hour))
	}

	end := now.Truncate(step).Add(step)
	start := end.Add(-time.Duration(count) * step)

	body.Buckets = make([]adminStatsBucket, count)

	for i := range body.Buckets {
		body.Buckets[i].Start = start.Add(time.Duration(i) * step)
	}

	ips := map[string]struct{}{}

	var firstFactor, secondFactor int

	for _, attempt := range attempts {
		body.Total++

		if attempt.RemoteIP.IP != nil {
			ips[attempt.RemoteIP.String()] = struct{}{}
		}

		switch {
		case attempt.Banned:
			body.Banned++
		case attempt.Successful:
			body.Successful++

			switch attempt.Type {
			case regulation.AuthType1FA, regulation.AuthTypePasskey:
				firstFactor++
			default:
				secondFactor++
			}
		default:
			body.Failed++
		}

		if attempt.Time.Before(start) {
			continue
		}

		index := int(attempt.Time.Sub(start) / step)

		if index < 0 || index >= count {
			continue
		}

		if attempt.Successful {
			body.Buckets[index].Successful++
		} else {
			body.Buckets[index].Failed++
		}
	}

	body.UniqueIPs = len(ips)

	if firstFactor != 0 {
		body.SecondFactorShare = min(100, secondFactor*100/firstFactor)
	}
}

func newAdminComponents(config *schema.Configuration) (components []adminComponentBody) {
	backend := adminComponentBody{Name: "Authentication backend", Status: "ok", Label: "configured"}

	switch {
	case config.AuthenticationBackend.File != nil:
		backend.Detail = "file · " + config.AuthenticationBackend.File.Path
	case config.AuthenticationBackend.LDAP != nil:
		backend.Detail = "ldap"

		if config.AuthenticationBackend.LDAP.Address != nil {
			backend.Detail += " · " + config.AuthenticationBackend.LDAP.Address.String()
		}
	}

	store := adminComponentBody{Name: "Storage", Status: "ok", Label: "configured"}

	switch {
	case config.Storage.Local != nil:
		store.Detail = "sqlite3 · " + config.Storage.Local.Path
	case config.Storage.PostgreSQL != nil:
		store.Detail = "postgres"

		if config.Storage.PostgreSQL.Address != nil {
			store.Detail += " · " + config.Storage.PostgreSQL.Address.String()
		}
	case config.Storage.MySQL != nil:
		store.Detail = "mysql"

		if config.Storage.MySQL.Address != nil {
			store.Detail += " · " + config.Storage.MySQL.Address.String()
		}
	}

	sessions := adminComponentBody{Name: "Session store", Status: "warn", Label: "no redis", Detail: "memory · lost on restart"}

	if config.Session.Redis != nil && config.Session.Redis.Host != "" {
		sessions = adminComponentBody{Name: "Session store", Status: "ok", Label: "configured", Detail: "redis · " + config.Session.Redis.Host}

		if config.Session.Redis.Port != 0 {
			sessions.Detail += ":" + strconv.Itoa(config.Session.Redis.Port)
		}
	}

	notifier := adminComponentBody{Name: "Notifier", Status: "warn", Label: "not configured"}

	switch {
	case config.Notifier.SMTP != nil:
		notifier = adminComponentBody{Name: "Notifier", Status: "ok", Label: "configured", Detail: "smtp"}

		if config.Notifier.SMTP.Address != nil {
			notifier.Detail += " · " + config.Notifier.SMTP.Address.String()
		}
	case config.Notifier.FileSystem != nil:
		notifier = adminComponentBody{Name: "Notifier", Status: "neutral", Label: "file system", Detail: "filesystem · " + config.Notifier.FileSystem.Filename}
	}

	oidc := adminComponentBody{Name: "OpenID Connect", Status: "neutral", Label: "disabled", Detail: "no clients"}

	if config.IdentityProviders.OIDC != nil {
		oidc = adminComponentBody{Name: "OpenID Connect", Status: "neutral", Label: "enabled", Detail: fmt.Sprintf("%d clients", len(config.IdentityProviders.OIDC.Clients))}
	}

	return []adminComponentBody{backend, store, sessions, notifier, oidc}
}

func adminHost(config *schema.Configuration) string {
	for _, cookie := range config.Session.Cookies {
		if cookie.AutheliaURL != nil {
			return cookie.AutheliaURL.Host
		}
	}

	return ""
}
