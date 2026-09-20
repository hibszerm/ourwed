import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { isActiveStudioTask } from '@/features/tasks/groupStudioTasks'
import { resolveFinanceDepositStatus } from '@/lib/finance/financeSeasonAggregate'
import { formatPolishPostalAddress } from '@/lib/utils/formatPolishPostalAddress'
import { getDeliveryDeadlineState } from '@/lib/utils/weddingDeliveryDeadline'
import { resolveDeliveryDueDate } from '@/lib/utils/deliveryDueDate'
import {
  contractGenerationReadinessDisplayText,
  projectContractGenerationReadiness,
} from '@/lib/utils/contractGenerationIntegrity'
import { isTravelFeeResolved } from '@/lib/utils/travelFeeCommercial'
import { isPreWeddingSubmittedStatus } from '@/types/preweddingQuestionnaire'
import { WORKFLOW_STAGE_LABELS } from '@/lib/utils/workflow'
import type { Payment, Wedding } from '@/types/wedding'
import {
  getAgreedDeposit,
  getContractValue,
  getDepositPaid,
  getEffectiveTravelFeeAmount,
  getRemainingAfterDeposit,
  getRemainingToPay,
  getTotalPaid,
  hasPaidDepositPayment,
  resolveFinalPaymentDueDate,
} from './financeAuthority'
import {
  completeRouteTotalsKmMin,
  longestOkLeg,
} from './logisticsAuthority'
import {
  ALL_CONCEPT_KEYS,
  getConcept,
  type AdapterId,
  type ConceptKey,
} from '../registry'
import type { WeddingReadContext } from './WeddingReadContext'
import type { ConceptInspectValue, ConceptScalarValue } from './types'

export type InspectAdapter = (
  ctx: WeddingReadContext,
  conceptKey: ConceptKey,
) => Promise<ConceptInspectValue>

function scalar(
  conceptKey: ConceptKey,
  value: ConceptScalarValue,
  displayText?: string | null,
): ConceptInspectValue {
  return {
    value,
    filled: value !== null && !(typeof value === 'string' && !value.trim()),
    valueType: getConcept(conceptKey).returnType,
    ...(displayText !== undefined ? { displayText } : {}),
  }
}

