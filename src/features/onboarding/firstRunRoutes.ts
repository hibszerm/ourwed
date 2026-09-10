/**
 * Stable Phase 1 CTA targets — existing product routes only.
 */

export const FIRST_RUN_ROUTES = {
  import: '/sluby/import',
  /** Existing booking / quick manual path — pre-checks “complete later”. */
  createExisting: '/sluby/nowy?quick=1',
  /** New booking when photographer already has couple data. */
  createManual: '/sluby/nowy',
  /**
   * Lead contract questionnaire without an existing wedding.
   * `generate=1` opens Wygeneruj link on the editor page.
   */
  collectByQuestionnaire: '/ankiety/dane-do-umowy?generate=1',
  weddingsList: '/sluby',
} as const

export const FIRST_RUN_SESSION_SKIP_KEY =
  'ourwed:first-run-prefer-operational-dashboard'
