# Deployment and operations

Current production state rechecked over SSH and HTTPS on **21 November 2026**. One Next.js Node service runs behind the existing host-level Caddy reverse proxy. The server release record, not the historical repository clone or latest documentation commit, identifies the running application.

## Current accepted release

| Item | Value |
| --- | --- |
| Public site / readiness | `https://hackatonprojekt.net` / `/healthz` |
| Release directory | `/srv/hackaton/releases/20261121-brand` |
| Application commit | `3817a3b47257991a00bad7a0f9959db687171b4a` |
| Image | `market-radar:20261121-brand`, native ARM64 |
| Compose project / service / container | `market-radar` / `app` / `market-radar-app-1` |
| Rollback release | `/srv/hackaton/releases/20261121-context` |
| Deployment record | `deployment-record.json` in the current release directory |
| Approved data / policy | `0.6.0-local` / `2026-11-21.1` |
| Active data counts | 10 datasets, 595 series, 3,445 observations |
| Latest release's pre-cutover backup | `/srv/hackaton/shared/backups/conversations-20261121T130204747142Z.sqlite`, integrity checked |

The last check found the brand container healthy. The VPS is Linux ARM64 with 8 vCPU, approximately 15 GiB RAM, 38 GiB root storage and 2 GiB swap; about 27 GiB disk was free. Recheck resources before each build. `/healthz` returning `ai: configured` confirms a configured key, not provider connectivity.

Documentation-only commits do not require an image rebuild or service restart. Keep `applicationCommit` distinct from the documentation revision. The historical `/srv/hackaton/repository/` clone is not the deployment source.

## Persistent files and secrets

```text
/srv/hackaton/releases/<release>/       Reviewed source, Compose env and release record
/srv/hackaton/shared/app.env            Server-only runtime secrets, mode 0600
/srv/hackaton/shared/data/0.6.0-local/   Approved public archive, mounted read-only
/srv/hackaton/shared/runtime/           Production conversations, UID/GID 1000:1000
/srv/hackaton/shared/runtime-candidate/ Isolated candidate conversations
/srv/hackaton/shared/backups/           Private online SQLite backups
```

The shared parent and conversation directories may remain mode 0700. Docker creates bind mounts as root; the non-root process needs access to the mounted contents. Keep public dataset files readable and its directory traversable. Never copy local or candidate conversations over production history.

The dataset mount contains `market-radar.sqlite`, `manifest.json`, `capabilities-public-ch.json` and `capabilities-regional-ch.json`. Its database SHA-256 is `1a345db2eb4ae18f2f19b6eb5721da7ff4f07bc056291a8c95464b68c6fdfd3d`. See [Data](DATA.md) for verification and source exclusions.

`deployment/compose.yaml` loads secrets from the private server-side `app.env`. The per-release `production.env` and `candidate.env` contain image/port/mount choices only; do not put credentials in them. Avoid printing env files, resolved `docker compose config` or unrestricted `docker inspect`. Query only specific non-sensitive fields.

The `.dockerignore` allowlist admits application/config files and `public/` assets, including self-hosted fonts. It excludes secrets, data, conversations, source archives and screenshots. Build from a Git archive of a reviewed commit, not the working directory's ignored files. The image uses Node `24.9.0-bookworm-slim`; do not transfer Windows `node_modules` or `.next` to ARM64.

## Inspect or restart the current service

Run on the VPS with the configured deploy identity:

```sh
cd /srv/hackaton/releases/20261121-brand
docker compose -p market-radar --env-file production.env -f deployment/compose.yaml ps
docker compose -p market-radar --env-file production.env -f deployment/compose.yaml logs --tail 50
curl --fail https://hackatonprojekt.net/healthz
```

If a restart is needed, run the same Compose command with `restart app`, then verify health and HTTPS again. The container runs as UID 1000 with a read-only root filesystem, a 64 MiB `/tmp`, a 2 GiB RAM limit, two CPUs, 256 PID limit, dropped capabilities and rotated logs (10 MiB × 3). The restart policy is `unless-stopped`; an unhealthy status alone does not trigger a Docker restart.

## Build a new application release

1. Verify the commit, clean/staged content, ignored secret boundaries, local tests and data hashes. Recheck disk and running services. Choose a new versioned release directory and image tag; preserve the accepted release.
2. Export only tracked files. For example, from the local checkout in PowerShell:

```powershell
git archive --format=tar --output=market-radar.tar HEAD
scp -o BatchMode=yes -o StrictHostKeyChecking=yes market-radar.tar hackaton-vps:/srv/hackaton/releases/market-radar.tar
```

3. On the VPS, extract into a fresh release directory. Do not overwrite an existing release. From that directory, build and verify architecture:

```sh
docker build --pull -t market-radar:<release> .
docker image inspect market-radar:<release> --format '{{.Architecture}}'
```

The result must be `arm64`. A build needs neither a mounted dataset nor an API key: runtime data access is lazy. Linux uses its normal trusted CA bundle. Windows direct Node HTTPS checks use `--use-system-ca`; do not disable certificate verification.

