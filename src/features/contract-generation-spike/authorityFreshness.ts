import type { ContractGenerationInput } from './contractGenerationInput.ts'

export type AuthorityFreshnessProjection = Omit<ContractGenerationInput, 'selectedEntityBindings' | 'generationContext'> & {
  generationContext: Omit<ContractGenerationInput['generationContext'], 'generationDate'>
}

/** Remove run-local selection state while retaining all immutable authority for freshness checks. */
export function projectAuthorityForFreshness(authority: ContractGenerationInput): AuthorityFreshnessProjection {
  const immutableAuthority = Object.fromEntries(Object.entries(authority).filter(([key]) => key !== 'selectedEntityBindings')) as Omit<ContractGenerationInput, 'selectedEntityBindings' | 'generationContext'>
  const stableGenerationContext = Object.fromEntries(Object.entries(authority.generationContext).filter(([key]) => key !== 'generationDate')) as AuthorityFreshnessProjection['generationContext']
  return { ...immutableAuthority, generationContext: stableGenerationContext }
}

export function authorityFingerprintPayload(authority: ContractGenerationInput, currentContext: unknown) {
  return { authority: projectAuthorityForFreshness(authority), currentContext }
}
