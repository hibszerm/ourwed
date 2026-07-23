/**
 * Documents feature — Contract Templates (reproduction system).
 * Official workflow: docs/contract-workflow.md
 *
 * Mapping Wizard under ./mapping is deprecated and must not be routed.
 */

export {
  DOCUMENT_VARIABLES,
  DOCUMENT_VARIABLE_SECTIONS,
  getVariableDef,
  variablesForSection,
  isKnownVariableKey,
  registryDisplayLabel,
} from './registry/variableRegistry'

export { SystemVariableRegistry } from '@/lib/variables/registry'

export {
  DOCUMENT_COMPONENT_KINDS,
  getComponentKindMeta,
} from './registry/componentKinds'

export { DOCUMENT_BLOCK_TYPES, getBlockTypeMeta } from './registry/blockTypes'

export {
  TEMPLATE_CATEGORIES,
  TEMPLATE_STATUSES,
  getCategoryMeta,
  getStatusLabel,
} from './templateMeta'

export {
  buildSlotsFromAnalysis,
  saveTemplateSlots,
  transformContract,
  fillTemplateDocx,
  parseSlotMap,
  buildContractCompletenessReport,
  saveGeneratedContract,
} from './template'

export {
  useDocumentTemplates,
  useDocumentTemplate,
  useDocumentTemplateVersions,
  useDocumentTemplateMutations,
  documentTemplateKeys,
} from './hooks/useDocumentTemplates'
