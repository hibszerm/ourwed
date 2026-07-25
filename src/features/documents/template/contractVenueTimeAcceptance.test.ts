/**
 * Venue + coverage-time context classification.
 * Run: npm run test:contract-venue-time
 */

import { detectContractCandidates } from './candidateDetection'
import {
  coverageHoursBetween,
  inventoryAndClassifyVenueTime,
  inventoryCoverageTimeRanges,
  inventoryVenueCandidates,
} from './contractVenueTimeClassification'

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

run('1 — Combined stages → reception_location + shared stages', () => {
  const text =
    'Przygotowania, ceremonia i przyjęcie: ZINNAR CASTLE Kraków'
  const venues = inventoryVenueCandidates([{ index: 0, text }])
  const v = venues.find((x) => x.selectedConcept === 'reception_location')
  assert(Boolean(v), 'venue missing')
  assertEq(v!.sourceText, 'ZINNAR CASTLE Kraków', 'venue text')
  assertEq(v!.selectedConcept, 'reception_location', 'concept')
  assert(
    v!.sharedVenueStages.includes('preparation') &&
      v!.sharedVenueStages.includes('ceremony') &&
      v!.sharedVenueStages.includes('reception'),
    'shared stages',
  )
  const c = detectContractCandidates([{ index: 0, text }])
  assertEq(accepted(c, 'reception_location')?.text, 'ZINNAR CASTLE Kraków', 'cand')
})

run('2 — Venue span is only the place value', () => {
  const text =
    '2.Miejscami dokumentowane są: przygotowania, ceremonia, przyjęcie: ZINNAR CASTLE Kraków'
  const c = detectContractCandidates([{ index: 0, text }])
  const loc = accepted(c, 'reception_location')!
  assert(Boolean(loc), 'missing')
  assertEq(loc.text, 'ZINNAR CASTLE Kraków', 'span text')
  assertEq(
    text.slice(loc.startOffset, loc.endOffset),
    'ZINNAR CASTLE Kraków',
    'offsets',
  )
  assert(!loc.text.includes('przyjęcie'), 'no stage label')
  assert(!loc.text.includes(':'), 'no colon')
})

run('3 — Provider seat after z siedzibą is not a venue', () => {
  const text =
    'PRIMEPHOTO z siedzibą w Jaworznie, przy ul. Testowej 1, NIP 123'
  const venues = inventoryVenueCandidates([{ index: 0, text }])
  assert(
    venues.every((v) => v.selectedConcept == null || v.reviewState === 'excluded'),
    'no venue from provider seat',
  )
  const c = detectContractCandidates([{ index: 0, text }])
  assert(!accepted(c, 'reception_location'), 'no reception_location')
})

run('4 — Client residential address is not a venue', () => {
  const text =
    'Panna Młoda: Anna Kowalska zamieszkała w Krakowie, ul. Floriańska 12'
  const c = detectContractCandidates([{ index: 0, text }])
  assert(!accepted(c, 'reception_location'), 'no venue from residence')
})

run('5 — Contract execution city after zawarta w is not a venue', () => {
  const text =
    'Umowa zawarta w dniu 20.06.2026 r. w Jaworznie pomiędzy stronami.'
  const venues = inventoryVenueCandidates([{ index: 0, text }])
  assert(venues.length === 0 || venues.every((v) => !v.selectedConcept), 'no venue')
  const c = detectContractCandidates([{ index: 0, text }])
  assert(!accepted(c, 'reception_location'), 'no reception from execution city')
})

run('6 — 12:00 - 23:00 → start + end', () => {
  const text = 'Czas pracy 12:00 - 23:00'
  const c = detectContractCandidates([{ index: 0, text }])
  assertEq(accepted(c, 'coverage_start_time')?.text, '12:00', 'start')
  assertEq(accepted(c, 'coverage_end_time')?.text, '23:00', 'end')
})

run('7 — Separator remains immutable', () => {
  const text = 'nie przekracza 11 godzin (od 12:00 - 23:00)'
  const c = detectContractCandidates([{ index: 0, text }])
  const start = accepted(c, 'coverage_start_time')!
  const end = accepted(c, 'coverage_end_time')!
  assert(Boolean(start && end), 'both ends')
  const mid = text.slice(start.endOffset, end.startOffset)
  assert(/^\s*[-–—]\s*$/.test(mid), `separator immutable, got ${JSON.stringify(mid)}`)
  assert(
    !c.some(
      (x) =>
        x.startOffset < end.startOffset &&
        x.endOffset > start.endOffset &&
        (x.proposedKey === 'coverage_start_time' ||
          x.proposedKey === 'coverage_end_time') &&
        x !== start &&
        x !== end,
    ),
    'no whole-range slot',
  )
})

run('8 — Dot-formatted 12.00–23.00 supported', () => {
  const text = 'godziny pracy 12.00–23.00'
  const c = detectContractCandidates([{ index: 0, text }])
  assertEq(accepted(c, 'coverage_start_time')?.text, '12.00', 'start source')
  assertEq(accepted(c, 'coverage_end_time')?.text, '23.00', 'end source')
  const ranges = inventoryCoverageTimeRanges([{ index: 0, text }])
  assertEq(ranges[0]?.normalizedStart, '12:00', 'norm start')
  assertEq(ranges[0]?.normalizedEnd, '23:00', 'norm end')
})

