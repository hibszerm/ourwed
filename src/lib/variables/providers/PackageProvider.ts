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
 * Resolves package slots from a document draft package snapshot.
 * Keys come from SystemVariableRegistry — no duplicated package ID lists here.
 */
export const packageVariableProvider: VariableProvider = {
  id: 'package',

  async resolve(ctx: VariableResolveContext) {
    const snap = ctx.packageSnapshot
    if (!snap || typeof snap !== 'object') return {}

    const out: Record<string, string> = {}

    const snapshotFieldById: Record<string, string[]> = {
      package_name: ['name', 'packageName'],
      package_price: ['price', 'totalPrice'],
      deposit_amount: ['deposit', 'depositAmount'],
      deposit_type: ['depositType'],
      deposit_percent: ['depositPercent'],
      remaining_payment: ['remaining', 'remainingPayment'],
      payment_deadline: ['paymentDeadline', 'paymentDueDays'],
      payment_installments: ['installments'],
      delivery_time: ['deliveryTime', 'delivery'],
      included_services: ['includedServices'],
      photographers_count: ['photographersCount'],
      videographers_count: ['videographersCount'],
      working_hours: ['workingHours', 'coverageEndTime'],
      coverage_end_time: ['coverageEndTime', 'workingHours'],
      overtime_price: ['overtimePrice', 'overtimeRate'],
      overtime_rate: ['overtimeRate', 'overtimePrice'],
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
        value = asString(readSnap(snap, field))
        if (value) break
      }
      SystemVariableRegistry.emit(out, def.id, value)
    }

    return out
  },
}
