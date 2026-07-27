/**
 * Optional live smoke — Guarded AI transform.
 * Requires OPENAI_API_KEY. Synthetic data only.
 * Run: npm run test:ai-contract-guarded-transform-live
 */

const key = process.env.OPENAI_API_KEY?.trim()
if (!key) {
  console.log('skip — OPENAI_API_KEY not set')
  process.exit(0)
}

console.log(
  'Live Guarded AI smoke requires deployed edge function ai-contract-guarded-transform.',
)
console.log(
  JSON.stringify({
    mode: 'guarded_ai_transform',
    promptVersion: '2026-07-guarded-ai-v2',
    responseVersion: '2026-07-guarded-ai-v2',
    outputShape: 'changedBlocks',
    note: 'Invoke via authenticated app session; do not print contract text.',
  }),
)
process.exit(0)
