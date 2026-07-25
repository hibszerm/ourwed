/**
 * Regression: four wedding location fields restored in contract questionnaire.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildDefaultQuestionnaireBlocks,
  canAddLocationRole,
  CONTRACT_QUESTIONNAIRE_SECTION_ORDER,
  createLocationBlock,
  ensureQuestionnaireBlocks,
} from '@/lib/forms/questionnaireBlocks'
import { buildContractQuestionnaireTemplate } from '@/lib/forms/contractQuestionnaireTemplate'
import { questionsFromBlocks } from '@/lib/forms/questionsFromBlocks'
import { defaultContractQuestionnaireConfig } from '@/types/contractQuestionnaire'
import { LOCATION_ROLE_TO_FIELD_KEY } from '@/types/questionnaireBlocks'
import { isMobileOverlayViewport, MOBILE_OVERLAY_BREAKPOINT } from '@/components/ui/floatingPlacement'

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

const pkgs = [{ id: 'p1', name: 'Pakiet A', price: 1, currency: 'PLN' }]
const extras = [{ id: 'e1', name: 'Drone', price: 1, currency: 'PLN' }]

const LOCATION_LABELS = [
  'Przygotowania Panny Młodej',
  'Przygotowania Pana Młodego',
  'Miejsce ceremonii',
  'Miejsce przyjęcia weselnego',
] as const

const LOCATION_KEYS = [
  'bridePreparationLocation',
  'groomPreparationLocation',
  'ceremonyLocation',
  'receptionLocation',
] as const

run('1–4. four wedding locations appear in default template', () => {
  const tpl = buildContractQuestionnaireTemplate({
    packages: pkgs,
    additionalServices: extras,
    config: ensureQuestionnaireBlocks(defaultContractQuestionnaireConfig()),
  })
  for (const key of LOCATION_KEYS) {
    const q = tpl.questions.find((x) => x.fieldKey === key)
    assert(Boolean(q), `missing ${key}`)
    assertEq(q?.type, 'location', `${key} type`)
  }
  for (const label of LOCATION_LABELS) {
    assert(
      tpl.questions.some((q) => q.label === label || q.type === 'section_title' && q.label === label),
      `label ${label}`,
    )
  }
})

run('5. all four use AddressField (location question type)', () => {
  const qs = questionsFromBlocks(
    buildDefaultQuestionnaireBlocks(null),
    pkgs,
    extras,
  )
  for (const key of LOCATION_KEYS) {
    assertEq(
      qs.find((q) => q.fieldKey === key)?.type,
      'location',
      `${key} → AddressField`,
    )
  }
})

run('6. AddressField + provider wiring still present', () => {
  const field = readFileSync(
    resolve(process.cwd(), 'src/features/forms/QuestionField.tsx'),
    'utf8',
  )
  const addr = readFileSync(
    resolve(process.cwd(), 'src/features/forms/AddressField.tsx'),
    'utf8',
  )
  assert(field.includes("question.type === 'location'"), 'QuestionField location')
  assert(field.includes('AddressField'), 'AddressField mount')
  assert(addr.includes('AddressAutocompleteProvider'), 'provider')
  assert(addr.includes('ResponsiveFieldOverlay'), 'overlay')
})

run('7–9. distinct canonical keys — no overwrite of contract address', () => {
  assertEq(
    LOCATION_ROLE_TO_FIELD_KEY.bride_preparation,
    'bridePreparationLocation',
    'bride',
  )
  assertEq(
    LOCATION_ROLE_TO_FIELD_KEY.groom_preparation,
    'groomPreparationLocation',
    'groom',
  )
  assertEq(LOCATION_ROLE_TO_FIELD_KEY.ceremony, 'ceremonyLocation', 'ceremony')
  assertEq(LOCATION_ROLE_TO_FIELD_KEY.reception, 'receptionLocation', 'reception')

  const qs = questionsFromBlocks(
    buildDefaultQuestionnaireBlocks(null),
    pkgs,
    extras,
  )
  const keys = qs.map((q) => q.fieldKey).filter(Boolean)
  assertEq(
    keys.filter((k) => k === 'partner1.address').length,
    1,
    'one contract address',
  )
  for (const key of LOCATION_KEYS) {
    assertEq(keys.filter((k) => k === key).length, 1, `unique ${key}`)
  }
})

run('10. mobile overlay breakpoint still active', () => {
  assert(isMobileOverlayViewport(MOBILE_OVERLAY_BREAKPOINT - 1), 'mobile')
  assert(!isMobileOverlayViewport(MOBILE_OVERLAY_BREAKPOINT + 1), 'desktop')
})

run('11. builder prevents duplicate location roles', () => {
  const blocks = buildDefaultQuestionnaireBlocks(null)
  assert(!canAddLocationRole(blocks, 'ceremony'), 'ceremony present')
  assert(!canAddLocationRole(blocks, 'reception'), 'reception present')
  assert(!canAddLocationRole(blocks, 'bride_preparation'), 'bride present')
  assert(!canAddLocationRole(blocks, 'groom_preparation'), 'groom present')
  const empty: ReturnType<typeof buildDefaultQuestionnaireBlocks> = []
  assert(canAddLocationRole(empty, 'ceremony'), 'can add when missing')
  const created = createLocationBlock('ceremony', 0)
  assertEq(created.locationRole, 'ceremony', 'role')
  assert(!canAddLocationRole([created], 'ceremony'), 'duplicate blocked')
})

run('12. new snapshot / section order includes location group', () => {
  assertEq(CONTRACT_QUESTIONNAIRE_SECTION_ORDER.length, 9, '9 sections')
  const order = [...CONTRACT_QUESTIONNAIRE_SECTION_ORDER]
  assert(order.includes('Lokalizacje'), 'group title')
  assert(order.includes('Dodatki'), 'Dodatki label')
  const addrIdx = order.indexOf('Adres do umowy')
  const locIdx = order.indexOf('Lokalizacje')
  const emailIdx = order.indexOf('Adres e-mail do kontaktu')
  assert(addrIdx < locIdx, 'address before locations')
  assert(locIdx < emailIdx, 'locations before email')

  const blocks = buildDefaultQuestionnaireBlocks(null)
  assertEq(
    blocks.filter((b) => b.type === 'location').length,
    4,
    '4 location blocks',
  )
  assertEq(
    blocks.filter((b) => b.type === 'heading' && b.id.startsWith('sys_heading_bride_prep'))
      .length,
    0,
    'no per-role headings',
  )
})
