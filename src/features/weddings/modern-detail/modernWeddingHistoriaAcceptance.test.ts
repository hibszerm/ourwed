/**
 * Modern Wedding Detail — Historia presentation acceptance.
 * Run: npm run test:modern-wedding-detail
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ActivityFeedItem } from '@/features/weddings/detail/v2/weddingDetailV2Types'
import {
  composeModernHistoria,
  EMPTY_HISTORIA_COPY,
  parseApplyDisclosure,
  presentHistoriaDescription,
  routineDisclosureLabel,
  shouldOmitNoteAddedDuplicate,
  shouldOmitSyntheticQuestionnaire,
} from '@/features/weddings/modern-detail/modernWeddingHistoriaModel'

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(actual: T, expected: T, m: string) {
  if (actual !== expected) {
    throw new Error(`${m}: expected ${String(expected)}, got ${String(actual)}`)
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

function item(
  partial: Partial<ActivityFeedItem> &
    Pick<ActivityFeedItem, 'id' | 'title' | 'date'>,
): ActivityFeedItem {
  return {
    source: 'system',
    filter: 'system',
    ...partial,
  }
}

run('1. Modern mounts dedicated Historia; Classic keeps V2 activity', () => {
  const workspace = read(
    'src/features/weddings/modern-detail/ModernWeddingDetailWorkspace.tsx',
  )
  const ui = read(
    'src/features/weddings/modern-detail/ModernWeddingHistoriaWorkspace.tsx',
  )
  const v2 = read('src/features/weddings/detail/v2/WeddingDetailV2.tsx')
  const classic = read(
    'src/features/weddings/detail/v2/WeddingActivityWorkspace.tsx',
  )
  assert(workspace.includes('ModernWeddingHistoriaWorkspace'), 'modern tab')
  assert(
    !workspace.includes("from '@/features/weddings/detail/v2/WeddingActivityWorkspace'"),
    'no V2 activity import in modern shell',
  )
  assert(!workspace.includes('WeddingActivityWorkspace'), 'no V2 activity mount')
  assert(!workspace.includes('modern-wedding-detail-v2-bridge'), 'no activity bridge')
  assert(v2.includes('WeddingActivityWorkspace'), 'classic still uses V2 workspace')
  assert(classic.includes('history-filters'), 'classic keeps filters')
  assert(classic.includes('Edytuj zadania'), 'classic keeps task action')
  assert(classic.includes('Edytuj notatki'), 'classic keeps note action')
  assert(classic.includes("badge: 'System'") === false, 'classic still reads item.badge')
  assert(classic.includes('item.badge'), 'classic badge presentation intact')
  assert(ui.includes('composeModernHistoria'), 'presentation model')
  assert(!ui.includes('queryKey:'), 'no new query layer')
  assert(!ui.includes('timelineEventService'), 'no timeline writes')
})

run('2. No System badge, filter pills, search, or pagination in Modern', () => {
  const ui = read(
    'src/features/weddings/modern-detail/ModernWeddingHistoriaWorkspace.tsx',
  )
  const css = read(
    'src/features/weddings/modern-detail/ModernWeddingHistoriaWorkspace.module.css',
  )
  const model = read(
    'src/features/weddings/modern-detail/modernWeddingHistoriaModel.ts',
  )
  assert(!ui.includes('System'), 'no System copy')
  assert(!ui.includes('Zmiany systemowe'), 'no system filter label')
  assert(!ui.includes('history-filters'), 'no filter bar')
  assert(!ui.includes('Wszystko'), 'no Wszystko pill')
  assert(!css.includes('filterTab'), 'no filter pill architecture')
  assert(!ui.includes('search'), 'no search')
  assert(!ui.includes('paginat'), 'no pagination')
  assert(!model.includes('queryKey'), 'model has no query keys')
  assert(ui.includes('HISTORIA_EYEBROW'), 'restrained header')
  assert(!ui.includes('19 aktywności'), 'no event-count KPI')
  assert(!ui.includes('ostatnia aktualizacja'), 'no last-updated KPI')
})

run('3. Tasks excluded; human notes and timeline retained', () => {
  const days = composeModernHistoria([
    item({
      id: 'tl-1',
      title: 'Utworzono zlecenie.',
      body: 'Ślub dodany do CRM.',
      date: '2026-08-19',
    }),
    item({
      id: 'note-1',
      source: 'note',
      filter: 'notes',
      title: 'Studio',
      body: 'Para poprosiła o wcześniejszy dojazd.',
      date: '2026-08-19',
    }),
    item({
      id: 'task-1',
      source: 'task',
      filter: 'tasks',
      title: 'Oddać galerię',
      body: 'Do zrobienia',
      date: '2026-09-01',
    }),
  ])
  assertEq(days.length, 1, 'one day — future task date not used')
  const titles = days[0].entries.map((e) => e.title)
  const kinds = days[0].entries.map((e) => e.kind)
  assert(titles.includes('Utworzono zlecenie'), 'timeline kept')
  assert(kinds.includes('note'), 'human note kept')
  assert(!titles.includes('Oddać galerię'), 'task title absent')
  assert(
    !days[0].entries.some((e) => e.id === 'task-1'),
    'task row excluded',
  )
})

run('4. Newest-day-first grouping without clock time', () => {
  const days = composeModernHistoria([
    item({
      id: 'a',
      title: 'Dodano wpłatę.',
      date: '2026-08-19',
      body: 'Zadatek: 1000 zł · przelew',
    }),
    item({
      id: 'b',
      title: 'Utworzono zlecenie.',
      date: '2026-08-18',
    }),
  ])
  assertEq(days[0].dateKey, '2026-08-19', 'newest first')
  assertEq(days[1].dateKey, '2026-08-18', 'older second')
  assert(!days[0].heading.includes(':'), 'no clock time in heading')
  assert(
    days[0].entries.every((e) => !/\d{1,2}:\d{2}/.test(e.title)),
    'no invented timestamps on events',
  )
})

run('5. Routine collapse never hides Level 1/2, payments, contracts, Apply', () => {
  const days = composeModernHistoria([
    item({
      id: 'pay',
      title: 'Dodano wpłatę.',
      date: '2026-08-19',
      body: 'Zadatek: 1000 zł · przelew',
    }),
    item({
      id: 'sign',
      title: 'Oznaczono umowę jako podpisaną',
      date: '2026-08-19',
    }),
    item({
      id: 'gen',
      title: 'Wygenerowano umowę.',
      date: '2026-08-19',
    }),
    item({
      id: 'apply',
      title: 'Zastosowano dane z ankiety przedślubnej.',
      date: '2026-08-19',
      body: 'Zaktualizowano: ceremonia.',
    }),
    item({
      id: 'r1',
      title: 'Wygenerowano nowy link do ankiety przedślubnej.',
      date: '2026-08-19',
    }),
    item({
      id: 'r2',
      title: 'Wygenerowano nowy link do ankiety przedślubnej.',
      date: '2026-08-19',
    }),
    item({
      id: 'r3',
      title: 'Wygenerowano nowy link do ankiety przedślubnej.',
      date: '2026-08-19',
    }),
    item({
      id: 'unsign',
      title: 'Cofnięto oznaczenie podpisu umowy',
      date: '2026-08-19',
    }),
  ])
  assertEq(days.length, 1, 'one day')
  const day = days[0]
  assert(day.routineCollapsedCount >= 3, 'rotate+unsign collapse')
  const visible = day.entries.filter((e) => !e.routineCollapsed)
  const collapsed = day.entries.filter((e) => e.routineCollapsed)
  assert(
    visible.some((e) => e.id === 'pay' && e.importance <= 2),
    'payment visible',
  )
  assert(visible.some((e) => e.id === 'sign'), 'sign visible')
  assert(visible.some((e) => e.id === 'gen'), 'contract gen visible')
  assert(visible.some((e) => e.id === 'apply'), 'apply visible')
  assert(
    visible.every((e) => e.importance !== 3),
    'no L3 left in default stream when collapsed',
  )
  assert(
    collapsed.every((e) => e.importance === 3),
    'only L3 collapsed',
  )
  assert(
    collapsed.some((e) => e.id === 'r1') &&
      collapsed.some((e) => e.id === 'r2') &&
      collapsed.some((e) => e.id === 'r3'),
    'all rotates remain available after expand',
  )
  assert(collapsed.some((e) => e.id === 'unsign'), 'unsign remains accessible')
})

run('6. 1–2 routine events stay visible, quieter', () => {
  const days = composeModernHistoria([
    item({
      id: 'created',
      title: 'Utworzono zlecenie.',
      date: '2026-08-01',
    }),
    item({
      id: 'r1',
      title: 'Wygenerowano nowy link do ankiety przedślubnej.',
      date: '2026-08-01',
    }),
    item({
      id: 'r2',
      title: 'Wygenerowano nowy link do ankiety przedślubnej.',
      date: '2026-08-01',
    }),
  ])
  assertEq(days[0].routineCollapsedCount, 0, 'no collapse at 2 routine')
  assert(
    days[0].entries.every((e) => !e.routineCollapsed),
    'both rotates shown directly',
  )
  assertEq(
    days[0].entries.find((e) => e.id === 'r1')?.importance,
    3,
    'rotate is quiet L3',
  )
})

run('7. Custom/unknown event does not crash and stays visible', () => {
  const days = composeModernHistoria([
    item({
      id: 'custom',
      title: 'Nietypowe zdarzenie warsztatowe',
      body: 'Ręczny wpis z przeszłości',
      date: '2026-04-02',
    }),
  ])
  assertEq(days.length, 1, 'one day')
  assertEq(days[0].entries.length, 1, 'kept')
  assertEq(days[0].entries[0].importance, 2, 'unknown is operational')
  assertEq(days[0].entries[0].title, 'Nietypowe zdarzenie warsztatowe', 'title')
  assertEq(days[0].routineCollapsedCount, 0, 'not collapsed')
})

run('8. Short history and empty state', () => {
  const short = composeModernHistoria([
    item({
      id: 'a',
      title: 'Utworzono zlecenie.',
      date: '2026-08-10',
    }),
    item({
      id: 'b',
      title: 'Wysłano: Dane do umowy.',
      date: '2026-08-10',
    }),
  ])
  assertEq(short.length, 1, 'one day')
  assertEq(short[0].entries.length, 2, 'both events')
  assertEq(short[0].routineCollapsedCount, 0, 'no chrome collapse')

  const empty = composeModernHistoria([])
  assertEq(empty.length, 0, 'empty journal')
  assert(
    EMPTY_HISTORIA_COPY.includes('kolejnymi etapami współpracy'),
    'calm empty copy',
  )
  const ui = read(
    'src/features/weddings/modern-detail/ModernWeddingHistoriaWorkspace.tsx',
  )
  assert(ui.includes('EMPTY_HISTORIA_COPY'), 'empty state wired')
  assert(!ui.includes('Brak pozycji w tym filtrze'), 'no filter empty copy')
})

run('9. note_added duplicate is presentation-only and deterministic', () => {
  const noteBody = 'Para poprosiła o wcześniejszy dojazd pod kościół.'
  const feed: ActivityFeedItem[] = [
    item({
      id: 'tl-note',
      title: 'Dodano notatkę.',
      body: noteBody.slice(0, 100),
      date: '2026-08-19',
    }),
    item({
      id: 'note-1',
      source: 'note',
      filter: 'notes',
      title: 'Firma',
      body: noteBody,
      date: '2026-08-19',
    }),
  ]
  assert(shouldOmitNoteAddedDuplicate(feed[0], feed), 'matched prefix omits timeline')
  assert(!shouldOmitNoteAddedDuplicate(feed[1], feed), 'note itself kept')
  const days = composeModernHistoria(feed)
  assertEq(days[0].entries.length, 1, 'one row shown')
  assertEq(days[0].entries[0].kind, 'note', 'human note remains')
  assertEq(days[0].entries[0].authorEyebrow, 'Firma', 'author eyebrow')

  const unmatched = composeModernHistoria([
    item({
      id: 'tl-note-2',
      title: 'Dodano notatkę.',
      body: 'Inna treść której nie ma w notatkach',
      date: '2026-08-19',
    }),
  ])
  assertEq(unmatched[0].entries.length, 1, 'unmatched note_added kept')
  assertEq(unmatched[0].entries[0].title, 'Dodano notatkę', 'honest timeline row')
})

run('10. Synthetic contract questionnaire duplicate is presentation-only', () => {
  const withSent: ActivityFeedItem[] = [
    item({
      id: 'tl-sent',
      title: 'Wysłano: Dane do umowy.',
      date: '2026-08-12',
    }),
    item({
      id: 'q-contract',
      source: 'questionnaire',
      filter: 'questionnaires',
      title: 'Ankieta do umowy',
      body: 'Wysłana',
      date: '2026-08-12',
    }),
  ]
  assert(shouldOmitSyntheticQuestionnaire(withSent[1], withSent), 'omit when sent exists')
  const days = composeModernHistoria(withSent)
  assert(!days[0].entries.some((e) => e.id === 'q-contract'), 'synthetic hidden')
  assert(days[0].entries.some((e) => e.id === 'tl-sent'), 'real send kept')

  const onlySynthetic: ActivityFeedItem[] = [
    item({
      id: 'q-contract',
      source: 'questionnaire',
      filter: 'questionnaires',
      title: 'Ankieta do umowy',
      body: 'Wysłana',
      date: '2026-08-12',
    }),
  ]
  assert(
    !shouldOmitSyntheticQuestionnaire(onlySynthetic[0], onlySynthetic),
    'keep synthetic when no timeline twin',
  )
  assertEq(composeModernHistoria(onlySynthetic)[0].entries.length, 1, 'honest keep')
})

run('11. Long Apply disclosure preserves stored description', () => {
  const full =
    'Zaktualizowano 12 pól: ceremonia, przyjęcie, przygotowania panny, przygotowania pana, godziny, adresy, świadkowie, transport, nocleg, kontakt, extras, notatki.'
  const parsed = parseApplyDisclosure(full)
  assert(parsed != null, 'parsed')
  assertEq(parsed?.summary, 'Zaktualizowano 12 pól', 'summary')
  assertEq(parsed?.fullDescription, full, 'verbatim')
  assertEq(parseApplyDisclosure('Zaktualizowano: ceremonia.'), undefined, 'short stays inline')

  const days = composeModernHistoria([
    item({
      id: 'apply',
      title: 'Zastosowano dane z ankiety przedślubnej.',
      date: '2026-08-08',
      body: full,
    }),
  ])
  assertEq(
    days[0].entries[0].applyDisclosure?.fullDescription,
    full,
    'stored description unchanged',
  )
  assertEq(days[0].entries[0].body, undefined, 'long body moved to disclosure')
})

run('12. Legacy Ankieta: notes are routine; other notes stay useful', () => {
  const days = composeModernHistoria([
    item({
      id: 'n1',
      source: 'note',
      filter: 'notes',
      title: 'Para',
      body: 'Ankieta: imię panny, nazwisko, data, miejsce...',
      date: '2026-08-08',
    }),
    item({
      id: 'n2',
      source: 'note',
      filter: 'notes',
      title: 'Studio',
      body: 'Spotkanie o 18:00 w pracowni.',
      date: '2026-08-08',
    }),
    item({
      id: 'n3',
      source: 'note',
      filter: 'notes',
      title: 'Firma',
      body: 'Ankieta: kolejne pole dump',
      date: '2026-08-08',
    }),
    item({
      id: 'n4',
      source: 'note',
      filter: 'notes',
      title: 'Studio',
      body: 'Ankieta: jeszcze jeden dump',
      date: '2026-08-08',
    }),
  ])
  const dump = days[0].entries.filter((e) => e.id !== 'n2')
  assert(
    dump.every((e) => e.importance === 3),
    'Ankieta: prefix is L3',
  )
  assertEq(
    days[0].entries.find((e) => e.id === 'n2')?.importance,
    2,
    'human note stays operational',
  )
  assert(days[0].routineCollapsedCount === 3, 'three dumps collapse')
  assert(
    days[0].entries.find((e) => e.id === 'n2')?.routineCollapsed === false,
    'human note never collapsed',
  )
})

run('13. Overflow is quiet; no primary edit actions; sheet geometry', () => {
  const ui = read(
    'src/features/weddings/modern-detail/ModernWeddingHistoriaWorkspace.tsx',
  )
  const css = read(
    'src/features/weddings/modern-detail/ModernWeddingHistoriaWorkspace.module.css',
  )
  const workspace = read(
    'src/features/weddings/modern-detail/ModernWeddingDetailWorkspace.tsx',
  )
  assert(ui.includes('historia-overflow-btn'), 'quiet overflow')
  assert(ui.includes("onEditSection") === false, 'no direct header edit buttons')
  assert(workspace.includes("onEditSection('tasks')"), 'tasks still reachable')
  assert(workspace.includes("onEditSection('notes')"), 'notes still reachable')
  assert(css.includes('border-radius: 18px'), 'modern sheet radius')
  assert(css.includes('padding: 22px 26px 24px'), 'modern sheet padding')
  assert(css.includes('max-width: 45rem'), 'reading column inside sheet')
  assert(!css.includes('max-width: 40rem'), 'previous 40rem column replaced')
  assert(!css.includes('max-width: 760px'), 'not classic 760 column')
  assert(!css.includes('timeline'), 'no timeline rail')
  assertEq(routineDisclosureLabel(3), '3 pozostałe aktywności', 'collapse copy')
})

run('14. Date chapters, day spacing, and Modern-only copy polish', () => {
  const css = read(
    'src/features/weddings/modern-detail/ModernWeddingHistoriaWorkspace.module.css',
  )
  const headingStart = css.indexOf('.dayHeading {')
  const headingBlock = css.slice(
    headingStart,
    css.indexOf('.day > .entry:first-of-type'),
  )
  assert(headingStart >= 0, 'date heading rule exists')
  assert(!headingBlock.includes('text-transform'), 'dates are not uppercase eyebrows')
  assert(!headingBlock.includes('letter-spacing: 0.1em'), 'dates are not metadata tracking')
  assert(headingBlock.includes('font-size: 1.0625rem'), 'chapter ~17px')
  assert(headingBlock.includes('font-weight: 600'), 'chapter semibold')
  assert(headingBlock.includes('color: var(--color-text-primary)'), 'darker than metadata')
  assert(headingBlock.includes('margin: 0 0 16px'), 'tight to first event')
  assert(css.includes('.day + .day {\n  margin-top: 40px;'), 'generous day gap')
  assert(!css.includes('border-left'), 'no decorative rail')

  assertEq(
    presentHistoriaDescription(
      'Status podpisania zapisany ręcznie w OurWed (podpis poza systemem).',
      'event',
    ),
    'Podpis zarejestrowany ręcznie.',
    'sign copy',
  )
  assertEq(
    presentHistoriaDescription('Wygenerowano bezpieczny link dla pary.', 'event'),
    'Ankieta została udostępniona Parze.',
    'share copy',
  )
  assertEq(
    presentHistoriaDescription(
      'Zmiana dotyczy tylko statusu w OurWed — nie zmienia pliku umowy.',
      'event',
    ),
    'Plik umowy pozostaje bez zmian.',
    'unsign copy',
  )
  assertEq(
    presentHistoriaDescription('Umowa DOCX odtworzona z szablonu (bez AI).', 'event'),
    'Umowa została przygotowana z szablonu.',
    'generate copy',
  )
  assertEq(
    presentHistoriaDescription('Zaktualizowano: Godzina ceremonii.', 'event'),
    'Zaktualizowano: Godzina ceremonii.',
    'unknown event description untouched',
  )
  assertEq(
    presentHistoriaDescription('Para poprosiła o wcześniejszy dojazd.', 'note'),
    'Para poprosiła o wcześniejszy dojazd.',
    'note body never rewritten',
  )

  const days = composeModernHistoria([
    item({
      id: 'sign',
      title: 'Oznaczono umowę jako podpisaną',
      body: 'Status podpisania zapisany ręcznie w OurWed (podpis poza systemem).',
      date: '2026-08-19',
    }),
    item({
      id: 'note-1',
      source: 'note',
      filter: 'notes',
      title: 'Firma',
      body: 'aaa',
      date: '2026-08-19',
    }),
  ])
  assertEq(
    days[0].entries.find((e) => e.id === 'sign')?.body,
    'Podpis zarejestrowany ręcznie.',
    'composed event uses presentation copy',
  )
  assertEq(
    days[0].entries.find((e) => e.id === 'note-1')?.body,
    'aaa',
    'composed note stays verbatim',
  )
})
