import { formatDate, getCountdownParts } from '@/lib/utils/dates'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import {
  formatDeliveryTerm,
  getAgreedDeposit,
  getWeddingCommercialSummary,
} from '@/lib/utils/commercial'
import { formatFinalPaymentTerms } from '@/lib/utils/finalPaymentTerms'
import { formatCurrency } from '@/lib/utils/currency'
import { formatPolishPostalAddress } from '@/lib/utils/formatPolishPostalAddress'
import { locationVerificationStatus } from '@/features/travel/locationVerification'
import { adaptLegacyWeddingLocationFields } from '@/features/travel/weddingLocationModel'
import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import {
  WORKFLOW_STAGE_DESCRIPTIONS,
  WORKFLOW_STAGE_LABELS,
  WORKFLOW_STAGES,
} from '@/lib/utils/workflow'
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
  AssignmentStatusItem,
  HeaderStatusBadge,
  LocationItemView,
  PartnerContactView,
  WeddingWorkspaceTab,
} from './weddingDetailV2Types'

export const LOCATION_ROLES: Array<{ role: WeddingPlaceRole; label: string }> = [
  { role: 'groom_preparation', label: 'Przygotowania Pana Młodego' },
  { role: 'bride_preparation', label: 'Przygotowania Panny Młodej' },
  { role: 'ceremony', label: 'Ceremonia' },
  { role: 'reception', label: 'Przyjęcie weselne' },
]

export const WORKSPACE_TABS: Array<{ id: WeddingWorkspaceTab; label: string }> = [
  { id: 'overview', label: 'Przegląd' },
  { id: 'wedding_day', label: 'Dzień ślubu' },
  { id: 'contract_finance', label: 'Umowa i finanse' },
  { id: 'pre_wedding_questionnaire', label: 'Ankieta przedślubna' },
  { id: 'activity', label: 'Historia' },
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
    raw === 'pre_wedding_questionnaire' ||
    raw === 'activity'
  ) {
    return raw
  }
  return 'overview'
}

export function getCoupleDisplayName(couple: Couple): string {
  return getWeddingDisplayName({ couple })
}

