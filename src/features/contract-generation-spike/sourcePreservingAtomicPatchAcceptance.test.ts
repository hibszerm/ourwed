import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { applyAtomicFactChanges, buildProductRuleExtraOperations, computeChangedBlockDiff, makeInput, readSource, validateAuthorityGate, validateCandidate, type PlanResult, type SourceInventory } from './generator'
import { applyBlockOperations } from './blockDocxEditor'

const zip = new JSZip()
zip.file('[Content_Types].xml', '<Types/>')
zip.file('_rels/.rels', '<Relationships/>')
zip.file('word/document.xml', `<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Fotograf oraz </w:t></w:r><w:r><w:t>Aleksandra Nowicka</w:t></w:r><w:r><w:t xml:space="preserve"> i </w:t></w:r><w:r><w:t>Piotr Zieliński</w:t></w:r><w:r><w:t xml:space="preserve">, zwani dalej „Klientami”. Gdańsk, </w:t></w:r><w:r><w:t>12 marca 2024 r.</w:t></w:r></w:p><w:p><w:r><w:t>Rezerwacja: stary termin; w terminie 5 dni od zawarcia umowy.</w:t></w:r></w:p></w:body></w:document>`)
const sourceBytes = await zip.generateAsync({ type: 'arraybuffer' })
const source = await readSource(sourceBytes, 'synthetic.docx')
const [partyBlock, paymentBlock] = source.blocks
assert.ok(partyBlock && paymentBlock)
const input = makeInput({
  generationDate: '30.09.2026', sourceDocument: source,
  wedding: { bride: { name: 'Julia Zielińska', phone: '', email: '' }, groom: { name: 'Jan Nowicki', phone: '' }, weddingDate: '', contractAddress: '', contractValuePln: 10000, depositPln: 1000, remainingDueDate: '', locations: { bridePreparations: '', groomPreparations: '', ceremony: '', reception: '' } },
  packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [{ id: 'payment.new-deadline', value: '30 czerwca 2027 r.' }],
})
const item = (id: string, blockId: string, quote: string, conceptId?: string) => ({ id, label: id, ...(conceptId ? { conceptId } : {}), occurrences: [{ sourceRef: blockId, quote }] })
const inventory: SourceInventory = {
  coveredSourceRefs: source.blocks.map((block) => block.blockId),
  items: [
    item('party-one', partyBlock.blockId, 'Aleksandra Nowicka'),
    item('party-two', partyBlock.blockId, 'Piotr Zieliński'),
    item('signing-date', partyBlock.blockId, '12 marca 2024 r.'),
    item('old-payment-deadline', paymentBlock.blockId, 'stary termin', 'reservation-deadline'),
    item('reusable-payment-rule', paymentBlock.blockId, 'w terminie 5 dni od zawarcia umowy', 'reservation-deadline'),
  ],
}
const changes: PlanResult['factChanges'] = [
  { label: 'party one', inventoryItemIds: ['party-one'], inventoryItemId: 'party-one', sourceRef: partyBlock.blockId, expectedSource: 'Aleksandra Nowicka', newValue: 'Julia Zielińska', newValueFormat: 'literal', authority: { kind: 'crm', ref: 'wedding.bride.name' } },
  { label: 'party two', inventoryItemIds: ['party-two'], inventoryItemId: 'party-two', sourceRef: partyBlock.blockId, expectedSource: 'Piotr Zieliński', newValue: 'Jan Nowicki', newValueFormat: 'literal', authority: { kind: 'crm', ref: 'wedding.groom.name' } },
  { label: 'signing date', inventoryItemIds: ['signing-date'], inventoryItemId: 'signing-date', sourceRef: partyBlock.blockId, expectedSource: '12 marca 2024 r.', newValue: '30 września 2026 r.', newValueFormat: 'literal', authority: { kind: 'generation_date', ref: 'generationDate' } },
  { label: 'reservation deadline reuse', inventoryItemIds: ['old-payment-deadline'], inventoryItemId: 'old-payment-deadline', sourceRef: paymentBlock.blockId, expectedSource: 'stary termin', sourceProvenance: { inventoryItemId: 'reusable-payment-rule', sourceRef: paymentBlock.blockId, expectedSource: 'w terminie 5 dni od zawarcia umowy' }, newValue: 'w terminie 5 dni od zawarcia umowy', newValueFormat: 'literal', authority: { kind: 'source', ref: paymentBlock.blockId } },
]
const plan: PlanResult = { status: 'READY', missingInputs: [], conflicts: [], factChanges: changes, retainedLiterals: [{ inventoryItemId: 'reusable-payment-rule', authority: { kind: 'product_rule', ref: 'preserveSourcePackageExactly' }, reason: 'source provenance only' }], operations: [] }
assert.deepEqual(validateAuthorityGate(input, inventory, plan), [], 'only exact inventoried spans with single authorities or exact source provenance are authorized')
assert.deepEqual(validateAuthorityGate(input, { ...inventory, coveredSourceRefs: [partyBlock.blockId] }, plan).some((issue) => /complete coverage/.test(issue)), true, 'inventory must attest every canonical source reference')
assert.ok(validateAuthorityGate(input, inventory, { ...plan, operations: [{ blockId: partyBlock.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'arbitrary rewrite' }] }).some((issue) => /block operations/.test(issue)), 'an existing block target does not authorize complete prose')
assert.ok(validateAuthorityGate(input, inventory, { ...plan, factChanges: [{ ...changes[0]!, inventoryItemIds: ['party-one', 'party-two'] }] }).some((issue) => /exactly one atomic/.test(issue)), 'composite fact changes are rejected')
assert.ok(validateAuthorityGate(input, inventory, { ...plan, factChanges: [{ ...changes[3]!, sourceProvenance: { ...changes[3]!.sourceProvenance!, expectedSource: 'invented clause' } }] }).some((issue) => /same-concept inventory provenance/.test(issue)), 'source reuse requires exact matching provenance')
assert.ok(validateAuthorityGate(input, inventory, { ...plan, factChanges: [{ ...changes[0]!, authority: { kind: 'derived', ref: 'derived:invented' } }] }).some((issue) => /canonical authority reference/.test(issue)), 'unknown derived refs remain invalid')

