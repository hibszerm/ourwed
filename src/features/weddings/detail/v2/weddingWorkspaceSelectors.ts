import { coupleName, formatDate, getCountdownParts } from '@/lib/utils/dates'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { formatCurrency } from '@/lib/utils/currency'
import { locationVerificationStatus } from '@/features/travel/locationVerification'
import {
  WORKFLOW_STAGE_DESCRIPTIONS,
  WORKFLOW_STAGE_LABELS,
  WORKFLOW_STAGES,
} from '@/lib/utils/workflow'
import type { CompletenessItem, WeddingContractReadiness } from '@/lib/utils/weddingContractReadiness'
import type { WeddingPlace, WeddingPlaceRole } from '@/types/travel'
import type {
  Couple,
  Task,
  Wedding,
  WeddingNote,
  WeddingTimelineEntry,
  WorkflowStage,
} from '@/types/wedding'
import type {
  ActivityFeedItem,
  LocationItemView,
  PartnerContactView,
  WeddingWorkspaceTab,
} from './weddingDetailV2Types'

export const LOCATION_ROLES: Array<{ role: WeddingPlaceRole; label: string }> = [
  { role: 'bride_preparation', label: 'Przygotowania Panny Młodej' },
  { role: 'groom_preparation', label: 'Przygotowania Pana Młodego' },
  { role: 'ceremony', label: 'Ceremonia' },
  { role: 'reception', label: 'Przyjęcie weselne' },
]

export const WORKSPACE_TABS: Array<{ id: WeddingWorkspaceTab; label: string }> = [
  { id: 'overview', label: 'Przegląd' },
  { id: 'wedding_day', label: 'Dzień ślubu' },
  { id: 'contract_finance', label: 'Umowa i finanse' },
  { id: 'activity', label: 'Aktywność' },
]

/** Same guidance copy as WeddingDetailCurrentStage. */
const STAGE_GUIDANCE: Record<WorkflowStage, string> = {
  reservation: 'Czekamy na podpisanie umowy.',
  contract: 'Umowa została wysłana i czeka na podpis.',
  deposit: 'Czekamy na wpłatę zadatku, który potwierdzi rezerwację terminu.',
  preparation:
    'Wszystko zostało dopięte. Około trzech tygodni przed ślubem otrzymasz przypomnienie o wysłaniu ankiety przedślubnej.',
  pre_wedding_questionnaire:
    'Czas zebrać od pary wszystkie szczegóły dotyczące dnia ślubu.',
  wedding_day: 'Dziś jest dzień ślubu.',
  post_production: 'Trwa selekcja i montaż materiału ze ślubu.',
  completed: 'Projekt został pomyślnie oddany.',
}

export function parseWorkspaceTab(raw: string | null): WeddingWorkspaceTab {
  if (
    raw === 'overview' ||
    raw === 'wedding_day' ||
    raw === 'contract_finance' ||
    raw === 'activity'
  ) {
    return raw
  }
  return 'overview'
}

export function getCoupleDisplayName(couple: Couple): string {
  return coupleName(
    [couple.partner1FirstName, couple.partner1LastName]
      .filter(Boolean)
      .join(' ') || couple.partner1,
    [couple.partner2FirstName, couple.partner2LastName]
      .filter(Boolean)
      .join(' ') || couple.partner2,
  )
}

export function getWeddingDateLabel(date: string): string {
  if (!date?.trim()) return 'Data nieustalona'
  return formatDate(date)
}

export function getWeddingCountdownLabel(date: string): string {
  if (!date?.trim()) return ''
  const { days, isPast, isToday } = getCountdownParts(date)
  if (isPast) return 'Ślub już się odbył'
  if (isToday) return 'Dziś'
  return `Za ${days} dni`
}

export function getReceptionDisplayName(
  wedding: Wedding,
  places: WeddingPlace[],
): string {
  const reception = places.find((p) => p.role === 'reception')
  const label = reception?.label?.trim()
  if (label) return label
  const formatted = reception?.formattedAddress?.trim()
  if (formatted) return formatted
  const scalar = wedding.receptionLocation?.trim()
  if (scalar) return scalar
  return 'Miejsce przyjęcia nieuzupełnione'
}

export function getReceptionPlace(
  wedding: Wedding,
  places: WeddingPlace[],
): LocationItemView {
  return (
    getWeddingLocationItems(wedding, places).find(
      (i) => i.role === 'reception',
    ) ?? {
      role: 'reception',
      label: 'Przyjęcie weselne',
      address: '',
      placeName: null,
      verified: false,
      empty: true,
      placeId: null,
      latitude: null,
      longitude: null,
    }
  )
}

