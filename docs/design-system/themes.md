# OurWed application themes

Private CRM themes control the authenticated panel color language. They are **not** studio public branding.

## How it works

1. Canonical registry: `src/features/theme/themeRegistry.ts`
2. Each theme defines a full semantic token map (`src/features/theme/tokens/*`)
3. Shared status colors: `src/features/theme/statusColors.ts` (identical in every theme)
4. `applyThemeToDocument(themeId)` sets CSS variables on `<html>` + `data-theme`
5. Existing CSS using `--color-*` keeps working via legacy bridges
6. Preference is stored on `profiles.theme_id` (database is source of truth)
7. `localStorage` caches only the theme **ID** to reduce FOUC (`ourwed:theme-id`)

Bootstrap runs from `src/features/theme/bootstrapTheme.ts` (imported first in `main.tsx`).

## Available themes

| ID | Name |
|----|------|
| `classic` | Classic (default — current OurWed look) |
| `gentlemen` | Gentlemen |
| `sage_garden` | Sage Garden |
| `burgundy_estate` | Burgundy Estate |
| `mocha_editorial` | Mocha Editorial |

## Styling a new component

**Correct**

```css
.card {
  background: var(--card-background);
  color: var(--text-primary);
  border: 1px solid var(--card-border);
}

.action {
  background: var(--button-primary-background);
  color: var(--button-primary-text);
}
```

Or reuse shared primitives (`Button`, `Card`, `Badge`, `Input`, `Modal`, …) which already consume tokens.

**Forbidden**

```css
.card { background: #EAE0D5; } /* theme hex in a product component */
```

```tsx
if (themeId === 'sage_garden') { ... } // product logic must not branch on theme name
```

```css
[data-theme='mocha_editorial'] .myCard { ... } /* theme-specific overrides in features */
```

Theme-name selectors are allowed only in theme registry / preview / bootstrap code.

## Status colors

Status tokens (`--status-success*`, `--status-warning*`, `--status-error*`, `--status-info*`) are **global** and must not change meaning between themes.

Do not reuse Burgundy brand red as error, or Sage brand green as success.

## Public branding separation

Public `/form/:token` and `/ankieta/:token` force Classic via `usePublicThemeIsolation` so the photographer’s private panel theme does not recolor couple-facing forms.

Studio logo/colors for public questionnaires remain a separate branding system.

## Adding a future theme

1. Add a stable ID to `THEME_IDS` in `types.ts`
2. Create `tokens/<name>.ts` with every key in `SEMANTIC_TOKEN_KEYS`
3. Register metadata in `themeRegistry.ts`
4. Extend the DB check constraint (`profiles_theme_id_check`)
5. Add Settings preview coverage + registry tests

## Justified color exceptions

Allowlisted paths (see `scripts/checkThemeColors.mjs`):

- `src/features/theme/**` (token definitions)
- Landing / marketing pages
- Public questionnaire branding CSS
- AI lab / experiment tooling
- External brand logos
- Tests and fixtures

To add an exception: document it in the allowlist with a one-line reason.

## Persistence

- Settings → Personalizacja → Wygląd
- Selecting a card applies immediately and saves `profiles.theme_id`
- Reload / logout+login restores from DB (cache is a hint only)

## Required check

```bash
npm run test:theme
```

This runs registry completeness, Classic regression, Settings wiring, and the hard-coded color guard.
