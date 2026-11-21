# Brand and typography

The shared visual system follows the [Powercoders hackathon Figma style guide](https://www.figma.com/design/BTJyKElyB9D22WopZHT8Ga/Hackaton-Bern-AI-for-Access-26?node-id=10048-35371), inspected on 21 November 2026. It applies to all seven workspace routes, the manual explorer, AI evidence views, dialogs, charts and tables.

## Colour roles

| Guide colour | Application role |
| --- | --- |
| `#C32E4C` red | Primary actions, selected navigation, focus and first comparison series |
| `#6DBDB2` teal | Analyst identity and supporting accents |
| `#B6F6C7` mint | Verified-data and AI badges |
| `#FFFFFF` / `#F6F6F6` | Cards and workspace background |
| `#141617` / `#333333` | Main and secondary text |
| `#9D9C9C` | Decorative separators, not small body text |

`src/app/tokens.css` defines the exact palette plus semantic text, control, surface and chart tokens. Darker teal/mint derivatives make text and chart strokes legible on white. Soft tints identify context without colouring entire sections. Notes about data limitations use a neutral surface and a labelled icon; the accent alone never communicates a result's meaning.

Comparison colours are consistent between chips, chart series, tooltips and legends. Lines also have distinct dash patterns. Snapshots with up to four indicators use the same per-indicator colours; larger rankings use one colour with explicit row labels. Underlying tables remain available.

## Type roles

| Family | Role | Application sizes |
| --- | --- | --- |
| Bebas Neue Regular | Page/section titles, product name and prominent metrics | Page 36–48 px; sections 26–28 px; metrics 40–48 px |
| Roboto | Reading text, card titles, evidence, chart labels and tables | Body 16 px; card titles 18 px, with selected mobile cards at 16 px |
| Inter | Navigation, buttons, inputs, filters and metadata | Existing responsive control/label scale, generally 13–16 px |

The guide's font roles are preserved. Its compact 14 px body and tight leading are adapted to this product's previously requested larger, readable analytical typography. `brand.css` assigns roles after the existing responsive layout and `typography.css` rules. Do not use the display font for paragraphs, long source descriptions or controls.

## Font delivery and assets

Fonts are self-hosted WOFF2 files in `public/fonts/`, with `font-display: swap`, Unicode subsets and fallback stacks. Roboto and Inter include Latin, extended Latin and Cyrillic; Bebas Neue includes the available Latin subsets and falls back to Roboto for unsupported characters. Only the three primary Latin subsets are preloaded. There is no Google Fonts request at runtime and no font download during a build.

The ten font files total 333,572 bytes. `public/fonts/manifest.json` records their official source URLs and hashes; adjacent OFL files preserve the licences. The existing Powercoders logo paths are retained, with the guide's red/charcoal fills; provenance is in `public/BRAND-SOURCE.txt`.

## Verification

The visual comparison and screenshots are recorded in [design-qa.md](../design-qa.md). Desktop and mobile checks cover long headings, filters, tables, comparison selection, source drawers and the analyst composer. Measured key text combinations exceed 4.5:1; chart colours exceed 4.7:1 against white and control borders exceed 3:1. These targeted measurements are not a complete accessibility certification.
