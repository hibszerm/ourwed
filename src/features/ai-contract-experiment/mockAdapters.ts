/**
 * Deterministic mock AI adapters for Phase 1 (no live model calls).
 */

import { NOWICCY_FIXTURE } from './fixtures/nowiccyVideoContract'
import { findBlockContainingText } from './indexedDocx'
import type {
  ContractGenerationInput,
  ContractFieldKey,
  FullAiDocumentAnalysis,
  FullAiGeneratedDocument,
  IndexedDocxBlock,
  StructuredAiMappingResponse,
} from './types'

function requireBlock(
  blocks: IndexedDocxBlock[],
  sourceText: string,
): IndexedDocxBlock {
  const block = findBlockContainingText(blocks, sourceText)
  if (!block) {
    throw new Error(`Mock fixture: missing block for "${sourceText}"`)
  }
  return block
}

function field(
  blocks: IndexedDocxBlock[],
  fieldKey: ContractFieldKey,
  sourceText: string,
  semanticMeaning: string,
  confidence = 0.94,
): FullAiDocumentAnalysis['detectedFields'][number] {
  const block = requireBlock(blocks, sourceText)
  return {
    fieldKey,
    blockId: block.id,
    sourceText,
    semanticMeaning,
    confidence,
  }
}

export async function analyzeContractWithFullAi(input: {
  blocks: IndexedDocxBlock[]
  packageName: string
  packageId: string
}): Promise<{ analysis: FullAiDocumentAnalysis; requestCount: number }> {
  void input.packageId
  void input.packageName
  const blocks = input.blocks
  const analysis: FullAiDocumentAnalysis = {
    documentType: 'wedding_video_contract',
    clientPartyMode: 'composite_two_person',
    detectedFields: [
      field(blocks, 'couple_full_names', NOWICCY_FIXTURE.clientParty, 'client party'),
      field(
        blocks,
        'contract_execution_date',
        NOWICCY_FIXTURE.contractDate,
        'contract date',
      ),
      field(blocks, 'wedding_date', NOWICCY_FIXTURE.weddingDate, 'wedding date'),
      field(
        blocks,
        'reception_location',
        NOWICCY_FIXTURE.location,
        'event location',
      ),
      field(
        blocks,
        'contract_value_formatted',
        NOWICCY_FIXTURE.totalFormatted,
        'total',
      ),
      field(
        blocks,
        'contract_value_words',
        NOWICCY_FIXTURE.totalWords,
        'total words',
        0.92,
      ),
    ],
    immutableSections: [
      {
        blockId: requireBlock(blocks, NOWICCY_FIXTURE.provider).id,
        sourceText: NOWICCY_FIXTURE.provider,
        classification: 'provider_identity',
      },
      {
        blockId: requireBlock(blocks, NOWICCY_FIXTURE.bankAccount).id,
        sourceText: NOWICCY_FIXTURE.bankAccount,
        classification: 'provider_bank_account',
      },
      {
        blockId: requireBlock(blocks, NOWICCY_FIXTURE.deliveryPeriod).id,
        sourceText: NOWICCY_FIXTURE.deliveryPeriod,
        classification: 'delivery_period',
      },
    ],
    warnings: [],
  }
  return { analysis, requestCount: 1 }
}

export async function generateCompleteContractWithAi(input: {
  blocks: IndexedDocxBlock[]
  analysis: FullAiDocumentAnalysis
  generationInput: ContractGenerationInput
  /** When true, produce a perfectly preserved document (audit may pass). */
  perfectPreserve?: boolean
  /** Inject unauthorized mutations for audit tests. */
  mutate?: {
    legalWording?: boolean
    punctuation?: boolean
    removeBlockId?: string
    addClause?: boolean
    changeProvider?: boolean
    changePackageFact?: boolean
  }
}): Promise<{
  generated: FullAiGeneratedDocument
  requestCount: number
}> {
  const replacements = new Map<string, string>()
  if (!input.perfectPreserve) {
    const g = input.generationInput
    const couple = g.clients.map((c) => c.fullName).join(' i ')
    for (const f of input.analysis.detectedFields) {
      if (f.fieldKey === 'couple_full_names' && couple) {
        replacements.set(f.sourceText, couple)
      }
      if (f.fieldKey === 'contract_execution_date' && g.currentDate) {
        replacements.set(f.sourceText, g.currentDate.replace(/\s*r\.?$/, ''))
      }
      if (f.fieldKey === 'wedding_date' && g.weddingDate) {
        replacements.set(f.sourceText, g.weddingDate.replace(/\s*r\.?$/, ''))
      }
      if (f.fieldKey === 'reception_location' && g.locations.reception) {
        replacements.set(f.sourceText, g.locations.reception)
      }
      if (f.fieldKey === 'contract_value_formatted') {
        replacements.set(f.sourceText, g.finances.contractValueFormatted)
      }
      if (f.fieldKey === 'contract_value_words') {
        replacements.set(f.sourceText, g.finances.contractValueWords)
      }
    }
  }

  let blocks = input.blocks.map((b) => {
    let text = b.text
    for (const [from, to] of replacements) {
      if (text.includes(from)) text = text.split(from).join(to)
    }
    return { id: b.id, text }
  })

  const m = input.mutate
  if (m?.legalWording) {
    blocks = blocks.map((b) =>
      b.text.includes('Umowa')
        ? { ...b, text: b.text.replace('Umowa', 'Kontrakt') }
        : b,
    )
  }
  if (m?.punctuation) {
    blocks = blocks.map((b, i) =>
      i === 0 ? { ...b, text: `${b.text}!` } : b,
    )
  }
  if (m?.removeBlockId) {
    blocks = blocks.filter((b) => b.id !== m.removeBlockId)
  }
  if (m?.addClause) {
    blocks = [
      ...blocks,
      { id: 'added-extra-clause', text: 'Dodatkowa klauzula spoza źródła.' },
    ]
  }
  if (m?.changeProvider) {
    blocks = blocks.map((b) =>
      b.text.includes(NOWICCY_FIXTURE.provider)
        ? {
            ...b,
            text: b.text.replace(
              NOWICCY_FIXTURE.provider,
              'Inna Firma Video Sp. z o.o.',
            ),
          }
        : b,
    )
  }
  if (m?.changePackageFact) {
    blocks = blocks.map((b) =>
      b.text.includes(NOWICCY_FIXTURE.deliveryPeriod)
        ? {
            ...b,
            text: b.text.replace(NOWICCY_FIXTURE.deliveryPeriod, '3 tygodnie'),
          }
        : b,
    )
  }

  return { generated: { blocks }, requestCount: 1 }
}

