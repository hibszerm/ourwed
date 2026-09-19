/**
 * Polish count nouns for wedding collections (Assistant presentation).
 * Delegates to shared polishCountUnit for weddings; short forms for "ślub".
 */

import { polishCountUnit } from '../../tools/aggregateRange'

export function polishWeddingCountNoun(count: number): string {
  return polishCountUnit('weddings', count)
}

export function polishWeddingCountNounShort(count: number): string {
  const n = Math.abs(Math.trunc(count))
  const mod10 = n % 10
  const mod100 = n % 100
  if (n === 1) return 'ślub'
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return 'śluby'
  }
  return 'ślubów'
}
