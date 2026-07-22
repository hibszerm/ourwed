import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import { requireStudioUserId } from '@/lib/api/ownership'
import type {
  ComposeTemplateInput,
  CreateBlockConditionInput,
  CreateBlockInput,
  CreateComponentInput,
  CreateComponentVersionInput,
  DocumentComponentService,
  UpdateComponentInput,
} from '@/lib/api/documents/interfaces'
import {
  mapBlock,
  mapBlockCondition,
  mapComponent,
  mapComponentVersion,
  mapCompositionLink,
  type BlockConditionRow,
  type BlockRow,
  type ComponentRow,
  type ComponentVersionRow,
  type CompositionLinkRow,
} from '@/lib/api/documents/mappers'

export const documentComponentService: DocumentComponentService = {
  async list() {
    const userId = await requireStudioUserId()
    const { data, error } = await supabase
      .from('document_components')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    throwOnError(error)
    return ((data ?? []) as ComponentRow[]).map(mapComponent)
  },

  async get(id) {
    const userId = await requireStudioUserId()
    const { data, error } = await supabase
      .from('document_components')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()
    throwOnError(error)
    return data ? mapComponent(data as ComponentRow) : null
  },

  async create(input: CreateComponentInput) {
    const userId = await requireStudioUserId()
    const { data, error } = await supabase
      .from('document_components')
      .insert({
        user_id: userId,
        kind: input.kind,
        name: input.name.trim(),
        description: input.description ?? null,
        status: 'draft',
      })
      .select('*')
      .single()
    throwOnError(error)
    return mapComponent(data as ComponentRow)
  },

  async update(id, input: UpdateComponentInput) {
    const userId = await requireStudioUserId()
    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description
    if (input.status !== undefined) patch.status = input.status
    if (input.currentVersionId !== undefined) {
      patch.current_version_id = input.currentVersionId
    }
    const { data, error } = await supabase
      .from('document_components')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single()
    throwOnError(error)
    return mapComponent(data as ComponentRow)
  },

  async listVersions(componentId) {
    await requireStudioUserId()
    const { data, error } = await supabase
      .from('document_component_versions')
      .select('*')
      .eq('component_id', componentId)
      .order('version_number', { ascending: false })
    throwOnError(error)
    return ((data ?? []) as ComponentVersionRow[]).map(mapComponentVersion)
  },

  async createVersion(input: CreateComponentVersionInput) {
    const userId = await requireStudioUserId()
    const existing = await this.listVersions(input.componentId)
    const next = (existing[0]?.versionNumber ?? 0) + 1
    const { data, error } = await supabase
      .from('document_component_versions')
      .insert({
        component_id: input.componentId,
        version_number: next,
        match_fingerprint: input.matchFingerprint ?? null,
        definition_checksum: input.definitionChecksum ?? null,
        locale: input.locale ?? 'pl',
        notes: input.notes ?? null,
        created_by: userId,
      })
      .select('*')
      .single()
    throwOnError(error)
    const version = mapComponentVersion(data as ComponentVersionRow)
    await this.update(input.componentId, { currentVersionId: version.id })
    return version
  },

  async getVersion(id) {
    await requireStudioUserId()
    const { data, error } = await supabase
      .from('document_component_versions')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    throwOnError(error)
    return data ? mapComponentVersion(data as ComponentVersionRow) : null
  },

  async listComposition(templateVersionId) {
    await requireStudioUserId()
    const { data, error } = await supabase
      .from('document_template_component_links')
      .select('*')
      .eq('template_version_id', templateVersionId)
      .order('sort_order', { ascending: true })
    throwOnError(error)
    return ((data ?? []) as CompositionLinkRow[]).map(mapCompositionLink)
  },

  async setComposition(templateVersionId, links) {
    await requireStudioUserId()
    const { error: delError } = await supabase
      .from('document_template_component_links')
      .delete()
      .eq('template_version_id', templateVersionId)
    throwOnError(delError)

    if (links.length === 0) return []

    const rows = links.map((link: Omit<ComposeTemplateInput, 'templateVersionId'>) => ({
      template_version_id: templateVersionId,
      component_version_id: link.componentVersionId,
      sort_order: link.sortOrder,
      instance_key: link.instanceKey ?? null,
      overrides: link.overrides ?? {},
    }))

    const { data, error } = await supabase
      .from('document_template_component_links')
      .insert(rows)
      .select('*')
    throwOnError(error)
    return ((data ?? []) as CompositionLinkRow[]).map(mapCompositionLink)
  },

  async listBlocks(componentVersionId) {
    await requireStudioUserId()
    const { data, error } = await supabase
      .from('document_blocks')
      .select('*')
      .eq('component_version_id', componentVersionId)
      .order('sort_order', { ascending: true })
    throwOnError(error)
    return ((data ?? []) as BlockRow[]).map(mapBlock)
  },

  async createBlock(input: CreateBlockInput) {
    await requireStudioUserId()
    const { data, error } = await supabase
      .from('document_blocks')
      .insert({
        component_version_id: input.componentVersionId,
        block_type: input.blockType,
        sort_order: input.sortOrder,
        payload: input.payload ?? {},
      })
      .select('*')
      .single()
    throwOnError(error)
    return mapBlock(data as BlockRow)
  },

  async listConditions(blockId) {
    await requireStudioUserId()
    const { data, error } = await supabase
      .from('document_block_conditions')
      .select('*')
      .eq('block_id', blockId)
    throwOnError(error)
    return ((data ?? []) as BlockConditionRow[]).map(mapBlockCondition)
  },

  async createCondition(input: CreateBlockConditionInput) {
    await requireStudioUserId()
    const { data, error } = await supabase
      .from('document_block_conditions')
      .insert({
        block_id: input.blockId,
        scope: input.scope ?? 'block',
        rule: input.rule,
      })
      .select('*')
      .single()
    throwOnError(error)
    return mapBlockCondition(data as BlockConditionRow)
  },
}
