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
import { splitPersonName } from '@/lib/api/weddings/weddingMappers'
import {
  resolveCoupleNamesFromFormParts,
  weddingToContractAnswerFields,
} from '@/lib/forms/weddingCoupleNameFields'
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
import {
  mergeLocationAnswerWithExisting,
  normalizeLocationAnswer,
} from '@/features/travel/weddingLocationModel'
import type {
  PreWeddingAnswerValue,
  WeddingQuestionnaire,
} from '@/types/preweddingQuestionnaire'
import type { GeoPlace, WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'

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

function run(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn()
    if (result && typeof (result as Promise<void>).then === 'function') {
      ;(result as Promise<void>)
        .then(() => {
          console.log(`PASS  ${name}`)
        })
        .catch((err) => {
          console.error(`FAIL  ${name}`)
          console.error(err instanceof Error ? err.message : err)
          process.exitCode = 1
        })
      return
    }
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
  formattedAddress: 'Wolności 100, 00-001 Warszawa',
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
  assert(!bride!.defaultSelected, 'not preselected — auto-protect')
})

run('A. verified current + manual questionnaire → explicit Apply selectable', () => {
  const verified = place('bride_preparation', {
    placeId: 'ChIJistanbul',
    formattedAddress: 'Jodłowa 13, 30-251 Kraków',
    latitude: 50.05,
    longitude: 19.88,
    label: 'Zinar Castle',
  })
  const candidates = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(),
    answers: { q4: 'Jodłowa 13, 30-251 Kraków' },
    wedding: baseWedding({
      bridePreparationLocation: 'Zinar Castle — Jodłowa 13, 30-251 Kraków',
    }),
    places: [verified],
  })
  const bride = candidates.find((c) => c.mapping === 'bridePreparationLocation')
  assert(Boolean(bride), 'candidate visible')
  assert(bride!.incomingPoorer, 'flagged as poorer for warning')
  assert(!bride!.defaultSelected, 'B. not auto-selected')

  const workspace = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingPreWeddingQuestionnaireWorkspace.tsx',
    ),
    'utf8',
  )
  assert(
    !workspace.includes('disabled={applying || candidate.incomingPoorer}'),
    'A/G. checkbox and row Apply not blocked by incomingPoorer',
  )
  assert(
    workspace.includes(
      'Obecna lokalizacja jest zweryfikowana. Zastosowanie danych',
    ),
    'downgrade warning copy',
  )
  assert(
    !workspace.includes('nie zastąpią jej automatycznie'),
    'old blocking copy removed',
  )
})

run('C–E. explicit Apply replaces verified with manual; clears stale geo', () => {
  const incomingManual = normalizeLocationAnswer('dasdas')
  const geo = mergeLocationAnswerWithExisting(incomingManual, null)
  assertEq(geo.formattedAddress, 'dasdas', 'C. manual text persisted')
  assertEq(geo.placeId, null, 'D. no placeId')
  assertEq(geo.latitude, null, 'D. no lat')
  assertEq(geo.longitude, null, 'D. no lng')
  assertEq(geo.provider, null, 'D. no provider')
  assertEq(geo.label, null, 'D. no stale venue name')

  // Document why apply must pass null existing: legacy merge keeps stale geo.
  const existingVerified: WeddingPlace = place('bride_preparation', {
    placeId: 'ChIJold',
    formattedAddress: 'Istanbul old',
    latitude: 41.0,
    longitude: 29.0,
    label: 'Old Venue',
  })
  const wrongMerge = mergeLocationAnswerWithExisting(
    incomingManual,
    existingVerified,
  )
  assertEq(wrongMerge.placeId, 'ChIJold', 'legacy merge keeps placeId')
  assertEq(wrongMerge.latitude, 41.0, 'legacy merge keeps lat')

  const applySrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/prewedding/weddingDaySync/applyWeddingDaySync.ts',
    ),
    'utf8',
  )
  assert(
    !applySrc.includes('if (candidate.incomingPoorer)'),
    'explicit Apply no longer throws on poorer',
  )
  assert(
    applySrc.includes('mergeLocationAnswerWithExisting(incoming, null)'),
    'apply uses candidate-only geo (null existing)',
  )
  assert(applySrc.includes('resolve: false'), 'no geocode invent on apply')

  // E. candidate-owned valid geo preserved
  const incomingVerified = normalizeLocationAnswer({
    placeId: 'ChIJnew',
    formattedAddress: 'Nowa 1, Kraków',
    latitude: 50.1,
    longitude: 19.9,
    label: 'Nowa Sala',
  })
  const kept = mergeLocationAnswerWithExisting(incomingVerified, null)
  assertEq(kept.placeId, 'ChIJnew', 'E. own placeId')
  assertEq(kept.latitude, 50.1, 'E. own lat')
  assertEq(kept.longitude, 19.9, 'E. own lng')
})

