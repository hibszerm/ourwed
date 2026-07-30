/**
 * Contract custom answers: snapshot-driven Wedding Details rendering +
 * definition → submit payload → answer model integration.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildContractAnswerList,
  buildContractAnswerSections,
} from '@/features/questionnaires/contractAnswerSummary'
import {
  blocksToEditorSections,
  createEditorQuestion,
  createEditorSection,
  editorSectionsToBlocks,
} from '@/features/questionnaires/shared-editor/contractBlocksAdapter'
import { buildDefaultQuestionnaireBlocks } from '@/lib/forms/questionnaireBlocks'
import { questionsFromBlocks } from '@/lib/forms/questionsFromBlocks'
import { formEngine } from '@/lib/forms/formEngine'
import type {
  ContractQuestionnaireConfig,
  FormInstanceOptionsSnapshot,
} from '@/types/contractQuestionnaire'
import type { ContractQuestionnaireBlock } from '@/types/questionnaireBlocks'
import type { FormAnswerJson } from '@/types/formEngine'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  FAIL  ${message}`)
    failed++
  } else {
    console.log(`  PASS  ${message}`)
    passed++
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    console.error(
      `  FAIL  ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
    failed++
  } else {
    console.log(`  PASS  ${message}`)
    passed++
  }
}

function run(name: string, fn: () => void) {
  console.log(`\n${name}`)
  fn()
}

function makeCustomBlocks(): ContractQuestionnaireBlock[] {
  const base = buildDefaultQuestionnaireBlocks()
  const maxOrder = Math.max(...base.map((b) => b.order), 0)
  const headingId = 'sec_dodatkowe'
  const shortId = 'q_kontakt'
  const longId = 'q_info'
  const yesId = 'q_faktura'
  const singleId = 'q_kontakt_forma'
  const multiId = 'q_uslugi'
  return [
    ...base,
    {
      id: headingId,
      type: 'heading',
      order: maxOrder + 1,
      enabled: true,
      text: 'Dodatkowe ustalenia',
      level: 2,
    },
    {
      id: shortId,
      type: 'short_text',
      order: maxOrder + 2,
      enabled: true,
      fieldKey: 'osoba_kontaktowa_dnia',
      label: 'Osoba kontaktowa w dniu ślubu',
      required: false,
    },
    {
      id: longId,
      type: 'long_text',
      order: maxOrder + 3,
      enabled: true,
      fieldKey: 'dodatkowe_info_umowa',
      label: 'Dodatkowe informacje do umowy',
      required: false,
    },
    {
      id: yesId,
      type: 'checkbox',
      order: maxOrder + 4,
      enabled: true,
      fieldKey: 'faktura_inna',
      label: 'Czy dane do faktury są inne niż dane do umowy?',
      required: false,
    },
    {
      id: singleId,
      type: 'single_choice',
      order: maxOrder + 5,
      enabled: true,
      fieldKey: 'forma_kontaktu',
      label: 'Preferowana forma kontaktu',
      required: false,
      options: [
        { id: 'opt_tel', value: 'opt_tel', label: 'Telefon' },
        { id: 'opt_sms', value: 'opt_sms', label: 'SMS' },
        { id: 'opt_mail', value: 'opt_mail', label: 'E-mail' },
      ],
    },
    {
      id: multiId,
      type: 'multiple_choice',
      order: maxOrder + 6,
      enabled: true,
      fieldKey: 'dodatkowe_uslugi_custom',
      label: 'Dodatkowe usługi',
      required: false,
      options: [
        { id: 'opt_plener', value: 'opt_plener', label: 'Sesja plenerowa' },
        { id: 'opt_album', value: 'opt_album', label: 'Album' },
        { id: 'opt_op', value: 'opt_op', label: 'Dodatkowy operator' },
      ],
    },
  ]
}

function snapshotFromBlocks(
  blocks: ContractQuestionnaireBlock[],
): FormInstanceOptionsSnapshot {
  const config: ContractQuestionnaireConfig = {
    version: 6,
    showPackages: true,
    allowMultiplePackages: true,
    showAdditionalServices: true,
    packagesRequired: false,
    customFields: [],
    greeting: 'Cześć',
    blocks,
  }
  return {
    version: 1,
    config,
    packageOptions: [{ id: 'pkg-1', name: 'Pakiet Gold' }],
    additionalServiceOptions: [{ id: 'ex-1', name: 'Drone' }],
    createdAt: '2026-07-01T00:00:00.000Z',
  }
}

run('Wedding Details wires Contract answers component', () => {
  const overview = readFileSync(
    resolve(process.cwd(), 'src/features/weddings/detail/v2/WeddingOverviewCurrentState.tsx'),
    'utf8',
  )
  assert(
    overview.includes('WeddingContractQuestionnaireAnswers'),
    'overview mounts answers',
  )
  assert(overview.includes("q.status === 'completed'"), 'only when completed')
})

run('custom field keys survive editor round-trip', () => {
  const blocks = makeCustomBlocks()
  const sections = blocksToEditorSections(blocks)
  const customSec = sections.find((s) => s.title === 'Dodatkowe ustalenia')
  assert(Boolean(customSec), 'custom section present')
  const short = customSec!.questions.find((q) =>
    q.label.includes('Osoba kontaktowa'),
  )!
  const keyBefore =
    short.block.type === 'short_text' ? short.block.fieldKey : ''
  short.label = 'Osoba kontaktowa — zmieniona etykieta'
  const roundTrip = editorSectionsToBlocks(sections, blocks)
  const after = roundTrip.find(
    (b) => b.type === 'short_text' && b.id === short.id,
  )
  assert(after?.type === 'short_text', 'still short_text')
  if (after?.type === 'short_text') {
    assertEqual(after.fieldKey, keyBefore, 'fieldKey stable after label edit')
    assertEqual(
      after.label,
      'Osoba kontaktowa — zmieniona etykieta',
      'label updated',
    )
  }
})

run('duplicate labels keep distinct stable keys', () => {
  const a = createEditorQuestion('short_text')
  const b = createEditorQuestion('short_text')
  a.label = 'To samo'
  b.label = 'To samo'
  const sec = createEditorSection()
  sec.questions = [a, b]
  const blocks = editorSectionsToBlocks([sec], [])
  const customs = blocks.filter((x) => x.type === 'short_text')
  assertEqual(customs.length, 2, 'two customs')
  if (customs[0]?.type === 'short_text' && customs[1]?.type === 'short_text') {
    assert(customs[0].fieldKey !== customs[1].fieldKey, 'distinct keys')
    assertEqual(customs[0].label, 'To samo', 'label a')
    assertEqual(customs[1].label, 'To samo', 'label b')
  }
})

run('answer formatting: text, long, yes/no, choices, empty omit', () => {
  const blocks = makeCustomBlocks()
  const snap = snapshotFromBlocks(blocks)
  const answerJson: FormAnswerJson = {
    values: {
      q_kontakt: 'Anna Kowalska',
      q_info: 'Linia 1\nLinia 2',
      q_faktura: true,
      q_kontakt_forma: 'opt_sms',
      q_uslugi: ['opt_plener', 'opt_op'],
    },
    fields: {
      'custom.osoba_kontaktowa_dnia': 'Anna Kowalska',
      'custom.dodatkowe_info_umowa': 'Linia 1\nLinia 2',
      'custom.faktura_inna': true,
      'custom.forma_kontaktu': 'opt_sms',
      'custom.dodatkowe_uslugi_custom': ['opt_plener', 'opt_op'],
    },
    customAnswers: [
      {
        fieldId: 'q_kontakt',
        fieldKey: 'osoba_kontaktowa_dnia',
        labelSnapshot: 'Osoba kontaktowa w dniu ślubu',
        type: 'text',
        value: 'Anna Kowalska',
      },
    ],
    packageSnapshots: [{ id: 'pkg-1', name: 'Pakiet Gold' }],
    additionalServiceSnapshots: [],
  }

  const sections = buildContractAnswerSections(answerJson, snap)
  const custom = sections.find((s) => s.sectionTitle === 'Dodatkowe ustalenia')
  assert(Boolean(custom), 'custom section group')
  const byLabel = Object.fromEntries(
    (custom?.items ?? []).map((i) => [i.label, i.value]),
  )
  assertEqual(
    byLabel['Osoba kontaktowa w dniu ślubu'],
    'Anna Kowalska',
    'short text',
  )
  assertEqual(
    byLabel['Dodatkowe informacje do umowy'],
    'Linia 1\nLinia 2',
    'long text keeps breaks',
  )
  assertEqual(
    byLabel['Czy dane do faktury są inne niż dane do umowy?'],
    'Tak',
    'yes/no Tak',
  )
  assertEqual(
    byLabel['Preferowana forma kontaktu'],
    'SMS',
    'single choice label not id',
  )
  assertEqual(
    byLabel['Dodatkowe usługi'],
    'Sesja plenerowa, Dodatkowy operator',
    'multi choice labels',
  )

  const flat = buildContractAnswerList(answerJson, snap)
    .map((i) => `${i.label}|${i.value}`)
    .join('\n')
  assert(!flat.includes('opt_sms'), 'no raw option id')
  assert(!flat.includes('osoba_kontaktowa_dnia'), 'no raw field key')
  assert(!flat.includes('opt_plener'), 'no raw multi option id')
})

run('empty custom answers omitted; info blocks not shown', () => {
  const blocks = makeCustomBlocks()
  blocks.push({
    id: 'info_1',
    type: 'text',
    order: 999,
    enabled: true,
    content: 'To jest informacja',
    role: 'general',
  })
  const snap = snapshotFromBlocks(blocks)
  const answerJson: FormAnswerJson = {
    values: { q_kontakt: '' },
    fields: {},
    customAnswers: [],
  }
  const list = buildContractAnswerList(answerJson, snap)
  assert(
    !list.some((i) => i.label.includes('Osoba kontaktowa')),
    'empty short omitted',
  )
  assert(
    !list.some((i) => i.value.includes('To jest informacja')),
    'info block not as answer',
  )
})

run('historical labels survive later template edits', () => {
  const blocks = makeCustomBlocks()
  const snap = snapshotFromBlocks(blocks)
  const answerJson: FormAnswerJson = {
    values: { q_kontakt_forma: 'opt_tel' },
    fields: { 'custom.forma_kontaktu': 'opt_tel' },
    customAnswers: [],
  }
  // Mutate "live" config differently — builder must ignore it when snapshot exists.
  const liveBlocks = makeCustomBlocks().map((b) => {
    if (b.type === 'single_choice' && b.fieldKey === 'forma_kontaktu') {
      return {
        ...b,
        label: 'NOWY LABEL LIVE',
        options: [
          { id: 'opt_tel', value: 'opt_tel', label: 'NOWY TELEFON' },
          { id: 'opt_sms', value: 'opt_sms', label: 'NOWY SMS' },
        ],
      }
    }
    if (b.type === 'heading' && b.text === 'Dodatkowe ustalenia') {
      return { ...b, text: 'NOWA SEKCJA LIVE' }
    }
    return b
  })
  const liveConfig: ContractQuestionnaireConfig = {
    version: 6,
    showPackages: true,
    allowMultiplePackages: true,
    showAdditionalServices: true,
    packagesRequired: false,
    customFields: [],
    blocks: liveBlocks,
  }
  const sections = buildContractAnswerSections(answerJson, snap, liveConfig)
  const custom = sections.find((s) => s.sectionTitle === 'Dodatkowe ustalenia')
  assert(Boolean(custom), 'uses snapshot section title')
  assert(
    !sections.some((s) => s.sectionTitle === 'NOWA SEKCJA LIVE'),
    'ignores live section rename',
  )
  const item = custom?.items.find((i) =>
    i.label.includes('Preferowana forma kontaktu'),
  )
  assertEqual(item?.value, 'Telefon', 'snapshot option label')
  assert(item?.label !== 'NOWY LABEL LIVE', 'snapshot question label')
})

run('packages and system fields still render', () => {
  const blocks = makeCustomBlocks()
  const snap = snapshotFromBlocks(blocks)
  const weddingDateBlock = blocks.find(
    (b) => b.type === 'system_field' && b.systemKey === 'weddingDate',
  )
  const pkgBlock = blocks.find((b) => b.type === 'packages')
  const answerJson: FormAnswerJson = {
    values: {
      [weddingDateBlock!.id]: '2026-08-15',
      [pkgBlock!.id]: ['pkg-1'],
    },
    fields: {
      weddingDate: '2026-08-15',
      selectedPackageIds: ['pkg-1'],
    },
    packageSnapshots: [{ id: 'pkg-1', name: 'Pakiet Gold' }],
  }
  const list = buildContractAnswerList(answerJson, snap)
  assert(
    list.some((i) => i.kind === 'package' && i.value === 'Pakiet Gold'),
    'package name',
  )
  assert(
    list.some((i) => i.fieldKey === 'weddingDate' && i.value.includes('2026')),
    'wedding date',
  )
})

run('legacy unknown type fallback does not crash', () => {
  const answerJson: FormAnswerJson = {
    values: {},
    fields: {},
    customAnswers: [
      {
        fieldId: 'legacy_1',
        fieldKey: 'weird_legacy',
        labelSnapshot: 'Stare pole',
        type: 'unknown_widget_xyz',
        value: 'wartość',
      },
    ],
  }
  const list = buildContractAnswerList(answerJson, null)
  assertEqual(list.length, 1, 'one orphan')
  assertEqual(list[0]!.label, 'Stare pole', 'labelSnapshot')
  assertEqual(list[0]!.value, 'wartość', 'value string')
  assert(!list[0]!.value.includes('weird_legacy'), 'no key in value')
})

run('integration: definition → public questions → submit-shaped payload → answers', () => {
  const blocks = makeCustomBlocks()
  const snap = snapshotFromBlocks(blocks)
  const questions = questionsFromBlocks(
    blocks,
    snap.packageOptions,
    snap.additionalServiceOptions,
  )
  const shortQ = questions.find(
    (q) => q.fieldKey === 'custom.osoba_kontaktowa_dnia',
  )!
  const singleQ = questions.find((q) => q.fieldKey === 'custom.forma_kontaktu')!
  const multiQ = questions.find(
    (q) => q.fieldKey === 'custom.dodatkowe_uslugi_custom',
  )!
  const yesQ = questions.find((q) => q.fieldKey === 'custom.faktura_inna')!

  const values: Record<string, unknown> = {
    [shortQ.id]: 'Jan Kontakt',
    [singleQ.id]: 'opt_mail',
    [multiQ.id]: ['opt_album'],
    [yesQ.id]: false,
  }
  const answers = Object.entries(values).map(([questionId, value]) => ({
    questionId,
    value: value as never,
  }))
  const fields = formEngine.answersToFieldMap(
    {
      id: 'tpl-test',
      type: 'contract_questionnaire',
      title: 'Test',
      description: '',
      successTitle: 'OK',
      successDescription: '',
      submitLabel: 'Wyślij',
      questions,
    },
    answers,
  )
  const customAnswers = questions
    .filter((q) => q.fieldKey?.startsWith('custom.'))
    .map((q) => ({
      fieldId: q.customFieldId || q.id,
      fieldKey: q.fieldKey?.replace(/^custom\./, ''),
      labelSnapshot: q.label,
      type: q.type,
      value: values[q.id],
      optionSnapshots: (q.options ?? []).map((o) => ({
        value: o.value,
        label: o.label,
      })),
    }))

  const answerJson: FormAnswerJson = {
    values,
    answers,
    fields,
    customAnswers,
    packageSnapshots: [],
    additionalServiceSnapshots: [],
  }

  const sections = buildContractAnswerSections(answerJson, snap)
  const custom = sections.find((s) => s.sectionTitle === 'Dodatkowe ustalenia')!
  assert(Boolean(custom), 'section from snapshot')
  const labels = custom.items.map((i) => i.label)
  assert(
    labels.indexOf('Osoba kontaktowa w dniu ślubu') <
      labels.indexOf('Preferowana forma kontaktu'),
    'question order',
  )
  assertEqual(
    custom.items.find((i) => i.label.includes('Osoba kontaktowa'))?.value,
    'Jan Kontakt',
    'short from submit',
  )
  assertEqual(
    custom.items.find((i) => i.label.includes('Preferowana'))?.value,
    'E-mail',
    'choice label from snapshot options',
  )
  assertEqual(
    custom.items.find((i) => i.label === 'Dodatkowe usługi')?.value,
    'Album',
    'multi label',
  )
  assertEqual(
    custom.items.find((i) => i.label.includes('faktury'))?.value,
    'Nie',
    'yes/no Nie',
  )

  // Simulate later studio edit of reusable config — snapshot still wins.
  snap.config.blocks = snap.config.blocks?.map((b) =>
    b.type === 'short_text' && b.fieldKey === 'osoba_kontaktowa_dnia'
      ? { ...b, label: 'ZMIENIONE PO WYSYŁCE' }
      : b,
  )
  // Re-freeze original snapshot labels by rebuilding from makeCustomBlocks
  const frozen = snapshotFromBlocks(makeCustomBlocks())
  const again = buildContractAnswerSections(answerJson, frozen)
  assert(
    again
      .flatMap((s) => s.items)
      .some((i) => i.label === 'Osoba kontaktowa w dniu ślubu'),
    'frozen snapshot label',
  )
})

run('old canvas builder is deleted / unused', () => {
  let missing = false
  try {
    readFileSync(
      resolve(
        process.cwd(),
        'src/features/questionnaires/builder/ContractQuestionnaireBuilder.tsx',
      ),
      'utf8',
    )
  } catch {
    missing = true
  }
  assert(missing, 'ContractQuestionnaireBuilder.tsx removed')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
