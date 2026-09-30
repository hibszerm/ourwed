import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { applyBlockOperations } from './blockDocxEditor'
import { buildContractGenerationInput, type ContractGenerationInputOptions } from './contractGenerationInput'
import { resolveAuthorityRef, readSource, validateAuthorityGate, validateCandidate, type FactAuthority, type PlanResult, type SourceInventory } from './generator'

const caseDirectory = `${process.cwd()}/src/features/contract-generation-spike/multi-template-acceptance/cases/case-04-realistic-wedding-photographer`
const fixture = JSON.parse(await readFile(`${caseDirectory}/input.json`, 'utf8')) as { authoritativeInput: ContractGenerationInputOptions; expectedProductRules: Record<string, unknown> }
const normalized = buildContractGenerationInput(fixture.authoritativeInput)
const sourceBytesRaw = await readFile(`${caseDirectory}/source.docx`)
const sourceBytes = sourceBytesRaw.buffer.slice(sourceBytesRaw.byteOffset, sourceBytesRaw.byteOffset + sourceBytesRaw.byteLength)
const sourceDocument = await readSource(sourceBytes, 'source.docx')
const validationContext = { sourceDocument, productRules: fixture.expectedProductRules }

function resolved(kind: FactAuthority['kind'], ref: string) {
  const result = resolveAuthorityRef(normalized, { kind, ref })
  assert.ok(result, `expected exact authority ref to resolve: ${kind}:${ref}`)
  return result
}

function assertGate(ref: string, value: string, kind: FactAuthority['kind'] = 'crm'): void {
  const sourceBlock = sourceDocument.blocks.find((block) => block.text.trim())!
  const inventory: SourceInventory = { items: [{ id: 'authority-test-item', label: 'source fact', occurrences: [{ sourceRef: sourceBlock.blockId, quote: null }] }] }
  const plan: PlanResult = {
    status: 'READY', missingInputs: [], conflicts: [], retainedLiterals: [], operations: [{ blockId: sourceBlock.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: value }],
    factChanges: [{ label: 'planner-declared meaning', inventoryItemIds: ['authority-test-item'], newValue: value, newValueFormat: 'literal', authority: { kind, ref } }],
  }
  assert.deepEqual(validateAuthorityGate(normalized, inventory, plan, validationContext), [], `authority ${kind}:${ref} should pass by exact normalized value`)
}

const p1 = normalized.parties.find((party) => party.sourceKey === 'partner1')!
const p2 = normalized.parties.find((party) => party.sourceKey === 'partner2')!
assert.equal(resolved('crm', p1.fullName!.source).value, 'Klaudia Majewska')
assert.equal(resolved('crm', p1.fullName!.source).owner, 'partner1')
assert.equal(resolved('crm', p1.address!.source).value, 'ul. Francuska 18/7, 40-015 Katowice')
assert.equal(resolved('crm', p1.address!.source).owner, 'partner1')
assert.equal(resolved('crm', p1.phone!.source).value, '+48 510 284 739')
assert.equal(resolved('crm', p1.phone!.source).owner, 'partner1')
assert.equal(resolved('crm', p1.email!.source).value, 'klaudia.majewska@example.com')
assert.equal(resolved('crm', p1.email!.source).owner, 'partner1')
assert.equal(resolved('crm', p2.fullName!.source).value, 'Tomasz Domański')
assert.equal(resolved('crm', p2.fullName!.source).owner, 'partner2')
assert.equal(resolved('crm', p2.address!.source).value, 'ul. Słoneczna 12/5, 43-300 Bielsko-Biała')
assert.equal(resolved('crm', p2.address!.source).owner, 'partner2')
assert.equal(resolved('crm', p2.phone!.source).value, '+48 606 391 825')
assert.equal(resolved('crm', p2.phone!.source).owner, 'partner2')
assert.equal(resolved('crm', p2.email!.source).value, 'tomasz.domanski@example.com')
assert.equal(resolved('crm', p2.email!.source).owner, 'partner2')

