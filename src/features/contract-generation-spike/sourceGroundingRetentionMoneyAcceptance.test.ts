import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { formatPolishPlnAmount, isPolishPlnAmountEquivalent } from './polishPlnAmount'
import { applyAtomicFactChanges, makeInput, readSource, resolveInventoryOccurrences, validateAuthorityGate, validateCandidate, type FactAuthority, type PlanResult, type SourceInventory } from './generator'

const zip = new JSZip()
zip.file('[Content_Types].xml', '<Types/>')
zip.file('word/document.xml', '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t xml:space="preserve">Date OLD; amount STALE; source clause w terminie 5 dni.</w:t></w:r></w:p><w:sectPr/></w:body></w:document>')
zip.file('docProps/core.xml', '<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:subject>OLD-001</dc:subject></cp:coreProperties>')
const bytes = await zip.generateAsync({ type: 'arraybuffer' })
const source = await readSource(bytes, 'source.docx')
const block = source.blocks[0]!
const prop = source.documentProperties![0]!
const input = makeInput({ generationDate: '2028-02-04', sourceDocument: source, wedding: { bride: { name: 'Klaudia Majewska', phone: '', email: '' }, groom: { name: 'Tomasz Domański', phone: '' }, weddingDate: '', contractAddress: 'ul. Próbna 1, Kraków', contractValuePln: 10600, depositPln: 2000, remainingDueDate: '', locations: { bridePreparations: '', groomPreparations: '', ceremony: '', reception: '' } }, packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [{ id: 'amount', value: '10600' }, { id: 'agreement.ref', value: 'NEW-002' }] })
const sourceRefs = [...source.blocks.map((item) => item.blockId), ...(source.documentProperties ?? []).map((item) => item.ref)]
const inventory: SourceInventory = { coveredSourceRefs: sourceRefs, items: [
  { id: 'date', label: 'date', occurrences: [{ sourceRef: block.blockId, quote: 'OLD' }] },
  { id: 'amount', label: 'amount', occurrences: [{ sourceRef: block.blockId, quote: 'STALE' }] },
  { id: 'agreement-id', label: 'agreement identifier', occurrences: [{ sourceRef: prop.ref, quote: 'OLD-001' }] },
] }
const change = (inventoryItemId: string, sourceRef: string, expectedSource: string, newValue: string, authority: FactAuthority, newValueFormat: 'literal' | 'polish_pln_words' = 'literal'): PlanResult['factChanges'][number] => ({ label: inventoryItemId, inventoryItemIds: [inventoryItemId], inventoryItemId, sourceRef, expectedSource, newValue, newValueFormat, authority })
const changes = [
  change('date', block.blockId, 'OLD', '4 lutego 2028 r.', { kind: 'generation_date', ref: 'generationDate' }),
  change('amount', block.blockId, 'STALE', '10 600,00 zł', { kind: 'crm', ref: 'financials.contractValuePln' }),
  change('agreement-id', prop.ref, 'OLD-001', 'NEW-002', { kind: 'user', ref: 'agreement.ref' }),
]
const plan: PlanResult = { status: 'READY', missingInputs: [], conflicts: [], factChanges: changes, retainedLiterals: [], operations: [] }
const resolved = resolveInventoryOccurrences(source, inventory)
assert.deepEqual(resolved.findings, [])
assert.deepEqual(resolved.occurrences.map(({ text }) => text), ['OLD', 'STALE', 'OLD-001'], 'inventory yields exact canonical source literals')
assert.deepEqual(validateAuthorityGate(input, inventory, plan), [], 'date and PLN presentation are bounded mechanical equivalences')
const candidate = await applyAtomicFactChanges(bytes, changes, inventory, source)
assert.deepEqual(await validateCandidate(bytes, candidate, input, inventory, plan, []), [])

const invalidDate = { ...plan, factChanges: [change('date', block.blockId, 'OLD', '5 lutego 2028 r.', { kind: 'generation_date', ref: 'generationDate' }), ...changes.slice(1)] }
assert.ok(validateAuthorityGate(input, inventory, invalidDate).some((issue) => /does not match its declared authority/.test(issue)))
const invalidAmount = { ...plan, factChanges: [changes[0]!, change('amount', block.blockId, 'STALE', '10 700,00 zł', { kind: 'crm', ref: 'financials.contractValuePln' }), changes[2]!] }
assert.ok(validateAuthorityGate(input, inventory, invalidAmount).some((issue) => /does not match its declared authority/.test(issue)))
const composite = { ...plan, factChanges: [{ ...changes[0]!, inventoryItemIds: ['date', 'amount'] }, ...changes.slice(1)] }
assert.ok(validateAuthorityGate(input, inventory, composite).some((issue) => /exactly one atomic inventory item/.test(issue)))
const nonInventoried = { ...plan, factChanges: [changes[0]!, { ...changes[1]!, expectedSource: 'source clause w terminie 5 dni' }, changes[2]!] }
assert.ok(validateAuthorityGate(input, inventory, nonInventoried).some((issue) => /not linked to one exact inventoried atomic source span/.test(issue)))
assert.ok(validateAuthorityGate(input, inventory, { ...plan, operations: [{ blockId: block.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'freely rewritten' }] }).some((issue) => /block operations/.test(issue)))

const mutatedZip = await JSZip.loadAsync(candidate)
const candidateXml = await mutatedZip.file('word/document.xml')!.async('string')
mutatedZip.file('word/document.xml', candidateXml.replace('source clause w terminie', 'added CRM information; source clause w terminie'))
const mutated = await mutatedZip.generateAsync({ type: 'arraybuffer' })
assert.ok((await validateCandidate(bytes, mutated, input, inventory, plan, [])).some((issue) => /outside deterministic source patches/.test(issue)))

assert.equal(formatPolishPlnAmount(9800), 'dziewięć tysięcy osiemset złotych 00/100')
assert.equal(formatPolishPlnAmount(10600), 'dziesięć tysięcy sześćset złotych 00/100')
assert.equal(formatPolishPlnAmount('1 234,56 zł'), 'tysiąc dwieście trzydzieści cztery złote 56/100')
assert.equal(isPolishPlnAmountEquivalent(10600, 'dziesięć tysięcy sześćset złotych 00/100'), true)
assert.equal(isPolishPlnAmountEquivalent(10600, 'dziesięć tysięcy sześćset złotych 01/100'), false)
console.log('PASS exact source grounding, retention authority, and bounded date/PLN rendering acceptance')
