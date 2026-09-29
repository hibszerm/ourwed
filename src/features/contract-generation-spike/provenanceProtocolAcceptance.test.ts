import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { makeInput, readSource, SOURCE_INVENTORY_INSTRUCTIONS, TRANSFORMATION_INSTRUCTIONS, validateAuthorityGate, type FactChange, type GenerationInput, type PlanResult, type SourceInventory } from './generator'

const zip = new JSZip()
const p = (value: string) => `<w:p><w:r><w:t xml:space="preserve">${value}</w:t></w:r></w:p>`
zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p('Hotelu H15; Kościele św. Anny; 04.02.2028; 8600,00 zł; OLD-1 i OLD-2; 18/2027') }<w:sectPr/></w:body></w:document>`)
zip.file('word/footer1.xml', `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${p('Footer literal')}</w:ftr>`)
zip.file('docProps/core.xml', '<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:subject>Metadata literal</dc:subject></cp:coreProperties>')
const bytes = await zip.generateAsync({ type: 'arraybuffer' })
const source = await readSource(bytes, 'protocol.docx')
const body = source.blocks.find((block) => block.text.includes('Hotelu H15'))!
const footer = source.blocks.find((block) => block.kind === 'footer')!
const metadata = source.documentProperties!.find((item) => item.property === 'subject')!
assert.equal(body.blockId, 'word/document.xml#p0')
assert.equal(footer.blockId, 'word/footer1.xml#p0')
assert.equal(metadata.ref, 'docProps/core.xml#subject')
const wedding: GenerationInput['wedding'] = {
  bride: { name: 'Ada', phone: '111222333', email: 'ada@example.test' }, groom: { name: 'Bar', phone: '444555666' },
  weddingDate: '22.05.2028', contractAddress: 'Address 1', contractValuePln: 10600, depositPln: 2000, remainingDueDate: '7 days',
  locations: { bridePreparations: '', groomPreparations: '', ceremony: '', reception: '' },
}
const input = makeInput({ generationDate: '04.02.2028', sourceDocument: source, wedding, packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [{ id: 'wedding.bride.pesel', value: '96041412344' }] })
const base: PlanResult = { status: 'READY', missingInputs: [], conflicts: [], factChanges: [], retainedLiterals: [], operations: [] }
const fact = (oldValues: string[], newValue: string, authority: FactChange['authority'], sourceRefs = [body.blockId]): FactChange => ({ label: 'free-form label', oldValues, newValue, authority, sourceRefs })
const gate = (changes: FactChange[], inventoryItems: SourceInventory['items'] = [], retained: string[] = []) => validateAuthorityGate(input, { items: inventoryItems }, { ...base, factChanges: changes, retainedLiterals: retained.map((value) => ({ value, reason: 'free text' })) })

// A. Canonical bare authority refs resolve; duplicate namespace prefixes fail.
assert.deepEqual(gate([
  fact(['OLD-1'], 'Ada', { kind: 'crm', ref: 'wedding.bride.name' }),
  fact(['OLD-1'], '96041412344', { kind: 'user', ref: 'wedding.bride.pesel' }),
  fact(['OLD-1'], '4 lutego 2028 r.', { kind: 'generation_date', ref: 'generationDate' }),
  fact(['OLD-1'], '8 600,00 zł', { kind: 'derived', ref: 'financials.remainingPln' }),
]), [])
assert.ok(gate([fact(['OLD-1'], 'Ada', { kind: 'crm', ref: 'crm:crm:wedding.bride.name' })]).some((issue) => /canonical authority reference/.test(issue)))
assert.ok(gate([fact(['OLD-1'], '96041412344', { kind: 'user', ref: 'user:user:wedding.bride.pesel' })]).some((issue) => /canonical authority reference/.test(issue)))

// B. Canonical source refs are supplied by the index; colon refs, invented refs, and authorities are rejected.
assert.deepEqual(validateAuthorityGate(input, { items: [{ value: 'Metadata literal', sourceRefs: [metadata.ref], label: 'metadata' }] }, { ...base, retainedLiterals: [{ value: 'Metadata literal', reason: 'test' }] }), [])
assert.ok(validateAuthorityGate(input, { items: [{ value: 'Metadata literal', sourceRefs: ['docProps/core.xml:subject'], label: 'metadata' }] }, base).some((issue) => /unsupported source reference/.test(issue)))
assert.ok(gate([fact(['OLD-1'], 'Ada', { kind: 'crm', ref: 'wedding.bride.name' }, ['wedding.bride.name'])]).some((issue) => /unsupported source reference/.test(issue)))
assert.ok(validateAuthorityGate(input, { items: [{ value: 'OLD-1', sourceRefs: ['word/document.xml#p999'], label: 'invented ref' }] }, base).some((issue) => /unsupported source reference/.test(issue)))
assert.deepEqual(validateAuthorityGate(input, { items: [{ value: 'Footer literal', sourceRefs: [footer.blockId], label: 'footer' }] }, { ...base, retainedLiterals: [{ value: 'Footer literal', reason: 'test' }] }), [])

// C. Provenance is exact apart from Unicode and whitespace normalization.
assert.deepEqual(validateAuthorityGate(input, { items: [{ value: 'Hotelu H15', sourceRefs: [body.blockId], label: 'exact' }] }, { ...base, retainedLiterals: [{ value: 'Hotelu H15', reason: 'test' }] }), [])
assert.ok(validateAuthorityGate(input, { items: [{ value: 'Hotel H15', sourceRefs: [body.blockId], label: 'inflected' }] }, base).some((issue) => /not present/.test(issue)))
assert.ok(gate([fact(['Hotelu H15 oraz Kościele św. Anny'], 'Ada', { kind: 'crm', ref: 'wedding.bride.name' })]).some((issue) => /Declared old literal is not present/.test(issue)))
assert.deepEqual(gate([fact(['OLD-1', 'OLD-2'], 'Ada', { kind: 'crm', ref: 'wedding.bride.name' })]), [], 'multiple exact atomic source literals can share one block edit')

// D. Disposition is independent from authority validity and remains exact.
const oldInventory = [{ value: 'OLD-1', sourceRefs: [body.blockId], label: 'source literal' }]
const malformedAuthority = gate([fact(['OLD-1'], 'Ada', { kind: 'crm', ref: 'crm:crm:wedding.bride.name' })], oldInventory)
assert.ok(malformedAuthority.some((issue) => /canonical authority/.test(issue)))
assert.ok(!malformedAuthority.some((issue) => /no planner disposition/.test(issue)))
assert.deepEqual(gate([], oldInventory, ['OLD-1']), [])
assert.ok(gate([fact(['OLD'], 'Ada', { kind: 'crm', ref: 'wedding.bride.name' })], oldInventory).some((issue) => /no planner disposition/.test(issue)))
assert.ok(gate([], [{ value: 'OLD-1', sourceRefs: [body.blockId], label: 'source literal' }], ['OLD']).some((issue) => /no planner disposition/.test(issue)))
assert.ok(gate([], oldInventory, ['not in the inventory']).some((issue) => /not an exact source inventory value/.test(issue)))
assert.ok(gate([fact([], 'Ada', { kind: 'crm', ref: 'wedding.bride.name' })]).some((issue) => /no exact source literals/.test(issue)))
const missingWithAuthorityRef: PlanResult = { ...base, status: 'MISSING_INPUT', missingInputs: [{ id: 'gap', label: 'gap', explanation: 'gap', inputType: 'text', required: true, sourceContext: 'source', sourceRefs: ['wedding.bride.name'] }] }
assert.ok(validateAuthorityGate(input, { items: [] }, missingWithAuthorityRef).some((issue) => /unsupported source reference/.test(issue)))

// E/F/G. Date and money equivalence is mechanical and only compares declared authority values.
assert.deepEqual(gate([fact(['OLD-1'], '4 lutego 2028 r.', { kind: 'generation_date', ref: 'generationDate' })]), [])
assert.ok(gate([fact(['OLD-1'], '5 lutego 2028 r.', { kind: 'generation_date', ref: 'generationDate' })]).some((issue) => /does not match/.test(issue)))
for (const rendered of ['8 600,00 zł', '8 600 PLN', '8600.00', '8 600']) assert.deepEqual(gate([fact(['OLD-1'], rendered, { kind: 'derived', ref: 'financials.remainingPln' })]), [], `${rendered} equals the derived numeric amount`)
assert.ok(gate([fact(['OLD-1'], '8 601 PLN', { kind: 'derived', ref: 'financials.remainingPln' })]).some((issue) => /does not match/.test(issue)))
assert.deepEqual(input.deterministicDerivedFacts[0]!.inputRefs, ['crm:financials.contractValuePln', 'crm:financials.depositPln'])
assert.match(TRANSFORMATION_INSTRUCTIONS, /derived operands belong only in the derivation declaration, never sourceRefs/i)
assert.ok(gate([fact(['OLD-1'], '8 600 PLN', { kind: 'derived', ref: 'financials.remainingPln' }, [body.blockId, 'crm:financials.contractValuePln'])]).some((issue) => /unsupported source reference/.test(issue)))

// H/I/J/K. Prompt scope and architecture boundary remain generic; no rule classifiers are added.
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /transaction-specific or agreement-instance-specific literals/i)
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /vendor\/company identity/i)
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /generic service catalogue/i)
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /standing travel policy/i)
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /standard legal wording/i)
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /reusable contractual timing language merely because it contains a number/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /do not prefix ref/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /never invent or repair a ref/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /oldValues must list exact source literals, one literal per array entry/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /sourceRefs contain document refs only/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /preserve the source conclusion place/i)
console.log('PASS generic provenance protocol acceptance')
