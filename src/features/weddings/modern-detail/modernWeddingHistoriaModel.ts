import { formatDate } from '@/lib/utils/dates'
import type { ActivityFeedItem } from '@/features/weddings/detail/v2/weddingDetailV2Types'

/**
 * Modern Historia presentation model.
 * Isolated from domain services. Does not change persisted events, notes, or tasks.
 */

export type HistoriaImportance = 1 | 2 | 3
export type HistoriaKind = 'event' | 'note'

export interface HistoriaEntry {
  id: string
  kind: HistoriaKind
  importance: HistoriaImportance
  /** Event title for timeline rows. Empty for notes (author lives on eyebrow). */
  title: string
  authorEyebrow?: string
  body?: string
  applyDisclosure?: {
    summary: string
    fullDescription: string
  }
  date: string
  dateKey: string
  /** True when this Level-3 row is behind the same-day routine disclosure. */
  routineCollapsed: boolean
}

export interface HistoriaDay {
  dateKey: string
  heading: string
  entries: HistoriaEntry[]
  routineCollapsedCount: number
}

export const HISTORIA_EYEBROW = 'Historia'
export const HISTORIA_HEADLINE = 'Historia zlecenia'
export const EMPTY_HISTORIA_COPY =
  'Historia tego zlecenia pojawi się tutaj wraz z kolejnymi etapami współpracy.'

const ROUTINE_COLLAPSE_THRESHOLD = 2
const APPLY_DISCLOSURE_MIN_FIELDS = 3

const TITLE_CREATED = 'Utworzono zlecenie.'
const TITLE_IMPORTED = 'Zaimportowano z arkusza.'
const TITLE_PAYMENT = 'Dodano wpłatę.'
const TITLE_NOTE_ADDED = 'Dodano notatkę.'
const TITLE_CONTRACT_GENERATED = 'Wygenerowano umowę.'
const TITLE_APPLY = 'Zastosowano dane z ankiety przedślubnej.'
const TITLE_FIRST_SHARE = 'Udostępniono ankietę przedślubną.'
const TITLE_PREPARE = 'Przygotowano ankietę przedślubną.'
const TITLE_COMPLETED = 'Wypełniono ankietę.'
const TITLE_CONTRACT_Q_SENT = 'Wysłano: Dane do umowy.'
const TITLE_SYNTHETIC_Q = 'Ankieta do umowy'
const LEGACY_QUESTIONNAIRE_NOTE_PREFIX = 'Ankieta:'

export function dateKeyFromFeedDate(date: string): string {
  const trimmed = date.trim()
  if (!trimmed) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  return trimmed
}

export function editorialTitle(title: string): string {
  return title.replace(/[.]$/u, '').trim()
}

/**
 * Exact-match Modern presentation copy. Stored timeline text is unchanged.
 * Unknown / custom / note bodies pass through verbatim.
 */
const MODERN_DESCRIPTION_COPY: Record<string, string> = {
  'Status podpisania zapisany ręcznie w OurWed (podpis poza systemem).':
    'Podpis zarejestrowany ręcznie.',
  'Wygenerowano bezpieczny link dla pary.':
    'Ankieta została udostępniona Parze.',
  'Zmiana dotyczy tylko statusu w OurWed — nie zmienia pliku umowy.':
    'Plik umowy pozostaje bez zmian.',
  'Umowa DOCX odtworzona z szablonu (bez AI).':
    'Umowa została przygotowana z szablonu.',
  'Wygenerowano link do ankiety.':
    'Ankieta została udostępniona Parze.',
}

export function presentHistoriaDescription(
  body: string | undefined,
  kind: HistoriaKind,
): string | undefined {
  if (body == null || kind !== 'event') return body
  return MODERN_DESCRIPTION_COPY[body] ?? body
}

export function isLegacyQuestionnaireNote(item: ActivityFeedItem): boolean {
  if (item.source !== 'note') return false
  return (item.body ?? '').trimStart().startsWith(LEGACY_QUESTIONNAIRE_NOTE_PREFIX)
}

export function isPaymentEvent(item: ActivityFeedItem): boolean {
  return item.title === TITLE_PAYMENT || item.title.startsWith('Dodano wpłatę')
}

export function isApplyEvent(item: ActivityFeedItem): boolean {
  return item.title === TITLE_APPLY || item.title.includes('Zastosowano dane z ankiety')
}

export function isContractGeneratedEvent(item: ActivityFeedItem): boolean {
  return item.title === TITLE_CONTRACT_GENERATED || item.title.startsWith('Wygenerowano umowę')
}

