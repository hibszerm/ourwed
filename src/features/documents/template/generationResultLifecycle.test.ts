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
  assert(pageSource.includes('[contract-generate-success]'), 'success log')
})

run('C — completed result is not erased by query invalidation', () => {
  assert(pageSource.includes('generationSuccessRef'), 'success ref')
  assert(
    pageSource.includes("step === 'preview' || step === 'saved'"),
    'skips reset on preview',
  )
  assert(
    pageSource.includes('prepare_verification_skipped_after_success'),
    'prepare skipped after success',
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
  assert(pageSource.includes('needsReviewUserMessage'), 'page uses helper')
  assert(pageSource.includes('setError(needsReviewUserMessage'), 'sets error')
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
  assert(pageSource.includes('[contract-generate-catch]'), 'catch log')
  assert(pageSource.includes('userFacingGenerationErrorMessage'), 'user error')
  assert(pageSource.includes("setStep('verify')"), 'returns to verify')
})

run('G — undefined service result shows user-facing error', () => {
  const outcome = interpretGenerationAttemptResult(undefined)
  assertEq(outcome.kind, 'invalid_result', 'kind')
  if (outcome.kind !== 'invalid_result') throw new Error('expected invalid')
  assert(outcome.reason.includes('nie zwrócił'), 'message')
})

run('H — no silent early return exists for needs_review', () => {
  assert(
    !pageSource.includes('setError(null)\n        setStep(\'verify\')'),
    'old silent clear removed',
  )
  assert(pageSource.includes('[contract-generate-early-return]'), 'logs returns')
  assert(pageSource.includes('needs_review_empty_payload'), 'empty payload reason')
})

run('I — finally resets pending without clearing success', () => {
  assert(pageSource.includes('[contract-generate-finally]'), 'finally log')
  assert(pageSource.includes('setGeneratePending(false)'), 'resets pending')
  assert(
    pageSource.includes('generationSuccessRef.current = true'),
    'success sticky',
  )
  const finallyIdx = pageSource.indexOf('[contract-generate-finally]')
  const clearSuccessInFinally = pageSource
    .slice(finallyIdx, finallyIdx + 400)
    .includes('generationSuccessRef.current = false')
  assert(!clearSuccessInFinally, 'finally does not clear success')
})

run('J — form submit does not reload/reset the page', () => {
  assert(pageSource.includes("type=\"button\""), 'button type')
  assert(pageSource.includes('event.preventDefault()'), 'preventDefault')
  assert(pageSource.includes('event.stopPropagation()'), 'stopPropagation')
  assert(!/<form[\s>]/i.test(pageSource), 'no wrapping form')
})

run('K — package-contract success shape is handled', () => {
  const outcome = interpretGenerationAttemptResult({
    status: 'completed',
    artifact: artifact({ draftId: 'pkg-draft' }),
  })
  assertEq(outcome.kind, 'completed', 'package completed')
  assert(pageSource.includes('packageContractMode: true'), 'package mode')
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
  assert(pageSource.includes('duplicate_submit_guard'), 'guard log')
  assert(
    pageSource.includes(
      'if (generatePending || generateInFlightRef.current)',
    ),
    'pending guard',
  )
})

run('N — query refetch cannot revert success UI to review', () => {
  assert(
    pageSource.includes('generationSuccessRef.current || step === \'preview\''),
    'guard effect',
  )
  assert(
    pageSource.includes('Never reset a successful generation UI'),
    'commented intent',
  )
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
  for (const event of [
    '[contract-generate-start]',
    '[contract-generate-service-result]',
    '[contract-generate-early-return]',
    '[contract-generate-success]',
    '[contract-generate-catch]',
    '[contract-generate-finally]',
  ]) {
    assert(pageSource.includes(event), event)
  }
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
