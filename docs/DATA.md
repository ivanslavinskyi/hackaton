# Data coverage and verification

Checked against the installed release on **21 November 2026**. The app serves the frozen archive `0.6.0-local` through source policy `2026-11-21.1`. There is no live collection or scheduled refresh.

## Active inventory

| Dataset / exact source ID | Series | Observations | Available period | Meaning and limits |
| --- | ---: | ---: | --- | --- |
| ITBoard — `itboard_monitor_csv` | 312 | 2,190 | 29 Jan–15 Nov 2026 | Named technologies, role/experience tags and platform context; selected regions. One platform sample with changing denominators and gaps. |
| Eurostat ICT share — `eurostat_isoc_sk_oja1_ch_20261116` | 1 | 12 | Jan 2023–Sep 2026 | ICT share of online ads; overlapping four-quarter reporting windows. |
| Eurostat occupations — `eurostat_isoc_sk_oja2_ch_20261116` | 7 | 84 | Jan 2023–Sep 2026 | Occupational shares within ICT ads; not named skills or vacancy counts. |
| Eurostat annual change — `eurostat_isoc_sk_oja3_ch_20261116` | 1 | 11 | Jan 2024–Sep 2026 | Quarterly year-on-year change in ICT advertisements; not a share. |
| BFS JOBSTAT — `fso_jobstat_vacancies_2026q2` | 3 | 279 | Q2 2003–Q2 2026 | Estimated vacancies by employer industry, not employee occupation or seniority. |
| SECO — `seco_2026_10` | 27 | 352 | Jan 2004–Oct 2026 | All-occupation registered vacancies; long national history and sparse cantonal observations. |
| SEM permit F — `sem_asyl_202610_6_22` | 81 | 81 | 31 Oct 2026 | Working-age counts, registered employed counts and rates for ages 18–64. |
| SEM refugee B — `sem_asyl_202610_6_23` | 81 | 81 | 31 Oct 2026 | Separate recognized-refugee population; not all residents with a B permit. |
| SEM status S — `sem_asyl_202610_6_24` | 81 | 81 | 31 Oct 2026 | Separate temporary-protection population; all employment sectors. |
| Fribourg — `fribourg_ogd_rav_2026_10` | 1 | 274 | Jan 2004–Oct 2026 | Cantonal registered-vacancy context only. |
| **Total** | **595** | **3,445** | | |

Periods are the union of each extract's coverage, not a claim that every series has every date. The catalog supplies exact first/last dates and observation counts per series. Eurostat reporting windows must be read as published, not relabelled as monthly samples.

National scope contains 168 series and 2,015 observations across nine datasets. The remaining 427 series and 1,430 observations are regional. The total includes 3,148 reported values and 297 derived ITBoard shares; related counts and shares are not independent job samples. Dataset counts are not counts of independent publishers.

Each SEM dataset has three metrics × 27 geographies (Switzerland plus 26 cantons). Its employment rate uses its own population denominator. The participant page keeps groups and metrics separate; it does not sum populations or rank programme outcomes.

## Supported questions and boundaries

| Request | Supported response |
| --- | --- |
| What data is available and how recent is it? | Runtime inventory, exact catalog entries, periods, sources and exclusions |
| How did Python change? Compare with Docker. | ITBoard history, counts, documented shares and backend-calculated changes |
| What about IT Support or Data Analyst? | Published national role-tag history; separate junior/technology/industry context |
| Which named skills are rising within a specific role? | Explain the unavailable role × named skill × time intersection; offer clearly labelled separate evidence |
| What about junior developers in Zürich? | Discover any documented separate role/experience/geography indicators; do not invent their intersection |
| How does participant context differ by group or canton? | Single-date SEM counts and rates with separate denominators |
| Did a training programme improve employment? | Explain that programme outcomes, a comparison group and causal evidence are absent |
| Which employers should we approach? | Explain that there is no verified named-employer outreach dataset |
| Which policy changes matter now? | Show only dated saved evidence and its limitations; no current-law or live-monitoring claim |

The engine permits history, latest snapshots, compatible rankings and up to four comparable series. Date filters apply to observation period ends. Rankings align on a common date; percent changes are expressed as percentage points where appropriate. Long queries are bounded to 200 points with a visible truncation note. Missing observations remain missing, not zero.

## Capabilities and provenance

The prepared package contains `capabilities-public-ch.json` and `capabilities-regional-ch.json` as saved discovery artifacts. **The runtime catalog is authoritative for current availability**: `src/lib/analytics.ts` and `src/lib/data-inventory.ts` derive it from the database and shared source policy. The UI and LLM tools therefore see the same approved scope even though the original archive retains an excluded source.

`GET /api/bootstrap` returns `catalog`, `inventory`, `marketOverview`, `initialResult` and release/AI configuration information. Catalog records include IDs, metric, unit, frequency, source, geography, periods, population, measurement basis, denominator definition and limitations. `get_data_inventory` and `get_capabilities` expose bounded versions to the analyst. There is no arbitrary SQL, web-scraping or external-source discovery tool in the live analyst.

Every `AnalyticsResult` carries its canonical query, exact observations/IDs, source links, units, periods, limitations and permitted views. Publication, retrieval, review and observation dates are distinct. The Sources page and chart source drawer make them inspectable.

## Evidence, exclusions and verification meaning

Selected HSLU research findings and a saved provisional SECO policy notice are available through `search_evidence`. This is a small local collection, not a general document search or a verified live policy feed. Source text is evidence, never an instruction to the model.

Get U Hired research rows are outside numeric serving scope. The Thurgau vacancy source is excluded by product policy. The immutable archive still contains its 154 observations and three series: archive totals are 3,599 observations, 598 series and 11 datasets. SEM and SECO records for the canton of Thurgau are still valid product slices.

“Verified” means reviewed extraction/metadata, approved use, saved-release hash/integrity checks and deterministic agreement. It does not mean independent inspection of every underlying job advertisement, representative Swiss market coverage, a new publisher download, causal evidence or current legal status. A separately retained audit reconciled 1,331 non-ITBoard archive observations to saved raw files, including the now-excluded 154 Thurgau values. The raw acquisition files and optional audit report are not in a clean clone.

## Install and replace a release

The external approved package must contain:

```text
manifest.json
market-radar-public-ch.sqlite
capabilities-public-ch.json
capabilities-regional-ch.json
```

`npm run data:prepare -- "<approved-release-directory>"` validates the expected version, all three manifest hashes, SQLite integrity and serving scope, then writes project `data/`. It renames the database to `market-radar.sqlite` and copies the manifest. `npm run data:verify` checks the prepared files and separately reports archive and active counts. Both commands use the saved package; neither collects fresh data.

The serving database SHA-256 is `1a345db2eb4ae18f2f19b6eb5721da7ff4f07bc056291a8c95464b68c6fdfd3d`. It is mounted read-only in production. Conversation history uses a separate file and must never be included in a public data package.

A new dataset requires collection under permitted source terms, provenance and schema normalization, review, updated manifests/capabilities, and any needed parser/catalog/policy changes. The current installer and tests pin `0.6.0-local`; source addition is not accomplished by merely dropping a CSV into `data/`. Before a replacement release, verify comparable definitions, units, dates, denominators, missing cells, source rights and UI/tool compatibility; retain the prior release for rollback. See [Architecture](ARCHITECTURE.md) and [Deployment](DEPLOYMENT.md).
