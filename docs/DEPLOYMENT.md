# Deployment

This workflow deploys one Next.js Node.js service on the existing Linux ARM64 VPS, behind the host's Caddy reverse proxy. Caddy owns HTTPS and redirects; Docker publishes the app only to `127.0.0.1:3000`.

## Release contents and boundaries

- Build the versioned application image natively on ARM64 from the reviewed source and lockfile. The Dockerfile uses Node.js `24.9.0-bookworm-slim`, matching the tested local Node version.
- The `.dockerignore` allowlist excludes source archives, credentials, local configuration, browser artifacts and conversations. The image contains application code and static assets only.
- Mount the prepared, verified public dataset read-only at `/app/data`.
- Mount a separate persistent conversation directory at `/app/runtime`.
- Supply only server-side runtime configuration through `/srv/hackaton/shared/app.env`. Never bake API keys into the image or print this file in operational output.

All analytics endpoints are dynamic and open the SQLite file lazily. A build does not need the dataset or an OpenAI key. Health becomes ready only after a valid dataset is mounted. AI readiness in `/healthz` means a key is configured; a live question is still required to validate provider access.

The expected active workspace contains 10 datasets, 595 series and 3,445 observations. It uses the immutable reviewed `0.6.0-local` archive plus the source policy that excludes the Thurgau vacancy source. Copy the same prepared files used locally: `market-radar.sqlite`, `manifest.json`, `capabilities-public-ch.json` and `capabilities-regional-ch.json`. The optional verification audit can be retained alongside them. Do not copy local conversations to the public service.

## Host layout

```text
/srv/hackaton/releases/<release>/       Reviewed application source and deployment files
/srv/hackaton/shared/app.env            Runtime secret configuration, mode 0600
/srv/hackaton/shared/data/0.6.0-local/   Verified archive, mounted read-only
/srv/hackaton/shared/runtime/           Production conversations, writable by UID 1000
/srv/hackaton/shared/runtime-candidate/ Isolated preflight conversation store
/srv/hackaton/shared/backups/           Private database backups
```

The shared parent may remain mode 0700. Docker creates the bind mounts as root, so the non-root container needs access to the mounted directory and its contents, not to the host parent path. Set the conversation directories to UID/GID `1000:1000` and mode 0700. Keep public data files readable by the container, with their directory traversable. The Node process runs as UID 1000 inside the container; this does not require changing the SSH deploy user's identity.

## Build and preflight

Verify source revision, archive checksums and available disk space before a release. Build from the release directory; do not reuse Windows `node_modules` or `.next` output:

```sh
docker build --pull -t market-radar:<release> .
docker image inspect market-radar:<release> --format '{{.Architecture}}'
```

The image architecture must be `arm64`. Verify the native Node SQLite runtime and Linux build dependencies through the completed build and a healthy container. The production image carries only traced runtime dependencies.

The Linux runtime uses Node's standard trusted CA bundle. Windows QA commands use `--use-system-ca` to trust the workstation's existing TLS inspection certificate; certificate verification remains enabled in both environments.

Create a non-secret `candidate.env` next to the deployment files:

```dotenv
MARKET_RADAR_IMAGE=market-radar:<release>
APP_PORT=3001
MARKET_RADAR_DATA_PATH=/srv/hackaton/shared/data/0.6.0-local
MARKET_RADAR_RUNTIME_PATH=/srv/hackaton/shared/runtime-candidate
```

Start the candidate without displacing the existing service:

```sh
docker compose --project-name market-radar-candidate --env-file candidate.env -f deployment/compose.yaml up -d --wait --wait-timeout 120
curl --fail http://127.0.0.1:3001/healthz
```

Check the candidate's inventory and representative calculations against local results. Test AI with an isolated anonymous conversation. Candidate and production must use different conversation directories so a preflight restart or test does not alter production history.

## Cutover

Create a non-secret `production.env` with the selected image, `APP_PORT=3000` and `MARKET_RADAR_RUNTIME_PATH=/srv/hackaton/shared/runtime`. Retain this file and the prior release's version for rollback.

For the initial cutover, stop the old placeholder only after the candidate is healthy. Do not remove its files, image or existing Caddy certificate state. The reviewed initial placeholder uses Compose project `hackaton` in `/srv/hackaton/bootstrap`; recheck live state before stopping it. Future releases replace the existing `market-radar` service instead.

```sh
docker compose --project-name market-radar --env-file production.env -f deployment/compose.yaml up -d --wait --wait-timeout 120
curl --fail https://hackatonprojekt.net/healthz
```