assertGate(p1.fullName!.source, 'Klaudia Majewska')
assertGate(p1.address!.source, 'ul. Francuska 18/7, 40-015 Katowice')
assertGate(p2.address!.source, 'ul. Słoneczna 12/5, 43-300 Bielsko-Biała')
assert.equal(resolved('crm', normalized.wedding.date.source).value, '2028-05-22')
assertGate(normalized.wedding.date.source, '2028-05-22')
const copiedWeddingDateSource = normalized.wedding.date.source
assert.equal(copiedWeddingDateSource, 'public.weddings.wedding_date', 'the planner copies the canonical source string byte-for-byte')
const weddingDateBlock = sourceDocument.blocks.find((block) => block.blockId === 'word/document.xml#p22')!
const weddingDateInventory: SourceInventory = { items: [{ id: 'event-date', label: 'Wedding event date', occurrences: [{ sourceRef: weddingDateBlock.blockId, quote: '14 sierpnia 2027 r.' }] }] }
const weddingDateOperation = { blockId: weddingDateBlock.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: weddingDateBlock.text.replace('14 sierpnia 2027 r.', '22 maja 2028 r.') }
const weddingDatePlan: PlanResult = {
  status: 'READY', missingInputs: [], conflicts: [], retainedLiterals: [],
  factChanges: [{ label: 'Wedding event date', inventoryItemIds: ['event-date'], newValue: '2028-05-22', newValueFormat: 'literal', authority: { kind: 'crm', ref: copiedWeddingDateSource } }],
  operations: [weddingDateOperation],
}
assert.deepEqual(validateAuthorityGate(normalized, weddingDateInventory, weddingDatePlan, validationContext), [], 'a byte-for-byte copied normalized source is accepted')
for (const alias of ['wedding.wedding_date', 'wedding.weddingDate', 'crm:wedding.wedding_date', 'crm:wedding.weddingDate']) {
  assert.equal(resolveAuthorityRef(normalized, { kind: 'crm', ref: alias }), undefined, `${alias} is not translated as an authority alias`)
  const aliasPlan = { ...weddingDatePlan, factChanges: [{ ...weddingDatePlan.factChanges[0]!, authority: { kind: 'crm' as const, ref: alias } }] }
  assert.ok(validateAuthorityGate(normalized, weddingDateInventory, aliasPlan, validationContext).some((issue) => /Invalid (canonical )?authority reference/.test(issue)), `${alias} is rejected by the strict authority gate`)
}
assert.equal(resolved('generation_date', 'generationDate').value, '2028-02-04')
assertGate('generationDate', '2028-02-04', 'generation_date')
assert.equal(resolved('crm', normalized.commercial.contractValue.source).value, '10600')
assert.equal(resolved('crm', normalized.commercial.agreedDeposit.source).value, '2000')
assertGate(normalized.commercial.contractValue.source, '10600')
assertGate(normalized.commercial.agreedDeposit.source, '2000')
assert.equal(resolved('derived', 'commercial.remainingAfterDeposit').value, '8600')
assert.equal(resolved('derived', 'commercial.remainingToPayNow').value, '10600')
assertGate('commercial.remainingAfterDeposit', '8600', 'derived')
assertGate('commercial.remainingToPayNow', '10600', 'derived')
assert.equal(resolved('crm', normalized.commercial.finalPaymentDueDate!.source).value, '2028-05-15')
assert.equal(normalized.commercial.finalPaymentTerms, undefined)
assert.equal(resolved('crm', normalized.commercial.travelFeeStatus.source).value, 'included')
assert.equal(resolved('crm', normalized.commercial.travelFeeAmount.source).value, '0')
assertGate(normalized.commercial.finalPaymentDueDate!.source, '2028-05-15')
assert.equal(resolved('crm', normalized.package.name.source).value, 'REPORTAŻ PEŁNY')
assert.equal(resolved('crm', normalized.package.items.source).value, JSON.stringify(normalized.package.items.value))
assertGate(normalized.package.name.source, 'REPORTAŻ PEŁNY')
for (const location of normalized.locations) {
  assert.equal(resolved('crm', location.role.source).value, location.role.value)
  assert.equal(resolved('crm', location.formattedAddress.source).value, location.formattedAddress.value)
}
assert.equal(normalized.locations.map(({ role }) => role.value).join(','), 'bride_preparation,groom_preparation,ceremony,reception')
assert.equal(resolved('crm', normalized.wedding.status.source).value, 'active')
assert.equal(resolved('crm', normalized.wedding.workflowStage.source).value, 'contract')
assert.equal(resolved('crm', normalized.wedding.id.source).value, normalized.wedding.id.value)
assert.equal(resolved('crm', normalized.generationContext.contractStatus.source).value, 'none')

