// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

//go:build !windows

package commands

import (
	"fmt"
	"os"
	"syscall"
)

// restartProcess replaces the current process with a fresh instance of the same executable and arguments.
func restartProcess() (err error) {
	var executable string

	if executable, err = os.Executable(); err != nil {
		return fmt.Errorf("error determining the executable path for restart: %w", err)
	}

	return syscall.Exec(executable, os.Args, os.Environ()) //nolint:gosec // Re-executes the current binary.
}
