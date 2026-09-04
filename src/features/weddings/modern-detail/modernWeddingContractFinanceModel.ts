/**
 * Modern Umowa i finanse — presentation composers only.
 * Canonical money, travel, package, and payment math stay in shared helpers.
 */

import type { GeneratedWeddingContract } from '@/features/documents/template'
import { composeModernWeddingCommercialHealth } from '@/features/weddings/modern-detail/modernWeddingDetailModel'
import { getPackageSummary } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate, formatShortDate } from '@/lib/utils/dates'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { formatTravelFeeDisplay } from '@/lib/utils/travelFeeCommercial'
import type { WeddingExtraService } from '@/types/package'
import type { ContractStatus, Payment, PaymentType, Wedding } from '@/types/wedding'

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  deposit: 'Zadatek',
  installment: 'Wpłata',
  final: 'Płatność końcowa',
  other: 'Inne',
}

export type ModernContractKind =
  | 'loading'
  | 'archived'
  | 'no_template'
  | 'ready'
  | 'generated'
  | 'signed'

export type ModernContractHeadline = {
  kind: ModernContractKind
  title: string
  support: string | null
}

export function sortGeneratedContractsNewestFirst(
  contracts: GeneratedWeddingContract[],
): GeneratedWeddingContract[] {
  return [...contracts].sort((a, b) => {
    const versionDiff =
      (b.generationVersion ?? 0) - (a.generationVersion ?? 0)
    if (versionDiff !== 0) return versionDiff
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

export function formatContractGeneratedAt(value: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function formatSignedAt(value: string | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  try {
    return formatDate(raw)
  } catch {
    return null
  }
}

export function composeModernContractHeadline(input: {
  weddingStatus: Wedding['status']
  contractStatus: ContractStatus
  signedAt?: string
  hasTemplate: boolean | null
  hasGenerated: boolean
}): ModernContractHeadline {
  if (input.weddingStatus === 'archived') {
    return {
      kind: 'archived',
      title: 'Zarchiwizowana',
      support: 'Ten ślub ma zarchiwizowany status umowy.',
    }
  }

  if (input.hasGenerated) {
    if (input.contractStatus === 'signed') {
      return {
        kind: 'signed',
        title: 'Podpisana',
        support: formatSignedAt(input.signedAt),
      }
    }
    if (input.contractStatus === 'sent') {
      return {
        kind: 'generated',
        title: 'Wysłana',
        support: null,
      }
    }
    return {
      kind: 'generated',
      title: 'Wygenerowana',
      support: null,
    }
  }

  if (input.hasTemplate == null) {
    return { kind: 'loading', title: 'Umowa', support: null }
  }

  if (!input.hasTemplate) {
    return {
      kind: 'no_template',
      title: 'Brak szablonu umowy',
      support:
        'Dodaj szablon umowy w pakiecie, aby móc wygenerować dokument dla tego ślubu.',
    }
  }

  return {
    kind: 'ready',
    title: 'Gotowa do wygenerowania',
    support:
      'Wygeneruj umowę na podstawie szablonu pakietu i danych tego ślubu.',
  }
}

export function composeContractDocumentMeta(
  contract: GeneratedWeddingContract,
): {
  title: string
  versionLabel: string
  formatsLabel: string
  generatedAtLabel: string
} {
  const formats = [
    ...new Set(contract.artifacts.map((item) => item.format.toUpperCase())),
  ]
  return {
    title: contract.draft.title,
    versionLabel: `v${contract.generationVersion ?? 1}`,
    formatsLabel: formats.join(', ') || 'DOCX',
    generatedAtLabel: formatContractGeneratedAt(contract.updatedAt),
  }
}

export type ModernSettlementView = {
  paymentKind: 'none' | 'partial' | 'paid'
  paymentTone: 'quiet' | 'overdue' | 'paid' | 'none'
  dueTone: 'quiet' | 'overdue'
  headline: 'Pozostało' | 'Rozliczone'
  headlineAmount: string
  contractValueLabel: string
  paidLabel: string
  remainingLabel: string | null
  dueLabel: string
  dueTermsLabel: string | null
  dueDateOnly: string | null
  overdueDateLabel: string | null
  travelLabel: string
  travelUnresolved: boolean
}

export function composeModernSettlementView(
  wedding: Wedding,
  todayKey?: string,
): ModernSettlementView {
  const commercial = getWeddingCommercialSummary(wedding)
  const health = composeModernWeddingCommercialHealth(wedding, todayKey)
  const pkg = getPackageSummary(wedding)
  const travelUnresolved =
    (wedding.travelFeeStatus ?? 'unresolved') === 'unresolved'
  const dueTermsLabel =
    pkg.finalPaymentTermsLabel !== '—' ? pkg.finalPaymentTermsLabel : null

  if (health.paymentKind === 'paid') {
    return {
      paymentKind: 'paid',
      paymentTone: 'paid',
      dueTone: 'quiet',
      headline: 'Rozliczone',
      headlineAmount: health.contractValueLabel,
      contractValueLabel: health.contractValueLabel,
      paidLabel: health.paidLabel,
      remainingLabel: null,
      dueLabel: pkg.finalPaymentDueLabel,
      dueTermsLabel,
      dueDateOnly: health.dueLabel,
      overdueDateLabel: null,
      travelLabel: formatTravelFeeDisplay(wedding, formatCurrency),
      travelUnresolved,
    }
  }

  return {
    paymentKind: health.paymentKind,
    paymentTone: health.paymentTone,
    dueTone: health.dueTone,
    headline: 'Pozostało',
    headlineAmount: formatCurrency(commercial.remainingToPay),
    contractValueLabel: health.contractValueLabel,
    paidLabel: health.paidLabel,
    remainingLabel: health.remainingLabel,
    dueLabel: pkg.finalPaymentDueLabel,
    dueTermsLabel,
    dueDateOnly: health.dueLabel,
    overdueDateLabel:
      health.dueTone === 'overdue' && health.dueLabel ? health.dueLabel : null,
    travelLabel: formatTravelFeeDisplay(wedding, formatCurrency),
    travelUnresolved,
  }
}

export type ModernAgreementTerms = {
  name: string
  coverage: string | null
  agreedDepositLabel: string
  overtime: string | null
  delivery: string | null
  extrasLabel: string | null
  items: ReturnType<typeof getPackageSummary>['items']
}

export function formatExtrasLabel(
  extras: WeddingExtraService[],
): string | null {
  if (extras.length === 0) return null
  return extras
    .map((extra) => {
      const name = extra.name?.trim() || 'Usługa'
      return extra.quantity > 1 ? `${name} ×${extra.quantity}` : name
    })
    .join(', ')
}

export function composeModernAgreementTerms(
  wedding: Wedding,
  extras: WeddingExtraService[],
): ModernAgreementTerms {
  const pkg = getPackageSummary(wedding)
  return {
    name: pkg.name,
    coverage: pkg.coverageLabel !== '—' ? pkg.coverageLabel : null,
    agreedDepositLabel: pkg.agreedDepositLabel,
    overtime: pkg.overtimeLabel !== '—' ? pkg.overtimeLabel : null,
    delivery: pkg.deliveryLabel !== '—' ? pkg.deliveryLabel : null,
    extrasLabel: formatExtrasLabel(extras),
    items: pkg.items,
  }
}

export function paymentDisplayLabel(payment: Payment): string {
  const label = payment.label?.trim()
  if (label) return label
  return PAYMENT_TYPE_LABELS[payment.type]
}

export function paymentPaidLine(payment: Payment): string {
  if (!payment.paid) return 'Oczekuje'
  if (payment.paidAt?.trim()) {
    try {
      return `Opłacone · ${formatDate(payment.paidAt)}`
    } catch {
      return 'Opłacone'
    }
  }
  return 'Opłacone'
}

export function questionnaireSummary(wedding: Wedding): {
  completed: boolean
  line: string
} {
  const q = wedding.questionnaires.contractData
  if (q.status === 'completed') {
    const when = q.completedAt ? formatShortDate(q.completedAt) : null
    return {
      completed: true,
      line: when ? `Wypełniona · ${when}` : 'Wypełniona',
    }
  }
  if (q.status === 'sent') {
    return { completed: false, line: 'Oczekuje na odpowiedzi' }
  }
  // Provenance only — not_sent does not mean client-data collection is unfinished.
  return { completed: false, line: 'Nie wysłano' }
}
