/**
 * Canonical Wedding business status from contract.status.
 * Not rendered on Dashboard V1 (W4.1) or Detail header (W4.2).
 * Kept for tests / any future contract UI that needs the shorthand.
 */
import type { Wedding } from '@/types/wedding'

export type WeddingBusinessStatusId = 'new' | 'waiting' | 'signed'

export type WeddingBusinessStatus = {
  id: WeddingBusinessStatusId
  /** Polish label: Nowe | Oczekuje | Umowa */
  label: string
  tone: 'ok' | 'warn'
}

/**
 * NOWE — no generated/signed contract
 * OCZEKUJE — generated or sent, not signed
 * UMOWA — signed
 */
export function getWeddingBusinessStatus(
  wedding: Pick<Wedding, 'contract'>,
): WeddingBusinessStatus {
  const status = wedding.contract?.status ?? 'none'
  if (status === 'signed') {
    return { id: 'signed', label: 'Umowa', tone: 'ok' }
  }
  if (status === 'generated' || status === 'sent') {
    return { id: 'waiting', label: 'Oczekuje', tone: 'warn' }
  }
  return { id: 'new', label: 'Nowe', tone: 'warn' }
}
