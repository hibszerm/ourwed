import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { applyBlockOperations, type BlockOperation } from './blockDocxEditor'
import { formatPolishPlnAmount, isPolishPlnAmountEquivalent } from './polishPlnAmount'
import { applyMetadataFactChanges, makeInput, readSource, resolveInventoryOccurrences, validateAuthorityGate, validateCandidate, type GenerationInput, type PlanResult, type SourceInventory, type SourceInventoryItem } from './generator'

const p = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
async function packageFor(body: string, footer = '', subject = ''): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p(body)}<w:sectPr/></w:body></w:document>`)
  if (footer) zip.file('word/footer1.xml', `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${p(footer)}</w:ftr>`)
  zip.file('docProps/core.xml', `<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:subject>${subject}</dc:subject></cp:coreProperties>`)
  return zip.generateAsync({ type: 'arraybuffer' })
}
function spanFor(text: string, literal: string): { start: number; end: number } {
  const utf16Start = text.indexOf(literal)
  assert.notEqual(utf16Start, -1, `fixture contains ${literal}`)
  return { start: Array.from(text.slice(0, utf16Start)).length, end: Array.from(text.slice(0, utf16Start + literal.length)).length }
}
function occurrence(source: GenerationInput['sourceDocument'], sourceRef: string, literal?: string) {
  if (literal === undefined) return { sourceRef, span: null }
  const text = [...source.blocks, ...(source.documentProperties ?? []).map((item) => ({ blockId: item.ref, text: item.text }))].find((item) => item.blockId === sourceRef)?.text
  assert.ok(text, `source ref exists: ${sourceRef}`)
  return { sourceRef, span: spanFor(text, literal) }
}
function inputFor(source: GenerationInput['sourceDocument'], options: { userAnswers?: GenerationInput['userProvidedAnswers']; productRules?: Record<string, unknown> } = {}) {
  return makeInput({
    generationDate: '04.02.2028', sourceDocument: source,
    wedding: { bride: { name: 'Klaudia Majewska', phone: '', email: '' }, groom: { name: 'Tomasz Domański', phone: '' }, weddingDate: '22.05.2028', contractAddress: '', contractValuePln: 10600, depositPln: 2000, remainingDueDate: '', locations: { bridePreparations: 'Hotel Monopol Katowice', groomPreparations: '', ceremony: '', reception: '' } },
    packagePolicy: { preserveSourcePackageExactly: true }, productRules: options.productRules, extras: [], userProvidedAnswers: options.userAnswers ?? [],
  })
}
const ready = (): PlanResult => ({ status: 'READY', missingInputs: [], conflicts: [], factChanges: [], retainedLiterals: [], operations: [] })
const fact = (itemIds: string[], newValue: string, authority: PlanResult['factChanges'][number]['authority'], newValueFormat: 'literal' | 'polish_pln_words' = 'literal'): PlanResult['factChanges'][number] => ({ label: 'free-form meaning', inventoryItemIds: itemIds, newValue, newValueFormat, authority })

// Whole-block and subspan source selectors resolve exact source text; quote-like diagnostic data is ignored.
const hotelBytes = await packageFor('Reportage includes preparations in Hotelu H15 Luxury Palace w Krakowie and ceremony at Kościele św. Anny.')
const hotelSource = await readSource(hotelBytes, 'hotel.docx')
const hotelBlock = hotelSource.blocks[0]!
const wholeItem: SourceInventoryItem = { id: 'whole', label: 'whole source block', occurrences: [occurrence(hotelSource, hotelBlock.blockId)] }
assert.deepEqual(resolveInventoryOccurrences(hotelSource, { items: [wholeItem] }).occurrences[0]?.text, hotelBlock.text)
const hotelItem = { id: 'preparations', label: 'preparation location', occurrences: [occurrence(hotelSource, hotelBlock.blockId, 'Hotelu H15 Luxury Palace w Krakowie')], informationalQuote: 'Hotel H15 Luxury Palace w Krakowie' } as unknown as SourceInventoryItem
const hotelInventory: SourceInventory = { items: [hotelItem] }
assert.equal(resolveInventoryOccurrences(hotelSource, hotelInventory).occurrences[0]?.text, 'Hotelu H15 Luxury Palace w Krakowie', 'source text, not the model quote, is canonical')
const hotelInput = inputFor(hotelSource)
const hotelPlan = { ...ready(), factChanges: [fact(['preparations'], 'Hotel Monopol Katowice', { kind: 'crm', ref: 'wedding.locations.bridePreparations' })] }
assert.deepEqual(validateAuthorityGate(hotelInput, hotelInventory, hotelPlan), [])
const hotelOperation: BlockOperation = { blockId: hotelBlock.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Reportage includes preparations in Hotel Monopol Katowice and ceremony at Kościele św. Anny.' }
const hotelCandidate = await applyBlockOperations(hotelBytes, [hotelOperation])
assert.deepEqual(await validateCandidate(hotelBytes, hotelCandidate, hotelInput, hotelInventory, { ...hotelPlan, operations: [hotelOperation] }, [hotelOperation]), [])
const badSpanInventory: SourceInventory = { items: [{ id: 'bad', label: 'bad range', occurrences: [{ sourceRef: hotelBlock.blockId, span: { start: 1, end: Array.from(hotelBlock.text).length + 1 } }] }] }
assert.ok(validateAuthorityGate(hotelInput, badSpanInventory, ready()).some((item) => /invalid source span/.test(item)))
const missingRefInventory: SourceInventory = { items: [{ id: 'missing-ref', label: 'missing ref', occurrences: [{ sourceRef: 'word/document.xml#p999', span: null }] }] }
assert.ok(validateAuthorityGate(hotelInput, missingRefInventory, ready()).some((item) => /unsupported source reference/.test(item)))
assert.ok(validateAuthorityGate(hotelInput, { items: [hotelItem, { ...hotelItem, id: 'overlap' }] }, ready()).some((item) => /spans overlap/.test(item)))

// Multiple exact occurrences are tracked and replaced across body, footer, and metadata.
const idBytes = await packageFor('Nr OLD-001', 'Vendor · OLD-001', 'Vendor — OLD-001')
const idSource = await readSource(idBytes, 'identifier.docx')
const body = idSource.blocks.find((block) => block.part === 'word/document.xml')!
const footer = idSource.blocks.find((block) => block.kind === 'footer')!
const subject = idSource.documentProperties!.find((property) => property.property === 'subject')!
const idInventory: SourceInventory = { items: [{ id: 'reusable-id', label: 'source identifier', occurrences: [occurrence(idSource, body.blockId, 'OLD-001'), occurrence(idSource, footer.blockId, 'OLD-001'), occurrence(idSource, subject.ref, 'OLD-001')] }] }
assert.equal(resolveInventoryOccurrences(idSource, idInventory).occurrences.length, 3)
const idInput = inputFor(idSource, { userAnswers: [{ id: 'new.reference', value: 'NEW-002' }] })
const idPlan = { ...ready(), factChanges: [fact(['reusable-id'], 'NEW-002', { kind: 'user', ref: 'new.reference' })] }
assert.deepEqual(validateAuthorityGate(idInput, idInventory, idPlan), [])
const idOperations: BlockOperation[] = [
  { blockId: body.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Nr NEW-002' },
  { blockId: footer.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Vendor · NEW-002' },
]
const idEdited = await applyBlockOperations(idBytes, idOperations)
const idCandidate = await applyMetadataFactChanges(idEdited, idPlan.factChanges, idInventory, idSource)
assert.deepEqual(await validateCandidate(idBytes, idCandidate, idInput, idInventory, { ...idPlan, operations: idOperations }, idOperations), [])
const staleFooterZip = await JSZip.loadAsync(idCandidate)
staleFooterZip.file('word/footer1.xml', (await staleFooterZip.file('word/footer1.xml')!.async('string')).replace('NEW-002', 'OLD-001'))
const staleFooter = await staleFooterZip.generateAsync({ type: 'arraybuffer' })
assert.ok((await validateCandidate(idBytes, staleFooter, idInput, idInventory, { ...idPlan, operations: idOperations }, idOperations)).some((item) => /old source span remains/.test(item)))

// READY dispositions require exactly one replacement or retention, and every retention has an existing authority.
const singleId = { items: [{ id: 'transaction-fact', label: 'source fact', occurrences: [occurrence(hotelSource, hotelBlock.blockId, 'Hotelu H15 Luxury Palace w Krakowie')] }] }
const noAuthorityRetention = { ...ready(), retainedLiterals: [{ inventoryItemId: 'transaction-fact', reason: 'keep because I decided to' }] } as unknown as PlanResult
assert.ok(validateAuthorityGate(hotelInput, singleId, noAuthorityRetention).some((item) => /no valid authority reference/.test(item)))
const productRetention = { ...ready(), retainedLiterals: [{ inventoryItemId: 'transaction-fact', authority: { kind: 'product_rule' as const, ref: 'preserveSourcePackageExactly' }, reason: 'authorized by supplied rule' }] }
assert.deepEqual(validateAuthorityGate(hotelInput, singleId, productRetention), [])
const userInput = inputFor(hotelSource, { userAnswers: [{ id: 'preserve.sourceFact', value: 'Keep this source value' }] })
const userRetention = { ...ready(), retainedLiterals: [{ inventoryItemId: 'transaction-fact', authority: { kind: 'user' as const, ref: 'preserve.sourceFact' }, reason: 'explicit answer' }] }
assert.deepEqual(validateAuthorityGate(userInput, singleId, userRetention), [])
const nonexistentRule = { ...ready(), retainedLiterals: [{ inventoryItemId: 'transaction-fact', authority: { kind: 'product_rule' as const, ref: 'missing.rule' }, reason: 'free text is not authority' }] }
assert.ok(validateAuthorityGate(hotelInput, singleId, nonexistentRule).some((item) => /no valid authority reference/.test(item)))
const unresolved = { ...ready(), status: 'MISSING_INPUT' as const, missingInputs: [{ id: 'missing-id', label: 'Replacement value', explanation: 'No authority or preserve rule supplies the new value.', inputType: 'text' as const, required: true as const, sourceContext: 'source identifier', inventoryItemIds: ['transaction-fact'] }] }
assert.deepEqual(validateAuthorityGate(hotelInput, singleId, unresolved), [], 'unresolved old instance facts can stop as MISSING_INPUT without a partial plan')
assert.ok(validateAuthorityGate(hotelInput, singleId, ready()).some((item) => /no planner disposition/.test(item)))
assert.ok(validateAuthorityGate(hotelInput, singleId, productRetention).every((item) => !/18\/2027|contract number/i.test(item)), 'there is no identifier-specific retention branch')

// A declared written-out PLN rendering is checked mechanically against its numeric authority.
assert.equal(formatPolishPlnAmount(9800), 'dziewięć tysięcy osiemset złotych 00/100')
assert.equal(formatPolishPlnAmount(10600), 'dziesięć tysięcy sześćset złotych 00/100')
assert.equal(formatPolishPlnAmount('1 234,56 zł'), 'tysiąc dwieście trzydzieści cztery złote 56/100')
assert.equal(isPolishPlnAmountEquivalent(10600, 'dziesięć tysięcy sześćset złotych 00/100'), true)
assert.equal(isPolishPlnAmountEquivalent(10600, 'dziesięć tysięcy sześćset złotych 01/100'), false)
const moneySourceBytes = await packageFor('Kwota: dziewięć tysięcy osiemset złotych 00/100')
const moneySource = await readSource(moneySourceBytes, 'money.docx')
const moneyBlock = moneySource.blocks[0]!
const moneyInventory: SourceInventory = { items: [{ id: 'written-total', label: 'written amount', occurrences: [occurrence(moneySource, moneyBlock.blockId, 'dziewięć tysięcy osiemset złotych 00/100')] }] }
const moneyInput = inputFor(moneySource)
const moneyPlan = { ...ready(), factChanges: [fact(['written-total'], 'dziesięć tysięcy sześćset złotych 00/100', { kind: 'crm', ref: 'wedding.contractValuePln' }, 'polish_pln_words')] }
assert.deepEqual(validateAuthorityGate(moneyInput, moneyInventory, moneyPlan), [])
assert.ok(validateAuthorityGate(moneyInput, moneyInventory, { ...moneyPlan, factChanges: [fact(['written-total'], 'dziesięć tysięcy sześćset jeden złotych 00/100', { kind: 'crm', ref: 'wedding.contractValuePln' }, 'polish_pln_words')] }).some((item) => /does not match/.test(item)))
assert.ok(validateAuthorityGate(moneyInput, moneyInventory, { ...moneyPlan, factChanges: [fact(['written-total'], 'dziesięć tysięcy sześćset złotych 00/100', { kind: 'crm', ref: 'wedding.contractValuePln' }, 'literal')] }).some((item) => /does not match/.test(item)), 'word equivalence runs only when the planner declares that representation')
assert.deepEqual(validateAuthorityGate(moneyInput, { items: [] }, ready()), [], 'arbitrary source prose is not scanned for number words')

// The runtime boundary remains mechanical and generic.
const runtime = await (await import('node:fs/promises')).readFile(new URL('./generator.ts', import.meta.url), 'utf8')
for (const removed of ['isReservationPayment', 'sourceDocumentIdentifierValues', 'partyRoleLabel', 'packageDefinitionBlocks', 'conclusionPlaceInText']) assert.ok(!runtime.includes(removed), `${removed} remains absent`)
assert.doesNotMatch(runtime, /18\/2027|Hotel H15|contract.?number/i)
console.log('PASS source grounding, retention authority, and PLN rendering acceptance')
