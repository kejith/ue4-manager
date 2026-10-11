# UE4 Manager — Empire Intelligence

Self-hosted, mobile-responsive intelligence dashboard for the [Empire Universe 4 read-only Public API](https://www.empire-universe.com/docs/api/public-api.html). All API credentials stay on the server. The app deliberately has **no frontend or backend package dependencies**: it uses Python 3.12's standard library, SQLite, JavaScript, and CSS.

## Features

- **Command center:** player identity, colony and fleet counts, resource summary, near-term task activity, cached-data freshness.
- **Planets & economy:** all owned colonies, searchable details, aggregated resource inventories, and a persistent per-browser resource-target planner.
- **Mine investment planner:** detected mine levels by colony, upgrade cost and incremental-production inputs, resource value ratios, affordability, amortization, and 30-day ROI. Source values are read from API snapshots and explicit per-level reference records when available; otherwise you supply assumptions. Saved per mine/level in your browser.
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

## Mine upgrade planner

Open **Mine planner** after syncing **Planets**. Optionally sync **Reference buildings** to prefill explicit per-level details where the game returns them. The view lists identified mines, their current levels and proposed next upgrades. Enter or correct: output resource, upgrade cost (`ore:1000, crystal:200`), extra units produced each hour, current units/hour (required only when downtime is enabled), and construction hours. These values are saved in this browser for that mine and upgrade level; subsequent game syncs do not overwrite overrides. No extra API calls are made by the calculations.

With a resource weight `w` (default all 1, e.g. `ore:1, crystal:2`), the estimate is:

- Weighted upgrade cost: sum of `cost[resource] × w[resource]`.
- Weighted hourly gain: `extraProducedPerHour × w[outputResource]`.
- Optional construction opportunity loss: `currentProductionPerHour × buildHours × w[outputResource]` when mining stops during construction.
- **Payback after starting construction:** `buildHours + (weightedCost + lostProduction) / weightedHourlyGain`.
- **30-day ROI:** `(weightedHourlyGain × max(0, 720 - buildHours) - weightedCost - lostProduction) / weightedCost × 100%`; shown as unavailable for zero-cost upgrades.

Upgrades with unknown costs, gain, output type or build duration are **not** ranked. Affordability is assessed against current per-planet resource inventories only when all required resource keys appear; otherwise it is unknown. Rankings compare **one next-level upgrade per mine**, not multi-upgrade long-term strategies. Results do not account for energy, production caps, bonuses, game mechanics not reported by the API, continuing expenses or other possible effects. The public API is read-only; this planner does not place construction orders.

## Tests

```bash
python3 -m unittest discover -s tests -v
node --check web/app.js   # optional: requires Node.js
node --check web/mines.js
node tests/mines.js
node tests/mines_smoke.js
```

Tests stub the upstream API and use a local HTTP server; they do not require an Empire Universe token or internet access. No end-to-end check against a live game token has been run as part of development.

## Security considerations

A single shared dashboard password is appropriate for a private single-operator deployment, not multi-user access. Use HTTPS, a firewall, secure secrets, restricted access to volume backups, and rotate the game token every 90 days (or whenever the game requires). Do not expose port 8080 directly over the internet. A VPN or reverse-proxy access-control layer is an optional defense-in-depth improvement.