export function isContractSignedEvent(item: ActivityFeedItem): boolean {
  return item.title.includes('Oznaczono umowę jako podpisaną')
}

function isRotateEvent(item: ActivityFeedItem): boolean {
  return item.title.includes('Wygenerowano nowy link')
}

function isUnsignEvent(item: ActivityFeedItem): boolean {
  return item.title.includes('Cofnięto oznaczenie')
}

function isLegacyReopenEvent(item: ActivityFeedItem): boolean {
  return item.title.includes('Ponownie otwarto')
}

function isCreatedOrImported(item: ActivityFeedItem): boolean {
  return (
    item.title === TITLE_CREATED ||
    item.title === TITLE_IMPORTED ||
    item.title.startsWith('Utworzono zlecenie') ||
    item.title.startsWith('Zaimportowano')
  )
}

function isAcceptedEvent(item: ActivityFeedItem): boolean {
  return (
    item.title.startsWith('Zaakceptowano') ||
    item.title.includes('Nowe zlecenie z ankiety')
  )
}

function isFirstShare(item: ActivityFeedItem): boolean {
  return item.title === TITLE_FIRST_SHARE
}

function isQuestionnaireCompleted(item: ActivityFeedItem): boolean {
  return item.title === TITLE_COMPLETED
}

function isPrepareQuestionnaire(item: ActivityFeedItem): boolean {
  return item.title === TITLE_PREPARE
}

function isContractQuestionnaireSent(item: ActivityFeedItem): boolean {
  return item.title === TITLE_CONTRACT_Q_SENT
}

function isSyntheticContractQuestionnaire(item: ActivityFeedItem): boolean {
  return item.source === 'questionnaire' && item.title === TITLE_SYNTHETIC_Q
}

function isNoteAddedTimeline(item: ActivityFeedItem): boolean {
  return item.source === 'system' && item.title === TITLE_NOTE_ADDED
}

/**
 * Presentation-only: hide `note_added` timeline rows when a note body
 * starts with the stored event description (AddNoteModal writes
 * description = content.slice(0, 100)).
 * If the prefix cannot be matched, keep both rows.
 */
export function shouldOmitNoteAddedDuplicate(
  item: ActivityFeedItem,
  feed: ActivityFeedItem[],
): boolean {
  if (!isNoteAddedTimeline(item)) return false
  const prefix = (item.body ?? '').trim()
  if (!prefix) return false
  return feed.some(
    (candidate) =>
      candidate.source === 'note' &&
      (candidate.body ?? '').startsWith(prefix),
  )
}

/**
 * Presentation-only: omit the synthetic `Ankieta do umowy` row when a
 * real contract-questionnaire timeline event already represents send,
 * completion, or acceptance.
 */
export function shouldOmitSyntheticQuestionnaire(
  item: ActivityFeedItem,
  feed: ActivityFeedItem[],
): boolean {
  if (!isSyntheticContractQuestionnaire(item)) return false
  return feed.some(
    (candidate) =>
      candidate.source === 'system' &&
      (candidate.title === TITLE_COMPLETED ||
        candidate.title.startsWith('Zaakceptowano:') ||
        candidate.title === TITLE_CONTRACT_Q_SENT),
  )
}

export function parseApplyDisclosure(
  body: string | undefined,
): { summary: string; fullDescription: string } | undefined {
  if (!body) return undefined
  const match = body.match(/^Zaktualizowano (\d+) pól:\s+[\s\S]+$/u)
  if (!match) return undefined
  const count = Number(match[1])
  if (!Number.isFinite(count) || count < APPLY_DISCLOSURE_MIN_FIELDS) {
    return undefined
  }
  return {
    summary: `Zaktualizowano ${count} pól`,
    fullDescription: body,
  }
}

function oldestMatchingIds(
  items: ActivityFeedItem[],
  predicate: (item: ActivityFeedItem) => boolean,
): Set<string> {
  const matches = items.filter(predicate)
  const oldest = matches[matches.length - 1]
  return oldest ? new Set([oldest.id]) : new Set()
}

