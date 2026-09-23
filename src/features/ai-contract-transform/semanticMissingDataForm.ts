import type { SemanticGenerationRequirement, SemanticGenerationRequirementValues } from './semanticContractGenerationService'
import { isValidEmailStructure } from '@/features/weddings/import/normalizeContact'

export type SemanticMissingDataErrors = Readonly<Record<string, string>>

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function validateSemanticMissingData(
  requirements: readonly SemanticGenerationRequirement[],
  values: SemanticGenerationRequirementValues,
): SemanticMissingDataErrors {
  const errors: Record<string, string> = {}
  for (const requirement of requirements) {
    const value = values[requirement.id]?.trim() ?? ''
    if (requirement.kind === 'date') {
      if (!isRealIsoDate(value)) errors[requirement.id] = 'Wybierz prawidłową datę.'
    } else if (!isValidEmailStructure(value)) {
      errors[requirement.id] = 'Wpisz poprawny adres e-mail.'
    }
  }
  return errors
}

export function semanticEmailRequirementLabel(
  requirement: Extract<SemanticGenerationRequirement, { kind: 'customer_email' }>,
  customers: readonly { displayName: string }[],
): string {
  const names = requirement.customerIndexes.map((index) => customers[index]?.displayName?.trim()).filter((name): name is string => Boolean(name))
  return names.length ? `E-mail — ${names.join(' i ')}` : 'E-mail klienta'
}
