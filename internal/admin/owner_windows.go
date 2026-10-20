// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package admin

import (
	"os"
)

// keepOwner does nothing on Windows, where the file inherits the permissions of the directory.
func keepOwner(_ *os.File, _ os.FileInfo) error {
	return nil
}
