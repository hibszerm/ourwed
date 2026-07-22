import {
  DOCUMENT_VARIABLES,
  isKnownVariableKey,
} from '@/features/documents/registry/variableRegistry'

/**
 * Heuristic suggestion from placeholder / label text → Variable Registry key.
 * Never invents keys outside the registry.
 */
export function suggestRegistryKey(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (isKnownVariableKey(trimmed)) return trimmed

  const normalized = trimmed
    .toLowerCase()
    .replace(/[{}[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const aliases: Record<string, string> = {
    'client name': 'wedding.coupleNames',
    'client_name': 'wedding.coupleNames',
    'nazwa klienta': 'wedding.coupleNames',
    'imiona pary': 'wedding.coupleNames',
    'para mloda': 'wedding.coupleNames',
    'para młoda': 'wedding.coupleNames',
    'wedding date': 'wedding.date',
    'data slubu': 'wedding.date',
    'data ślubu': 'wedding.date',
    'ceremony location': 'location.ceremony',
    'miejsce ceremonii': 'location.ceremony',
    'ceremonia': 'location.ceremony',
    'reception location': 'location.reception',
    'przyjecie': 'location.reception',
    'przyjęcie': 'location.reception',
    'package name': 'package.name',
    'nazwa pakietu': 'package.name',
    'pakiet': 'package.name',
    price: 'package.price',
    'wartosc umowy': 'package.price',
    'wartość umowy': 'package.price',
    deposit: 'package.deposit',
    zadatek: 'package.deposit',
    remaining: 'package.remaining',
    'pozostala kwota': 'package.remaining',
    'pozostała kwota': 'package.remaining',
  }

  if (aliases[normalized]) return aliases[normalized]

  const byLabel = DOCUMENT_VARIABLES.find(
    (v) => v.labelPl.toLowerCase() === normalized,
  )
  return byLabel?.key ?? null
}
