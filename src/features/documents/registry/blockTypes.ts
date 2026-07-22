/**
 * Block type catalog for the documents engine.
 */

import type { DocumentBlockType } from '@/types/documents'

export const DOCUMENT_BLOCK_TYPES: {
  type: DocumentBlockType
  labelPl: string
  description: string
}[] = [
  { type: 'heading', labelPl: 'Nagłówek', description: 'Titles / chapter titles' },
  {
    type: 'paragraph',
    labelPl: 'Akapit',
    description: 'Prose with inline variable slots',
  },
  { type: 'table', labelPl: 'Tabela', description: 'Structured rows' },
  {
    type: 'package_items',
    labelPl: 'Elementy pakietu',
    description: 'From draft.package_snapshot',
  },
  {
    type: 'optional_clause',
    labelPl: 'Klauzula',
    description: 'Clause body; gated by condition',
  },
  {
    type: 'payment_summary',
    labelPl: 'Płatności',
    description: 'Money from draft',
  },
  {
    type: 'signature',
    labelPl: 'Podpis',
    description: 'First-class; e-sign plugs in later',
  },
  {
    type: 'page_break',
    labelPl: 'Podział strony',
    description: 'Export-only page break',
  },
]

export function getBlockTypeMeta(type: DocumentBlockType) {
  return DOCUMENT_BLOCK_TYPES.find((b) => b.type === type)
}
