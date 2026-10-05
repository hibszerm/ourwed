import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { applyBlockOperations } from './blockDocxEditor'
import { readSource, validateOptionBCandidate, GENERIC_CONTRACT_PRODUCT_RULES, REVIEW_INSTRUCTIONS } from './generator'
import { buildContractGenerationInput } from './contractGenerationInput'
import type { Wedding } from '@/types/wedding'
import type { WeddingExtraService } from '@/types/package'

const rules = GENERIC_CONTRACT_PRODUCT_RULES.join(' ').toLowerCase()
const review = REVIEW_INSTRUCTIONS.toLowerCase()

// Source convention controls display; current normalized wedding data controls facts.
assert.match(rules, /compare each extra with the source by service meaning, not only literal name/)
assert.match(rules, /for an extra absent from the source, add its authoritative name/)
assert.match(rules, /do not add an individual price, quantity, count, unit, sku-like detail, or other crm metadata/)
assert.match(rules, /already represented with an individual price in the source/)
assert.match(rules, /replace its price with the current authoritative crm price/)
assert.match(rules, /if the source represents it without a price, do not add one/)
assert.match(rules, /multiple new extras may be named together concisely/)
assert.match(rules, /prefer an existing source-defined extras\/additional-services location/)
assert.match(rules, /otherwise place it adjacent to the source-defined base service\/package scope, after that scope and its deliverables and before subsequent general performance provisions/)
assert.match(rules, /do not place it between event\/location details and the base package definition/)
assert.match(rules, /concise, neutral addition to the contract subject\/scope, not as an exception or contrast unless the source semantics require that distinction/)
assert.match(rules, /do not duplicate one already represented/)
assert.doesNotMatch(rules, /niezależnie od powyższego|video standard|vhs|§\s*1|paragraph\s+\d/i, 'placement policy remains semantic and template-independent')
assert.match(rules, /preserve source-authored quantity wording only when needed/)
assert.match(rules, /never invent quantity presentation from crm quantity/)
assert.match(rules, /does not change extra amounts, payment arithmetic, or authoritative contractvalue/)
assert.doesNotMatch(rules, /vhs|drone|album|[0-9a-f]{8}-[0-9a-f]{4}-/i, 'the generic rule contains no hardcoded extra or template identifiers')

assert.match(review, /do not report missing individual prices or quantities for extras newly added from source-absent items/)
assert.match(review, /expect the current authoritative price only when the source represents that same extra with an individual price/)
assert.match(review, /do not add a price when the source has no price convention/)
assert.match(review, /generation must not invent it from crm quantity/)
assert.match(review, /do not alter contract totals or payment arithmetic/)

// The existing normalized arithmetic continues to include extras independent of prose presentation.
const wedding: Wedding = {
  id: 'extra-display-test', couple: { partner1: 'A', partner2: 'B', email: '', phone: '', venue: '', city: '' },
  date: '2027-08-14', status: 'active', workflowStage: 'contract', packageId: 'p', packageName: 'Package',
  price: 13_250, depositAmount: 1_000, currency: 'PLN', packageItems: [], travelFeeStatus: 'included', travelFeeAmount: 0,
  payments: [], finances: [], questionnaires: { contractData: { status: 'completed' }, weddingQuestionnaire: { status: 'not_sent' } },
  contract: { status: 'none' }, checklist: [], schedule: [], notes: [], deliverables: [], timeline: [], accentColor: '', createdAt: '2026-09-30',
}
const extras: WeddingExtraService[] = [
  { id: 'extra-vhs', weddingId: wedding.id, extraServiceId: 'service-vhs', nameSnapshot: 'VHS', priceSnapshot: 900, quantity: 1, createdAt: '2026-09-30' },
  { id: 'extra-drone', weddingId: wedding.id, extraServiceId: 'service-drone', nameSnapshot: 'dron', priceSnapshot: 800, quantity: 2, createdAt: '2026-09-30' },
]
const authority = buildContractGenerationInput({ wedding, weddingPlaces: [], extras, generationDate: '2026-09-30' })
assert.equal(authority.commercial.contractValue.value, 13_250, 'hidden individual prices do not change the authoritative contract total')
assert.equal(authority.extras.reduce((sum, extra) => sum + extra.price.value * extra.quantity.value, 0), 2_500, 'all authoritative extra amounts and quantities remain available to arithmetic')

