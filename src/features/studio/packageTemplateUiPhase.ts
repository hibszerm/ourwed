/** Package template upload UI phases — shared by section + progress card. */

export type PackageTemplateUiPhase =
  | 'idle_empty'
  | 'uploading'
  | 'saving'
  | 'success_transition'
  | 'ready'
  | 'error'
