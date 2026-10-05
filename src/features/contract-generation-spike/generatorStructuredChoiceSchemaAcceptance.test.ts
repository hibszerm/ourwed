import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isGenerationResponse } from './generationProtocol'

const edgeSourcePath = fileURLToPath(new URL('../../../supabase/functions/contract-generation-boundary/index.ts', import.meta.url))
const edgeSource = readFileSync(edgeSourcePath, 'utf8')
const schemaStart = edgeSource.indexOf('const GENERATION_SCHEMA = ')
const schemaEnd = edgeSource.indexOf('\nconst REVIEW_SCHEMA =', schemaStart)
assert.notEqual(schemaStart, -1, 'the Edge function declares its Generator schema')
assert.notEqual(schemaEnd, -1, 'the Generator schema has a clear declaration boundary')

const schemaExpression = edgeSource
  .slice(schemaStart + 'const GENERATION_SCHEMA = '.length, schemaEnd)
  .trim()
  .replace(/,$/, '')
const generationSchema = Function(`return (${schemaExpression})`)() as Record<string, unknown>
assert.match(edgeSource, /schemaName: 'option_b_generation_response_v1', schema: GENERATION_SCHEMA/, 'the inspected schema is the one sent to the structured provider')

const rootProperties = generationSchema.properties as Record<string, unknown>
const missingInputsSchema = rootProperties.missingInputs as Record<string, unknown>
const missingInputAlternatives = missingInputsSchema.anyOf as unknown[]
const missingInputArray = missingInputAlternatives[0] as Record<string, unknown>
const itemSchema = missingInputArray.items as Record<string, unknown>
const missingInputBranches = itemSchema.anyOf as Array<Record<string, unknown>>
const scalarBranch = missingInputBranches.find((branch) => (branch.required as string[]).includes('answerKind'))
const choiceBranch = missingInputBranches.find((branch) => (branch.required as string[]).includes('options'))
assert.ok(scalarBranch, 'the existing scalar MissingInput branch remains present')
assert.ok(choiceBranch, 'the authoritative choice MissingInput branch remains present')
const choiceProperties = choiceBranch.properties as Record<string, unknown>
assert.deepEqual(choiceProperties.kind, { enum: ['choice'] }, 'choice discriminator uses strict-compatible enum')
assert.deepEqual(choiceBranch.required, ['id', 'kind', 'label', 'options'])
assert.equal(choiceBranch.additionalProperties, false)
const optionsSchema = choiceProperties.options as Record<string, unknown>
const optionSchema = optionsSchema.items as Record<string, unknown>
assert.equal(optionsSchema.minItems, 2, 'choice requires at least two authoritative options')
assert.deepEqual(optionSchema.required, ['id', 'label'])
assert.equal(optionSchema.additionalProperties, false)

const assertNoConstKeyword = (value: unknown): void => {
  if (!value || typeof value !== 'object') return
  assert.equal(Object.hasOwn(value, 'const'), false, 'strict provider schema must not contain JSON Schema const')
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(assertNoConstKeyword)
    else assertNoConstKeyword(child)
  }
}
assertNoConstKeyword(generationSchema)

const supportedKeywords = new Set(['type', 'additionalProperties', 'required', 'properties', 'enum', 'anyOf', 'items', 'minItems'])
const auditStrictSchema = (schema: Record<string, unknown>): void => {
  for (const keyword of Object.keys(schema)) assert.equal(supportedKeywords.has(keyword), true, `unexpected strict schema keyword: ${keyword}`)
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false, 'every strict object remains closed')
    const properties = schema.properties as Record<string, unknown>
    assert.deepEqual([...Object.keys(properties)].sort(), [...(schema.required as string[])].sort(), 'every object property remains required in strict mode')
  }
  if (schema.properties && typeof schema.properties === 'object') {
    Object.values(schema.properties as Record<string, unknown>).forEach((child) => auditStrictSchema(child as Record<string, unknown>))
  }
  if (Array.isArray(schema.anyOf)) schema.anyOf.forEach((child) => auditStrictSchema(child as Record<string, unknown>))
  if (schema.items && typeof schema.items === 'object') auditStrictSchema(schema.items as Record<string, unknown>)
}
auditStrictSchema(generationSchema)

assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [{ id: 'm1', label: 'A fact', answerKind: 'text' }] }), true, 'scalar MissingInput protocol remains valid')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [{ id: 'm2', kind: 'choice', label: 'Select a person', options: [{ id: 'o1', label: 'Person A' }, { id: 'o2', label: 'Person B' }] }] }), true, 'choice MissingInput protocol remains valid')
