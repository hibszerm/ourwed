import assert from 'node:assert/strict'
import { extractCanonicalParagraphText } from '../documents/template/canonicalParagraph'
import { buildGoldenScenarios } from './cg7/goldenScenarios'
import { buildContractTransformationDataset } from './transformationDataset'
import { parseLegacySemanticMapResponse as parseSemanticMapResponse } from './semanticMapModelContract'
import { resolveSemanticMappings } from './semanticMapping'
import { executeSemanticMappings } from './semanticMappingExecutor'

const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
const source = (blockId: string, text: string) => ({ blockId, paragraphXml: p(text) })
const scenario = buildGoldenScenarios().find((item) => item.caseId === 'G04')!
const dataset = (overrides: Record<string, unknown> = {}) => buildContractTransformationDataset({
  wedding: { ...scenario.wedding, ...overrides } as typeof scenario.wedding,
  package: scenario.package,
  extras: scenario.extras,
  currentDate: '2026-09-22',
})

function wireMapping(input: {
  sourceBlockId: string
  concept: string
  anchor: string
  dateRole?: string | null
  baseDateConcept?: string | null
  relation?: { direction: string; amount: number; unit: string } | null
}) {
  return {
    sourceBlockId: input.sourceBlockId,
    concept: input.concept,
    anchor: input.anchor,
    occurrence: null,
    customerIndex: null,
    customerIndexes: null,
    nameForm: null,
    dateRole: input.dateRole ?? null,
    baseDateConcept: input.baseDateConcept ?? null,
    relation: input.relation ?? null,
  }
}

function apply(input: {
  mapping: ReturnType<typeof wireMapping>
  text: string
  canonicalDataset?: ReturnType<typeof dataset>
}) {
  const parsed = parseSemanticMapResponse({ semanticMappings: [input.mapping] })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) throw new Error(parsed.code)
  const sources = [source(input.mapping.sourceBlockId, input.text)]
  const grounded = resolveSemanticMappings({ mappings: parsed.semanticMappings, sourceBlocks: sources })
  assert.equal(grounded.ok, true)
  if (!grounded.ok) throw new Error(grounded.code)
  return executeSemanticMappings({
    resolvedMappings: grounded.mappings,
    canonicalDataset: input.canonicalDataset ?? dataset(),
    sourceParagraphs: sources,
  })
}

// A — concrete wedding date is a valid, grounded semantic mapping.
const wedding = apply({
  mapping: wireMapping({ sourceBlockId: 'w', concept: 'wedding_date', anchor: '02.10.2027' }),
  text: '02.10.2027',
  canonicalDataset: dataset({ date: '2027-10-02' }),
})
assert.equal(wedding.ok, true)
if (wedding.ok) assert.equal(extractCanonicalParagraphText(wedding.paragraphs[0]!.paragraphXml), '02.10.2027')

// B — concrete execution date maps to the canonical current date.
const execution = apply({ mapping: wireMapping({ sourceBlockId: 'e', concept: 'execution_date', anchor: '22.04.2027' }), text: '22.04.2027' })
assert.equal(execution.ok, true)
if (execution.ok) assert.equal(extractCanonicalParagraphText(execution.paragraphs[0]!.paragraphXml), '22.09.2026')

// C — the system derives +3 days from two concrete source dates; the model sends no offset.
const depositMappings = [
  wireMapping({ sourceBlockId: 'source-execution', concept: 'execution_date', anchor: '22.04.2027' }),
  wireMapping({ sourceBlockId: 'source-deposit', concept: 'deposit_due_date', anchor: '25.04.2027' }),
]
const depositParsed = parseSemanticMapResponse({ semanticMappings: depositMappings })
assert.equal(depositParsed.ok, true)
if (!depositParsed.ok) throw new Error(depositParsed.code)
const depositSources = [source('source-execution', '22.04.2027'), source('source-deposit', '25.04.2027')]
const depositGrounded = resolveSemanticMappings({ mappings: depositParsed.semanticMappings, sourceBlocks: depositSources })
assert.equal(depositGrounded.ok, true)
if (!depositGrounded.ok) throw new Error(depositGrounded.code)
const deposit = executeSemanticMappings({ resolvedMappings: depositGrounded.mappings, canonicalDataset: dataset(), sourceParagraphs: depositSources })
assert.equal(deposit.ok, true)
if (deposit.ok) assert.equal(extractCanonicalParagraphText(deposit.paragraphs.find((row) => row.blockId === 'source-deposit')!.paragraphXml), '25.09.2026')

