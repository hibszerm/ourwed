import assert from 'node:assert/strict'
import { makeInput, sanitizePlannerOperations, validateAuthorityGate } from './generator'
const input = makeInput({ generationDate: '25.09.2026', sourceDocument: { fileName: 'fixture.docx', blocks: [] }, wedding: { bride: { name: '', phone: '', email: '' }, groom: { name: '', phone: '' }, weddingDate: '', contractAddress: '', contractValuePln: 14200, depositPln: 1000, remainingDueDate: '', locations: { bridePreparations: '', groomPreparations: '', ceremony: '', reception: '' } }, packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [] })
assert.equal(input.deterministicDerivedFacts[0]?.value, '13200')
const ready = { status: 'READY' as const, missingInputs: [], conflicts: [], factChanges: [], retainedLiterals: [], operations: [] }
assert.deepEqual(validateAuthorityGate(input, { items: [] }, ready), [])
const wrong = structuredClone(input); wrong.deterministicDerivedFacts[0]!.value = '13201'
assert.ok(validateAuthorityGate(wrong, { items: [] }, ready).length > 0)
assert.equal(sanitizePlannerOperations('MISSING_INPUT', []).operationCount, 0)
console.log('PASS contract generation uses authority and arithmetic without language parsers')
