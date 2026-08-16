/**
 * Production hygiene / privacy static acceptance (N4).
 *
 * Guards:
 * - no production module imports from src/lib/dev
 * - no ungated browser console.log/info/debug/table in production presentation/service paths
 * - no machine-specific /Users/ absolute paths in src runtime
 * - no obvious founder-brand runtime regression markers in default template
 * - console helpers exist and are DEV-gated
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

let passed = 0
let failed = 0

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`  FAIL  ${msg}`)
    failed++
  } else {
    console.log(`  PASS  ${msg}`)
    passed++
  }
}

const root = resolve(process.cwd())
const srcRoot = resolve(root, 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (
        name === 'node_modules' ||
        name === 'benchmarks' ||
        name === 'fixtures' ||
        name === '__tests__'
      ) {
        continue
      }
      walk(full, out)
      continue
    }
    if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full)
  }
  return out
}

function isTestOrSmoke(path: string): boolean {
  const base = path.split('/').pop() ?? ''
  if (/\.(test|spec)\.(ts|tsx)$/.test(base)) return true
  if (/Acceptance\.test\.(ts|tsx)$/.test(base)) return true
  if (/acceptance\.test\.(ts|tsx)$/i.test(base)) return true
  if (/\.smoke\.(ts|tsx)$/i.test(base)) return true
  if (base.includes('Live.smoke') || base.includes('live.smoke')) return true
  return false
}

function isAllowlistedConsoleFile(rel: string): boolean {
  // The DEV helpers themselves call console.* behind isDev().
  if (rel === 'lib/debug/devConsole.ts') return true
  // N2 unknown-error DEV log (already import.meta.env.DEV gated).
  if (rel === 'lib/errors/userFacingError.ts') return true
  return false
}

const CONSOLE_NOISE =
  /\bconsole\.(log|info|debug|table)\s*\(/
const CONSOLE_ERROR_WARN = /\bconsole\.(error|warn)\s*\(/

console.log('\nN4 — production hygiene / privacy\n')

// ---------------------------------------------------------------------------
const files = walk(srcRoot)
const prodFiles = files.filter((f) => !isTestOrSmoke(f))

assert(prodFiles.length > 100, `scanned production-ish files (${prodFiles.length})`)

// 1) No production imports from @/lib/dev
const prodDevImporters: string[] = []
for (const f of prodFiles) {
  const rel = relative(srcRoot, f)
  if (rel.startsWith('lib/dev/')) continue
  const src = readFileSync(f, 'utf8')
  if (
    /from\s+['"]@\/lib\/dev\//.test(src) ||
    /from\s+['"]\.\.\/.*lib\/dev\//.test(src)
  ) {
    prodDevImporters.push(rel)
  }
}
assert(
  prodDevImporters.length === 0,
  `no production imports from src/lib/dev (${prodDevImporters.join(', ') || 'ok'})`,
)

// 2) Ungated console.log/info/debug/table
const ungatedNoise: string[] = []
for (const f of prodFiles) {
  const rel = relative(srcRoot, f)
  if (isAllowlistedConsoleFile(rel)) continue
  const lines = readFileSync(f, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (!CONSOLE_NOISE.test(line)) continue
    const window = lines.slice(Math.max(0, i - 8), i + 1).join('\n')
    const gated =
      /import\.meta\.env\.DEV/.test(window) ||
      /\bisDev\s*\(/.test(window) ||
      /\benabled\s*\(/.test(window) ||
      /\bif\s*\(\s*!?\s*DEV\b/.test(window)
    if (!gated) ungatedNoise.push(`${rel}:${i + 1}`)
  }
}
assert(
  ungatedNoise.length === 0,
  `no ungated console.log/info/debug/table (${ungatedNoise.slice(0, 8).join('; ') || 'ok'})`,
)

// 3) Ungated console.error/warn outside allowlist (presentation/services)
const ungatedErr: string[] = []
for (const f of prodFiles) {
  const rel = relative(srcRoot, f)
  if (isAllowlistedConsoleFile(rel)) continue
  const lines = readFileSync(f, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (!CONSOLE_ERROR_WARN.test(line)) continue
    const window = lines.slice(Math.max(0, i - 8), i + 1).join('\n')
    const gated =
      /import\.meta\.env\.DEV/.test(window) ||
      /\bisDev\s*\(/.test(window) ||
      /\benabled\s*\(/.test(window) ||
      /\bif\s*\(\s*!?\s*DEV\b/.test(window)
    if (!gated) ungatedErr.push(`${rel}:${i + 1}`)
  }
}
assert(
  ungatedErr.length === 0,
  `no ungated console.error/warn in browser src (${ungatedErr.slice(0, 8).join('; ') || 'ok'})`,
)

// 4) Machine-specific absolute paths in src runtime
const absHits: string[] = []
for (const f of prodFiles) {
  const rel = relative(srcRoot, f)
  const src = readFileSync(f, 'utf8')
  if (/\/Users\/[A-Za-z0-9._-]+/.test(src) || /\/home\/[A-Za-z0-9._-]+/.test(src)) {
    absHits.push(rel)
  }
}
assert(
  absHits.length === 0,
  `no /Users or /home absolute paths in src (${absHits.join(', ') || 'ok'})`,
)

// 5) DEV console helpers exist and gate
const helper = readFileSync(resolve(srcRoot, 'lib/debug/devConsole.ts'), 'utf8')
assert(helper.includes('function isDev'), 'devConsole isDev helper')
assert(helper.includes('export function devInfo'), 'devConsole devInfo')
assert(helper.includes('export function devInfoArgs'), 'devConsole devInfoArgs')
assert(helper.includes('export function devErrorArgs'), 'devConsole devErrorArgs')
assert(/if\s*\(\s*!isDev\(\)\s*\)\s*return/.test(helper), 'devConsole no-ops when not DEV')

// 6) Contract generation page uses DEV helpers (no raw console.*)
const genPage = readFileSync(
  resolve(srcRoot, 'pages/WeddingContractGenerationPage.tsx'),
  'utf8',
)
assert(!/\bconsole\.(log|info|debug|error|warn)\s*\(/.test(genPage), 'contract page no raw console')
assert(genPage.includes("from '@/lib/debug/devConsole'"), 'contract page uses devConsole')
assert(
  !genPage.includes('err.toJSON()'),
  'contract page does not dump GenerationPipelineError.toJSON()',
)

// 7) Generation pipeline stage logging is DEV-only
const pipeline = readFileSync(
  resolve(srcRoot, 'features/documents/template/generationPipelineError.ts'),
  'utf8',
)
assert(pipeline.includes('if (!DEV) return'), 'generation stage log DEV-only')
assert(!/\bconsole\.(log|info)\s*\(/.test(pipeline), 'pipeline no raw console.info/log')

// 8) Light founder-brand runtime regression (default questionnaire)
const defaultTpl = readFileSync(
  resolve(srcRoot, 'features/prewedding/defaultTemplate.ts'),
  'utf8',
)
assert(!/gentlemenproductions/i.test(defaultTpl), 'default template no founder email domain')
assert(!/Gentlemen\s+Productions/i.test(defaultTpl), 'default template no founder brand name')
assert(defaultTpl.includes('Ankieta przedślubna'), 'default template Polish title preserved')

// 9) Packages page still clean
const packages = readFileSync(resolve(srcRoot, 'pages/PackagesPage.tsx'), 'utf8')
assert(!packages.includes("from '@/lib/dev/"), 'PackagesPage no lib/dev import')

console.log(`\nproduction-hygiene: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exitCode = 1
