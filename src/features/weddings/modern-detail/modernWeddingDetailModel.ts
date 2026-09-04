/**
 * Modern Wedding Detail Phase 1 — presentation composers only.
 * Reuses canonical domain helpers. Does not fork resolver order or finance math.
 */

import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import {
  CORRESPONDENCE_CHANNEL_LABELS,
  getCorrespondenceDisplay,
  type CorrespondenceLink,
} from '@/features/weddings/correspondence/weddingCorrespondence'
import {
  getPackageSummary,
  getWeddingLocationItems,
} from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { hasPaidDepositPayment } from '@/lib/finance/hasPaidDepositPayment'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { localCalendarDateKey, toLocalCalendarDateKey } from '@/lib/utils/localCalendarDate'
import { isTravelFeeResolved } from '@/lib/utils/travelFeeCommercial'
import { isClientContractCollectionComplete } from '@/lib/utils/weddingContractReadiness'
import {
  getDeliveryDeadlineState,
  type DeliveryDeadlineState,
} from '@/lib/utils/weddingDeliveryDeadline'
import {
  hasCoreLocations,
  PRE_WEDDING_PREP_WINDOW_DAYS,
  type WeddingNextAction,
  type WeddingNextActionId,
} from '@/lib/workflow/resolveWeddingNextAction'
import type { WeddingPlace } from '@/types/travel'
import type { QuestionnaireStatus, Wedding } from '@/types/wedding'

export const MODERN_READY_STORY_TITLE = 'Na ten moment wszystko gotowe'
export const MODERN_APPLY_READINESS_STATUS = 'Aktualizacje z ankiety do przeglądu'

export type DayModeProminence = 'primary' | 'secondary' | 'tertiary' | 'overflow'

export type CurrentStoryKind =
  | 'apply'
  | 'send_contract_questionnaire'
  | 'waiting_contract'
  | 'resolve_travel_fee'
  | 'generate_contract'
  | 'mark_contract_signed'
  | 'record_deposit'
  | 'send_prewedding'
  | 'waiting_prewedding'
  | 'complete_core_locations'
  | 'set_ceremony_time'
  | 'overdue'
  | 'ready'
  | 'past'
  | 'delivered'

export type CurrentStoryIssueId =
  | 'apply'
  | 'unsigned_contract'
  | 'overdue_payment'
  | 'missing_template'
  | 'unresolved_travel'
  | 'overdue_delivery'
  | 'missing_locations'
  | 'generate_contract'
  | 'deposit'
  | 'prewedding'
  | 'contract_data'
  | 'ceremony_time'

export type CurrentStoryActionId =
  | WeddingNextActionId
  | 'open_finance'
  | 'open_delivery'
  | 'open_package'

export type CurrentStoryView = {
  kind: CurrentStoryKind
  eyebrow: string
  title: string
  support: string | null
  primaryAction: { label: string; id: CurrentStoryActionId } | null
  quietLink: { label: string; id: CurrentStoryActionId } | null
  ownsIssueIds: CurrentStoryIssueId[]
}

export type AttentionItem = {
  id: CurrentStoryIssueId
  label: string
  action: { label: string; id: CurrentStoryActionId } | null
}

export type AttentionView = {
  items: AttentionItem[]
  overflowCount: number
}

export type ReadinessItem = {
  id: string
  domain: string
  status: string
}

export type ReadinessView =
  | { kind: 'hidden' }
  | { kind: 'complete'; line: string }
  | { kind: 'items'; items: ReadinessItem[] }

export type CommercialHealthView = {
  contractValueLabel: string
  paidLabel: string
  paymentKind: 'none' | 'partial' | 'paid'
  paymentSentence: string
  remainingLabel: string | null
  dueLabel: string | null
  dueTone: 'quiet' | 'overdue'
  paymentTone: 'quiet' | 'overdue' | 'paid' | 'none'
  delivery: {
    label: 'Termin oddania' | 'Oddano'
    value: string
    tone: 'quiet' | 'today' | 'overdue' | 'completed'
  } | null
}

export type RecordHeroDateParts = {
  day: string
  month: string
  weekday: string
}

