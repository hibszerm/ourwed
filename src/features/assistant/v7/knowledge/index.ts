export type {
  Capability,
  CapabilityContextKey,
  CapabilityDeepLinkQuality,
  SealedCapabilityKnowledge,
} from './types'
export {
  listCapabilities,
  getCapability,
  sealCapability,
  P0_CAPABILITY_IDS,
  assertK2ExplainOnly,
} from './registry'
export {
  searchProductKnowledge,
  type ProductKnowledgeSearchInput,
  type ProductKnowledgeSearchResult,
} from './search'