export async function analyzeContractForStructuredMapping(input: {
  blocks: IndexedDocxBlock[]
  packageName: string
  packageId: string
}): Promise<{
  response: StructuredAiMappingResponse
  requestCount: number
}> {
  void input.packageId
  void input.packageName
  const blocks = input.blocks
  const mapField = (
    fieldKey: ContractFieldKey,
    exactValue: string,
    evidenceText: string,
    semanticRole: string,
    pairedFieldGroup: string | null = null,
    contextBefore = '',
    contextAfter = '',
  ) => {
    const block = requireBlock(blocks, exactValue)
    return {
      fieldKey,
      blockId: block.id,
      exactValue,
      evidenceText,
      contextBefore,
      contextAfter,
      semanticRole,
      confidence: 'high' as const,
      reasoning: `mock:${semanticRole}`,
      pairedFieldGroup,
    }
  }

  const moneySentence = blocks.find((b) =>
    b.text.includes(NOWICCY_FIXTURE.totalFormatted),
  )!.text

  const response: StructuredAiMappingResponse = {
    responseVersion: '2026-07-v2',
    documentAssessment: {
      documentType: 'wedding_video_contract',
      clientPartyCapability: {
        physicalMode: 'composite',
        expectedPersonCount: 2,
      },
    },
    fields: [
      mapField(
        'couple_full_names',
        NOWICCY_FIXTURE.clientParty,
        NOWICCY_FIXTURE.clientParty,
        'zamawiajacy',
      ),
      mapField(
        'contract_execution_date',
        NOWICCY_FIXTURE.contractDate,
        NOWICCY_FIXTURE.contractDateProse,
        'contract_date',
      ),
      mapField(
        'wedding_date',
        NOWICCY_FIXTURE.weddingDate,
        `Data wydarzenia: ${NOWICCY_FIXTURE.weddingDate}`,
        'wedding_date',
      ),
      mapField(
        'reception_location',
        NOWICCY_FIXTURE.location,
        `Miejsce przyjęcia: ${NOWICCY_FIXTURE.location}`,
        'reception_location',
      ),
      mapField(
        'contract_value_formatted',
        NOWICCY_FIXTURE.totalFormatted,
        moneySentence,
        'total',
        'contract_value_pair_1',
      ),
      mapField(
        'contract_value_words',
        NOWICCY_FIXTURE.totalWords,
        moneySentence,
        'total_words',
        'contract_value_pair_1',
      ),
    ],
    unsupportedValues: [],
    immutableFindings: [
      {
        blockId: requireBlock(blocks, NOWICCY_FIXTURE.provider).id,
        sourceText: NOWICCY_FIXTURE.provider,
        classification: 'provider_data',
        reason: 'provider_identity',
      },
      {
        blockId: requireBlock(blocks, NOWICCY_FIXTURE.bankAccount).id,
        sourceText: NOWICCY_FIXTURE.bankAccount,
        classification: 'bank_account',
        reason: 'provider_bank',
      },
      {
        blockId: requireBlock(blocks, NOWICCY_FIXTURE.deliveryPeriod).id,
        sourceText: NOWICCY_FIXTURE.deliveryPeriod,
        classification: 'delivery_fact',
        reason: 'delivery_period',
      },
    ],
    warnings: [],
  }
  return { response, requestCount: 1 }
}
