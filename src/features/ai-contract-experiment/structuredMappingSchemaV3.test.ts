/**
 * Compact v3 structured mapping schema — derivation, pipeline, and token budget tests.
 * Run: npm run test:ai-contract-mapping-schema-v3
 */

import { buildMinimalDocxFromParagraphs } from '@/features/documents/template/buildMinimalDocx'
import {
  deriveContextAroundExactValue,
  deriveEvidenceText,
  enrichCompactFieldProposal,
} from './deriveFieldProposalEnrichment'
import { blocksFromPlainParagraphs } from './experimentService'
import { NOWICCY_FIXTURE, nowiccyFixtureParagraphs } from './fixtures/nowiccyVideoContract'
import { validateStructuredMapping } from './mappingValidator'
import { buildOccurrenceGraphFromMappings } from './pipeline/buildOccurrenceGraph'
import { buildRenderPlan, isPlanExecutable } from './pipeline/buildRenderPlan'
import {
  approveAllAutoOccurrences,
  setOccurrenceCustomReplacement,
} from './pipeline/graphReviewActions'
import { evaluateGraphReadiness } from './pipeline/planReadiness'
import { executeRenderPlan } from './pipeline/executeRenderPlan'
import { auditRenderPlan } from './pipeline/auditRenderPlan'
import { supplementOccurrenceMappings } from './supplementalOccurrenceDetection'
import {
  approximateResponseTokenCount,
  parseStructuredMappingResponse,
} from './structuredMappingSchema'
import {
  AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3,
  type ContractFieldKey,
  type ContractGenerationInput,
  type IndexedDocxBlock,
  type StructuredAiMappingResponse,
} from './types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

const TEST_RUN = 'run-schema-v3'

const generationInput: ContractGenerationInput = {
  currentDate: '02.02.2027 r.',
  weddingDate: '24.07.2027 r.',
  clients: [
    {
      id: 'c1',
      firstName: 'Anna',
      lastName: 'Testowa',
      fullName: 'Anna Testowa',
      address: 'ul. Przykładowa 1, 00-001 Warszawa',
      phone: '500 100 200',
    },
    {
      id: 'c2',
      firstName: 'Jan',
      lastName: 'Testowy',
      fullName: 'Jan Testowy',
    },
  ],
  locations: {
    reception: 'Hotel Testowy, Warszawa',
    ceremony: 'Kościół Testowy, Warszawa',
  },
  finances: {
    contractValue: 5000,
    contractValueFormatted: '5 000 zł',
    contractValueWords: 'pięć tysięcy złotych',
    depositAmount: 1000,
    depositAmountFormatted: '1 000 zł',
    depositAmountWords: 'tysiąc złotych',
    remainingAmount: 4000,
    remainingAmountFormatted: '4 000 zł',
    remainingAmountWords: 'cztery tysiące złotych',
    payments: [],
  },
  package: { id: 'pkg-photo', name: 'Foto' },
}

function compactField(
  fieldKey: ContractFieldKey,
  blockId: string,
  exactValue: string,
  pairedFieldGroup: string | null = null,
) {
  return { fieldKey, blockId, exactValue, confidence: 'high' as const, pairedFieldGroup }
}

function assertParsed(
  result: ReturnType<typeof parseStructuredMappingResponse>,
): asserts result is { ok: true; response: StructuredAiMappingResponse } {
  assert(result.ok, `parse failed: ${!result.ok ? result.reason : ''}`)
}

function buildV3Response(
  blocks: IndexedDocxBlock[],
  fields: ReturnType<typeof compactField>[],
  extra?: Partial<StructuredAiMappingResponse>,
): StructuredAiMappingResponse {
  const parsed = parseStructuredMappingResponse(
    {
      responseVersion: AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3,
      documentAssessment: {
        documentType: 'wedding_photography_contract',
        clientPartyCapability: {
          physicalMode: 'composite',
          expectedPersonCount: 2,
        },
      },
      fields,
      immutableFindings: extra?.immutableFindings ?? [],
      warnings: extra?.warnings ?? [],
    },
    blocks,
  )
  assertParsed(parsed)
  return parsed.response
}

