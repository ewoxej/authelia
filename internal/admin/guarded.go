// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package admin

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"

	"github.com/authelia/authelia/v4/internal/configuration/schema"
)

// guardedConnection is a setting of a service Janus sends credentials to. Pointing it elsewhere would hand the
// credentials, which the administration area otherwise never shows, to whoever runs the other end.
type guardedConnection struct {
	key   string
	what  string
	value func(config *schema.Configuration) any
}

// guardedPath is a setting naming a file or directory Janus reads or writes. Pointing it elsewhere reaches files the
// file picker can't browse, or overwrites files, i.e. the configuration or the users file.
type guardedPath struct {
	key  string
	what string
	// written paths are written by Janus, so they also can't name a file which exists already.
	written bool
	value   func(config *schema.Configuration) string
}

var guardedConnections = []guardedConnection{
	{"authentication_backend.ldap.address", "the address of the LDAP server", func(c *schema.Configuration) any {
		if l := c.AuthenticationBackend.LDAP; l != nil {
			return addressString(l.Address)
		}

		return ""
	}},
	{"authentication_backend.ldap.tls", "the TLS settings of the LDAP server", func(c *schema.Configuration) any {
		if l := c.AuthenticationBackend.LDAP; l != nil {
			return tlsValue(l.TLS)
		}

		return nil
	}},
	{"notifier.smtp.address", "the address of the SMTP server", func(c *schema.Configuration) any {
		if s := c.Notifier.SMTP; s != nil {
			return addressString(s.Address)
		}

		return ""
	}},
	{"notifier.smtp.tls", "the TLS settings of the SMTP server", func(c *schema.Configuration) any {
		if s := c.Notifier.SMTP; s != nil {
			return tlsValue(s.TLS)
		}

		return nil
	}},
	{"storage.postgres.address", "the address of the PostgreSQL server", func(c *schema.Configuration) any {
		if p := c.Storage.PostgreSQL; p != nil {
			addresses := []string{addressString(p.Address)}

			for _, server := range p.Servers {
				addresses = append(addresses, addressString(server.Address))
			}

			return strings.Join(addresses, ", ")
		}

		return ""
	}},
	{"storage.postgres.tls", "the TLS settings of the PostgreSQL server", func(c *schema.Configuration) any {
		if p := c.Storage.PostgreSQL; p != nil {
			tls := []any{tlsValue(p.TLS), p.SSL}

			for _, server := range p.Servers {
				tls = append(tls, tlsValue(server.TLS))
			}

			return tls
		}

		return nil
	}},
	{"storage.mysql.address", "the address of the MySQL server", func(c *schema.Configuration) any {
		if m := c.Storage.MySQL; m != nil {
			return addressString(m.Address)
		}

		return ""
	}},
	{"storage.mysql.tls", "the TLS settings of the MySQL server", func(c *schema.Configuration) any {
		if m := c.Storage.MySQL; m != nil {
			return tlsValue(m.TLS)
		}

		return nil
	}},
	{"session.redis.host", "the address of the Redis server", func(c *schema.Configuration) any {
		r := c.Session.Redis
		if r == nil {
			return ""
		}

		hosts := []string{hostPort(r.Host, r.Port)}

		if r.HighAvailability != nil {
			hosts = append(hosts, "sentinel "+r.HighAvailability.SentinelName)

			for _, node := range r.HighAvailability.Nodes {
				hosts = append(hosts, hostPort(node.Host, node.Port))
			}
		}

		return strings.Join(hosts, ", ")
	}},
	{"session.redis.tls", "the TLS settings of the Redis server", func(c *schema.Configuration) any {
		if r := c.Session.Redis; r != nil {
			return tlsValue(r.TLS)
		}

		return nil
	}},
	{"duo_api.hostname", "the address of the Duo API", func(c *schema.Configuration) any {
		return c.DuoAPI.Hostname
	}},
}

