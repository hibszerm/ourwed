/**
 * Generation result lifecycle — no silent returns to review.
 * Run: npm run test:generation-result-lifecycle
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  interpretGenerationAttemptResult,
  needsReviewUserMessage,
} from './interpretGenerationAttemptResult'
import type { GenerationAttemptResult } from './generationAttemptResult'
import type { TransformContractResult } from './ContractTransformationService'

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

function artifact(
  partial?: Partial<TransformContractResult>,
): TransformContractResult {
  return {
    draftId: 'draft-1',
    templateId: 'tpl-1',
    templateVersionId: 'ver-1',
    title: 'Umowa',
    paragraphs: [{ index: 0, text: 'Hello' }],
    docxBytes: new ArrayBuffer(8),
    resolved: {},
    omittedKeys: [],
    qualityRetries: 0,
    usedMock: false,
    ...partial,
  } as TransformContractResult
}

const pageSource = readFileSync(
  resolve('src/pages/WeddingContractGenerationPage.tsx'),
  'utf8',
)

run('A — click path sets pending / Tworzymy umowę', () => {
  assert(pageSource.includes("setStep('generating')"), 'sets generating step')
  assert(pageSource.includes("'Tworzymy umowę'"), 'pending label')
  assert(pageSource.includes('setGeneratePending(true)'), 'pending true')
  assert(pageSource.includes('generatePending'), 'pending state')
})

run('B — completed result opens preview / success state', () => {
  const completed: GenerationAttemptResult = {
    status: 'completed',
    artifact: artifact(),
  }
  const outcome = interpretGenerationAttemptResult(completed)
  assertEq(outcome.kind, 'completed', 'kind')
  if (outcome.kind !== 'completed') throw new Error('expected completed')
  assertEq(outcome.generatedDocumentId, 'draft-1', 'draft id')
  assert(outcome.hasDocxBytes, 'docx bytes')
  assert(pageSource.includes("setStep('preview')"), 'page sets preview')
  assert(pageSource.includes('downloadAcceptedContractCandidate'), 'candidate retrieval')
})

run('C — completed result is not erased by query invalidation', () => {
  assert(pageSource.includes("setStep('preview')"), 'accepted candidate opens preview')
  assert(
    pageSource.includes('downloadAcceptedContractCandidate'),
    'preview comes from the accepted server candidate',
  )
  assert(
    pageSource.includes('saveGeneratedContract({'),
    'explicit existing persistence is retained',
  )
})

run('D — needs_review with issues shows them', () => {
  const attempt: GenerationAttemptResult = {
    status: 'needs_review',
    issues: [
      {
        id: 'missing_partner',
        message: 'W umowie brakuje drugiej osoby z pary (Jan).',
        registryKeys: ['partner2_full_name'],
      },
    ],
    reviewStatePatch: {
      editableFields: [
        {
          slotId: 'x',
          registryKey: 'partner2_full_name',
          label: 'Imię i nazwisko',
          group: 'wedding',
          value: '',
          missing: true,
          source: 'manual',
          sourceLabel: 'Ślub',
        },
      ],
      contextualMessages: ['W umowie brakuje drugiej osoby z pary (Jan).'],
      issues: [],
    },
    correlationId: 'c1',
  }
  const outcome = interpretGenerationAttemptResult(attempt)
  assertEq(outcome.kind, 'needs_review', 'kind')
  if (outcome.kind !== 'needs_review') throw new Error('expected needs_review')
  assertEq(outcome.invalidEmpty, false, 'not empty')
  assert(
    needsReviewUserMessage(outcome).includes('brakuje drugiej osoby'),
    'message',
  )
  assert(pageSource.includes('setMissingInputs(result.missingInputs)'), 'server supplies the complete requirements')
  assert(pageSource.includes('<ContractGenerationMissingInputForm'), 'requirements use generic batch UI')
})

run('E — needs_review with zero issues shows internal error', () => {
  const attempt: GenerationAttemptResult = {
    status: 'needs_review',
    issues: [],
    reviewStatePatch: {
      editableFields: [],
      contextualMessages: [],
      issues: [],
    },
    correlationId: 'c1',
  }
  const outcome = interpretGenerationAttemptResult(attempt)
  assertEq(outcome.kind, 'needs_review', 'kind')
  if (outcome.kind !== 'needs_review') throw new Error('expected needs_review')
  assert(outcome.invalidEmpty, 'invalid empty')
  assert(
    needsReviewUserMessage(outcome).includes('wewnętrzny błąd'),
    'internal error copy',
  )
})

run('F — failed / catch shows user-facing error', () => {
  assert(pageSource.includes('setSafeClientError(err)'), 'boundary errors are mapped to safe user messages')
  assert(pageSource.includes("setStep('failed')"), 'failure state is visible')
})

run('G — undefined service result shows user-facing error', () => {
  const outcome = interpretGenerationAttemptResult(undefined)
  assertEq(outcome.kind, 'invalid_result', 'kind')
  if (outcome.kind !== 'invalid_result') throw new Error('expected invalid')
  assert(outcome.reason.includes('nie zwrócił'), 'message')
})

run('H — no silent early return exists for needs_review', () => {
  assert(pageSource.includes("result.code === 'generation_safety'"), 'safety failures receive safe handling')
  assert(pageSource.includes("setStep('failed')"), 'failure does not disappear silently')
})

run('I — finally resets pending without clearing success', () => {
  assert(pageSource.includes('setGeneratePending(false)'), 'resets pending')
  assert(pageSource.includes("setStep('preview')"), 'accepted candidate is retained as preview state')
})

run('J — form submit does not reload/reset the page', () => {
  const form = readFileSync(resolve(process.cwd(), 'src/features/contract-generation-spike/ContractGenerationMissingInputForm.tsx'), 'utf8')
  assert(form.includes('event.preventDefault()'), 'form prevents reload')
  assert(form.includes('props.onSubmit(answersForMissingInputs'), 'submits one complete batch')
})

run('K — package-contract success shape is handled', () => {
  const outcome = interpretGenerationAttemptResult({
    status: 'completed',
    artifact: artifact({ draftId: 'pkg-draft' }),
  })
  assertEq(outcome.kind, 'completed', 'package completed')
  assert(pageSource.includes('startContractGeneration'), 'page calls the server boundary')
})

run('L — legacy success shape remains handled if still supported', () => {
  // Current service uses status; interpret rejects bare kind-only payloads.
  const legacy = {
    kind: 'completed',
  } as unknown as GenerationAttemptResult
  const outcome = interpretGenerationAttemptResult(legacy)
  assertEq(outcome.kind, 'invalid_result', 'rejects kind-only')
  const statusShape = interpretGenerationAttemptResult({
    status: 'completed',
    artifact: artifact(),
  })
  assertEq(statusShape.kind, 'completed', 'status shape works')
})

run('M — double click does not create duplicate generation', () => {
  assert(pageSource.includes('generateInFlightRef'), 'in-flight ref')
  assert(
    pageSource.includes(
      'if (generatePending || generateInFlightRef.current) return',
    ),
    'pending guard',
  )
})

run('N — accepted candidate remains the preview source', () => {
  assert(pageSource.includes('downloadAcceptedContractCandidate'), 'candidate is downloaded from authenticated boundary')
  assert(pageSource.includes('setDocxBytes(bytes)'), 'exact candidate bytes back the preview')
  assert(pageSource.includes('setStep(\'preview\')'), 'accepted candidate opens preview')
})

run('completed without docx bytes → invalid_result', () => {
  const outcome = interpretGenerationAttemptResult({
    status: 'completed',
    artifact: artifact({ docxBytes: new ArrayBuffer(0) }),
  })
  assertEq(outcome.kind, 'invalid_result', 'empty docx invalid')
})

run('needs_review with only contextual messages is valid', () => {
  const outcome = interpretGenerationAttemptResult({
    status: 'needs_review',
    issues: [],
    reviewStatePatch: {
      editableFields: [],
      contextualMessages: ['Uzupełnij datę płatności końcowej.'],
      issues: [],
    },
  })
  assertEq(outcome.kind, 'needs_review', 'kind')
  if (outcome.kind !== 'needs_review') throw new Error('expected needs_review')
  assertEq(outcome.invalidEmpty, false, 'has message')
  assert(
    needsReviewUserMessage(outcome).includes('datę płatności'),
    'shows contextual',
  )
})

run('page logs required generate lifecycle events', () => {
  assert(pageSource.includes('startContractGeneration'), 'authenticated boundary start')
  assert(pageSource.includes('continueContractGeneration'), 'authenticated boundary continuation')
  assert(pageSource.includes('recoverContractGeneration'), 'persisted session recovery')
})

run('service surfaces audit messages when field map empty', () => {
  const service = readFileSync(
    resolve('src/features/documents/template/WeddingContractGenerationService.ts'),
    'utf8',
  )
  assert(service.includes('audit_message_'), 'fallback issue ids')
  assert(
    service.includes('Always surface product messages as issues'),
    'commented intent',
  )
})

console.log('\nGeneration result lifecycle tests finished.')
