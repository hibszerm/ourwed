import assert from 'node:assert/strict'
import { resolveModelFromEnv } from './fullAiRewritePromptShared'
import { CUSTOMER_NAME_FORMS, DATE_ROLES, SEMANTIC_CONCEPTS } from './semanticMapping'
import {
  SEMANTIC_MAP_MAX_OUTPUT_TOKENS,
  SEMANTIC_MAP_MODEL_IDS,
  SEMANTIC_MAP_REASONING_EFFORT,
  SEMANTIC_MAP_SYSTEM_PROMPT,
  buildSemanticMapRequest,
  buildSemanticMapResponseSchema,
  groundLegacySemanticMapResponse as groundSemanticMapResponse,
  parseLegacySemanticMapResponse as parseSemanticMapResponse,
} from './semanticMapModelContract'
import type { ContractTransformationDataset, TransformDocumentBlock } from './types'

function run(name: string, fn: () => void) {
  fn()
  console.log(`PASS ${name}`)
}

const dataset: ContractTransformationDataset = {
  clients: {
    displayNames: 'Anna Nowak i Jan Kowalski', personCount: 2, address: 'ul. Leśna 1', phone: '+48 555 000 111',
    customers: [
      { displayName: 'Anna Nowak', address: 'ul. Leśna 1', phone: '+48 555 000 111', email: 'anna@example.com' },
      { displayName: 'Jan Kowalski', address: 'ul. Długa 2', phone: '+48 555 000 222', email: 'jan@example.com' },
    ],
  },
  dates: { weddingDate: '2027-06-12', contractExecutionDate: '2026-09-22' },
  finances: {
    contractValueFormatted: '12 000 zł', contractValueWords: 'dwanaście tysięcy złotych',
    depositFormatted: '3 000 zł', depositWords: 'trzy tysiące złotych',
    remainingFormatted: '9 000 zł', remainingWords: 'dziewięć tysięcy złotych',
  },
  locations: {
    preparation: { displayName: 'Dom', city: 'Gdańsk' },
    preparationLocations: [{ person: 'bride', label: 'Bride', fullAddress: 'ul. Leśna 1' }],
    ceremony: { displayName: 'Kościół', city: 'Gdańsk' },
    reception: { displayName: 'Sala', city: 'Gdańsk' },
  },
  package: { name: 'Internal package data must not be sent' },
  additionalServices: [{ name: 'Extras must not be sent to map path' }],
}

const sourceBlocks: TransformDocumentBlock[] = [{
  blockId: 'table-0-row-1-cell-1-p-0',
  paragraphIndex: 4,
  text: 'Data wydarzenia 12.06.2027',
  kind: 'tableCell',
  tableIndex: 0,
  rowIndex: 1,
  cellIndex: 1,
  tableContext: {
    tableIndex: 0, rowIndex: 1, cellIndex: 1,
    rowLabelText: 'Data wydarzenia', columnHeaderText: 'Termin',
    neighboringCellTexts: ['Data wydarzenia'], ownershipFamily: 'wedding_date',
  },
  modelContext: {
    semanticRoles: ['wedding.date'], ownership: 'customer', modelEditable: true,
    ownershipReason: 'must not leak semantic classifier output', protectionReason: undefined,
  },
}]

