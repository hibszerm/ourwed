// =============================================================================
// User-facing error sanitization — acceptance + presentation guard
// =============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { mapAuthError } from '@/features/auth/services/authErrors'
import {
  getUserFacingErrorMessage,
  __testOnly_isTechnicalMessage,
} from '@/lib/errors/userFacingError'

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

console.log('\nUser-facing error sanitization\n')

const FALLBACK = 'Nie udało się zapisać zadania. Spróbuj ponownie.'

assert(
  getUserFacingErrorMessage(new Error('English technical text'), FALLBACK) ===
    FALLBACK,
  'unknown English Error → fallback',
)

assert(
  getUserFacingErrorMessage(
    {
      message: 'duplicate key value violates unique constraint "tasks_pkey"',
      code: '23505',
    },
    FALLBACK,
  ) === FALLBACK,
  'PostgREST-like duplicate key → fallback',
)

assert(
  getUserFacingErrorMessage(new Error('Failed to fetch'), FALLBACK) === FALLBACK,
  'network Failed to fetch → fallback',
)

assert(
  getUserFacingErrorMessage(
    new Error('CHARGED_REQUIRES_POSITIVE_AMOUNT'),
    FALLBACK,
  ).includes('0 zł'),
  'known domain code mapped',
)

assert(
  getUserFacingErrorMessage(
    { message: 'PRO_ACCESS_REQUIRED', code: 'PRO_ACCESS_REQUIRED' },
    FALLBACK,
  ).includes('PRO'),
  'PRO access mapped',
)

assert(
  getUserFacingErrorMessage(
    new Error('Nie udało się zapisać lokalizacji.'),
    FALLBACK,
  ) === 'Nie udało się zapisać lokalizacji.',
  'intentional Polish app copy may pass through',
)

assert(
  mapAuthError(new Error('Invalid login credentials'), FALLBACK).includes(
    'zalogować',
  ),
  'auth known credentials mapped',
)

assert(
  mapAuthError(new Error('Totally unknown supabase gibberish XYZ'), FALLBACK) ===
    FALLBACK,
  'auth unknown → fallback (not raw)',
)

assert(
  __testOnly_isTechnicalMessage('JWT expired'),
  'JWT classified technical',
)
assert(
  __testOnly_isTechnicalMessage('row-level security policy'),
  'RLS classified technical',
)

// ---------------------------------------------------------------------------
// Static presentation guard — production UI must not toast/setError raw .message
// ---------------------------------------------------------------------------

const ROOT = join(process.cwd(), 'src')
const SCAN_DIRS = ['pages', 'features', 'admin/pages', 'components']
const ALLOW_PATH_FRAGMENTS = [
  '.test.',
  'Acceptance.test',
  'userFacingError.ts',
  'authErrors.ts',
  'generationPipelineError.ts',
  'proAccessError.ts',
  'lib/dev/',
  // console / DEV diagnostic payloads (not UI copy)
  'PreWeddingDayPlan.tsx',
  'WeddingContractGenerationPage.tsx', // console diagnostic only for errorMessage field in log
]

const FORBIDDEN = [
  /showToast\(\s*\w+\.message\s*[,)]/,
  /showToast\(\s*\w+\.message\s*\|\|/,
  /setError\(\s*\w+\.message\s*\)/,
  /setErrorMessage\(\s*\w+\.message\s*\)/,
  /\w+\s+instanceof\s+Error\s*\?\s*\w+\.message\s*:/,
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.(tsx|ts)$/.test(name)) out.push(full)
  }
  return out
}

const offenders: string[] = []
for (const relDir of SCAN_DIRS) {
  const abs = join(ROOT, relDir)
  let files: string[]
  try {
    files = walk(abs)
  } catch {
    continue
  }
  for (const file of files) {
    // Presentation surfaces only (UI components / pages).
    if (!file.endsWith('.tsx')) continue
    const rel = relative(process.cwd(), file)
    if (ALLOW_PATH_FRAGMENTS.some((f) => rel.includes(f))) continue
    const src = readFileSync(file, 'utf8')
    const lines = src.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      if (/console\.(log|info|warn|error|debug)/.test(line)) continue
      if (/errorMessage:\s*err instanceof Error/.test(line)) continue
      if (FORBIDDEN.some((re) => re.test(line))) {
        if (/err\.message\s*===/.test(line)) continue
        if (/getUserFacingErrorMessage/.test(line)) continue
        offenders.push(`${rel}:${i + 1}: ${line.trim()}`)
      }
    }
  }
}

assert(offenders.length === 0, `no raw error.message presentation (${offenders.length})`)
if (offenders.length) {
  for (const o of offenders.slice(0, 25)) console.error('   ', o)
  if (offenders.length > 25) console.error(`    … +${offenders.length - 25} more`)
}

console.log(`\nuser-facing-error: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exitCode = 1