## Candidate and cutover

Create a non-secret `candidate.env` in the new release directory:

```dotenv
MARKET_RADAR_IMAGE=market-radar:<release>
APP_PORT=3001
MARKET_RADAR_DATA_PATH=/srv/hackaton/shared/data/0.6.0-local
MARKET_RADAR_RUNTIME_PATH=/srv/hackaton/shared/runtime-candidate
```

Start the isolated candidate while production continues running:

```sh
docker compose -p market-radar-candidate --env-file candidate.env -f deployment/compose.yaml up -d --wait --wait-timeout 120
curl --fail http://127.0.0.1:3001/healthz
```

Verify the catalog, representative calculations, all seven routes and assets. For font changes, check all served font hashes and the three preload URLs. For analytical/context changes, also test a real question and follow-up in an isolated candidate session. See [Validation](VALIDATION.md); paid-provider checks are explicit and separate from deterministic tests.

Prepare `production.env` with the same image/data path, `APP_PORT=3000` and `MARKET_RADAR_RUNTIME_PATH=/srv/hackaton/shared/runtime`. Take a fresh online backup before cutover, especially before persistence changes. Then, from the new release directory:

```sh
python3 deployment/backup-runtime.py
docker compose -p market-radar --env-file production.env -f deployment/compose.yaml up -d --wait --wait-timeout 120
curl --fail https://hackatonprojekt.net/healthz
```

After cutover, verify public routes/assets, browser errors, relevant UI interactions, HTTPS cookies, data/result parity and logs. Run `node --use-system-ca scripts/check-production.mjs` from the local checkout with the local production app running; it checks seven groups, eleven analytical results and three decision briefs without calling the provider. A successful health response is not a substitute for a live-provider check when AI behavior changed.

Record the application commit, image, architecture, data hash/policy, actual checks, backup and rollback target in `deployment-record.json`. After acceptance, stop/remove only the candidate with its own Compose project (`down` without deleting volumes/data). Preserve shared data and runtime directories.

## Proxy and HTTPS

Caddy proxies to `127.0.0.1:3000`. The container listens on `0.0.0.0:3000` internally, with only a loopback host port published. Do not expose the application directly through Docker's public ports. Caddy handles HTTP-to-HTTPS and `www`-to-apex redirects and renews certificates; preserve `/var/lib/caddy/`.

The tracked `deployment/Caddyfile` enables HTTP/1.1 and HTTP/2 and sends `Alt-Svc: clear` on both domains. HTTP/3 is intentionally disabled after a reproduced client-network fallback caused approximately 22-second delays. Preserve this configuration unless new measurements justify changing it. Do not reload or replace Caddy for an ordinary app-only release. If proxy changes are required, validate them before reload and retain the previous configuration.

## Backup, restore and rollback

`deployment/backup-runtime.py` uses SQLite's online backup API, opens the live source read-only, creates a unique mode-0600 snapshot, verifies integrity and has a bounded wait. It requires only Python's standard library. Optional `--database` and `--destination` parameters support an isolated restore rehearsal. Copying only the active database while WAL writes continue is not a valid backup method. No backup schedule or off-host copy is configured.

For an ordinary compatible application rollback, run Compose from the previous accepted release with its retained `production.env`. For the current brand release:

```sh
cd /srv/hackaton/releases/20261121-context
docker compose -p market-radar --env-file production.env -f deployment/compose.yaml up -d --wait --wait-timeout 120
curl --fail https://hackatonprojekt.net/healthz
```

Keep the production runtime mount; do not restore a database merely to roll back CSS or application code. The brand release changes neither schema nor data. The earlier decision-workspace extension added `conversation_briefs` without altering existing rows, and the context release only changed persistence behavior.

For a necessary database restore, stop the app, preserve the current database and WAL/SHM sidecars in a private recovery directory, and install a verified backup as `conversations.sqlite` with UID/GID `1000:1000` and mode 0600. Do not leave old WAL/SHM files beside the restored database. Start the compatible application, check health and verify a known session. Access still requires the corresponding browser cookie; a database backup does not provide account-based recovery.

The original placeholder remains stopped in `/srv/hackaton/bootstrap` (Compose project `hackaton`) only for emergency service recovery. It has no Market Radar functionality and is not the normal rollback target. Do not rerun provisioning scripts or alter certificate state during application rollback.

## Accepted release sequence

All releases below are dated 21 November 2026. Per-release server records retain exact commits and checks.

| Release | Change | Previous accepted application |
| --- | --- | --- |
| `20261121-461dbac` | Initial production MVP, favicon and runtime configuration | Original placeholder |
| `20261121-sidebar-loading` | Sidebar/footer, load deadlines and measured HTTP/2 transport fix | Initial MVP |
| `20261121-routing` | Dedicated routes and shareable analytical state | Sidebar/loading |
| `20261121-decisions` | Graduate opportunities and participant context | Routing |
| `20261121-context` | Persistent decision/chart context handoffs | Decisions |
| **`20261121-brand`** | Figma palette, self-hosted fonts and chart colour consistency | **Context** |
