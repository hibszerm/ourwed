import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Wedding } from '@/types/wedding'
import { emptyContractRecoveryExtraction } from './schema/extractionSchema'
import { normalizeContractRecoveryExtraction } from './normalizeExtraction'
import { APPLYABLE_FIELD_KEYS, applyDecisionsToProposal, buildRecoveryProposal } from './buildComparisonProposal'

function assert(value: boolean, message: string) {
  if (!value) throw new Error(message)
}
function equal(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
}

const wedding: Wedding = {
  id: 'source-contract-fixture',
  couple: { partner1: '', partner2: '', email: '', phone: '', city: '', venue: '' },
  date: '2027-06-12', status: 'active', workflowStage: 'contract', packageName: '',
  price: 0, depositAmount: 0, currency: 'PLN', packageItems: [],
  checklist: [], schedule: [], payments: [], finances: [],
  questionnaires: { contractData: { status: 'not_sent' }, weddingQuestionnaire: { status: 'not_sent' } },
  contract: { status: 'none' }, notes: [], deliverables: [], timeline: [],
  accentColor: '#000000', createdAt: '2026-01-01T00:00:00.000Z',
}
const extraction = emptyContractRecoveryExtraction()
extraction.wedding.weddingDate.value = '2027-06-12'
extraction.wedding.weddingDate.evidence = [{ quote: 'ślub 12 czerwca 2027' }]
extraction.finances.totalContractValue.value = 11400
extraction.finances.totalContractValue.evidence = [{ quote: 'łączna kwota 11 400 zł' }]
extraction.finances.depositAmount.value = 1000
extraction.finances.depositAmount.evidence = [{ quote: 'zaliczka 1 000 zł' }]
extraction.finances.currency.value = 'PLN'
extraction.finances.travelStatus.value = 'charged'
extraction.finances.travelAmount.value = 800
extraction.contractedPackage.name.value = 'Pakiet historyczny'
extraction.contractedPackage.basePrice.value = 9700
extraction.contractedPackage.coverageHours.value = 10
extraction.contractedPackage.deliveryDays.value = 120
extraction.additionalServices = [{ name: 'VHS', description: null, price: 900, currency: 'PLN', confidence: 0.95, evidence: [{ quote: 'VHS 900 zł' }], warnings: [] }]
extraction.noteEligibleFacts.value = 'Dodatkowa kopia filmu dla rodziców\nOdbiór materiałów osobiście'
const normalized = normalizeContractRecoveryExtraction(extraction)
const proposal = buildRecoveryProposal(wedding, normalized)

const missingPrice = proposal.fields.find((field) => field.fieldKey === 'finances.contractValue')!
equal(missingPrice.state, 'missing_current', 'empty CRM price is a proposal')
equal(missingPrice.selectedAction, 'use_extracted', 'empty CRM values default selected')

const sameExtraction = emptyContractRecoveryExtraction()
sameExtraction.wedding.weddingDate.value = wedding.date
const sameProposal = buildRecoveryProposal(wedding, normalizeContractRecoveryExtraction(sameExtraction))
equal(sameProposal.fields.find((field) => field.fieldKey === 'wedding.date')?.state, 'same', 'same value is a no-op')
equal(sameProposal.fields.find((field) => field.fieldKey === 'wedding.date')?.selectedAction, 'skip', 'same value is not selected')

const conflictWedding = { ...wedding, price: 10500 }
const conflictProposal = buildRecoveryProposal(conflictWedding, normalized)
const conflict = conflictProposal.fields.find((field) => field.fieldKey === 'finances.contractValue')!
equal(conflict.state, 'different', 'existing value is a conflict')
equal(conflict.selectedAction, 'keep_current', 'conflict defaults to current value')
const approvedConflict = applyDecisionsToProposal(conflictProposal,
  conflictProposal.fields.map((field) => ({ fieldKey: field.fieldKey, action: field.fieldKey === 'finances.contractValue' ? 'use_extracted' as const : field.selectedAction })), true)
equal(approvedConflict.fields.find((field) => field.fieldKey === 'finances.contractValue')?.selectedAction, 'use_extracted', 'explicit conflict approval is retained')
const deselected = applyDecisionsToProposal(conflictProposal,
  conflictProposal.fields.map((field) => ({ fieldKey: field.fieldKey, action: field.fieldKey === 'finances.contractValue' ? 'keep_current' as const : field.selectedAction })), true)