for (const answer of normalized.additionalAnswers) {
  const match = resolved('user', answer.id)
  assert.equal(match.value, answer.value)
  assert.equal(match.source, answer.source)
}
assertGate('agreement.identifier', '01/2028', 'user')
assert.equal(resolveAuthorityRef(normalized, { kind: 'user', ref: 'custom.missing.answer' }), undefined)
assert.equal(resolveAuthorityRef(normalized, { kind: 'crm', ref: 'parties.partner1.address' }), undefined)
assert.equal(resolveAuthorityRef(normalized, { kind: 'crm', ref: 'public.weddings.partner3' }), undefined)
assert.equal(resolveAuthorityRef(normalized, { kind: 'crm', ref: 'locations[999].formattedAddress' }), undefined)
assert.equal(resolveAuthorityRef(normalized, { kind: 'crm', ref: 'crm:public.weddings.wedding_date' }), undefined)

const unowned = { value: 'Correspondence only, 99 Sample Road', source: 'public.weddings.contract_address' }
const withUnowned = structuredClone(normalized)
withUnowned.unownedFacts = [unowned]
const unownedResolution = resolveAuthorityRef(withUnowned, { kind: 'crm', ref: unowned.source })
assert.deepEqual(unownedResolution, { value: unowned.value, source: unowned.source })
assert.equal(resolveAuthorityRef(withUnowned, { kind: 'crm', ref: 'parties.partner1.address' }), undefined)

const withoutPartner2AddressOptions = structuredClone(fixture.authoritativeInput)
delete withoutPartner2AddressOptions.questionnaireFields?.['partner2.address']
const withoutPartner2Address = buildContractGenerationInput(withoutPartner2AddressOptions)
assert.equal(withoutPartner2Address.parties.find((party) => party.sourceKey === 'partner2')?.address, undefined)
assert.equal(resolveAuthorityRef(withoutPartner2Address, { kind: 'crm', ref: 'form_answers.answer_json.fields.partner2.address.formattedAddress' }), undefined)

const ambiguous = structuredClone(normalized)
ambiguous.parties[1]!.fullName = { ...ambiguous.parties[1]!.fullName!, source: p1.fullName!.source }
assert.equal(resolveAuthorityRef(ambiguous, { kind: 'crm', ref: p1.fullName!.source }), undefined, 'duplicate provenance refs are rejected as ambiguous')

const wrongPartyBlock = sourceDocument.blocks.find((block) => block.text.trim())!
const wrongPartyInventory: SourceInventory = { items: [{ id: 'wrong-party', label: 'planner-declared party 2 fact', occurrences: [{ sourceRef: wrongPartyBlock.blockId, quote: null }] }] }
const wrongPartyPlan: PlanResult = {
  status: 'READY', missingInputs: [], conflicts: [], retainedLiterals: [], operations: [],
  factChanges: [{ label: 'planner-declared party 2 address', inventoryItemIds: ['wrong-party'], newValue: p2.address!.value, newValueFormat: 'literal', authority: { kind: 'crm', ref: p1.address!.source } }],
}
assert.ok(validateAuthorityGate(normalized, wrongPartyInventory, wrongPartyPlan, validationContext).some((issue) => /does not match its declared authority/.test(issue)))

