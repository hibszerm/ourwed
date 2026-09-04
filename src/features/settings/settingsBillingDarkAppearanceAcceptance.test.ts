/**
 * Phase 2D — Settings + Billing Dark compatibility.
 * Run: npm run test:settings-billing-dark
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveThemeCssVariables } from '@/features/theme/themeRegistry'
import { THEME_IDS } from '@/features/theme/types'
import lightBaseline from '@/features/appearance/lightThemeTokenBaseline.json'

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
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

function scanBillingCss() {
  const dir = resolve(process.cwd(), 'src/features/billing')
  const hits: string[] = []
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.module.css')) continue
    const css = read(`src/features/billing/${entry}`)
    if (
      css.includes('#fff') ||
      css.includes('background: #') ||
      css.includes('#b42318') ||
      css.includes('rgba(17, 17, 17')
    ) {
      hits.push(entry)
    }
  }
  return hits
}

run('A. billing UI modules avoid light-only modal hardcodes', () => {
  const hits = scanBillingCss()
  assert(hits.length === 0, hits.join(', '))
})

run('B. PRO editorial warm inserts documented in theme layer', () => {
  const editorial = read('src/features/theme/billingEditorial.module.css')
  assert(editorial.includes('.warmBanner'), 'warm banner')
  assert(editorial.includes('.warmPlanAccent'), 'plan accent')
  assert(editorial.includes('rgba(184, 140, 78'), 'cream gold editorial')
})

run('C. all five Dark themes resolve complete token sets', () => {
  for (const id of THEME_IDS) {
    const dark = resolveThemeCssVariables(id, 'dark')
    assert(Boolean(dark['--surface-primary']), `${id} surface`)
    assert(Boolean(dark['--color-overlay']), `${id} overlay`)
  }
})

run('D. Light baseline unchanged', () => {
  const baselineRecord = lightBaseline as Record<string, Record<string, string>>
  for (const id of THEME_IDS) {
    const current = resolveThemeCssVariables(id, 'light')
    const baseline = baselineRecord[id]
    for (const key of Object.keys(baseline)) {
      assert(current[key] === baseline[key], `${id} ${key}`)
    }
  }
})

run('E. public Light isolation intact', () => {
  const pub = read('src/features/theme/usePublicThemeIsolation.ts')
  assert(pub.includes("applyAppearanceToDocument('light')"), 'public light')
})

run('F. Appearance Settings exposes Jasny/Ciemny only', () => {
  const page = read('src/pages/AppearanceSettingsPage.tsx')
  const types = read('src/features/appearance/types.ts')
  assert(page.includes('APPEARANCE_OPTIONS'), 'options wired')
  assert(types.includes("'light'") && types.includes("'dark'"), 'two choices')
  assert(!types.includes("'system'"), 'no system')
})

run('G. settings/billing portals inherit root appearance', () => {
  const upgrade = read('src/features/billing/UpgradeRequiredDialog.tsx')
  const gate = read('src/features/billing/ProAccessGate.tsx')
  assert(!upgrade.includes('data-appearance='), 'upgrade dialog')
  assert(!gate.includes('data-appearance='), 'pro gate')
})

run('H. mobile navigation V1.8.1 frozen', () => {
  const sidebar = read('src/layouts/Sidebar.module.css')
  assert(sidebar.includes('width: min(74vw, 292px)'), 'drawer width')
  assert(sidebar.includes('280ms cubic-bezier(0.22, 1, 0.36, 1)'), 'motion')
})

run('I. subscription entitlement files untouched by appearance phase', () => {
  const entitlement = read('src/lib/billing/entitlement.ts')
  assert(entitlement.includes('AccountEntitlement'), 'entitlement model')
  const gate = read('src/features/billing/ProAccessGate.tsx')
  assert(gate.includes('requirePro'), 'gate API')
})

run('J. no per-theme dark selectors in settings/billing CSS', () => {
  const css =
    read('src/features/settings/SettingsWorkspace.module.css') +
    read('src/features/billing/SubscriptionSettingsPage.module.css')
  assert(!css.includes("[data-theme='"), 'no theme selectors')
  assert(!css.includes("[data-appearance='dark']"), 'no local dark selectors')
})

run('K. settings shell uses semantic tokens', () => {
  const workspace = read('src/features/settings/SettingsWorkspace.module.css')
  const layout = read('src/features/settings/SettingsLayout.module.css')
  assert(!workspace.includes('#fff'), 'workspace')
  assert(!layout.includes('#fff'), 'layout')
})

run('L. appearance cards remain appearance-aware', () => {
  const card = read('src/features/appearance/AppearanceCard.tsx')
  const preview = read('src/features/theme/ThemePreviewCard.tsx')
  assert(card.includes('AppearanceCard'), 'appearance card')
  assert(preview.includes('resolveThemeCssVariables'), 'theme preview resolver')
})

console.log('\nSettings + Billing Dark Phase 2D acceptance done.')
