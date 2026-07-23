/**
 * Documents feature — foundation + Template Management (Phase 1)
 * + Mapping Wizard entry (Phase 2, feature-isolated under mapping/).
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
  useDocumentTemplates,
  useDocumentTemplate,
  useDocumentTemplateVersions,
  useDocumentTemplateMutations,
  documentTemplateKeys,
} from './hooks/useDocumentTemplates'
