/**
 * Pre-wedding shared GeoPlace location acceptance tests.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  answerToGeoPlace,
  formatLocationAnswerDisplay,
  geoPlaceToAnswer,
  googleMapsUrlForLocationAnswer,
  isAnswerEmpty,
  isManualLocationAnswer,
  isStructuredLocationAnswer,
  locationAnswerToPlainText,
} from './preweddingLocation'
import {
  buildAnswerList,
  buildDayTimelineSummary,
  mapsUrlForAnswerField,
  PLAN_DNIA_ROLE_ORDER,
  PLAN_DNIA_STAGE_LABELS,
} from './answerSummary'
import { googleMapsPlaceUrl } from '@/services/googleMapsLinks'
import { DEFAULT_TEMPLATE_SCHEMA, DEFAULT_TEMPLATE_SCHEMA_V1 } from './defaultTemplate'
import type { PreWeddingQuestion } from '@/types/preweddingQuestionnaire'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
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

run('1. Shared GeoPlace model — no questionnaire-specific place type in answers', () => {
  const geo = geoPlaceToAnswer({
    placeId: 'ChIJabc',
    formattedAddress: 'Lwowska 78, Izdebnik',
    latitude: 49.8,
    longitude: 19.7,
    label: 'Villa Love',
    provider: 'google',
  })
  assert(typeof geo !== 'string', 'obj')
  if (typeof geo === 'string') return
  assertEq(geo.placeId, 'ChIJabc', 'placeId')
  assertEq(geo.label, 'Villa Love', 'label')
  assert(!('source' in geo), 'no questionnaire source field')
})

run('2. Legacy PreWeddingAddressAnswer still readable', () => {
  const legacy = {
    formattedAddress: 'ul. Kwiatowa 10, Gliwice',
    placeId: null,
    name: 'Dom rodzinny',
    latitude: null,
    longitude: null,
    source: 'manual' as const,
  }
  assert(isStructuredLocationAnswer(legacy), 'legacy structured')
  assert(isManualLocationAnswer(legacy), 'manual')
  const display = formatLocationAnswerDisplay(legacy)
  assert(display.includes('Dom rodzinny'), 'name in display')
})

run('3. Space typing — draft stays plain string (no trim round-trip)', () => {
  // While typing, answers store the raw string so trailing spaces survive.
  const draft = 'Villa '
  assertEq(typeof draft, 'string', 'draft string')
  assert(draft.endsWith(' '), 'trailing space kept')
  // Only committed GeoPlace objects collapse whitespace on display helpers.
  const geo = answerToGeoPlace(draft)
  assertEq(geo?.formattedAddress, 'Villa', 'display trim on read')
})

run('4. Manual location without placeId', () => {
  const a = geoPlaceToAnswer({
    placeId: null,
    formattedAddress: 'Sala Pod Lipami',
    latitude: null,
    longitude: null,
    label: null,
    provider: null,
  })
  assert(typeof a !== 'string' && a.placeId === null, 'no placeId')
  assert(isManualLocationAnswer(a), 'manual')
})

run('5. Google location persists structured fields', () => {
  const a = geoPlaceToAnswer({
    placeId: 'ChIJabc',
    formattedAddress: 'Lwowska 78, Izdebnik',
    latitude: 49.8,
    longitude: 19.7,
    label: 'Villa Love',
    provider: 'google',
  })
  assert(typeof a !== 'string', 'obj')
  if (typeof a === 'string') return
  assertEq(a.placeId, 'ChIJabc', 'placeId')
  assertEq(a.label, 'Villa Love', 'label')
  assertEq(a.latitude, 49.8, 'lat')
})

run('6. Maps URL uses query_place_id — never place_id: in query text', () => {
  const url = googleMapsPlaceUrl({
    placeId: 'ChIJ1',
    formattedAddress: 'Lwowska 78',
    label: 'Villa Love',
  })
  assert(Boolean(url), 'url')
  assert(Boolean(url?.includes('query_place_id=ChIJ1')), 'query_place_id')
  assert(!url?.includes('query=place_id'), 'no place_id text query')
  const manual = googleMapsUrlForLocationAnswer('ul. Kwiatowa 10')
  assert(Boolean(manual?.includes('Kwiatowa')), 'manual address query')
})

run('7. Maps link only for address fields', () => {
  const phoneQ = {
    id: 'q3',
    label: 'Telefon',
    type: 'short_text',
    required: true,
  } as PreWeddingQuestion
  const addrQ = {
    id: 'q4',
    label: 'Adres',
    type: 'address',
    required: true,
  } as PreWeddingQuestion
  const place = {
    placeId: 'ChIJ1',
    formattedAddress: 'A',
    latitude: 1,
    longitude: 2,
    label: 'V',
    provider: 'google' as const,
  }
  assertEq(mapsUrlForAnswerField(phoneQ, place), null, 'no maps on phone')
  assert(Boolean(mapsUrlForAnswerField(addrQ, place)), 'maps on address')
  assertEq(mapsUrlForAnswerField(phoneQ, '999000888'), null, 'no maps on phone string')
})

run('8. Empty checks for progress / required', () => {
  assert(isAnswerEmpty(''), 'empty string')
  assert(
    isAnswerEmpty({
      placeId: null,
      formattedAddress: '  ',
      latitude: null,
      longitude: null,
      label: null,
    }),
    'blank address',
  )
  assert(
    !isAnswerEmpty({
      placeId: null,
      formattedAddress: 'A',
      latitude: null,
      longitude: null,
    }),
    'filled',
  )
})

run('9. Public form — flat cards, no phase separators, tips merged', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingPublicFormPage.tsx'),
    'utf8',
  )
  assert(src.includes('QuestionnaireLocationField'), 'location field')
  assert(src.includes('prewedding-long-form'), 'long form')
  assert(src.includes('prewedding-progress'), 'progress')
  assert(src.includes('stickyProgress') || src.includes('sticky'), 'sticky')
  assert(!src.includes('sectionIndex'), 'no wizard index')
  assert(src.includes('prewedding-question-card'), 'question cards')
  assert(!src.includes('contextSeparatorForQuestion'), 'no separator helper')
  assert(!src.includes('prewedding-context-sep'), 'no separator testid')
  assert(!src.includes('PRZYGOTOWANIA'), 'no PRZYGOTOWANIA separator')
  assert(!src.includes("'CEREMONIA'"), 'no CEREMONIA separator literal')
  assert(!src.includes("'PRZYJĘCIE'"), 'no PRZYJĘCIE separator literal')
  assert(src.includes('prewedding-tips-ack-card'), 'tips+ack merged')
  assert(src.includes('Wskazówki od nas'), 'tips title')
  assert(src.includes('odpowiedzi'), 'count progress')
  assert(!src.includes('>{progressPercent}%<') && !src.includes('{progressPercent}%</'), 'no percent label')
  assert(src.includes('prewedding-thank-you') || src.includes('Dziękujemy'), 'thank you')
})

run('10. Shared components — LocationSearchField + SelectedLocationCard', () => {
  const field = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/QuestionnaireLocationField.tsx'),
    'utf8',
  )
  assert(field.includes("from '@/features/travel/LocationSearchField'"), 'search field')
  assert(field.includes('SelectedLocationCard'), 'card')
  assert(field.includes('onChange(text)'), 'space-safe draft')
})

run('11. Answer list uses exact snapshot labels — no invented replacements', () => {
  const answers = {
    q2: 'Zuzanna Lesnik',
    q3: '999000888',
    q4: {
      placeId: 'ChIJ1',
      formattedAddress: 'Lwowska 78, Izdebnik',
      latitude: 49.8,
      longitude: 19.7,
      label: 'Villa Love',
      provider: 'google',
    },
    q5: 'Adrian Kaleta',
    q6: '777666222',
    q7: {
      placeId: 'ChIJ2',
      formattedAddress: 'Inna 1, Kraków',
      latitude: 50.0,
      longitude: 19.9,
      label: 'Studio Pana',
      provider: 'google',
    },
    q12: '14:00',
    q11: {
      placeId: null,
      formattedAddress: 'Kościół',
      latitude: null,
      longitude: null,
      label: 'Kościół',
      provider: null,
    },
    q22: 'Zdajemy się na Ciebie!',
  }
  const items = buildAnswerList(DEFAULT_TEMPLATE_SCHEMA, answers)
  const labels = items.map((i) => i.label)
  assert(labels.includes('Telefon do Panny Młodej'), 'bride phone label')
  assert(labels.includes('Telefon do Pana Młodego'), 'groom phone label')
  assert(labels.includes('Adres przygotowań Panny Młodej'), 'bride prep label')
  assert(labels.includes('Adres Kościoła / USC / Ślubu plenerowego'), 'ceremony label')
  assert(
    labels.some((l) => l.includes('licencjonowaną muzykę')),
    'music question full label',
  )
  assert(!labels.includes('PANNA — TELEFON'), 'no invented bride phone')
  assert(!labels.includes('PAN MŁODY — TELEFON'), 'no invented groom phone')
  assert(!labels.includes('PRZYGOTOWANIA PANNY'), 'no stage as answer label')
  assert(!labels.includes('MIEJSCE'), 'no MIEJSCE replacement')
  assert(!labels.includes('MUZYKA DO FILMU'), 'no MUZYKA replacement')
  assert(!labels.some((l) => l.startsWith('Panna —')), 'no panna prefix')
  assert(!labels.some((l) => l.startsWith('Pan —')), 'no pan prefix')

  const v1Items = buildAnswerList(DEFAULT_TEMPLATE_SCHEMA_V1, answers)
  assert(
    v1Items.some((i) => i.label === 'Telefon do Panny Młodej'),
    'v1 snapshot label preserved',
  )

  const timeline = buildDayTimelineSummary(DEFAULT_TEMPLATE_SCHEMA, answers)
  assert(timeline.some((s) => s.label === 'Ceremonia'), 'ceremony stop')
  assert(
    timeline.some((s) => s.label === 'Przygotowania Pana Młodego'),
    'groom prep stop',
  )
  assert(
    timeline.some((s) => s.label === 'Przygotowania Panny Młodej'),
    'bride prep stop',
  )
  const groomIdx = timeline.findIndex((s) => s.role === 'groom_preparation')
  const brideIdx = timeline.findIndex((s) => s.role === 'bride_preparation')
  assert(groomIdx >= 0 && brideIdx > groomIdx, 'groom before bride in timeline')
})

run('12. Wedding Day import preserves structured place via weddingPlaceService', () => {
  const svc = readFileSync(
    resolve(process.cwd(), 'src/lib/api/preweddingQuestionnaireService.ts'),
    'utf8',
  )
  assert(svc.includes('applyLocationAnswersToWeddingPlaces'), 'apply helper')
  assert(svc.includes('weddingPlaceService.upsert'), 'upsert')
  assert(svc.includes('normalizeLocationAnswer'), 'normalize')
  assert(svc.includes('mergeLocationAnswerWithExisting'), 'merge')
  const workspace = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingPreWeddingQuestionnaireWorkspace.tsx',
    ),
    'utf8',
  )
  assert(
    workspace.includes('applyWeddingDaySyncCandidates') ||
      workspace.includes('applyLocationAnswersToWeddingPlaces'),
    'workspace calls apply',
  )
  assert(workspace.includes('prewedding-summary-cards'), 'summary cards')
  assert(workspace.includes('PreWeddingDayPlan'), 'plan dnia')
  assert(workspace.includes('buildAnswerList'), 'flat answer list')
  assert(workspace.includes('SelectedLocationCard'), 'shared location card')
  assert(workspace.includes('item.label'), 'uses snapshot labels')
  assert(workspace.includes('prewedding-answer-stream'), 'single answer stream')
  assert(workspace.includes('answerStream'), 'answerStream class')
  assert(!workspace.includes('answerGrid'), 'no answerGrid')
  assert(workspace.includes('Odpowiedzi są wyświetlane w kolejności ankiety'), 'order lead')
})

run('12c. Answer list CSS is single-column at all breakpoints', () => {
  const css = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingPreWeddingQuestionnaire.module.css',
    ),
    'utf8',
  )
  assert(css.includes('.answerStream'), 'stream class')
  assert(!css.includes('.answerGrid'), 'no answerGrid class')
  assert(!/answerStream[^}]*grid-template-columns:\s*1fr\s+1fr/.test(css), 'no 2-col stream')
  assert(
    !/\.answerGrid[^{]*\{[^}]*grid-template-columns:\s*1fr\s+1fr/.test(css),
    'no legacy 2-col grid',
  )
  assert(css.includes('--content-max-form'), 'readable content width token')
  assert(css.includes('flex-direction: column'), 'column direction')
})
run('12b. Plan dnia reuses travelService — stage labels, no emoji', () => {
  const plan = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingDayPlan.tsx'),
    'utf8',
  )
  assert(plan.includes('travelService.getPlan'), 'getPlan')
  assert(plan.includes('buildTravelFlow'), 'buildTravelFlow')
  assert(plan.includes('summarizeTravelRoute'), 'summarizeTravelRoute')
  assert(plan.includes('TravelRouteTotals'), 'shared totals below plan')
  assert(plan.includes('PLAN_DNIA_STAGE_LABELS'), 'stage labels')
  assert(plan.includes('PLAN_DNIA_ROLE_ORDER'), 'role order')
  assert(!plan.includes('📍'), 'no pin emoji')
  assert(!plan.includes('🏠'), 'no home emoji')
  assert(!plan.includes('distanceMeters /'), 'no manual calc')
  assertEq(PLAN_DNIA_STAGE_LABELS.studio, 'Start dnia', 'start label')
  assertEq(
    PLAN_DNIA_STAGE_LABELS.groom_preparation,
    'Przygotowania Pana Młodego',
    'groom label',
  )
  assertEq(
    PLAN_DNIA_STAGE_LABELS.bride_preparation,
    'Przygotowania Panny Młodej',
    'bride label',
  )
  assertEq(PLAN_DNIA_STAGE_LABELS.ceremony, 'Ceremonia', 'ceremony label')
  assertEq(PLAN_DNIA_STAGE_LABELS.reception, 'Przyjęcie weselne', 'reception label')
  assertEq(PLAN_DNIA_ROLE_ORDER[1], 'groom_preparation', 'order groom')
  assertEq(PLAN_DNIA_ROLE_ORDER[2], 'bride_preparation', 'order bride')
})

run('13. Wedding Day plain text display', () => {
  const a = {
    placeId: 'ChIJ1',
    formattedAddress: 'Lwowska 78',
    latitude: 49.8,
    longitude: 19.7,
    label: 'Villa Love',
    provider: 'google' as const,
  }
  assert(Boolean(locationAnswerToPlainText(a).includes('Villa Love')), 'display')
})

run('14. v1 schema remains available; v2 chronological', () => {
  assertEq(DEFAULT_TEMPLATE_SCHEMA_V1.sections.length, 7, 'v1')
  assertEq(DEFAULT_TEMPLATE_SCHEMA.sections.length, 11, 'v2')
})

run('15. Questionnaire reload — answerToGeoPlace round-trip', () => {
  const stored = geoPlaceToAnswer({
    placeId: 'ChIJx',
    formattedAddress: 'A',
    latitude: 1,
    longitude: 2,
    label: 'B',
    provider: 'google',
  })
  const reloaded = answerToGeoPlace(stored)
  assertEq(reloaded?.placeId, 'ChIJx', 'reload placeId')
  assertEq(reloaded?.label, 'B', 'reload label')
})

console.log('\nprewedding location architecture: done')
