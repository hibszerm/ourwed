import assert from 'node:assert/strict'
import { makeInput, validateAuthorityGate, type PlanResult } from './generator'
const input = makeInput({ generationDate: '25.09.2026', sourceDocument: { fileName: 'agreement.docx', blocks: [{ blockId: 'word/document.xml#p0', part: 'word/document.xml', index: 0, kind: 'body', context: '', text: 'Agreement reference OLD-001' }] }, wedding: { bride: { name: '', phone: '', email: '' }, groom: { name: '', phone: '' }, weddingDate: '', contractAddress: '', contractValuePln: 10, depositPln: 0, remainingDueDate: '', locations: { bridePreparations: '', groomPreparations: '', ceremony: '', reception: '' } }, packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [{ id: 'agreement.ref', value: 'NEW-002' }] })
const inventory = { items: [{ value: 'OLD-001', sourceRefs: ['word/document.xml#p0'], label: 'arbitrary descriptive text' }] }
const plan: PlanResult = { status: 'READY', missingInputs: [], conflicts: [], factChanges: [{ label: 'anything', oldValues: ['OLD-001'], newValue: 'NEW-002', authority: { kind: 'user', ref: 'agreement.ref' }, sourceRefs: ['word/document.xml#p0'] }], retainedLiterals: [], operations: [] }
assert.deepEqual(validateAuthorityGate(input, inventory, plan), [])
console.log('PASS document literal safety is declared through source references')
