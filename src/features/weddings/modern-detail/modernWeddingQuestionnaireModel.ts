/**
 * Presentation helpers for Modern pre-wedding questionnaire.
 * Domain status, apply, and answers stay on existing services.
 */

import {
  isPreWeddingSubmittedStatus,
  type WeddingQuestionnaireStatus,
} from '@/types/preweddingQuestionnaire'
import { formatDate } from '@/lib/utils/dates'

export type ModernQuestionnaireKind =
  | 'ready_to_share'
  | 'waiting'
  | 'submitted_clean'
  | 'submitted_pending'

export type ModernQuestionnaireChapter = {
  kind: ModernQuestionnaireKind
  headline: string
  dateLine: string | null
  progressLine: string | null
  supportLine: string | null
  attention: boolean
  showPrimaryShare: boolean
}

export const EMPTY_QUESTIONNAIRE_HEADLINE =
  'Wyślij Parze ankietę przedślubną.'

export const EMPTY_QUESTIONNAIRE_COPY =
  'Zbierz informacje potrzebne do przygotowania dnia ślubu — miejsca, godziny i najważniejsze ustalenia.'

export function pendingApplyCopy(count: number): string {
  if (count <= 0) return ''
  if (count === 1) return '1 zmiana wymaga sprawdzenia'
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} zmiany wymagają sprawdzenia`
  }
  return `${count} zmian wymaga sprawdzenia`
}

export function progressCopy(answered: number, total: number): string | null {
  if (total <= 0) return null
  return `${answered} z ${total} wymaganych odpowiedzi`
}

export function composeModernQuestionnaireChapter(input: {
  status: WeddingQuestionnaireStatus
  submittedAt?: string | null
  sentAt?: string | null
  firstOpenedAt?: string | null
  lastSavedAt?: string | null
  answeredRequired: number
  totalRequired: number
  pendingApplyCount: number
}): ModernQuestionnaireChapter {
  const submitted = isPreWeddingSubmittedStatus(input.status)
  const progressLine = progressCopy(input.answeredRequired, input.totalRequired)

  if (submitted) {
    const dateLine = input.submittedAt ? formatDate(input.submittedAt) : null
    if (input.pendingApplyCount > 0) {
      return {
        kind: 'submitted_pending',
        headline: 'Wypełniona',
        dateLine,
        progressLine: null,
        supportLine: pendingApplyCopy(input.pendingApplyCount),
        attention: true,
        showPrimaryShare: false,
      }
    }
    return {
      kind: 'submitted_clean',
      headline: 'Wypełniona',
      dateLine,
      progressLine: null,
      supportLine: 'Dane z ankiety są aktualne.',
      attention: false,
      showPrimaryShare: false,
    }
  }

  if (input.status === 'draft' || input.status === 'ready') {
    return {
      kind: 'ready_to_share',
      headline: 'Ankieta gotowa do wysłania',
      dateLine: null,
      progressLine: null,
      supportLine: null,
      attention: false,
      showPrimaryShare: true,
    }
  }

  if (input.status === 'in_progress') {
    return {
      kind: 'waiting',
      headline: 'Para uzupełnia ankietę',
      dateLine: input.lastSavedAt
        ? `Ostatni zapis: ${formatDate(input.lastSavedAt)}`
        : input.sentAt
          ? formatDate(input.sentAt)
          : null,
      progressLine,
      supportLine: null,
      attention: false,
      showPrimaryShare: false,
    }
  }

  if (input.status === 'opened') {
    return {
      kind: 'waiting',
      headline: 'Para otworzyła ankietę',
      dateLine: input.firstOpenedAt
        ? formatDate(input.firstOpenedAt)
        : input.sentAt
          ? formatDate(input.sentAt)
          : null,
      progressLine,
      supportLine: 'Czekamy na odpowiedzi Pary.',
      attention: false,
      showPrimaryShare: false,
    }
  }

  return {
    kind: 'waiting',
    headline: 'Udostępniona',
    dateLine: input.sentAt ? formatDate(input.sentAt) : null,
    progressLine,
    supportLine: 'Czekamy na odpowiedzi Pary.',
    attention: false,
    showPrimaryShare: false,
  }
}

export function displayPublicQuestionnaireUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const token = parsed.pathname.split('/').filter(Boolean).pop() ?? ''
    if (token.length <= 12) {
      return `${parsed.host}/ankieta/${token}`
    }
    return `${parsed.host}/ankieta/${token.slice(0, 6)}…${token.slice(-4)}`
  } catch {
    return url.length > 42 ? `${url.slice(0, 38)}…` : url
  }
}
