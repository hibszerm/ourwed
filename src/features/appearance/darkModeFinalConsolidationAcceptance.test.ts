/**
 * Final Dark Mode consolidation — architecture invariants.
 * Run: npm run test:dark-final-consolidation
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  APPEARANCE_IDS,
  APPEARANCE_OPTIONS,
  DEFAULT_APPEARANCE,
} from '@/features/appearance/types'
import { resolveBrowserThemeColor } from '@/features/appearance/browserThemeColor'
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

const SHARED_PRIVATE_CSS = [
  'src/components/ui/ResponsiveFieldOverlay.module.css',
  'src/components/ui/MobileFieldDialog.module.css',
  'src/components/ui/Toast.module.css',
  'src/components/ui/Backdrop.module.css',
  'src/components/ui/Avatar.module.css',
]

const DASHBOARD_DEBT_CSS = [
  'src/features/dashboard/components/NotificationsCard.module.css',
  'src/features/dashboard/components/TodoTodayCard.module.css',
  'src/features/dashboard/components/NextWeddingCard.module.css',
]

const DOCUMENT_ARTIFACT_ALLOWLIST = [
  'features/wedding-brief/renderWeddingBrief',
  'features/documents/mapping/',
  'features/prewedding/PreWeddingPublicForm',
]

const DARK_SUITE_SCRIPTS = [
  'test:appearance',
  'test:theme',
  'test:wedding-dark',
  'test:operational-dark',
  'test:package-catalog-dark',
  'test:settings-billing-dark',
  'test:documents-dark',
  'test:questionnaires-dark',
]

function assertEq<T>(actual: T, expected: T, m?: string) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  assert(a === e, m ? `${m}: expected ${e}, got ${a}` : `expected ${e}, got ${a}`)
}

run('A. Light token baseline exact for all five themes', () => {
  const baselineRecord = lightBaseline as Record<string, Record<string, string>>
  for (const id of THEME_IDS) {
    const current = resolveThemeCssVariables(id, 'light')
    const baseline = baselineRecord[id]
    for (const key of Object.keys(baseline)) {
      assert(current[key] === baseline[key], `${id} ${key}`)
    }
  }
})

run('B. five Dark themes resolve complete semantic surfaces', () => {
  for (const id of THEME_IDS) {
    const dark = resolveThemeCssVariables(id, 'dark')
    const light = resolveThemeCssVariables(id, 'light')
    assert(dark['--app-background'] !== light['--app-background'], `${id} app bg`)
    assert(Boolean(dark['--surface-primary']), `${id} surface-primary`)
    assert(Boolean(dark['--text-primary']), `${id} text-primary`)
    assert(Boolean(dark['--color-overlay']), `${id} overlay`)
    assert(Boolean(dark['--text-inverse']), `${id} text-inverse`)
  }
})

run('C. appearance is exactly light|dark — no System mode', () => {
  assertEq(APPEARANCE_IDS, ['light', 'dark'])
  assertEq(DEFAULT_APPEARANCE, 'light')
  assert(!APPEARANCE_OPTIONS.some((o) => /system/i.test(o.name)), 'no system option')
  const card = read('src/features/appearance/AppearanceCard.tsx')
  assert(!card.includes("'system'"), 'no system appearance id in card')
})

run('D. public Light isolation intact', () => {
  const pub = read('src/features/theme/usePublicThemeIsolation.ts')
  assert(pub.includes("applyAppearanceToDocument('light')"), 'forces light')
  const form = read('src/pages/PublicFormTokenPage.tsx')
  const ankieta = read('src/pages/PublicPreWeddingQuestionnairePage.tsx')
  assert(form.includes('usePublicThemeIsolation'), 'form route')
  assert(ankieta.includes('usePublicThemeIsolation'), 'ankieta route')
})

run('E. document/paper boundary preserved', () => {
  const docx = read('src/features/documents/contract-experience/ContractDocxPreview.module.css')
  assert(docx.includes('#fff') || docx.includes('#ffffff'), 'paper stays white')
  const brief = read('src/features/wedding-brief/renderWeddingBriefHtml.ts')
  assert(brief.includes('background: #fff'), 'brief is print artifact')
  const guard = read('scripts/checkThemeColors.mjs')
  for (const prefix of DOCUMENT_ARTIFACT_ALLOWLIST) {
    assert(guard.includes(prefix), `color guard allowlist: ${prefix}`)
  }
})

run('F. Theme × Appearance independence (no coupling in components)', () => {
  const appearanceCtx = read('src/features/appearance/appearanceContext.ts')
  assert(!appearanceCtx.includes('themeId'), 'appearance context independent')
  const themeProvider = read('src/features/theme/ThemeProvider.tsx')
  assert(themeProvider.includes('readDocumentAppearance'), 'theme reads document appearance')
  assert(!themeProvider.includes('setAppearance'), 'theme does not set appearance')
})

run('G. InterfaceStyle × Appearance independence', () => {
  const iface = read('src/features/interface-style/interfaceStyleContext.ts')
  assert(!iface.includes('appearance'), 'interface style independent')
})

run('H. browser theme-color and color-scheme semantic', () => {
  for (const theme of THEME_IDS) {
    for (const appearance of APPEARANCE_IDS) {
      const color = resolveBrowserThemeColor(theme, appearance)
      assert(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color), `${theme}/${appearance}`)
    }
  }
  const apply = read('src/features/appearance/applyAppearance.ts')
  assert(apply.includes('colorScheme'), 'color-scheme updated')
})

run('I. bootstrap before React + cache architecture', () => {
  assert(existsSync('src/features/appearance/bootstrapAppearance.ts'), 'bootstrap exists')
  const main = read('src/main.tsx')
  assert(main.includes('bootstrapAppearance'), 'bootstrap before render')
  const cache = read('src/features/appearance/appearanceCache.ts')
  assert(cache.includes('localStorage'), 'per-user cache')
})

run('J. Mobile Navigation V1.8.1 geometry frozen', () => {
  const sidebar = read('src/layouts/Sidebar.module.css')
  assert(sidebar.includes('width: min(74vw, 292px)'), 'drawer width')
  assert(sidebar.includes('280ms cubic-bezier(0.22, 1, 0.36, 1)'), 'motion')
})

run('K. shared private overlay primitives tokenized', () => {
  const forbidden = ['#fff', '#ffffff', 'color: white', 'rgba(15, 15, 15', 'rgb(0 0 0']
  for (const rel of SHARED_PRIVATE_CSS) {
    const css = read(rel)
    for (const token of forbidden) {
      assert(!css.includes(token), `${rel} contains ${token}`)
    }
  }
})

run('L. dashboard debt cards tokenized', () => {
  for (const rel of DASHBOARD_DEBT_CSS) {
    const css = read(rel)
    assert(!css.includes('#1d272b'), rel)
    assert(!css.includes('color: white'), rel)
    assert(!css.match(/color:\s*#fff\b/), rel)
  }
})

run('M. prior Dark acceptance suites remain registered', () => {
  const pkg = read('package.json')
  for (const script of DARK_SUITE_SCRIPTS) {
    assert(pkg.includes(`"${script}"`), script)
  }
})

run('N. no forbidden component-level theme matrices', () => {
  const scanRoots = ['src/features', 'src/components', 'src/layouts']
  for (const root of scanRoots) {
    const abs = resolve(process.cwd(), root)
    if (!existsSync(abs)) continue
    for (const entry of readdirSync(abs, { recursive: true })) {
      if (typeof entry !== 'string') continue
      if (!entry.endsWith('.tsx') && !entry.endsWith('.ts')) continue
      if (entry.includes('.test.')) continue
      const src = read(`${root}/${entry}`)
      assert(!src.includes('THEME_DARK_MATRIX'), entry)
      assert(!src.includes('APPEARANCE_THEME_MAP'), entry)
    }
  }
})

run('O. consolidation scope excludes schema and route mutations', () => {
  const pkg = read('package.json')
  assert(pkg.includes('test:dark-final-consolidation'), 'final test registered')
})

console.log('\nDark Mode final consolidation acceptance done.')
