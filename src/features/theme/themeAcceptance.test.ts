/**
 * Application theme system acceptance tests.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  THEME_IDS,
  DEFAULT_THEME_ID,
  isThemeId,
  validateThemeId,
} from '@/features/theme/types'
import { SHARED_STATUS_TOKENS } from '@/features/theme/statusColors'
import { SEMANTIC_TOKEN_KEYS } from '@/features/theme/tokenKeys'
import {
  THEME_REGISTRY,
  listThemes,
  assertThemeTokensComplete,
  resolveThemeCssVariables,
  getTheme,
} from '@/features/theme/themeRegistry'
import { CLASSIC_TOKENS } from '@/features/theme/tokens/classic'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

run('1. exactly five themes with stable unique IDs', () => {
  assertEq(THEME_IDS.length, 5, 'count')
  assertEq(new Set(THEME_IDS).size, 5, 'unique')
  assert(THEME_IDS.includes('classic'), 'classic')
  assert(THEME_IDS.includes('graphite'), 'graphite')
  assert(THEME_IDS.includes('sage_garden'), 'sage')
  assert(THEME_IDS.includes('burgundy_estate'), 'burgundy')
  assert(THEME_IDS.includes('mocha_editorial'), 'mocha')
})

run('2. Classic is default', () => {
  assertEq(DEFAULT_THEME_ID, 'classic', 'default')
  assertEq(validateThemeId('nope'), 'classic', 'fallback')
  assert(!isThemeId('dark'), 'reject unknown')
})

run('3. every theme defines every semantic token', () => {
  for (const id of THEME_IDS) {
    const missing = assertThemeTokensComplete(id)
    assertEq(missing.length, 0, `${id} missing ${missing.join(',')}`)
    assertEq(
      Object.keys(getTheme(id).tokens).length,
      SEMANTIC_TOKEN_KEYS.length,
      `${id} key count`,
    )
  }
})

run('4. Polish names + descriptions + reference palettes', () => {
  for (const theme of listThemes()) {
    assert(theme.name.trim().length > 0, `${theme.id} name`)
    assert(theme.description.trim().length > 10, `${theme.id} description`)
    assert(theme.referencePalette.length >= 4, `${theme.id} palette`)
    for (const c of theme.referencePalette) {
      assert(/^#[0-9A-Fa-f]{6}$/.test(c), `${theme.id} palette hex ${c}`)
    }
  }
  assertEq(THEME_REGISTRY.classic.name, 'Classic', 'classic name')
  assert(THEME_REGISTRY.classic.description.includes('OurWed'), 'classic desc')
})

run('5. status colors are shared identically for every theme', () => {
  const statusKeys = Object.keys(SHARED_STATUS_TOKENS)
  assert(statusKeys.length >= 16, 'status coverage')
  for (const id of THEME_IDS) {
    const vars = resolveThemeCssVariables(id)
    for (const [key, value] of Object.entries(SHARED_STATUS_TOKENS)) {
      assertEq(vars[key], value, `${id} ${key}`)
    }
  }
  // Brand red must not equal global error for burgundy
  assert(
    getTheme('burgundy_estate').tokens['--brand-primary'] !==
      SHARED_STATUS_TOKENS['--status-error'],
    'burgundy brand ≠ status error',
  )
})

run('6. Classic preserves current OurWed core colors', () => {
  assertEq(CLASSIC_TOKENS['--app-background'], '#f7f7f7', 'bg')
  assertEq(CLASSIC_TOKENS['--surface-primary'], '#ffffff', 'surface')
  assertEq(CLASSIC_TOKENS['--text-primary'], '#0a0a0a', 'text')
  assertEq(CLASSIC_TOKENS['--brand-primary'], '#0a0a0a', 'brand')
  assertEq(CLASSIC_TOKENS['--sidebar-background'], '#0a0a0a', 'sidebar')
  assertEq(CLASSIC_TOKENS['--button-primary-background'], '#0a0a0a', 'btn')
  assertEq(CLASSIC_TOKENS['--button-primary-text'], '#ffffff', 'btn text')
  assertEq(CLASSIC_TOKENS['--border-default'], 'rgba(0, 0, 0, 0.06)', 'border')
  const legacy = resolveThemeCssVariables('classic')
  assertEq(legacy['--color-bg'], '#f7f7f7', 'legacy bg')
  assertEq(legacy['--color-accent'], '#0a0a0a', 'legacy accent')
  assertEq(legacy['--color-sidebar-bg'], '#0a0a0a', 'legacy sidebar')
})

run('7. Graphite / Sage / Burgundy / Mocha use reference accents', () => {
  assert(
    getTheme('graphite').tokens['--brand-primary'].toLowerCase().includes('22333b') ||
      getTheme('graphite').tokens['--sidebar-background'].toLowerCase().includes('0a0908'),
    'graphite accent',
  )
  assert(
    getTheme('sage_garden').tokens['--brand-primary'].toLowerCase().includes('345635'),
    'sage green',
  )
  assert(
    getTheme('burgundy_estate').tokens['--brand-primary'].toLowerCase().includes('8b0000'),
    'burgundy red',
  )
  assert(
    getTheme('mocha_editorial').tokens['--brand-primary'].toLowerCase().includes('5a4d40'),
    'mocha brown',
  )
})

run('8. Settings + Appearance routes wire theme UI', () => {
  const settings = readFileSync(
    resolve(process.cwd(), 'src/pages/SettingsPage.tsx'),
    'utf8',
  )
  const appearance = readFileSync(
    resolve(process.cwd(), 'src/pages/AppearanceSettingsPage.tsx'),
    'utf8',
  )
  const router = readFileSync(
    resolve(process.cwd(), 'src/routes/router.tsx'),
    'utf8',
  )
  const preview = readFileSync(
    resolve(process.cwd(), 'src/features/theme/ThemePreviewCard.tsx'),
    'utf8',
  )
  assert(settings.includes('Personalizacja'), 'settings section')
  assert(settings.includes('/ustawienia/wyglad'), 'appearance link')
  assert(appearance.includes('Motyw aplikacji'), 'heading')
  assert(appearance.includes('useTheme'), 'hook')
  assert(appearance.includes('radiogroup'), 'a11y')
  assert(router.includes('AppearanceSettingsPage'), 'route')
  assert(router.includes('/ustawienia/wyglad'), 'path')
  assert(preview.includes('role="radio"'), 'radio')
  assert(preview.includes('--tp-sidebar'), 'preview tokens')
})

run('9. bootstrap + provider + public isolation exist', () => {
  const main = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8')
  const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')
  const pubForm = readFileSync(
    resolve(process.cwd(), 'src/pages/PublicFormTokenPage.tsx'),
    'utf8',
  )
  const pubPre = readFileSync(
    resolve(process.cwd(), 'src/pages/PublicPreWeddingQuestionnairePage.tsx'),
    'utf8',
  )
  assert(main.includes('bootstrapTheme'), 'bootstrap')
  assert(app.includes('ThemeProvider'), 'provider')
  assert(pubForm.includes('usePublicThemeIsolation'), 'public form')
  assert(pubPre.includes('usePublicThemeIsolation'), 'public prewedding')
})

run('10. migration + schema include theme_id', () => {
  const mig = resolve(
    process.cwd(),
    'supabase/migrations/20260729250000_profiles_theme_id.sql',
  )
  assert(existsSync(mig), 'migration file')
  const sql = readFileSync(mig, 'utf8')
  assert(sql.includes('theme_id'), 'column')
  assert(sql.includes('classic'), 'default')
  assert(sql.includes('profiles_theme_id_check'), 'check')
  const schema = readFileSync(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8')
  assert(schema.includes('theme_id text not null default \'classic\''), 'schema')
})

run('11. docs + color guard exist', () => {
  assert(
    existsSync(resolve(process.cwd(), 'docs/design-system/themes.md')),
    'docs',
  )
  assert(
    existsSync(resolve(process.cwd(), 'scripts/checkThemeColors.mjs')),
    'guard',
  )
})

run('12. fixture: new component tokens resolve for all themes', () => {
  // Simulates a future component that only uses semantic tokens.
  const needed = [
    '--app-background',
    '--card-background',
    '--text-primary',
    '--text-secondary',
    '--input-background',
    '--input-border',
    '--button-primary-background',
    '--button-secondary-background',
    '--tab-text-active',
    '--badge-neutral-background',
    '--status-success-soft',
    '--status-error-soft',
  ] as const
  for (const id of THEME_IDS) {
    const vars = resolveThemeCssVariables(id)
    for (const key of needed) {
      assert(Boolean(vars[key]), `${id} ${key}`)
    }
  }
})

run('13. Button / Badge use semantic token fallbacks', () => {
  const btn = readFileSync(
    resolve(process.cwd(), 'src/components/ui/Button.module.css'),
    'utf8',
  )
  const badge = readFileSync(
    resolve(process.cwd(), 'src/components/ui/Badge.module.css'),
    'utf8',
  )
  assert(btn.includes('--button-primary-background'), 'btn primary')
  assert(btn.includes('--button-secondary-background'), 'btn secondary')
  assert(btn.includes('--button-primary-text'), 'btn text token')
  assert(badge.includes('--badge-neutral-background'), 'badge')
  assert(badge.includes('--status-success-soft'), 'status')
})

console.log('\nTheme acceptance done.')