run('strict semanticMappings schema derives closed concepts and has no legacy fields', () => {
  const schema = buildSemanticMapResponseSchema()
  assert.equal(schema.strict, true)
  assert.deepEqual(schema.schema.required, ['semanticMappings', 'extrasPlacement'])
  assert.deepEqual(schema.schema.properties.extrasPlacement.anyOf[1]?.required, ['sourceBlockId', 'side'])
  const variants = schema.schema.properties.semanticMappings.items.anyOf
  const allConcepts = [...new Set(variants.flatMap((variant) => [...variant.properties.concept.enum]))].sort()
  assert.deepEqual(allConcepts, SEMANTIC_CONCEPTS.filter((concept) => concept !== 'dependent_date' && concept !== 'fixed_date').sort())
  for (const variant of variants) {
    assert.deepEqual(variant.required, ['sourceBlockId', 'startTokenId', 'endTokenId', 'concept', 'customerIndex', 'customerIndexes', 'nameForm', 'dateRole', 'baseDateConcept', 'relation'])
    assert.deepEqual(Object.keys(variant.properties).sort(), [...variant.required].sort())
    assert.deepEqual(variant.properties.startTokenId.type, 'string')
    assert.deepEqual(variant.properties.endTokenId.type, 'string')
    assert.deepEqual(variant.properties.nameForm.type, ['string', 'null'])
    assert.deepEqual(variant.properties.nameForm.enum, [...CUSTOMER_NAME_FORMS, null])
  }
  assert.equal(variants.length, 3, 'keep the provider-compatible three-branch schema topology')
  for (const variant of variants) {
    assert.deepEqual(variant.properties.customerIndex, { type: ['integer', 'null'], enum: [0, 1, null] })
    assert.deepEqual(variant.properties.customerIndexes, { type: ['array', 'null'], items: { type: 'integer', enum: [0, 1] } })
  }
  const canonicalDates = variants.find((variant) => variant.properties.concept.enum.includes('deposit_due_date'))!
  assert.deepEqual(canonicalDates.properties.dateRole.enum, [null])
  assert.deepEqual(canonicalDates.properties.baseDateConcept.enum, [null])
  assert.deepEqual(canonicalDates.properties.relation.enum, [null])
  const ambiguousDates = variants.find((variant) => variant.properties.concept.enum.includes('ambiguous_date'))!
  assert.deepEqual(ambiguousDates.properties.dateRole.enum, [...DATE_ROLES, null])
  assert.deepEqual(ambiguousDates.properties.baseDateConcept.enum, [null])
  assert.deepEqual(ambiguousDates.properties.relation.enum, [null])
  assert.equal(schema.schema.additionalProperties, false)
  for (const variant of variants) assert.equal(variant.additionalProperties, false)
  for (const forbidden of ['changedBlocks', 'replacement', 'financeEvidence', 'dateEvidence', 'confidence', 'explanation', 'start', 'end', 'notes']) {
    assert.equal(forbidden in schema.schema.properties, false, `${forbidden} absent`)
  }
})

function schemaAcceptsOwnership(concept: string, customerIndex: unknown, customerIndexes: unknown) {
  const variants = buildSemanticMapResponseSchema().schema.properties.semanticMappings.items.anyOf
  return variants.some((variant) => {
    const properties = variant.properties as Record<string, { type: unknown; enum?: readonly unknown[] }>
    if (!properties.concept.enum?.includes(concept)) return false
    const matches = (rule: { type: unknown; enum?: readonly unknown[] }, value: unknown) => {
      if (rule.enum && !rule.enum.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))) return false
      const types = Array.isArray(rule.type) ? rule.type : [rule.type]
      return types.some((type) => type === 'null' ? value === null : type === 'integer' ? Number.isInteger(value) : type === 'array' ? Array.isArray(value) : false)
    }
    return matches(properties.customerIndex, customerIndex) && matches(properties.customerIndexes, customerIndexes)
  })
}

function ownershipMapping(concept: string, customerIndex: number | null, customerIndexes: number[] | null) {
  return {
    sourceBlockId: 'p1', concept, anchor: concept.includes('_name') ? 'Anna Nowak' : 'value', occurrence: null,
    customerIndex, customerIndexes,
    nameForm: concept === 'customer_1_name' || concept === 'customer_2_name' ? 'BASE' : null,
  }
}

