import type { ContractGenerationInput } from './contractGenerationInput'

/** Describes the normalized data shape without interpreting contract meaning. */
export const PLANNER_AUTHORITY_CONTEXT_DESCRIPTION = `The following authorityContext is the adapter-built OurWed ContractGenerationInput. Each fact keeps its value and source; owner appears only where OurWed establishes a party owner. Parties remain separate entries identified by sourceKey. unownedFacts have no party owner. additionalAnswers are opaque user-authority entries identified by their supplied IDs. Commercial values remain separate facts, including remainingAfterDeposit and remainingToPayNow. Package and extras are snapshots. Locations are separate role-based records. generationDate belongs to generationContext; contractRecordId, when present, is internal record metadata, not a human agreement identifier.`

export type PlannerAuthorityContextPayload = {
  description: typeof PLANNER_AUTHORITY_CONTEXT_DESCRIPTION
  authorityContext: ContractGenerationInput
}

export function createPlannerAuthorityContextPayload(input: ContractGenerationInput): PlannerAuthorityContextPayload {
  return { description: PLANNER_AUTHORITY_CONTEXT_DESCRIPTION, authorityContext: input }
}

/**
 * The authority context is transported as the adapter produced it. This
 * serializer deliberately performs no field interpretation or projection.
 */
export function serializePlannerAuthorityContext(input: ContractGenerationInput): string {
  return JSON.stringify(createPlannerAuthorityContextPayload(input))
}
