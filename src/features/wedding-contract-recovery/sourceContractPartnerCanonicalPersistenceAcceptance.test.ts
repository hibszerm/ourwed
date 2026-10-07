import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mapWeddingRowToModel, type WeddingRow } from '@/lib/api/weddings/weddingMappers'
import { mergeFormAnswersIntoWeddingCore } from '@/lib/forms/mergeFormAnswersIntoWeddingCore'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getContactSections, resolveWeddingContractAddress } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'

const migrationPath = 'supabase/migrations/20261007170000_source_contract_apply_partner_answers.sql'
const migration = await readFile(`${process.cwd()}/${migrationPath}`, 'utf8')

assert.match(migration, /security invoker/i)
assert.match(migration, /revoke all on function public\.apply_wedding_contract_recovery[\s\S]*from public, anon/i)
assert.match(migration, /grant execute on function public\.apply_wedding_contract_recovery[\s\S]*to authenticated/i)
assert.match(migration, /fi\.user_id = v_uid[\s\S]*fi\.status in \('submitted', 'approved'\)[\s\S]*f\.category = 'contract'[\s\S]*for update of fi/i)
assert.match(migration, /jsonb_typeof\(fa\.answer_json\) = 'object'[\s\S]*'fields',[\s\S]*v_form_fields[\s\S]*'values',[\s\S]*v_form_values/i)
assert.match(migration, /'partner1\.fullName'[\s\S]*'partner1\.firstName'[\s\S]*'partner1\.lastName'/)
assert.match(migration, /'partner1\.phone'[\s\S]*'q-p1-phone'[\s\S]*'sys_p1_phone'/)
assert.match(migration, /'partner1\.addressLine'[\s\S]*'partner1\.address'[\s\S]*'q-p1-address'[\s\S]*'sys_p1_address'/)
assert.match(migration, /'partner1\.postalCode'[\s\S]*'q-p1-postal'/)
assert.match(migration, /'partner1\.city'[\s\S]*'q-p1-city'/)
assert.match(migration, /'partner2\.fullName'[\s\S]*'partner2\.firstName'[\s\S]*'partner2\.lastName'/)
assert.match(migration, /'partner2\.phone'[\s\S]*'q-p2-phone'[\s\S]*'sys_p2_phone'/)
assert.match(migration, /'partner2\.email'[\s\S]*'q-p2-email'[\s\S]*'sys_p2_email'/)
assert.match(migration, /CONTRACT_RECOVERY_WEDDING_CHANGED/)
assert.match(migration, /v_recovery\.user_id <> v_uid[\s\S]*v_recovery\.wedding_id <> p_wedding_id[\s\S]*v_recovery\.source_contract_id <> p_source_contract_id/)
assert.match(migration, /v_recovery\.related_state_snapshot is distinct from v_related/)
assert.match(migration, /package_name = coalesce\(v_patch->>'package_name', w\.package_name\)/)
assert.match(migration, /wedding_date = coalesce\(\(v_patch->>'wedding_date'\)::date, w\.wedding_date\)/)
assert.match(migration, /ceremony_location'[\s\S]*'venue'[\s\S]*contract_value'/)
assert.equal((migration.match(/create table/gi) ?? []).length, 0, 'no new business table')
assert.equal((migration.match(/apply_wedding_contract_recovery/gi) ?? []).length, 3)
assert.match(migration, /update public\.wedding_contract_recoveries set status = 'applying'[\s\S]*update public\.weddings w set[\s\S]*update public\.form_answers fa set[\s\S]*update public\.wedding_source_contracts set status = 'applied'[\s\S]*update public\.wedding_contract_recoveries set status = 'applied'/, 'canonical and questionnaire writes remain inside one atomic RPC')