run('provider schema keeps compatible ownership topology while parser canonicalizes name indexes', () => {
  for (const concept of ['customer_1_name', 'customer_2_name']) {
    assert.equal(schemaAcceptsOwnership(concept, null, null), true, `${concept} null ownership accepted`)
    assert.equal(schemaAcceptsOwnership(concept, concept === 'customer_1_name' ? 0 : 1, null), true, `${concept} matching redundant owner is schema-compatible`)
    assert.equal(schemaAcceptsOwnership(concept, concept === 'customer_1_name' ? 1 : 0, null), true, `${concept} contradictory owner reaches authoritative parser rejection`)
    assert.equal(schemaAcceptsOwnership(concept, null, [0, 1]), true, `${concept} arrays remain schema-compatible and parser-rejected`)
    assert.equal(schemaAcceptsOwnership(concept, null, null), true, `${concept} null ownership accepted`)
    const matchingIndex = concept === 'customer_1_name' ? 0 : 1
    const normalized = parseSemanticMapResponse({ semanticMappings: [ownershipMapping(concept, matchingIndex, null)] })
    assert.equal(normalized.ok, true)
    if (normalized.ok) {
      assert.equal(Object.hasOwn(normalized.semanticMappings[0]!, 'customerIndex'), false)
      assert.equal(Object.hasOwn(normalized.semanticMappings[0]!, 'customerIndexes'), false)
    }
    for (const contradictoryIndex of [concept === 'customer_1_name' ? 1 : 0]) {
      assert.equal(parseSemanticMapResponse({ semanticMappings: [ownershipMapping(concept, contradictoryIndex, null)] }).ok, false)
    }
    for (const customerIndexes of [[0, 1], [0], [1]]) {
      assert.equal(parseSemanticMapResponse({ semanticMappings: [ownershipMapping(concept, null, customerIndexes)] }).ok, false)
    }
    assert.equal(parseSemanticMapResponse({ semanticMappings: [ownershipMapping(concept, null, null)] }).ok, true)
  }

  for (const [concept, customerIndex, customerIndexes] of [ ['total', 0, null], ['total', null, [0, 1]] ] as const) {
    assert.equal(schemaAcceptsOwnership(concept, customerIndex, customerIndexes), true)
    assert.equal(parseSemanticMapResponse({ semanticMappings: [ownershipMapping(concept, customerIndex, customerIndexes)] }).ok, false)
  }
  assert.equal(schemaAcceptsOwnership('total', null, null), true)
  assert.equal(parseSemanticMapResponse({ semanticMappings: [ownershipMapping('total', null, null)] }).ok, true)

  for (const concept of ['customer_address', 'customer_phone', 'customer_email']) {
    for (const customerIndex of [0, 1]) {
      assert.equal(schemaAcceptsOwnership(concept, customerIndex, null), true, `${concept} single owner ${customerIndex}`)
      assert.equal(parseSemanticMapResponse({ semanticMappings: [ownershipMapping(concept, customerIndex, null)] }).ok, true)
    }
    assert.equal(schemaAcceptsOwnership(concept, null, [0, 1]), true, `${concept} shared owner`)
    assert.equal(parseSemanticMapResponse({ semanticMappings: [ownershipMapping(concept, null, [0, 1])] }).ok, true)
    for (const invalidIndexes of [[0], [1], [0, 0], [1, 1], [1, 0], [0, 1, 0]]) {
      assert.equal(parseSemanticMapResponse({ semanticMappings: [ownershipMapping(concept, null, invalidIndexes)] }).ok, false, `${concept} rejects invalid shared owners ${invalidIndexes}`)
    }
    assert.equal(parseSemanticMapResponse({ semanticMappings: [ownershipMapping(concept, 0, [0, 1])] }).ok, false, `${concept} rejects mixed single/shared ownership`)
    assert.equal(parseSemanticMapResponse({ semanticMappings: [ownershipMapping(concept, null, null)] }).ok, false, `${concept} rejects missing owner`)
  }

  const representative = [
    ownershipMapping('customer_1_name', null, null),
    ownershipMapping('customer_2_name', null, null),
    ownershipMapping('total', null, null),
    ownershipMapping('customer_address', 0, null),
    ownershipMapping('customer_phone', 1, null),
    ownershipMapping('customer_email', null, [0, 1]),
  ]
  for (const mapping of representative) {
    assert.equal(schemaAcceptsOwnership(mapping.concept, mapping.customerIndex, mapping.customerIndexes), true)
    assert.equal(parseSemanticMapResponse({ semanticMappings: [mapping] }).ok, true, `${mapping.concept} valid ownership parses`)
  }
})

