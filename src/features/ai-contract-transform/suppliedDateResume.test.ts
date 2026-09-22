import assert from 'node:assert/strict'
import { buildGoldenScenarios } from './cg7/goldenScenarios'
import { buildContractTransformationDataset } from './transformationDataset'
import { resolveSemanticMappings, type SemanticMapping } from './semanticMapping'
import { executeSemanticMappings, type SemanticMappingExecutionResult } from './semanticMappingExecutor'
import type { ContractTransformationDataset, SuppliedDateValues } from './types'
import { extractCanonicalParagraphText } from '../documents/template/canonicalParagraph'
import { GOLDEN_SUPPLIED_DATE_VALUES } from './cg7/goldenSuppliedDateValues.fixture'

const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
const src = (blockId: string, text: string) => ({ blockId, paragraphXml: p(text) })
const scenario = buildGoldenScenarios().find((row) => row.caseId === 'G02')!
const dataset = buildContractTransformationDataset({ wedding: scenario.wedding, package: scenario.package, extras: scenario.extras, currentDate: '2026-11-05' })
assert.equal(GOLDEN_SUPPLIED_DATE_VALUES.length, 8, 'evaluation fixture contains exactly the approved eight values')

function mapping(sourceBlockId: string, concept: SemanticMapping['concept'], anchor: string, dateRole?: string): SemanticMapping {
  return {
    sourceBlockId,
    concept,
    anchor,
    ...(['ambiguous_date', 'fixed_date', 'dependent_date'].includes(concept) ? { dateRole: dateRole as never } : {}),
  } as SemanticMapping
}

function ground(mappings: SemanticMapping[], sources: Array<{ blockId: string; paragraphXml: string }>) {
  const result = resolveSemanticMappings({ mappings, sourceBlocks: sources })
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error(`grounding failed: ${result.code}`)
  return result.mappings
}

function run(
  mappings: SemanticMapping[],
  sources: Array<{ blockId: string; paragraphXml: string }>,
  canonicalDataset: ContractTransformationDataset = dataset,
  suppliedDateValues?: SuppliedDateValues,
): SemanticMappingExecutionResult {
  return executeSemanticMappings({
    resolvedMappings: ground(mappings, sources),
    canonicalDataset,
    sourceParagraphs: sources,
    ...(suppliedDateValues ? { suppliedDateValues } : {}),
  })
}

function textFor(result: SemanticMappingExecutionResult, blockId: string): string {
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error(`execution failed: ${result.code}`)
  const row = result.paragraphs.find((item) => item.blockId === blockId)
  assert.ok(row)
  return extractCanonicalParagraphText(row!.paragraphXml)
}

const sameRoleMappings = [
  mapping('first', 'ambiguous_date', '10.09.2027', 'other_contractual_date'),
  mapping('second', 'ambiguous_date', '11.09.2027', 'other_contractual_date'),
]
const sameRoleSources = [src('first', 'Pierwszy termin 10.09.2027 pozostaje opisany.'), src('second', 'Drugi termin 11.09.2027 pozostaje opisany.')]
const initial = run(sameRoleMappings, sameRoleSources)
assert.equal(initial.ok, false)
if (initial.ok || initial.code !== 'requires_user_input') throw new Error('expected initial date input request')
assert.equal(initial.requiresUserInputDates.length, 2)
const [firstRequest, secondRequest] = initial.requiresUserInputDates
assert.ok(firstRequest?.unresolvedDateId)
assert.ok(secondRequest?.unresolvedDateId)
assert.notEqual(firstRequest!.unresolvedDateId, secondRequest!.unresolvedDateId)
assert.equal(firstRequest!.documentStateId, secondRequest!.documentStateId)

const partial = run(sameRoleMappings, sameRoleSources, dataset, {
  documentStateId: initial.documentStateId,
  values: [{ unresolvedDateId: firstRequest!.unresolvedDateId, value: '2027-10-10' }],
})
assert.equal(partial.ok, false)
if (partial.ok || partial.code !== 'requires_user_input') throw new Error('incomplete supplied dates must remain blocked')
assert.deepEqual(partial.requiresUserInputDates.map((item) => item.unresolvedDateId), [secondRequest!.unresolvedDateId])
assert.equal('paragraphs' in partial, false, 'partial input emits no transformed output')

