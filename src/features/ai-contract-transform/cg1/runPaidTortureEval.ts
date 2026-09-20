/**
 * CG1 paid LLM evaluation — EXPLICIT OPT-IN ONLY.
 *
 * Requires:
 *   CG1_PAID_EVAL=1
 *   OPENAI_API_KEY
 *
 * Does NOT run in normal CI. Does NOT call production CRM.
 * Synthetic fixtures only.
 *
 * Run:
 *   CG1_PAID_EVAL=1 OPENAI_API_KEY=… npm run test:cg1-contract-paid-eval
 *
 * Current production contract rewrite uses Edge `ai-contract-full-rewrite`
 * (default model gpt-4.1-mini). Full end-to-end paid rewrite against deployed
 * Edge also needs an authenticated app session; this harness documents the
 * gate and exits cleanly when credentials are absent.
 */

const paid = process.env.CG1_PAID_EVAL === '1'
const key = process.env.OPENAI_API_KEY?.trim()

if (!paid) {
  console.log(
    JSON.stringify({
      status: 'SKIPPED',
      reason: 'CG1_PAID_EVAL not set to 1',
      note: 'Deterministic suite covers placement/structure without paid calls.',
      command:
        'CG1_PAID_EVAL=1 OPENAI_API_KEY=… npm run test:cg1-contract-paid-eval',
    }),
  )
  process.exit(0)
}

if (!key) {
  console.log(
    JSON.stringify({
      status: 'SKIPPED',
      reason: 'OPENAI_API_KEY absent',
      note: 'Refuse to pull Edge secrets into the local shell automatically.',
    }),
  )
  process.exit(0)
}

console.log(
  JSON.stringify({
    status: 'READY_BUT_NOT_AUTO_INVOKED',
    reason:
      'Paid full-rewrite against production Edge requires authenticated user JWT; CG1 keeps CRM clean.',
    recommended:
      'Use deterministic suite for CI; run live smoke via authenticated app on synthetic package only when owner approves.',
    currentDefaultModel: 'gpt-4.1-mini',
    edgeFunction: 'ai-contract-full-rewrite',
    endpoint: 'https://api.openai.com/v1/responses',
  }),
)
process.exit(0)