function structured(
  conceptKey: ConceptKey,
  value: Record<string, unknown>,
  displayText: string,
  filled = true,
): ConceptInspectValue {
  return {
    value,
    filled,
    valueType: getConcept(conceptKey).returnType,
    displayText,
  }
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

async function weddingOrNull(ctx: WeddingReadContext): Promise<Wedding | null> {
  return ctx.getWedding()
}

async function moneyInputs(
  ctx: WeddingReadContext,
): Promise<{ wedding: Wedding | null; payments: Payment[] }> {
  const [wedding, payments] = await Promise.all([
    ctx.getWedding(),
    ctx.getPayments(),
  ])
  return { wedding, payments }
}

function coupleValue(
  side: 'partner1' | 'partner2',
  field: 'name' | 'phone' | 'email' | 'address',
): InspectAdapter {
  return async (ctx, conceptKey) => {
    const wedding = await weddingOrNull(ctx)
    if (!wedding) return scalar(conceptKey, null)
    const c = wedding.couple
    if (field === 'name') return scalar(conceptKey, clean(c[side]))
    if (field === 'phone') {
      return scalar(
        conceptKey,
        clean(
          side === 'partner1'
            ? c.partner1Phone || c.phone
            : c.partner2Phone,
        ),
      )
    }
    if (field === 'email') {
      return scalar(
        conceptKey,
        clean(
          side === 'partner1'
            ? c.partner1Email || c.email
            : c.partner2Email,
        ),
      )
    }
    const formatted =
      side === 'partner1'
        ? formatPolishPostalAddress({
            fullAddress: c.partner1Address,
            postalCode: c.partner1PostalCode,
            city: c.partner1City,
          })
        : formatPolishPostalAddress({
            fullAddress: c.partner2Address,
            postalCode: c.partner2PostalCode,
            city: c.partner2City,
          })
    return scalar(conceptKey, clean(formatted))
  }
}

function operationalSlot(
  role:
    | 'ceremony'
    | 'reception'
    | 'bride_preparation'
    | 'groom_preparation',
  field: 'name' | 'address' | 'time',
): InspectAdapter {
  return async (ctx, conceptKey) => {
    const day = await ctx.getOperationalDay()
    if (day.status !== 'ok') return scalar(conceptKey, null)
    const slot = day.slots.find((item) => item.role === role)
    return scalar(conceptKey, clean(slot?.[field]))
  }
}

async function activeTasks(ctx: WeddingReadContext) {
  return (await ctx.getTasks()).filter(isActiveStudioTask)
}

const unsupportedInspect: InspectAdapter = async (_ctx, conceptKey) => {
  throw new Error(`Concept is list-related, not inspectable: ${conceptKey}`)
}

export const inspectAdapters: Partial<Record<AdapterId, InspectAdapter>> = {
  'wedding.date': async (ctx, key) =>
    scalar(key, clean((await weddingOrNull(ctx))?.date)),
  'wedding.display_name': async (ctx, key) => {
    const wedding = await weddingOrNull(ctx)
    return scalar(key, wedding ? getWeddingDisplayName(wedding) : null)
  },
  'wedding.status': async (ctx, key) =>
    scalar(key, (await weddingOrNull(ctx))?.status ?? null),
  'wedding.primary_location': async (ctx, key) => {
    const wedding = await weddingOrNull(ctx)
    return scalar(
      key,
      clean(
        wedding?.primaryLocation?.displayText ||
          wedding?.couple.city ||
          wedding?.receptionLocation ||
          wedding?.ceremonyLocation,
      ),
    )
  },
  'wedding.ceremony_time_scalar': async (ctx, key) =>
    scalar(key, clean((await weddingOrNull(ctx))?.ceremonyTime)),
  'contact.bride_name': coupleValue('partner1', 'name'),
  'contact.groom_name': coupleValue('partner2', 'name'),
  'contact.bride_phone': coupleValue('partner1', 'phone'),
  'contact.groom_phone': coupleValue('partner2', 'phone'),
  'contact.bride_email': coupleValue('partner1', 'email'),
  'contact.groom_email': coupleValue('partner2', 'email'),
  'contact.bride_address': coupleValue('partner1', 'address'),
  'contact.groom_address': coupleValue('partner2', 'address'),
  'contact.extra_contacts': unsupportedInspect,
  'place.ceremony_place': operationalSlot('ceremony', 'name'),
  'place.ceremony_address': operationalSlot('ceremony', 'address'),
  'place.reception_place': operationalSlot('reception', 'name'),
  'place.reception_address': operationalSlot('reception', 'address'),
  'place.bride_prep_place': operationalSlot('bride_preparation', 'name'),
  'place.bride_prep_address': operationalSlot(
    'bride_preparation',
    'address',
  ),
  'place.groom_prep_place': operationalSlot('groom_preparation', 'name'),
  'place.groom_prep_address': operationalSlot(
    'groom_preparation',
    'address',
  ),
  'ops.ceremony_time': operationalSlot('ceremony', 'time'),
  'ops.bride_prep_time': operationalSlot('bride_preparation', 'time'),
  'ops.groom_prep_time': operationalSlot('groom_preparation', 'time'),
  'ops.reception_time': operationalSlot('reception', 'time'),
  'ops.day_plan_stops': unsupportedInspect,
  'pkg.name': async (ctx, key) =>
    scalar(key, clean((await weddingOrNull(ctx))?.packageName)),
  'pkg.coverage_hours': async (ctx, key) =>
    scalar(key, (await weddingOrNull(ctx))?.coverageHours ?? null),
  'pkg.items': unsupportedInspect,
  'pkg.extras': unsupportedInspect,
  'pkg.extras_total': async (ctx, key) => {
    const extras = await ctx.getExtras()
    return scalar(
      key,
      extras.reduce(
        (sum, extra) => sum + extra.priceSnapshot * extra.quantity,
        0,
      ),
    )
  },
  'fin.contract_value': async (ctx, key) => {
    const wedding = await weddingOrNull(ctx)
    return scalar(key, wedding ? getContractValue(wedding) : 0)
  },
  'fin.agreed_deposit': async (ctx, key) => {
    const wedding = await weddingOrNull(ctx)
    return scalar(key, wedding ? getAgreedDeposit(wedding) : 0)
  },
  'fin.total_paid': async (ctx, key) =>
    scalar(key, getTotalPaid(await ctx.getPayments())),
  'fin.remaining_to_pay': async (ctx, key) => {
    const { wedding, payments } = await moneyInputs(ctx)
    return scalar(
      key,
      wedding ? getRemainingToPay(getContractValue(wedding), payments) : 0,
    )
  },
  'fin.remaining_after_deposit': async (ctx, key) => {
    const wedding = await weddingOrNull(ctx)
    return scalar(
      key,
      wedding
        ? getRemainingAfterDeposit(
            getContractValue(wedding),
            getAgreedDeposit(wedding),
          )
        : 0,
    )
  },
  'fin.deposit_paid_amount': async (ctx, key) =>
    scalar(key, getDepositPaid(await ctx.getPayments())),
  'fin.deposit_paid': async (ctx, key) =>
    scalar(key, hasPaidDepositPayment(await ctx.getPayments())),
  'fin.deposit_status': async (ctx, key) => {
    const { wedding, payments } = await moneyInputs(ctx)
    return scalar(
      key,
      resolveFinanceDepositStatus(
        wedding ? getAgreedDeposit(wedding) : 0,
        getDepositPaid(payments),
      ),
    )
  },
  'fin.final_payment_due_date': async (ctx, key) => {
    const wedding = await weddingOrNull(ctx)
    if (!wedding) return scalar(key, null)
    const due =
      clean(wedding.finalPaymentDueDate) ??
      resolveFinalPaymentDueDate({
        terms: wedding.finalPaymentTerms,
        weddingDate: wedding.date,
        deliveryDate: wedding.deliveryCompletedAt,
      })
    return scalar(key, due)
  },
  'fin.payment_schedule': unsupportedInspect,
  'fin.currency': async (ctx, key) =>
    scalar(key, clean((await weddingOrNull(ctx))?.currency) ?? 'PLN'),
  'contract.status': async (ctx, key) =>
    scalar(key, (await ctx.getContract())?.status ?? null),
  'contract.generated_at': async (ctx, key) =>
    scalar(key, clean((await ctx.getContract())?.generatedAt)),
  'contract.signed_at': async (ctx, key) =>
    scalar(key, clean((await ctx.getContract())?.signedAt)),
  'contract.signed': async (ctx, key) =>
    scalar(key, (await ctx.getContract())?.status === 'signed'),
  'contract.readiness': async (ctx, key) => {
    const [wedding, payments] = await Promise.all([
      ctx.getWedding(),
      ctx.getPayments(),
    ])
    if (!wedding) return scalar(key, null)
    // Same gate as UI generate-contract (mayGenerateContract / validateContractGeneration).
    // Do NOT use evaluateWeddingContractReadiness alone — it omits travel fee resolution.
    const fact = projectContractGenerationReadiness({
      ...wedding,
      payments,
    })
    return structured(
      key,
      {
        ready: fact.ready,
        overall: fact.overall,
        blockers: fact.blockers,
        primaryCorrection: fact.primaryCorrection,
        ...(fact.blockCode ? { blockCode: fact.blockCode } : {}),
        ...(fact.title ? { title: fact.title } : {}),
        ...(fact.description ? { description: fact.description } : {}),
        // Legacy counters kept for older consumers; derived from blockers only.
        requiredMissing: fact.blockers.length,
        requiredTotal: fact.blockers.length,
      },
      contractGenerationReadinessDisplayText(fact),
    )
  },
  'task.open_count': async (ctx, key) =>
    scalar(key, (await activeTasks(ctx)).length),
  'task.has_open': async (ctx, key) =>
    scalar(key, (await activeTasks(ctx)).length > 0),
  'task.overdue_count': async (ctx, key) => {
    const today = new Date().toISOString().slice(0, 10)
    const count = (await activeTasks(ctx)).filter(
      (task) => task.dueDate && task.dueDate < today,
    ).length
    return scalar(key, count)
  },
  'task.has_overdue': async (ctx, key) => {
    const today = new Date().toISOString().slice(0, 10)
    return scalar(
      key,
      (await activeTasks(ctx)).some(
        (task) => task.dueDate && task.dueDate < today,
      ),
    )
  },
  'task.next_due_date': async (ctx, key) => {
    const dueDates = (await activeTasks(ctx))
      .map((task) => task.dueDate)
      .filter(Boolean)
      .sort()
    return scalar(key, dueDates[0] ?? null)
  },
  'task.open_list': unsupportedInspect,
  'delivery.due_date': async (ctx, key) => {
    const wedding = await weddingOrNull(ctx)
    if (!wedding) return scalar(key, null)
    return scalar(
      key,
      clean(wedding.deliveryDueDate) ??
        resolveDeliveryDueDate({
          weddingDate: wedding.date,
          deliveryMonths: wedding.deliveryMonths,
          deliveryDays: wedding.deliveryDays,
        }),
    )
  },
  'delivery.state': async (ctx, key) => {
    const wedding = await weddingOrNull(ctx)
    if (!wedding) return scalar(key, null)
    const dueDate =
      clean(wedding.deliveryDueDate) ??
      resolveDeliveryDueDate({
        weddingDate: wedding.date,
        deliveryMonths: wedding.deliveryMonths,
        deliveryDays: wedding.deliveryDays,
      })
    return scalar(
      key,
      getDeliveryDeadlineState({
        deliveryDueDate: dueDate,
        deliveryCompletedAt: wedding.deliveryCompletedAt,
      }),
    )
  },
  'q.contract_status': async (ctx, key) =>
    scalar(
      key,
      (await weddingOrNull(ctx))?.questionnaires.contractData.status ?? null,
    ),
  'q.prewedding_status': async (ctx, key) =>
    scalar(key, (await ctx.getPrewedding())?.status ?? null),
  'q.contract_completed': async (ctx, key) =>
    scalar(
      key,
      (await weddingOrNull(ctx))?.questionnaires.contractData.status ===
        'completed',
    ),
  'q.prewedding_completed': async (ctx, key) => {
    const questionnaire = await ctx.getPrewedding()
    return scalar(
      key,
      questionnaire
        ? isPreWeddingSubmittedStatus(questionnaire.status)
        : false,
    )
  },
  'session.has_any': async (ctx, key) =>
    scalar(key, (await ctx.getSessions()).length > 0),
  'session.count': async (ctx, key) =>
    scalar(key, (await ctx.getSessions()).length),
  'session.list': unsupportedInspect,
  'travel.fee_status': async (ctx, key) =>
    scalar(key, (await weddingOrNull(ctx))?.travelFeeStatus ?? 'unresolved'),
  'travel.effective_fee': async (ctx, key) => {
    const wedding = await weddingOrNull(ctx)
    return scalar(key, wedding ? getEffectiveTravelFeeAmount(wedding) : null)
  },
  'travel.resolved': async (ctx, key) => {
    const wedding = await weddingOrNull(ctx)
    if (!wedding) return scalar(key, false)
    return scalar(key, isTravelFeeResolved(wedding))
  },
  'logistics.route_complete': async (ctx, key) => {
    const logistics = await ctx.getLogistics()
    return scalar(key, logistics.flow.routeComplete)
  },
  'logistics.totals_complete': async (ctx, key) => {
    const logistics = await ctx.getLogistics()
    return scalar(key, logistics.summary.totalsComplete)
  },
  'logistics.total_distance_km': async (ctx, key) => {
    const logistics = await ctx.getLogistics()
    const totals = completeRouteTotalsKmMin(logistics.summary)
    return scalar(key, totals.distanceKm, totals.distanceText)
  },
  'logistics.total_drive_duration_min': async (ctx, key) => {
    const logistics = await ctx.getLogistics()
    const totals = completeRouteTotalsKmMin(logistics.summary)
    return scalar(key, totals.durationMinutes, totals.durationText)
  },
  'logistics.has_studio_start': async (ctx, key) => {
    const logistics = await ctx.getLogistics()
    return scalar(key, logistics.flow.hasTravelBase)
  },
  'logistics.return_leg_included': async (_ctx, key) =>
    scalar(key, false, 'Trasa dnia operacyjnego nie obejmuje powrotu do studia'),
  'logistics.longest_leg': async (ctx, key) => {
    const logistics = await ctx.getLogistics()
    const leg = longestOkLeg(logistics.flow)
    if (!leg) return scalar(key, null)
    const display = [
      `${leg.from_title} → ${leg.to_title}`,
      leg.distance_text,
      leg.duration_text,
    ]
      .filter(Boolean)
      .join(' · ')
    return {
      value: { ...leg },
      filled: true,
      valueType: getConcept(key).returnType,
      displayText: display,
    }
  },
  'logistics.route_legs': unsupportedInspect,
  'logistics.route_stops': unsupportedInspect,
  'workflow.stage': async (ctx, key) =>
    scalar(key, (await weddingOrNull(ctx))?.workflowStage ?? null),
  'workflow.stage_label': async (ctx, key) => {
    const stage = (await weddingOrNull(ctx))?.workflowStage
    return scalar(key, stage ? WORKFLOW_STAGE_LABELS[stage] : null)
  },
}

export async function inspectConcept(
  ctx: WeddingReadContext,
  conceptKey: ConceptKey,
): Promise<ConceptInspectValue> {
  const concept = getConcept(conceptKey)
  if (concept.resource !== 'WEDDING') {
    throw new Error(
      `Concept ${conceptKey} is not a WEDDING resource concept`,
    )
  }
  const adapter = inspectAdapters[concept.adapterId]
  if (!adapter) {
    throw new Error(`Missing V6 inspect adapter: ${concept.adapterId}`)
  }
  return adapter(ctx, conceptKey)
}

for (const conceptKey of ALL_CONCEPT_KEYS) {
  const concept = getConcept(conceptKey)
  if (concept.resource !== 'WEDDING') continue
  if (!inspectAdapters[concept.adapterId]) {
    throw new Error(`Missing V6 inspect adapter coverage: ${concept.adapterId}`)
  }
}
