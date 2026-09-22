import assert from 'node:assert/strict'
import { resolveModelFromEnv } from './fullAiRewritePromptShared'
import { SEMANTIC_CONCEPTS } from './semanticMapping'
import {
  SEMANTIC_MAP_MAX_OUTPUT_TOKENS,
  SEMANTIC_MAP_MODEL_IDS,
  SEMANTIC_MAP_REASONING_EFFORT,
  SEMANTIC_MAP_SYSTEM_PROMPT,
  buildSemanticMapRequest,
  buildSemanticMapResponseSchema,
  groundSemanticMapResponse,
  parseSemanticMapResponse,
} from './semanticMapModelContract'
import type { ContractTransformationDataset, TransformDocumentBlock } from './types'

function run(name: string, fn: () => void) {
  fn()
  console.log(`PASS ${name}`)
}

const dataset: ContractTransformationDataset = {
  clients: { displayNames: 'Anna Nowak i Jan Kowalski', personCount: 2, address: 'ul. Leśna 1', phone: '+48 555 000 111' },
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
  assert.deepEqual(schema.schema.required, ['semanticMappings'])
  assert.deepEqual(schema.schema.properties.semanticMappings.items.required, ['sourceBlockId', 'concept', 'anchor', 'occurrence'])
  assert.deepEqual(schema.schema.properties.semanticMappings.items.properties.concept.enum, [...SEMANTIC_CONCEPTS])
  assert.deepEqual(schema.schema.properties.semanticMappings.items.properties.occurrence.type, ['integer', 'null'])
  assert.equal(schema.schema.additionalProperties, false)
  assert.equal(schema.schema.properties.semanticMappings.items.additionalProperties, false)
  for (const forbidden of ['changedBlocks', 'replacement', 'financeEvidence', 'dateEvidence', 'confidence', 'explanation', 'start', 'end', 'notes']) {
    assert.equal(forbidden in schema.schema.properties, false, `${forbidden} absent`)
  }
})

run('prompt defines semantic-only work, exact anchors, and protected product boundaries', () => {
  for (const instruction of [
    'anchor copied EXACTLY',
    'SOURCE DOCX is authoritative for base package contractual content',
    'Do not map provider identity or surrounding legal text',
    'modelEditable=false is protected context',
    'Extras are outside semanticMappings',
    'ONE EXACT SOURCE OCCURRENCE → ONE SEMANTIC CONCEPT',
    'CRM facts are reference context only',
    'This task is one semantic-localization model call',
    'If meaning, ownership, role, or exact span is uncertain, omit',
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
  assert.equal('package' in user.crmReferenceOnly, false)
  assert.equal('additionalServices' in user.crmReferenceOnly, false)
  assert.equal(JSON.stringify(user).includes('Internal package data must not be sent'), false)
  assert.equal(JSON.stringify(user).includes('Extras must not be sent to map path'), false)
  assert.equal(JSON.stringify(user).includes('semanticRoles'), false)
  assert.equal(JSON.stringify(user).includes('ownershipReason'), false)
  assert.equal(user.sourceBlocks[0].sourceBlockId, sourceBlocks[0]!.blockId)
  assert.equal(user.sourceBlocks[0].visibleText, sourceBlocks[0]!.text)
  assert.deepEqual(user.sourceBlocks[0].tableContext.neighboringCellTexts, ['Data wydarzenia'])
  assert.equal(user.sourceBlocks[0].modelEditable, true)
})

run('provider null occurrence normalizes to omitted internal property and grounds', () => {
  const parsed = parseSemanticMapResponse({ semanticMappings: [
    { sourceBlockId: 'p1', concept: 'total', anchor: '1200 zł', occurrence: null },
  ] })
  assert.ok(parsed.ok)
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.semanticMappings[0]!, 'occurrence'), false)
  const grounded = groundSemanticMapResponse({ semanticMappings: [
    { sourceBlockId: 'p1', concept: 'total', anchor: '1200 zł', occurrence: null },
  ] }, [{ blockId: 'p1', paragraphXml: '<w:p><w:r><w:t>1200 zł</w:t></w:r></w:p>' }])
  assert.ok(grounded.ok)
  if (grounded.ok) assert.equal(grounded.mappings[0]?.occurrence, 0)
})

run('normalization preserves explicit occurrences and rejects prohibited properties', () => {
  const parsed = parseSemanticMapResponse(JSON.stringify({ semanticMappings: [
    { sourceBlockId: 'p1', concept: 'customer_1_name', anchor: 'Name', occurrence: 1 },
  ] }))
  assert.ok(parsed.ok)
  if (parsed.ok) assert.equal(parsed.semanticMappings[0]?.occurrence, 1)
  assert.equal(parseSemanticMapResponse({ semanticMappings: [], changedBlocks: [] }).ok, false)
  assert.equal(parseSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p', concept: 'total', anchor: '1200', occurrence: null, replacement: '900' }] }).ok, false)
  assert.equal(parseSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p', concept: 'total', anchor: '1200', occurrence: -1 }] }).ok, false)
  assert.equal(parseSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p', concept: 'extras', anchor: 'Photo booth', occurrence: null }] }).ok, false)
  assert.equal(parseSemanticMapResponse({ semanticMappings: [{ sourceBlockId: 'p', concept: 'total', anchor: '1200' }] }).ok, false)
})

run('legacy production model default is unchanged and builder has no implicit candidate', () => {
  assert.equal(resolveModelFromEnv(() => undefined), 'gpt-4.1-mini')
  assert.equal(SEMANTIC_MAP_MODEL_IDS.terra, 'gpt-5.6-terra')
  assert.equal(SEMANTIC_MAP_MODEL_IDS.sol, 'gpt-5.6-sol')
  assert.equal(SEMANTIC_MAP_REASONING_EFFORT, 'medium')
  assert.throws(() => buildSemanticMapRequest({ candidate: undefined as never, sourceBlocks, dataset }))
})
