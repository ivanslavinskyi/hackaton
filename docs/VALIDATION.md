# Validation record

Checked locally and on `https://hackatonprojekt.net` on 21 November 2026. This records representative scenarios and automated invariants, not a guarantee that every possible natural-language question will receive a correct interpretation.

## Active data scope

The workspace serves 10 datasets, 595 series and 3,445 observations. National coverage is unchanged at 168 series and 2,015 observations. The Thurgau vacancy source is excluded by the shared source policy. Other sources' observations for the canton of Thurgau remain available.

The original reviewed archive contains 11 datasets and is retained unchanged for checksum verification. `npm run data:verify` reports archive counts separately from active counts. A clean clone requires that external archive; data and private test transcripts are not published in Git.

## Deterministic and tool-loop tests

The final active-source suite passed **63 tests** and TypeScript checking.

`npm test` covers each active series through the analytics engine and every source through a mocked model's complete discovery, computation, citation and presentation cycle. The calculations use the actual serving data. Additional cases cover:

- Exact Python/Docker values, changing denominators, missing periods and explicit regional scope.
- Published percentages remaining percentages; unsupported counts and comparisons are rejected.
- Four permitted view types: line, bar, table and metric cards.
- Manual context, saved Eurostat topic migration and follow-up view changes.
- Initial question plus twenty follow-ups, exact recall and session isolation.
- Source-policy exclusions, including previously saved results and evidence.
- Bounded tools, timeouts, invalid parameters, unsupported citations and rejected numerical claims.

## Live model checks

Real requests used the server-configured OpenAI model and isolated test conversations. Each retained dataset produced a validated answer citing its actual backend result:

| Dataset | Representative question |
| --- | --- |
| ITBoard | Python trend; follow-up comparison with Docker |
| Eurostat ICT share | Latest ICT share and its rolling reporting window |
| Eurostat occupational groups | Software/application developer and analyst share |
| Eurostat annual change | ICT advertisement year-on-year change |
| BFS JOBSTAT | Estimated IT and information-services vacancies |
| SECO | Registered vacancies, reporting period and coverage qualification |
| SEM permit F | Registered employment rate |
| SEM refugee permit B | Employment rate and the absence of a multi-period trend |
| SEM status S | Employment rate with population limitations |
| Fribourg | Registered cantonal vacancies |

A separate live request retrieved the HSLU Python/Data Analyst finding and the saved SECO policy notice, citing their dates and explicitly preserving the policy's provisional, unverified-current status.

The first SECO run exposed a validator false positive: a correct figure from a cited source qualification was rejected. The validator now includes qualifications from that cited result. Regression tests accept the documented figure and reject altered, uncited and unrelated figures. The repeated live SECO request passed.

`scripts/live-ai-coverage.mjs` repeats live source checks and makes billable API calls. An optional source ID argument limits a rerun to one dataset. Its transcripts stay in ignored `.runtime/` files.

## Browser checks

The manual Explorer suite checks all active source transitions and offered views, direct indicator replacement, percentage labels, incompatible rankings, library coverage changes, simulated API failure recovery and mobile layout.

The comparison UI suite checks BFS and SEM single-indicator explanations, source datasets without alternatives, compatible-only role and skill menus, selection/removal, search and the four-series limit. The compatibility audit also exercised 8,019 allowed pair/measure combinations, 68 four-series selections and 74 ranking/history/measure transitions without an invalid query.

The AI workspace suite checks every active source in all four supported views and verifies context transfer from the manual explorer, overview and library. It also checks result citations, original source links, the source drawer, return to manual exploration and active-view synchronization.

The final source-scope browser pass covered 10 source transitions, 22 offered manual modes, 40 AI view combinations and 12 context-transfer checks. The subsequent comparison and typography pass checked readable desktop/mobile text, selection limits, empty comparison alternatives and modal layout without JavaScript errors or horizontal overflow at 390 px.

For this UI suite, the NDJSON model response is simulated while numerical results come from the real backend. These tests establish interface behavior; the separate live-model checks establish that the provider and tools can complete the representative analytical scenarios.

Run against a local app with installed Chrome:

