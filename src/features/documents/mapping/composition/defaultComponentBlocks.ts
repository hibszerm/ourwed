/**
 * Default block plans per component kind.
 * Saved later as document_blocks with payload.variableKeys — not parallel storage.
 */

import type {
  DocumentBlockPayload,
  DocumentBlockType,
  DocumentComponentKind,
} from '@/types/documents'
import { DOCUMENT_VARIABLES } from '@/features/documents/registry/variableRegistry'

export interface PlannedBlock {
  blockType: DocumentBlockType
  sortOrder: number
  payload: DocumentBlockPayload
}

/** Wizard-facing section catalog (document-oriented copy). */
export const WIZARD_COMPONENT_CATALOG: {
  kind: DocumentComponentKind
  title: string
  description: string
}[] = [
  {
    kind: 'header',
    title: 'Nagłówek umowy',
    description: 'Nazwa firmy, tytuł i numer dokumentu.',
  },
  {
    kind: 'parties',
    title: 'Dane stron',
    description: 'Studio oraz dane panny i pana młodego.',
  },
  {
    kind: 'wedding_information',
    title: 'Szczegóły ślubu',
    description: 'Data, godzina i lokalizacje ceremonii.',
  },
  {
    kind: 'package_items',
    title: 'Zakres pakietu',
    description: 'Elementy pakietu i usługi dodatkowe.',
  },
  {
    kind: 'payment_summary',
    title: 'Płatności',
    description: 'Wartość umowy, zadatek i pozostała kwota.',
  },
  {
    kind: 'copyright',
    title: 'Prawa autorskie',
    description: 'Zasady wykorzystania materiałów.',
  },
  {
    kind: 'gdpr',
    title: 'RODO',
    description: 'Zgody na przetwarzanie danych.',
  },
  {
    kind: 'optional_clauses',
    title: 'Klauzule opcjonalne',
    description: 'Warunki włączane zależnie od usług.',
  },
  {
    kind: 'signature_block',
    title: 'Podpisy',
    description: 'Miejsca podpisów stron umowy.',
  },
]

export const DEFAULT_COMPONENT_ORDER: DocumentComponentKind[] =
  WIZARD_COMPONENT_CATALOG.map((c) => c.kind)

function keysForSections(
  sections: string[],
  mappedKeys: string[],
): string[] {
  const sectionSet = new Set(sections)
  const fromMapped = mappedKeys.filter((key) => {
    const def = DOCUMENT_VARIABLES.find((v) => v.key === key)
    return def && sectionSet.has(def.section)
  })
  if (fromMapped.length > 0) return fromMapped
  return DOCUMENT_VARIABLES.filter((v) => sectionSet.has(v.section)).map(
    (v) => v.key,
  )
}

function paragraph(
  sortOrder: number,
  text: string,
  variableKeys: string[],
): PlannedBlock {
  return {
    blockType: 'paragraph',
    sortOrder,
    payload: { text, variableKeys },
  }
}

/**
 * Build default blocks for a component kind, preferring currently mapped keys.
 */
export function buildDefaultBlocksForKind(
  kind: DocumentComponentKind,
  mappedKeys: string[],
): PlannedBlock[] {
  switch (kind) {
    case 'header':
      return [
        {
          blockType: 'heading',
          sortOrder: 0,
          payload: {
            text: 'Umowa',
            variableKeys: keysForSections(['studio', 'additional'], mappedKeys),
          },
        },
      ]
    case 'parties':
      return [
        paragraph(
          0,
          'Dane stron umowy',
          keysForSections(['studio', 'bride', 'groom', 'wedding'], mappedKeys),
        ),
      ]
    case 'wedding_information':
      return [
        paragraph(
          0,
          'Informacje o ślubie',
          keysForSections(['wedding', 'locations'], mappedKeys),
        ),
      ]
    case 'package_items':
      return [
        {
          blockType: 'package_items',
          sortOrder: 0,
          payload: {
            text: 'Zakres pakietu',
            variableKeys: keysForSections(['package'], mappedKeys),
          },
        },
      ]
    case 'payment_summary':
      return [
        {
          blockType: 'payment_summary',
          sortOrder: 0,
          payload: {
            text: 'Podsumowanie płatności',
            variableKeys: keysForSections(['package', 'payments'], mappedKeys),
          },
        },
      ]
    case 'copyright':
      return [
        paragraph(0, 'Prawa autorskie do materiałów', [
          ...keysForSections(['studio'], mappedKeys),
        ]),
      ]
    case 'gdpr':
      return [paragraph(0, 'Klauzula RODO', [])]
    case 'optional_clauses':
      return [
        {
          blockType: 'optional_clause',
          sortOrder: 0,
          payload: {
            text: 'Klauzule opcjonalne',
            variableKeys: [],
          },
        },
      ]
    case 'signature_block':
      return [
        {
          blockType: 'signature',
          sortOrder: 0,
          payload: {
            parties: [
              { role: 'studio', label: 'Firma' },
              { role: 'bride', label: 'Panna młoda', nameVariableKey: 'bride.firstName' },
              { role: 'groom', label: 'Pan młody', nameVariableKey: 'groom.firstName' },
            ],
          },
        },
      ]
    case 'custom':
      return [paragraph(0, 'Sekcja własna', mappedKeys)]
    default:
      return []
  }
}

export function rebuildComponentBlocks(
  enabledKinds: DocumentComponentKind[],
  mappedKeys: string[],
): Partial<Record<DocumentComponentKind, PlannedBlock[]>> {
  const plans: Partial<Record<DocumentComponentKind, PlannedBlock[]>> = {}
  for (const kind of enabledKinds) {
    plans[kind] = buildDefaultBlocksForKind(kind, mappedKeys)
  }
  return plans
}

export function mappedKeysFromFields(
  fields: { mappedKey: string | null; status: string }[],
): string[] {
  return fields
    .filter((f) => f.status === 'connected' && f.mappedKey)
    .map((f) => f.mappedKey!)
}
