# Landing V3 — Final mobile visual parity report

Review route: `/landing-v3`. Desktop ≥1100px frozen. Production `/` unchanged.

QA source: Playwright 390×844 exports (required deliverables). Owner real-iPhone recording was the acceptance brief for this rebuild.

## 1. Findings from the newest real recording (owner brief)

Previous mobile pass fit 358px and passed dimension tests, but read as miniature infographics: weak dominant surfaces, unreadable product type, large empty beige fields, clipped/disconnected security lock, detached phone benefits, and QC/calendar/brief losing desktop character.

## 2. Why the previous parity implementation failed visually

It optimized for containment (no overflow, artboard ≤358, height ranges, label presence) instead of desktop visual weight. Surfaces were rebuilt as simplified cards rather than the same compositions at mobile width. Typography was often scaled down via layout compression instead of re-setting type at readable sizes.

## 3. Exact mobile rendered dimensions @390 (measured)

| Artboard | W × H | Dominant W | Dominant % |
|---|---|---|---|
| import | 358 × 570 | 332 | 93% |
| assignment | 358 × 600 | 334 | 93% |
| qc | 358 × 660 | 344 (composition) | 96% |
| finance | 358 × 672 | 334 | 93% |
| wedding-day | 358 × 680 | 332 | 93% |
| security | 358 × 450 | 358 | 100% |
| calendar | 358 × 520 | 358 | 100% |
| brief | 358 × 720 | 336 | 94% |
| sessions | 358 × 470 | 334 | 93% |
| pricing | 358 × 1044 | 358 | 100% |

Horizontal overflow: none (`scrollWidth === clientWidth`).

## 4. Dominant-surface width percentages

All major artboards ≥93% of artboard width for the measured dominant/composition node. QC uses the full overlap stage (`data-composition="qc-overlap"`), not a single mini-card.

## 5. Product typography measurements (computed)

- Import result title: **22px**
- Import step label: **11px**
- QC field values: **14px**

## 6. Import rebuild

Process steps + side-by-side sheet/document + dominant completed assignment (`Julia i Adrian`, date, package, `12 900 zł`, CTA). Document panel is a paper surface with PDF badge + status, not a floating icon in empty dashed space.

## 7. Assignment rebuild

Dark hub + 2×3 modules at readable type; connectors retained; artboard ~600px.

## 8. Questionnaire/Contract rebuild

Overlapping form (~200×420) + document (~224×470), chips (`Dane pary` / `Pakiet` / `Termin`) over the overlap, status `Umowa wygenerowana` / `Gotowa do wysłania`, partner `Adrian Nowak`. Animation ≤1.8s, final state remains.

## 9. Finance scale

Bento retained; primary / paid-remaining / season / nearest-active enlarged; quiet desktop radii/borders.

## 10. Wedding Day two-surface

Questionnaire summary + itinerary; route total **inside** itinerary footer (`57 km · 1 godz. 20 min`); confirm → applied → totals.

## 11. Phone section compression

Devices unchanged; section spacing tightened so benefits sit under phone group (not a detached later scene).

## 12. Security recomposition

Order: heading → support → artboard → facts (`Uwierzytelnianie`, `Separacja przestrzeni`, `Unikalne linki`, `Szyfrowanie integracji`). Status `Dane zabezpieczone`. Lock kept fully inside artboard.

## 13. Calendar enlargement

Near-full-width June 2027 grid + integration footer inside the same surface.

## 14. Brief layered-document

Rear + primary pages with readable Plan/Kontakty/Uwagi; benefits inside the same artboard shell.

## 15. Weddings/Sessions asymmetry

Wedding dominant (~334×205+); session smaller and offset.

## 16. Animation trigger fixes

`MobileRevealAnchor` observes the artboard: top ~72% VH, low coverage threshold, once-only, 700ms near-viewport fallback to final state. Surfaces remain visible before progress layers animate.

## 17. Dead-space removal

Obsolete min-heights / invisible reserving layers reduced; artboard wrappers target visible composition (QC overflow no longer clips the stack).

## 18. Complete 390×844 MP4

`docs/landing-v3-parity/video/full-scroll-390x844.mp4`

## 19. Isolated MP4 paths

- `docs/landing-v3-parity/video/isolate-qc.mp4`
- `docs/landing-v3-parity/video/isolate-wedding-day.mp4`
- `docs/landing-v3-parity/video/isolate-phones.mp4`
- `docs/landing-v3-parity/video/isolate-security.mp4`

## 20. Static screenshot paths

`docs/landing-v3-parity/mobile/artboard-*-390x844.png` (+ `hero-390x844.png`)

## 21. Comparison-sheet paths

`docs/landing-v3-parity/comparison/compare-*.png`

## 22. Desktop regression comparison

Baselines: `docs/landing-v3-parity/desktop/baseline-1440x1000.png`, `baseline-1280x900.png`. At ≥1100px viewport mode is `desktop` and mobile artboards are unmounted (0).

## 23. Tests

`npm run test:landing-v3` — PASS

## 24. TypeScript

`tsc -b` — PASS

## 25. ESLint

Changed app files clean (script file ignored by ESLint config).

## 26. Build

`npm run build` — PASS

## 27. Remaining compromises

- Pricing stack remains long (~1044px) by design (Trial / Annual / Monthly).
- Comparison sheets pair mobile artboards against a desktop **page crop**, not per-section desktop crops (except existing `section-import.png`).
- Playwright 390×844 is the exported QA surface; physical-device micro-differences (safe-area, font raster) may still differ from the owner’s phone recording.
- QC document body is intentionally partially covered by the questionnaire (desktop overlap language); full contract text is not fully exposed at once.
- Final visual acceptance still belongs to viewing the MP4s/screenshots — dimensions alone are not the gate.