// Apply a synthetic name-only extra statement to the checked-in physical source DOCX.
const file = await readFile(fileURLToPath(new URL('./fixtures/source-video-standard.docx', import.meta.url)))
const sourceBytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
const source = await readSource(sourceBytes, 'source-video-standard.docx')
const sourceText = source.blocks.map((block) => block.text).join('\n')
assert.doesNotMatch(sourceText, /\bVHS\b|\bdron\b/i, 'the selected fixture does not already contain either synthetic extra')
const scope = source.blocks.find((block) => /przedmiot umowy/i.test(block.text))
assert.ok(scope, 'the physical source has a service-scope anchor')
const finalExtraText = 'Dodatkowo przedmiot Umowy obejmuje usługi VHS oraz dron.'
const packageScopeIndex = source.blocks.findIndex((block) => /pakiecie/i.test(block.text))
const generalPerformanceIndex = source.blocks.findIndex((block) => /wykonuje przedmiot umowy pojedynczo/i.test(block.text))
assert.ok(packageScopeIndex >= 0 && generalPerformanceIndex > packageScopeIndex, 'source has package scope followed by general performance terms')
const lastPackageDeliverable = source.blocks.slice(packageScopeIndex, generalPerformanceIndex).filter((block) => block.text.trim()).at(-1)
assert.ok(lastPackageDeliverable, 'source package scope includes deliverable content before general performance terms')
assert.notEqual(lastPackageDeliverable!.blockId, scope!.blockId, 'the generic service mention in event/location details is not the placement anchor')
const operation = { anchorBlockId: lastPackageDeliverable!.blockId, operation: 'INSERT_BLOCK_AFTER' as const, styleSourceBlockId: lastPackageDeliverable!.blockId, finalText: finalExtraText }
const candidateBytes = await applyBlockOperations(sourceBytes, [operation])
const candidate = await readSource(candidateBytes, 'synthetic-option-b-candidate.docx')
assert.deepEqual(await validateOptionBCandidate(sourceBytes, candidateBytes, source, candidate, [operation]), [], 'existing deterministic candidate validation still passes')
const insertedIndex = candidate.blocks.findIndex((block) => block.text === finalExtraText)
const candidatePackageScopeIndex = candidate.blocks.findIndex((block) => /pakiecie/i.test(block.text))
const candidateGeneralPerformanceIndex = candidate.blocks.findIndex((block) => /wykonuje przedmiot umowy pojedynczo/i.test(block.text))
assert.ok(insertedIndex > candidatePackageScopeIndex, 'extra follows the source-defined base package scope and deliverables')
assert.ok(insertedIndex < candidateGeneralPerformanceIndex, 'extra precedes subsequent general performance terms')
assert.deepEqual(candidate.blocks.filter((block) => block.blockId !== candidate.blocks[insertedIndex]?.blockId).map((block) => block.text), source.blocks.map((block) => block.text), 'surrounding source text and block order are unchanged')
assert.equal(candidate.blocks.filter((block) => block.text === finalExtraText).length, 1, 'one absent extra is represented once')
assert.doesNotMatch(finalExtraText, /\d|\bzł\b|\bszt\.?\b|\bx\s*\d/i, 'the synthetic source-absent extras contain names only')
assert.match(finalExtraText, /^Dodatkowo\b/, 'the sample uses neutral additive wording')
assert.doesNotMatch(finalExtraText, /niezależnie|mimo to|jednak/i, 'the sample does not use contrastive wording')

const [sourceZip, candidateZip] = await Promise.all([JSZip.loadAsync(sourceBytes), JSZip.loadAsync(candidateBytes)])
const sourceSettings = await sourceZip.file('word/settings.xml')!.async('string')
assert.match(sourceSettings, /<w:autoHyphenation\s+w:val="0"\/>/, 'the real source already disables document-level automatic hyphenation')
assert.equal(await candidateZip.file('word/settings.xml')!.async('string'), sourceSettings, 'document settings are preserved')
for (const part of Object.keys(candidateZip.files).filter((name) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(name))) {
  const xml = await candidateZip.file(part)!.async('string')
  const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? []
  assert.ok(paragraphs.length > 0, `${part} contains paragraphs`)
  for (const paragraph of paragraphs) assert.match(paragraph, /<w:suppressAutoHyphens\/>/, `${part} explicitly suppresses automatic hyphenation per paragraph`)
}
const sourceXml = await sourceZip.file('word/document.xml')!.async('string')
const candidateXml = await candidateZip.file('word/document.xml')!.async('string')
assert.equal((candidateXml.match(/<w:tbl\b/g) ?? []).length, (sourceXml.match(/<w:tbl\b/g) ?? []).length, 'tables remain intact')
assert.match(candidateXml, /<w:suppressAutoHyphens\/>/, 'source-copy candidate has explicit paragraph-level suppression')

console.log('PASS Option B extras presentation and DOCX hyphenation acceptance')
