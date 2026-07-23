/**
 * Documents API — Phase 0 foundation.
 * CRUD for templates, components, drafts, export records, storage paths.
 * Does NOT generate DOCX/PDF or render previews.
 */

export type * from './interfaces'

export { documentStorage } from './storage'
export { documentTemplateService } from './templateService'
export { documentComponentService } from './componentService'
export { documentClauseService } from './clauseService'
export { documentVariableRegistryService } from './variableRegistryService'
export { documentDraftService } from './draftService'
export { documentExportService } from './exportService'
export { companyDetailsService } from '@/lib/api/companyDetailsService'
export { VariableResolver } from '@/lib/variables'
