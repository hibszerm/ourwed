/**
 * On-demand contract generation guard — wedding/company business data only.
 * Template-analysis readiness stays in GenerateContractModal / template tools.
 */

import type { CompanyDetails } from '@/types/company'
import type { Wedding } from '@/types/wedding'
import {
  evaluateWeddingContractReadiness,
  type CompletenessItem,
} from '@/lib/utils/weddingContractReadiness'

export type MissingContractDataGroupId =
  | 'client'
  | 'company'
  | 'package'
  | 'payments'

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
  | 'multi'

export interface ContractGenerationValidation {
  isReady: boolean
  missingGroups: MissingContractDataGroup[]
  /** Dominant footer primary when blockers exist. */
  primaryCorrection: {
    kind: MissingDataCorrectionKind
    label: string
  } | null
}

const GROUP_LABEL: Record<MissingContractDataGroupId, string> = {
  client: 'Dane klienta',
  company: 'Dane firmy',
  package: 'Pakiet',
  payments: 'Płatności',
}

const GROUP_ACTION: Record<
  MissingContractDataGroupId,
  { label: string; kind: MissingDataCorrectionKind }
> = {
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
  multi: 'Uzupełnij dane',
}

function groupOrder(id: MissingContractDataGroupId): number {
  return (['company', 'client', 'package', 'payments'] as const).indexOf(id)
}

/**
 * Validate wedding + company data required before opening contract generation.
 * Always recompute — never cache a previous result across attempts.
 */
export function validateContractGeneration(
  wedding: Wedding,
  company: CompanyDetails | null | undefined,
): ContractGenerationValidation {
  const readiness = evaluateWeddingContractReadiness(wedding, company)
  const missing = readiness.items.filter((i) => i.status === 'missing')

  if (missing.length === 0) {
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

  const primaryKind: MissingDataCorrectionKind =
    missingGroups.length === 1
      ? missingGroups[0]!.contextualAction.kind
      : 'multi'

  return {
    isReady: false,
    missingGroups,
    primaryCorrection: {
      kind: primaryKind,
      label: PRIMARY_LABEL[primaryKind],
    },
  }
}

export { GROUP_LABEL as MISSING_CONTRACT_DATA_GROUP_LABELS }
