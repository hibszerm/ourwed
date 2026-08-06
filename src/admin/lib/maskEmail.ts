export function maskEmail(email: string | null | undefined): string {
  if (!email) return '—'
  const [local, domain] = email.split('@')
  if (!domain) return '—'
  const visible = local.slice(0, 2)
  return `${visible}••••@${domain}`
}
