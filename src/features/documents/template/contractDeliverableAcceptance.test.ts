/**
 * Film duration + videographer count classification.
 * Run: npm run test:contract-deliverables
 */

import { detectContractCandidates } from './candidateDetection'
import {
  inventoryCrewCountCandidates,
  inventoryFilmDurationCandidates,
  inventoryAndClassifyDeliverables,
} from './contractDeliverableClassification'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(a: unknown, b: unknown, label: string) {
  if (a !== b) {
    throw new Error(
      `${label}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`,
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

function accepted(
  cands: ReturnType<typeof detectContractCandidates>,
  key: string,
) {
  return cands.find(
    (c) =>
      c.proposedKey === key &&
      (c.decision === 'accepted' || c.decision === 'needs_confirmation'),
  )
}

run('1 — 2 operatorów → videographers_count = 2', () => {
  const text = 'Liczba osób wykonujących zlecenie w dniu ślubu: 2 operatorów'
  const c = detectContractCandidates([{ index: 0, text }])
  const v = accepted(c, 'videographers_count')
  assert(Boolean(v), 'missing videographers_count')
  assertEq(v!.text, '2', 'span')
  assertEq(text.slice(v!.startOffset, v!.endOffset), '2', 'offsets')
})

run('2 — dwóch operatorów → videographers_count = 2', () => {
  const text = 'Reportaż realizowany przez dwóch operatorów'
  const crew = inventoryCrewCountCandidates([{ index: 0, text }])
  const win = crew.find((x) => x.selectedConcept === 'videographers_count')
  assert(Boolean(win), 'crew missing')
  assertEq(win!.normalizedCount, 2, 'normalized')
  const c = detectContractCandidates([{ index: 0, text }])
  assertEq(accepted(c, 'videographers_count')?.text, 'dwóch', 'word span')
})

run('3 — ekipa dwuosobowa → videographers_count = 2', () => {
  const text = 'Obsługa przez ekipę dwuosobową w dniu ślubu'
  // normalize to form our extractor knows
  const text2 = 'Reportaż: ekipa dwuosobowa filmowa'
  const crew = inventoryCrewCountCandidates([{ index: 0, text: text2 }])
  const win = crew.find((x) => x.selectedConcept === 'videographers_count')
  assert(Boolean(win), `crew missing in ${text}`)
  assertEq(win!.normalizedCount, 2, 'normalized')
  const c = detectContractCandidates([{ index: 0, text: text2 }])
  assert(Boolean(accepted(c, 'videographers_count')), 'bound')
})

run('4 — Bare operatorzy → requires_review, no inferred count', () => {
  const text = 'Operatorzy realizują reportaż w dniu ślubu.'
  const crew = inventoryCrewCountCandidates([{ index: 0, text }])
  assert(
    crew.every(
      (x) =>
        x.normalizedCount == null &&
        (x.reviewState === 'needs_review' || x.selectedConcept == null),
    ),
    'no inferred count',
  )
  const c = detectContractCandidates([{ index: 0, text }])
  assert(!accepted(c, 'videographers_count'), 'must not bind')
})

run('5 — 2 operatorów i 3 kamery → only 2 is videographers_count', () => {
  const text = 'Obsługa: 2 operatorów i 3 kamery'
  const c = detectContractCandidates([{ index: 0, text }])
  const v = accepted(c, 'videographers_count')
  assertEq(v?.text, '2', 'only operator count')
  assert(
    !c.some(
      (x) =>
        x.proposedKey === 'videographers_count' &&
        (x.decision === 'accepted' || x.decision === 'needs_confirmation') &&
        x.text === '3',
    ),
    'camera count not crew',
  )
})

run('6 — Paragraph number 2. before Operatorzy is not crew count', () => {
  const text = '2. Operatorzy nie odpowiadają za pogodę.'
  const c = detectContractCandidates([{ index: 0, text }])
  assert(!accepted(c, 'videographers_count'), 'paragraph number ≠ count')
})

run('7 — film o długości do 20 minut → do 20 minut', () => {
  const text = 'film o długości do 20 minut'
  const c = detectContractCandidates([{ index: 0, text }])
  const d = accepted(c, 'film_duration')
  assertEq(d?.text, 'do 20 minut', 'duration span')
  const inv = inventoryFilmDurationCandidates([{ index: 0, text }])
  const win = inv.find((x) => x.selectedConcept === 'film_duration')
  assertEq(win?.normalizedMaximumMinutes, 20, 'max minutes')
  assertEq(win?.qualifier, 'maximum', 'qualifier')
})

run('8 — film trwający 20 min → film_duration', () => {
  const text = 'film trwający 20 min'
  const c = detectContractCandidates([{ index: 0, text }])
  assertEq(accepted(c, 'film_duration')?.text, '20 min', 'span')
})

run('9 — od 15 do 20 minut preserved range', () => {
  const text = 'materiał filmowy od 15 do 20 minut'
  const c = detectContractCandidates([{ index: 0, text }])
  assertEq(accepted(c, 'film_duration')?.text, 'od 15 do 20 minut', 'range')
  const win = inventoryFilmDurationCandidates([{ index: 0, text }]).find(
    (x) => x.selectedConcept === 'film_duration',
  )
  assertEq(win?.normalizedMinimumMinutes, 15, 'min')
  assertEq(win?.normalizedMaximumMinutes, 20, 'max')
  assertEq(win?.qualifier, 'range', 'qualifier')
})

run('10 — do 180 dni roboczych is not film_duration', () => {
  const text = 'Zmontowany film zostanie przekazany w terminie do 180 dni roboczych od dnia ślubu.'
  const c = detectContractCandidates([{ index: 0, text }])
  assert(!accepted(c, 'film_duration'), 'not film duration')
  // delivery may still be detected by other detectors
})

run('11 — 11 godzin pracy is not film_duration', () => {
  const text = 'czas pracy nie przekracza 11 godzin'
  const c = detectContractCandidates([{ index: 0, text }])
  assert(!accepted(c, 'film_duration'), 'not film duration')
  assertEq(accepted(c, 'coverage_hours')?.text, '11', 'hours remain')
})

run('12 — Ceremony duration does not override final film duration', () => {
  const paragraphs = [
    { index: 0, text: 'ceremonia trwa 45 minut' },
    {
      index: 1,
      text: 'zmontowany FILM w postaci pliku cyfrowego o czasie trwania do 20 minut',
    },
  ]
  const { durations } = inventoryAndClassifyDeliverables(paragraphs)
  const selected = durations.filter((d) => d.selectedConcept === 'film_duration')
  assertEq(selected.length, 1, 'one film duration')
  assertEq(selected[0]!.sourceText, 'do 20 minut', 'main film')
  assertEq(selected[0]!.paragraphIndex, 1, 'para 1')
})

run('13 — Teaser duration does not override main film', () => {
  const paragraphs = [
    { index: 0, text: 'teaser / zapowiedź o długości do 90 sekund (ok. 2 min)' },
    {
      index: 1,
      text: 'zmontowany film główny o czasie trwania do 20 minut',
    },
  ]
  const { durations } = inventoryAndClassifyDeliverables(paragraphs)
  const selected = durations.filter((d) => d.selectedConcept === 'film_duration')
  assert(selected.length >= 1, 'main selected')
  assert(
    selected.every((d) => d.paragraphIndex === 1),
    'only main film para',
  )
  assertEq(selected[0]!.sourceText, 'do 20 minut', 'main span')
})

run('14 — Crew count span is minimal', () => {
  const text =
    'Liczba osób wykonujących zlecenie w dniu ślubu: 2 operatorów Czas pracy - 12:00 - 23:00'
  const c = detectContractCandidates([{ index: 0, text }])
  const v = accepted(c, 'videographers_count')!
  assertEq(v.text, '2', 'minimal')
  assertEq(v.endOffset - v.startOffset, 1, 'len')
})

run('15 — Film duration span is minimal', () => {
  const text =
    '- zmontowany FILM w postaci pliku cyfrowego o czasie trwania do 20 minut,'
  const c = detectContractCandidates([{ index: 0, text }])
  const d = accepted(c, 'film_duration')!
  assertEq(d.text, 'do 20 minut', 'minimal')
  assert(!d.text.includes('FILM'), 'no surrounding')
  assert(!d.text.includes('plik'), 'no surrounding')
})

if (!process.exitCode) {
  console.log('\nAll contract-deliverables tests passed.')
}