equal(deselected.fields.find((field) => field.fieldKey === 'finances.contractValue')?.selectedAction, 'keep_current', 'deselected conflict stays untouched')

equal(proposal.packageSnapshotProposal?.name, 'Pakiet historyczny', 'historical package has a wedding snapshot')
equal(proposal.packageSnapshotProposal?.basePrice, 9700, 'snapshot retains explicit base price')
equal(proposal.packageSnapshotProposal?.deliveryDays, 120, 'snapshot retains structured delivery days for deterministic Polish display')
equal(proposal.extraProposals[0]?.name, 'VHS', 'historical extra is proposed for this wedding')
equal(proposal.extraProposals[0]?.applicable, true, 'same-currency, priced extra is applicable')
equal(proposal.extraProposals[0]?.sourceIndex, 0, 'extra selection maps to source position')
equal(proposal.fields.find((field) => field.fieldKey === 'finances.contractValue')?.extractedValue, 11400, 'authoritative total is not recomposed with extras')
equal(proposal.fields.find((field) => field.fieldKey === 'finances.travelStatus')?.extractedValue, 'charged', 'explicit charged travel maps to existing status')
equal(proposal.fields.find((field) => field.fieldKey === 'finances.travelAmount')?.extractedValue, 800, 'explicit travel amount maps independently')
const includedTravel = emptyContractRecoveryExtraction()
includedTravel.finances.travelStatus.value = 'included'
const includedTravelProposal = buildRecoveryProposal(wedding, normalizeContractRecoveryExtraction(includedTravel))
equal(includedTravelProposal.fields.find((field) => field.fieldKey === 'finances.travelStatus')?.selectedAction, 'use_extracted', 'explicit included travel is selectable')
equal(includedTravelProposal.fields.find((field) => field.fieldKey === 'finances.travelAmount')?.extractedValue, null, 'included travel does not invent a fee')
const generalTravelClause = buildRecoveryProposal(wedding, normalizeContractRecoveryExtraction(emptyContractRecoveryExtraction()))
equal(generalTravelClause.fields.find((field) => field.fieldKey === 'finances.travelStatus')?.selectedAction, 'skip', 'no explicit travel commercial fact creates no fee')
const zeroChargedTravel = emptyContractRecoveryExtraction()
zeroChargedTravel.finances.travelStatus.value = 'charged'
zeroChargedTravel.finances.travelAmount.value = 0
equal(buildRecoveryProposal(wedding, normalizeContractRecoveryExtraction(zeroChargedTravel)).fields.find((field) => field.fieldKey === 'finances.travelStatus')?.state, 'invalid_extracted', 'zero charged travel is rejected by product rules')
equal(proposal.fields.find((field) => field.fieldKey === 'delivery.dueDate')?.extractedValue, '2027-10-10', 'relative deadline is calculated deterministically')
equal(proposal.noteProposals.length, 2, 'note-eligible facts remain independently selectable')
equal(proposal.noteProposals[0]?.sourceIndex, 0, 'note selection maps to original fact position')
assert(!APPLYABLE_FIELD_KEYS.has('finances.paymentTermsText'), 'unsupported payment text is not applyable')
assert(!APPLYABLE_FIELD_KEYS.has('document.contractNumber'), 'unsupported contract number is not applyable')
assert(!APPLYABLE_FIELD_KEYS.has('document.signingDate'), 'unsupported signing date is not applyable')

