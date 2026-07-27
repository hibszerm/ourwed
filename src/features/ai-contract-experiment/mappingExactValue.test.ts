/**
 * Exact-value mapping regression tests (Phase 2.1).
 * Run: npm run test:ai-contract-mapping-exact-value
 */

import { applyBoundSlotsToParagraphs } from '@/features/documents/template/applyBoundSlots'
import { buildMinimalDocxFromParagraphs } from '@/features/documents/template/buildMinimalDocx'
import {
  extractCompleteMoneyTokens,
  validateCompleteMoneySpan,
} from './completeMoneySpanValidator'
import { resolveExactSpan } from './mappingBoundaryResolver'
import { computeMappingReadiness } from './mappingReadiness'
import { validateStructuredMapping } from './mappingValidator'
import {
  validatePolishContractDateToken,
} from './polishContractDateValidator'
import { blocksFromPlainParagraphs } from './experimentService'
import { nowiccyFixtureParagraphs, NOWICCY_FIXTURE } from './fixtures/nowiccyVideoContract'
import { analyzeContractForStructuredMapping } from './mockAdapters'
import type {
  ContractFieldKey,
  StructuredAiFieldProposal,
  StructuredAiMappingResponse,
} from './types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

async function run(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`ok — ${name}`)
  } catch (e) {
    console.error(`FAIL — ${name}`)
    throw e
  }
}

function proposal(
  partial: Partial<StructuredAiFieldProposal> &
    Pick<StructuredAiFieldProposal, 'fieldKey' | 'blockId' | 'exactValue'>,
  evidenceText?: string,
): StructuredAiFieldProposal {
  return {
    evidenceText: evidenceText ?? partial.exactValue,
    contextBefore: '',
    contextAfter: '',
    semanticRole: 'test',
    confidence: 'high',
    reasoning: 'test',
    pairedFieldGroup: null,
    ...partial,
  }
}

function response(fields: StructuredAiFieldProposal[]): StructuredAiMappingResponse {
  return {
    responseVersion: '2026-07-v2',
    documentAssessment: {
      documentType: 'wedding_video_contract',
      clientPartyCapability: { physicalMode: 'composite', expectedPersonCount: 2 },
    },
    fields,
    unsupportedValues: [],
    immutableFindings: [],
    warnings: [],
  }
}

