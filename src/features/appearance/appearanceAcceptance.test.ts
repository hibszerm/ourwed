/**
 * Appearance + Dark visual system acceptance.
 * Run: npm run test:appearance
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  APPEARANCE_IDS,
  APPEARANCE_OPTIONS,
  DEFAULT_APPEARANCE,
  isAppearance,
  validateAppearance,
} from '@/features/appearance/types'
import { validateAppearanceForPersist } from '@/features/appearance/appearanceService'
import {
  readCachedAppearance,
  writeCachedAppearance,
  clearCachedAppearance,
} from '@/features/appearance/appearanceCache'
import {
  applyAppearanceToDocument,
  readDocumentAppearance,
} from '@/features/appearance/applyAppearance'
import { resolveBrowserThemeColor } from '@/features/appearance/browserThemeColor'
import {
  DARK_STATUS_TOKENS,
  resolveStatusColors,
  SHARED_STATUS_TOKENS,
} from '@/features/theme/statusColors'
import { SEMANTIC_TOKEN_KEYS } from '@/features/theme/tokenKeys'
import {
  resolveThemeCssVariables,
  assertThemeTokensComplete,
} from '@/features/theme/themeRegistry'
import { THEME_IDS } from '@/features/theme/types'
import lightBaseline from '@/features/appearance/lightThemeTokenBaseline.json'

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(actual: T, expected: T, m: string) {
  if (actual !== expected) {
    throw new Error(`${m}: expected ${String(expected)}, got ${String(actual)}`)
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

// Minimal DOM + localStorage for bootstrap / apply tests (no jsdom dependency).
function withMockDom<T>(fn: () => T): T {
  const store = new Map<string, string>()
  let colorSchemeValue = ''
  const html = {
    dataset: {} as Record<string, string>,
    style: {
      set colorScheme(v: string) {
        colorSchemeValue = v
      },
      get colorScheme() {
        return colorSchemeValue
      },
    },
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
  }
  const meta = {
    name: 'theme-color',
    content: resolveBrowserThemeColor('classic', 'light'),
  }
  const prevDocument = globalThis.document
  const prevLocalStorage = globalThis.localStorage

  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    key: () => null,
    length: store.size,
  } as Storage

  globalThis.document = {
    documentElement: html,
    head: { appendChild: () => meta },
    querySelector: (sel: string) =>
      sel === 'meta[name="theme-color"]' ? meta : null,
  } as unknown as Document

  try {
    return fn()
  } finally {
    globalThis.document = prevDocument
    globalThis.localStorage = prevLocalStorage
  }
}

run('A. valid appearance parsing', () => {
  assertEq(validateAppearance('light'), 'light', 'light')
  assertEq(validateAppearance('dark'), 'dark', 'dark')
  assert(isAppearance('light'), 'is light')
  assert(isAppearance('dark'), 'is dark')
})

run('B. invalid → light', () => {
  assertEq(validateAppearance('system'), 'light', 'system')
  assertEq(validateAppearance('auto'), 'light', 'auto')
  assertEq(validateAppearance('graphite'), 'light', 'theme id')
  assertEq(validateAppearance(''), 'light', 'empty')
  assertEq(validateAppearance(null), 'light', 'null')
  assert(!isAppearance('System'), 'case sensitive')
  assert(validateAppearanceForPersist('dark') === 'dark', 'persist dark')
  assert(validateAppearanceForPersist('system') === null, 'reject system')
})

run('C. absent → light default', () => {
  assertEq(DEFAULT_APPEARANCE, 'light', 'default constant')
  assertEq(APPEARANCE_IDS.length, 2, 'exactly two modes')
})

run('D. cache read/write', () => {
  withMockDom(() => {
    clearCachedAppearance()
    assertEq(readCachedAppearance(null), 'light', 'empty global')
    writeCachedAppearance('dark', null)
    assertEq(readCachedAppearance(null), 'dark', 'global dark')
    writeCachedAppearance('light', 'user-a')
    assertEq(readCachedAppearance('user-a'), 'light', 'user a')
    writeCachedAppearance('dark', 'user-b')
    assertEq(readCachedAppearance('user-b'), 'dark', 'user b')
  })
})

run('E. per-user cache isolation', () => {
  withMockDom(() => {
    clearCachedAppearance()
    writeCachedAppearance('dark', 'user-a')
    writeCachedAppearance('light', 'user-b')
    assertEq(readCachedAppearance('user-a'), 'dark', 'user a dark')
    assertEq(readCachedAppearance('user-b'), 'light', 'user b light')
    writeCachedAppearance('dark', null)
    assertEq(readCachedAppearance('user-a'), 'dark', 'user key wins over global')
  })
})

run('F. bootstrap applies data-appearance before React', () => {
  const main = read('src/main.tsx')
  assert(main.includes("import '@/features/appearance/bootstrapAppearance'"), 'appearance bootstrap import')
  assert(main.indexOf('bootstrapAppearance') < main.indexOf('./App.tsx'), 'bootstrap before App import chain')
  const bootstrap = read('src/features/appearance/bootstrapAppearance.ts')
  assert(bootstrap.includes('applyAppearanceToDocument'), 'bootstrap applies appearance')
  assert(bootstrap.includes('readCachedAppearance'), 'bootstrap reads cache')
})

run('G. dark bootstrap does NOT depend on prefers-color-scheme', () => {
  const sources = [
    'src/features/appearance/bootstrapAppearance.ts',
    'src/features/appearance/applyAppearance.ts',
    'src/features/appearance/AppearanceProvider.tsx',
    'src/features/appearance/types.ts',
    'src/features/appearance/appearanceCache.ts',
  ]
  for (const rel of sources) {
    const src = read(rel)
    assert(!src.includes('prefers-color-scheme'), `${rel} no OS preference`)
    assert(!src.includes('matchMedia'), `${rel} no matchMedia`)
  }
})

run('H. applyAppearance sets root contract + color-scheme', () => {
  withMockDom(() => {
    applyAppearanceToDocument('dark')
    assertEq(readDocumentAppearance(), 'dark', 'read back dark')
    assertEq(
      (document.documentElement as unknown as { dataset: Record<string, string> })
        .dataset.appearance,
      'dark',
      'data-appearance',
    )
    assertEq(document.documentElement.style.colorScheme, 'dark', 'color-scheme dark')
    applyAppearanceToDocument('light')
    assertEq(document.documentElement.style.colorScheme, 'light', 'color-scheme light')
  })
})

run('I. light resolver output equals pre-Phase-1A baseline (all themes)', () => {
  const baselineRecord = lightBaseline as Record<
    string,
    Record<string, string>
  >
  for (const id of THEME_IDS) {
    const current = resolveThemeCssVariables(id, 'light')
    const baseline = baselineRecord[id]
    assert(Boolean(baseline), `${id} baseline exists`)
    const baselineKeys = Object.keys(baseline).sort()
    const currentKeys = Object.keys(current).sort()
    assertEq(currentKeys.join(','), baselineKeys.join(','), `${id} key set`)
    for (const key of baselineKeys) {
      assertEq(current[key], baseline[key]!, `${id} ${key}`)
    }
  }
})

run('J. all 5 themes resolve in dark without missing token keys', () => {
  for (const id of THEME_IDS) {
    const missing = assertThemeTokensComplete(id)
    assertEq(missing.length, 0, `${id} semantic complete`)
    const dark = resolveThemeCssVariables(id, 'dark')
    const light = resolveThemeCssVariables(id, 'light')
    assertEq(Object.keys(dark).length, Object.keys(light).length, `${id} dark keys`)
    for (const key of Object.keys(light)) {
      assert(Boolean(dark[key]), `${id} dark ${key}`)
    }
  }
})

run('K. theme and appearance are independent', () => {
  assert(
    resolveThemeCssVariables('graphite', 'dark')['--brand-primary'] !==
      resolveThemeCssVariables('classic', 'dark')['--brand-primary'],
    'theme personality in dark',
  )
  assert(
    resolveThemeCssVariables('classic', 'dark')['--app-background'] !==
      resolveThemeCssVariables('classic', 'light')['--app-background'],
    'appearance changes classic environment',
  )
})

run('L. interface-style and appearance are independent', () => {
  const app = read('src/App.tsx')
  assert(app.includes('AppearanceProvider'), 'appearance provider')
  assert(app.includes('InterfaceStyleProvider'), 'interface style provider')
  const appearanceCache = read('src/features/appearance/appearanceCache.ts')
  const styleCache = read('src/features/interface-style/interfaceStyleCache.ts')
  assert(appearanceCache.includes('ourwed:appearance'), 'appearance cache key')
  assert(styleCache.includes('ourwed:interface-style'), 'style cache key')
  assert(!appearanceCache.includes('ourwed:interface-style'), 'no merged keys')
})

run('M. Settings exposes exactly two appearance choices (Jasny / Ciemny)', () => {
  const page = read('src/pages/AppearanceSettingsPage.tsx')
  assertEq(APPEARANCE_OPTIONS.length, 2, 'two options')
  assert(APPEARANCE_OPTIONS.some((o) => o.name === 'Jasny'), 'Jasny label')
  assert(APPEARANCE_OPTIONS.some((o) => o.name === 'Ciemny'), 'Ciemny label')
  assert(page.includes('AppearanceCard'), 'appearance cards')
  assert(page.includes('useAppearance'), 'appearance hook')
  assert(page.includes('aria-label="Wygląd aplikacji"'), 'radiogroup label')
})

run('N. no System choice exists', () => {
  const page = read('src/pages/AppearanceSettingsPage.tsx')
  const types = read('src/features/appearance/types.ts')
  for (const forbidden of [
    'Systemowy',
    'Automatyczny',
    'Zgodny z systemem',
    "'system'",
    '"system"',
  ]) {
    assert(!page.includes(forbidden), `settings excludes ${forbidden}`)
    assert(!types.includes(forbidden), `types excludes ${forbidden}`)
  }
})

run('O. body-mounted portal inherits root appearance context', () => {
  const portal = read('src/components/ui/FloatingPortal.tsx')
  const toast = read('src/components/ui/Toast.tsx')
  assert(!portal.includes('data-appearance'), 'FloatingPortal does not override')
  assert(!toast.includes('data-appearance='), 'Toast does not override')
  assert(portal.includes('createPortal'), 'portal mounts to body')
})

run('P. public isolation forces light appearance', () => {
  const pub = read('src/features/theme/usePublicThemeIsolation.ts')
  assert(pub.includes("applyAppearanceToDocument('light')"), 'public light')
  assert(pub.includes('readCachedAppearance'), 'restore cached on leave')
})

run('Q. database/profile mapping migration', () => {
  const mig = resolve(
    process.cwd(),
    'supabase/migrations/20260825230000_profiles_appearance.sql',
  )
  assert(existsSync(mig), 'migration file')
  const sql = readFileSync(mig, 'utf8')
  assert(sql.includes('appearance'), 'column')
  assert(sql.includes("default 'light'"), 'default light')
  assert(sql.includes('profiles_appearance_check'), 'check constraint')
  assert(sql.includes("'light'") && sql.includes("'dark'"), 'domain values')
  const schema = read('supabase/schema.sql')
  assert(schema.includes("appearance text not null default 'light'"), 'schema column')
  const service = read('src/features/appearance/appearanceService.ts')
  assert(service.includes("select('appearance')"), 'profile read')
  assert(service.includes('update({ appearance'), 'profile update')
})

run('R. switching appearance updates root attribute (apply path)', () => {
  withMockDom(() => {
    applyAppearanceToDocument('light')
    applyAppearanceToDocument('dark')
    assertEq(document.documentElement.dataset.appearance, 'dark', 'root dark')
  })
})

run('S. switching appearance updates cache', () => {
  withMockDom(() => {
    clearCachedAppearance()
    writeCachedAppearance('dark', 'uid-1')
    assertEq(readCachedAppearance('uid-1'), 'dark', 'cached dark')
  })
})

run('T. appearance service persist validation', () => {
  assert(validateAppearanceForPersist('light') === 'light', 'persist light')
  assert(validateAppearanceForPersist('dark') === 'dark', 'persist dark')
})

run('U. appearance survives simulated reload/bootstrap', () => {
  withMockDom(() => {
    writeCachedAppearance('dark', null)
    applyAppearanceToDocument(readCachedAppearance(null))
    assertEq(readDocumentAppearance(), 'dark', 'reload dark')
    writeCachedAppearance('light', null)
    applyAppearanceToDocument(readCachedAppearance(null))
    assertEq(readDocumentAppearance(), 'light', 'reload light')
  })
})

run('V. meta theme-color architecture is appearance-aware', () => {
  const lightChrome = resolveBrowserThemeColor('classic', 'light')
  assertEq(lightChrome, '#f3efe8', 'classic light chrome from tokens')
  assertEq(
    resolveBrowserThemeColor('graphite', 'dark'),
    resolveThemeCssVariables('graphite', 'dark')['--browser-chrome-color'],
    'dark chrome from semantic token',
  )
  withMockDom(() => {
    applyAppearanceToDocument('dark')
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement
    assertEq(
      meta.content,
      resolveBrowserThemeColor('classic', 'dark'),
      'meta updated from resolver',
    )
  })
})

run('W. status colors accept appearance with real dark variants', () => {
  const light = resolveStatusColors('light')
  const dark = resolveStatusColors('dark')
  assertEq(light['--status-error-soft'], SHARED_STATUS_TOKENS['--status-error-soft'], 'light frozen')
  assertEq(dark['--status-error-soft'], DARK_STATUS_TOKENS['--status-error-soft'], 'dark soft error')
  assert(
    dark['--status-success-soft'] !== light['--status-success-soft'],
    'dark status differs from light',
  )
})

run('X. provider wiring in App shell', () => {
  const app = read('src/App.tsx')
  assert(app.includes('AppearanceProvider'), 'provider mounted')
  const provider = read('src/features/appearance/AppearanceProvider.tsx')
  assert(provider.includes('getUserAppearance'), 'DB reconcile')
  assert(provider.includes('writeCachedAppearance'), 'cache sync')
  assert(provider.includes('applyAppearanceToDocument'), 'document apply')
})

run('Y. Phase 1B dark palette differs from light', () => {
  for (const id of THEME_IDS) {
    const light = resolveThemeCssVariables(id, 'light')
    const dark = resolveThemeCssVariables(id, 'dark')
    assert(light['--app-background'] !== dark['--app-background'], `${id} env differs`)
    assert(light['--text-primary'] !== dark['--text-primary'], `${id} text differs`)
    assert(light['--surface-primary'] !== dark['--surface-primary'], `${id} surface differs`)
  }
})

run('Z. dark themes complete semantic keys', () => {
  for (const id of THEME_IDS) {
    const dark = resolveThemeCssVariables(id, 'dark')
    for (const key of SEMANTIC_TOKEN_KEYS) {
      assert(Boolean(dark[key]), `${id} dark missing ${key}`)
    }
  }
})

run('AA. no pure black page or pure white body text in dark', () => {
  for (const id of THEME_IDS) {
    const dark = resolveThemeCssVariables(id, 'dark')
    assert(dark['--app-background']!.toLowerCase() !== '#000000', `${id} no pure black bg`)
    assert(dark['--text-primary']!.toLowerCase() !== '#ffffff', `${id} no pure white text`)
  }
})

run('AB. dark themes remain distinguishable', () => {
  const envs = THEME_IDS.map(
    (id) => resolveThemeCssVariables(id, 'dark')['--app-background'],
  )
  assert(new Set(envs).size >= 4, 'at least four distinct dark environments')
  assert(
    resolveThemeCssVariables('graphite', 'dark')['--sidebar-background'] !==
      resolveThemeCssVariables('classic', 'dark')['--sidebar-background'],
    'graphite sidebar differs from classic',
  )
})

run('AC. browserThemeColor has no hardcoded literals', () => {
  const src = read('src/features/appearance/browserThemeColor.ts')
  assert(!src.includes('#'), 'no hex literals in browserThemeColor.ts')
})

run('AD. ThemePreviewCard is appearance-aware', () => {
  const preview = read('src/features/theme/ThemePreviewCard.tsx')
  assert(preview.includes('useAppearance'), 'uses appearance hook')
  assert(preview.includes('resolveThemeCssVariables'), 'resolves appearance tokens')
})

run('AE. v3 dark materials use appearance root selector', () => {
  const materials = read('src/features/dashboard-v3/v3Materials.css')
  assert(materials.includes("[data-appearance='dark']"), 'dark v3 materials block')
})

run('AF. Sidebar pilot hardcoded colors removed', () => {
  const sidebar = read('src/layouts/Sidebar.module.css')
  assert(!sidebar.includes('#fff'), 'no #fff in sidebar')
  assert(!sidebar.includes('#0a0a0a'), 'no #0a0a0a in sidebar')
})

console.log('\nAppearance acceptance done.')