run('prompt defines semantic-only work, source boundaries, and protected product boundaries', () => {
  for (const instruction of [
    'Never transcribe source text into the response',
    'startTokenId and endTokenId are inclusive',
    'use other_contractual_date only when no supported specific role fits',
    'SOURCE DOCX is authoritative for base package contractual content',
    'Do not map provider identity or surrounding legal text',
    'modelEditable=false is protected context',
    'Extras are outside semanticMappings',
    'ONE EXACT SOURCE OCCURRENCE → ONE SEMANTIC CONCEPT',
    'CRM facts are reference context only',
    'This task is one semantic-localization model call',
    'If meaning, ownership, role, or exact span is uncertain, omit',
    'zero-based index (0 is first, 1 is second)',
    'customerIndexes to [0,1]',
    'Map every distinct source span that represents a supported semantic concept',
    'For customer-name and all other non-contact concepts, set both ownership fields to null',
    'customer_email',
    'provider, studio, business, and legal contact emails as template-authoritative content',
    'not domains, keywords, regexes, or whether a value looks synthetic',
    'CUSTOMER NAME FORM',
    'set nameForm to BASE, GENITIVE, or INSTRUMENTAL',
    'For every non-name concept, set nameForm to null',
    'never provide or generate a customer-name replacement',
    'Map final_payment_due_date and delivery_due_date',
    'the system derives the calendar-day difference',
    'Exhaustively map every relevant CONCRETE DATE LITERAL',
    'A date/deadline mapping range must contain a concrete date literal',
    'Do not map relative contractual timing or deadline clauses that contain no concrete date literal',
    'remain authoritative source text, are not rewritten, and must not create user-input requirements',
    'For wedding_date, execution_date, deposit_due_date, final_payment_due_date, and delivery_due_date, set dateRole, baseDateConcept, and relation to null',
    'For ambiguous_date, set the known dateRole or null, and set baseDateConcept and relation to null',
    'The model identifies roles only and never calculates replacement dates or authors numeric offsets',
    'Exhaustively map every relevant CONCRETE DATE LITERAL',
    'If a concrete date literal is present but its date role cannot be safely resolved, use ambiguous_date',
    'Do not use fixed_date',
  ]) assert.ok(SEMANTIC_MAP_SYSTEM_PROMPT.includes(instruction), `prompt has ${instruction}`)
  for (const forbidden of ['synonym dictionary', 'changedBlocks[].text', 'write a replacement paragraph']) {
    assert.equal(SEMANTIC_MAP_SYSTEM_PROMPT.includes(forbidden), false, `prompt excludes ${forbidden}`)
  }
})