const complete = run(sameRoleMappings, sameRoleSources, dataset, {
  documentStateId: initial.documentStateId,
  values: [
    { unresolvedDateId: firstRequest!.unresolvedDateId, value: '2027-10-10' },
    { unresolvedDateId: secondRequest!.unresolvedDateId, value: '2027-11-03' },
  ],
})
assert.equal(textFor(complete, 'first'), 'Pierwszy termin 10.10.2027 pozostaje opisany.')
assert.equal(textFor(complete, 'second'), 'Drugi termin 03.11.2027 pozostaje opisany.')

const supplied = (id: string, value: string, state = initial.documentStateId): SuppliedDateValues => ({ documentStateId: state, values: [{ unresolvedDateId: id, value }] })
const unknown = run(sameRoleMappings, sameRoleSources, dataset, supplied('unknown-id', '2027-10-10'))
assert.equal(!unknown.ok && unknown.code, 'unknown_supplied_date_id')
assert.equal(!run(sameRoleMappings, sameRoleSources, dataset, supplied(firstRequest!.unresolvedDateId, '2027-02-31')).ok, true)
const impossible = run(sameRoleMappings, sameRoleSources, dataset, supplied(firstRequest!.unresolvedDateId, '2027-02-31'))
assert.equal(!impossible.ok && impossible.code, 'invalid_supplied_date_value')
const malformed = run(sameRoleMappings, sameRoleSources, dataset, supplied(firstRequest!.unresolvedDateId, 'next Friday'))
assert.equal(!malformed.ok && malformed.code, 'invalid_supplied_date_value')
const duplicate = run(sameRoleMappings, sameRoleSources, dataset, {
  documentStateId: initial.documentStateId,
  values: [
    { unresolvedDateId: firstRequest!.unresolvedDateId, value: '2027-10-10' },
    { unresolvedDateId: firstRequest!.unresolvedDateId, value: '2027-10-11' },
  ],
})
assert.equal(!duplicate.ok && duplicate.code, 'duplicate_supplied_date_id')
const staleState = run(sameRoleMappings, sameRoleSources, dataset, supplied(firstRequest!.unresolvedDateId, '2027-10-10', 'different-document-state'))
assert.equal(!staleState.ok && staleState.code, 'stale_supplied_date_values')
const changedSource = [src('first', 'Zmiana poza kotwicą; pierwszy termin 10.09.2027.'), sameRoleSources[1]!]
const staleDocument = run(sameRoleMappings, changedSource, dataset, supplied(firstRequest!.unresolvedDateId, '2027-10-10'))
assert.equal(!staleDocument.ok && staleDocument.code, 'stale_supplied_date_values')

const dependentSource = [src('dependent', 'Termin zależny 02.09.2027.')]
const dependentMapping = (amount: number): SemanticMapping => ({
  sourceBlockId: 'dependent', concept: 'dependent_date', anchor: '02.09.2027', dateRole: 'other_contractual_date',
  baseDateConcept: 'wedding_date', relation: { direction: 'after', amount, unit: 'calendar_days' },
})
const dependentInitial = run([dependentMapping(1)], dependentSource)
assert.equal(!dependentInitial.ok && dependentInitial.code, 'requires_user_input')
if (dependentInitial.ok || dependentInitial.code !== 'requires_user_input') throw new Error('expected dependent date request')
const changedMappingResume = run([dependentMapping(2)], dependentSource, dataset, {
  documentStateId: dependentInitial.documentStateId,
  values: [{ unresolvedDateId: dependentInitial.requiresUserInputDates[0]!.unresolvedDateId, value: '2027-12-15' }],
})
assert.equal(!changedMappingResume.ok && changedMappingResume.code, 'unknown_supplied_date_id', 'changed relation cannot reuse the old mapping request')

