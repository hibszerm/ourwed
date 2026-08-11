# Landing V3 — True 1:1 Desktop Parity on Mobile

Strategy change: **uniform scale of exact desktop compositions**. No mobile redesigns.

Review route: `/landing-v3`. Desktop ≥1100 frozen. Production `/` unchanged.

## 1. Mobile replacement artboards deleted

Removed:

- MobileImport / Assignment / Qc / Finance / Day / Security / Calendar / Brief / Sessions artboards
- MobileScaledStage, MobileRevealAnchor
- Obsolete mobile artboard CSS (pricing-only CSS retained)

Kept: `MobilePricingArtboard` (pricing is not a product canvas).

## 2. Shared composition architecture

Every product section always mounts the **same desktop DOM** inside:

```tsx
<DesktopCompositionScale composition="…">
  <ExactDesktopComposition />
</DesktopCompositionScale>
```

Marketing copy stays outside the scale wrapper.

## 3. DesktopCompositionScale

- `src/features/landing-v3/components/DesktopCompositionScale.tsx`
- Desktop (≥1100): scale = 1, no transform
- Below 1100: `translateX(-50%) scale(s)` with `transform-origin: top center`
- Sets `data-desktop-parity-canvas`, `data-composition-id`, `data-composition-version="3"`

## 4. Exact base dimensions (measured @1440×1000)

| Key | W × H | compositionId |
|---|---|---|
| import | 1360 × 727 | landing-import |
| assignment | 1360 × 780 | landing-assignment |
| questionnaireContract | 1360 × 797 | landing-qc |
| finance | 1360 × 700 | landing-finance |
| weddingDay | 1360 × 700 | landing-wedding-day |
| security | 1360 × 822 | landing-security |
| calendar | 1120 × 711 | landing-calendar |
| brief | 1360 × 779 | landing-brief |
| sessions | 1360 × 332 | landing-sessions |

## 5–6. Computed scale & wrapper heights

@390 (available 358):

| Composition | scale | wrapper ≈ |
|---|---|---|
| import | 0.263235 | 199px |
| assignment | 0.263235 | 213px |
| qc | 0.263235 | 217px |
| finance | 0.263235 | 191px |
| wedding-day | 0.263235 | 191px |
| security | 0.263235 | 222px |
| calendar | 0.319643 | 235px |
| brief | 0.263235 | 212px |
| sessions | 0.263235 | 94px |

@430 available 398 · @360 available 328 — same compositions, different uniform scale only. See `scale-report.json`.

## 7. Internal responsive CSS disabled in parity canvas

`[data-desktop-parity-canvas='true']` overrides in:

- `landingV3.module.css` (grids, absolute hubs, import table, day 36/64, finance 12-col, sessions, security visual)
- `ClassicDataLock.module.css` (lock geometry / records)
- `CalendarLandingPreview.module.css`
- `LandingBriefPreview.module.css`

## 8. JS viewport branches removed (product)

Product sections no longer `if (mobile) return <MobileArtboard />`.

`useSectionReveal` gains `topTriggerRatio` (0.72) + low threshold (0.05) when scaled.

## 9. DOM parity evidence

Same `data-composition-id` + `data-composition-version="3"` on desktop and mobile canvases.

## 10–18. Visual diffs

Under `docs/landing-v3-parity/true-scale/`:

- `{name}-desktop.png`
- `{name}-desktop-scaled.png`
- `{name}-mobile.png`
- `{name}-diff.png` (side-by-side sheet)

For: import, assignment, qc, finance, wedding-day, security, calendar, brief, sessions.

## 19. Full 390 MP4

`docs/landing-v3-parity/true-scale/full-scroll-390x844.mp4`

## 20–22. Multi-width screenshots

`{name}-mobile-360.png`, `-390.png`, `-430.png`

## 23. Desktop regression

`desktop-baseline-1440x1000.png`, `desktop-baseline-1280x900.png`

## 24. Performance

One composition tree per section (no dual desktop+mobile mounts). Reveal still IntersectionObserver-gated; offscreen animations do not remount alternate trees.

## 25. Deleted obsolete files

Listed in §1. Phone section (`MobileWeddingDaySection`) intentionally retained as device showcase exception.

## 26–29. Verification

- `npm run test:landing-v3` — PASS
- `tsc -b` — PASS
- eslint (changed app files) — PASS
- `npm run build` — PASS

## 30. Remaining compromises

- Product UI text is small at ~0.26× scale (accepted by brief — parity over readability).
- Optional “Powiększ podgląd” not implemented.
- Phone section keeps dedicated mobile device stage (spec exception).
- Pricing remains responsive mobile cards (not scaled desktop row).
- Security marketing copy remains below the scaled visual (desktop order); product lock is 1:1 scaled.
- Diff PNGs are visual inspection sheets; subpixel/font AA differences are expected.
