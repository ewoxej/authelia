// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package handlers

import (
	"net"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/authelia/authelia/v4/internal/model"
)

func TestAggregateAdminStats(t *testing.T) {
	now := time.Date(2026, 10, 17, 14, 30, 0, 0, time.UTC)
	ip := model.NullIP{IP: net.ParseIP("192.168.1.10")}

	attempts := []model.AuthenticationAttempt{
		{Time: now.Add(-10 * time.Minute), Successful: true, Type: "1FA", RemoteIP: ip},
		{Time: now.Add(-9 * time.Minute), Successful: true, Type: "TOTP", RemoteIP: ip},
		{Time: now.Add(-3 * time.Hour), Successful: false, Type: "1FA", RemoteIP: model.NullIP{IP: net.ParseIP("10.0.0.1")}},
		{Time: now.Add(-5 * time.Hour), Successful: false, Banned: true, Type: "1FA"},
		{Time: now.Add(-6 * time.Hour), Successful: true, Type: "1FA"},
	}

	body := &adminStatsBody{Range: adminStatsRange24h}

	aggregateAdminStats(body, attempts, now)

	require.Len(t, body.Buckets, 24)
	assert.Equal(t, now.Truncate(time.Hour), body.Buckets[23].Start, "the last bucket is the current hour")
	assert.Equal(t, 2, body.Buckets[23].Successful)
	assert.Equal(t, 1, body.Buckets[20].Failed)

	assert.Equal(t, 5, body.Total)
	assert.Equal(t, 3, body.Successful)
	assert.Equal(t, 1, body.Failed)
	assert.Equal(t, 1, body.Banned)
	assert.Equal(t, 2, body.UniqueIPs)
	assert.Equal(t, 50, body.SecondFactorShare, "one second factor sign in for two first factor sign ins")

	body = &adminStatsBody{Range: adminStatsRange7d}

	aggregateAdminStats(body, attempts, now)

	require.Len(t, body.Buckets, 7)
	assert.Equal(t, 3, body.Buckets[6].Successful+body.Buckets[5].Successful)
}
