// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

//go:build windows

package commands

// restartProcess exits the process so the service manager can start it again.
func restartProcess() (err error) {
	return nil
}