```powershell
$env:MARKET_RADAR_TEST_URL = "http://127.0.0.1:3000"
node scripts/qa-explorer.mjs
node scripts/qa-full-data-ui.mjs
node scripts/qa-analyst-workspace.mjs
node scripts/qa-comparison-ui.mjs
```

Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` or `PLAYWRIGHT_CHANNEL` for a different browser installation. Repeated full suites can hit the same rate limits as real users; allow the rate window to clear between reruns. Test screenshots and reports remain in ignored `test-results/`.

## Production acceptance

The final service was built natively on Linux ARM64 from the same application source and lockfile. Docker runs one non-root Next.js process behind the existing Caddy HTTPS proxy. Deployment added the favicon and runtime/service configuration; it did not change analytical calculations or source policy.

- Public serving-file SHA-256 checksums match the local copies. `/healthz` reports 595 active series and configured AI.
- `scripts/check-production.mjs` passed six groups of checks and 11 queries: all 10 source datasets plus a Python/Docker comparison. The full bootstrap catalog, inventory, six overview panels and deterministic result objects match local results, excluding generation timestamps only.
- HTTPS cookie flags are Secure, HttpOnly and SameSite=Lax. Cross-origin mutations return 403, invalid analytical parameters return 400, and private file paths return 404. HTTP and www redirects work; app ports bind only to host loopback.
- The live provider completed all 10 source scenarios and the Python-to-Docker follow-up. A separate programme-expansion question used ITBoard, Eurostat and HSLU evidence, returned two linked charts and explained missing programme outcome and capacity information.
- NDJSON events arrived progressively through the public proxy; the programme question produced its first status within a second, intermediate analytical results and the final validated answer.
- After replacing the production container, the entire saved AI conversation, results, evidence and scope were unchanged. A saved manual result also matched exactly. A further real-model follow-up reused the previous evidence and both charts successfully.
- An isolated candidate with no API key returned the expected AI-unavailable response while manual analytics and data health remained operational.
- Production browser checks passed 10 source transitions, 22 manual views, comparison compatibility/limits, 40 AI view combinations and 12 context transfers. Final desktop/mobile checks found no JavaScript errors, console errors or horizontal overflow at 390 px. UI model transport was simulated; the live-provider checks above were separate.
- The final API smoke test passed. A private online conversation backup passed SQLite integrity checking; an independent synthetic WAL test verified that committed WAL content is included and later writes do not alter the backup.
- Resource limits, read-only data/root mounts, restart policy and log rotation were inspected. The application was healthy after recreation; the temporary candidate was stopped.

Windows QA retained TLS verification and trusted the workstation's configured system CA. Browser tests used HTTP/2 after the local inspected connection produced QUIC transport errors; no server TLS weakening or certificate bypass was applied. A missing favicon found during inspection was fixed and the final browser console was clean.

Private production test transcripts, session cookies and reports stay in ignored `.runtime/` and `test-results/`; neither credentials nor conversation data are published. Deployment operations, backup and rollback instructions are in [Deployment](DEPLOYMENT.md).


## Sidebar and loading regression check — 21 November 2026

The workspace footer no longer uses an avatar. Its full label and bottom spacing fit desktop viewports of 1440x900, 1280x720, 1024x600, 1200x450 and 1100x300; navigation scrolls when necessary and long labels wrap. The decorative evidence card is omitted on short desktop windows. Mobile navigation at 390 px retains its intended layout without horizontal overflow.

A stalled bootstrap request was aborted after the 10-second deadline, showed a clear error and recovered through Try again. A separately stalled conversation request allowed the overview to appear in approximately 0.5 seconds, then offered Reload conversation; retry restored history successfully.

The intermittent production delay was reproduced in default Chrome: approximately 22.5 seconds, mostly spent waiting before HTTP/2 fallback from HTTP/3. After configuring Caddy for HTTP/1.1 and HTTP/2 with Alt-Svc cleared, five default-Chrome loads completed without transport errors: 1.334 seconds for the first load, 0.356–0.450 seconds for reloads, with bootstrap taking 133–215 ms. These are measurements on the tested connection, not a universal latency guarantee.