run('F. bulk Apply can include explicit downgrade candidate', () => {
  const workspace = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingPreWeddingQuestionnaireWorkspace.tsx',
    ),
    'utf8',
  )
  // Checkbox enablement is the gate for bulk inclusion
  const checkboxBlock = workspace.slice(
    workspace.indexOf('type="checkbox"'),
    workspace.indexOf('type="checkbox"') + 200,
  )
  assert(
    checkboxBlock.includes('disabled={applying}'),
    'F. checkbox only disabled while applying',
  )
  assert(
    !checkboxBlock.includes('incomingPoorer'),
    'F. poorer selectable for bulk',
  )
})

run('H. travel after downgrade does not use stale coords (source)', () => {
  const travelUi = readFileSync(
    resolve(process.cwd(), 'src/features/travel/travelUi.ts'),
    'utf8',
  )
  assert(
    travelUi.includes('if (!place || !isPlaceVerified(place)) continue'),
    'H. route skips unverified — no stale coords from manual text',
  )
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
  assert(
    applySrc.includes('mergeLocationAnswerWithExisting(incoming, null)'),
    'candidate-only geo (no stale merge)',
  )
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

run('A–E. contact Apply: empty → candidate; equal hydrated → suppressed', () => {
  const answers: Record<string, PreWeddingAnswerValue> = {
    q5: 'karol nowakowski',
    q6: '555444335',
  }

  const emptyCouple = baseWedding({
    couple: {
      ...baseWedding().couple,
      partner2: '',
      partner2FirstName: undefined,
      partner2LastName: undefined,
      partner2Phone: undefined,
    },
  })
  const before = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(),
    answers,
    wedding: emptyCouple,
    places: [],
  })
  assert(
    before.some((c) => c.mapping === 'groomName'),
    'A. empty groom name → candidate',
  )
  assert(
    before.some((c) => c.mapping === 'groomPhone'),
    'A. empty groom phone → candidate',
  )

  // B/C. After Apply + persisted rehydrate (couple matches questionnaire)
  const afterPersist = baseWedding({
    couple: {
      ...baseWedding().couple,
      partner2: 'karol nowakowski',
      partner2FirstName: 'karol',
      partner2LastName: 'nowakowski',
      partner2Phone: '555444335',
    },
  })
  const after = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(),
    answers,
    wedding: afterPersist,
    places: [],
  })
  assert(
    !after.some((c) => c.mapping === 'groomName'),
    'B/C. equal groom name suppressed after rehydrate',
  )
  assert(
    !after.some((c) => c.mapping === 'groomPhone'),
    'B/C. equal groom phone suppressed after rehydrate',
  )

  // D. phone formatting equivalence
  const phoneFmt = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(),
    answers: { q6: '555 444 335' },
    wedding: baseWedding({
      couple: {
        ...baseWedding().couple,
        partner2Phone: '555444335',
      },
    }),
    places: [],
  })
  assert(
    !phoneFmt.some((c) => c.mapping === 'groomPhone'),
    'D. phone digits-equal suppresses candidate',
  )

  // E. bulk both absent
  assertEq(
    after.filter((c) => c.mapping === 'groomName' || c.mapping === 'groomPhone')
      .length,
    0,
    'E. bulk name+phone both absent',
  )
})

run('F–G. questionnaire history preserved; later Q change resurfaces', () => {
  const applySrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/prewedding/weddingDaySync/applyWeddingDaySync.ts',
    ),
    'utf8',
  )
  assert(
    !applySrc.includes('weddingQuestionnaireService'),
    'F. Apply does not mutate questionnaire answers',
  )
  assert(
    !applySrc.includes('updateResponse') &&
      !applySrc.includes('updateFormAnswer'),
    'F. no questionnaire answer rewrite API',
  )

  const resurfaced = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(),
    answers: { q5: 'Karol Kowalski' },
    wedding: baseWedding({
      couple: {
        ...baseWedding().couple,
        partner2: 'karol nowakowski',
        partner2FirstName: 'karol',
        partner2LastName: 'nowakowski',
      },
    }),
    places: [],
  })
  assert(
    resurfaced.some((c) => c.mapping === 'groomName'),
    'G. later different Q value → new candidate',
  )
})

