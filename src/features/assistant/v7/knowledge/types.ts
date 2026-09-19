/**
 * K2 Product Knowledge — Capability type (EXPLAIN-only at runtime).
 * No intent names, keywords, trigger phrases, or NL routing metadata.
 */

export type CapabilityContextKey =
  | 'weddingId'
  | 'sessionId'
  | 'contractId'
  | 'templateId'

export type CapabilityDeepLinkQuality =
  | 'direct'
  | 'route_only'
  | 'context_required'
  | 'none'

export type Capability = {
  id: string
  domain: string
  title: string
  summary: string

  help: {
    steps?: string[]
    prerequisites?: string[]
    notes?: string[]
  }

  navigation?: {
    routePattern: string
    contextKeys?: CapabilityContextKey[]
    deepLinkQuality: CapabilityDeepLinkQuality
  }

  permissions: {
    canExplain: boolean
    canNavigate: boolean
    canExecute: boolean
    requiresConfirmation: boolean
  }

  knowledge: {
    mode: 'static' | 'contextual'
    contextRequirements?: string[]
  }

  provenance: {
    ownerFeature: string
    verifiedAgainst: string[]
    lastVerified: string
  }
}

/** Sealed projection returned by search_product_knowledge (no permissions/provenance internals). */
export type SealedCapabilityKnowledge = {
  id: string
  domain: string
  title: string
  summary: string
  help: {
    steps?: string[]
    prerequisites?: string[]
    notes?: string[]
  }
  navigation?: {
    routePattern: string
    deepLinkQuality: CapabilityDeepLinkQuality
    contextKeys?: CapabilityContextKey[]
  }
  knowledgeMode: 'static' | 'contextual'
}
