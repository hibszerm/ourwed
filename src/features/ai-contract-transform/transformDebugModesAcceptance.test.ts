/**
 * Transform Lab debug-mode flag acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/ai-contract-transform/transformDebugModesAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

const page = source(
  'src/features/ai-contract-transform/TransformComparisonPage.tsx',
)
const flags = source('src/features/ai-contract-lab/aiContractLabFlags.ts')
const envExample = source('.env.example')

assert(
  flags.includes('VITE_ENABLE_CONTRACT_AI_DEBUG_MODES'),
  'debug flag helper',
)
assert(
  page.includes('isContractAiDebugModesEnabled'),
  'lab page uses debug flag',
)
assert(
  page.includes('{debugModes ? ('),
  'Mode B UI gated',
)
assert(
  envExample.includes('VITE_ENABLE_CONTRACT_AI_DEBUG_MODES'),
  'env documented',
)
assert(
  !envExample.includes('MICROSOFT_GRAPH_TENANT_ID'),
  'microsoft graph env removed',
)
assert(envExample.includes('GOTENBERG_URL'), 'gotenberg documented')

// Guarded AI artifacts must still exist
assert(
  source('src/features/ai-contract-transform/guardedTransformLive.smoke.ts')
    .length > 0,
  'guarded smoke kept',
)

console.log('ok — transform debug modes gated; Guarded AI retained')
