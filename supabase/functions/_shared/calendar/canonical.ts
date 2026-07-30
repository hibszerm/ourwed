import {
  addOneCalendarDay,
  isCalendarDateOnOrAfter,
  toCalendarDate,
  todayCalendarDate,
  type CanonicalEvent,
} from './cryptoDates.ts'

type WeddingRow = {
  id: string
  wedding_date: string | null
  status: string
  display_name: string | null
  bride_name: string | null
  groom_name: string | null
}

type SessionRow = {
  id: string
  session_date: string | null
  custom_name: string | null
  primary_first_name: string | null
  primary_last_name: string | null
  secondary_first_name: string | null
  secondary_last_name: string | null
  session_type: string | null
  custom_session_type: string | null
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  engagement: 'Narzeczeńska',
  postWedding: 'Poślubna',
  family: 'Rodzinna',
  business: 'Biznesowa',
  other: 'Inna',
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim()
}

function weddingDisplayName(row: WeddingRow): string {
  const manual = clean(row.display_name)
  if (manual) return manual
  const p1 = clean(row.bride_name)
  const p2 = clean(row.groom_name)
  if (p1 && p2 && p2 !== '—' && p2 !== '–' && p2 !== '-') return `${p1} i ${p2}`
  return p1 || p2 || 'Bez tytułu'
}

function shortCoupleName(row: WeddingRow): string {
  const manual = clean(row.display_name)
  if (manual) return manual
  const p1 = clean(row.bride_name).split(/\s+/)[0] || ''
  const p2Raw = clean(row.groom_name).split(/\s+/)[0] || ''
  const p2 = p2Raw === '—' || p2Raw === '–' || p2Raw === '-' ? '' : p2Raw
  if (p1 && p2) return `${p1} i ${p2}`
  return p1 || p2 || 'Bez tytułu'
}

function sessionDisplayName(row: SessionRow): string {
  const custom = clean(row.custom_name)
  if (custom) return custom
  const pFirst = clean(row.primary_first_name)
  const sFirst = clean(row.secondary_first_name)
  const pFull = `${pFirst} ${clean(row.primary_last_name)}`.trim()
  const sFull = `${sFirst} ${clean(row.secondary_last_name)}`.trim()
  if (pFirst && sFirst) return `${pFirst} i ${sFirst}`
  if (pFull && sFull) return `${pFull} i ${sFull}`
  return pFull || sFull || 'Sesja bez nazwy'
}

function buildSessionTitle(row: SessionRow): string {
  const custom = clean(row.custom_name)
  if (custom) {
    return /^sesja\b/i.test(custom) ? custom : `Sesja — ${custom}`
  }
  const typeLabel = sessionTypeLabel(row)
  const typeLower =
    typeLabel.charAt(0).toLocaleLowerCase('pl-PL') + typeLabel.slice(1)
  return `Sesja ${typeLower} — ${sessionDisplayName(row)}`
}

function sessionTypeLabel(row: SessionRow): string {
  if (row.session_type === 'other') {
    return clean(row.custom_session_type) || SESSION_TYPE_LABELS.other
  }
  return SESSION_TYPE_LABELS[row.session_type ?? ''] ?? SESSION_TYPE_LABELS.other
}

function fingerprint(parts: {
  entityType: string
  entityId: string
  startDate: string
  title: string
}): string {
  return [parts.entityType, parts.entityId, parts.startDate, parts.title].join(
    '|',
  )
}

export type CategorySettings = {
  syncWeddings: boolean
  syncSessions: boolean
  backfillMode: 'future' | 'all_active'
  referenceDate?: string
}

export function buildWeddingCanonical(
  row: WeddingRow,
  settings: CategorySettings,
): CanonicalEvent {
  const startDate = toCalendarDate(row.wedding_date)
  const title = `Ślub — ${shortCoupleName(row)}`
  if (!startDate) {
    return {
      entityType: 'wedding',
      entityId: row.id,
      startDate: '',
      endDateExclusive: '',
      title: '',
      eligible: false,
      fingerprint: '',
    }
  }
  if (row.status === 'cancelled') {
    return {
      entityType: 'wedding',
      entityId: row.id,
      startDate,
      endDateExclusive: addOneCalendarDay(startDate),
      title,
      eligible: false,
      fingerprint: '',
    }
  }
  if (!settings.syncWeddings) {
    return {
      entityType: 'wedding',
      entityId: row.id,
      startDate,
      endDateExclusive: addOneCalendarDay(startDate),
      title,
      eligible: false,
      fingerprint: '',
    }
  }
  const reference = settings.referenceDate ?? todayCalendarDate()
  if (
    settings.backfillMode === 'future' &&
    !isCalendarDateOnOrAfter(startDate, reference)
  ) {
    return {
      entityType: 'wedding',
      entityId: row.id,
      startDate,
      endDateExclusive: addOneCalendarDay(startDate),
      title,
      eligible: false,
      fingerprint: '',
    }
  }
  void weddingDisplayName
  return {
    entityType: 'wedding',
    entityId: row.id,
    startDate,
    endDateExclusive: addOneCalendarDay(startDate),
    title,
    eligible: true,
    fingerprint: fingerprint({
      entityType: 'wedding',
      entityId: row.id,
      startDate,
      title,
    }),
  }
}

export function buildSessionCanonical(
  row: SessionRow,
  settings: CategorySettings,
): CanonicalEvent {
  const startDate = toCalendarDate(row.session_date)
  const title = buildSessionTitle(row)
  if (!startDate) {
    return {
      entityType: 'session',
      entityId: row.id,
      startDate: '',
      endDateExclusive: '',
      title: '',
      eligible: false,
      fingerprint: '',
    }
  }
  if (!settings.syncSessions) {
    return {
      entityType: 'session',
      entityId: row.id,
      startDate,
      endDateExclusive: addOneCalendarDay(startDate),
      title,
      eligible: false,
      fingerprint: '',
    }
  }
  const reference = settings.referenceDate ?? todayCalendarDate()
  if (
    settings.backfillMode === 'future' &&
    !isCalendarDateOnOrAfter(startDate, reference)
  ) {
    return {
      entityType: 'session',
      entityId: row.id,
      startDate,
      endDateExclusive: addOneCalendarDay(startDate),
      title,
      eligible: false,
      fingerprint: '',
    }
  }
  return {
    entityType: 'session',
    entityId: row.id,
    startDate,
    endDateExclusive: addOneCalendarDay(startDate),
    title,
    eligible: true,
    fingerprint: fingerprint({
      entityType: 'session',
      entityId: row.id,
      startDate,
      title,
    }),
  }
}
