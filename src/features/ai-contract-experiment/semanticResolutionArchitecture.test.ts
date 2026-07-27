/**
 * Type-safe semantic resolution regression tests.
 * Run: npm run test:semantic-resolution-architecture
 */

import { blocksFromPlainParagraphs } from './experimentService'
import {
  buildFortySevenBlockFixture,
  FORTY_SEVEN_EXPECTED_OWNERSHIP,
  FORTY_SEVEN_GENERATION_INPUT,
} from './fixtures/fortySevenBlockSemanticContract'
import { validateStructuredMapping } from './mappingValidator'
import { buildOccurrenceGraphFromMappings } from './pipeline/buildOccurrenceGraph'
import { buildRenderPlan } from './pipeline/buildRenderPlan'
import { parseStructuredMappingResponse } from './structuredMappingSchema'
import { AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3 } from './types'
import type { ContractFieldKey, ContractGenerationInput, IndexedDocxBlock } from './types'
import { getOccurrenceTargetValue } from './validation/occurrenceAccessors'
import { getFieldDefinition } from './validation/fieldDefinitionRegistry'
import { contractMoneyInWords } from './validation/polishContractMoneyWords'
import { resolveTargetResolution } from './validation/targetValueResolver'
import {
  classifyValueShape,
  isRelativePaymentRule,
} from './validation/valueShapeClassifier'
import {
  isShapeCompatibleWithField,
  resolveFieldKeyFromContext,
} from './validation/semanticContextScoring'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

const RUN = 'run-semantic-resolution'

const generationInput: ContractGenerationInput = {
  currentDate: '30.10.2024 r.',
  weddingDate: '19.06.2025 r.',
  clients: [
    {
      id: 'c1',
      firstName: 'Anna',
      lastName: 'Kowalska',
      fullName: 'Anna Kowalska',
      address: 'ul. Przykładowa 12, 00-001 Warszawa',
      phone: '888 777 621',
    },
    {
      id: 'c2',
      firstName: 'Jan',
      lastName: 'Kowalski',
      fullName: 'Jan Kowalski',
    },
  ],
  locations: {
    preparation: 'Hotel Przykładowy',
    ceremony: 'Kościół Przykładowy',
    reception: 'Rezydencja Przykładowa',
  },
  finances: {
    contractValue: 8000,
    contractValueFormatted: '8 000 zł',
    contractValueWords: 'osiem tysięcy złotych',
    depositAmount: 1000,
    depositAmountFormatted: '1 000 zł',
    depositAmountWords: 'tysiąc złotych',
    remainingAmount: 7000,
    remainingAmountFormatted: '7 000 zł',
    remainingAmountWords: 'siedem tysięcy złotych',
    payments: [],
  },
  package: { id: 'pkg', name: 'Foto' },
}

function compact(
  fieldKey: ContractFieldKey,
  blockId: string,
  exactValue: string,
  paired: string | null = null,
) {
  return { fieldKey, blockId, exactValue, confidence: 'high' as const, pairedFieldGroup: paired }
}

function validateV3(blocks: IndexedDocxBlock[], fields: ReturnType<typeof compact>[]) {
  const parsed = parseStructuredMappingResponse(
    {
      responseVersion: AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3,
      documentAssessment: {
        documentType: 'wedding_photography_contract',
        clientPartyCapability: { physicalMode: 'composite', expectedPersonCount: 2 },
      },
      fields,
      immutableFindings: [],
      warnings: [],
    },
    blocks,
  )
  assert(parsed.ok, 'parse')
  if (!parsed.ok) throw new Error('parse')
  return validateStructuredMapping({
    response: parsed.response,
    blocks,
    generationInput,
    experimentRunId: RUN,
  })
}

function mappingFor(
  mappings: ReturnType<typeof validateV3>,
  fieldKey: ContractFieldKey,
  exactValue: string,
) {
  return mappings.find((m) => m.fieldKey === fieldKey && m.sourceText === exactValue)
}

