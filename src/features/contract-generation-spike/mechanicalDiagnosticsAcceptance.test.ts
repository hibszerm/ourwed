import assert from 'node:assert/strict'
import JSZip from 'jszip'
import {
  MECHANICAL_AUTHORITY_TYPES,
  MECHANICAL_GATE_IDS,
  MECHANICAL_GATE_REASON_PAIRS,
  MECHANICAL_REASON_CODES,
  safeMechanicalTelemetry,
} from './mechanicalDiagnostics'
import { applyBlockOperations } from './blockDocxEditor'
import { applyOptionBGenerationResponse, createGenerationSourceView, diagnoseOptionBCandidate, readSource } from './generator'
import { buildContractGenerationInput, type ContractGenerationInputOptions } from './contractGenerationInput'

for (const pair of MECHANICAL_GATE_REASON_PAIRS) {
  const [gateId, reasonCode] = pair.split(':') as [string, string]
  const safe = safeMechanicalTelemetry({ gateId, reasonCode })
  assert.deepEqual(safe, { mechanicalGateId: gateId, mechanicalReasonCode: reasonCode }, `${gateId}/${reasonCode} is accepted`)
}
assert.ok(MECHANICAL_GATE_IDS.includes('authority'))
assert.ok(MECHANICAL_REASON_CODES.includes('target_not_found'))
assert.deepEqual(MECHANICAL_AUTHORITY_TYPES, ['normalized_authority'])
assert.deepEqual(safeMechanicalTelemetry({ gateId: 'free text', reasonCode: 'private exception' }), {
  mechanicalGateId: 'internal', mechanicalReasonCode: 'internal_validation_failure',
})
assert.deepEqual(safeMechanicalTelemetry({ gateId: 'authority', reasonCode: 'table_structure_changed' }), {
  mechanicalGateId: 'internal', mechanicalReasonCode: 'internal_validation_failure',
})

const privateValues = [
  'SYNTHETIC_SOURCE_TEXT', 'SYNTHETIC_REPLACEMENT_TEXT', 'SYNTHETIC_USER_ANSWER',
  'SYNTHETIC_CANDIDATE_TEXT', 'SYNTHETIC_EXCEPTION_MESSAGE',
]
const projection = safeMechanicalTelemetry({
  gateId: 'source_target', reasonCode: 'target_not_found', editIndex: 2, editCount: 4,
  authorityType: 'not-allowlisted', message: privateValues.join(' '), stack: privateValues.join(' '),
  sourceText: privateValues[0], replacement: privateValues[1], answer: privateValues[2], candidate: privateValues[3],
})
assert.deepEqual(projection, {
  mechanicalGateId: 'source_target', mechanicalReasonCode: 'target_not_found', mechanicalEditIndex: 2, mechanicalEditCount: 4,
})
for (const value of privateValues) assert.equal(JSON.stringify(projection).includes(value), false)
assert.equal(JSON.stringify(projection).includes('not-allowlisted'), false)
assert.deepEqual(safeMechanicalTelemetry({ gateId: 'edit_application', reasonCode: 'requested_edit_missing', editIndex: '2', editCount: Number.NaN }), {
  mechanicalGateId: 'edit_application', mechanicalReasonCode: 'requested_edit_missing',
})
assert.equal(safeMechanicalTelemetry({ gateId: 'authority', reasonCode: 'missing_provenance', authorityType: 'normalized_authority' })?.mechanicalAuthorityType, 'normalized_authority')
assert.equal(safeMechanicalTelemetry({ gateId: 'authority', reasonCode: 'missing_provenance', authorityType: privateValues[4] })?.mechanicalAuthorityType, undefined)

function p(text: string): string { return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>` }
async function packageBytes(paragraphs: string[], extraPart?: string): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>')
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(p).join('')}<w:sectPr/></w:body></w:document>`)
  if (extraPart) zip.file(extraPart, 'preserved')
  return zip.generateAsync({ type: 'arraybuffer' })
}

