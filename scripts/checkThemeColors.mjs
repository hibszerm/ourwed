#!/usr/bin/env node
/**
 * Guard: fail when NEW unapproved hard-coded UI colors appear in product code.
 * Pre-existing violations live in scripts/themeColorBaseline.json (grandfathered).
 *
 * Usage:
 *   node scripts/checkThemeColors.mjs
 *   node scripts/checkThemeColors.mjs --write-baseline   # refresh after intentional cleanup
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(process.cwd(), 'src')
const BASELINE_PATH = resolve(process.cwd(), 'scripts/themeColorBaseline.json')
const WRITE = process.argv.includes('--write-baseline')

const COLOR_RE =
  /#(?:[0-9a-fA-F]{3,8})\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g

const SCAN_DIRS = ['components', 'features', 'pages', 'layouts']

const ALLOWLIST_PREFIXES = [
  'features/theme/',
  'features/landing/',
  'features/landing-v2/',
  'pages/LandingPage',
  'pages/LandingPageV1',
  'features/prewedding/PreWeddingPublicForm',
  'features/ai-contract-lab/',
  'features/ai-contract-experiment/',
  'features/ai-contract-transform/',
  'features/documents/mapping/',
  'features/documents/ai/',
  'styles/',
]

function isAllowlisted(relPath) {
  const norm = relPath.replace(/\\/g, '/')
  if (norm.includes('.test.') || norm.includes('Acceptance.test')) return true
  return ALLOWLIST_PREFIXES.some(
    (p) => norm === p || norm.startsWith(p) || norm.startsWith(p.replace(/\/$/, '')),
  )
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.(css|module\.css|tsx|ts)$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

function collectViolations() {
  const map = {}
  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir)
    if (!existsSync(abs)) continue
    for (const file of walk(abs)) {
      const rel = relative(ROOT, file).replace(/\\/g, '/')
      if (isAllowlisted(rel)) continue
      const src = readFileSync(file, 'utf8')
      const matches = src.match(COLOR_RE)
      if (!matches?.length) continue
      map[rel] = matches.length
    }
  }
  return map
}

const THEME_BRANCH_RE =
  /themeId\s*===\s*['"](?:classic|gentlemen|sage_garden|burgundy_estate|mocha_editorial)['"]|[data-theme=['"](?:gentlemen|sage_garden|burgundy_estate|mocha_editorial)['"]|switch\s*\(\s*themeId/i

function collectThemeBranches() {
  const hits = []
  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir)
    if (!existsSync(abs)) continue
    for (const file of walk(abs)) {
      const rel = relative(ROOT, file).replace(/\\/g, '/')
      if (rel.startsWith('features/theme/')) continue
      if (rel.includes('.test.')) continue
      const src = readFileSync(file, 'utf8')
      if (THEME_BRANCH_RE.test(src)) hits.push(rel)
    }
  }
  return hits
}

const current = collectViolations()
const branches = collectThemeBranches()

if (WRITE) {
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), files: current }, null, 2)}\n`,
  )
  console.log(`Wrote baseline with ${Object.keys(current).length} files → ${BASELINE_PATH}`)
  process.exit(0)
}

if (!existsSync(BASELINE_PATH)) {
  console.error('Missing scripts/themeColorBaseline.json — run with --write-baseline once.')
  process.exitCode = 1
  process.exit()
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
const baseFiles = baseline.files || {}

const regressions = []
for (const [file, count] of Object.entries(current)) {
  const prev = baseFiles[file] ?? 0
  if (count > prev) {
    regressions.push({ file, prev, count })
  }
}

// New files with any hard-coded color
for (const file of Object.keys(current)) {
  if (!(file in baseFiles) && current[file] > 0) {
    if (!regressions.some((r) => r.file === file)) {
      regressions.push({ file, prev: 0, count: current[file] })
    }
  }
}

let failed = false

if (regressions.length) {
  failed = true
  console.error('NEW hard-coded color regressions (vs themeColorBaseline.json):\n')
  for (const r of regressions) {
    console.error(`  ${r.file}: ${r.prev} → ${r.count}`)
  }
  console.error(
    '\nUse semantic tokens (docs/design-system/themes.md) or refresh baseline after cleanup.\n',
  )
}

if (branches.length) {
  failed = true
  console.error('Theme-name conditionals in product components:\n')
  for (const f of branches) console.error(`  ${f}`)
}

if (failed) process.exitCode = 1
else {
  console.log(
    `PASS  theme color guard (${Object.keys(current).length} grandfathered files, 0 regressions)`,
  )
}