/** Prefer this over getCoupleDisplayName — respects wedding.displayName. */
export function getWeddingWorkspaceTitle(wedding: Wedding): string {
  return getWeddingDisplayName(wedding)
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
  const summary = getWeddingPrimaryLocationSummary(
    {
      ...wedding,
      primaryLocation: undefined,
      ceremonyLocation: undefined,
      bridePreparationLocation: undefined,
      groomPreparationLocation: undefined,
      preparationLocation: undefined,
      couple: {
        ...wedding.couple,
        venue: '',
        city: '',
      },
    },
    reception ? [reception] : [],
  )
  return summary.displayText || 'Miejsce przyjęcia nieuzupełnione'
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
    const scalarFallback =
      role === 'bride_preparation'
        ? wedding.bridePreparationLocation || wedding.preparationLocation
        : role === 'groom_preparation'
          ? wedding.groomPreparationLocation
          : role === 'ceremony'
            ? wedding.ceremonyLocation
            : wedding.receptionLocation

    const adapted = place
      ? adaptLegacyWeddingLocationFields(place)
      : {
          name: null as string | null,
          formattedAddress: scalarFallback?.trim() || null,
        }

    return {
      role,
      label,
      address: adapted.formattedAddress || '',
      placeName: adapted.name,
      verified: status === 'verified',
      empty: !adapted.name && !adapted.formattedAddress,
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

function partnerContractAddress(
  couple: Couple,
  which: 'partner1' | 'partner2',
): string | null {
  if (which === 'partner1') {
    const formatted = formatPolishPostalAddress({
      fullAddress: couple.partner1Address,
      postalCode: couple.partner1PostalCode,
      city: couple.partner1City,
    })
    return formatted || null
  }
  const formatted = formatPolishPostalAddress({
    fullAddress: couple.partner2Address,
    postalCode: couple.partner2PostalCode,
    city: couple.partner2City,
  })
  return formatted || null
}

export function getContactSections(couple: Couple): PartnerContactView[] {
  return [
    {
      title: 'Panna Młoda',
      name: partnerName(couple, 'partner1'),
      phone: couple.partner1Phone?.trim() || couple.phone?.trim() || null,
      email: couple.partner1Email?.trim() || couple.email?.trim() || null,
      address: partnerContractAddress(couple, 'partner1'),
    },
    {
      title: 'Pan Młody',
      name: partnerName(couple, 'partner2'),
      phone: couple.partner2Phone?.trim() || null,
      email: couple.partner2Email?.trim() || null,
      address: partnerContractAddress(couple, 'partner2'),
    },
  ]
}

function hasContractPartyData(couple: Couple): boolean {
  const hasBrideName = Boolean(
    partnerName(couple, 'partner1') && partnerName(couple, 'partner1') !== '—',
  )
  const hasGroomName = Boolean(
    partnerName(couple, 'partner2') && partnerName(couple, 'partner2') !== '—',
  )
  const hasContact = Boolean(
    couple.partner1Phone?.trim() ||
      couple.phone?.trim() ||
      couple.partner1Email?.trim() ||
      couple.email?.trim(),
  )
  const hasAddress = Boolean(
    partnerContractAddress(couple, 'partner1') ||
      partnerContractAddress(couple, 'partner2'),
  )
  return hasBrideName && hasGroomName && hasContact && hasAddress
}

function hasDepositPaymentRecord(wedding: Wedding): boolean {
  return (wedding.payments ?? []).some((p) => p.type === 'deposit' && p.paid)
}

/**
 * Compact assignment-status checklist from existing wedding state only.
 * Does not invent workflow rules or readiness scores.
 */
export function getAssignmentStatusItems(
  wedding: Wedding,
  places: WeddingPlace[],
): AssignmentStatusItem[] {
  const items: AssignmentStatusItem[] = []
  const contractStatus = wedding.contract?.status ?? 'none'

  if (contractStatus === 'signed') {
    items.push({ id: 'contract', label: 'Umowa podpisana', tone: 'ok' })
  } else if (contractStatus === 'sent') {
    items.push({ id: 'contract', label: 'Umowa wysłana', tone: 'warn' })
  } else if (contractStatus === 'generated') {
    items.push({ id: 'contract', label: 'Umowa wygenerowana', tone: 'ok' })
  } else {
    items.push({ id: 'contract', label: 'Umowa nie wygenerowana', tone: 'warn' })
  }

  const contractQuestionnaire = wedding.questionnaires?.contractData
  const partyDataOk =
    contractQuestionnaire?.status === 'completed' || hasContractPartyData(wedding.couple)
  items.push({
    id: 'contract-data',
    label: partyDataOk
      ? 'Dane do umowy uzupełnione'
      : 'Dane do umowy niepełne',
    tone: partyDataOk ? 'ok' : 'warn',
  })

  const agreedDeposit = getAgreedDeposit(wedding)
  if (agreedDeposit > 0) {
    const depositPaid = hasDepositPaymentRecord(wedding)
    items.push({
      id: 'deposit',
      label: depositPaid ? 'Zaliczka opłacona' : 'Zaliczka oczekuje',
      tone: depositPaid ? 'ok' : 'warn',
    })
  }

  const prewedding = wedding.questionnaires?.weddingQuestionnaire
  if (prewedding) {
    if (prewedding.status === 'completed') {
      items.push({
        id: 'prewedding',
        label: 'Ankieta przedślubna uzupełniona',
        tone: 'ok',
      })
    } else if (prewedding.status === 'sent') {
      items.push({
        id: 'prewedding',
        label: 'Ankieta przedślubna wysłana',
        tone: 'warn',
      })
    } else {
      items.push({
        id: 'prewedding',
        label: 'Ankieta przedślubna niewysłana',
        tone: 'warn',
      })
    }
  }

  const locations = getWeddingLocationItems(wedding, places)
  const filled = locations.filter((l) => !l.empty)
  if (filled.length > 0 || locations.some((l) => l.role === 'reception')) {
    const reception = locations.find((l) => l.role === 'reception')
    const locationsOk = Boolean(reception && !reception.empty)
    items.push({
      id: 'locations',
      label: locationsOk
        ? 'Lokalizacje uzupełnione'
        : 'Lokalizacje do uzupełnienia',
      tone: locationsOk ? 'ok' : 'warn',
    })
  }

  const commercial = getWeddingCommercialSummary(wedding)
  const packageSelected = Boolean(
    commercial.packageId || commercial.packageName?.trim(),
  )
  items.push({
    id: 'package',
    label: packageSelected ? 'Pakiet wybrany' : 'Pakiet nieustalony',
    tone: packageSelected ? 'ok' : 'warn',
  })

  return items
}

/** Compact header status badges from existing wedding state. */
export function getHeaderStatusBadges(
  wedding: Wedding,
): HeaderStatusBadge[] {
  const badges: HeaderStatusBadge[] = []
  const countdown = getWeddingCountdownLabel(wedding.date)
  if (countdown) {
    badges.push({ id: 'countdown', label: countdown, tone: 'neutral' })
  }

  const contractStatus = wedding.contract?.status ?? 'none'
  if (contractStatus === 'signed') {
    badges.push({ id: 'contract', label: 'Umowa podpisana', tone: 'ok' })
  } else if (contractStatus === 'sent') {
    badges.push({ id: 'contract', label: 'Umowa wysłana', tone: 'warn' })
  } else if (contractStatus === 'generated') {
    badges.push({ id: 'contract', label: 'Umowa wygenerowana', tone: 'ok' })
  }

  const agreedDeposit = getAgreedDeposit(wedding)
  if (agreedDeposit > 0 && !hasDepositPaymentRecord(wedding)) {
    badges.push({ id: 'deposit', label: 'Zaliczka oczekuje', tone: 'warn' })
  }

  return badges
}

export function getPackageSummary(wedding: Wedding) {
  const c = getWeddingCommercialSummary(wedding)
  const delivery = formatDeliveryTerm(c.deliveryMonths, c.deliveryDays)
  const finalTermsLabel = formatFinalPaymentTerms(c.finalPaymentTerms)
  const finalPaymentLabel = finalTermsLabel
    ? c.finalPaymentDueDate
      ? `${finalTermsLabel} (${formatDate(c.finalPaymentDueDate)})`
      : finalTermsLabel
    : c.finalPaymentDueDate
      ? formatDate(c.finalPaymentDueDate)
      : '—'
  return {
    name: c.packageName || 'Pakiet nieustalony',
    contractValueLabel: formatCurrency(c.contractValue),
    agreedDepositLabel: formatCurrency(c.agreedDeposit),
    coverageLabel:
      c.coverageHours != null || c.coverageEndTime
        ? [
            c.coverageHours != null ? `${c.coverageHours} godz.` : null,
            c.coverageEndTime ? `do ${c.coverageEndTime}` : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : '—',
    coverageShort:
      c.coverageHours != null
        ? `${c.coverageHours} godz.`
        : c.coverageEndTime
          ? `do ${c.coverageEndTime}`
          : '—',
    overtimeLabel:
      c.overtimeRate != null ? formatCurrency(c.overtimeRate) : '—',
    deliveryLabel: delivery || '—',
    finalPaymentDueLabel: finalPaymentLabel,
    finalPaymentTermsLabel: finalTermsLabel || '—',
    currency: c.currency,
    contractValue: c.contractValue,
    totalPaid: c.totalPaid,
    remainingToPay: c.remainingToPay,
    remainingAfterDeposit: c.remainingAfterDeposit,
    items: (c.packageItems ?? []).filter((i) => i.enabled !== false),
  }
}

export function getOverviewBand(wedding: Wedding) {
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
  }
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