const fixture = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('./multi-template-acceptance/cases/case-04-realistic-wedding-photographer/input.json', import.meta.url), 'utf8')) as { authoritativeInput: ContractGenerationInputOptions }
const authority = buildContractGenerationInput(fixture.authoritativeInput)
const sourceBytes = await packageBytes(['Source A', 'Source B'])
const source = await readSource(sourceBytes, 'source.docx')
const sourceView = createGenerationSourceView(source)
const handle = (index: number) => sourceView.blocks[index]!.blockId

const missingTarget = await applyOptionBGenerationResponse(sourceBytes, source, authority, sourceView.sourceBlockIds, {
  status: 'READY', edits: [{ kind: 'replace', blockId: 'unknown-handle', text: 'Private replacement' }],
})
assert.equal(missingTarget.status, 'FAILED')
if (missingTarget.status === 'FAILED') assert.deepEqual(missingTarget.mechanicalFailure, {
  gateId: 'source_target', reasonCode: 'target_not_found', editIndex: 0, editCount: 1,
})

const duplicateTarget = await applyOptionBGenerationResponse(sourceBytes, source, authority, sourceView.sourceBlockIds, {
  status: 'READY', edits: [
    { kind: 'replace', blockId: handle(0), text: 'First private replacement' },
    { kind: 'replace', blockId: handle(0), text: 'Second private replacement' },
  ],
})
assert.equal(duplicateTarget.status, 'FAILED')
if (duplicateTarget.status === 'FAILED') assert.deepEqual(duplicateTarget.mechanicalFailure, {
  gateId: 'duplicate_target', reasonCode: 'duplicate_target', editIndex: 1, editCount: 2,
})

const invalidArchive = await diagnoseOptionBCandidate(sourceBytes, new Uint8Array([1, 2, 3]).buffer, source, source, [])
assert.deepEqual(invalidArchive, { passed: false, failure: { gateId: 'candidate_parse', reasonCode: 'invalid_package', editCount: 0 } })

const applied = await applyBlockOperations(sourceBytes, [{ operation: 'REPLACE_BLOCK_TEXT', blockId: source.blocks[0]!.blockId, finalText: 'Updated A' }])
const candidate = await readSource(applied, 'candidate.docx')
assert.deepEqual(await diagnoseOptionBCandidate(sourceBytes, applied, source, candidate, [
  { operation: 'REPLACE_BLOCK_TEXT', blockId: source.blocks[0]!.blockId, finalText: 'Updated A' },
]), { passed: true }, 'a mechanically valid candidate remains a pass with no diagnostic')

const unexpectedBytes = await packageBytes(['Unexpected A', 'Source B'])
const unexpected = await readSource(unexpectedBytes, 'unexpected.docx')
const extraChange = await diagnoseOptionBCandidate(sourceBytes, unexpectedBytes, source, unexpected, [])
assert.equal(extraChange.passed, false)
if (!extraChange.passed) {
  assert.equal(extraChange.failure?.gateId, 'extra_change')
  assert.equal(extraChange.failure?.reasonCode, 'unexpected_change')
}

const absentEdit = await diagnoseOptionBCandidate(sourceBytes, sourceBytes, source, source, [
  { operation: 'REPLACE_BLOCK_TEXT', blockId: source.blocks[0]!.blockId, finalText: 'Requested but absent' },
])
assert.equal(absentEdit.passed, false)
if (!absentEdit.passed) {
  assert.equal(absentEdit.failure?.gateId, 'edit_application')
  assert.equal(absentEdit.failure?.reasonCode, 'requested_edit_missing')
  assert.equal(absentEdit.failure?.editIndex, 0)
}

const badInput = structuredClone(authority)
badInput.commercial.remainingAfterDeposit.value += 1
const invalidAuthority = await applyOptionBGenerationResponse(sourceBytes, source, badInput, sourceView.sourceBlockIds, {
  status: 'READY', edits: [],
})
assert.equal(invalidAuthority.status, 'FAILED')
if (invalidAuthority.status === 'FAILED') assert.deepEqual(invalidAuthority.mechanicalFailure, {
  gateId: 'authority', reasonCode: 'derived_fact_mismatch', authorityType: 'normalized_authority',
})

console.log('PASS safe generic mechanical diagnostics acceptance')
