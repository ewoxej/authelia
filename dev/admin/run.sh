#!/usr/bin/env bash

# SPDX-FileCopyrightText: 2026 Authelia
#
# SPDX-License-Identifier: Apache-2.0

# Runs a development build of the backend with the administration API authentication disabled and the Vite
# development server for the administration UI. Open http://127.0.0.1:3010/admin when both are started.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="${ROOT}/dev/admin"
DATA="${DIR}/.data"

mkdir -p "${DATA}/secrets"

for name in jwt_secret session_secret storage_encryption_key oidc_hmac_secret; do
	if [ ! -f "${DATA}/secrets/${name}.txt" ]; then
		openssl rand -hex 32 > "${DATA}/secrets/${name}.txt"
	fi
done

if [ ! -f "${DATA}/secrets/oidc.key" ]; then
	(cd "${ROOT}" && go run ./cmd/authelia crypto pair rsa generate --bits 2048 --directory "${DATA}/secrets" --file.private-key oidc.key --file.public-key oidc.pub > /dev/null)
fi

if [ ! -f "${DATA}/configuration.yml" ]; then
	sed "s#DATA/#${DATA}/#g" "${DIR}/configuration.example.yml" > "${DATA}/configuration.yml"
fi

if [ ! -f "${DATA}/users.yml" ]; then
	cp "${DIR}/users.example.yml" "${DATA}/users.yml"
fi

export DOMAIN="example.com"
export NEXTCLOUD_URL="cloud.example.com"
export IMMICH_URL="photos.example.com"
export X_AUTHELIA_CONFIG_FILTERS="template"
export X_AUTHELIA_ADMIN_DEV_NO_AUTH="true"

PNPM=(pnpm)
if ! command -v pnpm > /dev/null; then
	PNPM=(npx -y pnpm@12)
fi

cleanup() {
	trap - EXIT INT TERM
	kill 0 2> /dev/null || true
}

trap cleanup EXIT INT TERM

(cd "${ROOT}" && go build -tags dev -o "${DATA}/authelia" ./cmd/authelia)
(cd "${DATA}" && ./authelia --config "${DATA}/configuration.yml") &

# Fill the database with demo activity once the backend has created the schema.
(
	for _ in $(seq 1 60); do
		if curl -sf -o /dev/null http://127.0.0.1:9095/api/health; then
			cd "${ROOT}" && go run ./dev/admin/seed "${DATA}/db.sqlite3"
			break
		fi

		sleep 1
	done
) &

(cd "${ROOT}/web" && "${PNPM[@]}" install --frozen-lockfile > /dev/null && "${PNPM[@]}" start:admin) &

wait
