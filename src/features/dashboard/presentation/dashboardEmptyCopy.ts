/**
 * Calm operational empty-state copy.
 * Distinguishes zero-history honesty from established “nothing pending”.
 */

export const DEADLINE_EMPTY_ZERO_HISTORY = {
  title: 'Brak terminów do pilnowania',
  body: 'Gdy pojawią się terminy związane z Twoimi zleceniami, zobaczysz je tutaj.',
} as const

export const DEADLINE_EMPTY_ESTABLISHED = {
  title: 'Wszystko oddane',
  body: 'Brak aktywnych terminów oddania.',
} as const

export function deadlineEmptyCopy(hasWeddingHistory: boolean): {
  title: string
  body: string
} {
  return hasWeddingHistory
    ? DEADLINE_EMPTY_ESTABLISHED
    : DEADLINE_EMPTY_ZERO_HISTORY
}

export const INQUIRIES_EMPTY = {
  title: 'Brak oczekujących zgłoszeń',
  body: 'Gdy para wypełni ankietę do umowy, zgłoszenie pojawi się tutaj do weryfikacji.',
} as const

export const NOTIFICATIONS_EMPTY = {
  title: 'Brak nowych powiadomień',
  body: 'Gdy para wypełni ankietę do umowy lub ankietę przedślubną, informacja pojawi się tutaj.',
} as const