// The supplied mapping cannot retarget a canonical wedding or execution date.
const authoritySources = [src('wedding', 'Ślub 21 sierpnia 2027.'), src('execution', 'Zawarcie 4 marca 2027 roku.'), src('pending', 'Inny termin 01.12.2027.')]
const authorityMappings = [
  mapping('wedding', 'wedding_date', '21 sierpnia 2027'),
  mapping('execution', 'execution_date', '4 marca 2027 roku'),
  mapping('pending', 'ambiguous_date', '01.12.2027', 'other_contractual_date'),
]
const authorityInitial = run(authorityMappings, authoritySources)
assert.equal(!authorityInitial.ok && authorityInitial.code, 'requires_user_input')
if (authorityInitial.ok || authorityInitial.code !== 'requires_user_input') throw new Error('expected unrelated unresolved date')
const authorityResume = run(authorityMappings, authoritySources, dataset, {
  documentStateId: authorityInitial.documentStateId,
  values: [{ unresolvedDateId: authorityInitial.requiresUserInputDates[0]!.unresolvedDateId, value: '2027-12-15' }],
})
assert.equal(textFor(authorityResume, 'wedding'), 'Ślub 9 października 2027.')
assert.equal(textFor(authorityResume, 'execution'), 'Zawarcie 5 listopada 2026 roku.')

// If an unresolved role becomes CRM-authoritative, its former request ID is stale and cannot override it.
const paymentAndPending = [mapping('payment', 'final_payment_due_date', 'do 14 sierpnia 2027'), mapping('pending', 'ambiguous_date', '01.12.2027', 'other_contractual_date')]
const paymentSources = [src('payment', 'Płatność końcowa do 14 sierpnia 2027.'), src('pending', 'Inny termin 01.12.2027.')]
const paymentInitial = run(paymentAndPending, paymentSources)
assert.equal(!paymentInitial.ok && paymentInitial.code, 'requires_user_input')
if (paymentInitial.ok || paymentInitial.code !== 'requires_user_input') throw new Error('expected unresolved final payment')
const withFinalPayment = buildContractTransformationDataset({ wedding: { ...scenario.wedding, finalPaymentDueDate: '2027-09-11' }, package: scenario.package, extras: scenario.extras, currentDate: '2026-11-05' })
const becameAuthoritative = run(paymentAndPending, paymentSources, withFinalPayment, {
  documentStateId: paymentInitial.documentStateId,
  values: [{ unresolvedDateId: paymentInitial.requiresUserInputDates[0]!.unresolvedDateId, value: '2027-10-02' }],
})
assert.equal(!becameAuthoritative.ok && becameAuthoritative.code, 'unknown_supplied_date_id')
const crmFinal = run(paymentAndPending, paymentSources, withFinalPayment, {
  documentStateId: paymentInitial.documentStateId,
  values: [{ unresolvedDateId: paymentInitial.requiresUserInputDates[1]!.unresolvedDateId, value: '2027-12-15' }],
})
assert.equal(textFor(crmFinal, 'payment'), 'Płatność końcowa do 11 września 2027.')
assert.equal(textFor(crmFinal, 'pending'), 'Inny termin 15.12.2027.')

// Delivery authority follows the same protection, and the supplied value may not retarget it.
const deliveryMapping = mapping('delivery', 'delivery_due_date', '19.01.2028')
const deliverySource = [src('delivery', 'Materiał do 19.01.2028.'), src('pending', 'Termin dodatkowy 01.12.2027.')]
const deliveryAndPending = [deliveryMapping, mapping('pending', 'ambiguous_date', '01.12.2027', 'other_contractual_date')]
const deliveryInitial = run(deliveryAndPending, deliverySource)
assert.equal(!deliveryInitial.ok && deliveryInitial.code, 'requires_user_input')
if (deliveryInitial.ok || deliveryInitial.code !== 'requires_user_input') throw new Error('expected unresolved delivery')
const withDelivery = buildContractTransformationDataset({ wedding: { ...scenario.wedding, deliveryDueDate: '2028-01-25' }, package: scenario.package, extras: scenario.extras, currentDate: '2026-11-05' })
const deliveryOverride = run(deliveryAndPending, deliverySource, withDelivery, {
  documentStateId: deliveryInitial.documentStateId,
  values: [{ unresolvedDateId: deliveryInitial.requiresUserInputDates[0]!.unresolvedDateId, value: '2028-02-01' }],
})
assert.equal(!deliveryOverride.ok && deliveryOverride.code, 'unknown_supplied_date_id')
const crmDelivery = run(deliveryAndPending, deliverySource, withDelivery, {
  documentStateId: deliveryInitial.documentStateId,
  values: [{ unresolvedDateId: deliveryInitial.requiresUserInputDates[1]!.unresolvedDateId, value: '2027-12-15' }],
})
assert.equal(textFor(crmDelivery, 'delivery'), 'Materiał do 25.01.2028.')