const candidate = await applyAtomicFactChanges(sourceBytes, changes, inventory, source)
const candidateSource = await readSource(candidate, 'candidate.docx')
assert.equal(candidateSource.blocks[0]?.text, 'Fotograf oraz Julia Zielińska i Jan Nowicki, zwani dalej "Klientami". Gdańsk, 30 września 2026 r.', 'visible canonical extraction retains all non-patched source wording')
assert.equal(candidateSource.blocks[1]?.text, 'Rezerwacja: w terminie 5 dni od zawarcia umowy; w terminie 5 dni od zawarcia umowy.')
const candidateZip = await JSZip.loadAsync(candidate)
assert.match(await candidateZip.file('word/document.xml')!.async('string'), /zwani dalej „Klientami”\./, 'source curly quote style survives in OOXML')
assert.deepEqual(await validateCandidate(sourceBytes, candidate, input, inventory, plan, []), [], 'candidate exactly matches deterministic source-span patches')

const unauthorizedZip = await JSZip.loadAsync(candidate)
const xml = await unauthorizedZip.file('word/document.xml')!.async('string')
unauthorizedZip.file('word/document.xml', xml.replace('„Klientami”', '"Klientami"'))
const unauthorized = await unauthorizedZip.generateAsync({ type: 'arraybuffer' })
assert.ok((await validateCandidate(sourceBytes, unauthorized, input, inventory, plan, [])).some((issue) => /outside deterministic source patches/.test(issue)), 'unapproved quote-style changes fail candidate diff validation')

const enrichedZip = await JSZip.loadAsync(candidate)
const enrichedXml = await enrichedZip.file('word/document.xml')!.async('string')
enrichedZip.file('word/document.xml', enrichedXml.replace('Gdańsk, </w:t>', 'Gdańsk, ul. CRM 1, </w:t>'))
const enriched = await enrichedZip.generateAsync({ type: 'arraybuffer' })
assert.ok((await validateCandidate(sourceBytes, enriched, input, inventory, plan, [])).some((issue) => /outside deterministic source patches/.test(issue)), 'CRM enrichment and other inserted prose fail')

const extraInput = makeInput({
  generationDate: input.generationDate, sourceDocument: source, wedding: input.wedding,
  packagePolicy: input.packagePolicy, productRules: input.productRules,
  extras: ['Album fotografii'], userProvidedAnswers: input.userProvidedAnswers,
})
const extraPlan: PlanResult = { ...plan, extraInsertions: [{ anchorBlockId: partyBlock.blockId, styleSourceBlockId: partyBlock.blockId, extraIds: ['legacy-extra-1'] }] }
const extraOperations = buildProductRuleExtraOperations(extraInput, source, extraPlan.extraInsertions, extraPlan.factChanges)
assert.equal(extraOperations.length, 1)
assert.equal(extraOperations[0]?.operation, 'INSERT_BLOCK_AFTER')
if (extraOperations[0]?.operation !== 'INSERT_BLOCK_AFTER') throw new Error('Expected bounded extra insertion')
assert.equal(extraOperations[0].finalText, 'Album fotografii', 'product code renders the exact selected extra name')
const extraCandidate = await applyBlockOperations(await applyAtomicFactChanges(sourceBytes, changes, inventory, source), extraOperations)
assert.deepEqual(validateAuthorityGate(extraInput, inventory, extraPlan), [], 'explicit extras remain supported through a bounded product-rule insertion')
assert.deepEqual(await validateCandidate(sourceBytes, extraCandidate, extraInput, inventory, extraPlan, extraOperations), [], 'candidate reconstruction includes only deterministic extra insertion')
const extraCandidateSource = await readSource(extraCandidate, 'extra-candidate.docx')
const extraDiff = computeChangedBlockDiff(source.blocks, extraCandidateSource.blocks, extraOperations)
assert.equal(extraDiff.length, 3, 'review diff maps source blocks across inserted paragraphs and reports the insertion separately')
assert.ok(extraDiff.some((change) => change.sourceText === null && change.candidateText === 'Album fotografii'))
const alteredExtraPlan = { ...extraPlan, extraInsertions: [{ ...extraPlan.extraInsertions![0]!, extraIds: ['legacy-extra-2'] }] }
assert.ok(validateAuthorityGate(extraInput, inventory, alteredExtraPlan).some((issue) => /no exact renderable authority/.test(issue)), 'unknown extra IDs cannot inject planner-authored text')
console.log('PASS source-preserving atomic patch acceptance')