const row = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: 'owner',
  bride_name: 'Karolina Kuś',
  groom_name: 'Andrzej Nowacki',
  email: 'unchanged@example.test',
  phone: 'old-phone',
  groom_phone: 'partner2-phone',
  contract_address: 'old street',
  contract_postal_code: '00-001',
  contract_city: 'Old City',
  wedding_date: '2026-11-01',
  ceremony_time: null,
  venue: 'Old reception',
  status: 'active',
  workflow_stage: 'contract',
  package_name: 'Old package',
  package_id: null,
  contract_value: 13200,
  deposit_amount: 0,
  currency: 'PLN',
  accent_color: null,
  created_at: '2026-10-01',
  updated_at: '2026-10-01',
} as WeddingRow

const updated = mapWeddingRowToModel({
  ...row,
  bride_name: 'Iryna Malashchenko',
  phone: '+48 578 215 378',
  contract_address: 'Piotra Skargi 21/49',
  contract_postal_code: '06-500',
  contract_city: 'Mława',
  wedding_date: '2027-05-21',
  venue: 'Pałacu Rozalin',
  package_name: 'Pakiet Video Standard',
  contract_value: 11100,
} as WeddingRow)
const hydrated = await mergeFormAnswersIntoWeddingCore(updated, {
  fields: {
    'partner1.firstName': 'Iryna',
    'partner1.lastName': 'Malashchenko',
    'partner1.phone': '+48 578 215 378',
    'partner1.address': 'Piotra Skargi 21/49',
    'partner1.postalCode': '06-500',
    'partner1.city': 'Mława',
    'partner1.email': 'unchanged@example.test',
  },
})

assert.equal(hydrated.couple.partner1, 'Iryna Malashchenko', 'header and couple card use the approved name after normal hydration')
assert.equal(hydrated.couple.partner1FirstName, 'Iryna', 'edit form first name comes from canonical selected identity')
assert.equal(hydrated.couple.partner1LastName, 'Malashchenko', 'edit form last name comes from canonical selected identity')
assert.equal(hydrated.couple.partner1Phone, '+48 578 215 378', 'couple card and edit form use selected phone')
assert.equal(getWeddingDisplayName(hydrated), 'Iryna Malashchenko i Andrzej Nowacki', 'normal wedding header derives from the updated canonical couple')
assert.equal(getContactSections(hydrated.couple)[0].name, 'Iryna Malashchenko', 'Para card derives from the updated canonical couple')
assert.equal(getContactSections(hydrated.couple)[0].phone, '+48 578 215 378', 'Para card contact uses the updated canonical phone')
assert.equal(resolveWeddingContractAddress(hydrated), 'Piotra Skargi 21/49, 06-500 Mława', 'normal edit modal resolves the selected contract address')
assert.equal(hydrated.couple.partner2, 'Andrzej Nowacki', 'partner 2 remains unchanged')
assert.equal(hydrated.couple.partner2Phone, 'partner2-phone', 'partner 2 phone remains unchanged')
assert.equal(hydrated.couple.partner1Email, 'unchanged@example.test', 'unselected email remains unchanged')
assert.equal(hydrated.contractAddress, 'Piotra Skargi 21/49, 06-500 Mława', 'edit form contract address reads the selected components')
assert.equal(hydrated.date, '2027-05-21', 'wedding date remains correct')
assert.equal(hydrated.couple.venue, 'Pałacu Rozalin', 'reception compatibility value remains correct')
assert.equal(hydrated.packageName, 'Pakiet Video Standard', 'package remains correct')
assert.equal(hydrated.price, 11100, 'contract value remains correct')

const editPersistence = await readFile(`${process.cwd()}/src/features/weddings/edit/persistWeddingEditDraft.ts`, 'utf8')
assert.match(editPersistence, /await weddingService\.update\(nextWedding/)
assert.match(editPersistence, /await persistWeddingContractAnswerFields\(nextWedding/)
const hydration = await readFile(`${process.cwd()}/src/lib/api/weddings/weddingHydrate.ts`, 'utf8')
assert.match(hydration, /hydrateWeddingFromContractForm[\s\S]*getLatestSubmittedFormAnswerRecord[\s\S]*mergeFormAnswersIntoWedding/)

console.log('PASS Source Contract canonical partner persistence acceptance')