The existing Caddy site should continue proxying to `127.0.0.1:3000`. Verify HTTPS, apex/www redirects, trusted proxy headers, secure session cookies and streamed analyst responses. Reload Caddy only if its configuration was intentionally changed and validated. Do not disable certificate validation.

The container has a read-only root filesystem, a 64 MiB temporary filesystem, 2 GiB RAM limit, two CPUs, bounded PID count and rotated Docker logs (three files of 10 MiB). `unless-stopped` restarts it after crashes and host restarts. Health status alone does not restart an unhealthy process, so investigate repeated health failures instead of relying on a restart loop.

## Acceptance

Before declaring the release ready:

1. Match public data hashes, source policy, inventory and deterministic results with the local workspace.
2. Run API smoke checks over HTTPS, including invalid parameters and rejected cross-origin mutations.
3. Check the overview, library, manual source/indicator selection, comparison availability and mobile layout.
4. Ask real AI questions covering skills, an official source and a follow-up; confirm citations, chart values and source dates.
5. Confirm conversation isolation, HTTPS cookie flags, reload persistence and persistence through a container restart.
6. Check logs for startup/provider errors, then verify health and public access again after restart.

`MARKET_RADAR_TEST_URL` points the repository's smoke and browser helpers at the chosen server. Live AI helpers make billable calls. Use isolated test sessions and respect the public rate limiter; never copy the local `.runtime` directory to production.

## Backup and rollback

Keep runtime backups private. From the release directory on the VPS, use Python's standard SQLite online backup API without stopping the application:

```sh
python3 deployment/backup-runtime.py
```

The helper opens the source read-only, creates a unique mode-0600 snapshot under `/srv/hackaton/shared/backups`, checks its SQLite integrity and fails after a bounded wait. It preserves existing backups and needs no third-party Python packages. Optional `--database` and `--destination` arguments support an isolated restore rehearsal. Copying only the active database while WAL writes continue is not a valid backup method. Backup scheduling and off-host copies are not configured; run a fresh backup before changes to application persistence or conversation schema.

To restore, stop the application, preserve the current database and its WAL/SHM sidecars in a private recovery directory, then install the verified backup as `conversations.sqlite` with owner `1000:1000` and mode 0600. Do not leave old WAL/SHM files beside the restored database. Start the service, verify health and retrieve a known session. Restoring requires the same application schema and the browser's existing session cookie; the backup does not provide account-based recovery.

Retain the previous image, its source, the same verified data archive and the prior non-secret deployment environment file. For a compatible application rollback, set the earlier image in `production.env` and run the same Compose command. Keep the production conversation directory mounted; do not replace it with the candidate store. If a future release changes the conversation schema, require a tested backward-compatible migration or a verified database backup before cutover.

If the initial MVP cutover fails before acceptance, stop the new `market-radar` service and start the preserved placeholder Compose project again on port 3000. Caddy and certificates remain unchanged. Removing the candidate service after acceptance must not delete production persistence or the original archive.

This document describes the reproducible deployment procedure. The deployment operator records the actual revision, image tag, verification results and rollback target after the release is accepted.

## Initial deployed release — 21 November 2026

- Public URL: `https://hackatonprojekt.net`; health: `/healthz`.
- Application baseline: `461dbac22dbd6987ae3a40351f8a0993c1c82e99`; the deployment commit also adds the brand favicon. The exact source revision and image are recorded in the server release's `deployment-record.json`.
- Release directory: `/srv/hackaton/releases/20261121-461dbac`.
- Image: `market-radar:20261121-461dbac-r3`, built on the ARM64 server. The deployment revisions remove an unnecessary Linux system-CA command-line flag and add the brand favicon; analytical behavior is unchanged.
- Compose project: `market-radar`; service: `app`; container: `market-radar-app-1`.
- Caddy retains its existing certificates and proxy to `127.0.0.1:3000`.
- Public data release: `0.6.0-local`; active source policy: `2026-11-21.1`; 10 datasets, 595 series, 3,445 observations.
- Public SQLite SHA-256: `1a345db2eb4ae18f2f19b6eb5721da7ff4f07bc056291a8c95464b68c6fdfd3d`, identical to the tested local file.
- Private production history starts independently of local history. The candidate uses a separate directory and is stopped after acceptance.
- The original placeholder remains stopped in `/srv/hackaton/bootstrap`, project `hackaton`; its image and files remain available for initial emergency rollback. The preceding `market-radar:20261121-461dbac` image also remains available.

From the release directory, inspect or restart the running service with:

