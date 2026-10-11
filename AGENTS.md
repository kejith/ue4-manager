# UE4 Manager deployment-agent guidance

- Application is read-only and should never receive a game API write token.
- Branch `main` is deployable after the GitHub Actions `Validate dashboard` job succeeds.
- Run `docker compose up -d --build` in the repository root.
- Manage `EU4_API_TOKEN`, `DASHBOARD_PASSWORD`, and `SESSION_SECRET` as private server secrets / `.env`, not repo files.
- Host `ue4.sane.run` through an HTTPS reverse proxy to `127.0.0.1:8080`, preserving `Host`.
- `COOKIE_SECURE=true` is required for HTTPS; never expose the HTTP port publicly.
- Keep the Docker volume `ue4_data` persistent and back it up privately.
- Health check: `GET http://127.0.0.1:8080/healthz` responds with `{"ok":true}`.
- On deployment failure, retain previous working container and surface logs; do not erase the database volume.
- No unattended requests to the game API are enabled. All game syncs are explicitly initiated in the UI.
