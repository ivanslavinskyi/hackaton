# Decision workspaces implementation plan

Implementation status: completed; validation is recorded in [VALIDATION.md](VALIDATION.md).

Approved scope: turn the existing verified data into a graduate-opportunities overview and participant context for non-technical Powercoders staff. Keep free-form exploration and AI questions available.

1. Add `/opportunities`: select a published ITBoard role; show its history, junior-tag history, an explicitly separate whole-sample technology ranking, and official industry context. Explain sparse observations and missing role/seniority/skill intersections. Offer practical evidence-gathering questions, not a graduate-fit score.
2. Add `/participants`: choose Switzerland or an available canton and F, refugee B, S or all three groups. Show working-age population, employed population and employment rate as separately sourced results. Preserve population definitions and the single observation date; no trend, origin filter, placement rate or combined-population ranking is inferred.
3. Use one typed decision-brief service over `queryMetrics`, shared by a bounded HTTP endpoint and an AI tool. Every displayed number is an existing `AnalyticsResult` with provenance. No new dataset or numeric aggregation is introduced.
4. Keep filters in page URLs. Allow each panel to open in Explorer or AI, and allow AI to inspect the entire selected brief. Pass a validated brief context separately from free-text questions, retain it through follow-ups, and preserve original conversation/results under the existing 20-follow-up contract.
5. Test all available roles and participant groups/geographies, source and result agreement, invalid filters, unavailable data, navigation, AI handoff and follow-ups. Update English README, routing/architecture/validation notes and deployment record. Deploy using the existing candidate/rollback workflow.

Acceptance: both pages work without an LLM; every numerical result can be reproduced in Explorer and cited by AI; filters cannot imply unavailable intersections; source dates and limitations are visible; browser reload and Back/Forward restore page filters; manual-to-AI context cannot leak across browser sessions.

Out of scope: job or employer scraping, employer names, personal participant records, predictions, eligibility/legal advice, email scheduling and invented curriculum-to-job matches. This increment uses the frozen reviewed release `0.6.0-local` and the existing source policy.

The header’s decorative Switzerland flag/label has been removed. Geography remains beside analytical results and in the relevant filters. Opportunity roles with single-digit latest counts or missing snapshots show a caution in the selected-role panel. The whole-sample skill ranking and junior history do not inherit the selected role.
