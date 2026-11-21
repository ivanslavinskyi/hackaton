# Market Radar

An evidence-led workspace for Powercoders to explore the Swiss IT labour market. Staff can investigate data manually or ask an AI Analyst to discover indicators, run the same deterministic calculations, and explain the results with sources and limitations.

The MVP uses a **frozen, reviewed data release**, not a live feed or a census of Swiss vacancies. The interface is English; the analyst can answer in the user's language.

**Live MVP:** [hackatonprojekt.net](https://hackatonprojekt.net). The production service runs the same analytics engine and approved data as the local workspace, with a separate private conversation store.

## What is implemented

- **Market overview:** six separate views of skills, industry vacancies, occupational advertisements, registered vacancies and participant context.
- **Data library:** all 595 approved indicator series, searchable by source and topic. The default is the 168 national series; regional slices are an explicit option.
- **Market explorer:** source, indicator, geography, period and measure controls; history, snapshots and compatible rankings; charts and underlying values. The source selector lists all 10 datasets and changes topic when a source does not support the current topic. Choose an indicator directly, then add compatible comparisons.
- **Sources & coverage:** a dedicated directory for all active datasets, source dates, research evidence and limitations.
- **AI Analyst:** six typed tools, backend-generated chart data, source references and structured findings. Original questions and results remain retrievable across at least an initial question and 20 follow-ups.

Named skill trends currently come **only from ITBoard**. Eurostat occupational groups are available under **Roles**. Other sources provide complementary market or participant context; switching source does not imply that the same skill or population exists there.

Compare appears only when the current selection has compatible alternatives. Otherwise the Explorer explains the single-indicator view and keeps the main indicator selector available. Comparison menus show compatible options only and explicitly explain the four-series limit. The shared typography uses larger headings, readable body text and responsive filter, table and evidence labels.

## Pages and shareable analysis

The workspace has dedicated routes: `/overview`, `/library`, `/explore`, `/analyst` and `/sources`. `/` redirects to the overview. Explorer filters and chart selection are encoded in the URL; library links retain search and filters. Direct links, reload and browser Back/Forward restore the corresponding view.

The shared layout preserves the conversation, unsent question and in-flight AI analysis while switching pages. Shared links contain public analytical filters only, never private chat history. See [Routing](docs/ROUTING.md) for parameters, privacy and recovery behavior.

## Data coverage

The active workspace uses **3,445 numeric observations, 595 series and 10 source datasets** from the frozen `0.6.0-local` archive reviewed **21 November 2026**. The Thurgau vacancy dataset is excluded by project scope; the original archive and its checksums are preserved for provenance. Of these, 2,015 observations and 168 series have national Swiss scope. A dataset is a particular extract or table, not necessarily a separate publisher. Counts include related measures and derived values, not 3,445 unique jobs.

| Source family | Available evidence | Main limitation |
| --- | --- | --- |
| ITBoard | Named technologies, roles, experience and selected regions; snapshots from January to November 2026 | One platform sample; changes can reflect coverage as well as demand |
| Eurostat | ICT share, seven occupational groups and annual change in online advertisements, through Q3 2026 | Share observations use overlapping four-quarter windows; not vacancy counts |
| BFS / FSO JOBSTAT | Three industry vacancy series, Q2 2003 to Q2 2026 | Employer industry is not employee occupation |
| SECO | National registered vacancies since 2004, plus sparse cantonal observations | Registered vacancies across occupations; not all Swiss IT vacancies |
| SEM | Working-age population, employed population and employment rates for F, refugee B and S groups | One snapshot, 31 October 2026; all sectors, not graduate outcomes |
| Fribourg | Published cantonal registered-vacancy indicators | Regional context, not a national estimate |

Selected HSLU research findings and a dated, provisional SECO policy notice are available as cited evidence. Get U Hired research rows are excluded from numerical analysis. There is no verified **role × named skill × time** or **junior × named skill** intersection, programme placement outcome, or causal training-effect estimate.

## Local setup

Requirements: **Node.js 24.9 or later**, npm, and the separately supplied approved release package. SQLite is built into Node; no database service or Docker is required. Windows PowerShell is the tested local environment.

**A clean clone does not contain the dataset.** The repository excludes `data/`. `data:prepare` validates and copies an existing release; it does not download publishers' data or recreate the acquisition pipeline.

The approved release directory must contain:

```text
manifest.json
market-radar-public-ch.sqlite
capabilities-public-ch.json
capabilities-regional-ch.json
```

From the project directory:

```powershell
npm ci
npm run data:prepare -- "<approved-release-directory>"
npm run data:verify
Copy-Item .env.example .env.local
```

Replace the placeholder with the directory containing the reviewed `0.6.0-local` package. The preparation script checks the expected version, manifest hashes, SQLite integrity and serving scope, then writes the application files into `data/`. Without an explicit directory, it tries sibling discovery directories from the original local workflow; use the explicit argument for reproducible setup elsewhere.

Set `OPENAI_API_KEY` in `.env.local` to enable AI. Leave it blank for manual analytics. Keep the key server-side; `.env.local` must never be committed or included in a public artifact. `OPENAI_MODEL` is configurable; `.env.example` records the current default.

```powershell
npm run build
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The production-local launcher loads `.env.local`, copies static assets into the standalone build and binds to loopback. For development, use `npm run dev` instead.

| Environment variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Server-side OpenAI credential; optional for manual analysis |
| `OPENAI_MODEL` | Responses API model with function calling and structured output support |
| `MARKET_RADAR_DATA_DIR` | Optional absolute path to prepared serving files; default `data/` |
| `MARKET_RADAR_SESSION_DB` | Optional path to the writable conversation database; default `.runtime/conversations.sqlite` |
| `PORT` | Local server port; default `3000` |
| `MARKET_RADAR_RELEASE_DIR` | Optional input directory for `data:prepare`; the command-line argument takes precedence |

`data:prepare` always writes to the project's `data/` directory. If using another runtime data directory, provision the prepared files there separately. Existing conversation data is independent of the public data file.

## Verification

```powershell
npm run data:verify
npm run typecheck
npm test
npm run build
```

With the app running, `npm run test:api` checks health, bootstrap data, deterministic comparisons, invalid parameters and session protections. Set `MARKET_RADAR_TEST_URL` to test another local address. Unit tests use mocked AI responses; they do not require a key. `scripts/live-ai-check.mjs` makes real, potentially billable AI requests and stores its own test conversation under `.runtime/`.

Browser regression checks use an isolated headless browser:

```powershell
$env:MARKET_RADAR_TEST_URL = "http://127.0.0.1:3000"
node scripts/qa-routing.mjs
node scripts/qa-explorer.mjs
node scripts/qa-full-data-ui.mjs
node scripts/qa-analyst-workspace.mjs
node scripts/qa-comparison-ui.mjs
```

They use installed Chrome by default. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to another executable or `PLAYWRIGHT_CHANNEL` to another installed channel. Screenshots go into ignored `test-results/`. These checks do not call the LLM. Avoid repeated full runs within one minute: the app's request limiter also applies to tests.

See [Validation](docs/VALIDATION.md) for the checked source coverage, live AI scenarios and the distinction between real-model checks and simulated UI transport.

`data:verify` establishes agreement with the saved approved release: hashes, integrity, eligibility, periods and counts. It does **not** fetch fresh sources or independently audit publisher microdata. A separately recorded local audit reconciled 1,331 non-ITBoard archive observations against saved raw sources, including 154 Thurgau observations now excluded from the workspace; that audit artifact and the raw acquisition files are not part of a clean clone.

## Architecture and scope

Next.js App Router, TypeScript, Tailwind CSS, Recharts and Zod run as one Node.js application. Public analytics use a read-only SQLite file; private conversations use a separate writable SQLite file. There is no arbitrary SQL or generated-code tool, vector database, queue, or separate Python backend.

See [Architecture](docs/ARCHITECTURE.md) for contracts, tools, limits and persistence; [local run notes](RUN-LOCAL.txt) for a quick checklist; and [the three-minute demo](DEMO.txt) for the presentation flow.

Scheduled collection, email reports, authentication, CI/CD and a reproducible raw-source acquisition pipeline are not implemented. The health endpoint is `/healthz`; AI availability is reported separately from data availability, and manual analytics continues without an AI connection.

## Production deployment

The VPS runs a native Linux ARM64 production build in one non-root Docker service behind Caddy HTTPS. The verified SQLite dataset is mounted read-only; conversations persist outside the container. The server API key is supplied through a private runtime environment file and is excluded from the image and repository.

See [Deployment](docs/DEPLOYMENT.md) for the Docker/Compose workflow, resource limits, backup command, rollout and rollback. Reproduce local-versus-production checks with `node --use-system-ca scripts/check-production.mjs` while both apps are available. The check validates all catalog metadata, representative calculations from every active source, cookies and public endpoint protections; it does not call the model. Private test sessions and reports remain in `.runtime/`.