const secondOptions = structuredClone(fixture.authoritativeInput)
secondOptions.wedding.id = 'synthetic-authority-input-two'
secondOptions.wedding.couple.partner1 = 'Nela Wiśniewska'
secondOptions.wedding.couple.partner2 = 'Jan Borowski'
delete secondOptions.questionnaireFields?.['partner2.address']
secondOptions.genericContractAddress = 'Korespondencja wyłącznie, ul. Próbna 1'
secondOptions.wedding.price = 15500
secondOptions.wedding.depositAmount = 3500
secondOptions.wedding.packageName = 'PAKIET KAMERALNY'
secondOptions.wedding.packageItems = [{ title: 'Zakres próbny', sortOrder: 0, enabled: true }]
secondOptions.extras = [{ id: 'synthetic-extra-1', weddingId: secondOptions.wedding.id, extraServiceId: 'service-1', nameSnapshot: 'Album próbny', quantity: 2, priceSnapshot: 750, createdAt: '2028-01-01T00:00:00.000Z' }]
secondOptions.contractRecordId = 'internal-record-id-only'
secondOptions.weddingPlaces = secondOptions.weddingPlaces.slice(0, 1).map((place) => ({ ...place, role: 'ceremony' as const, label: 'Urząd Stanu Cywilnego' }))
secondOptions.userProvidedAnswers = [{ id: 'custom.required.fact', value: 'wartość użytkownika' }]
const second = buildContractGenerationInput(secondOptions)
const secondP1 = second.parties.find((party) => party.sourceKey === 'partner1')!
const secondP2 = second.parties.find((party) => party.sourceKey === 'partner2')!
assert.equal(resolveAuthorityRef(second, { kind: 'crm', ref: secondP1.fullName!.source })?.value, 'Nela Wiśniewska')
assert.equal(resolveAuthorityRef(second, { kind: 'crm', ref: secondP1.address!.source })?.owner, 'partner1')
assert.equal(secondP2.address, undefined)
assert.equal(resolveAuthorityRef(second, { kind: 'crm', ref: 'form_answers.answer_json.fields.partner2.address.formattedAddress' }), undefined)
assert.equal(resolveAuthorityRef(second, { kind: 'user', ref: 'custom.required.fact' })?.value, 'wartość użytkownika')
assert.equal(second.commercial.contractValue.value, 15500)
assert.equal(second.commercial.agreedDeposit.value, 3500)
assert.equal(second.package.name.value, 'PAKIET KAMERALNY')
const secondExtra = second.extras[0]!
assert.equal(resolveAuthorityRef(second, { kind: 'crm', ref: secondExtra.id.source })?.value, 'synthetic-extra-1')
assert.equal(resolveAuthorityRef(second, { kind: 'crm', ref: secondExtra.name.source })?.value, 'Album próbny')
assert.equal(resolveAuthorityRef(second, { kind: 'crm', ref: secondExtra.quantity.source })?.value, '2')
assert.equal(resolveAuthorityRef(second, { kind: 'crm', ref: secondExtra.price.source })?.value, '750')
assert.equal(resolveAuthorityRef(second, { kind: 'crm', ref: second.generationContext.contractRecordId!.source })?.value, 'internal-record-id-only')
assert.equal(second.locations.length, 1)
assert.equal(second.locations[0]?.role.value, 'ceremony')
assert.equal(resolveAuthorityRef(second, { kind: 'crm', ref: second.unownedFacts[0]!.source })?.owner, undefined)
assert.equal(resolveAuthorityRef(second, { kind: 'user', ref: 'agreement.identifier' }), undefined, 'an internal contract record ID is not an agreement answer')

