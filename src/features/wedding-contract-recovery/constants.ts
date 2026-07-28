export const WEDDING_CONTRACT_RECOVERY_VERSION = '2'
export const WEDDING_CONTRACT_RECOVERY_PROMPT_VERSION = '2026-07-recovery-v2'
export const WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION = '2026-07-recovery-v2'

/** Legacy response versions still loadable in the UI. */
export const SUPPORTED_RECOVERY_RESPONSE_VERSIONS = [
  '2026-07-recovery-v1',
  '2026-07-recovery-v2',
] as const

export const MAX_SOURCE_CONTRACT_BYTES = 15 * 1024 * 1024

export const SOURCE_CONTRACT_PDF_MIME = 'application/pdf'
export const SOURCE_CONTRACT_DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const RECOVERY_PROGRESS_STAGES = [
  'Przesyłanie dokumentu',
  'Odczytywanie treści',
  'Rozpoznawanie danych',
  'Przygotowywanie podglądu',
] as const

/** Soft UI collapse threshold for long free-text. Storage keeps full value. */
export const LONG_TEXT_UI_COLLAPSE_CHARS = 280
