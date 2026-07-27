/**
 * Public questionnaire first-load view derivation.
 * Keeps loading/error/ready mutually exclusive so a failed fetch can never
 * look like an endless “Ładowanie formularza”.
 */

export type PublicFormLoadStatus =
  | 'waiting_for_auth'
  | 'loading'
  | 'ready'
  | 'not_found'
  | 'expired'
  | 'error'

export type PublicFormViewKind =
  | 'loading'
  | 'ready'
  | 'not_found'
  | 'expired'
  | 'error'

export function derivePublicFormView(input: {
  authReady: boolean
  loadStatus: PublicFormLoadStatus
  hasResolvedTemplate: boolean
}): PublicFormViewKind {
  if (!input.authReady || input.loadStatus === 'waiting_for_auth') {
    return 'loading'
  }
  if (input.loadStatus === 'loading') return 'loading'
  if (input.loadStatus === 'not_found') return 'not_found'
  if (input.loadStatus === 'expired') return 'expired'
  if (input.loadStatus === 'error') return 'error'
  if (input.loadStatus === 'ready' && input.hasResolvedTemplate) return 'ready'
  // Ready payload without a template is still a failure — never spin forever.
  if (input.loadStatus === 'ready') return 'error'
  return 'loading'
}

/** Should the public form fetch run for this render cycle? */
export function shouldFetchPublicForm(input: {
  authReady: boolean
  token: string
}): boolean {
  return input.authReady && input.token.trim().length > 0
}