async function main() {
  const paraA =
    'z Aleksandrą Biłas, zam. ul. Wrocławska 67/73 Kraków, tel. 603 306 423, zwaną dalej Zleceniodawcą'
  const paraB =
    'pozostałą część wynagrodzenia w wysokości 7 000 zł (słownie: siedem tysięcy złotych) Zamawiający zapłaci najpóźniej w dniu 19.06.2025r.'
  const paraEvent = 'wydarzeń odbywających się w dniu 19.06.2025r.'
  const paraRelative = 'Zadatek w terminie 7 dni od daty zawarcia Umowy.'

  const blocks = blocksFromPlainParagraphs([paraA, paraB, paraEvent, paraRelative])
  const blockA = blocks[0]!
  const blockB = blocks[1]!
  const blockEvent = blocks[2]!

  // Value shape classifier
  assertEq(classifyValueShape('Aleksandrą Biłas').shape, 'person_name', 'shape name')
  assertEq(classifyValueShape('ul. Wrocławska 67/73 Kraków').shape, 'address', 'shape address')
  assertEq(classifyValueShape('603 306 423').shape, 'phone', 'shape phone')
  assertEq(classifyValueShape('7 000 zł').shape, 'money_numeric', 'shape money')
  assertEq(classifyValueShape('19.06.2025r.').shape, 'date', 'shape date')
  assertEq(classifyValueShape('r.').shape, 'unknown', 'r. not date')
  assertEq(classifyValueShape('Pałacu Testowym', 'Powitanie gości w Pałacu Testowym').shape, 'location', 'venue inflection not person')

  // Type gates
  assert(!isShapeCompatibleWithField('client_address', 'Aleksandrą Biłas'), '1 name not address')
  assert(!isShapeCompatibleWithField('client_address', '603 306 423'), '3 phone not address')
  assert(!isShapeCompatibleWithField('final_payment_due_date', '7 000 zł'), '4 money not date')
  assert(!isShapeCompatibleWithField('contract_value_formatted', '19.06.2025r.'), '5 date not money')
  assert(!isShapeCompatibleWithField('contract_value_formatted', 'siedem tysięcy złotych'), '6 words not numeric')

  const mappings = validateV3(blocks, [
    compact('couple_full_names', blockA.id, 'Aleksandrą Biłas'),
    compact('client_address', blockA.id, 'ul. Wrocławska 67/73 Kraków'),
    compact('client_phone', blockA.id, '603 306 423'),
    compact('remaining_after_deposit_formatted', blockB.id, '7 000 zł', 'rem1'),
    compact('remaining_after_deposit_words', blockB.id, 'siedem tysięcy złotych', 'rem1'),
    compact('final_payment_due_date', blockB.id, '19.06.2025r.'),
    compact('wedding_date', blockEvent.id, '19.06.2025r.'),
  ])

  const nameM = mappingFor(mappings, 'couple_full_names', 'Aleksandrą Biłas')!
  assert(!!nameM, 'name mapping exists')
  assert(nameM.fieldKey === 'couple_full_names', '2 name stays couple_full_names')
  assert(nameM.fieldKey !== 'client_address', '2 name not address')

  const phoneM = mappingFor(mappings, 'client_phone', '603 306 423')!
  assert(phoneM.fieldKey === 'client_phone', '3 phone stays phone')

  const moneyM = mappingFor(mappings, 'remaining_after_deposit_formatted', '7 000 zł')!
  assert(moneyM.fieldKey === 'remaining_after_deposit_formatted', '4 money stays remaining')
  assert(moneyM.fieldKey !== 'final_payment_due_date', '4 money not payment date')

  const payDate = mappingFor(mappings, 'final_payment_due_date', '19.06.2025r.')!
  const wedDate = mappingFor(mappings, 'wedding_date', '19.06.2025r.')!
  assert(!!payDate && !!wedDate, 'both dates mapped')
  assert(payDate.blockId !== wedDate.blockId, '9 dates in different paragraphs')

  assert(
    !mappings.some((m) => m.fieldKey === 'deposit_due_date'),
    '10 no deposit_due_date from relative rule',
  )
  assert(isRelativePaymentRule(paraRelative), 'relative rule detected')

  // Canonical target in validationDimensions
  const graph = buildOccurrenceGraphFromMappings({
    experimentRunId: RUN,
    mappings: mappings.filter((m) => m.validationStatus !== 'rejected'),
    blocks,
    generationInput,
    supplement: false,
  })
  for (const o of graph.occurrences) {
    const dimsTarget =
      o.validationDimensions?.replacement.status === 'ready' ||
      o.validationDimensions?.replacement.status === 'manual_text_required'
        ? o.validationDimensions.replacement.targetValue
        : undefined
    const accessorTarget = getOccurrenceTargetValue(o)
    if (dimsTarget?.trim()) {
      assertEq(accessorTarget, dimsTarget, `13 target sync ${o.fieldKey}`)
    }
    if (o.validationDimensions?.replacement.status === 'ready') {
      assert((dimsTarget ?? '').trim().length > 0, '14 no empty ready target')
    }
    const def = getFieldDefinition(o.fieldKey)
    const shape = o.validationDimensions?.valueShape?.shape
    if (shape && shape !== 'unknown') {
      assert(def.acceptedValueShapes.includes(shape), `invariant shape ${o.fieldKey}`)
    }
  }

  const plan = buildRenderPlan(graph)
  const spanOwners = new Set<string>()
  for (const op of plan.operations) {
    if (op.status !== 'READY') continue
    const key = `${op.blockId}:${op.sourceRange.start}:${op.sourceRange.end}`
    assert(!spanOwners.has(key), '20 no duplicate span operation')
    spanOwners.add(key)
  }

  // Date missing never "r."
  const missingDate = resolveTargetResolution({
    fieldKey: 'deposit_due_date',
    sourceValue: '01.01.2025 r.',
    generationInput: {
      ...generationInput,
      finances: { ...generationInput.finances, payments: [] },
    },
  })
  assert(missingDate.status === 'missing', '15 missing date not resolved')

  // Money words formatter
  assertEq(contractMoneyInWords(1000), 'tysiąc złotych', '16 1000 words')
  assertEq(contractMoneyInWords(2000), 'dwa tysiące złotych', '2000 words')
  assertEq(contractMoneyInWords(10500), 'dziesięć tysięcy pięćset złotych', '10500 words')

  // Context resolution in paragraph A — phone must not become address
  const phoneCtx = resolveFieldKeyFromContext({
    proposedFieldKey: 'client_phone',
    blockText: paraA,
    start: paraA.indexOf('603 306 423'),
    end: paraA.indexOf('603 306 423') + '603 306 423'.length,
    exactValue: '603 306 423',
  })
  assertEq(phoneCtx.fieldKey, 'client_phone', 'phone context resolution')

  // 22. Full 47-block fixture — exact expected field ownership
  const fortySeven = buildFortySevenBlockFixture()
  assertEq(fortySeven.blocks.length, 47, '47 blocks')
  const fortySevenParsed = parseStructuredMappingResponse(
    {
      responseVersion: AI_CONTRACT_MAPPING_RESPONSE_VERSION_V3,
      documentAssessment: {
        documentType: 'wedding_photography_contract',
        clientPartyCapability: { physicalMode: 'composite', expectedPersonCount: 2 },
      },
      fields: fortySeven.fields,
      immutableFindings: [],
      warnings: [],
    },
    fortySeven.blocks,
  )
  assert(fortySevenParsed.ok, '47-block parse')
  if (!fortySevenParsed.ok) throw new Error('parse')
  const fortySevenMappings = validateStructuredMapping({
    response: fortySevenParsed.response,
    blocks: fortySeven.blocks,
    generationInput: FORTY_SEVEN_GENERATION_INPUT,
    experimentRunId: RUN,
  })
  assert(
    !fortySevenMappings.some((m) => m.fieldKey === 'deposit_due_date'),
    '22 no deposit_due_date from relative rule',
  )
  for (const expected of FORTY_SEVEN_EXPECTED_OWNERSHIP) {
    const match = fortySevenMappings.find(
      (m) =>
        m.validationStatus !== 'rejected' &&
        (m.resolvedExactValue === expected.exactValue ||
          m.sourceText === expected.exactValue) &&
        m.fieldKey === expected.fieldKey,
    )
    assert(
      !!match,
      `22 ownership ${expected.exactValue} -> ${expected.fieldKey}`,
    )
    const shape = match!.validationDimensions?.valueShape?.shape
    if (shape && shape !== 'unknown') {
      assert(
        getFieldDefinition(expected.fieldKey).acceptedValueShapes.includes(shape),
        `22 shape invariant ${expected.fieldKey}`,
      )
    }
  }
  const weddingDates = fortySevenMappings.filter(
    (m) =>
      m.fieldKey === 'wedding_date' &&
      m.validationStatus !== 'rejected' &&
      m.sourceText.includes('19.06.2025'),
  )
  const finalDates = fortySevenMappings.filter(
    (m) =>
      m.fieldKey === 'final_payment_due_date' &&
      m.validationStatus !== 'rejected' &&
      m.sourceText.includes('19.06.2025'),
  )
  assertEq(weddingDates.length, 1, '22 one wedding_date')
  assertEq(finalDates.length, 1, '22 one final_payment_due_date')
  assert(
    weddingDates[0]!.blockId !== finalDates[0]!.blockId,
    '22 wedding and final payment dates in different paragraphs',
  )

  console.log('\nAll semantic resolution architecture tests passed.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