async function main() {
  const blocks = blocksFromPlainParagraphs(nowiccyFixtureParagraphs())

  await run('1 contract date exact token valid', () => {
    const v = validatePolishContractDateToken('02.02.2027 r.')
    assert(v.valid, 'valid date')
  })

  await run('2 full contract-date sentence non-minimal', () => {
    const v = validatePolishContractDateToken(
      'zawarta w Poznaniu dnia 02.02.2027 r.',
    )
    assert(!v.valid, 'sentence rejected')
    assert(v.reason === 'non_minimal_date_span', v.reason ?? '')
  })

  await run('3 wedding date labeled line refined', () => {
    const block = blocks.find((b) => b.text.includes('Data wydarzenia'))!
    const r = resolveExactSpan({
      proposal: proposal(
        {
          fieldKey: 'wedding_date',
          blockId: block.id,
          exactValue: 'Data wydarzenia: 24.07.2027 r.',
        },
        'Data wydarzenia: 24.07.2027 r.',
      ),
      blockText: block.text,
    })
    assert(r.boundary.resolvedExactValue === '24.07.2027 r.', r.boundary.resolvedExactValue)
    assert(r.boundary.resolutionMethod === 'refined_by_validator', 'refined')
  })

  await run('4 Polish textual date valid', () => {
    assert(validatePolishContractDateToken('2 lutego 2027 r.').valid, 'textual')
  })

  await run('5 numeric total refined from sentence', () => {
    const block = blocks.find((b) => b.text.includes('6 000 zł'))!
    const r = resolveExactSpan({
      proposal: proposal(
        {
          fieldKey: 'contract_value_formatted',
          blockId: block.id,
          exactValue: block.text,
        },
        block.text,
      ),
      blockText: block.text,
    })
    assert(r.boundary.resolvedExactValue === '6 000 zł', r.boundary.resolvedExactValue)
  })

  await run('6 amount words refined from sentence', () => {
    const block = blocks.find((b) => b.text.includes('sześć tysięcy'))!
    const r = resolveExactSpan({
      proposal: proposal(
        {
          fieldKey: 'contract_value_words',
          blockId: block.id,
          exactValue: block.text,
        },
        block.text,
      ),
      blockText: block.text,
    })
    assert(
      r.boundary.resolvedExactValue === 'sześć tysięcy złotych',
      r.boundary.resolvedExactValue,
    )
  })

  await run('7 numeric + words non-overlapping in one paragraph', async () => {
    const { response: mock } = await analyzeContractForStructuredMapping({
      blocks,
      packageName: 'Video',
      packageId: 'pkg-1',
    })
    const validated = validateStructuredMapping({ response: mock, blocks })
    const numeric = validated.find((m) => m.fieldKey === 'contract_value_formatted')
    const words = validated.find((m) => m.fieldKey === 'contract_value_words')
    assert(numeric?.validationStatus === 'valid', 'numeric valid')
    assert(words?.validationStatus === 'valid', 'words valid')
    assert(numeric!.start < words!.start || numeric!.end <= words!.start, 'no overlap')
  })

  await run('8 same evidenceText not overlap', () => {
    const block = blocks.find((b) => b.text.includes('6 000 zł'))!
    const validated = validateStructuredMapping({
      response: response([
        proposal(
          {
            fieldKey: 'contract_value_formatted',
            blockId: block.id,
            exactValue: '6 000 zł',
          },
          block.text,
        ),
        proposal(
          {
            fieldKey: 'contract_value_words',
            blockId: block.id,
            exactValue: 'sześć tysięcy złotych',
          },
          block.text,
        ),
      ]),
      blocks,
    })
    const n = validated.find((m) => m.fieldKey === 'contract_value_formatted')
    const w = validated.find((m) => m.fieldKey === 'contract_value_words')
    assert(n?.validationStatus === 'valid', 'numeric')
    assert(w?.validationStatus === 'valid', 'words')
  })

  await run('9 partial money rejected', () => {
    const text = 'łączna kwota 3 500 zł'
    const start = text.indexOf('500 zł')
    const v = validateCompleteMoneySpan({
      exactValue: '500 zł',
      blockText: text,
      start,
      end: start + '500 zł'.length,
    })
    assert(!v.valid, 'partial rejected')
    assert(v.reason === 'partial_money_span', v.reason ?? '')
  })

  await run('10 full 3 500 zł valid', () => {
    const text = 'łączna kwota 3 500 zł'
    const token = extractCompleteMoneyTokens(text)[0]!
    const start = text.indexOf(token)
    assert(
      validateCompleteMoneySpan({
        exactValue: token,
        blockText: text,
        start,
        end: start + token.length,
      }).valid,
      'full valid',
    )
  })

  await run('13 location label excluded via refinement', () => {
    const block = blocks.find((b) => b.text.includes('Miejsce przyjęcia'))!
    const r = resolveExactSpan({
      proposal: proposal(
        {
          fieldKey: 'reception_location',
          blockId: block.id,
          exactValue: block.text,
        },
        block.text,
      ),
      blockText: block.text,
    })
    assert(r.boundary.resolvedExactValue === NOWICCY_FIXTURE.location, r.boundary.resolvedExactValue)
  })

  await run('14 composite client identity one binding', async () => {
    const { response: mock } = await analyzeContractForStructuredMapping({
      blocks,
      packageName: 'Video',
      packageId: 'pkg-1',
    })
    const validated = validateStructuredMapping({ response: mock, blocks })
    const client = validated.filter((m) => m.fieldKey === 'couple_full_names')
    assert(client.length === 1, 'one binding')
    assert(client[0]!.resolvedExactValue === NOWICCY_FIXTURE.clientParty, 'composite')
  })

  await run('16 repeated exactValue in same block needs review', () => {
    const block = blocks.find((b) => b.text.includes('02.02.2027'))!
    const dup = `${block.text} oraz ponownie 02.02.2027 r.`
    const dupBlocks = blocks.map((b) =>
      b.id === block.id ? { ...b, text: dup } : b,
    )
    const validated = validateStructuredMapping({
      response: response([
        proposal({
          fieldKey: 'contract_execution_date',
          blockId: block.id,
          exactValue: '02.02.2027 r.',
        }),
      ]),
      blocks: dupBlocks,
    })
    assert(validated[0]!.validationStatus === 'needs_review', 'ambiguous')
  })

  await run('20 readiness needs_review before approval', async () => {
    const { response: mock } = await analyzeContractForStructuredMapping({
      blocks,
      packageName: 'Video',
      packageId: 'pkg-1',
    })
    const validated = validateStructuredMapping({ response: mock, blocks })
    const readiness = computeMappingReadiness({
      blocks,
      response: mock,
      mappings: validated,
    })
    assert(readiness === 'needs_review', readiness)
  })

  await run('21 overbroad date sentence refined then valid', () => {
    const block = blocks.find((b) => b.text.includes('zawarta w Poznaniu'))!
    const validated = validateStructuredMapping({
      response: response([
        proposal({
          fieldKey: 'contract_execution_date',
          blockId: block.id,
          exactValue: 'zawarta w Poznaniu dnia 02.02.2027 r.',
        }, block.text),
      ]),
      blocks,
    })
    assert(validated[0]!.validationStatus === 'valid', validated[0]!.validationStatus)
    assert(
      validated[0]!.resolutionMethod === 'refined_by_validator',
      validated[0]!.resolutionMethod,
    )
  })

  await run('22 renderer receives resolved exact spans', async () => {
    const { response: mock } = await analyzeContractForStructuredMapping({
      blocks,
      packageName: 'Video',
      packageId: 'pkg-1',
    })
    const validated = validateStructuredMapping({ response: mock, blocks }).filter(
      (m) => m.validationStatus === 'valid',
    )
    const paragraphs = blocks.map((b) => ({ index: b.paragraphIndex, text: b.text }))
    const applied = applyBoundSlotsToParagraphs({
      original: paragraphs,
      slots: validated.map((m) => ({
        id: `slot-${m.fieldKey}`,
        registryKey: m.fieldKey,
        label: m.fieldKey,
        sourceHint: 'wedding',
        occurrences: 1,
        enabled: true,
        physicallyBound: true,
        paragraphIndex: m.paragraphIndex,
        startOffset: m.start,
        endOffset: m.end,
        originalText: m.sourceText,
        allowedRange: { start: m.start, end: m.end },
      })),
      resolved: Object.fromEntries(
        validated.map((m) => [m.fieldKey, 'REPLACED']),
      ),
    })
    const prose = applied.paragraphs.find((p) => p.index === 1)
    assert(Boolean(prose?.text?.includes('zawarta w Poznaniu dnia')), 'wrapper kept')
    assert(Boolean(prose?.text?.includes('REPLACED')), 'only token replaced')
  })

  await run('Nowiccy fixture expected exact values', async () => {
    const { response: mock } = await analyzeContractForStructuredMapping({
      blocks,
      packageName: 'Video',
      packageId: 'pkg-1',
    })
    const byKey = (k: ContractFieldKey) =>
      mock.fields.find((f) => f.fieldKey === k)?.exactValue
    assertEq(byKey('couple_full_names'), NOWICCY_FIXTURE.clientParty)
    assertEq(byKey('contract_execution_date'), NOWICCY_FIXTURE.contractDate)
    assertEq(byKey('wedding_date'), NOWICCY_FIXTURE.weddingDate)
    assertEq(byKey('reception_location'), NOWICCY_FIXTURE.location)
    assertEq(byKey('contract_value_formatted'), NOWICCY_FIXTURE.totalFormatted)
    assertEq(byKey('contract_value_words'), NOWICCY_FIXTURE.totalWords)
  })

  await run('DOCX index path preserves offsets', async () => {
    const paragraphs = nowiccyFixtureParagraphs()
    const bytes = await buildMinimalDocxFromParagraphs(paragraphs)
    const { indexDocxBytes } = await import('./indexedDocx')
    const indexed = await indexDocxBytes(bytes)
    const { response: mock } = await analyzeContractForStructuredMapping({
      blocks: indexed.blocks,
      packageName: 'Video',
      packageId: 'pkg-1',
    })
    const validated = validateStructuredMapping({
      response: mock,
      blocks: indexed.blocks,
    })
    const required = [
      'couple_full_names',
      'contract_execution_date',
      'wedding_date',
      'contract_value_formatted',
      'contract_value_words',
    ] as const
    for (const key of required) {
      const m = validated.find((v) => v.fieldKey === key)
      assert(m?.validationStatus === 'valid', `${key} valid in docx`)
      assert(m!.start >= 0 && m!.end > m!.start, `${key} offsets`)
    }
  })

  console.log('\nExact-value mapping tests passed.')
}

function assertEq(a: unknown, b: unknown, label = '') {
  if (a !== b) throw new Error(`${label}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

main().catch(() => process.exit(1))