function classifyImportance(
  item: ActivityFeedItem,
  firstPaymentIds: Set<string>,
  firstApplyIds: Set<string>,
  firstContractGenIds: Set<string>,
): HistoriaImportance {
  if (item.source === 'task') return 3
  if (isLegacyQuestionnaireNote(item)) return 3
  if (isRotateEvent(item) || isUnsignEvent(item) || isLegacyReopenEvent(item)) {
    return 3
  }
  if (isNoteAddedTimeline(item)) return 3

  if (isPaymentEvent(item)) {
    return firstPaymentIds.has(item.id) ? 1 : 2
  }
  if (isApplyEvent(item)) {
    return firstApplyIds.has(item.id) ? 1 : 2
  }
  if (isContractGeneratedEvent(item)) {
    return firstContractGenIds.has(item.id) ? 1 : 2
  }
  if (isContractSignedEvent(item)) return 1
  if (isCreatedOrImported(item) || isAcceptedEvent(item)) return 1
  if (isFirstShare(item) || isQuestionnaireCompleted(item)) return 1
  if (
    isSyntheticContractQuestionnaire(item) &&
    (item.body ?? '').startsWith('Wypełniona')
  ) {
    return 1
  }

  if (isPrepareQuestionnaire(item) || isContractQuestionnaireSent(item)) {
    return 2
  }
  if (item.source === 'note' || item.source === 'questionnaire') return 2

  return 2
}

function canCollapse(item: ActivityFeedItem, importance: HistoriaImportance): boolean {
  if (importance !== 3) return false
  if (isPaymentEvent(item)) return false
  if (isApplyEvent(item)) return false
  if (isContractGeneratedEvent(item)) return false
  if (isContractSignedEvent(item)) return false
  return true
}

function polishPlural(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const abs = Math.abs(count)
  if (abs === 1) return one
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

export function routineDisclosureLabel(count: number): string {
  return `${count} ${polishPlural(
    count,
    'pozostała aktywność',
    'pozostałe aktywności',
    'pozostałych aktywności',
  )}`
}

function dayHeading(dateKey: string): string {
  if (!dateKey) return 'Bez daty'
  try {
    return formatDate(dateKey)
  } catch {
    return dateKey
  }
}

function toEntry(
  item: ActivityFeedItem,
  importance: HistoriaImportance,
  routineCollapsed: boolean,
): HistoriaEntry {
  const kind: HistoriaKind = item.source === 'note' ? 'note' : 'event'
  const applyDisclosure =
    kind === 'event' ? parseApplyDisclosure(item.body) : undefined
  return {
    id: item.id,
    kind,
    importance,
    title: kind === 'note' ? '' : editorialTitle(item.title),
    authorEyebrow: kind === 'note' ? item.title : undefined,
    body: applyDisclosure
      ? undefined
      : presentHistoriaDescription(item.body, kind),
    applyDisclosure,
    date: item.date,
    dateKey: dateKeyFromFeedDate(item.date),
    routineCollapsed,
  }
}

/**
 * Compose the Modern Historia journal from the existing activity feed.
 * Tasks are excluded. Timeline events remain represented unless a
 * deterministic presentation duplicate rule applies.
 */
export function composeModernHistoria(feed: ActivityFeedItem[]): HistoriaDay[] {
  const withoutTasks = feed.filter((item) => item.source !== 'task')
  const visible = withoutTasks.filter(
    (item) =>
      !shouldOmitNoteAddedDuplicate(item, withoutTasks) &&
      !shouldOmitSyntheticQuestionnaire(item, withoutTasks),
  )

  const firstPaymentIds = oldestMatchingIds(visible, isPaymentEvent)
  const firstApplyIds = oldestMatchingIds(visible, isApplyEvent)
  const firstContractGenIds = oldestMatchingIds(visible, isContractGeneratedEvent)

  const classified = visible.map((item) => {
    const importance = classifyImportance(
      item,
      firstPaymentIds,
      firstApplyIds,
      firstContractGenIds,
    )
    return { item, importance, collapsible: canCollapse(item, importance) }
  })

  const days: HistoriaDay[] = []
  const indexByKey = new Map<string, number>()

  for (const row of classified) {
    const dateKey = dateKeyFromFeedDate(row.item.date)
    let day = days[indexByKey.get(dateKey) ?? -1]
    if (!day) {
      day = {
        dateKey,
        heading: dayHeading(dateKey),
        entries: [],
        routineCollapsedCount: 0,
      }
      indexByKey.set(dateKey, days.length)
      days.push(day)
    }
    day.entries.push(
      toEntry(row.item, row.importance, false),
    )
  }

  for (const day of days) {
    const collapsibleIds = new Set(
      classified
        .filter(
          (row) =>
            dateKeyFromFeedDate(row.item.date) === day.dateKey && row.collapsible,
        )
        .map((row) => row.item.id),
    )
    const routineCount = collapsibleIds.size
    const collapse = routineCount > ROUTINE_COLLAPSE_THRESHOLD
    day.routineCollapsedCount = collapse ? routineCount : 0
    if (!collapse) continue
    for (const entry of day.entries) {
      if (collapsibleIds.has(entry.id)) entry.routineCollapsed = true
    }
  }

  return days
}
