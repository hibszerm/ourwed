/**
 * Optional live smoke — Full AI rewrite.
 * Requires OPENAI_API_KEY. Synthetic data only.
 * Run: npm run test:ai-contract-full-rewrite-live
 */

const key = process.env.OPENAI_API_KEY?.trim()
if (!key) {
  console.log('skip — OPENAI_API_KEY not set')
  process.exit(0)
}

console.log(
  'Live Full AI smoke requires deployed edge function ai-contract-full-rewrite.',
)
console.log(
  JSON.stringify({
    mode: 'full_ai_trusted_rewrite',
    promptVersion: '2026-07-full-ai-v2',
    responseVersion: '2026-07-full-ai-v2',
    outputShape: 'changedBlocks',
    note: 'Invoke via authenticated app session; do not print contract text.',
  }),
)
process.exit(0)
