// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

//go:build !windows

package admin

import (
	"os"
	"syscall"
)

// keepOwner gives the file the owner of the file it replaces. 'authelia admin changes' usually runs as root with
// 'docker exec' while Janus runs as another user, which has to be able to write the file afterwards. Only root can
// change the owner, so the error is ignored for other users as before.
func keepOwner(f *os.File, info os.FileInfo) error {
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || (int(stat.Uid) == os.Geteuid() && int(stat.Gid) == os.Getegid()) {
		return nil
	}

	if err := f.Chown(int(stat.Uid), int(stat.Gid)); err != nil && os.Geteuid() == 0 {
		return err
	}

	return nil
}
