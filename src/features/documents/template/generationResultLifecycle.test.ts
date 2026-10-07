/**
 * Option B generation UI lifecycle and safe legacy-service retirement guards.
 * Run: npm run test:generation-result-lifecycle
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
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

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

const page = source('src/pages/WeddingContractGenerationPage.tsx')
const legacyServicePath = resolve(
  process.cwd(),
  'src/features/documents/template/WeddingContractGenerationService.ts',
)

run('production generation starts through Option B', () => {
  assert(page.includes('startContractGeneration'), 'authenticated start action')
  assert(page.includes('continueContractGeneration'), 'authenticated continuation action')
})

run('accepted candidate remains the preview source until explicit save', () => {
  assert(page.includes('downloadAcceptedContractCandidate'), 'candidate download')
  assert(page.includes('setDocxBytes(bytes)'), 'candidate bytes back preview')
  assert(page.includes("setStep('preview')"), 'accepted candidate opens preview')
  assert(page.includes('saveGeneratedContract({'), 'existing explicit persistence')
})

run('MissingInput form submits one prevented batch', () => {
  const form = source(
    'src/features/contract-generation-spike/ContractGenerationMissingInputForm.tsx',
  )
  assert(form.includes('event.preventDefault()'), 'form prevents page reload')
  assert(form.includes('answersForMissingInputs'), 'submits the displayed input batch')
})

run('generation failure is visible and safe', () => {
  assert(page.includes('setSafeClientError(err)'), 'maps boundary errors safely')
  assert(page.includes("setStep('failed')"), 'shows failure state')
})

run('pending guard prevents duplicate generation', () => {
  assert(page.includes('generateInFlightRef'), 'in-flight guard')
  assert(
    page.includes('if (generatePending || generateInFlightRef.current) return'),
    'duplicate calls are blocked',
  )
})

run('ephemeral lifecycle finalizes and does not recover old transactions', () => {
  assert(page.includes('finalizeContractGeneration'), 'terminal cleanup action')
  assert(!page.includes('recoverContractGeneration'), 'no legacy recovery action')
})

run('legacy generation service stays retired and is not called by the page', () => {
  assert(!existsSync(legacyServicePath), 'legacy service file remains absent')
  assert(!page.includes('WeddingContractGenerationService'), 'page has no legacy service reference')
})

console.log('\nOption B generation lifecycle checks finished.')
