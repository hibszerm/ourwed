export type AdminRole = 'owner'

export type AdminSessionStatus = {
  isAdmin: boolean
  enabled: boolean
  role: AdminRole | null
}

export type AdminAssurance = {
  currentLevel: 'aal1' | 'aal2' | string
  nextLevel: 'aal1' | 'aal2' | string | null
}

export function isEnabledOwner(status: AdminSessionStatus): boolean {
  return status.isAdmin && status.enabled && status.role === 'owner'
}

export type AdminAccessDecision =
  | { kind: 'loading' }
  | { kind: 'unauthenticated' }
  | { kind: 'unauthorized' }
  | { kind: 'mfa_setup' }
  | { kind: 'mfa_verify' }
  | { kind: 'authorized' }

export function decideAdminAccess(input: {
  loading: boolean
  hasSession: boolean
  status: AdminSessionStatus | null
  assurance: AdminAssurance | null
}): AdminAccessDecision {
  if (input.loading) return { kind: 'loading' }
  if (!input.hasSession) return { kind: 'unauthenticated' }
  if (!input.status || !isEnabledOwner(input.status)) {
    return { kind: 'unauthorized' }
  }

  const current = input.assurance?.currentLevel ?? 'aal1'
  const next = input.assurance?.nextLevel ?? 'aal1'

  if (current === 'aal2') return { kind: 'authorized' }
  if (current === 'aal1' && next === 'aal2') return { kind: 'mfa_verify' }
  return { kind: 'mfa_setup' }
}
