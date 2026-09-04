/**
 * Phase 1 — canonical contract-party storage + truthful questionnaire persist.
 * Run: npm run test:wedding-contract-party
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  mapWeddingModelToRow,
  mapWeddingRowToModel,
  type WeddingRow,
} from '@/lib/api/weddings/weddingMappers'
import { mergeFormAnswersIntoWedding } from '@/lib/forms/mergeFormAnswersIntoWedding'
import { planStudioContractAnswerPersist } from '@/lib/forms/persistWeddingContractAnswers'
import { buildNewWeddingCreatePayload } from '@/features/weddings/buildNewWeddingCreatePayload'
import { evaluateWeddingContractReadiness } from '@/lib/utils/weddingContractReadiness'
import { buildContractDataSnapshot } from '@/features/ai-contract-lab/buildContractDataSnapshot'
import type { FormAnswerJson } from '@/types/formEngine'
import type { CreateWeddingInput, Wedding } from '@/types/wedding'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

function assertIncludes(src: string, needle: string, message: string) {
  assert(src.includes(needle), `${message}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, message: string) {
  assert(!src.includes(needle), `${message}: must not include ${JSON.stringify(needle)}`)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

async function runAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function baseRow(overrides: Partial<WeddingRow> = {}): WeddingRow {
  return {
    id: 'w-party-1',
    user_id: 'u1',
    bride_name: 'Anna Kowalska',
    groom_name: 'Kamil Nowak',
    email: 'para@example.com',
    phone: '500111222',
    groom_phone: '501222333',
    contract_address: 'ul. Kwiatowa 8',
    contract_postal_code: '00-001',
    contract_city: 'Warszawa',
    wedding_date: '2027-06-12',
    ceremony_time: null,
    venue: null,
    status: 'active',
    workflow_stage: 'reservation',
    package_name: null,
    package_id: null,
    contract_value: 0,
    deposit_amount: null,
    currency: 'PLN',
    accent_color: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const persistSrc = read('src/lib/forms/persistWeddingContractAnswers.ts')
const mapperSrc = read('src/lib/api/weddings/weddingMappers.ts')
const serviceSrc = read('src/lib/api/weddingService.ts')
const draftSrc = read('src/features/weddings/edit/persistWeddingEditDraft.ts')
const actionsSrc = read('src/lib/api/weddingActionsService.ts')
const pageSrc = read('src/pages/NewWeddingPage.tsx')
const payloadSrc = read('src/features/weddings/buildNewWeddingCreatePayload.ts')
const typesSrc = read('src/types/wedding.ts')
const migrationSrc = read(
  'supabase/migrations/20260820140000_wedding_contract_party.sql',
)

run('A — row → model: canonical party columns populate Couple', () => {
  const model = mapWeddingRowToModel(baseRow())
  assertEq(model.couple.partner2Phone, '501222333', 'groom phone')
  assertEq(model.couple.partner1Address, 'ul. Kwiatowa 8', 'address')
  assertEq(model.couple.partner1PostalCode, '00-001', 'postal')
  assertEq(model.couple.partner1City, 'Warszawa', 'city')
  assertEq(model.couple.city, 'Warszawa', 'couple.city')
  assertEq(model.couple.partner1Phone, '500111222', 'bride phone unchanged')
  assertEq(model.couple.email, 'para@example.com', 'email unchanged')
  assertEq(model.questionnaires.contractData.status, 'not_sent', 'not_sent without form')
})

run('B — model → row: Couple maps back to canonical columns', () => {
  const model = mapWeddingRowToModel(baseRow())
  const row = mapWeddingModelToRow(model)
  assertEq(row.groom_phone, '501222333', 'groom_phone')
  assertEq(row.contract_address, 'ul. Kwiatowa 8', 'contract_address')
  assertEq(row.contract_postal_code, '00-001', 'contract_postal_code')
  assertEq(row.contract_city, 'Warszawa', 'contract_city')
  assertEq(row.phone, '500111222', 'phone')
  assertEq(row.email, 'para@example.com', 'email')
})

run('C — create input foundation: optional party fields insertable', () => {
  assertIncludes(typesSrc, 'partner2Phone?: string', 'CreateWeddingInput groom phone')
  assertIncludes(typesSrc, 'partner1Address?: string', 'CreateWeddingInput address')
  assertIncludes(typesSrc, 'partner1PostalCode?: string', 'CreateWeddingInput postal')
  assertIncludes(typesSrc, 'partner1City?: string', 'CreateWeddingInput city')
  assertIncludes(serviceSrc, 'groom_phone: input.partner2Phone?.trim() || null', 'create groom_phone')
  assertIncludes(
    serviceSrc,
    'contract_address: input.partner1Address?.trim() || null',
    'create address',
  )
  assertIncludes(
    serviceSrc,
    'contract_postal_code: input.partner1PostalCode?.trim() || null',
    'create postal',
  )
  assertIncludes(
    serviceSrc,
    'contract_city: input.partner1City?.trim() || null',
    'create city',
  )
  const input: CreateWeddingInput = {
    partner1: 'Anna Kowalska',
    partner2: 'Kamil Nowak',
    date: '2027-06-12',
    packageName: '',
    price: 0,
    depositPaid: false,
    partner2Phone: '501222333',
    partner1Address: 'ul. Kwiatowa 8',
    partner1PostalCode: '00-001',
    partner1City: 'Warszawa',
  }
  assertEq(input.partner2Phone, '501222333', 'typed create input')
})

run('D — no questionnaire: studio persist skips manufacturing a submission', () => {
  const plan = planStudioContractAnswerPersist({
    latest: null,
    fields: { 'partner2.phone': '501222333' },
  })
  assertEq(plan.kind, 'skipped_no_submission', 'skip when no submitted instance')
  assertNotIncludes(persistSrc, 'createFormInstance', 'must not create instance')
  assertNotIncludes(persistSrc, 'status: \'submitted\'', 'must not force submitted')
  assertNotIncludes(persistSrc, 'writeSubmittedAnswers', 'must not write first answers')
  assertIncludes(persistSrc, 'skipped_no_submission', 'explicit skip result')
  assertIncludes(draftSrc, 'weddingService.update(nextWedding)', 'canonical columns first')
  const updateIdx = draftSrc.indexOf('await weddingService.update(nextWedding)')
  const persistIdx = draftSrc.indexOf('await persistWeddingContractAnswerFields(nextWedding)')
  assert(updateIdx >= 0 && persistIdx > updateIdx, 'update before questionnaire persist')
})

run('E — existing submitted questionnaire: studio persist patches same document', () => {
  const plan = planStudioContractAnswerPersist({
    latest: {
      instanceId: 'inst-1',
      answerJson: {
        fields: { 'partner2.phone': '111' },
        values: {},
      } as FormAnswerJson,
    },
    fields: { 'partner2.phone': '501222333', 'partner1.address': 'ul. Kwiatowa 8' },
  })
  assertEq(plan.kind, 'updated_existing_submission', 'patch existing')
  if (plan.kind !== 'updated_existing_submission') return
  assertEq(plan.instanceId, 'inst-1', 'same instance')
  assertEq(
    (plan.nextAnswerJson.fields as Record<string, string>)['partner2.phone'],
    '501222333',
    'phone patched',
  )
  assertEq(
    (plan.nextAnswerJson.fields as Record<string, string>)['partner1.address'],
    'ul. Kwiatowa 8',
    'address patched',
  )
  assertNotIncludes(persistSrc, 'createFormInstance', 'no second instance')
})

run('F — hydrate without form: canonical party fields survive mapper', () => {
  const model = mapWeddingRowToModel(baseRow())
  assertEq(model.couple.partner2Phone, '501222333', 'groom phone survives')
  assertEq(model.couple.partner1Address, 'ul. Kwiatowa 8', 'address survives')
  assertEq(model.couple.partner1PostalCode, '00-001', 'postal survives')
  assertEq(model.couple.partner1City, 'Warszawa', 'city survives')
  assertEq(model.questionnaires.contractData.status, 'not_sent', 'still not_sent')
  assertIncludes(mapperSrc, 'groom_phone', 'mapper reads column')
  assertIncludes(serviceSrc, 'groom_phone: patch.groom_phone ?? null', 'update writes column')
})

void runAsync(
  'G — hydrate with submitted form: preferForm overlays non-blank questionnaire values',
  async () => {
    const wedding = mapWeddingRowToModel(baseRow()) as Wedding
    const merged = await mergeFormAnswersIntoWedding(
      wedding,
      {
        fields: {
          'partner2.phone': '600700800',
          'partner1.address': 'ul. Nowa 1',
          'partner1.postalCode': '30-001',
          'partner1.city': 'Kraków',
        },
      } as FormAnswerJson,
      { submittedAt: '2026-08-01' },
    )
    assertEq(merged.couple.partner2Phone, '600700800', 'form phone wins')
    assertEq(merged.couple.partner1Address, 'ul. Nowa 1', 'form address wins')
    assertEq(merged.couple.partner1PostalCode, '30-001', 'form postal wins')
    assertEq(merged.couple.partner1City, 'Kraków', 'form city wins')
    assertEq(merged.questionnaires.contractData.status, 'completed', 'hydrate completed')

    const blankForm = await mergeFormAnswersIntoWedding(
      wedding,
      {
        fields: {
          'partner2.phone': '',
          'partner1.address': '',
        },
      } as FormAnswerJson,
      { submittedAt: '2026-08-01' },
    )
    assertEq(blankForm.couple.partner2Phone, '501222333', 'blank form keeps DB phone')
    assertEq(blankForm.couple.partner1Address, 'ul. Kwiatowa 8', 'blank form keeps DB address')
  },
)

run('H — readiness/generation see canonical values without questionnaire', () => {
  const wedding = mapWeddingRowToModel(baseRow()) as Wedding
  const readiness = evaluateWeddingContractReadiness(wedding, null)
  const addressItem = readiness.items.find((item) => item.id === 'client_address')
  const phoneItem = readiness.items.find((item) => item.id === 'client_phone')
  assert(addressItem?.status === 'complete', 'client_address complete from columns')
  assert(phoneItem?.status === 'complete', 'client_phone complete from columns')

  const snapshot = buildContractDataSnapshot({
    wedding,
    company: null,
    extras: [],
    places: [],
  })
  const groomPhone = snapshot.fields.find((field) => field.key === 'groom.phone')
  const brideAddress = snapshot.fields.find((field) => field.key === 'bride.address')
  assertEq(groomPhone?.value, '501222333', 'generation groom.phone')
  assert(
    String(brideAddress?.value ?? '').includes('ul. Kwiatowa 8'),
    'generation bride.address includes street',
  )
  assert(
    String(brideAddress?.value ?? '').includes('00-001'),
    'generation bride.address includes postal',
  )
  assert(
    String(brideAddress?.value ?? '').includes('Warszawa'),
    'generation bride.address includes city',
  )
})

run('I — Quick Create regression: minimal payload unchanged', () => {
  const quick = buildNewWeddingCreatePayload({
    partner1: 'Anna Kowalska',
    partner2: 'Michał Nowak',
    date: '2027-06-12',
    completeLater: true,
    packageId: 'pkg-1',
    packageName: 'Video Standard',
    price: 10500,
    depositPaid: true,
    depositAmount: 1000,
    ceremonyLocation: 'Kościół',
    receptionLocation: 'Pałac',
    notes: 'stale',
  })
  assertEq(quick.partner1, 'Anna Kowalska', 'bride')
  assertEq(quick.partner2, 'Michał Nowak', 'groom')
  assertEq(quick.date, '2027-06-12', 'date')
  assertEq(quick.packageId, null, 'packageId')
  assertEq(quick.packageName, '', 'packageName')
  assertEq(quick.price, 0, 'price')
  assertEq(quick.depositPaid, false, 'depositPaid')
  assertEq(quick.phone, undefined, 'no phone')
  assertEq(quick.email, undefined, 'no email')
  assertEq(quick.partner2Phone, undefined, 'no groom phone')
  assertEq(quick.partner1Address, undefined, 'no address')
  assertEq(quick.partner1PostalCode, undefined, 'no postal')
  assertEq(quick.partner1City, undefined, 'no city')
  assertNotIncludes(payloadSrc, 'partner2Phone', 'payload helper does not emit party fields')
})

run('J — Full Create UI collects party fields without questionnaire persist', () => {
  assertIncludes(pageSrc, "label: 'Para'", 'Para')
  assertIncludes(pageSrc, "label: 'Pakiet'", 'Pakiet')
  assertIncludes(pageSrc, "label: 'Miejsca'", 'Miejsca')
  assertIncludes(pageSrc, "label: 'Podsumowanie'", 'Podsumowanie')
  assertIncludes(pageSrc, "register('partner2Phone')", 'groom phone field')
  assertIncludes(pageSrc, 'name="contractAddress"', 'address AddressField')
  assertIncludes(pageSrc, "register('partner1PostalCode')", 'postal field')
  assertIncludes(pageSrc, "register('partner1City')", 'city field')
  assertNotIncludes(pageSrc, 'persistWeddingContractAnswerFields', 'no questionnaire persist')
})

run('K — sendQuestionnaire remains allowed after photographer-only data', () => {
  const model = mapWeddingRowToModel(baseRow())
  assertEq(model.questionnaires.contractData.status, 'not_sent', 'not_sent after mapper')
  assertIncludes(
    actionsSrc,
    "wedding.questionnaires[qKey].status !== 'not_sent'",
    'send still gated on not_sent',
  )
  assertNotIncludes(persistSrc, 'createFormInstance', 'photographer save cannot mint instance')
})

run('L — migration is additive nullable only', () => {
  assertIncludes(migrationSrc, 'add column if not exists groom_phone text', 'groom_phone')
  assertIncludes(migrationSrc, 'add column if not exists contract_address text', 'address')
  assertIncludes(migrationSrc, 'add column if not exists contract_postal_code text', 'postal')
  assertIncludes(migrationSrc, 'add column if not exists contract_city text', 'city')
  assertNotIncludes(migrationSrc, 'update public.weddings', 'no backfill update')
  assertNotIncludes(migrationSrc, 'not null', 'nullable')
  assertNotIncludes(migrationSrc, 'contract_ready', 'no ready flag')
  assertNotIncludes(migrationSrc, 'create table', 'no new table')
})