export function getWorkflowDisplayState(stage: WorkflowStage) {
  const index = WORKFLOW_STAGES.indexOf(stage)
  return {
    stage,
    label: WORKFLOW_STAGE_LABELS[stage],
    description: WORKFLOW_STAGE_DESCRIPTIONS[stage],
    guidance: STAGE_GUIDANCE[stage],
    index,
    stages: WORKFLOW_STAGES.map((s, i) => ({
      id: s,
      label: WORKFLOW_STAGE_LABELS[s],
      state: (i < index ? 'done' : i === index ? 'current' : 'upcoming') as
        | 'done'
        | 'current'
        | 'upcoming',
    })),
  }
}

export function getWeddingLocationItems(
  wedding: Wedding,
  places: WeddingPlace[],
): LocationItemView[] {
  const byRole = new Map(places.map((p) => [p.role, p]))
  return LOCATION_ROLES.map(({ role, label }) => {
    const place = byRole.get(role)
    const status = locationVerificationStatus(place)
    const address = place?.formattedAddress?.trim() || ''
    const scalarFallback =
      role === 'bride_preparation'
        ? wedding.bridePreparationLocation || wedding.preparationLocation
        : role === 'groom_preparation'
          ? wedding.groomPreparationLocation
          : role === 'ceremony'
            ? wedding.ceremonyLocation
            : wedding.receptionLocation
    const display =
      address || place?.label?.trim() || scalarFallback?.trim() || ''
    return {
      role,
      label,
      address: display,
      placeName: place?.label?.trim() || null,
      verified: status === 'verified',
      empty: !display,
      placeId: place?.placeId ?? null,
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
    }
  })
}

function partnerName(couple: Couple, which: 'partner1' | 'partner2'): string {
  if (which === 'partner1') {
    return (
      [couple.partner1FirstName, couple.partner1LastName]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      couple.partner1?.trim() ||
      '—'
    )
  }
  return (
    [couple.partner2FirstName, couple.partner2LastName]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    couple.partner2?.trim() ||
    '—'
  )
}

export function getContactSections(couple: Couple): PartnerContactView[] {
  return [
    {
      title: 'Panna Młoda',
      name: partnerName(couple, 'partner1'),
      phone: couple.partner1Phone?.trim() || couple.phone?.trim() || null,
      email: couple.partner1Email?.trim() || couple.email?.trim() || null,
    },
    {
      title: 'Pan Młody',
      name: partnerName(couple, 'partner2'),
      phone: couple.partner2Phone?.trim() || null,
      email: couple.partner2Email?.trim() || null,
    },
  ]
}

export function getPackageSummary(wedding: Wedding) {
  const c = getWeddingCommercialSummary(wedding)
  return {
    name: c.packageName || 'Pakiet nieustalony',
    contractValueLabel: formatCurrency(c.contractValue),
    agreedDepositLabel: formatCurrency(c.agreedDeposit),
    coverageLabel:
      c.coverageHours != null
        ? `${c.coverageHours} godz.${c.coverageEndTime ? ` · do ${c.coverageEndTime}` : ''}`
        : '—',
    coverageShort:
      c.coverageHours != null ? `${c.coverageHours} godz.` : '—',
    overtimeLabel:
      c.overtimeRate != null ? formatCurrency(c.overtimeRate) : '—',
    deliveryLabel:
      c.deliveryMonths != null
        ? `${c.deliveryMonths} mies.`
        : c.deliveryDays != null
          ? `${c.deliveryDays} dni`
          : '—',
    finalPaymentDueLabel: c.finalPaymentDueDate
      ? formatDate(c.finalPaymentDueDate)
      : '—',
    currency: c.currency,
    contractValue: c.contractValue,
    totalPaid: c.totalPaid,
    remainingToPay: c.remainingToPay,
    remainingAfterDeposit: c.remainingAfterDeposit,
    items: (c.packageItems ?? []).filter((i) => i.enabled !== false),
  }
}

export function getOverviewBand(wedding: Wedding, readiness: WeddingContractReadiness) {
  const flow = getWorkflowDisplayState(wedding.workflowStage)
  const c = getWeddingCommercialSummary(wedding)
  return {
    stageLabel: flow.label,
    contractValueLabel: formatCurrency(c.contractValue),
    totalPaidLabel: formatCurrency(c.totalPaid),
    remainingLabel: formatCurrency(c.remainingToPay),
    finalDueLabel: c.finalPaymentDueDate
      ? formatDate(c.finalPaymentDueDate)
      : '—',
    readinessCount: `${readiness.requiredTotal - readiness.requiredMissing} / ${readiness.requiredTotal}`,
    readinessReady: readiness.overall === 'ready',
    readinessLabel: readiness.overall === 'ready' ? 'Gotowe' : 'Wymaga uzupełnienia',
  }
}

