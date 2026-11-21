# Validation record

Current status checked **21 November 2026**. This records representative scenarios and automated invariants, not a guarantee that every natural-language question will be interpreted correctly. Exact historical counts below refer to their stated release; mocked model transport is distinguished from real-provider checks.

## Latest status

| Check | Most recent recorded result |
| --- | --- |
| Saved dataset verification | Passed again during this documentation refresh: archive hashes, integrity, eligibility and active scope |
| Deterministic suite | **76/76 passed**, rerun during this documentation refresh; no live provider calls |
| TypeScript / production builds | Passed for the brand release, locally and natively on ARM64 |
| API smoke | Passed for the brand release |
| Local/production parity | Brand release: seven groups, eleven analytical comparisons across all ten datasets, three complete decision briefs |
| Context persistence | Context release: five browser scenarios, including pre-question handoff and clearing/reload |
| Live decision consistency | Context release: eight real questions / eleven checks; cited results, tables and sources agreed |
| Visual brand acceptance | All seven local routes at desktop/mobile sizes; public desktop overview and mobile participant context; no recorded runtime errors |
| Font delivery | Candidate: all ten served WOFF2 hashes; public HTTPS: three preloaded fonts returned 200 with `font/woff2` |
| Current production | Rechecked healthy during this documentation refresh: `market-radar:20261121-brand`, 595 series, AI configured |

The running application commit is `3817a3b47257991a00bad7a0f9959db687171b4a`. The subsequent documentation revisions do not rebuild it. The brand pass and this documentation refresh did not repeat the previous eight-question provider suite. AI configuration in `/healthz` is not a provider-connectivity test.

## Data verification

Active scope is 10 datasets, 595 series and 3,445 observations, including 168 national series and 2,015 national observations. The immutable archive also retains the excluded Thurgau vacancy source: 11 datasets, 598 series and 3,599 observations. Other sources' Thurgau canton slices remain active. [Data](DATA.md) lists exact source IDs, periods and limitations.

`npm run data:verify` verifies the saved files, not a fresh publisher download or publisher microdata. The serving database SHA-256 is `1a345db2eb4ae18f2f19b6eb5721da7ff4f07bc056291a8c95464b68c6fdfd3d`, matching production. A clean clone requires the separately supplied approved package. Raw-source audit artifacts, credentials, cookies and synthetic transcripts are not published in Git.

## Deterministic tests

With the approved dataset installed, run:

```powershell
npm run data:verify
npm run typecheck
npm test
npm run build
```

Stop the local production server before rebuilding its output. The 76-test suite covers:

- Every active series through the engine and every source through a mocked discovery/computation/citation cycle.
- Exact Python/Docker values and denominators, missing periods, published percentages, regional scope and incompatible comparisons.
- Permitted views, rankings, source/topic transitions, saved Eurostat query migration and removed-source protection.
- Initial question plus twenty follow-ups, exact recall, session isolation, bounded tools/tokens and rejected citations/numerical claims.
- URL round trips for all 595 indicators, invalid/repeated parameters and library filters.
- All 35 role options and all three SEM groups across Switzerland plus 26 cantons, with separate metrics and denominators.
- Pre-question decision-context persistence, chart-only resets, validation before mutation and concurrent-write exclusion.

These model-loop tests use mocks. The automated 20-follow-up scenario establishes state/recall behavior; it is not a 20-question live-model acceptance run.

## API and local/production checks

With the app running, `npm run test:api` checks data health, bootstrap, deterministic comparisons, invalid parameters, origin checks and session cookies. Set `MARKET_RADAR_TEST_URL` to select a host. For Windows direct Node HTTPS requests, retain the configured system CA:

```powershell
$env:MARKET_RADAR_TEST_URL = "http://127.0.0.1:3000"
node --use-system-ca scripts/smoke-api.mjs
node --use-system-ca scripts/check-production.mjs
```

`check-production.mjs` uses `MARKET_RADAR_LOCAL_URL` (default `http://127.0.0.1:3000`) and `MARKET_RADAR_PRODUCTION_URL` (default `https://hackatonprojekt.net`), not `MARKET_RADAR_TEST_URL`. It requires HTTPS for production and configured AI keys on both hosts, but never invokes the model. It compares complete catalog/inventory/overview metadata, eleven ordinary results, three briefs, cookies, input/origin protection, public assets and exclusion of private paths. It ignores only generation timestamps when comparing results. Reports and isolated test-session cookies stay under `.runtime/`.

## Browser checks

Use a running app and installed Chrome. The following suites use real analytics and simulated AI transport where needed; they do not make provider calls:

```powershell
$env:MARKET_RADAR_TEST_URL = "http://127.0.0.1:3000"
node scripts/qa-routing.mjs
node scripts/qa-explorer.mjs
node scripts/qa-full-data-ui.mjs
node scripts/qa-analyst-workspace.mjs
node scripts/qa-comparison-ui.mjs
node scripts/qa-decision-workspaces.mjs
node scripts/qa-context-persistence.mjs
```

Use `PLAYWRIGHT_CHANNEL` for another installed browser channel; helpers that support `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` accept an explicit executable. Consult the selected helper's launch configuration rather than assuming every live helper supports both. Screenshots/reports remain in ignored `test-results/`. Repeated suites can reach the application's per-minute request limits; allow the rate window to clear.

Recorded source-scope acceptance covered 10 source transitions, 22 offered manual modes, 40 AI view combinations and 12 context transfers. Comparison acceptance covered BFS/SEM single-indicator explanations, compatible-only menus, selection/removal, search and the four-series limit. A separate compatibility audit checked 8,019 allowed pair/measure combinations, 68 four-series selections and 74 ranking/history/measure transitions. These are historical checks, not additional counts in the current 76-test suite.

Routing acceptance covered ten scenarios including direct links, Back/Forward, reload, invalid links, drafts, delayed history and in-flight simulated AI. Decision-workspace and five context-persistence scenarios verified role/group/canton changes and pre-question handoffs. The context audit found and fixed a bug where Use chart only cleared the banner but not the stored brief; explicit handoffs now save through PATCH before navigation.

## Real-provider checks

These commands make billable requests to the running server's configured model. Use synthetic questions and isolated QA sessions:

```powershell
$env:MARKET_RADAR_TEST_URL = "http://127.0.0.1:3000"
node --use-system-ca scripts/live-ai-check.mjs "How has Python changed in the last two snapshots?"
node --use-system-ca scripts/live-ai-coverage.mjs itboard_monitor_csv
node scripts/live-decision-check.mjs
node scripts/live-decision-consistency.mjs
```

Omit the source argument to `live-ai-coverage.mjs` only when intentionally checking every source. `live-ai-check.mjs` retains its own QA conversation for follow-ups in `.runtime/`; it does not use a browser user's cookie. The decision helpers use isolated browser sessions and installed Chrome (or `PLAYWRIGHT_CHANNEL`). Never publish their saved cookies or transcripts.

Earlier production acceptance obtained validated cited results for all ten datasets, Python → Docker, HSLU research and the saved provisional SECO notice. A programme-expansion question used ITBoard, Eurostat and HSLU evidence and identified missing programme outcomes/capacity. A SECO qualification exposed a numerical-validator false positive; the fix accepts values from cited qualifications and rejects unrelated or altered numbers.

The context release's eight real questions / eleven consistency checks covered S → refugee B in Zürich, a Bern follow-up, unavailable SEM history, separate all-group denominators, Data Analyst → IT Support and unavailable junior × role × Python intersections. Every cited numerical result matched a fresh engine query; visible chart tables, counts, denominators and original source links agreed. The chart-only reset and saved answers survived reload. There were no recorded browser runtime errors.

## Production and reliability acceptance

The brand image was built natively on ARM64 from the reviewed commit and lockfile. Candidate and public acceptance verified all seven page routes, self-hosted assets and expected source inventory. Production retained its read-only public dataset and separate persistent history. A fresh online backup passed SQLite integrity checks before cutover; the prior context release remains the rollback target. See [Deployment](DEPLOYMENT.md) for exact paths and limits.

Earlier deployment acceptance also checked Secure/HttpOnly/SameSite cookies, rejected cross-origin mutations, invalid parameters, private-file 404s, HTTPS redirects, progressive NDJSON events, container-recreation history persistence, and an isolated no-key candidate where manual analytics remained functional. A synthetic WAL test verified the online backup includes committed WAL content and stays independent of later writes.

The loading regression audit reproduced an approximately 22-second HTTP/3 fallback on the tested client network. The retained Caddy HTTP/1.1+HTTP/2 configuration and `Alt-Svc: clear` removed that delay in five measured loads (first about 1.334 s; reloads 0.356–0.450 s). These are measurements on that connection, not latency guarantees. Separate simulated stalled bootstrap/history checks exercised the 10-second deadline and visible retry; history failure did not block the manual overview.

Brand verification compared the supplied Figma guide with rendered desktop and 390 px mobile views, including charts, filters, source drawers and the Cyrillic composer. Key measured text contrast exceeded 4.5:1, chart/white contrast 4.7:1 and control/white contrast 3:1. This is not a complete accessibility certification. Font/asset provenance and screenshots are described in [Design system](DESIGN-SYSTEM.md) and [visual QA](../design-qa.md).

The documentation refresh reran dataset verification and all 76 tests and rechecked the current healthy release/resources. It did not change application code, re-run every historical browser scenario, re-run the paid-provider suite or restart production.
