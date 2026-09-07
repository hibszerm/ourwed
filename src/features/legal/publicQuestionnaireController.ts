/**
 * Minimal public controller identity for questionnaire privacy notices.
 * Resolved server-side from the questionnaire token — never by user UUID.
 */
export type PublicQuestionnaireController = {
  displayName: string
  /** Business contact from studio_details.email only; never login email. */
  contactEmail: string | null
}

export function parsePublicQuestionnaireController(
  raw: unknown,
): PublicQuestionnaireController | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const displayName =
    typeof row.display_name === 'string' ? row.display_name.trim() : ''
  if (!displayName) return null
  const contactEmail =
    typeof row.contact_email === 'string' && row.contact_email.trim()
      ? row.contact_email.trim()
      : null
  return { displayName, contactEmail }
}
