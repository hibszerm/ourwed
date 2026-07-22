import { supabase } from '@/lib/supabase'
import type { DocumentVariableRegistryService } from '@/lib/api/documents/interfaces'
import { mapVariable, type VariableRow } from '@/lib/api/documents/mappers'
import {
  DOCUMENT_VARIABLES,
  getVariableDef,
} from '@/features/documents/registry/variableRegistry'

/**
 * Prefers DB registry when available; falls back to the in-code system catalog.
 */
export const documentVariableRegistryService: DocumentVariableRegistryService = {
  async list() {
    const { data, error } = await supabase
      .from('document_variable_registry')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error || !data?.length) {
      return DOCUMENT_VARIABLES
    }
    return (data as VariableRow[]).map(mapVariable)
  },

  async get(key) {
    const { data, error } = await supabase
      .from('document_variable_registry')
      .select('*')
      .eq('key', key)
      .maybeSingle()
    if (!error && data) return mapVariable(data as VariableRow)
    return getVariableDef(key) ?? null
  },
}
