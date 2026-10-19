# Administration UI development environment

Runs the web UI on the Vite development server with hot reload against a development build of the backend.

```bash
./dev/admin/run.sh
```

Then open http://127.0.0.1:3010/admin and sign in as `admin` with the password `password`. The administration area
requires a second factor, so on the first sign-in register a one-time password in the settings; the verification code
is written to `.data/notification.txt`.

The sign-in pages are at http://localhost:3010/. The development server tells the backend it's `idm.example.com`, so
the session cookie works on localhost.

## How it works

- `run.sh` builds Authelia with the `dev` build tag and starts it on `127.0.0.1:9095`, then starts Vite on
  `127.0.0.1:3010` in the `admin-dev` mode (`web/.env.admin-dev`), which proxies `/api` and `/locales` to the backend.
- `configuration.example.yml` and `users.example.yml` are copied to `.data/` on the first run together with random
  secrets and an OIDC key, so changes made in the UI never touch the tracked files. Delete `.data/` to start over.
- The configuration uses the template filter like a real deployment: `DOMAIN`, `NEXTCLOUD_URL` and `IMMICH_URL` are set by
  `run.sh`, secrets are read from `.data/secrets/`.
- Every user's password is `password`. Notifications are written to `.data/notification.txt`.
- On the first run `seed/main.go` fills the database with 30 days of demo sign-ins, a banned IP address and user bans,
  so the overview, activity and bans pages have data to show.
