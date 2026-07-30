/**
 * Development-only markers + fixtures for the complete Wedding Brief reference wedding.
 * Idempotent seed lives in ensureCompleteWeddingBriefReference.ts.
 */

export const COMPLETE_BRIEF_REFERENCE_KEY = 'complete_wedding_brief_demo'
export const COMPLETE_BRIEF_NOTE_MARKER = `reference_data_key=${COMPLETE_BRIEF_REFERENCE_KEY}`

export const COMPLETE_BRIEF_WEDDING_DATE = '2026-09-12'
export const COMPLETE_BRIEF_BRIDE_NAME = 'Aleksandra Nowak'
export const COMPLETE_BRIEF_GROOM_NAME = 'Michał Kowalski'

/** Fictional contact values — never real client data. */
export const COMPLETE_BRIEF_FICTIONAL = {
  bridePhone: '500 100 200',
  groomPhone: '500 300 400',
  brideEmail: 'aleksandra@example.test',
  groomEmail: 'michal@example.test',
  plannerPhone: '500 500 600',
  venuePhone: '500 700 800',
  djPhone: '500 900 100',
} as const

export const COMPLETE_BRIEF_CONTRACT_VALUE = 8500
export const COMPLETE_BRIEF_DEPOSIT = 1500
export const COMPLETE_BRIEF_INSTALLMENT = 2000
export const COMPLETE_BRIEF_FINAL_DUE = 5000
