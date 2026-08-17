/**
 * On-demand contract generation guard — wedding/company business data only.
 * Template-analysis readiness stays in GenerateContractModal / template tools.
 */

import type { CompanyDetails } from '@/types/company'
import type { Wedding } from '@/types/wedding'
import { isTravelFeeResolved } from '@/lib/utils/travelFeeCommercial'
import {
  evaluateWeddingContractReadiness,
  type CompletenessItem,
} from '@/lib/utils/weddingContractReadiness'

export type MissingContractDataGroupId =
  | 'client'
  | 'company'
  | 'package'
  | 'payments'
  | 'travel'

export interface MissingContractDataGroup {
  id: MissingContractDataGroupId
  label: string
  /** Missing required field labels only (never completed fields). */
  items: string[]
  contextualAction: {
    label: string
    kind: MissingDataCorrectionKind
  }
}

export type MissingDataCorrectionKind =
  | 'company_settings'
  | 'edit_couple'
  | 'edit_package'
  | 'edit_payments'
  | 'edit_travel_fee'
  | 'multi'

/** Controlled domain code — never show raw to users. */
export type ContractGenerationBlockCode = 'TRAVEL_FEE_UNRESOLVED'

export interface ContractGenerationValidation {
  isReady: boolean
  missingGroups: MissingContractDataGroup[]
  /** Dominant footer primary when blockers exist. */
  primaryCorrection: {
    kind: MissingDataCorrectionKind
    label: string
  } | null
  /** Present when travel fee blocks generation. */
  blockCode?: ContractGenerationBlockCode
  /** Optional dialog title override (e.g. travel-only). */
  title?: string
  /** Optional dialog description override (e.g. travel-only). */
  description?: string
}

const GROUP_LABEL: Record<MissingContractDataGroupId, string> = {
  travel: 'Dojazd',
  client: 'Dane klienta',
  company: 'Dane firmy',
  package: 'Pakiet',
  payments: 'Płatności',
}

const GROUP_ACTION: Record<
  MissingContractDataGroupId,
  { label: string; kind: MissingDataCorrectionKind }
> = {
  travel: { label: 'Ustal koszt dojazdu', kind: 'edit_travel_fee' },
  company: { label: 'Ustawienia firmy', kind: 'company_settings' },
  client: { label: 'Edytuj dane pary', kind: 'edit_couple' },
  package: { label: 'Edytuj pakiet', kind: 'edit_package' },
  payments: { label: 'Dodaj zadatek', kind: 'edit_payments' },
}

const PRIMARY_LABEL: Record<MissingDataCorrectionKind, string> = {
  company_settings: 'Przejdź do danych firmy',
  edit_couple: 'Edytuj dane pary',
  edit_package: 'Uzupełnij pakiet',
  edit_payments: 'Uzupełnij płatności',
  edit_travel_fee: 'Ustal koszt dojazdu',
  multi: 'Uzupełnij dane',
}

const TRAVEL_ONLY_TITLE = 'Najpierw ustal koszt dojazdu.'
const TRAVEL_ONLY_DESCRIPTION =
  'Określ, czy dojazd jest w cenie, czy doliczany osobno.'

function groupOrder(id: MissingContractDataGroupId): number {
  return (
    ['travel', 'company', 'client', 'package', 'payments'] as const
  ).indexOf(id)
}

/**
 * Validate wedding + company data required before opening contract generation.
 * Always recompute — never cache a previous result across attempts.
 * Travel fee must be resolved (included, or charged with valid amount).
 */
export function validateContractGeneration(
  wedding: Wedding,
  company: CompanyDetails | null | undefined,
): ContractGenerationValidation {
  const readiness = evaluateWeddingContractReadiness(wedding, company)
  const missing = readiness.items.filter((i) => i.status === 'missing')
  const travelUnresolved = !isTravelFeeResolved(wedding)

  if (missing.length === 0 && !travelUnresolved) {
    return {
      isReady: true,
      missingGroups: [],
      primaryCorrection: null,
    }
  }

  const byGroup = new Map<MissingContractDataGroupId, CompletenessItem[]>()
  for (const item of missing) {
    const list = byGroup.get(item.group) ?? []
    list.push(item)
    byGroup.set(item.group, list)
  }

  const missingGroups: MissingContractDataGroup[] = [...byGroup.entries()]
    .sort((a, b) => groupOrder(a[0]) - groupOrder(b[0]))
    .map(([id, items]) => ({
      id,
      label: GROUP_LABEL[id],
      items: items.map((i) => i.label),
      contextualAction: GROUP_ACTION[id],
    }))

  if (travelUnresolved) {
    missingGroups.unshift({
      id: 'travel',
      label: GROUP_LABEL.travel,
      items: ['Koszt dojazdu'],
      contextualAction: GROUP_ACTION.travel,
    })
  }

  const onlyTravel = travelUnresolved && missingGroups.length === 1

  const primaryKind: MissingDataCorrectionKind = onlyTravel
    ? 'edit_travel_fee'
    : missingGroups.length === 1
      ? missingGroups[0]!.contextualAction.kind
      : 'multi'

  return {
    isReady: false,
    missingGroups,
    primaryCorrection: {
      kind: primaryKind,
      label: PRIMARY_LABEL[primaryKind],
    },
    blockCode: travelUnresolved ? 'TRAVEL_FEE_UNRESOLVED' : undefined,
    title: onlyTravel ? TRAVEL_ONLY_TITLE : undefined,
    description: onlyTravel ? TRAVEL_ONLY_DESCRIPTION : undefined,
  }
}

export { GROUP_LABEL as MISSING_CONTRACT_DATA_GROUP_LABELS }
