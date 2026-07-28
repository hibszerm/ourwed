import type { ColumnMapping, ImportField } from './types'
import { normalizeHeaderKey } from './normalizeHeader'

export const HEADER_ALIASES: Record<Exclude<ImportField, 'ignore'>, string[]> = {
  weddingDate: [
    'data',
    'data slubu',
    'termin',
    'termin slubu',
    'dzien slubu',
    'wedding date',
    'event date',
  ],
  coupleDisplayName: [
    'para',
    'mlodzi',
    'para mloda',
    'klient',
    'klienci',
    'imie i nazwisko',
    'nazwisko',
    'zleceniodawca',
    'wedding',
    'couple',
    'młodzi',
  ],
  partner1Name: ['osoba 1', 'partner 1', 'panna mloda', 'bride'],
  partner2Name: ['osoba 2', 'partner 2', 'pan mlody', 'groom'],
  contractValue: [
    'cena',
    'kwota',
    'wartosc',
    'wartosc umowy',
    'cena calkowita',
    'suma',
    'razem',
    'kontrakt',
    'price',
    'amount',
    'cena brutto',
  ],
  phone: ['telefon', 'nr telefonu', 'numer telefonu', 'tel', 'phone'],
  email: ['email', 'e-mail', 'mail'],
  packageName: ['pakiet', 'oferta', 'wariant', 'package'],
  note: ['uwagi', 'notatki', 'opis', 'komentarz', 'informacje', 'note', 'notes'],
}

const FIELD_BY_ALIAS = new Map<string, ImportField>()
for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<
  [Exclude<ImportField, 'ignore'>, string[]]
>) {
  for (const alias of aliases) {
    FIELD_BY_ALIAS.set(normalizeHeaderKey(alias), field)
  }
}

export function suggestColumnMappings(input: {
  headers: string[]
  columnIds: string[]
}): ColumnMapping[] {
  const used = new Set<ImportField>()

  return input.columnIds.map((sourceColumnId, index) => {
    const sourceHeader = input.headers[index] ?? `Kolumna ${index + 1}`
    const normalized = normalizeHeaderKey(sourceHeader)
    const suggested = FIELD_BY_ALIAS.get(normalized)

    if (suggested && !used.has(suggested)) {
      used.add(suggested)
      return {
        sourceColumnId,
        sourceHeader,
        targetField: suggested,
        confidence: 0.9,
        suggestedBy: 'deterministic' as const,
      }
    }

    return {
      sourceColumnId,
      sourceHeader,
      targetField: 'ignore',
      confidence: 0,
      suggestedBy: 'deterministic' as const,
    }
  })
}

/** Apply saved field targets to freshly detected column positions (by header label). */
export function mergeSavedColumnMappings(input: {
  headers: string[]
  columnIds: string[]
  saved: ColumnMapping[] | null
}): ColumnMapping[] {
  const suggested = suggestColumnMappings(input)
  if (!input.saved?.length) return suggested

  const savedByHeader = new Map<string, ImportField>()
  for (const mapping of input.saved) {
    savedByHeader.set(normalizeHeaderKey(mapping.sourceHeader), mapping.targetField)
  }

  const used = new Set<ImportField>()
  return suggested.map((mapping) => {
    const savedTarget = savedByHeader.get(normalizeHeaderKey(mapping.sourceHeader))
    if (
      savedTarget &&
      savedTarget !== 'ignore' &&
      !used.has(savedTarget)
    ) {
      used.add(savedTarget)
      return {
        ...mapping,
        targetField: savedTarget,
        suggestedBy: 'saved_mapping' as const,
      }
    }
    return mapping
  })
}

export function validateColumnMappings(mappings: ColumnMapping[]): string | null {
  const targets = mappings
    .map((m) => m.targetField)
    .filter((f) => f !== 'ignore')

  const hasDate = targets.includes('weddingDate')
  const hasCouple =
    targets.includes('coupleDisplayName') ||
    (targets.includes('partner1Name') && targets.includes('partner2Name'))

  if (!hasDate || !hasCouple) {
    return 'Dopasuj kolumnę z datą ślubu i nazwą pary lub klienta.'
  }

  const singles = new Set<ImportField>()
  for (const field of targets) {
    if (singles.has(field)) {
      return 'Każde pole może być przypisane tylko do jednej kolumny.'
    }
    singles.add(field)
  }

  return null
}

export type ColumnMappingSuggestion = ColumnMapping

export async function suggestColumnMappingsAsync(input: {
  headers: string[]
  columnIds: string[]
  sampleRows: Array<Record<string, unknown>>
}): Promise<ColumnMappingSuggestion[]> {
  return suggestColumnMappings(input)
}