run('contact Apply persists form_answers couple fields (source)', () => {
  const applySrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/prewedding/weddingDaySync/applyWeddingDaySync.ts',
    ),
    'utf8',
  )
  assert(
    applySrc.includes('persistWeddingContractAnswerFields'),
    'writes contract form_answers like Detail edit',
  )
  assert(
    applySrc.includes('splitPersonName'),
    'name Apply syncs first/last for row+form write',
  )
  assert(
    applySrc.includes("partner2FirstName: split.first"),
    'groom first synced',
  )

  const shell = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingDetailV2.tsx',
    ),
    'utf8',
  )
  assert(
    shell.includes("onWeddingSynced={(next) =>"),
    'cache set from Apply result',
  )
  assert(
    shell.includes("setQueryData(['weddings', userId, wedding.id], next)"),
    'immediate wedding cache update',
  )
})

run('H. location explicit downgrade fix still intact', () => {
  const applySrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/prewedding/weddingDaySync/applyWeddingDaySync.ts',
    ),
    'utf8',
  )
  assert(
    applySrc.includes('mergeLocationAnswerWithExisting(incoming, null)'),
    'H. candidate-only geo',
  )
  assert(applySrc.includes('resolve: false'), 'H. no geocode invent')
  assert(
    !applySrc.includes('if (candidate.incomingPoorer)'),
    'H. poorer not hard-blocked',
  )
})

run('I–J. ceremony time + wedding date Apply equality still works', () => {
  assert(
    !buildWeddingDaySyncCandidates({
      questionnaire: questionnaireFromSchema(),
      answers: { q12: '14:00' },
      wedding: baseWedding({ ceremonyTime: '14:00' }),
      places: [],
    }).some((c) => c.mapping === 'ceremonyTime'),
    'I. equal ceremony time omitted',
  )
  assert(
    buildWeddingDaySyncCandidates({
      questionnaire: questionnaireFromSchema(),
      answers: { q12: '15:30' },
      wedding: baseWedding({ ceremonyTime: '14:00' }),
      places: [],
    }).some((c) => c.mapping === 'ceremonyTime'),
    'I. different ceremony time candidate',
  )
  assert(
    !buildWeddingDaySyncCandidates({
      questionnaire: questionnaireFromSchema(),
      answers: { q1: '2026-09-12' },
      wedding: baseWedding({ date: '2026-09-12' }),
      places: [],
    }).some((c) => c.mapping === 'weddingDate'),
    'J. equal wedding date omitted',
  )
})

run('K–L. unmapped custom + no label matching', () => {
  const schema = structuredClone(DEFAULT_TEMPLATE_SCHEMA)
  schema.sections[0]!.questions.push({
    id: 'q_custom_phone',
    label: 'Telefon awaryjny do Pana Młodego',
    type: 'short_text',
    required: false,
  })
  const candidates = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(schema),
    answers: { q_custom_phone: '111222333', q6: '555444335' },
    wedding: baseWedding({
      couple: { ...baseWedding().couple, partner2Phone: undefined },
    }),
    places: [],
  })
  assert(
    !candidates.some((c) => c.questionId === 'q_custom_phone'),
    'K. unmapped custom excluded',
  )
  assert(
    candidates.some((c) => c.mapping === 'groomPhone'),
    'K. mapped phone still candidate',
  )
  const buildSrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/prewedding/weddingDaySync/buildCandidates.ts',
    ),
    'utf8',
  )
  assert(
    !buildSrc.includes('label.includes') && !buildSrc.includes('label.contains'),
    'L. no label matching',
  )
})

