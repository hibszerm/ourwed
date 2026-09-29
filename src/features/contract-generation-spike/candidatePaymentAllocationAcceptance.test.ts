import assert from 'node:assert/strict'
import { makeInput, validateAuthorityGate, type GenerationInput, type PlanResult } from './generator'
const input = makeInput({ generationDate: '25.09.2026', sourceDocument: { fileName: 'source.docx', blocks: [] }, wedding: { bride: { name: 'A', phone: '', email: '' }, groom: { name: 'B', phone: '' }, weddingDate: '20.09.2027', contractAddress: '', contractValuePln: 14200, depositPln: 1000, remainingDueDate: '', locations: { bridePreparations: '', groomPreparations: '', ceremony: '', reception: '' } }, packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [] })
const plan: PlanResult = { status: 'READY', missingInputs: [], conflicts: [], factChanges: [{ label: 'free text: this wording may describe any payment', oldValues: ['old'], newValue: '13200', authority: { kind: 'derived', ref: 'financials.remainingPln' }, sourceRefs: ['invented'] }], retainedLiterals: [], operations: [] }
assert.ok(validateAuthorityGate(input, { items: [] }, plan).some((item) => /unsupported source reference/.test(item)))
const valid: PlanResult = { ...plan, factChanges: [] }
assert.deepEqual(validateAuthorityGate(input, { items: [] }, valid), [])
console.log('PASS payment amounts are checked as arithmetic and provenance only')
