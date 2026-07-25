import { SystemVariableRegistry } from '@/lib/variables/registry'
import type { VariableProvider, VariableResolveContext } from '@/lib/variables/types'

function asString(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const t = value.trim()
    return t || null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return null
}

function readSnap(snap: unknown, key: string): unknown {
  if (!snap || typeof snap !== 'object') return null
  return (snap as Record<string, unknown>)[key]
}

/**
 * Resolves package / commercial slots from a document draft package snapshot.
 * Prefer pre-formatted contract strings when present on the snapshot.
 */
export const packageVariableProvider: VariableProvider = {
  id: 'package',

  async resolve(ctx: VariableResolveContext) {
    const snap = ctx.packageSnapshot
    if (!snap || typeof snap !== 'object') return {}

    const out: Record<string, string> = {}

    const snapshotFieldById: Record<string, string[]> = {
      package_name: ['name', 'packageName'],
      package_name_without_prefix: [
        'packageNameWithoutPrefix',
        'package_name_without_prefix',
      ],
      contract_value: ['contractValue'],
      contract_value_formatted: [
        'contractValueFormatted',
        'contract_value_formatted',
      ],
      contract_value_words: ['contractValueWords', 'contract_value_words'],
      package_price: [
        'contractValueFormatted',
        'contract_value_formatted',
        'price',
        'totalPrice',
      ],
      agreed_deposit: ['agreedDeposit'],
      agreed_deposit_formatted: [
        'agreedDepositFormatted',
        'agreed_deposit_formatted',
      ],
      agreed_deposit_words: ['agreedDepositWords', 'agreed_deposit_words'],
      deposit_amount: [
        'agreedDepositFormatted',
        'agreed_deposit_formatted',
        'deposit',
        'depositAmount',
      ],
      deposit_type: ['depositType'],
      deposit_percent: ['depositPercent'],
      total_paid_formatted: ['totalPaidFormatted', 'total_paid_formatted'],
      total_paid_words: ['totalPaidWords', 'total_paid_words'],
      remaining_to_pay: ['remainingToPay'],
      remaining_to_pay_formatted: [
        'remainingToPayFormatted',
        'remaining_to_pay_formatted',
      ],
      remaining_to_pay_words: [
        'remainingToPayWords',
        'remaining_to_pay_words',
      ],
      remaining_after_deposit: ['remainingAfterDeposit'],
      remaining_after_deposit_formatted: [
        'remainingAfterDepositFormatted',
        'remaining_after_deposit_formatted',
      ],
      remaining_after_deposit_words: [
        'remainingAfterDepositWords',
        'remaining_after_deposit_words',
      ],
      remaining_payment: [
        'remainingAfterDepositFormatted',
        'remaining_after_deposit_formatted',
        'remaining',
        'remainingPayment',
      ],
      payment_deadline: ['paymentDeadline', 'paymentDueDays'],
      payment_installments: ['installments'],
      delivery_time: ['deliveryTermText', 'deliveryTime', 'delivery'],
      delivery_months: ['deliveryMonths', 'delivery_months'],
      delivery_days: ['deliveryDays', 'delivery_days'],
      delivery_term_text: [
        'deliveryTermText',
        'delivery_term_text',
        'deliveryTime',
      ],
      final_payment_due_date: [
        'finalPaymentDueDate',
        'final_payment_due_date',
      ],
      final_payment_due_date_long: [
        'finalPaymentDueDateLong',
        'final_payment_due_date_long',
      ],
      included_services: [
        'includedServicesText',
        'included_services_text',
        'includedServices',
      ],
      included_services_text: [
        'includedServicesText',
        'included_services_text',
      ],
      package_items_count: ['packageItemsCount', 'package_items_count'],
      photographers_count: ['photographersCount'],
      videographers_count: ['videographersCount'],
      coverage_hours: ['coverageHours', 'workingHours', 'coverage_hours'],
      coverage_start_time: ['coverageStartTime', 'coverage_start_time'],
      coverage_end_time: ['coverageEndTime', 'coverage_end_time'],
      overtime_price: [
        'overtimeRateFormatted',
        'overtimePrice',
        'overtime_rate_formatted',
      ],
      overtime_rate: ['overtimeRate', 'overtime_rate'],
      overtime_rate_formatted: [
        'overtimeRateFormatted',
        'overtime_rate_formatted',
        'overtimePrice',
      ],
      overtime_rate_words: ['overtimeRateWords', 'overtime_rate_words'],
      mileage_limit: ['mileageLimit'],
      mileage_price: ['mileagePrice'],
      accommodation: ['accommodation'],
      travel_fee: ['travelFee'],
      album_included: ['albumIncluded'],
      usb_included: ['usbIncluded'],
      online_gallery: ['onlineGallery'],
      engagement_session: ['engagementSession'],
      wedding_session: ['weddingSession'],
      number_of_revisions: ['revisions'],
      assistants: ['assistants'],
      drone_included: ['droneIncluded', 'drone'],
      film_duration: ['filmDuration', 'videoDuration'],
      film_delivery_method: ['filmDeliveryMethod', 'videoDeliveryMethod'],
      film_delivery_format: ['filmDeliveryFormat', 'videoDeliveryFormat'],
      postproduction_duration: [
        'postproductionDuration',
        'postProductionDuration',
        'editingDuration',
      ],
    }

    for (const def of SystemVariableRegistry.listByProvider('package')) {
      const fields = snapshotFieldById[def.id]
      if (!fields) continue
      let value: string | null = null
      for (const field of fields) {
        const raw = readSnap(snap, field)
        if (Array.isArray(raw)) continue
        value = asString(raw)
        if (value) break
      }
      SystemVariableRegistry.emit(out, def.id, value)
    }

    return out
  },
}
