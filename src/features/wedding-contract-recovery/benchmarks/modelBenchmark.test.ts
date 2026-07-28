import {
  buildRecoveryUsageLogPayload,
  readRecoveryProviderUsage,
  summarizeExtractionTelemetry,
} from '../providerUsage'
import { scoreRecoveryExtraction } from './qualityScore'
import { FIXTURE_A_STANDARD, FIXTURE_B_ROLE_SEPARATION } from './fixtures'
import { estimateRecoveryCostUsd, percentile, summarizeLatency } from './stats'
import { emptyContractRecoveryExtraction } from '../schema/extractionSchema'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

// --- provider usage parsing ---
{
  const usage = readRecoveryProviderUsage({
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      input_tokens_details: { cached_tokens: 20 },
      output_tokens_details: { reasoning_tokens: 12 },
    },
  })
  assertEq(usage.inputTokens, 100, 'input')
  assertEq(usage.outputTokens, 50, 'output')
  assertEq(usage.totalTokens, 150, 'total')
  assertEq(usage.cachedInputTokens, 20, 'cached')
  assertEq(usage.reasoningTokens, 12, 'reasoning')
}

{
  const usage = readRecoveryProviderUsage({
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  })
  assertEq(usage.inputTokens, 10, 'prompt alias')
  assertEq(usage.outputTokens, 5, 'completion alias')
  assertEq(usage.totalTokens, 15, 'derived total')
}

{
  const usage = readRecoveryProviderUsage(null)
  assertEq(usage.inputTokens, null, 'null response')
  assertEq(usage.outputTokens, null, 'null output')
}

{
  const usage = readRecoveryProviderUsage({ usage: { broken: true } })
  assertEq(usage.inputTokens, null, 'missing fields safe')
}

{
  const log = buildRecoveryUsageLogPayload({
    model: 'gpt-5-mini',
    usage: {
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3,
      cachedInputTokens: null,
      reasoningTokens: null,
    },
    documentTextLength: 100,
    serializedSchemaLength: 4000,
    rawResponseCharacterLength: 200,
    requestPreparationDurationMs: 10,
    openAiDurationMs: 1000,
    validationDurationMs: 5,
    totalDurationMs: 1020,
    extraction: { nonNullFieldCount: 3, warningCount: 0, lowConfidenceFieldCount: 0 },
    promptVersion: 'v2',
    responseVersion: 'v2',
  })
  const serialized = JSON.stringify(log)
  assert(!serialized.includes('quote'), 'log has no quote key content path')
  assert(!serialized.includes('Kinga'), 'log has no PII')
  assertEq(log.input_tokens, 1, 'log input')
}

{
  const extraction = emptyContractRecoveryExtraction()
  extraction.clients.partner1.firstName.value = 'Ada'
  extraction.clients.partner1.firstName.confidence = 0.5
  extraction.clients.partner1.firstName.evidence = [{ quote: 'Ada' }]
  extraction.documentWarnings = ['w1']
  const t = summarizeExtractionTelemetry(extraction)
  assert(t.nonNullFieldCount >= 1, 'non-null counted')
  assertEq(t.warningCount, 1, 'warnings')
  assert(t.lowConfidenceFieldCount >= 1, 'low confidence')
}

// --- percentiles / cost ---
{
  const p90 = percentile([1, 2, 3], 90)
  assert(Math.abs((p90 ?? 0) - 2.8) < 1e-9, `p90 close to 2.8, got ${p90}`)
  const lat = summarizeLatency([100, 200, 300, 400])
  assertEq(lat.min, 100, 'min')
  assertEq(lat.max, 400, 'max')
}

{
  const cost = estimateRecoveryCostUsd({
    model: 'gpt-4.1-mini',
    inputTokens: 1_000_000,
    cachedInputTokens: 0,
    outputTokens: 1_000_000,
  })
  assert(cost.priced, 'priced')
  assertEq(cost.usd, 0.4 + 1.6, 'cost calc')
}

