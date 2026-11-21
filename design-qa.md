# Brand integration QA — 21 November 2026

final result: passed

## Target and evidence

Source: [Figma style guide](https://www.figma.com/design/BTJyKElyB9D22WopZHT8Ga/Hackaton-Bern-AI-for-Access-26?node-id=10048-35371). The public canvas was inspected directly: palette page 3 (`10048-35377`), typography pages 5–10 (heading frame `10048-35430`). This is a style guide, not a layout mockup of this application. Fidelity means colour and type roles, with the existing analytical information architecture and larger readable text retained.

Local capture directory: ignored `test-results/brand/` (not distributed in a clean clone).

- Source truth: `figma-brand-palette.png`, `figma-type-headings.png`, `figma-type-kpi-cards.png`, `figma-type-body.png`, `figma-type-data-navigation.png`, `figma-type-actions.png`.
- Rendered desktop: `brand-overview-desktop.png`, `brand-explorer-bars.png`, `brand-opportunities-desktop.png`, `brand-participants-desktop.png`, `brand-analyst-desktop.png`, `brand-library-desktop.png`.
- Rendered mobile: `brand-overview-mobile.png`, `brand-participants-mobile.png`, `brand-analyst-mobile.png`, `brand-compare-mobile.png`, `brand-library-mobile.png`.

Implementation: Next.js development preview at `http://127.0.0.1:3002`, followed by the local production build. Desktop CSS viewport/captures: 1280 × 720; mobile: 390 × 844, 1× image density. Source captures: 1280 × 720, with Figma at 100% for the palette and 77% for typography. Canvas chrome and guide frame padding are excluded from fidelity judgments; stated font specifications and font shapes, not scaled sample dimensions, define the target. No whole-page pixel equality is claimed.

Source palette and heading captures were compared with the rendered overview in the same comparison input. Body/data/navigation captures were compared with the rendered Explorer and Analyst in a second combined input. These legible specification frames and focused chart screenshots supply the detailed comparisons; separate image crops were unnecessary.

## Findings and iteration

- Resolved: snapshot bars previously shared one fill while their legend distinguished indicators. Each comparison bar now uses its series colour; the two visible Python/Docker bars and legend dots were checked in the browser and have identical corresponding computed colours.
- Resolved: long source-card headings could inherit a generic heading style. They now explicitly use Roboto Bold at 18 px; the Sources page was recaptured and inspected at desktop width.
- Accepted adaptation: body text remains 16 px with generous leading rather than the guide's 14/16 specification. Page headings and section titles use the guide's Bebas Neue family at the existing product's responsive scale.
- Accepted adaptation: chart teal/mint and small text use darker derivatives to preserve contrast; original teal/mint remain present in badges and analyst identity.
- No outstanding P0/P1/P2 visual findings in the inspected states.

## Required fidelity surfaces

| Surface | Result |
| --- | --- |
| Fonts and typography | Bebas Neue display/metrics, Roboto reading/data, Inter controls/navigation verified visually and through computed styles. Long titles wrap; Russian composer text remains readable. |
| Spacing and layout rhythm | Existing grid, cards, padding, radii and responsive stacking retained. Desktop and 390 px pages do not overflow the document horizontally; navigation and data tables keep their intentional internal scrolling. |
| Colours and tokens | Exact guide palette is centralized. Action, focus, badge and chart states share semantic tokens. Key text contrast >4.5:1, chart/white >4.7:1, control/white >3:1. |
| Image quality and assets | Existing original vector logo paths retained; only red/charcoal fills adapted. No raster approximation or substituted logo. |
| Copy and content | Existing English UI, source labels, dates, units, limitations and result values retained. No guide sample copy leaked into the product. |

## Interactions and limits

Desktop checks included role selection, SEM group/canton selection, handoff to Analyst, Python/Docker snapshots, chart/table switching, source details and library search. Mobile checks included the overview, long participant labels, group/canton filters, Analyst composer with Cyrillic, Explorer source/topic controls and comparison picker. Loading and unconfigured-AI states were visible in staging. No browser runtime errors were recorded.

Staging deliberately has no provider key; its unavailable-AI notice is expected. This styling pass does not re-run the previous eight-question model acceptance or the simulated 20-follow-up test. The earlier accepted analytical behavior remains documented in `docs/VALIDATION.md`; production build/deployment checks are recorded there separately.

## Implementation checklist

- [x] Shared palette, type roles and responsive size adaptations.
- [x] Self-hosted fonts with source hashes, licences and subset loading.
- [x] Chart/legend agreement and distinguishable line patterns.
- [x] Combined source/rendered visual comparison and mobile review.
- [x] Original vector artwork and analytical copy preserved.
