/**
 * Phase 2C — Packages + Additional Services Dark compatibility.
 * Run: npm run test:package-catalog-dark
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveThemeCssVariables } from '@/features/theme/themeRegistry'
import { THEME_IDS } from '@/features/theme/types'
import lightBaseline from '@/features/appearance/lightThemeTokenBaseline.json'
import { DEFAULT_PACKAGE_COLOR } from '@/types/package'

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

function scanCssDir(rel: string) {
  const abs = resolve(process.cwd(), rel)
  const hits: string[] = []
  for (const entry of readdirSync(abs)) {
    if (!entry.endsWith('.module.css')) continue
    const css = read(`${rel}/${entry}`)
    if (
      css.includes('#fff') ||
      css.includes('#ffffff') ||
      css.includes('color: white') ||
      css.includes('#fafafa') ||
      css.includes('#b42318') ||
      css.includes('#b54708') ||
      css.includes('rgba(0, 0, 0') ||
      css.includes('rgb(0 0 0')
    ) {
      hits.push(entry)
    }
  }
  return hits
}

run('A. packages/extras CSS avoids light-only hardcodes', () => {
  const dirs = [
    'src/features/studio/packages/modern',
    'src/features/studio/extras',
  ]
  for (const dir of dirs) {
    const hits = scanCssDir(dir)
    assert(hits.length === 0, `${dir}: ${hits.join(', ')}`)
  }
  const catalog = read('src/features/studio/StudioCatalog.module.css')
  assert(!catalog.includes('#b42318'), 'StudioCatalog no danger hex')
  assert(!catalog.includes('#b54708'), 'StudioCatalog no warning hex')
})

run('B. package data accent default is explicit constant', () => {
  assert(DEFAULT_PACKAGE_COLOR === '#0a0a0a', 'default swatch constant')
  const workspace = read(
    'src/features/studio/packages/modern/ModernPackagesWorkspace.tsx',
  )
  assert(workspace.includes('DEFAULT_PACKAGE_COLOR'), 'workspace uses constant')
  assert(!workspace.includes("'#0a0a0a'"), 'no inline default hex in workspace')
})

run('C. all five themes resolve distinct Dark tokens', () => {
  for (const id of THEME_IDS) {
    const dark = resolveThemeCssVariables(id, 'dark')
    const light = resolveThemeCssVariables(id, 'light')
    assert(dark['--app-background'] !== light['--app-background'], id)
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

run('E. overlays inherit root appearance', () => {
  const pkg = read('src/features/studio/packages/modern/ModernPackagesWorkspace.tsx')
  const extras = read('src/features/studio/extras/ModernExtraServicesWorkspace.tsx')
  assert(!pkg.includes('data-appearance='), 'packages no local appearance')
  assert(!extras.includes('data-appearance='), 'extras no local appearance')
})

run('F. no per-theme dark selector matrix in catalog CSS', () => {
  const css =
    read('src/features/studio/packages/modern/ModernPackagesWorkspace.module.css') +
    read('src/features/studio/extras/ModernExtraServicesWorkspace.module.css')
  assert(!css.includes("[data-theme='"), 'no theme selectors')
  assert(!css.includes("[data-appearance='dark']"), 'no local dark selectors')
})

run('G. mobile navigation V1.8.1 frozen', () => {
  const sidebar = read('src/layouts/Sidebar.module.css')
  assert(sidebar.includes('width: min(74vw, 292px)'), 'drawer width')
  assert(sidebar.includes('280ms cubic-bezier(0.22, 1, 0.36, 1)'), 'motion')
})

run('H. public Light isolation intact', () => {
  const pub = read('src/features/theme/usePublicThemeIsolation.ts')
  assert(pub.includes("applyAppearanceToDocument('light')"), 'public light')
})

run('I. studio catalog routes present', () => {
  const router = read('src/routes/router.tsx')
  assert(router.includes('/studio/pakiety'), 'packages route')
  assert(router.includes('/studio/uslugi'), 'extras route')
})

run('J. contract template section reuses shared experience', () => {
  const section = read('src/features/studio/PackageContractSection.tsx')
  assert(section.includes('ContractExperience.module.css'), 'shared contract UX')
  assert(!section.includes('data-appearance='), 'no local appearance override')
})

console.log('\nPackage catalog Dark Phase 2C acceptance done.')
