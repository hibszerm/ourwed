# Landing V3 — Production promotion report

## Production route switched

- `/` → `LandingPage` → `LandingV3Page` (no redirect)
- `/landing-v3` → same `LandingPage` component (alias only)
- Authenticated users still redirect to `/dashboard`

## Files removed

- `src/features/landing-v2/` (entire cinematic V2 + version switch)
- `src/features/landing/` (V1 LivingHero, demos, LandingAuthDialog, etc.)
- `src/pages/LandingPageV1.tsx` + `LandingPageV1.module.css`
- `src/pages/LandingPage.module.css`
- `src/pages/LandingV3Page.tsx` (re-export; entry is `pages/LandingPage.tsx`)
- `src/features/landing-v3/hooks/useMobileSectionActivation.ts`
- `VITE_LANDING_VERSION` from `vite-env.d.ts`

## Files changed (key)

- `src/pages/LandingPage.tsx` — production entry
- `src/routes/router.tsx` — `/` + `/landing-v3` both LandingPage
- `src/features/landing-v3/LandingV3Page.tsx` — review flags removed
- `index.html` — title, description, canonical, OG, Twitter, theme-color, robots, JSON-LD
- `public/og-image.jpg` — social preview (1200×630)
- `ClassicDataLock.tsx` — faster mobile timeline + softEase
- `mobileWeddingDaySequence.ts` — ~25% faster simple timeline, longer nav hold
- `motion/variants.ts` — `softEase`, `MOBILE_DURATION_SCALE`
- `landingV3.module.css` — button press, nav focus, hero shadow, pricing lift
- `landingV3Acceptance.test.ts` — production assertions

## Old landing status

Deleted from the repository (not kept unused). History remains in git.

## Performance cleanup

- Removed V1/V2 bundles from production graph (main chunk smaller)
- Removed unused activation hook / version switch / auth dialog landing path
- Dead CSS/components from prior landings gone with those trees

## Animation cleanup

- Mobile security ~25% faster; soft opacity ease; no pulse/bounce
- Phone simple sequence: faster overall, longer navigation pause (`routeHoldEnd: 4.35`)
- Desktop timelines unchanged
- Buttons: calm hover/press; pricing cards: 2px lift on fine pointer only

## SEO verified

| Item | Status |
| --- | --- |
| title | ✓ |
| description | ✓ |
| canonical | `https://ourwed.pl/` |
| OpenGraph | ✓ + `og-image.jpg` |
| Twitter | summary_large_image |
| favicon | `/favicon.svg` |
| theme-color | `#f3efe8` |
| robots | index, follow |
| JSON-LD | SoftwareApplication |

## Accessibility verified

- Reduced motion still wired (`data-reduced-motion`, Framer `useReducedMotion`)
- Button/nav `:focus-visible` outlines
- Mobile menu Escape + aria-expanded/controls
- Brand/home aria-label preserved

## Tests / TypeScript / ESLint / Build

- `npm run test:landing-v3` → PASS
- `tsc -b` → clean
- ESLint on changed landing files → clean (pre-existing `router.tsx` react-refresh warning only)
- `npm run build` → success

## Intentionally kept for future

- Feature folder name `landing-v3` (internal package path; production route is `/`)
- `/landing-v3` URL alias for bookmarks during transition
- `MobilePricingArtboard` (pricing is not a product canvas)
- QA scripts under `scripts/landing-v3-*.mts` and `docs/landing-v3-parity/`
- `DesktopCompositionScale` architecture (frozen desktop parity)

## Polish notes (no redesign)

- Hero: softer layered shadow, refined bottom fade, edge outline for AA
- Mobile hero: prior true-scale centering retained
- Vertical rhythm: prior mobile tokens retained (desktop spacing untouched)
- Icons/radius/color systems: audited; no drift changes required beyond button/card polish