export type NextActionKind =
  | 'company_settings'
  | 'generate_contract'
  | 'send_questionnaire'
  | 'add_deposit'
  | 'none'

export function getNextAction(
  wedding: Wedding,
  readiness: WeddingContractReadiness,
): {
  title: string
  description: string
  actionLabel: string | null
  actionKind: NextActionKind
} {
  const flow = getWorkflowDisplayState(wedding.workflowStage)
  const missingCompany = readiness.items.filter(
    (i) => i.group === 'company' && i.status === 'missing',
  )
  const contractSent =
    wedding.questionnaires.contractData.status !== 'not_sent'

  if (readiness.overall !== 'ready' && missingCompany.length > 0) {
    return {
      title: 'Uzupełnij dane firmy',
      description: `${flow.guidance} Brakuje ${missingCompany.length} ${
        missingCompany.length === 1 ? 'danej firmy' : 'danych firmy'
      } przed wygenerowaniem dokumentu.`,
      actionLabel: 'Uzupełnij dane firmy',
      actionKind: 'company_settings',
    }
  }

  if (readiness.overall === 'ready') {
    return {
      title: 'Generowanie umowy',
      description: flow.guidance,
      actionLabel: 'Generuj umowę',
      actionKind: 'generate_contract',
    }
  }

  if (
    wedding.workflowStage === 'reservation' ||
    wedding.workflowStage === 'contract'
  ) {
    if (!contractSent) {
      return {
        title: 'Ankieta do umowy',
        description: flow.guidance,
        actionLabel: 'Wyślij ankietę',
        actionKind: 'send_questionnaire',
      }
    }
  }

  if (wedding.workflowStage === 'deposit') {
    return {
      title: 'Zadatek',
      description: flow.guidance,
      actionLabel: 'Dodaj zadatek',
      actionKind: 'add_deposit',
    }
  }

  return {
    title: flow.label,
    description: flow.guidance,
    actionLabel: null,
    actionKind: 'none',
  }
}

export function getMissingReadinessItems(
  readiness: WeddingContractReadiness,
): CompletenessItem[] {
  return readiness.items.filter((i) => i.status === 'missing')
}

export function getReadinessGroups(readiness: WeddingContractReadiness) {
  const groups = ['client', 'company', 'package', 'payments'] as const
  const labels = {
    client: 'Klient',
    company: 'Firma',
    package: 'Pakiet',
    payments: 'Płatności',
  } as const
  return groups.map((group) => {
    const items = readiness.items.filter((i) => i.group === group)
    const missing = items.filter((i) => i.status === 'missing').length
    const complete = items.filter((i) => i.status === 'complete').length
    return {
      group,
      label: labels[group],
      items,
      missing,
      complete,
      total: items.length,
    }
  })
}

export function buildActivityFeed(input: {
  timeline: WeddingTimelineEntry[]
  notes: WeddingNote[]
  tasks: Task[]
  wedding: Wedding
}): ActivityFeedItem[] {
  const items: ActivityFeedItem[] = []

  for (const entry of input.timeline) {
    items.push({
      id: `tl-${entry.id}`,
      source: 'system',
      filter: 'system',
      title: entry.title,
      body: entry.description,
      date: entry.date,
      badge: 'System',
    })
  }

  for (const note of input.notes) {
    items.push({
      id: `note-${note.id}`,
      source: 'note',
      filter: 'notes',
      title: note.author || 'Notatka',
      body: note.content,
      date: note.createdAt,
      badge: note.badge || 'Notatka',
    })
  }

  for (const task of input.tasks) {
    items.push({
      id: `task-${task.id}`,
      source: 'task',
      filter: 'tasks',
      title: task.title,
      body: task.completed ? 'Wykonane' : 'Do zrobienia',
      date: task.dueDate || input.wedding.createdAt,
      badge: 'Zadanie',
    })
  }

  const q = input.wedding.questionnaires.contractData
  if (q.status !== 'not_sent') {
    items.push({
      id: 'q-contract',
      source: 'questionnaire',
      filter: 'questionnaires',
      title: 'Ankieta do umowy',
      body:
        q.status === 'completed'
          ? `Wypełniona${q.completedAt ? ` · ${formatDate(q.completedAt)}` : ''}`
          : 'Wysłana',
      date: q.completedAt || q.sentAt || input.wedding.createdAt,
      badge: 'Ankieta',
    })
  }

  return items.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
}

export { STAGE_GUIDANCE, WORKFLOW_STAGES, WORKFLOW_STAGE_LABELS }
