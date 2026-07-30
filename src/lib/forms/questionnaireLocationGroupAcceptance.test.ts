/**
 * Location group: one "Lokalizacje" card with four address fields.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildDefaultQuestionnaireBlocks,
  CONTRACT_QUESTIONNAIRE_SECTION_ORDER,
  ensureQuestionnaireBlocks,
  WEDDING_LOCATIONS_GROUP_HEADING_ID,
  WEDDING_LOCATIONS_GROUP_TITLE,
} from '@/lib/forms/questionnaireBlocks'
import { buildContractQuestionnaireTemplate } from '@/lib/forms/contractQuestionnaireTemplate'
import { groupQuestionsIntoSections, isLocationsSection } from '@/features/forms/formSections'
import { defaultContractQuestionnaireConfig } from '@/types/contractQuestionnaire'
import type { ContractQuestionnaireBlock } from '@/types/questionnaireBlocks'

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

const LOCATION_KEYS = [
  'bridePreparationLocation',
  'groomPreparationLocation',
  'ceremonyLocation',
  'receptionLocation',
] as const

function sections() {
  const tpl = buildContractQuestionnaireTemplate({
    packages: pkgs,
    additionalServices: extras,
    config: ensureQuestionnaireBlocks(defaultContractQuestionnaireConfig()),
  })
  return { tpl, sections: groupQuestionsIntoSections(tpl.questions) }
}

run('1. one outer Lokalizacje card', () => {
  const { sections: secs } = sections()
  const loc = secs.filter((s) => s.title === WEDDING_LOCATIONS_GROUP_TITLE)
  assertEq(loc.length, 1, 'exactly one locations card')
  assertEq(WEDDING_LOCATIONS_GROUP_TITLE, 'Lokalizacje', 'title')
})

run('2. card contains exactly four address fields', () => {
  const { sections: secs } = sections()
  const loc = secs.find((s) => s.title === WEDDING_LOCATIONS_GROUP_TITLE)!
  assertEq(loc.questions.length, 4, 'four fields')
  assert(
    loc.questions.every((q) => q.type === 'location'),
    'all location/AddressField',
  )
})

run('3–6. canonical mappings', () => {
  const { sections: secs } = sections()
  const loc = secs.find((s) => s.title === WEDDING_LOCATIONS_GROUP_TITLE)!
  for (const key of LOCATION_KEYS) {
    assert(loc.questions.some((q) => q.fieldKey === key), key)
  }
})

run('7. always one-column stack (no 2-col grid for Lokalizacje)', () => {
  const { sections: secs } = sections()
  const loc = secs.find((s) => s.title === WEDDING_LOCATIONS_GROUP_TITLE)!
  assert(isLocationsSection(loc), 'detected as locations section')
  const css = readFileSync(
    resolve(process.cwd(), 'src/features/forms/FormPublicPage.module.css'),
    'utf8',
  )
  assert(css.includes('.cardBodyStack'), 'stack class')
  assert(
    css.includes('cardBodyStack') &&
      /cardBodyStack\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(
        css,
      ),
    'stack is single column',
  )
  assert(!css.includes('.cardBodyStack') || !/cardBodyStack[\s\S]*?repeat\(2/.test(css), 'no 2-col on stack')
  const page = readFileSync(
    resolve(process.cwd(), 'src/features/forms/ProductionContractFormPage.tsx'),
    'utf8',
  )
  assert(page.includes('cardBodyStack'), 'public uses stack')
})

run('8. mobile and desktop share the same one-column stack', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'src/features/forms/FormPublicPage.module.css'),
    'utf8',
  )
  // No media-query override that would switch cardBodyStack to 2 columns
  assert(
    !/@media[^{]+\{[^}]*cardBodyStack[^}]*1fr\)\s*minmax/.test(css),
    'no desktop 2-col override on stack',
  )
})

run('9. each field uses shared QuestionnaireLocationField', () => {
  const qf = readFileSync(
    resolve(process.cwd(), 'src/features/forms/QuestionField.tsx'),
    'utf8',
  )
  assert(qf.includes('QuestionnaireLocationField'), 'shared GeoPlace field')
  assert(qf.includes("question.type === 'location'"), 'location branch')
  assert(!qf.includes('AddressField'), 'no AddressField')
})

run('10. legacy separate location headings normalize into group', () => {
  const legacy: ContractQuestionnaireBlock[] = [
    {
      id: 'sys_heading_bride_prep',
      type: 'heading',
      order: 0,
      enabled: true,
      text: 'Przygotowania Panny Młodej',
      level: 2,
    },
    {
      id: 'sys_loc_bride_prep',
      type: 'location',
      order: 1,
      enabled: true,
      locationRole: 'bride_preparation',
      label: 'Przygotowania Panny Młodej',
      required: false,
    },
    {
      id: 'sys_heading_ceremony',
      type: 'heading',
      order: 2,
      enabled: true,
      text: 'Miejsce ceremonii',
      level: 2,
    },
    {
      id: 'sys_loc_ceremony',
      type: 'location',
      order: 3,
      enabled: true,
      locationRole: 'ceremony',
      label: 'Miejsce ceremonii',
      required: true,
    },
  ]
  const normalized = ensureQuestionnaireBlocks({
    ...defaultContractQuestionnaireConfig(),
    version: 6,
    blocks: legacy,
  })
  assert(
    !(normalized.blocks ?? []).some(
      (b) => b.type === 'heading' && b.id === 'sys_heading_bride_prep',
    ),
    'per-role heading stripped',
  )
  assert(
    (normalized.blocks ?? []).some(
      (b) =>
        b.type === 'heading' && b.id === WEDDING_LOCATIONS_GROUP_HEADING_ID,
    ),
    'group heading present',
  )
  assertEq(
    (normalized.blocks ?? []).filter((b) => b.type === 'location').length,
    4,
    'all four roles present',
  )
})

run('11. old snapshots remain readable via location fieldKeys', () => {
  const { tpl } = sections()
  for (const key of LOCATION_KEYS) {
    assert(tpl.questions.some((q) => q.fieldKey === key), `readable ${key}`)
  }
})

run('12. no empty structural location card', () => {
  const { sections: secs } = sections()
  assert(
    !secs.some((s) => s.questions.length === 0),
    'no empty cards',
  )
  assertEq(
    secs.filter((s) =>
      [
        'Przygotowania Panny Młodej',
        'Przygotowania Pana Młodego',
        'Miejsce ceremonii',
        'Miejsce przyjęcia weselnego',
      ].includes(s.title),
    ).length,
    0,
    'no per-role outer cards',
  )
})

run('order: rendered section titles match product sequence', () => {
  const { sections: secs, tpl } = sections()
  const titles = secs.map((s) => s.title).filter(Boolean)
  // Also include field labels for Pakiet/Dodatki which sit under Data ślubu card
  const markers = tpl.questions
    .filter(
      (q) =>
        q.type === 'section_title' ||
        q.fieldKey === 'selectedPackageIds' ||
        q.fieldKey === 'selectedAdditionalServiceIds',
    )
    .map((q) => q.label)

  const idx = (label: string, list: string[]) => {
    const i = list.findIndex((l) => l === label)
    assert(i >= 0, `missing ${label}`)
    return i
  }

  const dateI = idx('Data ślubu', titles)
  const brideI = idx('Dane Panny Młodej', titles)
  const groomI = idx('Dane Pana Młodego', titles)
  const addrI = idx('Adres do umowy', titles)
  const locI = idx('Lokalizacje', titles)
  const emailI = idx('Adres e-mail do kontaktu', titles)
  const notesI = idx('Uwagi', titles)
  const pkgI = idx('Pakiet', markers)
  const extrasI = idx('Dodatki', markers)

  assert(dateI < brideI, 'date before bride')
  assert(pkgI < extrasI, 'package before extras')
  assert(brideI < groomI, 'bride before groom')
  assert(groomI < addrI, 'groom before address')
  assert(addrI < locI, 'address before locations')
  assert(locI < emailI, 'locations before email')
  assert(emailI < notesI, 'email before notes')
  assertEq(CONTRACT_QUESTIONNAIRE_SECTION_ORDER.length, 9, '9 sections')

  const blocks = buildDefaultQuestionnaireBlocks(null)
  assertEq(
    blocks.filter((b) => b.type === 'heading' && b.id.startsWith('sys_heading_bride_prep'))
      .length,
    0,
    'no per-role bride heading in defaults',
  )
})
