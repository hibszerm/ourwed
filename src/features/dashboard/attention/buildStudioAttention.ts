/**
 * Pure Studio Attention V1 composer — ranking, dedupe, item shaping.
 * No network. Callers supply already-batched hydrated wedding inputs.
 *
 * D2.1: diversity selection + operational copy + relative context are
 * pure in-memory passes over the same candidates (no fetch changes).
 */

import { hrefForWeddingNextAction } from '@/features/calendar/utils/hrefForWeddingNextAction'
import {
  formatAttentionRelativeContext,
  selectStudioAttentionWithDiversity,
  studioAttentionCopyForKind,
} from '@/features/dashboard/attention/studioAttentionPresentation'
import {
  isStudioAttentionNextActionId,
  STUDIO_ATTENTION_LIMIT,
  type StudioAttentionItem,
  type StudioAttentionKind,
  type StudioAttentionUrgency,
} from '@/features/dashboard/attention/studioAttentionTypes'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { localCalendarDateKey, toLocalCalendarDateKey } from '@/lib/utils/localCalendarDate'
import { getDeliveryDeadlineState } from '@/lib/utils/weddingDeliveryDeadline'
import {
  resolveWeddingNextAction,
  type WeddingNextAction,
  type WeddingNextActionContext,
} from '@/lib/workflow/resolveWeddingNextAction'
import {
  isPreWeddingSubmittedStatus,
  type WeddingQuestionnaireStatus,
} from '@/types/preweddingQuestionnaire'
import type { QuestionnaireStatus, Wedding } from '@/types/wedding'

export type StudioAttentionWeddingInput = {
  wedding: Wedding
  /**
   * Raw pre-wedding row status from wedding_questionnaires batch,
   * or already-mapped QuestionnaireStatus. null = no row (not_sent).
   */
  preweddingStatus: QuestionnaireStatus | WeddingQuestionnaireStatus | null
  /** Contract-data questionnaire status (from form_instances batch). */
  contractQuestionnaireStatus: QuestionnaireStatus
}

/** Map wedding_questionnaires lifecycle → Wedding QuestionnaireStatus. */
export function mapPreweddingStatusForAttention(
  status: QuestionnaireStatus | WeddingQuestionnaireStatus | null | undefined,
): QuestionnaireStatus {
  if (status == null) return 'not_sent'
  if (status === 'not_sent' || status === 'sent' || status === 'completed') {
    return status
  }
  if (isPreWeddingSubmittedStatus(status)) return 'completed'
  if (status === 'opened' || status === 'in_progress') {
    return 'sent'
  }
  return 'not_sent'
}

function paymentOverdue(wedding: Wedding, todayKey: string): boolean {
  const commercial = getWeddingCommercialSummary(wedding)
  const due = toLocalCalendarDateKey(commercial.finalPaymentDueDate)
  if (!due || commercial.remainingToPay <= 0) return false
  return due < todayKey
}

function deliveryOverdue(wedding: Wedding, todayKey: string): boolean {
  return (
    getDeliveryDeadlineState({
      deliveryDueDate: wedding.deliveryDueDate,
      deliveryCompletedAt: wedding.deliveryCompletedAt,
      todayKey,
    }) === 'overdue'
  )
}

function urgencyRank(u: StudioAttentionUrgency): number {
  if (u === 'overdue') return 0
  if (u === 'blocker') return 1
  return 2
}

function kindRank(kind: StudioAttentionKind): number {
  if (kind === 'overdue_payment' || kind === 'overdue_delivery') return 0
  if (
    kind === 'complete_contract_data_manually' ||
    kind === 'resolve_travel_fee' ||
    kind === 'generate_contract' ||
    kind === 'mark_contract_sent' ||
    kind === 'mark_contract_signed' ||
    kind === 'record_deposit'
  ) {
    return 1
  }
  return 2
}

function compareItems(a: StudioAttentionItem, b: StudioAttentionItem): number {
  const u = urgencyRank(a.urgency) - urgencyRank(b.urgency)
  if (u !== 0) return u
  const k = kindRank(a.kind) - kindRank(b.kind)
  if (k !== 0) return k
  const ad = a.weddingDate ?? '9999-99-99'
  const bd = b.weddingDate ?? '9999-99-99'
  if (ad !== bd) return ad.localeCompare(bd)
  return a.entityId.localeCompare(b.entityId) || a.id.localeCompare(b.id)
}

function nextActionUrgency(action: WeddingNextAction): StudioAttentionUrgency {
  return action.priority === 'blocker' ? 'blocker' : 'preparation'
}

function withContext(
  item: Omit<StudioAttentionItem, 'contextLabel'>,
  todayKey: string,
): StudioAttentionItem {
  return {
    ...item,
    contextLabel: formatAttentionRelativeContext({
      kind: item.kind,
      dueAt: item.dueAt,
      weddingDate: item.weddingDate,
      todayKey,
    }),
  }
}