var guardedPaths = []guardedPath{
	{"authentication_backend.file.path", "the users file", true, func(c *schema.Configuration) string {
		if f := c.AuthenticationBackend.File; f != nil {
			return f.Path
		}

		return ""
	}},
	{"notifier.filesystem.filename", "the file the notifications are written to", true, func(c *schema.Configuration) string {
		if f := c.Notifier.FileSystem; f != nil {
			return f.Filename
		}

		return ""
	}},
	{"storage.local.path", "the SQLite database", true, func(c *schema.Configuration) string {
		if l := c.Storage.Local; l != nil {
			return l.Path
		}

		return ""
	}},
	{"log.file_path", "the log file", true, func(c *schema.Configuration) string {
		// The path may contain the time the log was opened, i.e. '/config/authelia.%d.log': the directory is what counts.
		return c.Log.FilePath
	}},
	{"notifier.template_path", "the email templates", false, func(c *schema.Configuration) string {
		return c.Notifier.TemplatePath
	}},
	{"server.asset_path", "the assets served to the users", false, func(c *schema.Configuration) string {
		return c.Server.AssetPath
	}},
	{"certificates_directory", "the trusted certificates", false, func(c *schema.Configuration) string {
		return c.CertificatesDirectory
	}},
	{"server.tls.certificate", "the TLS certificate", false, func(c *schema.Configuration) string {
		return c.Server.TLS.Certificate
	}},
	{"server.tls.key", "the TLS private key", false, func(c *schema.Configuration) string {
		return c.Server.TLS.Key
	}},
}

// tlsValue compares a missing TLS configuration equal to the one of a service which isn't configured.
func tlsValue(tls *schema.TLS) any {
	if tls == nil {
		return nil
	}

	return *tls
}

func hostPort(host string, port int) string {
	if port == 0 {
		return host
	}

	return host + ":" + strconv.Itoa(port)
}

func addressString(address interface{ String() string }) string {
	if address == nil || reflect.ValueOf(address).IsNil() {
		return ""
	}

	return address.String()
}

// guardedChanges describes the changes from the current configuration to the new one which need the confirmation of
// someone with access to the server: services Janus sends credentials to, and files outside the directories the file
// picker can browse or files Janus would overwrite.
func (m *ConfigurationManager) guardedChanges(current, changed *schema.Configuration, roots []string) (reasons []string) {
	for _, guarded := range guardedConnections {
		before, after := guarded.value(current), guarded.value(changed)

		if reflect.DeepEqual(before, after) {
			continue
		}

		if b, ok := before.(string); ok {
			reasons = append(reasons, fmt.Sprintf("changes %s (%s) from '%s' to '%s', which would receive its credentials", guarded.what, guarded.key, b, after))
		} else {
			reasons = append(reasons, fmt.Sprintf("changes %s (%s), which protect its credentials", guarded.what, guarded.key))
		}
	}

	if before, after := urlString(current.Administration.Endpoint), urlString(changed.Administration.Endpoint); before != after {
		reasons = append(reasons, fmt.Sprintf("changes where the administration area is available (administration.endpoint) from '%s' to '%s'", before, after))
	}

	browser := NewFileBrowser(roots)

	for _, guarded := range guardedPaths {
		before, after := guarded.value(current), guarded.value(changed)

		if before == after || after == "" {
			continue
		}

		check := after
		if guarded.key == "log.file_path" {
			check = filepath.Dir(after)
		}

		switch {
		case !filepath.IsAbs(after) || !browser.Allowed(check):
			reasons = append(reasons, fmt.Sprintf("points %s (%s) to '%s', which is outside the directories the file picker can browse", guarded.what, guarded.key, after))
		case guarded.written && isExistingFile(after):
			reasons = append(reasons, fmt.Sprintf("points %s (%s) to '%s', which exists already and would be overwritten", guarded.what, guarded.key, after))
		}
	}

	return reasons
}

func urlString(u *url.URL) string {
	if u == nil {
		return ""
	}

	return u.String()
}

func isExistingFile(path string) bool {
	info, err := os.Stat(path)

	return err == nil && !info.IsDir()
}