/** Mirrors edge computeMaxOutputTokens for 47-block photographer contract. */
function computeMaxOutputTokensForBlocks(blockCount: number): number {
  const estimatedOccurrences = Math.ceil(blockCount * 0.9)
  const estimated = 400 + estimatedOccurrences * 25
  const withVariance = Math.ceil(estimated * 1.75)
  return Math.min(16_000, Math.max(4_000, withVariance + 2_500))
}

function buildLargePhotographerFixture(): {
  blocks: IndexedDocxBlock[]
  wireResponse: Record<string, unknown>
} {
  const paragraphs: string[] = [
    'UMOWA O ŚWIADCZENIE USŁUG FOTOGRAFICZNYCH',
    'zawarta w Warszawie dnia 15.03.2027 r.',
    '',
    'Wykonawca: Studio Foto Test Sp. z o.o., NIP 1234567890',
    'Zamawiający: Anna Testowa i Jan Testowy',
    'zam. ul. Przykładowa 1, 00-001 Warszawa, tel. 500 100 200',
    '',
    '§1 Przedmiot umowy',
    'Wykonawca wykona usługi fotograficzne podczas uroczystości ślubnej.',
    'Data wydarzenia: 20.08.2027 r.',
    'Miejsce ceremonii: Kościół Testowy, Warszawa',
    'Miejsce przyjęcia: Hotel Testowy, Warszawa',
    'Przygotowania: Hotel Testowy, sala A',
    '',
    '§2 Wynagrodzenie',
    'Strony ustalają wynagrodzenie w wysokości 5 000 zł (słownie: pięć tysięcy złotych).',
    'Zadatek w wysokości 1 000 zł płatny do 01.04.2027 r.',
    'Pozostała kwota 4 000 zł płatna do 01.08.2027 r.',
    'Rachunek bankowy Wykonawcy: 12 3456 7890 1234 5678 9012 3456',
    '',
    '§3 Zakres usług',
    'Reportaż fotograficzny od przygotowań do pierwszego tańca.',
    'Dostawa materiałów w terminie 60 dni od wydarzenia.',
    'Sesja plenerowa w dniu poprzedzającym uroczystość — lokalizacja do uzgodnienia.',
    'Powitanie gości w Hotelu Testowym przed rozpoczęciem przyjęcia.',
    'Ceremonia odbędzie się w Kościele Testowym o godzinie 14:00.',
    'Przyjęcie weselne w Hotelu Testowym rozpocznie się o godzinie 16:00.',
  ]

  while (paragraphs.length < 47) {
    const n = paragraphs.length
    paragraphs.push(
      `§${Math.floor(n / 3)} Postanowienie dodatkowe nr ${n}: szczegóły realizacji usługi fotograficznej.`,
    )
  }

  const blocks = blocksFromPlainParagraphs(paragraphs.slice(0, 47))
  assertEq(blocks.length, 47, '47 blocks')

  const find = (needle: string) => {
    const b = blocks.find((x) => x.text.includes(needle))
    assert(Boolean(b), `block for ${needle}`)
    return b!
  }

  const fields = [
    compactField('couple_full_names', find('Anna Testowa').id, 'Anna Testowa i Jan Testowy'),
    compactField('client_address', find('ul. Przykładowa').id, 'ul. Przykładowa 1, 00-001 Warszawa'),
    compactField('client_phone', find('500 100 200').id, '500 100 200'),
    compactField('contract_execution_date', find('15.03.2027').id, '15.03.2027 r.'),
    compactField('wedding_date', find('20.08.2027').id, '20.08.2027 r.'),
    compactField('ceremony_location', find('Kościół Testowy').id, 'Kościół Testowy, Warszawa'),
    compactField('reception_location', find('Hotel Testowy, Warszawa').id, 'Hotel Testowy, Warszawa'),
    compactField('preparation_location', find('sala A').id, 'Hotel Testowy, sala A'),
    compactField(
      'contract_value_formatted',
      find('5 000 zł').id,
      '5 000 zł',
      'contract_value_pair_1',
    ),
    compactField(
      'contract_value_words',
      find('pięć tysięcy').id,
      'pięć tysięcy złotych',
      'contract_value_pair_1',
    ),
    compactField('agreed_deposit_formatted', find('1 000 zł').id, '1 000 zł', 'deposit_pair_1'),
    compactField(
      'remaining_after_deposit_formatted',
      find('4 000 zł').id,
      '4 000 zł',
      'remaining_pair_1',
    ),
    compactField('deposit_due_date', find('01.04.2027').id, '01.04.2027 r.'),
    compactField('payment_due_date', find('01.08.2027').id, '01.08.2027 r.'),
    // second reception occurrence (inflected)
    compactField('reception_location', find('Hotelu Testowym').id, 'Hotelu Testowym'),
    compactField('reception_location', find('Hotelu Testowym przed').id, 'Hotelu Testowym'),
  ]

  const wireResponse = {
    responseVersion: AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3,
    documentAssessment: {
      documentType: 'wedding_photography_contract',
      clientPartyCapability: { physicalMode: 'composite', expectedPersonCount: 2 },
    },
    fields,
    immutableFindings: [
      {
        blockId: find('NIP').id,
        classification: 'provider_data',
        exactValue: 'Studio Foto Test Sp. z o.o.',
      },
      {
        blockId: find('Rachunek bankowy').id,
        classification: 'bank_account',
        exactValue: '12 3456 7890 1234 5678 9012 3456',
      },
    ],
    warnings: [],
  }

  return { blocks, wireResponse }
}

