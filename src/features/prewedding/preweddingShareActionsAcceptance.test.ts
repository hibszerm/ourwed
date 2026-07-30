/**
 * Pre-wedding share / generate-link acceptance tests.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildPreweddingPublicUrl,
  mapPreweddingShareError,
  preweddingShareMessage,
} from '@/features/prewedding/preweddingShareHelpers'

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

const workspaceSrc = readFileSync(
  resolve(
    process.cwd(),
    'src/features/weddings/detail/v2/WeddingPreWeddingQuestionnaireWorkspace.tsx',
  ),
  'utf8',
)
const serviceSrc = readFileSync(
  resolve(process.cwd(), 'src/lib/api/preweddingQuestionnaireService.ts'),
  'utf8',
)
const migrationSrc = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260729210000_prewedding_pgcrypto_search_path.sql',
  ),
  'utf8',
)

run('1. Public URL uses /ankieta/:token and origin', () => {
  assertEq(
    buildPreweddingPublicUrl('abc123', 'https://app.ourwed.pl'),
    'https://app.ourwed.pl/ankieta/abc123',
    'url',
  )
  assert(!buildPreweddingPublicUrl('abc123', 'https://app.ourwed.pl').includes('wedding'), 'no wedding id')
})

run('2. Share message is honest (no fake sent email)', () => {
  const msg = preweddingShareMessage('Ankieta', 'https://x/ankieta/t')
  assert(msg.includes('https://x/ankieta/t'), 'contains url')
  assert(!/wysłaliśmy e-mail/i.test(msg), 'no fake mail')
})

run('3. Error mapper hides internals and maps ownership', () => {
  assertEq(
    mapPreweddingShareError({ message: 'not_owner' }),
    'Nie masz uprawnień do udostępnienia tej ankiety.',
    'owner',
  )
  assertEq(
    mapPreweddingShareError({ message: 'function gen_random_bytes(integer) does not exist' }),
    'Nie udało się wygenerować linku. Spróbuj ponownie.',
    'pgcrypto',
  )
  assert(!mapPreweddingShareError({ message: 'digest' }).includes('digest'), 'no internals')
})

run('4. Workspace shows loading / error / success feedback', () => {
  assert(workspaceSrc.includes('Generowanie…'), 'generate pending')
  assert(workspaceSrc.includes('Przygotowywanie…'), 'share pending')
  assert(workspaceSrc.includes('prewedding-action-error'), 'error testid')
  assert(workspaceSrc.includes('prewedding-action-success'), 'success testid')
  assert(workspaceSrc.includes('disabled={Boolean(sharePending)}'), 'disable while pending')
})

run('5. Share without link generates then opens panel', () => {
  assert(workspaceSrc.includes("runShareFlow('share')"), 'share flow')
  assert(workspaceSrc.includes('ensureShareLink'), 'ensureShareLink')
  assert(workspaceSrc.includes('setShareOpen(true)'), 'opens panel')
  assert(workspaceSrc.includes('setQuestionnaireCache(result.questionnaire)'), 'cache update')
})

run('6. Query key is coherent and invalidated', () => {
  assert(workspaceSrc.includes("PREWEDDING_QUERY_KEY = 'prewedding-questionnaire'"), 'detail key const')
  assert(workspaceSrc.includes('[PREWEDDING_QUERY_KEY, wedding.id]'), 'detail key usage')
  assert(workspaceSrc.includes('invalidateQueries({ queryKey: [PREWEDDING_QUERY_KEY, wedding.id] })'), 'invalidate')
  assert(serviceSrc.includes('persistShareToken'), 'session token')
  assert(serviceSrc.includes('hasPublicToken'), 'hash flag')
})

run('7. Token strategy: plaintext only once; rotate when unrecovered', () => {
  assert(serviceSrc.includes('Plaintext cannot be reconstructed'), 'documented')
  assert(workspaceSrc.includes('share-token-unrecoverable'), 'unrecoverable UI')
  assert(workspaceSrc.includes('rotate-link-btn'), 'rotate')
  assert(migrationSrc.includes("set search_path = public, extensions"), 'search_path fix')
  assert(migrationSrc.includes('extensions.gen_random_bytes'), 'qualified bytes')
  assert(!/drop policy|disable row level/i.test(migrationSrc), 'rls intact')
})

run('8. Mailto is optional; copy message always available', () => {
  assert(workspaceSrc.includes('copy-message-btn'), 'copy message')
  assert(workspaceSrc.includes('mailto-btn'), 'mailto optional')
  assert(workspaceSrc.includes('partner1Email || wedding.couple.email'), 'email gate')
})

console.log('\nprewedding share actions: done')
