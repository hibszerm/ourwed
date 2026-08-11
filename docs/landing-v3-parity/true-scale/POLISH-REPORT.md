# Landing V3 — Mobile polish final report

Generated after security handoff + vertical rhythm pass.

## 1. Root cause of the blank security phase

Two stacked bugs:

1. **Legacy mobile CSS** (`@media max-width: 900px`) forced `left/top: auto !important` on records. Under `DesktopCompositionScale` that overrode Framer `%` positions and **stacked all six records at 0,0**, so the stage looked empty aside from one tiny overlapping card cluster.
2. **Opacity keyframes + cubic `premiumEase`** on the mobile fade made records drop below ~0.4 opacity by ~0.4s — **before** the lock (delay 0.7s) was meaningfully visible.

Desktop never hit (1) at ≥1100px, and its 3.5s fade hid (2).

## 2. Previous mobile security timeline

- Same long desktop delays in practice once `active` flipped (`lockDelay: 1.8` path), or a short keyframed fade from `t=0` with cubic ease.
- Closed-phase `display: none` on records (legacy) could unmount cards while lock opacity was still delayed.
- Activation observed the whole section (too early).

## 3. New mobile timeline

| Window | Behavior |
| --- | --- |
| 0.00–0.40s | All 6 records visible (desktop start positions, scaled) |
| 0.40–0.95s | Records converge; opacity stays 1 |
| 0.70–1.15s | Lock body fades in |
| 1.00–1.35s | Records fade linearly (delay 1.0s, duration 0.35s) |
| 1.15–1.50s | Shackle closes |
| 1.45–1.70s | Keyhole / check / label |
| ≥1.75s | Final closed lock persists |

Desktop `DESKTOP_TIMELINE` (`lockDelay: 1.8`, etc.) unchanged.

## 4. Layer mounting strategy

- Both `data-security-layer="record"` and `data-security-layer="lock"` stay mounted.
- `data-layers-mounted="records+lock"`.
- Animate opacity/transform only.
- Legacy mobile reflow/`display:none` scoped to `.root:not([data-layers-mounted])`.

## 5. Empty-frame prevention

- Positions restored (no `left/top: auto` under parity).
- Record fade delayed until lock ≥ ~0.8 opacity.
- Measured invariant at 0.8s: records opacity `1`, lock opacity `~0.8`.
- At 1.25s: records `~0.22`, lock `1`.
- Fast-scroll: `instantComplete` zeros delays → final lock.

## 6. Security isolated recording

`docs/landing-v3-parity/true-scale/polish-security-isolated-390.mp4`

## 7. Security frame captures

| t | Path |
| --- | --- |
| 0.0s | `security-frame-0s.png` |
| 0.4s | `security-frame-0p4s.png` |
| 0.8s | `security-frame-0p8s.png` |
| 1.05s | `security-frame-1p05s.png` |
| 1.25s | `security-frame-1p25s.png` |
| 1.5s | `security-frame-1p5s.png` |
| 1.75s | `security-frame-1p75s.png` |

## 8. Mobile rhythm tokens (`≤430` / `≤768`)

```css
--lv3-mobile-section-gap-major: 60px;   /* 64px @768 */
--lv3-mobile-section-gap-normal: 52px;  /* 56px @768 */
--lv3-mobile-copy-to-product: 28px;
--lv3-mobile-product-to-copy: 28px;
--lv3-mobile-product-to-next-section: 56px;
--lv3-mobile-heading-to-support: 12px;
```

## 9. Obsolete spacing rules removed

- Mobile section padding `4.75rem 0 4.5rem` / `4.5rem 0 4rem`
- Phone section padding `4.25rem` / `4rem` / `3.75rem` / `3.5rem` (replaced by token halves)
- Large `heroDashboard` margin-bottom stacks on mobile
- Unconditional closed-phase `display: none` on records
- Unconditional mobile `left/top: auto !important` on records (now gated)

## 10. Measured section gaps @390×844

Meaningful content gaps (precise probes):

| Transition | px | Notes |
| --- | --- | --- |
| Hero product → Import h2 | ~77–87 | Includes capability line (~40px copy). Empty pads tightened. |
| Import → Assignment | 52 | Token half+half |
| Assignment → QC | 52 | |
| QC → Finance | 52 | |
| Finance → Day | 56 | |
| Day → Phones | 56 | |
| Last benefit → Security visual | 60 | Target 56–64 ✓ |
| Security visual → copy | 33 | Target 24–32 (slightly airy) |
| Security copy → Calendar h2 | 56 | |
| Calendar → Brief | 52 | |
| Brief → Sessions | 52 | |
| Sessions → Pricing | 52 | |
| Pricing → FAQ | ~52–64 | Automated probe hit title padding only (26) |
| FAQ → CTA | ~64–72 | Automated probe included FAQ body (ignore 464) |

Naive canvas→next-heading probe for Security→Calendar reported 665 because it skipped the in-section copy block.

## 11. Phone section spacing

- Support → phones: ~36px (`margin-top: 2.25rem`)
- Phones → benefits: ~26px
- Last benefit → Security visual: 60px
- Phone geometry/animation untouched

## 12. Hero → Import

Outer pads reduced; remaining distance is mostly the intentional capability line under the dashboard.

## 13. Calendar / Brief

Outer section padding uses mobile tokens; internal compositions unchanged. Canvas→next ≈ 52px.

## 14. Fast-scroll behavior

- `useSectionReveal.forceCompleteOnExitAbove` → `instantComplete`
- Security: `ClassicDataLock instantComplete` skips delays
- Phone: `forceFinal` → brief final snapshot

## 15–17. Width QA

- `polish-mobile-430.png`
- `polish-mobile-390.png`
- `polish-mobile-360.png`

## 18. Full mobile recording

`polish-mobile-390-full-scroll.mp4`

## 19. Desktop regression

- `polish-desktop-1440x1000.png`
- `polish-desktop-1280x900.png`
- Desktop security timeline / geometry / spacing left on desktop rules

## 20. Tests

`npm run test:landing-v3` → PASS

## 21. TypeScript

`tsc -b` → clean

## 22. ESLint

Changed TS files clean (CSS modules ignored by eslint config)

## 23. Build

`npm run build` → success

## 24. Remaining compromises

- Hero→Import total distance still >64px because the capability line sits under the dashboard (content, not empty paper).
- Security stage still shows a large beige field around the lock at final state — that is the approved desktop composition, scaled, not a blank handoff.
- Automated gap probes for Pricing/FAQ/CTA need content-aware endpoints; manual probes used for acceptance.