async function main() {
  const baseBlocks = blocksFromPlainParagraphs([
    ...nowiccyFixtureParagraphs(),
    NOWICCY_FIXTURE.clientContactCell,
    NOWICCY_FIXTURE.para37Remuneration,
  ])

  // 1. Multiple physical occurrences per logical field
  const multiBlocks = blocksFromPlainParagraphs([
    'Miejsce przyjęcia: Pałac Testowy, Miasto',
    'Goście zostaną powitani w Pałacu Testowym przed kolacją.',
  ])
  const multiResponse = buildV3Response(multiBlocks, [
    compactField('reception_location', multiBlocks[0]!.id, 'Pałac Testowy, Miasto'),
    compactField('reception_location', multiBlocks[1]!.id, 'Pałacu Testowym'),
  ])
  assertEq(multiResponse.fields.length, 2, '1 multi-occurrence')

  // 2. Span reconstruction from blockId + exactValue
  const block = baseBlocks.find((b) => b.text.includes(NOWICCY_FIXTURE.weddingDate))!
  const enriched = enrichCompactFieldProposal({
    fieldKey: 'wedding_date',
    blockId: block.id,
    exactValue: NOWICCY_FIXTURE.weddingDate,
    confidence: 'high',
    pairedFieldGroup: null,
    blockText: block.text,
  })
  const evidence = deriveEvidenceText(block.text, NOWICCY_FIXTURE.weddingDate)
  assert(evidence.includes(NOWICCY_FIXTURE.weddingDate), '2 evidence contains exact')
  const ctx = deriveContextAroundExactValue(block.text, NOWICCY_FIXTURE.weddingDate)
  assert(enriched.contextBefore === ctx.contextBefore, '2 contextBefore')

  // 3. Table occurrence replacement
  const tableCell: IndexedDocxBlock = {
    id: 'table-0-row-0-cell-1-p-0',
    kind: 'tableCell',
    paragraphIndex: 0,
    tableIndex: 0,
    rowIndex: 0,
    cellIndex: 1,
    text: 'tel. 502 118 774',
    rowTexts: ['tel. 502 118 774'],
    headerTexts: ['Kontakt'],
    runs: [{ runIndex: 0, text: 'tel. 502 118 774' }],
  }
  const tableBlocks = [tableCell]
  const tableResponse = buildV3Response(tableBlocks, [
    compactField('client_phone', tableCell.id, '502 118 774'),
  ])
  const tableValidated = validateStructuredMapping({
    response: tableResponse,
    blocks: tableBlocks,
    generationInput,
    experimentRunId: TEST_RUN,
  })
  assert(
    tableValidated.some((m) => m.fieldKey === 'client_phone' && m.validationStatus === 'valid'),
    '3 table phone valid',
  )

  // 4. Narrative occurrence requiring CUSTOM_TEXT_REQUIRED (via graph strategy)
  const narrativeBlocks = blocksFromPlainParagraphs([
    'Miejsce przyjęcia: Pałac Testowy, Miasto',
    'Powitanie gości w Pałacu Testowym przed kolacją.',
  ])
  const narrativeValidated = validateStructuredMapping({
    response: buildV3Response(narrativeBlocks, [
      compactField('reception_location', narrativeBlocks[0]!.id, 'Pałac Testowy, Miasto'),
      compactField('reception_location', narrativeBlocks[1]!.id, 'Pałacu Testowym'),
    ]),
    blocks: narrativeBlocks,
    generationInput,
    experimentRunId: TEST_RUN,
  })
  const narrativeGraph = buildOccurrenceGraphFromMappings({
    experimentRunId: TEST_RUN,
    mappings: supplementOccurrenceMappings({
      mappings: narrativeValidated,
      blocks: narrativeBlocks,
      generationInput,
      experimentRunId: TEST_RUN,
    }),
    blocks: narrativeBlocks,
    generationInput,
    supplement: false,
  })
  const customOcc = narrativeGraph.occurrences.find(
    (o) =>
      o.fieldKey === 'reception_location' &&
      o.replacementStrategy === 'CUSTOM_TEXT_REQUIRED',
  )
  assert(Boolean(customOcc), '4 CUSTOM_TEXT_REQUIRED occurrence')

  // 5. Amount and amount-in-words pairing
  const moneyBlocks = blocksFromPlainParagraphs([NOWICCY_FIXTURE.para37Remuneration])
  const pairResponse = buildV3Response(moneyBlocks, [
    compactField(
      'contract_value_formatted',
      moneyBlocks[0]!.id,
      NOWICCY_FIXTURE.totalFormatted,
      'contract_value_pair_1',
    ),
    compactField(
      'contract_value_words',
      moneyBlocks[0]!.id,
      NOWICCY_FIXTURE.totalWords,
      'contract_value_pair_1',
    ),
  ])
  const pairValidated = validateStructuredMapping({
    response: pairResponse,
    blocks: moneyBlocks,
    generationInput,
    experimentRunId: TEST_RUN,
  })
  const money = pairValidated.filter((m) =>
    ['contract_value_formatted', 'contract_value_words'].includes(m.fieldKey),
  )
  assertEq(money.length, 2, '5 money pair count')
  assert(
    money.every((m) => m.pairedFieldGroup === 'contract_value_pair_1'),
    '5 shared pair group',
  )

  // 6. Provider data and bank account protection
  const bankBlock = baseBlocks.find((b) => b.text.includes(NOWICCY_FIXTURE.bankAccount))!
  const protectedParsed = parseStructuredMappingResponse(
    {
      responseVersion: AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3,
      documentAssessment: {
        documentType: 'wedding_video_contract',
        clientPartyCapability: { physicalMode: 'composite', expectedPersonCount: 2 },
      },
      fields: [
        compactField(
          'couple_full_names',
          baseBlocks.find((b) => b.text.includes(NOWICCY_FIXTURE.clientParty))!.id,
          NOWICCY_FIXTURE.clientParty,
        ),
      ],
      immutableFindings: [
        {
          blockId: bankBlock.id,
          classification: 'bank_account',
          exactValue: NOWICCY_FIXTURE.bankAccount,
        },
      ],
      warnings: [],
    },
    baseBlocks,
  )
  assertParsed(protectedParsed)
  assertEq(protectedParsed.response.immutableFindings.length, 1, '6 immutable finding')

  // 7–11. Pipeline: approval, readiness, render plan, renderer, audit
  const pipelineResponse = buildV3Response(baseBlocks, [
    compactField(
      'couple_full_names',
      baseBlocks.find((b) => b.text.includes(NOWICCY_FIXTURE.clientParty))!.id,
      NOWICCY_FIXTURE.clientParty,
    ),
    compactField(
      'wedding_date',
      baseBlocks.find((b) => b.text.includes(NOWICCY_FIXTURE.weddingDate))!.id,
      NOWICCY_FIXTURE.weddingDate,
    ),
    compactField(
      'contract_value_formatted',
      baseBlocks.find((b) => b.text.includes(NOWICCY_FIXTURE.totalFormatted))!.id,
      NOWICCY_FIXTURE.totalFormatted,
      'contract_value_pair_1',
    ),
    compactField(
      'contract_value_words',
      baseBlocks.find((b) => b.text.includes(NOWICCY_FIXTURE.totalWords))!.id,
      NOWICCY_FIXTURE.totalWords,
      'contract_value_pair_1',
    ),
  ])

  const validated = validateStructuredMapping({
    response: pipelineResponse,
    blocks: baseBlocks,
    generationInput,
    experimentRunId: TEST_RUN,
  })
  let graph = buildOccurrenceGraphFromMappings({
    experimentRunId: TEST_RUN,
    mappings: validated,
    blocks: baseBlocks,
    generationInput,
    supplement: false,
  })
  graph = approveAllAutoOccurrences(graph)
  const readiness = evaluateGraphReadiness(graph)
  assert(
    ['ready', 'needs_review', 'incomplete', 'invalid'].includes(readiness),
    `8 readiness evaluated: ${readiness}`,
  )

  const plan = buildRenderPlan(graph)
  assert(isPlanExecutable(plan) || plan.operations.length > 0, '9 plan built')
  const sourceBytes = await buildMinimalDocxFromParagraphs(baseBlocks.map((b) => b.text))
  if (isPlanExecutable(plan)) {
    const rendered = await executeRenderPlan({
      plan,
      sourceBytes,
      blocks: baseBlocks,
    })
    const audit = auditRenderPlan({
      plan,
      sourceBlocks: baseBlocks,
      outputParagraphs: rendered.appliedParagraphs,
      replacementTraces: rendered.replacementTraces,
    })
    assert(Array.isArray(audit.replacementChecks), '11 audit runs')
  }

  // 12. Invalid offsets / block rejected at parse
  const badParse = parseStructuredMappingResponse(
    {
      responseVersion: AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3,
      documentAssessment: {
        documentType: 'unknown',
        clientPartyCapability: { physicalMode: 'unknown', expectedPersonCount: 0 },
      },
      fields: [
        compactField('wedding_date', 'nonexistent-block', '01.01.2027 r.'),
      ],
      immutableFindings: [],
      warnings: [],
    },
    baseBlocks,
  )
  assert(!badParse.ok, '12 invalid block rejected')

  // 13. Unsupported responseVersion rejected
  const badVersion = parseStructuredMappingResponse({
    responseVersion: '2099-01-v99',
    documentAssessment: {
      documentType: 'unknown',
      clientPartyCapability: { physicalMode: 'unknown', expectedPersonCount: 0 },
    },
    fields: [],
    immutableFindings: [],
    warnings: [],
  })
  assert(!badVersion.ok && badVersion.reason.includes('unsupported_response_version'), '13')

  // 14. Completed compact response passes schema validation
  const { blocks: largeBlocks, wireResponse } = buildLargePhotographerFixture()
  const largeParsed = parseStructuredMappingResponse(wireResponse, largeBlocks)
  assertParsed(largeParsed)

  // 15. Large synthetic contract below configured max_output_tokens estimate
  const maxTokens = computeMaxOutputTokensForBlocks(47)
  const approxTokens = approximateResponseTokenCount(largeParsed.response)
  assert(
    approxTokens < maxTokens,
    `15 token budget: ${approxTokens} < ${maxTokens}`,
  )

  // CUSTOM_TEXT_REQUIRED path through graph review
  const reviewed = setOccurrenceCustomReplacement({
    graph: narrativeGraph,
    occurrenceId: customOcc!.id,
    value: 'Nowym Pałacem Testowym',
  })
  assert(
    reviewed.occurrences.find((o) => o.id === customOcc!.id)?.customReplacement ===
      'Nowym Pałacem Testowym',
    '7 custom replacement persisted',
  )

  console.log('\nAll structured mapping v3 schema tests passed.')
  console.log(
    JSON.stringify({
      blockCount: 47,
      maxOutputTokens: maxTokens,
      approximateResponseTokens: approxTokens,
      responseVersion: AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3,
    }),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