function itemFromNextAction(
  wedding: Wedding,
  action: WeddingNextAction,
  todayKey: string,
): StudioAttentionItem | null {
  if (!isStudioAttentionNextActionId(action.id)) return null
  const entityLabel = getWeddingDisplayName(wedding)
  const copy = studioAttentionCopyForKind(action.id)
  return withContext(
    {
      id: `${wedding.id}:${action.id}`,
      kind: action.id,
      entityType: 'wedding',
      entityId: wedding.id,
      title: entityLabel,
      description: copy.description,
      urgency: nextActionUrgency(action),
      dueAt: null,
      href: hrefForWeddingNextAction(wedding.id, action),
      ctaLabel: copy.ctaLabel,
      entityLabel,
      weddingDate: wedding.date?.trim() || null,
    },
    todayKey,
  )
}

function overduePaymentItem(
  wedding: Wedding,
  todayKey: string,
): StudioAttentionItem | null {
  if (!paymentOverdue(wedding, todayKey)) return null
  const commercial = getWeddingCommercialSummary(wedding)
  const due = toLocalCalendarDateKey(commercial.finalPaymentDueDate)
  const entityLabel = getWeddingDisplayName(wedding)
  const copy = studioAttentionCopyForKind('overdue_payment', {
    remainingToPay: commercial.remainingToPay,
    dueKey: due,
  })
  return withContext(
    {
      id: `${wedding.id}:overdue_payment`,
      kind: 'overdue_payment',
      entityType: 'wedding',
      entityId: wedding.id,
      title: entityLabel,
      description: copy.description,
      urgency: 'overdue',
      dueAt: due,
      href: `/sluby/${wedding.id}?tab=contract_finance`,
      ctaLabel: copy.ctaLabel,
      entityLabel,
      weddingDate: wedding.date?.trim() || null,
    },
    todayKey,
  )
}

function overdueDeliveryItem(
  wedding: Wedding,
  todayKey: string,
): StudioAttentionItem | null {
  if (!deliveryOverdue(wedding, todayKey)) return null
  const entityLabel = getWeddingDisplayName(wedding)
  const due = toLocalCalendarDateKey(wedding.deliveryDueDate)
  const copy = studioAttentionCopyForKind('overdue_delivery', { dueKey: due })
  return withContext(
    {
      id: `${wedding.id}:overdue_delivery`,
      kind: 'overdue_delivery',
      entityType: 'wedding',
      entityId: wedding.id,
      title: entityLabel,
      description: copy.description,
      urgency: 'overdue',
      dueAt: due,
      href: `/sluby/${wedding.id}?tab=overview`,
      ctaLabel: copy.ctaLabel,
      entityLabel,
      weddingDate: wedding.date?.trim() || null,
    },
    todayKey,
  )
}

/**
 * Build Attention candidates for one wedding from canonical helpers.
 * At most one Next Action item + optional overdue payment/delivery.
 */
export function collectStudioAttentionForWedding(
  input: StudioAttentionWeddingInput,
  todayKey: string = localCalendarDateKey(),
): StudioAttentionItem[] {
  const { wedding, contractQuestionnaireStatus } = input
  const preStatus = mapPreweddingStatusForAttention(input.preweddingStatus)
  const withQuestionnaires: Wedding = {
    ...wedding,
    questionnaires: {
      contractData: {
        ...wedding.questionnaires.contractData,
        status: contractQuestionnaireStatus,
      },
      weddingQuestionnaire: {
        ...wedding.questionnaires.weddingQuestionnaire,
        status: preStatus,
      },
    },
  }

  const ctx: WeddingNextActionContext = {
    today: todayKey,
    preweddingStatus: preStatus,
    // Apply intentionally omitted in V1 — never invent counts.
    canonicalApplyCandidateCount: 0,
  }

  const items: StudioAttentionItem[] = []
  const action = resolveWeddingNextAction(withQuestionnaires, ctx)
  if (action) {
    const next = itemFromNextAction(withQuestionnaires, action, todayKey)
    if (next) items.push(next)
  }

  const pay = overduePaymentItem(withQuestionnaires, todayKey)
  if (pay) items.push(pay)

  const delivery = overdueDeliveryItem(withQuestionnaires, todayKey)
  if (delivery) items.push(delivery)

  return items
}

/**
 * Rank globally (deterministic), then diversity-select up to `limit`.
 * Dedupes by item id (one issue once).
 */
export function rankStudioAttentionItems(
  items: StudioAttentionItem[],
  limit: number = STUDIO_ATTENTION_LIMIT,
): StudioAttentionItem[] {
  const seen = new Set<string>()
  const unique: StudioAttentionItem[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    unique.push(item)
  }
  const ranked = [...unique].sort(compareItems)
  return selectStudioAttentionWithDiversity(ranked, limit)
}

export function buildStudioAttentionItems(
  inputs: StudioAttentionWeddingInput[],
  todayKey: string = localCalendarDateKey(),
  limit: number = STUDIO_ATTENTION_LIMIT,
): StudioAttentionItem[] {
  const collected = inputs.flatMap((input) =>
    collectStudioAttentionForWedding(input, todayKey),
  )
  return rankStudioAttentionItems(collected, limit)
}