run('9 — od 12:00 do 23:00 supported', () => {
  const text = 'reportaż od 12:00 do 23:00'
  const c = detectContractCandidates([{ index: 0, text }])
  assertEq(accepted(c, 'coverage_start_time')?.text, '12:00', 'start')
  assertEq(accepted(c, 'coverage_end_time')?.text, '23:00', 'end')
})

run('10 — Range endpoints are minimal safe spans', () => {
  const text = 'czas pracy nie przekracza 11 godzin (od 12:00 - 23:00).'
  const c = detectContractCandidates([{ index: 0, text }])
  const start = accepted(c, 'coverage_start_time')!
  const end = accepted(c, 'coverage_end_time')!
  assertEq(start.text, '12:00', 'start minimal')
  assertEq(end.text, '23:00', 'end minimal')
  assertEq(start.endOffset - start.startOffset, 5, 'start len')
  assertEq(end.endOffset - end.startOffset, 5, 'end len')
})

run('11 — do 180 dni roboczych is not coverage time', () => {
  const text = 'Materiał oddany do 180 dni roboczych od dnia ślubu.'
  const ranges = inventoryCoverageTimeRanges([{ index: 0, text }])
  assert(
    ranges.every(
      (r) =>
        r.reviewState === 'excluded' ||
        (!r.selectedStartConcept && !r.selectedEndConcept),
    ),
    'no coverage clock from delivery days',
  )
  const c = detectContractCandidates([{ index: 0, text }])
  assert(!accepted(c, 'coverage_start_time'), 'no start')
  assert(!accepted(c, 'coverage_end_time'), 'no end')
})

run('12 — Existing coverage_hours = 11 remains unchanged', () => {
  const text =
    'Wykonawca zastrzega że, czas jego pracy w dniu ślubu nie przekracza 11 godzin (od 12:00 - 23:00).'
  const c = detectContractCandidates([{ index: 0, text }])
  assertEq(accepted(c, 'coverage_hours')?.text, '11', 'hours')
  assertEq(accepted(c, 'coverage_start_time')?.text, '12:00', 'start')
  assertEq(accepted(c, 'coverage_end_time')?.text, '23:00', 'end')
})

run('13 — 12:00–23:00 consistent with 11 hours', () => {
  assertEq(coverageHoursBetween('12:00', '23:00'), 11, 'hours between')
  const { timeRanges } = inventoryAndClassifyVenueTime([
    {
      index: 0,
      text: 'czas pracy nie przekracza 11 godzin (od 12:00 - 23:00)',
    },
  ])
  const win = timeRanges.find((r) => r.selectedStartConcept)
  assert(Boolean(win), 'range')
  assertEq(win!.consistencyWithCoverageHours, true, 'consistent')
})

run('14 — Inconsistent range/hours → requires_review', () => {
  const { timeRanges } = inventoryAndClassifyVenueTime([
    {
      index: 0,
      text: 'czas pracy nie przekracza 8 godzin (od 12:00 - 23:00)',
    },
  ])
  const r = timeRanges[0]!
  assertEq(r.consistencyWithCoverageHours, false, 'inconsistent')
  assertEq(r.reviewState, 'needs_review', 'review')
  assertEq(accepted(
    detectContractCandidates([
      {
        index: 0,
        text: 'czas pracy nie przekracza 8 godzin (od 12:00 - 23:00)',
      },
    ]),
    'coverage_hours',
  )?.text, '8', 'hours not overwritten')
})

run('15 — Overnight 18:00–01:00 handled conservatively', () => {
  assertEq(coverageHoursBetween('18:00', '01:00'), 7, 'overnight hours')
  const text = 'czas pracy 18:00–01:00'
  const ranges = inventoryCoverageTimeRanges([{ index: 0, text }])
  assert(ranges.length >= 1, 'detected')
  assert(ranges[0]!.normalizedEnd === '01:00', 'end')
  assert(
    ranges[0]!.reviewState !== 'excluded',
    'not excluded merely for overnight',
  )
  const c = detectContractCandidates([{ index: 0, text }])
  assertEq(accepted(c, 'coverage_start_time')?.text, '18:00', 'start')
  assertEq(accepted(c, 'coverage_end_time')?.text, '01:00', 'end')
})

run('16 — Competing time ranges → contextual winner or review', () => {
  const paragraphs = [
    {
      index: 0,
      text: 'czas pracy nie przekracza 11 godzin (od 12:00 - 23:00)',
    },
    {
      index: 1,
      text: 'Ceremonię zaplanowano 14:00 - 15:00 w kościele.',
    },
  ]
  const { timeRanges } = inventoryAndClassifyVenueTime(paragraphs)
  const selected = timeRanges.filter((r) => r.selectedStartConcept)
  assertEq(selected.length, 1, 'one winner')
  assertEq(selected[0]!.normalizedStart, '12:00', 'work hours win')
  assertEq(selected[0]!.paragraphIndex, 0, 'para 0')
})

if (!process.exitCode) {
  console.log('\nAll contract-venue-time tests passed.')
}
