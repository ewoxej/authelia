// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package admin

import (
	"sync"
)

var (
	restartOnce sync.Once
	restartCh   = make(chan struct{})
)

// RequestRestart requests a graceful restart of the Authelia process. It is safe to call multiple times.
func RequestRestart() {
	restartOnce.Do(func() {
		close(restartCh)
	})
}

// RestartRequestedChannel returns a channel which is closed when a restart has been requested.
func RestartRequestedChannel() <-chan struct{} {
	return restartCh
}

// RestartRequested returns true if a restart has been requested.
func RestartRequested() bool {
	select {
	case <-restartCh:
		return true
	default:
		return false
	}
}
