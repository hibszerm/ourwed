/**
 * Optional-field warning semantics tests.
 * Run: npm run test:mapping-optional-fields
 */

import { blocksFromPlainParagraphs } from './experimentService'
import { nowiccyFixtureParagraphs } from './fixtures/nowiccyVideoContract'
import { buildMappingGenerationContext } from './mappingGenerationContext'
import { filterOptionalFieldWarnings } from './mappingOptionalFieldSemantics'
import { buildContractGenerationInput } from './contractGenerationInput'
import type { StructuredAiMappingResponse } from './types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function mockWedding() {
  return {
    id: 'w-1',
    date: '2026-07-29',
    status: 'active' as const,
    workflowStage: 'contract' as const,
    couple: {
      partner1: 'Iza Karczewska',
      partner2: 'Jan Kulewski',
      email: 'a@b.c',
      phone: '500600700',
      venue: 'X',
      city: 'Y',
    },
    packageId: 'pkg-1',
    packageName: 'Video',
    price: 10500,
    packageItems: [],
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {} as never,
    contract: {} as never,
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '#000',
    createdAt: new Date().toISOString(),
  }
}

function responseWithWarnings(
  warnings: StructuredAiMappingResponse['warnings'],
): StructuredAiMappingResponse {
  return {
    responseVersion: '2026-07-v2',
    documentAssessment: {
      documentType: 'wedding_video_contract',
      clientPartyCapability: { physicalMode: 'composite', expectedPersonCount: 2 },
    },
    fields: [],
    unsupportedValues: [],
    immutableFindings: [],
    warnings,
  }
}

async function main() {
  const blocks = blocksFromPlainParagraphs(nowiccyFixtureParagraphs())
  const generationInput = buildContractGenerationInput({
    wedding: mockWedding(),
    package: { id: 'pkg-1', name: 'Video' },
  })
  const context = buildMappingGenerationContext({ blocks, generationInput })

  const addressAbsent = filterOptionalFieldWarnings(
    responseWithWarnings([
      {
        code: 'missing_required_field',
        message: 'Document is missing client address fields expected by the mapping.',
        blockId: null,
      },
    ]),
    context,
    blocks,
  )
  assert(addressAbsent.warnings.length === 0, '1 address absent → no warning')

  const addressBlocks = blocksFromPlainParagraphs([
    ...nowiccyFixtureParagraphs().slice(0, 4),
    'zam. ul. Testowa 12, 00-001 Warszawa',
    ...nowiccyFixtureParagraphs().slice(4),
  ])
  const addressContext = buildMappingGenerationContext({
    blocks: addressBlocks,
    generationInput,
  })
  const addressPresent = filterOptionalFieldWarnings(
    responseWithWarnings([
      {
        code: 'missing_required_field',
        message: 'Brak mapowania adresu klientów (client_address).',
        blockId: null,
      },
    ]),
    addressContext,
    addressBlocks,
  )
  assert(addressPresent.warnings.length === 1, '2 address clause unmapped → warning')

  const phoneAbsent = filterOptionalFieldWarnings(
    responseWithWarnings([
      {
        code: 'missing_required_field',
        message: 'Document is missing client phone fields expected by the mapping.',
        blockId: null,
      },
    ]),
    context,
    blocks,
  )
  assert(phoneAbsent.warnings.length === 0, '3 phone absent → no warning')

  console.log('ok — mappingOptionalFieldSemantics')
}

void main()
