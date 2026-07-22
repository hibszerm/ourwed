/**
 * Document Component kinds — internal composition layer (no builder UI).
 */

import type { DocumentComponentKind } from '@/types/documents'

export const DOCUMENT_COMPONENT_KINDS: {
  kind: DocumentComponentKind
  labelPl: string
  description: string
}[] = [
  {
    kind: 'header',
    labelPl: 'Nagłówek',
    description: 'Studio identity / document title band',
  },
  {
    kind: 'parties',
    labelPl: 'Strony umowy',
    description: 'Studio + couple party details',
  },
  {
    kind: 'wedding_information',
    labelPl: 'Informacje o ślubie',
    description: 'Date, times, locations',
  },
  {
    kind: 'package_items',
    labelPl: 'Zawartość pakietu',
    description: 'Items from draft.package_snapshot',
  },
  {
    kind: 'payment_summary',
    labelPl: 'Podsumowanie płatności',
    description: 'Price, deposit, paid, remaining',
  },
  {
    kind: 'copyright',
    labelPl: 'Prawa autorskie',
    description: 'IP / usage rights',
  },
  {
    kind: 'gdpr',
    labelPl: 'RODO',
    description: 'Privacy / processing consent',
  },
  {
    kind: 'optional_clauses',
    labelPl: 'Klauzule opcjonalne',
    description: 'Conditioned clause set',
  },
  {
    kind: 'signature_block',
    labelPl: 'Podpisy',
    description: 'First-class signature layout',
  },
  {
    kind: 'custom',
    labelPl: 'Własna sekcja',
    description: 'Studio-defined component',
  },
]

export function getComponentKindMeta(kind: DocumentComponentKind) {
  return DOCUMENT_COMPONENT_KINDS.find((k) => k.kind === kind)
}
