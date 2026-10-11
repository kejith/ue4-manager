# UE4 Manager — Empire Intelligence

Self-hosted, mobile-responsive intelligence dashboard for the [Empire Universe 4 read-only Public API](https://www.empire-universe.com/docs/api/public-api.html). All API credentials stay on the server. The app deliberately has **no frontend or backend package dependencies**: it uses Python 3.12's standard library, SQLite, JavaScript, and CSS.

## Features

- **Command center:** player identity, colony and fleet counts, resource summary, near-term task activity, cached-data freshness.
- **Planets & economy:** all owned colonies, searchable details, aggregated resource inventories, and a persistent per-browser resource-target planner.
- **Fleets:** searchable fleet inventory and full nested ship, module, XP, fuel, cargo, and assignment payload inspection.
- **Production timeline:** active tasks and completion ETA countdowns whenever ETA fields exist.
- **Research & personnel:** technology state, queues, commanders, scientists, and specialization data as returned by the API.
- **Construction, exploration & diplomacy:** PA budgets, explored/visible systems, coordinate-based map if XY coordinates exist, alliances and membership data.
- **Reference library:** game catalogs for ships, modules, buildings, research and constants, with searchable tables and full JSON inspection.
- **Historical analytics:** snapshots stored in SQLite on every successful sync; charts of colony count, fleet count, task count and reported resource holdings.
- **API explorer:** all 15 allowlisted GET endpoints, raw JSON inspector, individual endpoint sync, exports.
- **Request-budget protection:** counts requests against a conservative local 50/rolling-24h budget; checks upstream 429 and `Retry-After`. This tracks **only this app's requests**. API activity performed by other clients is not visible.
- **Security:** password-protected private dashboards, signed HttpOnly sessions, same-origin POST verification, restrictive Content Security Policy, server-only upstream bearer token, bound-to-loopback Docker port.

The API is read-only: this app cannot order fleets, start research, construct buildings, manage trades, or access other players' private data. Reference payloads and other complex structures may vary with game versions; the explorer always preserves unmodified server responses. Some specialized metrics and maps only become available when corresponding fields exist upstream. **No game data or API token is included in the repository.**

## Deployment (`ue4.sane.run`)

Requirements: Docker Compose, a reverse proxy terminating TLS, an Empire Universe personal API token created from **Settings → Developer** in-game.

```bash
git clone https://github.com/kejith/ue4-manager.git
cd ue4-manager
cp .env.example .env
# Edit .env using your preferred editor and set strong values.
# To generate a signing secret:
python3 -c 'import secrets; print(secrets.token_hex(32))'
docker compose up -d --build
curl http://127.0.0.1:8080/healthz
```

Set the following environment variables in `.env` (never commit this file):

| Variable | Meaning |
|---|---|
| `EU4_API_TOKEN` | Personal bearer token for game reads. You can add it after deployment by editing `.env` and restarting. |
| `DASHBOARD_PASSWORD` | Required, unique password (at least 12 characters) for private UI login. |
| `SESSION_SECRET` | Required persistent random secret for signing sessions (32+ random bytes recommended). |
| `UE4_PORT` | Loopback port exposed to your reverse proxy; default `8080`. |
| `COOKIE_SECURE` | `true` (default). Requires HTTPS through your reverse proxy. For local HTTP development only set `false`. |
| `EU4_API_BASE` | Optional game API override (default `https://www.empire-universe.com/api/v1`). |

The container listens internally on port 8080; Compose exposes `127.0.0.1:8080`, not a public network interface. An example **Caddy** reverse proxy host block:

```caddyfile
ue4.sane.run {
    reverse_proxy 127.0.0.1:8080
}
```

Or use Nginx / Traefik with TLS termination and proxy pass-through. Forward the original `Host` header. Keep the application behind HTTPS so browsers accept its Secure session cookie. Ensure `ue4.sane.run` resolves to your server and that your proxy manages the certificate.

### Deployment agent instructions

If your local agent deploys whenever the `main` branch changes, point it at this repository and run `docker compose up -d --build` from the repository root. Supply credentials **only as server-side environment variables** or a private `.env` on the server. Preserve the `ue4_data` Docker volume across releases. Review any staging environment to ensure it does not inadvertently expose your actual game data.

**Note:** the dashboard is not auto-deployed by this repository. Your agent or proxy must deploy it; the repository cannot configure an agent whose interface/credentials are not provided.

## Running locally without Docker

```bash
export DASHBOARD_PASSWORD='replace-this-with-a-unique-strong-password'
export SESSION_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
export EU4_API_TOKEN='your-personal-token'
export COOKIE_SECURE=false
export DATABASE_PATH="$PWD/ue4-manager.sqlite3"
python3 -m app.server
```

Visit `http://127.0.0.1:8080`. Click **Sync empire** (9 API requests), then **Sync catalogs** (6 requests). Subsequent syncs consume API budget; see Settings for accounting. By design no automatic background polling is performed.

## Data model and behavior

- `latest`: last successful complete response per endpoint.
- `history`: last 180 successful responses per endpoint, retained across restarts.
- `requests`: every attempted upstream GET, counted in a rolling 24h local budget.
- `settings`: current upstream rate-limit blocking timestamp, if applicable.

Each sync reads only allowlisted game endpoints. A failed sync does not erase cached data. All 15 endpoints require a token because the backend uses a single token-authenticated client; the catalogs may be public upstream but are still proxied through the protected backend.

The app never guesses production rates, build costs, research prerequisites, or fleet battle outcomes if the API has not supplied those formulas. Nested/heterogeneous payloads remain explorable as JSON.

## Tests

```bash
python3 -m unittest discover -s tests -v
node --check web/app.js   # optional: requires Node.js
```

Tests stub the upstream API and use a local HTTP server; they do not require an Empire Universe token or internet access. No end-to-end check against a live game token has been run as part of development.

## Security considerations

A single shared dashboard password is appropriate for a private single-operator deployment, not multi-user access. Use HTTPS, a firewall, secure secrets, restricted access to volume backups, and rotate the game token every 90 days (or whenever the game requires). Do not expose port 8080 directly over the internet. A VPN or reverse-proxy access-control layer is an optional defense-in-depth improvement.