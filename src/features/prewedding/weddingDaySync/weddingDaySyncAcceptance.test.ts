/**
 * Pre-Wedding → Wedding Day sync — candidate generation & label safety.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_TEMPLATE_SCHEMA } from '@/features/prewedding/defaultTemplate'
import {
  buildWeddingDaySyncCandidates,
  groupWeddingDaySyncCandidates,
} from '@/features/prewedding/weddingDaySync/buildCandidates'
import {
  geoPlacesEqual,
  locationRichness,
  richnessRank,
  valuesAreSemanticallyEqual,
} from '@/features/prewedding/weddingDaySync/compareValues'
import {
  isPlaceholderValue,
  normalizeComparableText,
  normalizeDateValue,
  normalizePhoneDigits,
  normalizeTimeValue,
  resolveWeddingDayLabel,
  CANONICAL_WEDDING_DAY_MAPPINGS,
  NOTE_ONLY_WEDDING_DAY_MAPPINGS,
  WEDDING_DAY_MAPPING_LABELS,
} from '@/features/prewedding/weddingDaySync/mappingCatalog'
import type {
  PreWeddingAnswerValue,
  WeddingQuestionnaire,
} from '@/types/preweddingQuestionnaire'
import type { GeoPlace, WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
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

function baseWedding(overrides?: Partial<Wedding>): Wedding {
  return {
    id: 'wed-sync-1',
    couple: {
      partner1: 'Anna Kowalska',
      partner2: 'Jan Nowak',
      email: 'a@example.test',
      phone: '500100200',
      venue: '',
      city: '',
    },
    date: '2026-09-12',
    ceremonyTime: '14:00',
    packageName: 'Standard',
    packageId: 'pkg-1',
    price: 5000,
    depositAmount: 1000,
    currency: 'PLN',
    status: 'active',
    workflowStage: 'pre_wedding_questionnaire',
    packageItems: [],
    payments: [],
    notes: [],
    deliverables: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    bridePreparationLocation: 'ustalone później',
    groomPreparationLocation: 'jeszcze nie wiemy',
    ceremonyLocation: 'Kościół św. Anny',
    receptionLocation: 'Sala Weselna',
    ...overrides,
  } as Wedding
}

function questionnaireFromSchema(
  schema = DEFAULT_TEMPLATE_SCHEMA,
): WeddingQuestionnaire {
  return {
    id: 'wq-1',
    weddingId: 'wed-sync-1',
    ownerId: 'owner-1',
    templateId: 'tpl-1',
    title: 'Ankieta',
    introduction: '',
    status: 'submitted',
    schema,
    prefill: {},
    hasPublicToken: false,
    submittedAt: '2026-07-01T12:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-07-01T12:00:00.000Z',
  }
}

function place(
  role: WeddingPlace['role'],
  overrides?: Partial<WeddingPlace>,
): WeddingPlace {
  return {
    id: `place-${role}`,
    weddingId: 'wed-sync-1',
    role,
    label: null,
    placeId: null,
    formattedAddress: '',
    latitude: null,
    longitude: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const brideGeo: GeoPlace = {
  placeId: 'ChIJbride',
  formattedAddress: 'Michała Grażyńskiego 5, 41-810 Zabrze',
  latitude: 50.3241,
  longitude: 18.7856,
  label: 'Michała Grażyńskiego 5',
  provider: 'google',
}

const groomGeo: GeoPlace = {
  placeId: 'ChIJgroom',
  formattedAddress: 'Wolności 100, 41-800 Zabrze',
  latitude: 50.3012,
  longitude: 18.7851,
  label: 'Wolności 100',
  provider: 'google',
}

run('placeholder detection covers Polish stubs', () => {
  assert(isPlaceholderValue('ustalone później'), 'ustalone później')
  assert(isPlaceholderValue('jeszcze nie wiemy'), 'jeszcze nie wiemy')
  assert(isPlaceholderValue('do ustalenia'), 'do ustalenia')
  assert(isPlaceholderValue(''), 'empty')
  assert(!isPlaceholderValue('Michała Grażyńskiego 5'), 'real address')
})

run('normalizers: text / phone / date / time', () => {
  assert(
    normalizeComparableText('  Foo   Bar ') === 'foo bar',
    'text collapse',
  )
  assert(normalizePhoneDigits('+48 500-100-200') === '48500100200', 'phone')
  assert(normalizeDateValue('2026-09-12T14:00:00Z') === '2026-09-12', 'date')
  assert(normalizeTimeValue('9:05') === '09:05', 'time')
})

run('labels never fall back to uppercase technical keys', () => {
  for (const [key, label] of Object.entries(WEDDING_DAY_MAPPING_LABELS)) {
    assert(label !== key, `${key} has Polish label`)
    assert(label !== key.toUpperCase(), `${key} not uppercase`)
    assert(!/^[A-Z0-9_]+$/.test(label), `${key} label not SCREAMING`)
  }
  assert(
    resolveWeddingDayLabel('bridePreparationLocation') ===
      'Adres przygotowań Panny Młodej',
    'bride prep label',
  )
  assert(
    resolveWeddingDayLabel('unknownKey', 'Przyjazna etykieta') ===
      'Przyjazna etykieta',
    'unknown uses question label',
  )
})

run('mapped system question becomes candidate; empty omitted', () => {
  const q = questionnaireFromSchema()
  const answers: Record<string, PreWeddingAnswerValue> = {
    q4: brideGeo,
    q7: '',
  }
  const candidates = buildWeddingDaySyncCandidates({
    questionnaire: q,
    answers,
    wedding: baseWedding(),
    places: [],
  })
  assert(
    candidates.some((c) => c.mapping === 'bridePreparationLocation'),
    'bride prep candidate',
  )
  assert(
    !candidates.some((c) => c.mapping === 'groomPreparationLocation'),
    'empty groom omitted',
  )
})

run('unchanged answer omitted; placeholder vs GeoPlace is candidate', () => {
  const q = questionnaireFromSchema()
  const wedding = baseWedding({
    ceremonyTime: '14:00',
    couple: {
      ...baseWedding().couple,
      partner1: 'Anna Kowalska',
    },
  })
  const answers: Record<string, PreWeddingAnswerValue> = {
    q2: 'Anna Kowalska',
    q4: brideGeo,
    q12: '14:00',
  }
  const candidates = buildWeddingDaySyncCandidates({
    questionnaire: q,
    answers,
    wedding,
    places: [
      place('bride_preparation', {
        formattedAddress: 'ustalone później',
      }),
    ],
  })
  assert(
    !candidates.some((c) => c.mapping === 'brideName'),
    'identical name omitted',
  )
  assert(
    !candidates.some((c) => c.mapping === 'ceremonyTime'),
    'identical time omitted',
  )
  const bride = candidates.find((c) => c.mapping === 'bridePreparationLocation')
  assert(Boolean(bride), 'placeholder vs geo is candidate')
  assert(bride!.defaultSelected, 'placeholder current → default selected')
  assert(bride!.proposedGeo?.placeId === 'ChIJbride', 'full GeoPlace kept')
})

run('custom unmapped question never becomes candidate', () => {
  const schema = structuredClone(DEFAULT_TEMPLATE_SCHEMA)
  schema.sections[0]!.questions.push({
    id: 'q_custom_dog',
    label: 'Czy przy przygotowaniach będzie obecny pies?',
    type: 'yes_no',
    required: false,
  })
  const answers: Record<string, PreWeddingAnswerValue> = {
    q4: brideGeo,
    q_custom_dog: true,
  }
  const candidates = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(schema),
    answers,
    wedding: baseWedding(),
    places: [],
  })
  assert(
    !candidates.some((c) => c.questionId === 'q_custom_dog'),
    'custom excluded',
  )
  assert(
    !candidates.some((c) => c.label.toLowerCase().includes('pies')),
    'no fuzzy dog mapping',
  )
})

run('relabeled + reordered system question keeps mapping', () => {
  const schema = structuredClone(DEFAULT_TEMPLATE_SCHEMA)
  const q4 = schema.sections
    .flatMap((s) => s.questions)
    .find((q) => q.id === 'q4')!
  q4.label = 'Gdzie będzie przygotowywać się Panna Młoda?'
  // move q4 to last section
  schema.sections[0]!.questions = schema.sections[0]!.questions.filter(
    (q) => q.id !== 'q4',
  )
  schema.sections[schema.sections.length - 1]!.questions.push(q4)

  const candidates = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(schema),
    answers: { q4: brideGeo },
    wedding: baseWedding(),
    places: [],
  })
  const bride = candidates.find((c) => c.mapping === 'bridePreparationLocation')
  assert(Boolean(bride), 'still mapped after rename/reorder')
  assert(
    bride!.label === 'Adres przygotowań Panny Młodej',
    'canonical Polish label preferred',
  )
})

run('duplicate mapping: only first question becomes candidate', () => {
  const schema = structuredClone(DEFAULT_TEMPLATE_SCHEMA)
  const firstSection = schema.sections[0]!
  const idx = firstSection.questions.findIndex((q) => q.id === 'q4')
  if (idx >= 0) {
    firstSection.questions.splice(idx + 1, 0, {
      id: 'q4_dup',
      label: 'Kopia adresu PM',
      type: 'address',
      required: false,
      weddingDayMapping: 'bridePreparationLocation',
    })
  } else {
    // v2 schema may place q4 later — append duplicate after q4 wherever it lives
    for (const section of schema.sections) {
      const i = section.questions.findIndex((q) => q.id === 'q4')
      if (i < 0) continue
      section.questions.splice(i + 1, 0, {
        id: 'q4_dup',
        label: 'Kopia adresu PM',
        type: 'address',
        required: false,
        weddingDayMapping: 'bridePreparationLocation',
      })
      break
    }
  }
  const candidates = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(schema),
    answers: {
      q4: brideGeo,
      q4_dup: groomGeo,
    },
    wedding: baseWedding(),
    places: [],
  })
  const bride = candidates.filter(
    (c) => c.mapping === 'bridePreparationLocation',
  )
  assert(bride.length === 1, 'single candidate for mapping')
  assert(bride[0]!.questionId === 'q4', 'first question wins')
})

run('GeoPlace equality + richness', () => {
  assert(geoPlacesEqual(brideGeo, { ...brideGeo }), 'same placeId equal')
  assert(
    geoPlacesEqual(brideGeo, {
      ...brideGeo,
      placeId: null,
      latitude: 50.3241,
      longitude: 18.7856,
    }),
    'coords equal',
  )
  assert(
    richnessRank(locationRichness(brideGeo)) >
      richnessRank(locationRichness({ ...brideGeo, placeId: null, latitude: null, longitude: null })),
    'verified richer than manual',
  )
  assert(
    !valuesAreSemanticallyEqual(
      'bridePreparationLocation',
      'ustalone później',
      'Michała Grażyńskiego 5, 41-810 Zabrze',
      { proposedGeo: brideGeo },
    ),
    'placeholder != geo',
  )
})

run('poorer incoming location flagged; richer default-selected', () => {
  const verified = place('bride_preparation', {
    placeId: 'ChIJverified',
    formattedAddress: 'Zweryfikowany 1, Zabrze',
    latitude: 50.3,
    longitude: 18.7,
    label: 'Zweryfikowany',
  })
  const candidates = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(),
    answers: {
      q4: 'tylko tekst bez współrzędnych',
    },
    wedding: baseWedding({
      bridePreparationLocation: 'Zweryfikowany 1, Zabrze',
    }),
    places: [verified],
  })
  const bride = candidates.find((c) => c.mapping === 'bridePreparationLocation')
  assert(Boolean(bride), 'still shown as difference')
  assert(bride!.incomingPoorer, 'incoming poorer flagged')
  assert(!bride!.defaultSelected, 'not preselected')
})

run('grouping hides empty groups; groups use Polish titles', () => {
  const candidates = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(),
    answers: {
      q4: brideGeo,
      q7: groomGeo,
      q3: '501502503',
    },
    wedding: baseWedding(),
    places: [],
  })
  const groups = groupWeddingDaySyncCandidates(candidates)
  assert(groups.some((g) => g.group === 'places'), 'places group')
  assert(groups.some((g) => g.group === 'contacts'), 'contacts group')
  assert(!groups.some((g) => g.items.length === 0), 'no empty groups')
})

run('unknown mapping ignored safely', () => {
  const schema = structuredClone(DEFAULT_TEMPLATE_SCHEMA)
  schema.sections[0]!.questions.push({
    id: 'q_bad',
    label: 'Dziwne pole',
    type: 'short_text',
    required: false,
    weddingDayMapping: 'totallyUnknownMapping',
  })
  const candidates = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(schema),
    answers: { q_bad: 'wartość' },
    wedding: baseWedding(),
    places: [],
  })
  assert(
    !candidates.some((c) => c.mapping === 'totallyUnknownMapping'),
    'unknown ignored',
  )
})

run('UI source: no raw technical keys as visible titles', () => {
  const workspace = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingPreWeddingQuestionnaireWorkspace.tsx',
    ),
    'utf8',
  )
  assert(workspace.includes('Aktualizacje z ankiety'), 'premium heading')
  assert(!workspace.includes('Dane z ankiety → Dzień ślubu'), 'old debug title gone')
  assert(workspace.includes('applyWeddingDaySyncCandidates'), 'uses apply service')
  assert(workspace.includes('buildWeddingDaySyncCandidates'), 'uses candidates')
  assert(
    !workspace.includes('onWeddingDayApply'),
    'no draft-only apply path',
  )
})

run('apply service preserves GeoPlace upsert path', () => {
  const applySrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/prewedding/weddingDaySync/applyWeddingDaySync.ts',
    ),
    'utf8',
  )
  assert(applySrc.includes('weddingPlaceService.upsert'), 'upsert places')
  assert(applySrc.includes('mergeLocationAnswerWithExisting'), 'merge geo')
  assert(applySrc.includes('travelService.invalidate'), 'route invalidate')
  assert(applySrc.includes('travelService.recalculate'), 'route recalc')
  assert(
    applySrc.includes('Zastosowano dane z ankiety przedślubnej'),
    'history title',
  )
  assert(
    !/\bfrom\s+['"][^'"]*noteService['"]/.test(applySrc) &&
      !/\bnoteService\./.test(applySrc),
    'no noteService apply path',
  )
  assert(applySrc.includes('CANONICAL_WEDDING_DAY_MAPPINGS'), 'canonical gate')
})

run('custom question newQuestion has no mapping in editor', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'src/pages/PreWeddingTemplatesPage.tsx'),
    'utf8',
  )
  assert(page.includes('function newQuestion()'), 'newQuestion exists')
  const fn = page.slice(page.indexOf('function newQuestion()'))
  const body = fn.slice(0, fn.indexOf('function newSection()'))
  assert(!body.includes('weddingDayMapping'), 'custom has no mapping')
})

run('canonical allowlist: ceremonyTime + location candidates', () => {
  const candidates = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(),
    answers: {
      q12: '15:30',
      q4: brideGeo,
      q11: groomGeo,
    },
    wedding: baseWedding({ ceremonyTime: '14:00' }),
    places: [],
  })
  assert(
    candidates.some((c) => c.mapping === 'ceremonyTime'),
    'A: ceremonyTime candidate',
  )
  assert(
    candidates.some((c) => c.mapping === 'bridePreparationLocation'),
    'B: location candidate',
  )
  assert(
    candidates.some((c) => c.mapping === 'ceremonyLocation'),
    'B: ceremony location candidate',
  )
})

run('renamed mapped ceremony question still candidate', () => {
  const schema = structuredClone(DEFAULT_TEMPLATE_SCHEMA)
  const q12 = schema.sections
    .flatMap((s) => s.questions)
    .find((q) => q.id === 'q12')!
  q12.label = 'O której rozpoczyna się ceremonia?'
  assert(q12.weddingDayMapping === 'ceremonyTime', 'mapping preserved')
  const candidates = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(schema),
    answers: { q12: '16:00' },
    wedding: baseWedding({ ceremonyTime: '' }),
    places: [],
  })
  assert(
    candidates.some((c) => c.mapping === 'ceremonyTime'),
    'C: renamed still candidate',
  )
})

run('custom TIME with ceremony wording but no mapping → not candidate', () => {
  const schema = structuredClone(DEFAULT_TEMPLATE_SCHEMA)
  schema.sections[0]!.questions.push({
    id: 'q_custom_start',
    label: 'Start ceremonii',
    type: 'time',
    required: false,
  })
  const candidates = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(schema),
    answers: { q_custom_start: '14:00', q12: '14:00' },
    wedding: baseWedding({ ceremonyTime: '14:00' }),
    places: [],
  })
  assert(
    !candidates.some((c) => c.questionId === 'q_custom_start'),
    'D: custom unmapped excluded',
  )
  assert(
    !candidates.some((c) => c.mapping === 'ceremonyTime'),
    'identical ceremonyTime omitted',
  )
})

run('note-only mappings never become Apply candidates', () => {
  const noteOnly = [
    'blessingPlan',
    'groupPhotoPlan',
    'guestWishesPlan',
    'ceremonyNotes',
    'photoVideoPriorities',
    'djBandProvider',
    'guestCount',
    'sensitiveFamilyNotes',
    'departureToCeremonyTime',
    'receptionArrivalTime',
    'groomDepartureNote',
    'smallGroupPhotosPlan',
  ] as const

  const answers: Record<string, PreWeddingAnswerValue> = {
    q8: '12:00',
    q9: 'Tak, jedno wspólne u Panny Młodej',
    q10: '13:00',
    q13: 'czytania bliskich',
    q14: 'Chcemy pod kościołem',
    q15: 'Życzenia odbędą się na sali',
    q17: '17:00',
    q18: '130',
    q19: true,
    q21: 'emocje i bliskość',
    q24: 'ważne',
    q26: 'dj willy',
  }

  const candidates = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(),
    answers,
    wedding: baseWedding(),
    places: [],
    notes: [],
  })

  for (const key of noteOnly) {
    assert(
      !candidates.some((c) => c.mapping === key),
      `note-only ${key} not candidate`,
    )
  }

  assert(
    !CANONICAL_WEDDING_DAY_MAPPINGS.has('blessingPlan'),
    'E–N: not in canonical set',
  )
  for (const key of noteOnly) {
    assert(
      NOTE_ONLY_WEDDING_DAY_MAPPINGS.has(key),
      `${key} classified note-only`,
    )
    assert(!CANONICAL_WEDDING_DAY_MAPPINGS.has(key), `${key} not canonical`)
  }
})

run('MappingPanel hidden when zero canonical candidates', () => {
  const workspace = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingPreWeddingQuestionnaireWorkspace.tsx',
    ),
    'utf8',
  )
  assert(
    workspace.includes('{candidates.length > 0 && ('),
    'P: panel gated on candidates',
  )
  assert(
    workspace.includes('kontakty, datę'),
    'canonical copy mentions structured fields',
  )
})

run('Brief registry still knows descriptive mappings', () => {
  const briefReg = readFileSync(
    resolve(process.cwd(), 'src/features/wedding-brief/briefFieldRegistry.ts'),
    'utf8',
  )
  for (const key of [
    'blessingPlan',
    'groupPhotoPlan',
    'photoVideoPriorities',
    'djBandProvider',
    'departureToCeremonyTime',
    'receptionArrivalTime',
  ]) {
    assert(briefReg.includes(`${key}:`), `O: Brief still has ${key}`)
  }
  assert(
    !briefReg.includes('CANONICAL_WEDDING_DAY_MAPPINGS'),
    'Brief not coupled to Apply allowlist',
  )
})

run('resubmission path does not reintroduce note-only Apply', () => {
  const catalog = readFileSync(
    resolve(
      process.cwd(),
      'src/features/prewedding/weddingDaySync/mappingCatalog.ts',
    ),
    'utf8',
  )
  assert(
    catalog.includes('CANONICAL_WEDDING_DAY_MAPPINGS'),
    'T: canonical set is source of Apply',
  )
  const buildSrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/prewedding/weddingDaySync/buildCandidates.ts',
    ),
    'utf8',
  )
  assert(
    buildSrc.includes('CANONICAL_WEDDING_DAY_MAPPINGS.has(mapping)'),
    'T: candidates gated by canonical',
  )
  assert(
    !buildSrc.includes('noteAlreadyApplied'),
    'T: no note-dedupe candidate path',
  )
})

console.log('\nWedding Day sync acceptance finished.')
