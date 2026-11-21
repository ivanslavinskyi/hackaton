# Decision workspaces

Implemented and deployed. Checked **21 November 2026** against the shared contracts, engine and context-persistence behavior. Both pages work without an LLM and use the reviewed release described in [Data](DATA.md).

## Graduate opportunities

Route: `/opportunities`. The selector offers all 35 published national ITBoard role tags; the default is IT Support. `/opportunities?role=itboard_csv_rolle_it-support` is a shareable public link. Geography is Switzerland; no unsupported regional role filter is presented.

| Panel | Scope | Effect of changing the role |
| --- | --- | --- |
| Selected role | Published ITBoard role-tag history, across experience levels | Changes the selected role series |
| Junior-tagged listings | Separate experience-tag history across all roles | Unchanged; not a role × junior intersection |
| Technologies across the sample | Eight named technology tags in the available latest ITBoard ranking | Unchanged; not a role-specific skills ranking |
| Official industry context | BFS IT/information-services industry vacancies from 2021 | Unchanged; industry is not selected occupation or seniority |

Every panel is an ordinary `AnalyticsResult` with its own query, source, dates and limitations. Sparse role evidence, missing snapshots, an older last observation and single-digit latest counts trigger reading notes. Tags may overlap; a tagged advertisement is not a verified vacancy suitable for a programme graduate.

Use the page to investigate a role, frame employer questions and identify evidence needed before a curriculum decision. It does not score graduate fit, identify named employers, forecast vacancies or infer role × junior × technology demand.

## Participant context

Route: `/participants`. Defaults are all groups, shown separately, and Switzerland. Filters accept `group=all|f|b|s` and `geography=CH` or one of the 26 published canton IDs. Example: `/participants?group=b&geography=CH-ZH`.

| Group | Published population |
| --- | --- |
| F | Provisionally admitted people, including provisionally admitted refugees |
| Refugee B | Recognised refugees granted asylum and holding a B permit; not all B-permit holders |
| S | People with temporary protection |

Each group has three separate sourced results: working-age population, registered employed population and employment rate. All refer to ages 18–64, all sectors, at **31 October 2026**. “All groups” produces nine results, retaining each group's denominator; it does not calculate a combined rate.

Changing the canton retains the selected group. There is no time-series trend, origin filter, IT-role filter, programme participation filter, placement rate or individual eligibility assessment. Use this context for discussions with canton/integration partners, then request programme-specific outcome evidence.

## Manual analysis and AI handoff

1. Select a supported role or group/canton. The URL preserves public filters; reload and Back/Forward restore them.
2. Open a panel in Explorer to inspect its query, chart/table and sources, or send that panel to AI as chart context.
3. **Ask about this brief** saves the complete selected decision scope before navigating to Analyst. The prepared question remains an editable draft.
4. The Analyst banner identifies the role or population/canton. A follow-up such as “What about Bern?” can use that scope; the latest explicit user question takes precedence.
5. **Use chart only** clears the decision scope while retaining the chart. Explicit manual evidence handoffs also clear an old brief, including when the chart is already visible. These changes survive reload without another model request.

Context writes use `PATCH /api/conversation` with `{ brief: DecisionScope | null, context?: QueryInput }`. The backend validates both values before mutation and uses the same per-session lock as AI execution. A failed save shows an error, not a successful handoff. An active analysis must finish or be stopped before its context is replaced.

An unsent draft survives page navigation but not a full reload. Saved context, questions and exact results are server-side and scoped to the browser cookie. Public links do not expose conversations. See [Routing](ROUTING.md) for precedence and persistence rules.

## Shared implementation and acceptance

`src/lib/decision-contracts.ts` defines `DecisionScope`, options and `DecisionBrief`. `src/lib/decision-briefs.ts` validates catalog-backed filters and assembles up to nine ordinary engine results. `POST /api/decision-brief` and the AI tool `get_decision_brief` call the same service. No synthetic cross-source metric or new numeric dataset is introduced.

The analyst can continue with other tools, cite each result and choose its permitted view. A successful brief call emits a typed `brief` event and saves the scope in `conversation_briefs`. Seven tool definitions are available; the budget remains six executions per question. The initial-question-plus-20-follow-ups design is unchanged.

Deterministic tests cover all roles and SEM group/geography options, exact values/denominators, unsupported dimensions and session-isolated context writes. Browser checks cover selection, sources/tables, navigation, reload and mobile layouts. Separate real-provider checks exercise role/canton follow-ups and unavailable intersections. See [Validation](VALIDATION.md) for actual outcomes and the distinction between mocked and live AI.