run('Terra and Sol requests differ only by explicit model identifier', () => {
  const terra = buildSemanticMapRequest({ candidate: 'terra', sourceBlocks, dataset })
  const sol = buildSemanticMapRequest({ candidate: 'sol', sourceBlocks, dataset })
  assert.equal(terra.model, 'gpt-5.6-terra')
  assert.equal(sol.model, 'gpt-5.6-sol')
  assert.equal(terra.reasoning.effort, 'medium')
  assert.equal(sol.reasoning.effort, 'medium')
  assert.equal(terra.max_output_tokens, SEMANTIC_MAP_MAX_OUTPUT_TOKENS)
  assert.equal(sol.max_output_tokens, SEMANTIC_MAP_MAX_OUTPUT_TOKENS)
  const { model: _terraModel, ...terraSemanticRequest } = terra
  const { model: _solModel, ...solSemanticRequest } = sol
  assert.deepEqual(terraSemanticRequest, solSemanticRequest)
  const user = JSON.parse(terra.input[1]!.content) as Record<string, any>
  assert.equal(user.crmReferenceOnly.clients.displayNames, dataset.clients.displayNames)
  assert.deepEqual(user.crmReferenceOnly.clients.customers.map((customer: { customerIndex: number }) => customer.customerIndex), [0, 1])
  assert.deepEqual(user.crmReferenceOnly.clients.customers.map((customer: { email?: string }) => customer.email), ['anna@example.com', 'jan@example.com'])
  const withoutPerCustomerContacts = buildSemanticMapRequest({
    candidate: 'terra', sourceBlocks, dataset: { ...dataset, clients: { ...dataset.clients, customers: undefined } },
  })
  const fallbackClients = JSON.parse(withoutPerCustomerContacts.input[1]!.content).crmReferenceOnly.clients
  assert.deepEqual(fallbackClients.customers.map((customer: { customerIndex: number }) => customer.customerIndex), [0, 1], 'ordered identities remain explicit if contact details are unavailable')
  assert.equal('address' in fallbackClients, false, 'ambiguous generic address is not exposed as customer ownership evidence')
  assert.equal('phone' in fallbackClients, false, 'ambiguous generic phone is not exposed as customer ownership evidence')
  assert.equal(fallbackClients.customers.some((customer: { email?: string }) => customer.email), false, 'missing emails are not invented')
  assert.equal('package' in user.crmReferenceOnly, false)
  assert.equal('additionalServices' in user.crmReferenceOnly, false)
  assert.equal(user.selectedExtrasPresent, true)
  const noExtrasRequest = buildSemanticMapRequest({ candidate: 'terra', sourceBlocks, dataset: { ...dataset, additionalServices: [] } })
  assert.equal(JSON.parse(noExtrasRequest.input[1]!.content).selectedExtrasPresent, false)
  assert.equal(JSON.stringify(user).includes('Internal package data must not be sent'), false)
  assert.equal(JSON.stringify(user).includes('Extras must not be sent to map path'), false)
  assert.equal(JSON.stringify(user).includes('semanticRoles'), false)
  assert.equal(JSON.stringify(user).includes('ownershipReason'), false)
  assert.equal(user.sourceBlocks[0].sourceBlockId, sourceBlocks[0]!.blockId)
  assert.equal(user.sourceBlocks[0].visibleText, sourceBlocks[0]!.text)
  assert.ok(user.sourceBlocks[0].sourceTokens.length > 0)
  assert.ok(user.sourceBlocks[0].sourceTokens.every((token: [string, string]) => token[0] && token[1]))
  assert.deepEqual(user.sourceBlocks[0].tableContext.neighboringCellTexts, ['Data wydarzenia'])
  assert.equal(user.sourceBlocks[0].modelEditable, true)
})

run('provider null occurrence normalizes to omitted internal property and grounds', () => {
  const parsed = parseSemanticMapResponse({ semanticMappings: [
    { sourceBlockId: 'p1', concept: 'total', anchor: '1200 zł', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: null },
  ] })
  assert.ok(parsed.ok)
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.semanticMappings[0]!, 'occurrence'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.semanticMappings[0]!, 'nameForm'), false)
  const grounded = groundSemanticMapResponse({ semanticMappings: [
    { sourceBlockId: 'p1', concept: 'total', anchor: '1200 zł', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: null },
  ] }, [{ blockId: 'p1', paragraphXml: '<w:p><w:r><w:t>1200 zł</w:t></w:r></w:p>' }])
  assert.ok(grounded.ok)
  if (grounded.ok) assert.equal(grounded.mappings[0]?.occurrence, 0)
  const contactParsed = parseSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p1', concept: 'customer_address', anchor: 'ul. Leśna 1', occurrence: null, customerIndex: 1, customerIndexes: null, nameForm: null }] })
  assert.ok(contactParsed.ok)
  if (contactParsed.ok) assert.equal(contactParsed.semanticMappings[0]?.customerIndex, 1)
  const sharedContact = parseSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p1', concept: 'customer_address', anchor: 'ul. Leśna 1', occurrence: null, customerIndex: null, customerIndexes: [0, 1], nameForm: null }] })
  assert.ok(sharedContact.ok)
  if (sharedContact.ok) {
    assert.deepEqual(sharedContact.semanticMappings[0]?.customerIndexes, [0, 1])
    assert.equal(Object.hasOwn(sharedContact.semanticMappings[0]!, 'customerIndex'), false)
  }
  const sharedGrounding = groundSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p1', concept: 'customer_address', anchor: 'ul. Leśna 1', occurrence: null, customerIndex: null, customerIndexes: [0, 1], nameForm: null }] }, [{ blockId: 'p1', paragraphXml: '<w:p><w:r><w:t>ul. Leśna 1</w:t></w:r></w:p>' }])
  assert.equal(sharedGrounding.ok, true, 'shared contact owner grounds as a tuple')
  assert.equal(parseSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p1', concept: 'customer_phone', anchor: '+48 555 000 111', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: null }] }).ok, false, 'contact with no owner is rejected')
  for (const invalidOwners of [[0], [1], [0, 0], [1, 1], [1, 0], [0, 1, 0]] as number[][]) {
    assert.equal(parseSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p1', concept: 'customer_address', anchor: 'ul. Leśna 1', occurrence: null, customerIndex: null, customerIndexes: invalidOwners, nameForm: null }] }).ok, false, `invalid shared owner tuple ${invalidOwners}`)
  }
})

