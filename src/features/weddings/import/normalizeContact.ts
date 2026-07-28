export function normalizeEmailForCompare(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmailStructure(email: string): boolean {
  const trimmed = email.trim()
  if (!trimmed) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
}

export function normalizePhoneForCompare(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function sanitizeCellDisplay(value: unknown): string {
  const text = String(value ?? '').trim()
  if (/^[=+\-@]/.test(text)) {
    return `'${text}`
  }
  return text
}
