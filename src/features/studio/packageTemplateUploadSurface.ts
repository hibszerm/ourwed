/**
 * Pure package-template upload surface helpers (no React / CSS).
 */

import type { PackageTemplateUiPhase } from './packageTemplateUiPhase'

export type PackageTemplateCardModel = {
  templateId: string
  templateVersionId: string | null
  fileName: string
  versionLabel: string
  uploadedAtLabel: string | null
  paymentNotice: string | null
}

/** Which surface to show for a given UI phase. */
export function resolvePackageTemplateSurface(input: {
  phase: PackageTemplateUiPhase
  hasPersistedTemplate: boolean
  card: PackageTemplateCardModel | null
}): 'empty' | 'progress' | 'ready' | 'error' {
  switch (input.phase) {
    case 'idle_empty':
      return 'empty'
    case 'uploading':
    case 'saving':
    case 'success_transition':
      return 'progress'
    case 'error':
      return 'error'
    case 'ready':
      return input.card || input.hasPersistedTemplate ? 'ready' : 'empty'
    default:
      return 'empty'
  }
}

/** Empty dropzone only when truly idle with nothing in flight. */
export function shouldShowEmptyDropzone(phase: PackageTemplateUiPhase): boolean {
  return phase === 'idle_empty'
}