run('normalization preserves explicit occurrences and rejects prohibited properties', () => {
  const parsed = parseSemanticMapResponse(JSON.stringify({ semanticMappings: [
    { sourceBlockId: 'p1', concept: 'customer_1_name', anchor: 'Name', occurrence: 1, customerIndex: null, customerIndexes: null, nameForm: 'BASE' },
  ] }))
  assert.ok(parsed.ok)
  if (parsed.ok) assert.equal(parsed.semanticMappings[0]?.occurrence, 1)
  if (parsed.ok) assert.equal(parsed.semanticMappings[0]?.nameForm, 'BASE')
  const nullName = parseSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p1', concept: 'customer_1_name', anchor: 'Name', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: null }] })
  assert.equal(nullName.ok, false, 'customer name requires non-null form')
  const missingNameForm = parseSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p1', concept: 'customer_2_name', anchor: 'Name', occurrence: null, customerIndex: null, customerIndexes: null }] })
  assert.equal(missingNameForm.ok, false, 'missing nameForm rejected')
  const nonNameForm = parseSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p1', concept: 'total', anchor: '1200', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: 'BASE' }] })
  assert.equal(nonNameForm.ok, false, 'nameForm forbidden for other concepts')
  const invalidForm = parseSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p1', concept: 'customer_2_name', anchor: 'Name', occurrence: null, customerIndex: null, customerIndexes: null, nameForm: 'LOCATIVE' }] })
  assert.equal(invalidForm.ok, false, 'unsupported nameForm rejected')
  assert.equal(parseSemanticMapResponse({ semanticMappings: [], changedBlocks: [] }).ok, false)
  assert.equal(parseSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p', concept: 'total', anchor: '1200', occurrence: null, customerIndex: null, replacement: '900' }] }).ok, false)
  assert.equal(parseSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p', concept: 'total', anchor: '1200', occurrence: -1, customerIndex: null }] }).ok, false)
  assert.equal(parseSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p', concept: 'extras', anchor: 'Photo booth', occurrence: null, customerIndex: null }] }).ok, false)
  assert.equal(parseSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p', concept: 'total', anchor: '1200', occurrence: null }] }).ok, false)
})

run('legacy production model default is unchanged and builder has no implicit candidate', () => {
  assert.equal(resolveModelFromEnv(() => undefined), 'gpt-4.1-mini')
  assert.equal(SEMANTIC_MAP_MODEL_IDS.terra, 'gpt-5.6-terra')
  assert.equal(SEMANTIC_MAP_MODEL_IDS.sol, 'gpt-5.6-sol')
  assert.equal(SEMANTIC_MAP_REASONING_EFFORT, 'medium')
  assert.throws(() => buildSemanticMapRequest({ candidate: undefined as never, sourceBlocks, dataset }))
})