// A deposit request becomes deterministically resolvable when its grounded execution date is present.
const depositAlone = [mapping('deposit', 'deposit_due_date', 'do 7 marca 2027')]
const depositSources = [src('execution', 'Umowę zawarto 4 marca 2027 roku.'), src('deposit', 'Zadatek należy wpłacić do 7 marca 2027.'), src('pending', 'Inny termin 01.12.2027.')]
const depositPending = [mapping('deposit', 'deposit_due_date', 'do 7 marca 2027'), mapping('pending', 'ambiguous_date', '01.12.2027', 'other_contractual_date')]
const depositInitial = run(depositAlone, [depositSources[1]!])
assert.equal(!depositInitial.ok && depositInitial.code, 'requires_user_input')
if (depositInitial.ok || depositInitial.code !== 'requires_user_input') throw new Error('expected deposit unresolved without source execution date')
const depositOldId = depositInitial.requiresUserInputDates[0]!.unresolvedDateId
const depositWithExecution = [mapping('execution', 'execution_date', '4 marca 2027 roku'), ...depositPending]
const depositResumeInitial = run(depositWithExecution, depositSources)
assert.equal(!depositResumeInitial.ok && depositResumeInitial.code, 'requires_user_input')
if (depositResumeInitial.ok || depositResumeInitial.code !== 'requires_user_input') throw new Error('expected only unrelated date to remain unresolved')
const depositRetarget = run(depositWithExecution, depositSources, dataset, {
  documentStateId: depositResumeInitial.documentStateId,
  values: [
    { unresolvedDateId: depositOldId, value: '2026-12-01' },
    { unresolvedDateId: depositResumeInitial.requiresUserInputDates[0]!.unresolvedDateId, value: '2027-12-15' },
  ],
})
assert.equal(!depositRetarget.ok && depositRetarget.code, 'unknown_supplied_date_id')
const depositSuccess = run(depositWithExecution, depositSources, dataset, {
  documentStateId: depositResumeInitial.documentStateId,
  values: [{ unresolvedDateId: depositResumeInitial.requiresUserInputDates[0]!.unresolvedDateId, value: '2027-12-15' }],
})
assert.equal(textFor(depositSuccess, 'deposit'), 'Zadatek należy wpłacić do 8 listopada 2026.')

// Evaluation values replace only the grounded span and retain the source "do" wording.
const wrappedMapping = [mapping('wrapped', 'final_payment_due_date', 'do 14 sierpnia 2027')]
const wrappedSource = [src('wrapped', 'Pozostała kwota jest wymagalna do 14 sierpnia 2027. Pozostałe postanowienia pozostają bez zmian.')]
const wrappedInitial = run(wrappedMapping, wrappedSource)
assert.equal(!wrappedInitial.ok && wrappedInitial.code, 'requires_user_input')
if (wrappedInitial.ok || wrappedInitial.code !== 'requires_user_input') throw new Error('expected wrapped unresolved payment date')
const wrappedResume = run(wrappedMapping, wrappedSource, dataset, {
  documentStateId: wrappedInitial.documentStateId,
  values: [{ unresolvedDateId: wrappedInitial.requiresUserInputDates[0]!.unresolvedDateId, value: '2027-10-02' }],
})
assert.equal(textFor(wrappedResume, 'wrapped'), 'Pozostała kwota jest wymagalna do 2 października 2027. Pozostałe postanowienia pozostają bez zmian.')

console.log('supplied date resume tests: PASS (deterministic; no provider calls)')
