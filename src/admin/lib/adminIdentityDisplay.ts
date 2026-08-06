/** Display helpers for admin account identity (no couple/client data). */

export function adminDisplayName(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : 'Nie podano'
}

export function adminOptionalText(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : 'Nie podano'
}