const oldFirstText = sourceDocument.blocks.find((block) => block.text.trim())!
const inventory: SourceInventory = { items: [{ id: 'candidate-owner', label: 'party fact', occurrences: [{ sourceRef: oldFirstText.blockId, quote: null }] }] }
const candidatePlan: PlanResult = {
  status: 'READY', missingInputs: [], conflicts: [], retainedLiterals: [],
  factChanges: [{ label: 'party fact', inventoryItemIds: ['candidate-owner'], newValue: p1.fullName!.value, newValueFormat: 'literal', authority: { kind: 'crm', ref: p1.fullName!.source } }],
  operations: [{ blockId: oldFirstText.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: p1.fullName!.value }],
}
const candidateBytes = await applyBlockOperations(sourceBytes, candidatePlan.operations)
assert.deepEqual(await validateCandidate(sourceBytes, candidateBytes, normalized, inventory, candidatePlan, candidatePlan.operations, validationContext), [], 'candidate validation reuses normalized authority resolution')

// One semantic price change covers numeric and written-out occurrences; operations carry their rendered forms.
const priceBlock = sourceDocument.blocks.find((block) => block.text.includes('9 800,00 zł') && block.text.includes('dziewięć tysięcy osiemset złotych 00/100'))!
const priceInventory: SourceInventory = { items: [{ id: 'total-contract-price', label: 'Total contract price', occurrences: [
  { sourceRef: priceBlock.blockId, quote: '9 800,00 zł' },
  { sourceRef: priceBlock.blockId, quote: 'dziewięć tysięcy osiemset złotych 00/100' },
] }] }
const priceOperation = {
  blockId: priceBlock.blockId,
  operation: 'REPLACE_BLOCK_TEXT' as const,
  finalText: priceBlock.text.replace('9 800,00 zł', '10 600,00 zł').replace('dziewięć tysięcy osiemset złotych 00/100', 'dziesięć tysięcy sześćset złotych 00/100'),
}
const onePriceFactChange: PlanResult['factChanges'][number] = {
  label: 'Total contract price', inventoryItemIds: ['total-contract-price'], newValue: '10 600,00 zł', newValueFormat: 'literal',
  authority: { kind: 'crm', ref: normalized.commercial.contractValue.source },
}
const onePriceChangePlan: PlanResult = { status: 'READY', missingInputs: [], conflicts: [], factChanges: [onePriceFactChange], retainedLiterals: [], operations: [priceOperation] }
assert.deepEqual(validateAuthorityGate(normalized, priceInventory, onePriceChangePlan, validationContext), [], 'one semantic price change covers both numeric and written source occurrences')
const duplicatePricePlan: PlanResult = {
  ...onePriceChangePlan,
  factChanges: [onePriceFactChange, {
    ...onePriceFactChange, label: 'Total contract price in words', newValue: 'dziesięć tysięcy sześćset złotych 00/100', newValueFormat: 'polish_pln_words',
  }],
}
assert.ok(validateAuthorityGate(normalized, priceInventory, duplicatePricePlan, validationContext).some((issue) => issue.includes('multiple planner dispositions: total-contract-price')), 'two factChanges for the same item remain rejected')
const editedPrice = await applyBlockOperations(sourceBytes, [priceOperation])
assert.deepEqual(await validateCandidate(sourceBytes, editedPrice, normalized, priceInventory, onePriceChangePlan, [priceOperation], validationContext), [], 'separate occurrence rendering stays in the complete block operation and operation coverage passes')
assert.match(priceOperation.finalText, /10 600,00 zł.*dziesięć tysięcy sześćset złotych 00\/100/)

const generatorSource = await readFile(`${process.cwd()}/src/features/contract-generation-spike/generator.ts`, 'utf8')
assert.doesNotMatch(generatorSource, /case-04|case04|PESEL|agreement\.identifier|parseFlexible.*(?:address|party)|partyName.*includes/i)
assert.match(generatorSource, /authority\.ref to the selected normalized input fact's \.source copied byte-for-byte as an opaque identifier/)
assert.doesNotMatch(generatorSource, /alias map|authority alias|legacy authority translation/i)
console.log('PASS normalized provenance authority resolver acceptance')
