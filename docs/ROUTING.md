# Workspace routing

Each workspace screen has a real Next.js App Router page. The shared layout keeps the catalog, current analytical result, conversation and unfinished question mounted during navigation.

| Route | Purpose |
| --- | --- |
| `/` | Server redirect to `/overview` (307) |
| `/overview` | Six sourced market and participant panels |
| `/library` | Searchable indicator catalog |
| `/explore` | Manual filters, calculations and chart controls |
| `/analyst` | Conversation and linked analytical canvas |
| `/sources` | Source directory, dates, coverage and limitations |

Unknown paths return HTTP 404 with a link to the overview. Each page has its own document title and active navigation link. The workspace error boundary offers a retry. Existing `/api/*` and `/healthz` endpoints retain their contracts.

## Public analysis links

The Explorer and Analyst use the same validated analytical parameters:

| URL parameter | Contract field / allowed value |
| --- | --- |
| `series` (repeatable) | `seriesIds`, up to four exact catalog IDs |
| `mode` | `history`, `snapshot`, `ranking` |
| `measure` | `reported`, `count`, `share` |
| `geography` | Published geographic ID, such as `CH` |
| `topic`, `source`, `metric` | Catalog scope; `source` maps to `sourceId` |
| `start`, `end` | Real ISO calendar dates; inclusive observation-end filters |
| `sort` | `rankingBy`: `value` or `change` |
| `limit` | Ranking size, 1–20 |
| `view` | Backend-permitted `line`, `bar`, `table` or `metric_cards` |

Example: `/explore?series=itboard_monitor_python_open_ads&series=itboard_monitor_docker_open_ads&geography=CH&mode=history&measure=share&start=2026-10-01&end=2026-11-15&view=table`.

Copy the browser address to share a public analysis. Opening it in another browser recalculates the same query from the installed data release. A link contains filters, not an immutable data snapshot: a future release can change the returned observations. Source compatibility and availability are still enforced by the backend.

Manual filter and chart changes add browser-history entries. Back and Forward restore the query and view; reloading or opening a link directly does the same. Automatic AI result updates replace the current URL, avoiding a history entry for every streamed event. Same-page filter changes use Next.js's integrated native History API without a server navigation for every control click.

Explicit URL filters take precedence over restored conversation scope. A bare analytical route uses the current or restored working scope and writes its canonical public URL. Unsupported, duplicated or invalid parameters show an explanation and a recovery action; they do not silently select a different source. If loading fails, the previous verified result stays visible with an error. Query cancellation and navigation revisions prevent late responses from replacing a newer selection.

## Library links

`/library` accepts `q` (up to 200 characters), `source`, `topic` (`all`, `skills`, `demand`, `participants`, `regional`), `coverage` (`CH` or `all`) and `page` (1–100, expanded result batches). Defaults are omitted. Search typing replaces the current entry; discrete filter changes add an entry. Example: `/library?topic=participants&coverage=all&q=permit+S`.

The shared layout remembers the last library URL while moving between screens. A source card links directly to its filtered library. Unavailable source IDs display a reset action.

## Conversation privacy and continuity

Links never contain conversation IDs, cookies, questions or answers. Opening another person's analytical link does not open their conversation. Anonymous history remains scoped to the existing browser session cookie and separate server-side SQLite store; routing introduces no account or cross-device synchronization.

Switching workspace pages preserves the draft and an in-flight AI request. Results received while another screen is open remain available in the conversation without navigating the user away. Reloading restores persisted conversation history, but not an unsent draft or a browser request interrupted by the reload. The existing initial question plus 20-follow-up context contract is unchanged.

## Implementation and verification

- `src/app/(workspace)/layout.tsx`: persistent shared workspace.
- `src/app/(workspace)/*/page.tsx`: page entry points and metadata.
- `src/lib/workspace-routing.ts`: typed URL serialization and validation.
- `src/components/market-radar.tsx`: shared controller and screen components.
- `tests/workspace-routing.test.ts`: all-catalog round trips and invalid input bounds.
- `scripts/qa-routing.mjs`: browser navigation, reload, copied links, error recovery, mobile sources and delayed history/AI transport.

The browser routing suite uses real analytics with simulated AI transport; it does not make provider calls. Run it with `MARKET_RADAR_TEST_URL` pointing to the local or deployed app.
