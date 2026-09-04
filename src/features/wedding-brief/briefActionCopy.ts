export const BRIEF_GENERATE_LABEL = 'Generuj brief PDF'
export const BRIEF_DOWNLOAD_LABEL = 'Pobierz brief PDF'
export const BRIEF_GENERATING_LABEL = 'Generowanie…'
export const BRIEF_DOWNLOADING_LABEL = 'Pobieranie…'

export const COCKPIT_BRIEF_GENERATE_LABEL = 'Generuj Wedding Brief'
export const COCKPIT_BRIEF_DOWNLOAD_LABEL = 'Pobierz Wedding Brief'

export type WeddingBriefBusyOperation = 'generate' | 'download' | null

export type WeddingBriefUiKind =
  | 'NO_BRIEF'
  | 'CURRENT_BRIEF'
  | 'STALE_BRIEF'
  | 'GENERATING'
  | 'DOWNLOADING'

export function briefPrimaryLabel(
  kind: WeddingBriefUiKind,
  variant: 'default' | 'cockpit' = 'default',
): string {
  if (kind === 'GENERATING') return BRIEF_GENERATING_LABEL
  if (kind === 'DOWNLOADING') return BRIEF_DOWNLOADING_LABEL
  if (kind === 'CURRENT_BRIEF') {
    return variant === 'cockpit'
      ? COCKPIT_BRIEF_DOWNLOAD_LABEL
      : BRIEF_DOWNLOAD_LABEL
  }
  return variant === 'cockpit'
    ? COCKPIT_BRIEF_GENERATE_LABEL
    : BRIEF_GENERATE_LABEL
}

export function deriveWeddingBriefUiKind(input: {
  hasBrief: boolean
  storedSourceHash: string | null | undefined
  storedGeneratorVersion: number | string | null | undefined
  currentSourceHash: string | null | undefined
  currentGeneratorVersion: number
  busyOperation?: WeddingBriefBusyOperation
}): WeddingBriefUiKind {
  if (input.busyOperation === 'generate') return 'GENERATING'
  if (input.busyOperation === 'download') return 'DOWNLOADING'
  if (!input.hasBrief) return 'NO_BRIEF'
  if (!input.currentSourceHash) return 'CURRENT_BRIEF'
  if (
    input.storedSourceHash &&
    input.currentSourceHash &&
    input.storedSourceHash === input.currentSourceHash &&
    String(input.storedGeneratorVersion) === String(input.currentGeneratorVersion)
  ) {
    return 'CURRENT_BRIEF'
  }
  return 'STALE_BRIEF'
}
