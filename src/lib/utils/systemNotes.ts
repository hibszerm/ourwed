import type { WeddingNote } from '@/types/wedding'

/**
 * Origin of a system-generated wedding note.
 * Extend as new automations are added (AI, payments, contracts, …).
 */
export type SystemNoteSource =
  | 'contract_questionnaire'
  | 'wedding_questionnaire'
  | 'ai_summary'
  | 'payment'
  | 'contract'
  | 'package_change'

export const SYSTEM_NOTE_BADGE: Record<SystemNoteSource, string> = {
  contract_questionnaire: 'Ankieta do umowy',
  wedding_questionnaire: 'Ankieta ślubna',
  ai_summary: 'AI',
  payment: 'Płatność',
  contract: 'Umowa',
  package_change: 'Pakiet',
}

export interface CreateSystemNoteInput {
  /** Raw body from the couple / system (without prefix). */
  body: string
  source: SystemNoteSource
  createdAt?: string
  author?: string
  id?: string
}

/** Contract questionnaire note body format. */
export function formatContractQuestionnaireNoteContent(body: string): string {
  return `Z ankiety do umowy:\n\n${body.trim()}`
}

function formatContentForSource(source: SystemNoteSource, body: string): string {
  const trimmed = body.trim()
  switch (source) {
    case 'contract_questionnaire':
      return formatContractQuestionnaireNoteContent(trimmed)
    default:
      return trimmed
  }
}

/**
 * Creates a system-generated WeddingNote.
 * Returns null when body is empty — call sites stay branch-free.
 */
export function createSystemNote(input: CreateSystemNoteInput): WeddingNote | null {
  const trimmed = input.body.trim()
  if (!trimmed) return null

  const createdAt =
    input.createdAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)

  return {
    id: input.id ?? `n-sys-${Date.now()}`,
    content: formatContentForSource(input.source, trimmed),
    createdAt,
    author: input.author ?? 'Para',
    source: input.source,
    badge: SYSTEM_NOTE_BADGE[input.source],
  }
}

/** Prepend a note (newest-first store order; UI also sorts by date). */
export function prependWeddingNote(
  notes: WeddingNote[],
  note: WeddingNote | null,
): WeddingNote[] {
  if (!note) return notes
  return [note, ...notes]
}