run('PARTIAL NAME. karol nowakowski — first must survive hydrate', () => {
  const parsed = splitPersonName('karol nowakowski')
  assertEq(parsed.first, 'karol', 'A. parser first')
  assertEq(parsed.last, 'nowakowski', 'A. parser last')

  // Simulate Apply model write
  const afterApply = baseWedding({
    couple: {
      ...baseWedding().couple,
      partner2: 'karol nowakowski',
      partner2FirstName: parsed.first,
      partner2LastName: parsed.last,
      partner2Phone: '555444335',
    },
  })
  assertEq(afterApply.couple.partner2, 'karol nowakowski', 'A. composed')
  assertEq(afterApply.couple.partner2FirstName, 'karol', 'A. first on model')
  assertEq(afterApply.couple.partner2LastName, 'nowakowski', 'A. last on model')

  const fields = weddingToContractAnswerFields(afterApply)
  assertEq(fields['partner2.firstName'], 'karol', 'A. form first persisted')
  assertEq(fields['partner2.lastName'], 'nowakowski', 'A. form last persisted')
  assertEq(fields['partner2.phone'], '555444335', 'B. phone persisted')

  // Screenshot bug: form had lastName only (or firstName = "—")
  const poisoned = resolveCoupleNamesFromFormParts({
    formBrideFirst: '',
    formBrideLast: '',
    formGroomFirst: '—',
    formGroomLast: 'nowakowski',
    wedding: baseWedding({
      couple: {
        ...baseWedding().couple,
        partner2: 'karol nowakowski',
        partner2FirstName: 'karol',
        partner2LastName: 'nowakowski',
      },
    }),
  })
  assertEq(
    poisoned.partner2,
    'karol nowakowski',
    'hydrate keeps full name when form first is placeholder',
  )
  assertEq(poisoned.partner2FirstName, 'karol', 'first restored')
  assertEq(poisoned.partner2LastName, 'nowakowski', 'last kept')

  const lastOnly = resolveCoupleNamesFromFormParts({
    formBrideFirst: '',
    formBrideLast: '',
    formGroomFirst: '',
    formGroomLast: 'nowakowski',
    wedding: baseWedding({
      couple: {
        ...baseWedding().couple,
        partner2: 'karol nowakowski',
        partner2FirstName: 'karol',
        partner2LastName: 'nowakowski',
      },
    }),
  })
  assertEq(
    lastOnly.partner2,
    'karol nowakowski',
    'last-only form must not collapse partner2',
  )
  assertEq(lastOnly.partner2FirstName, 'karol', 'first from wedding')

  // Placeholder first on model must not be written back
  const dashModel = baseWedding({
    couple: {
      ...baseWedding().couple,
      partner2: 'karol nowakowski',
      partner2FirstName: '—',
      partner2LastName: 'nowakowski',
    },
  })
  assertEq(
    weddingToContractAnswerFields(dashModel)['partner2.firstName'],
    'karol',
    'persist splits full name when first is placeholder',
  )

  // Candidate rebuild after healthy hydrate
  const after = buildWeddingDaySyncCandidates({
    questionnaire: questionnaireFromSchema(),
    answers: { q5: 'karol nowakowski', q6: '555444335' },
    wedding: baseWedding({
      couple: {
        ...baseWedding().couple,
        partner2: poisoned.partner2,
        partner2FirstName: poisoned.partner2FirstName,
        partner2LastName: poisoned.partner2LastName,
        partner2Phone: '555444335',
      },
    }),
    places: [],
  })
  assert(
    !after.some((c) => c.mapping === 'groomName'),
    'A. no groom-name candidate after full hydrate',
  )
  assert(
    !after.some((c) => c.mapping === 'groomPhone'),
    'B/C. no phone candidate',
  )

  // D. bride symmetry
  const brideFields = weddingToContractAnswerFields(
    baseWedding({
      couple: {
        ...baseWedding().couple,
        partner1: 'anna kowalska',
        partner1FirstName: 'anna',
        partner1LastName: 'kowalska',
      },
    }),
  )
  assertEq(brideFields['partner1.firstName'], 'anna', 'D. bride first')
  assertEq(brideFields['partner1.lastName'], 'kowalska', 'D. bride last')

  // Apply source: persist pre-hydrate snapshot
  const applySrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/prewedding/weddingDaySync/applyWeddingDaySync.ts',
    ),
    'utf8',
  )
  assert(applySrc.includes('hydrate: false'), 'update without poison hydrate')
  assert(applySrc.includes('coupleSnapshot'), 'persist Apply snapshot')

  const mergeSrc = readFileSync(
    resolve(process.cwd(), 'src/lib/forms/mergeFormAnswersIntoWedding.ts'),
    'utf8',
  )
  assert(
    mergeSrc.includes('resolveCoupleNamesFromFormParts'),
    'hydrate uses shared name resolver',
  )
})

console.log('\nWedding Day sync acceptance finished.')