```sh
docker compose -p market-radar --env-file production.env -f deployment/compose.yaml ps
docker compose -p market-radar --env-file production.env -f deployment/compose.yaml logs --tail 50
docker compose -p market-radar --env-file production.env -f deployment/compose.yaml restart app
curl --fail https://hackatonprojekt.net/healthz
```

Do not use `docker compose config` or unrestricted `docker inspect` in shared output: resolved environment variables can contain credentials. Query only specific non-sensitive fields when diagnosing configuration. The server's historical `/srv/hackaton/repository` clone is not the deployment source; the versioned release directory is authoritative.


## Sidebar and loading update — 21 November 2026

The sidebar/loading release is `/srv/hackaton/releases/20261121-sidebar-loading`, image `market-radar:20261121-sidebar-loading`, Compose project `market-radar`. Its `deployment-record.json` records the source revision. The previous accepted release and image remain available for rollback. Data, runtime directories and secrets remain at the shared paths documented above.

Caddy now serves HTTP/1.1 and HTTP/2 over the existing HTTPS configuration. A reproducible client-network HTTP/3 fallback stalled a bootstrap request for approximately 22 seconds before sending it over HTTP/2, while server preparation took about 60 ms. HTTP/3 is disabled with the global `servers { protocols h1 h2 }` configuration and both domains send `Alt-Svc: clear` to expire cached advertisements. The checked configuration is tracked in `deployment/Caddyfile`; validate before installing it and reload the existing host service. Certificate validation, certificate renewal and redirects remain enabled. The prior Caddy configuration is preserved at `/srv/hackaton/ops/Caddyfile.before-http2-20261121`.

Bootstrap and conversation-loading requests have a 10-second deadline covering both response headers and JSON content, with visible retry actions. A later bootstrap retry cancels the prior attempt; conversation-history failures do not block the manual dashboard. The AI response stream retains its separate analysis deadline.


## Routing update — 21 November 2026

The routing release uses `/srv/hackaton/releases/20261121-routing`, image `market-radar:20261121-routing`, with the same Compose project, shared dataset and conversation directory. The preceding accepted release `/srv/hackaton/releases/20261121-sidebar-loading` remains the rollback target. The exact deployed commit and acceptance results are recorded in the server release's `deployment-record.json`.

Caddy continues proxying every application route to Next.js; no static fallback or rewrite to `/` is needed. Preserve the existing HTTP/1.1 and HTTP/2 configuration and `Alt-Svc: clear`. Verify all five direct page URLs, the root redirect, a real 404, copied analytical filters and AI continuity with `scripts/qa-routing.mjs`. There are no database migrations or data-release changes in this update.


## Decision workspaces update — 21 November 2026

The decision-workspaces release uses `/srv/hackaton/releases/20261121-decisions`, image `market-radar:20261121-decisions`. The previous accepted routing release remains the rollback target. Dataset and shared runtime mounts are unchanged. A pre-cutover online backup is required: this increment creates an additive `conversation_briefs` table for per-session decision context. It preserves all existing tables/rows and is compatible with rolling back to the preceding application.

Verify `/opportunities`, `/participants`, the ordinary Explorer and AI, including a participant group/canton follow-up. Run `scripts/qa-decision-workspaces.mjs` for deterministic browser checks and `scripts/live-decision-check.mjs` for a separate paid-provider check. The server deployment record contains exact revisions, backup path and acceptance results. Caddy configuration remains unchanged.


## Context consistency update — 21 November 2026

The context-persistence release uses `/srv/hackaton/releases/20261121-context`, image `market-radar:20261121-context`, with `/srv/hackaton/releases/20261121-decisions` retained for rollback. It adds an explicit session-context PATCH endpoint; the SQLite schema, source policy and dataset stay unchanged. Take an online backup before cutover and retain the shared production history. Candidate checks use a separate conversation directory.

Acceptance includes `qa-context-persistence.mjs` and the paid `live-decision-consistency.mjs` in addition to decision-workspace and local/production parity checks. Record the deployed application commit, actual test outcomes and backup in `deployment-record.json`. The server keeps the existing Caddy HTTP/1.1 and HTTP/2 configuration.

## Brand update — 21 November 2026

The brand release uses `/srv/hackaton/releases/20261121-brand`, image `market-radar:20261121-brand`, with the context-persistence release retained for rollback. The existing Docker build allowlist includes `public/fonts/`; self-hosted font files and licences must be present in the final image. No external font service, additional runtime dependency, database migration or data update is needed. Check the three preloaded font URLs, all seven pages, the browser-rendered styles, health and local/production analytical parity after cutover. Exact source revision and acceptance results belong in the server release record.