const migration = readFileSync(resolve('supabase/migrations/20261006214925_source_contract_atomic_apply.sql'), 'utf8')
const applyDateCastMigration = readFileSync(resolve('supabase/migrations/20261007101456_source_contract_apply_date_casts.sql'), 'utf8')
const service = readFileSync(resolve('src/features/wedding-contract-recovery/recoveryService.ts'), 'utf8')
const repository = readFileSync(resolve('src/features/wedding-contract-recovery/repository.ts'), 'utf8')
const recoveryPage = readFileSync(resolve('src/pages/WeddingContractRecoveryPage.tsx'), 'utf8')
assert(migration.includes('security invoker'), 'RPC runs with caller privileges')
assert(migration.includes('auth.uid()') && migration.includes('v_source.wedding_id <> p_wedding_id'), 'owner and recovery/source/wedding bindings are checked')
assert(migration.includes('related_state_snapshot is distinct from v_related'), 'concurrent extra/place edits reject Apply')
assert(migration.includes('pg_advisory_xact_lock'), 'related writes share the Apply concurrency lock')
assert(migration.includes('raise exception') && migration.includes('CONTRACT_RECOVERY_INVALID_DECISIONS'), 'invalid selected values fail the whole transaction')
assert(migration.includes('lower(regexp_replace(btrim(wes.name_snapshot)') && migration.includes('price_snapshot'), 'existing identical extras are deduplicated')
assert(migration.includes('insert into public.notes') && migration.includes('array_to_string(v_notes'), 'selected note facts create one note')
assert(!/update public\.weddings[\s\S]*?package_items_snapshot\s*=/.test(migration), 'package application does not overwrite live package items')
assert(!/update public\.weddings[\s\S]*?coverage_hours\s*=/.test(migration), 'package application does not overwrite live coverage')
assert(!/from\('wedding_questionnaires'\)|persistWeddingContractAnswerFields/.test(service), 'Apply does not write questionnaire answers')
assert(!/from\('payments'\)|paid_at/.test(migration), 'contract deposit does not create or mark a payment')
assert(migration.includes("contract_value = coalesce((v_patch->>'contract_value')::numeric, w.contract_value)"), 'contract total is written only as its explicit value')
assert(migration.includes('wedding_contract_package_snapshots') && !/insert into public\.packages\b/.test(migration), 'historical package stays outside the global catalogue')
assert(service.includes("'apply_wedding_contract_recovery'"), 'browser Apply uses the atomic RPC')
assert(recoveryPage.includes('setRecoveryId(result.id)') && recoveryPage.includes('recoveryId,\n        weddingId,'), 'the recovery reviewed from analysis is the recovery submitted by Apply')
assert(service.includes('p_recovery_id: input.recoveryId') && service.includes('p_source_contract_id: input.sourceContractId') && service.includes('p_wedding_id: input.weddingId'), 'Apply passes its reviewed recovery/source/wedding IDs directly to the atomic RPC')
assert(applyDateCastMigration.includes("wedding_date = coalesce((v_patch->>'wedding_date')::date, w.wedding_date)"), 'Apply casts the extracted wedding date before coalescing with the date column')
assert(applyDateCastMigration.includes("final_payment_due_date = coalesce((v_patch->>'final_payment_due_date')::date, w.final_payment_due_date)"), 'Apply casts the extracted payment deadline before coalescing with the date column')
assert(applyDateCastMigration.includes('v_recovery.user_id <> v_uid') && applyDateCastMigration.includes('v_recovery.source_contract_id <> p_source_contract_id') && applyDateCastMigration.includes('v_source.wedding_id <> p_wedding_id'), 'date fix preserves owner and recovery/source/wedding guards')
assert(applyDateCastMigration.includes('v_recovery.superseded_by_id is not null') && applyDateCastMigration.includes("v_recovery.status <> 'ready_for_review'"), 'date fix preserves current recovery lifecycle guards')
assert(service.includes("error.code === '42804'") && service.includes("'rpc_type_mismatch'"), 'SQL type mismatch remains a safe internal Apply diagnostic')
assert(service.includes("'CONTRACT_RECOVERY_APPLY_FAILED'") && !/throw new ContractRecoveryError\('CONTRACT_RECOVERY_NOT_FOUND'\)\s*\n\s*\}/.test(service), 'unexpected RPC errors are not mislabeled as a missing analysis')
assert(!/weddingPlaceService|geocode|persistWeddingContractAnswerFields/.test(service), 'Apply avoids geocoding and broad synchronization')
assert(service.indexOf('findSourceContractByContentHash') < service.indexOf('documentStorage.upload'), 'exact duplicate source is rejected before storage upload')
assert(repository.includes(".eq('wedding_id', weddingId)") && repository.includes(".eq('content_hash', contentHash)"), 'duplicate check is exact and wedding-scoped')
assert(!/supersededById: previous\?\.id/.test(service) && service.includes('supersededById: recovery.id'), 'reanalyzing preserves one latest attempt without a cycle')

console.log('PASS Source Contract final hardening acceptance')
