/**
 * Pure generation progress helpers (no React / CSS) for tests and UI.
 */

export type ChecklistItemState = 'upcoming' | 'current' | 'done'

export type AnimatedChecklistItem = {
  id: string
  label: string
  state: ChecklistItemState
}

/** Show calm helper copy after this many ms on the same active step. */
export const LONG_RUNNING_HINT_MS = 9000

export function stagesToChecklist(
  stages: readonly { id: string; label: string }[],
  index: number,
  pipelineDone: boolean,
): AnimatedChecklistItem[] {
  const last = stages.length - 1
  return stages.map((stage, i) => {
    if (i < index) return { ...stage, state: 'done' as const }
    if (i === index) {
      if (i === last && pipelineDone) {
        return { ...stage, state: 'done' as const }
      }
      return { ...stage, state: 'current' as const }
    }
    return { ...stage, state: 'upcoming' as const }
  })
}