// --- quality / disqualification ---
{
  const good = emptyContractRecoveryExtraction()
  good.responseVersion = '2026-07-recovery-v2'
  good.clients.partner1.firstName = {
    value: 'Kinga',
    rawValue: null,
    confidence: 0.9,
    evidence: [{ quote: 'Kinga Testowa' }],
    warnings: [],
  }
  good.clients.partner1.lastName = {
    value: 'Testowa',
    rawValue: null,
    confidence: 0.9,
    evidence: [{ quote: 'Kinga Testowa' }],
    warnings: [],
  }
  good.clients.partner1.fullName = {
    value: 'Kinga Testowa',
    rawValue: null,
    confidence: 0.9,
    evidence: [{ quote: 'Kinga Testowa' }],
    warnings: [],
  }
  good.clients.partner1.phone = {
    value: '530702125',
    rawValue: null,
    confidence: 0.9,
    evidence: [{ quote: 'tel. 530 702 125' }],
    warnings: [],
  }
  good.clients.partner2.firstName = {
    value: 'Adam',
    rawValue: null,
    confidence: 0.9,
    evidence: [{ quote: 'Adam Przykładowy' }],
    warnings: [],
  }
  good.document.signingDate = {
    value: '2026-04-11',
    rawValue: null,
    confidence: 0.9,
    evidence: [{ quote: '11 kwietnia 2026' }],
    warnings: [],
  }
  good.wedding.weddingDate = {
    value: '2028-06-03',
    rawValue: null,
    confidence: 0.9,
    evidence: [{ quote: '03.06.2028' }],
    warnings: [],
  }
  good.finances.totalContractValue = {
    value: 8550,
    rawValue: '8.550,00 zł',
    confidence: 0.9,
    evidence: [{ quote: '8.550,00 zł' }],
    warnings: [],
  }
  good.finances.depositAmount = {
    value: 2000,
    rawValue: null,
    confidence: 0.9,
    evidence: [{ quote: '2.000,00 zł' }],
    warnings: [],
  }
  good.finances.remainingAmount = {
    value: 6550,
    rawValue: null,
    confidence: 0.9,
    evidence: [{ quote: '6.550,00 zł' }],
    warnings: [],
  }
  good.contractedPackage.name = {
    value: 'Złoty Film',
    rawValue: null,
    confidence: 0.9,
    evidence: [{ quote: 'Złoty Film' }],
    warnings: [],
  }
  good.contractedPackage.includedItems = [
    { text: 'Teledysk ślubny', confidence: 0.9, evidence: [{ quote: 'Teledysk' }] },
    { text: 'Film ślubny', confidence: 0.9, evidence: [{ quote: 'Film ślubny' }] },
    { text: 'Minimum 600 zdjęć', confidence: 0.9, evidence: [{ quote: '600' }] },
  ]
  good.contractedPackage.deliveryDeadlineText = {
    value: 'do 90 dni od daty ślubu',
    rawValue: null,
    confidence: 0.9,
    evidence: [{ quote: '90 dni' }],
    warnings: [],
  }

  const scored = scoreRecoveryExtraction(good, FIXTURE_A_STANDARD.expect, {
    httpOk: true,
    validationPassed: true,
    responseVersion: '2026-07-recovery-v2',
  })
  assert(scored.qualityScore >= 80, `quality high, got ${scored.qualityScore}`)
  assertEq(scored.disqualified, false, 'not disqualified')
}

{
  const bad = emptyContractRecoveryExtraction()
  bad.clients.partner1.fullName = {
    value: 'Marcin Hibszer Video Lab',
    rawValue: null,
    confidence: 0.9,
    evidence: [{ quote: 'Usługodawca' }],
    warnings: [],
  }
  bad.document.signingDate = {
    value: '2027-09-20',
    rawValue: null,
    confidence: 0.9,
    evidence: [{ quote: 'x' }],
    warnings: [],
  }
  bad.wedding.weddingDate = {
    value: '2026-03-02',
    rawValue: null,
    confidence: 0.9,
    evidence: [{ quote: 'y' }],
    warnings: [],
  }
  const scored = scoreRecoveryExtraction(bad, FIXTURE_B_ROLE_SEPARATION.expect, {
    httpOk: true,
    validationPassed: true,
  })
  assert(scored.disqualified, 'provider confusion disqualifies')
  assert(
    scored.safetyFailures.includes('provider_client_confusion') ||
      scored.safetyFailures.includes('signing_wedding_date_confusion'),
    `safety codes present: ${scored.safetyFailures.join(',')}`,
  )
}

{
  assert(FIXTURE_A_STANDARD.plainText.includes('Złoty Film'), 'fixture A content')
  assert(FIXTURE_B_ROLE_SEPARATION.expect.forbiddenClientSubstrings.length > 0, 'fixture B rules')
}

console.log('PASS recovery benchmark unit tests')