export type RecordHeroCountdownKind = 'future' | 'today' | 'past'

export type RecordHeroCountdown = {
  kind: RecordHeroCountdownKind
  value: string
  unit: string | null
  caption: string | null
}

export type HeaderMetaView = {
  dateParts: RecordHeroDateParts | null
  countdown: RecordHeroCountdown | null
  metaLine: string | null
}

const PL_WEEKDAYS = [
  'niedziela',
  'poniedziałek',
  'wtorek',
  'środa',
  'czwartek',
  'piątek',
  'sobota',
] as const

function civilDaysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  const from = new Date(fy!, fm! - 1, fd!)
  const to = new Date(ty!, tm! - 1, td!)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

export function daysUntilWeddingDate(
  date: string | null | undefined,
  todayKey?: string,
): number | null {
  const target = toLocalCalendarDateKey(date)
  if (!target) return null
  const today = todayKey ?? localCalendarDateKey()
  return civilDaysBetween(today, target)
}

export function resolveDayModeProminence(input: {
  daysUntil: number | null
  delivered: boolean
}): DayModeProminence {
  if (input.delivered) return 'overflow'
  if (input.daysUntil == null) return 'tertiary'
  if (input.daysUntil < 0) return 'overflow'
  if (input.daysUntil === 0) return 'primary'
  if (input.daysUntil <= PRE_WEDDING_PREP_WINDOW_DAYS) return 'secondary'
  return 'tertiary'
}

export function formatModernWeddingCountdown(countdown: string): string {
  return countdown === 'Za 1 dni' ? 'Za 1 dzień' : countdown
}

export function composeRecordHeroDateParts(
  date: string | null | undefined,
): RecordHeroDateParts | null {
  const key = toLocalCalendarDateKey(date)
  if (!key) return null
  const [y, m, d] = key.split('-').map(Number)
  if (!y || !m || !d) return null
  const local = new Date(y, m - 1, d, 12, 0, 0)
  return {
    day: String(d),
    month: local
      .toLocaleDateString('pl-PL', { month: 'short' })
      .replace('.', ''),
    weekday: polishWeekdayFromKey(key) ?? '',
  }
}

function polishWeekdayFromKey(key: string): string | null {
  const [y, m, d] = key.split('-').map(Number)
  if (!y || !m || !d) return null
  const day = new Date(y, m - 1, d).getDay()
  return PL_WEEKDAYS[day] ?? null
}

export function composeRecordHeroCountdown(
  date: string | null | undefined,
  todayKey?: string,
): RecordHeroCountdown | null {
  const days = daysUntilWeddingDate(date, todayKey)
  if (days == null) return null
  if (days < 0) {
    return { kind: 'past', value: 'PO', unit: 'ślubie', caption: null }
  }
  if (days === 0) {
    return { kind: 'today', value: 'DZIŚ', unit: null, caption: null }
  }
  return {
    kind: 'future',
    value: String(days),
    unit: days === 1 ? 'dzień' : 'dni',
    caption: 'do ślubu',
  }
}

