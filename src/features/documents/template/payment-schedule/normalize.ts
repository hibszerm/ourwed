/**
 * Normalize Polish payment labels into roles.
 */

import { formatContractPln } from '@/lib/utils/currency'
import type { PaymentNormalizedRole } from './types'

function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizePaymentLabelRole(label: string): PaymentNormalizedRole {
  const t = fold(label)
  if (/zadatek|zaliczka|deposit/.test(t)) return 'deposit'
  if (/pozostal|reszta|remaining/.test(t)) return 'remaining'
  if (/platnosc koncowa|final payment|ostatnia rata|rata koncowa/.test(t)) {
    return 'final'
  }
  if (/\b(i|ii|iii|iv|1|2|3|4)\s*\.?\s*rata\b/.test(t) || /\brata\b/.test(t)) {
    return 'installment'
  }
  return 'other'
}

export function parsePlnMajorUnits(text: string | null | undefined): number | null {
  if (!text) return null
  const digits = text.replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) ? n : null
}

export function formatPlnMajorUnits(amount: number): string {
  return formatContractPln(amount)
}

/** Detect installment ordinal from label (1-based). */
export function installmentOrdinal(label: string): number | null {
  const t = fold(label)
  if (/\bi\s*\.?\s*rata\b/.test(t) || /\b1\s*\.?\s*rata\b/.test(t) || /pierwsz/.test(t))
    return 1
  if (/\bii\s*\.?\s*rata\b/.test(t) || /\b2\s*\.?\s*rata\b/.test(t) || /drug/.test(t))
    return 2
  if (/\biii\s*\.?\s*rata\b/.test(t) || /\b3\s*\.?\s*rata\b/.test(t) || /trzec/.test(t))
    return 3
  if (/\biv\s*\.?\s*rata\b/.test(t) || /\b4\s*\.?\s*rata\b/.test(t)) return 4
  return null
}
