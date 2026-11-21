# Market Radar design and interaction QA

## Brand adaptation

The supplied 1672 × 941 reference image was used for the Powercoders header, logo treatment and red accent. Its illustrative numbers, candidate-matching cards and other unsupported features were not imported into the analytical product.

The original logo artwork comes from the [Powercoders SVG asset](https://powercoders.org/wp-content/uploads/2022/10/powercoders-logo-1.svg). Its proportions are preserved. The white full-width header combines the wordmark, a divider and the Market Radar name. Neutral surfaces and charcoal text support a crimson primary accent.

Chart and filter colors use the same comparison palette: `#b51235`, `#526a92`, `#aa762a` and `#23847d`. Distinct colors remain available for multi-series comparisons; the selected topic and primary actions use crimson.

The current type scale is defined in `src/app/typography.css`: prominent 32–44 px page headings, 16 px analytical prose, larger form controls and 13–14 px evidence labels. Mobile overview cards use one column so their text remains readable. Source captions and limitations retain sufficient size to be useful, rather than becoming decorative fine print.

The completed brand review covered Explorer and AI Analyst desktop views, a 390 × 844 mobile viewport, navigation, preserved conversation content, evidence links and the connected chart. The final review found no horizontal mobile overflow or browser errors. Build and TypeScript checks passed for that change. This was a scoped brand adaptation, not a pixel-perfect reproduction of the entire reference dashboard.

## Multi-source workspace

The full-data integration added a multi-source overview, searchable Data library, source provenance and explicit national versus regional coverage. Browser checks covered the six overview cards, national library, BFS/SEM/Eurostat exploration, a regional transition, source details and mobile layout. Local screenshots were generated as test artifacts and are not included in the repository.

The subsequent source-selector review found a valid data limitation presented with insufficient explanation: named skill trends have ITBoard evidence only, but the old topic-filtered selector concealed the other datasets. It also identified Eurostat occupational groups filed only under Market context and inconsistent behavior around incompatible rankings and failed filter changes.

The resulting interaction design is:

- Show all 10 source datasets in the Source selector, grouping current-topic sources separately from sources that require a topic switch.
- Explain each topic's data coverage; do not imply that every source supplies named skill trends.
- Include Eurostat occupational shares under Roles, with percentage-aware measures and no invented counts.
- Provide a primary Choose indicator control independently of the compatible-comparison picker.
- Replace Compare with a specific explanation when there is no compatible alternative. Show only compatible options in the picker, with an explicit four-series limit and removal controls.
- Hide unsupported rankings and preserve the last successful chart and filters if a request fails.
- Clear an incompatible regional-only source filter when the library returns to national coverage.

See [Validation](docs/VALIDATION.md) for the current automated, browser and live-AI checks. Numeric results come from the deterministic backend. Browser transport simulations are distinguished from actual LLM calls. Screenshots remain local test artifacts.

## Repeating QA

Run TypeScript and unit checks, build the app, start it locally and run the API smoke check. Run `node scripts/qa-explorer.mjs`, `node scripts/qa-full-data-ui.mjs`, `node scripts/qa-analyst-workspace.mjs` and `node scripts/qa-comparison-ui.mjs` with `MARKET_RADAR_TEST_URL` pointing to the app. Installed Chrome is the default browser; override it with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` or `PLAYWRIGHT_CHANNEL` when needed. Allow the request-rate window to clear before repeating the full suites.

Review the source menu from Skills, open an official Roles source and a contextual source, switch to a regional-only source, choose another indicator, and verify a compatible comparison. Check that invalid date requests preserve the prior successful view, and repeat the navigation at mobile width. Source, period, unit, selected indicator and chart values must remain consistent throughout.