export function composeHeaderMetaLine(input: {
  venueText: string | null | undefined
  packageName: string | null | undefined
}): string | null {
  const venue = input.venueText?.trim() || null
  const pkg = input.packageName?.trim() || null
  const parts = [venue, pkg].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

export function composeModernWeddingHeaderMeta(
  wedding: Wedding,
  places: WeddingPlace[] = [],
  todayKey?: string,
): HeaderMetaView {
  const venue = getWeddingPrimaryLocationSummary(wedding, places).displayText
  return {
    dateParts: composeRecordHeroDateParts(wedding.date),
    countdown: composeRecordHeroCountdown(wedding.date, todayKey),
    metaLine: composeHeaderMetaLine({
      venueText: venue,
      packageName: wedding.packageName,
    }),
  }
}

function paymentOverdue(wedding: Wedding, todayKey?: string): boolean {
  const commercial = getWeddingCommercialSummary(wedding)
  const due = toLocalCalendarDateKey(commercial.finalPaymentDueDate)
  if (!due || commercial.remainingToPay <= 0) return false
  const today = todayKey ?? localCalendarDateKey()
  return due < today
}

function deliveryStateFor(
  wedding: Wedding,
  todayKey?: string,
): DeliveryDeadlineState {
  return getDeliveryDeadlineState({
    deliveryDueDate: wedding.deliveryDueDate,
    deliveryCompletedAt: wedding.deliveryCompletedAt,
    todayKey,
  })
}

function isDelivered(wedding: Wedding): boolean {
  return Boolean(wedding.deliveryCompletedAt?.trim())
}

function contractQuestionnaireStatus(wedding: Wedding): QuestionnaireStatus {
  return wedding.questionnaires?.contractData?.status ?? 'not_sent'
}

function formatDeliveredDate(wedding: Wedding): string | null {
  const raw = wedding.deliveryCompletedAt?.trim()
  if (!raw) return null
  const key = toLocalCalendarDateKey(raw)
  return key ? formatDate(key) : formatDate(raw)
}

function story(view: CurrentStoryView): CurrentStoryView {
  return view
}

function mapResolverStory(
  action: WeddingNextAction,
  missingTemplate: boolean,
): CurrentStoryView {
  switch (action.id) {
    case 'send_contract_questionnaire':
      return story({
        kind: 'send_contract_questionnaire',
        eyebrow: 'Teraz',
        title: 'Zbierz dane do umowy',
        support: null,
        primaryAction: { label: 'Wyślij ankietę', id: action.id },
        quietLink: null,
        ownsIssueIds: ['contract_data'],
      })
    case 'resolve_travel_fee':
      return story({
        kind: 'resolve_travel_fee',
        eyebrow: 'Teraz',
        title: 'Ustal koszt dojazdu',
        support: null,
        primaryAction: { label: 'Ustal', id: action.id },
        quietLink: null,
        ownsIssueIds: ['unresolved_travel'],
      })
    case 'generate_contract':
      return story({
        kind: 'generate_contract',
        eyebrow: 'Teraz',
        title: 'Dane są gotowe do umowy',
        support: missingTemplate ? 'Brak szablonu w pakiecie' : null,
        primaryAction: missingTemplate
          ? null
          : { label: 'Wygeneruj', id: action.id },
        quietLink: missingTemplate
          ? { label: 'Przejdź do pakietu', id: 'open_package' }
          : null,
        ownsIssueIds: missingTemplate
          ? ['generate_contract', 'missing_template']
          : ['generate_contract'],
      })
    case 'mark_contract_signed':
      return story({
        kind: 'mark_contract_signed',
        eyebrow: 'Teraz',
        title: 'Umowa czeka na oznaczenie podpisu',
        support: null,
        primaryAction: { label: 'Oznacz', id: action.id },
        quietLink: null,
        ownsIssueIds: ['unsigned_contract'],
      })
    case 'record_deposit':
      return story({
        kind: 'record_deposit',
        eyebrow: 'Teraz',
        title: 'Zarejestruj zadatek',
        support: null,
        primaryAction: { label: 'Zarejestruj', id: action.id },
        quietLink: null,
        ownsIssueIds: ['deposit'],
      })
    case 'send_prewedding':
      return story({
        kind: 'send_prewedding',
        eyebrow: 'Teraz',
        title: 'Wyślij ankietę przedślubną',
        support: null,
        primaryAction: { label: 'Wyślij', id: action.id },
        quietLink: null,
        ownsIssueIds: ['prewedding'],
      })
    case 'review_apply':
      return story({
        kind: 'apply',
        eyebrow: 'Teraz',
        title: 'Para przysłała zmiany do planu',
        support: null,
        primaryAction: { label: 'Przejrzyj', id: action.id },
        quietLink: null,
        ownsIssueIds: ['apply'],
      })
    case 'complete_core_locations':
      return story({
        kind: 'complete_core_locations',
        eyebrow: 'Teraz',
        title: 'Uzupełnij ceremonię i przyjęcie',
        support: null,
        primaryAction: { label: 'Uzupełnij', id: action.id },
        quietLink: null,
        ownsIssueIds: ['missing_locations'],
      })
    case 'set_ceremony_time':
      return story({
        kind: 'set_ceremony_time',
        eyebrow: 'Teraz',
        title: 'Ustaw godzinę ceremonii',
        support: null,
        primaryAction: { label: 'Ustaw', id: action.id },
        quietLink: null,
        ownsIssueIds: ['ceremony_time'],
      })
    default: {
      const _exhaustive: never = action.id
      return _exhaustive
    }
  }
}

export function composeModernWeddingCurrentStory(input: {
  wedding: Wedding
  action: WeddingNextAction | null
  applyCount: number
  preweddingStatus?: QuestionnaireStatus | null
  missingTemplate?: boolean
  todayKey?: string
}): CurrentStoryView {
  const {
    wedding,
    action,
    applyCount,
    missingTemplate = false,
    todayKey,
  } = input
  const days = daysUntilWeddingDate(wedding.date, todayKey)
  const past = days != null && days < 0
  const delivered = isDelivered(wedding)
  const overduePay = paymentOverdue(wedding, todayKey)
  const delivery = deliveryStateFor(wedding, todayKey)
  const overdueDelivery = delivery === 'overdue'
  const contractQ = contractQuestionnaireStatus(wedding)
  const contractStatus = wedding.contract?.status ?? 'none'
  const preStatus =
    input.preweddingStatus ??
    wedding.questionnaires?.weddingQuestionnaire?.status ??
    'not_sent'
  const commercial = getWeddingCommercialSummary(wedding)

  if (applyCount > 0) {
    return story({
      kind: 'apply',
      eyebrow: 'Teraz',
      title: 'Para przysłała zmiany do planu',
      support: null,
      primaryAction: { label: 'Przejrzyj', id: 'review_apply' },
      quietLink: null,
      ownsIssueIds: ['apply'],
    })
  }

  if (action) {
    return mapResolverStory(action, missingTemplate)
  }

  if (overduePay || overdueDelivery) {
    const supportParts: string[] = []
    let title = 'Wymaga uwagi'
    let primary: CurrentStoryView['primaryAction'] = null
    const owns: CurrentStoryIssueId[] = []
    if (overduePay) {
      title = `Pozostało ${formatCurrency(commercial.remainingToPay)} po terminie`
      primary = { label: 'Przejdź do płatności', id: 'open_finance' }
      owns.push('overdue_payment')
    }
    if (overdueDelivery) {
      owns.push('overdue_delivery')
      if (!overduePay) {
        title = 'Oddanie jest po terminie'
        primary = { label: 'Zobacz termin oddania', id: 'open_delivery' }
      } else {
        supportParts.push('Oddanie jest po terminie')
      }
    }
    return story({
      kind: 'overdue',
      eyebrow: 'Uwaga',
      title,
      support: supportParts[0] ?? null,
      primaryAction: primary,
      quietLink: null,
      ownsIssueIds: owns,
    })
  }

  if (!past) {
    if (contractQ === 'sent' && contractStatus === 'none') {
      return story({
        kind: 'waiting_contract',
        eyebrow: 'Oczekuje',
        title: 'Para uzupełnia dane do umowy',
        support: null,
        primaryAction: null,
        quietLink: null,
        ownsIssueIds: ['contract_data'],
      })
    }
    if (preStatus === 'sent') {
      return story({
        kind: 'waiting_prewedding',
        eyebrow: 'Oczekuje',
        title: 'Para wypełnia ankietę przedślubną',
        support: null,
        primaryAction: null,
        quietLink: null,
        ownsIssueIds: ['prewedding'],
      })
    }
  }

  if (delivered) {
    const when = formatDeliveredDate(wedding)
    return story({
      kind: 'delivered',
      eyebrow: 'Oddane',
      title: when ? `Materiały oddane ${when}` : 'Materiały oddane',
      support: null,
      primaryAction: null,
      quietLink: null,
      ownsIssueIds: [],
    })
  }

  if (past) {
    return story({
      kind: 'past',
      eyebrow: 'Po ślubie',
      title: 'Ślub się odbył',
      support: null,
      primaryAction: null,
      quietLink: null,
      ownsIssueIds: [],
    })
  }

  return story({
    kind: 'ready',
    eyebrow: 'Gotowe',
    title: MODERN_READY_STORY_TITLE,
    support: null,
    primaryAction: null,
    quietLink: null,
    ownsIssueIds: [],
  })
}

export function composeModernWeddingAttention(input: {
  wedding: Wedding
  places?: WeddingPlace[]
  applyCount: number
  missingTemplate?: boolean
  story: CurrentStoryView
  todayKey?: string
}): AttentionView {
  const { wedding, applyCount, missingTemplate = false, story: current } = input
  const places = input.places ?? []
  const owned = new Set(current.ownsIssueIds)
  const candidates: AttentionItem[] = []
  const contractStatus = wedding.contract?.status ?? 'none'
  const commercial = getWeddingCommercialSummary(wedding)
  const due = toLocalCalendarDateKey(commercial.finalPaymentDueDate)
  const overduePay = paymentOverdue(wedding, input.todayKey)
  const delivery = deliveryStateFor(wedding, input.todayKey)

  if (
    (contractStatus === 'generated' || contractStatus === 'sent') &&
    !owned.has('unsigned_contract')
  ) {
    candidates.push({
      id: 'unsigned_contract',
      label: 'Umowa oczekuje na oznaczenie podpisu',
      action: { label: 'Oznacz', id: 'mark_contract_signed' },
    })
  }

  if (overduePay && !owned.has('overdue_payment')) {
    candidates.push({
      id: 'overdue_payment',
      label: `Pozostało ${formatCurrency(commercial.remainingToPay)}${
        due ? ` · termin ${formatDate(due)}` : ''
      }`,
      action: { label: 'Przejdź do płatności', id: 'open_finance' },
    })
  }

  if (
    missingTemplate &&
    contractStatus === 'none' &&
    !owned.has('missing_template')
  ) {
    candidates.push({
      id: 'missing_template',
      label: 'Brak szablonu w pakiecie',
      action: { label: 'Przejdź do pakietu', id: 'open_package' },
    })
  }

  if (!isTravelFeeResolved(wedding) && !owned.has('unresolved_travel')) {
    if (current.kind !== 'send_contract_questionnaire' && current.kind !== 'waiting_contract') {
      candidates.push({
        id: 'unresolved_travel',
        label: 'Koszt dojazdu nieustalony',
        action: { label: 'Ustal', id: 'resolve_travel_fee' },
      })
    }
  }

  if (applyCount > 0 && !owned.has('apply')) {
    candidates.push({
      id: 'apply',
      label: 'Aktualizacje z ankiety do przeglądu',
      action: { label: 'Przejrzyj', id: 'review_apply' },
    })
  }

  if (delivery === 'overdue' && !owned.has('overdue_delivery')) {
    candidates.push({
      id: 'overdue_delivery',
      label: 'Oddanie jest po terminie',
      action: { label: 'Zobacz termin', id: 'open_delivery' },
    })
  }

  if (
    !hasCoreLocations(wedding, places) &&
    !owned.has('missing_locations') &&
    current.kind !== 'send_contract_questionnaire' &&
    current.kind !== 'waiting_contract'
  ) {
    candidates.push({
      id: 'missing_locations',
      label: 'Brak ceremonii lub przyjęcia',
      action: { label: 'Uzupełnij', id: 'complete_core_locations' },
    })
  }

  const visible = candidates.slice(0, 3)
  return {
    items: visible,
    overflowCount: Math.max(0, candidates.length - visible.length),
  }
}

export function composeModernWeddingReadiness(input: {
  wedding: Wedding
  places?: WeddingPlace[]
  applyCount: number
  preweddingStatus?: QuestionnaireStatus | null
  missingTemplate?: boolean
  storyKind: CurrentStoryKind
}): ReadinessView {
  const { wedding, applyCount, missingTemplate = false, storyKind } = input
  const places = input.places ?? []
  const items: ReadinessItem[] = []
  const contractQ = contractQuestionnaireStatus(wedding)
  const contractStatus = wedding.contract?.status ?? 'none'
  const preStatus =
    input.preweddingStatus ??
    wedding.questionnaires?.weddingQuestionnaire?.status ??
    'not_sent'
  const agreedDeposit = getWeddingCommercialSummary(wedding).agreedDeposit
  const depositPaid = hasPaidDepositPayment(wedding.payments ?? [])

  if (contractQ === 'sent' && contractStatus === 'none') {
    items.push({
      id: 'contract-data',
      domain: 'Dane do umowy',
      status: 'Oczekuje na parę',
    })
  } else if (
    contractQ === 'not_sent' &&
    !isClientContractCollectionComplete(wedding)
  ) {
    items.push({
      id: 'contract-data',
      domain: 'Dane do umowy',
      status: 'Niekompletne',
    })
  }

  if (contractStatus !== 'signed') {
    if (contractStatus === 'generated' || contractStatus === 'sent') {
      items.push({
        id: 'contract',
        domain: 'Umowa',
        status: 'Do podpisu',
      })
    } else if (missingTemplate) {
      items.push({
        id: 'contract',
        domain: 'Umowa',
        status: 'Brak szablonu',
      })
    } else if (contractStatus === 'none') {
      items.push({
        id: 'contract',
        domain: 'Umowa',
        status: 'Do wygenerowania',
      })
    }
  }

  if (agreedDeposit > 0 && !depositPaid) {
    items.push({
      id: 'deposit',
      domain: 'Zadatek',
      status: 'Brak zadatku',
    })
  }

  if (applyCount > 0) {
    items.push({
      id: 'apply',
      domain: 'Ankieta przedślubna',
      status: MODERN_APPLY_READINESS_STATUS,
    })
  } else if (preStatus === 'not_sent') {
    items.push({
      id: 'prewedding',
      domain: 'Ankieta przedślubna',
      status: 'Nie wysłana',
    })
  } else if (preStatus === 'sent') {
    items.push({
      id: 'prewedding',
      domain: 'Ankieta przedślubna',
      status: 'Oczekuje',
    })
  }

  if (!hasCoreLocations(wedding, places)) {
    items.push({
      id: 'places',
      domain: 'Miejsca',
      status: 'Brak ceremonii/przyjęcia',
    })
  }

  const blockedApproved = items.filter(
    (item) => /zatwierdzon/i.test(`${item.domain} ${item.status}`),
  )
  if (applyCount > 0 && blockedApproved.length > 0) {
    return {
      kind: 'items',
      items: items.filter(
        (item) => !/zatwierdzon/i.test(`${item.domain} ${item.status}`),
      ),
    }
  }

  if (items.length === 0) {
    if (
      storyKind === 'ready' ||
      storyKind === 'past' ||
      storyKind === 'delivered'
    ) {
      return { kind: 'hidden' }
    }
    return { kind: 'complete', line: 'Przygotowania kompletne' }
  }

  return { kind: 'items', items }
}

export function composeModernWeddingCommercialHealth(
  wedding: Wedding,
  todayKey?: string,
): CommercialHealthView {
  const commercial = getWeddingCommercialSummary(wedding)
  const due = toLocalCalendarDateKey(commercial.finalPaymentDueDate)
  const overduePay = paymentOverdue(wedding, todayKey)
  const delivery = deliveryStateFor(wedding, todayKey)
  const dueDateLabel = due ? formatDate(due) : null

  let paymentKind: CommercialHealthView['paymentKind'] = 'partial'
  let paymentSentence: string
  let remainingLabel: string | null = formatCurrency(commercial.remainingToPay)
  let paymentTone: CommercialHealthView['paymentTone'] = overduePay
    ? 'overdue'
    : 'quiet'

  if (commercial.totalPaid <= 0) {
    paymentKind = 'none'
    paymentSentence = 'Brak wpłat'
    paymentTone = 'none'
  } else if (commercial.remainingToPay <= 0) {
    paymentKind = 'paid'
    paymentSentence = 'Opłacone'
    remainingLabel = null
    paymentTone = 'paid'
  } else {
    paymentSentence = `Wpłacono ${formatCurrency(commercial.totalPaid)} · Pozostało ${formatCurrency(commercial.remainingToPay)}`
  }

  let deliveryView: CommercialHealthView['delivery'] = null
  if (delivery !== 'none') {
    if (delivery === 'completed') {
      const when = formatDeliveredDate(wedding)
      deliveryView = {
        label: 'Oddano',
        value: when ?? '',
        tone: 'completed',
      }
    } else {
      const dueDelivery = toLocalCalendarDateKey(wedding.deliveryDueDate)
      const value = dueDelivery ? formatDate(dueDelivery) : ''
      deliveryView = {
        label: 'Termin oddania',
        value,
        tone:
          delivery === 'overdue'
            ? 'overdue'
            : delivery === 'due_today'
              ? 'today'
              : 'quiet',
      }
    }
  }

  return {
    contractValueLabel: formatCurrency(commercial.contractValue),
    paidLabel: formatCurrency(commercial.totalPaid),
    paymentKind,
    paymentSentence,
    remainingLabel,
    dueLabel: dueDateLabel,
    dueTone: overduePay ? 'overdue' : 'quiet',
    paymentTone,
    delivery: deliveryView,
  }
}

export function composeFilledPlaces(wedding: Wedding, places: WeddingPlace[]) {
  return getWeddingLocationItems(wedding, places).filter((item) => !item.empty)
}

export type CorrespondenceOverviewRow = {
  id: string
  channelLabel: string
  display: CorrespondenceLink
}

export function composeCorrespondenceOverview(
  wedding: Wedding,
): CorrespondenceOverviewRow[] {
  const rows: CorrespondenceOverviewRow[] = []
  for (const entry of wedding.correspondence ?? []) {
    const display = getCorrespondenceDisplay(entry)
    if (!display) continue
    rows.push({
      id: entry.id,
      channelLabel: CORRESPONDENCE_CHANNEL_LABELS[entry.channel],
      display,
    })
  }
  return rows
}

export function composePackageOverviewMeta(wedding: Wedding) {
  const pkg = getPackageSummary(wedding)
  const commercial = getWeddingCommercialSummary(wedding)
  const hours =
    commercial.coverageHours != null
      ? `${commercial.coverageHours} godz.`
      : null
  const coverageEnd = commercial.coverageEndTime
    ? `maks. ${commercial.coverageEndTime}`
    : null
  const coverage = [hours, coverageEnd].filter(Boolean).join(' · ') || null
  const delivery =
    pkg.deliveryLabel !== '—' ? `Oddanie do ${pkg.deliveryLabel}` : null
  return {
    name: wedding.packageName?.trim() || pkg.name,
    hasNamedPackage: Boolean(wedding.packageName?.trim()),
    coverage,
    delivery,
    items: pkg.items,
  }
}

export type CalendarOverviewRow = {
  name: 'Apple' | 'Google'
  status: string
  tone: 'active' | 'pending' | 'attention' | 'off'
}

export function composeCalendarsRows(input: {
  googleState?: string | null
  appleState?: string | null
}): CalendarOverviewRow[] {
  const rows: CalendarOverviewRow[] = []
  const apple = input.appleState ?? 'inactive'
  const google = input.googleState ?? 'not_configured'
  if (apple === 'available') {
    rows.push({ name: 'Apple', status: 'Aktywny', tone: 'active' })
  } else if (apple === 'category_disabled') {
    rows.push({ name: 'Apple', status: 'Wyłączony', tone: 'off' })
  }
  if (google === 'synced') {
    rows.push({ name: 'Google', status: 'Aktywny', tone: 'active' })
  } else if (google === 'pending' || google === 'syncing') {
    rows.push({ name: 'Google', status: 'Oczekuje', tone: 'pending' })
  } else if (google === 'needs_attention') {
    rows.push({ name: 'Google', status: 'Wymaga uwagi', tone: 'attention' })
  }
  return rows
}

export function composeCalendarsLine(input: {
  googleState?: string | null
  appleState?: string | null
}): string {
  const rows = composeCalendarsRows(input)
  if (rows.length === 0) return 'Kalendarze'
  return `Kalendarze · ${rows
    .map((row) => `${row.name} ${row.status.toLowerCase()}`)
    .join(' · ')}`
}

export { PRE_WEDDING_PREP_WINDOW_DAYS }
