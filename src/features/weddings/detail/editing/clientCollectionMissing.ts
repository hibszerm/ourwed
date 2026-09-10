/**
 * Client-collection missing groups for Path A manual completion.
 * Reuses evaluateWeddingContractReadiness — does not duplicate field rules.
 */

import {
  evaluateWeddingContractReadiness,
  type CompletenessItem,
} from '@/lib/utils/weddingContractReadiness'
import type { Wedding } from '@/types/wedding'
import type { WeddingEditorSection } from '@/features/weddings/detail/editing/weddingEditorTypes'

export type ClientCollectionMissingGroupId =
  | 'couple'
  | 'wedding_core'
  | 'places'

export type ClientCollectionMissingGroup = {
  id: ClientCollectionMissingGroupId
  label: string
  /** Short calm summary under the group title. */
  summary: string
  items: string[]
  section: Extract<WeddingEditorSection, 'contacts' | 'wedding' | 'locations'>
  ctaLabel: string
}

const COUPLE_IDS = new Set([
  'client_partner',
  'client_address',
  'client_phone',
])
const DATE_IDS = new Set(['client_date'])
const PLACES_IDS = new Set(['client_reception'])

function userFacingLabel(item: CompletenessItem): string {
  switch (item.id) {
    case 'client_partner':
      return 'Imię i nazwisko'
    case 'client_address':
      return 'Adres'
    case 'client_phone':
      return 'Numer telefonu'
    case 'client_date':
      return 'Data ślubu'
    case 'client_reception':
      return 'Miejsce przyjęcia weselnego'
    default:
      return item.label
  }
}

function coupleSummary(items: CompletenessItem[]): string {
  const labels = items.map(userFacingLabel)
  if (labels.length === 1) return `Brakuje: ${labels[0]}.`
  return `Brakuje: ${labels.join(', ')}.`
}

/**
 * Groups required missing *client* readiness items by the editor that can
 * resolve them. Package / travel / payments are intentionally excluded.
 */
export function listClientCollectionMissingGroups(
  wedding: Wedding,
): ClientCollectionMissingGroup[] {
  const missing = evaluateWeddingContractReadiness(wedding, null).items.filter(
    (item) => item.group === 'client' && item.status === 'missing',
  )

  const couple = missing.filter((item) => COUPLE_IDS.has(item.id))
  const date = missing.filter((item) => DATE_IDS.has(item.id))
  const places = missing.filter((item) => PLACES_IDS.has(item.id))

  const groups: ClientCollectionMissingGroup[] = []

  if (couple.length > 0) {
    groups.push({
      id: 'couple',
      label: 'Dane pary',
      summary: coupleSummary(couple),
      items: couple.map(userFacingLabel),
      section: 'contacts',
      ctaLabel: 'Uzupełnij',
    })
  }

  if (date.length > 0) {
    groups.push({
      id: 'wedding_core',
      label: 'Data ślubu',
      summary: 'Nie podano daty ślubu.',
      items: date.map(userFacingLabel),
      section: 'wedding',
      ctaLabel: 'Uzupełnij',
    })
  }

  if (places.length > 0) {
    groups.push({
      id: 'places',
      label: 'Miejsce przyjęcia',
      summary: 'Nie podano miejsca przyjęcia weselnego.',
      items: places.map(userFacingLabel),
      section: 'locations',
      ctaLabel: 'Uzupełnij',
    })
  }

  return groups
}
