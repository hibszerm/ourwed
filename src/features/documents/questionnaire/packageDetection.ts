/**
 * Detect intended package kind and package mentions from AI / document text.
 */

import type { AiDocumentAnalysisResult } from '@/features/documents/ai'
import type { SuggestedPackageKind } from './types'

const PACKAGE_MENTION_RE =
  /pakiet|package|ofert[ay]|wybran[aey]\s+(pakiet|opcj)|selected\s+(package|option)|photo\s*package|video\s*package|combined\s*package|pakiet\s*(foto|video|wideo|photo)|opcja\s*wybran|wybrana\s*opcja|foto\s*\+\s*video|photo\s*\+\s*video/i

export function looksLikePackageMention(text: string): boolean {
  return PACKAGE_MENTION_RE.test(text)
}

export function detectSuggestedPackage(input: {
  ai?: AiDocumentAnalysisResult | null
  sourceText?: string | null
  templateName?: string | null
}): {
  kind: SuggestedPackageKind
  label: string | null
  mentioned: boolean
} {
  const haystack = [
    input.ai?.documentType,
    input.templateName,
    input.sourceText?.slice(0, 8000),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const mentioned = looksLikePackageMention(haystack)

  const hasPhoto =
    /foto|photo|fotograf|sesja ślubna|pakiet foto/.test(haystack)
  const hasVideo =
    /wideo|video|film|wideofilm|kamerzyst|pakiet video|pakiet wideo/.test(
      haystack,
    )

  if (hasPhoto && hasVideo) {
    return { kind: 'photo_video', label: 'Foto + Video', mentioned: true }
  }
  if (hasVideo) {
    return { kind: 'video', label: 'Video', mentioned: mentioned || true }
  }
  if (hasPhoto) {
    return { kind: 'photo', label: 'Foto', mentioned: mentioned || true }
  }

  if (mentioned) {
    return { kind: 'unknown', label: 'Pakiet', mentioned: true }
  }

  return { kind: 'unknown', label: null, mentioned: false }
}

export function defaultQuestionnaireName(
  packageLabel: string | null,
): string {
  if (packageLabel && packageLabel !== 'Pakiet') {
    return `Ankieta AI do umowy – Pakiet ${packageLabel}`
  }
  return 'Ankieta AI do umowy'
}