// D — concrete final-payment date remains valid and uses the canonical field.
const final = apply({
  mapping: wireMapping({ sourceBlockId: 'f', concept: 'final_payment_due_date', anchor: '25.09.2027' }),
  text: '25.09.2027',
  canonicalDataset: dataset({ finalPaymentDueDate: '2027-09-25' }),
})
assert.equal(final.ok, true)
if (final.ok) assert.equal(extractCanonicalParagraphText(final.paragraphs[0]!.paragraphXml), '25.09.2027')
const delivery = apply({
  mapping: wireMapping({ sourceBlockId: 'd', concept: 'delivery_due_date', anchor: '01.12.2027' }),
  text: '01.12.2027',
  canonicalDataset: dataset({ deliveryDueDate: '2027-12-01' }),
})
assert.equal(delivery.ok, true)
if (delivery.ok) assert.equal(extractCanonicalParagraphText(delivery.paragraphs[0]!.paragraphXml), '01.12.2027')

// E/L — a concrete unsupported date follows the existing ambiguous path and cannot survive silently.
const unsupported = apply({
  mapping: wireMapping({ sourceBlockId: 'u', concept: 'ambiguous_date', anchor: '02.09.2027', dateRole: 'brief_due_date' }),
  text: '02.09.2027',
})
assert.equal(unsupported.ok, false)
if (!unsupported.ok) assert.equal(unsupported.code, 'requires_user_input')

// J/K — the parser rejects model-authored base/relation metadata for active date concepts.
for (const concept of ['deposit_due_date', 'final_payment_due_date']) {
  const invalid = parseSemanticMapResponse({ semanticMappings: [wireMapping({
    sourceBlockId: 'invalid', concept, anchor: '25.09.2027',
    baseDateConcept: 'wedding_date', relation: { direction: 'before', amount: 7, unit: 'calendar_days' },
  })] })
  assert.equal(invalid.ok, false, `${concept} with model-authored relation fails closed`)
  if (!invalid.ok) assert.equal(invalid.code, 'invalid_mapping')
}

// F–I — no mapping means the relative contractual source is preserved and creates no input path.
for (const [blockId, text] of [
  ['relative-deposit', 'w ciągu 5 dni od zawarcia umowy'],
  ['relative-final', '7 dni przed uroczystością'],
  ['relative-delivery', 'w ciągu 100 dni kalendarzowych od wydarzenia'],
  ['relative-correction', 'w ciągu 7 dni od udostępnienia wersji do odbioru'],
] as const) {
  const sourceBlocks = [source(blockId, text)]
  const parsed = parseSemanticMapResponse({ semanticMappings: [] })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) throw new Error(parsed.code)
  const grounded = resolveSemanticMappings({ mappings: parsed.semanticMappings, sourceBlocks })
  assert.equal(grounded.ok, true)
  if (!grounded.ok) throw new Error(grounded.code)
  const result = executeSemanticMappings({ resolvedMappings: grounded.mappings, canonicalDataset: dataset(), sourceParagraphs: sourceBlocks })
  assert.equal(result.ok, true, `${blockId} has no user-input path`)
  if (result.ok) {
    assert.equal(result.spanEdits.length, 0)
    assert.equal(result.paragraphs.length, 0, `${blockId} has no generated edit paragraph`)
    assert.equal(extractCanonicalParagraphText(sourceBlocks[0]!.paragraphXml), text, `${blockId} remains unchanged in the source`)
  }
}

console.log('date mapping applicability contract tests: PASS')
