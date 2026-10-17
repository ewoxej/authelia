// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

// Command seed fills the SQLite database of the administration UI development environment with demo sign-in activity
// and bans, so the overview, activity and bans pages have something to show. It does nothing when the authentication
// log already has entries.
package main

import (
	"database/sql"
	"fmt"
	"math/rand/v2"
	"os"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type attempt struct {
	successful bool
	banned     bool
	username   string
	authType   string
	ip         string
	uri        string
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: seed <path to db.sqlite3>")
		os.Exit(2)
	}

	if err := seed(os.Args[1]); err != nil {
		fmt.Fprintln(os.Stderr, "error seeding the development database:", err)
		os.Exit(1)
	}
}

func seed(path string) (err error) {
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		return err
	}

	defer db.Close()

	var count int

	if err = db.QueryRow("SELECT COUNT(*) FROM authentication_logs").Scan(&count); err != nil {
		return err
	}

	if count != 0 {
		return nil
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}

	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	insert, err := tx.Prepare("INSERT INTO authentication_logs (time, successful, banned, username, auth_type, remote_ip, request_uri, request_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
	if err != nil {
		return err
	}

	random := rand.New(rand.NewPCG(42, 17)) //nolint:gosec // Demo data only.
	now := time.Now()

	users := []struct{ name, ip, factor string }{
		{"admin", "192.168.1.24", "TOTP"},
		{"alice", "192.168.1.31", "WebAuthn"},
		{"alice", "10.0.0.12", "TOTP"},
	}
	targets := []string{"https://traefik.example.com/", "https://vessel.example.com/", "https://cloud.example.com/apps/oidc_login/oidc"}

	add := func(at time.Time, a attempt) error {
		_, err := insert.Exec(at, a.successful, a.banned, a.username, a.authType, a.ip, a.uri, "GET")

		return err
	}

	// Thirty days of sign-ins which follow a daily rhythm.
	for minutes := 30 * 24 * 60; minutes > 0; minutes -= 7 + random.IntN(25) {
		at := now.Add(-time.Duration(minutes) * time.Minute)

		if hour := at.Hour(); (hour < 7 || hour > 23) && random.IntN(5) != 0 {
			continue
		}

		user := users[random.IntN(len(users))]
		target := targets[random.IntN(len(targets))]

		if random.IntN(18) == 0 {
			if err = add(at, attempt{username: user.name, authType: "1FA", ip: user.ip, uri: target}); err != nil {
				return err
			}

			continue
		}

		if err = add(at, attempt{successful: true, username: user.name, authType: "1FA", ip: user.ip, uri: target}); err != nil {
			return err
		}

		if random.IntN(3) != 0 {
			if err = add(at.Add(20*time.Second), attempt{successful: true, username: user.name, authType: user.factor, ip: user.ip, uri: target}); err != nil {
				return err
			}
		}
	}

	// A brute force attempt from an external address which got banned.
	attack := now.Add(-38 * time.Minute)

	for i := range 4 {
		if err = add(attack.Add(time.Duration(i)*20*time.Second), attempt{username: "root", authType: "1FA", ip: "45.155.205.3", uri: targets[0]}); err != nil {
			return err
		}
	}

	if err = add(attack.Add(2*time.Minute), attempt{banned: true, username: "root", authType: "1FA", ip: "45.155.205.3", uri: targets[0]}); err != nil {
		return err
	}

	bans := []struct {
		query string
		args  []any
	}{
		{"INSERT INTO banned_ip (time, expires, ip, source, reason) VALUES (?, ?, ?, ?, ?)", []any{attack.Add(time.Minute), now.Add(25 * time.Minute), "45.155.205.3", "regulation", "4 failures in 2 minutes"}},
		{"INSERT INTO banned_user (time, expires, username, source, reason) VALUES (?, ?, ?, ?, ?)", []any{now.Add(-26 * time.Hour), nil, "bob", "admin", "Laptop lost"}},
		{"INSERT INTO banned_user (time, expires, expired, username, source, reason) VALUES (?, ?, ?, ?, ?, ?)", []any{now.Add(-72 * time.Hour), now.Add(-71 * time.Hour), now.Add(-71 * time.Hour), "alice", "regulation", "3 failures in 2 minutes"}},
	}

	for _, ban := range bans {
		if _, err = tx.Exec(ban.query, ban.args...); err != nil {
			return err
		}
	}

	return tx.Commit()
}
