/**
 * Friendly Polish quality summary for preview UI (no internal codes).
 */

import { formatPlnMajorUnits } from './normalize'
import type {
  DetectedPaymentSchedule,
  FriendlyQualitySummary,
} from './types'

export function buildFriendlyQualitySummary(input: {
  hasClients: boolean
  hasWeddingDate: boolean
  hasLocations: boolean
  providerProtected: boolean
  contractValueOk: boolean
  paymentSchedule: DetectedPaymentSchedule | null
  paymentWasManual: boolean
  attentionMessages?: string[]
}): FriendlyQualitySummary {
  const rows: FriendlyQualitySummary['rows'] = [
    {
      id: 'clients',
      label: 'Dane klientów',
      status: input.hasClients ? 'ok' : 'attention',
    },
    {
      id: 'wedding_date',
      label: 'Data wydarzenia',
      status: input.hasWeddingDate ? 'ok' : 'attention',
    },
    {
      id: 'locations',
      label: 'Lokalizacje',
      status: input.hasLocations ? 'ok' : 'attention',
    },
    {
      id: 'provider',
      label: 'Dane usługodawcy',
      status: input.providerProtected ? 'ok' : 'attention',
    },
    {
      id: 'contract_value',
      label: 'Wartość umowy',
      status: input.contractValueOk ? 'ok' : 'attention',
    },
    {
      id: 'payment_schedule',
      label: 'Harmonogram płatności',
      status: input.paymentWasManual
        ? 'manual'
        : input.paymentSchedule
          ? 'ok'
          : 'attention',
      detail: input.paymentWasManual
        ? 'Harmonogram płatności — uzupełniono ręcznie'
        : undefined,
    },
  ]

  let paymentScheduleManual: FriendlyQualitySummary['paymentScheduleManual']
  if (input.paymentWasManual && input.paymentSchedule) {
    paymentScheduleManual = {
      entries: input.paymentSchedule.entries.map((e) => ({
        label: e.label,
        amountFormatted:
          e.amount != null ? formatPlnMajorUnits(e.amount) : '—',
      })),
      totalFormatted: formatPlnMajorUnits(
        input.paymentSchedule.totalContractAmount,
      ),
    }
  }

  return { rows, paymentScheduleManual }
}
