import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import { requireStudioUserId } from '@/lib/api/ownership'
import { documentStorage } from '@/lib/api/documents/storage'
import type {
  CreateTemplateInput,
  CreateTemplateVersionInput,
  DocumentTemplateService,
  UpdateTemplateInput,
  UploadTemplateInput,
} from '@/lib/api/documents/interfaces'
import {
  mapTemplate,
  mapTemplateVersion,
  type TemplateRow,
  type TemplateVersionRow,
} from '@/lib/api/documents/mappers'
import type {
  DocumentBlockPayload,
  DocumentTemplate,
  DocumentTemplateSummary,
  DocumentTemplateVersion,
} from '@/types/documents'

function assertDocx(file: File) {
  const name = file.name.toLowerCase()
  if (
    !name.endsWith('.docx') &&
    !name.endsWith('.doc') &&
    !name.endsWith('.pdf')
  ) {
    throw new Error('Dodaj plik w formacie DOCX, DOC lub PDF.')
  }
}

async function countStatsForVersion(templateVersionId: string | null): Promise<{
  componentCount: number
  blockCount: number
  variableCount: number
}> {
  if (!templateVersionId) {
    return { componentCount: 0, blockCount: 0, variableCount: 0 }
  }

  const { data: links, error: linksError } = await supabase
    .from('document_template_component_links')
    .select('component_version_id')
    .eq('template_version_id', templateVersionId)
  throwOnError(linksError)

  const componentVersionIds = [
    ...new Set(
      ((links ?? []) as { component_version_id: string }[]).map(
        (l) => l.component_version_id,
      ),
    ),
  ]

  if (componentVersionIds.length === 0) {
    return { componentCount: 0, blockCount: 0, variableCount: 0 }
  }

  const { data: blocks, error: blocksError } = await supabase
    .from('document_blocks')
    .select('payload')
    .in('component_version_id', componentVersionIds)
  throwOnError(blocksError)

  const variableKeys = new Set<string>()
  for (const row of (blocks ?? []) as { payload: DocumentBlockPayload }[]) {
    const keys = row.payload?.variableKeys
    if (Array.isArray(keys)) {
      for (const key of keys) {
        if (typeof key === 'string' && key) variableKeys.add(key)
      }
    }
  }

  return {
    componentCount: componentVersionIds.length,
    blockCount: (blocks ?? []).length,
    variableCount: variableKeys.size,
  }
}

async function toSummary(
  template: DocumentTemplate,
  versions: DocumentTemplateVersion[],
): Promise<DocumentTemplateSummary> {
  const current = versions.find((v) => v.id === template.currentVersionId) ?? null
  const stats = await countStatsForVersion(template.currentVersionId)
  return {
    ...template,
    currentVersionNumber: current?.versionNumber ?? null,
    componentCount: stats.componentCount,
    blockCount: stats.blockCount,
    variableCount: stats.variableCount,
    sourceFileName: current?.sourceFileName ?? null,
    sourceDocxPath: current?.sourceDocxPath ?? null,
  }
}

async function clearDefaultsForType(userId: string, docType: string) {
  const { error } = await supabase
    .from('document_templates')
    .update({ is_default: false })
    .eq('user_id', userId)
    .eq('doc_type', docType)
    .eq('is_default', true)
  throwOnError(error)
}

async function copyStorageFile(fromPath: string, toPath: string): Promise<void> {
  const buffer = await documentStorage.download(fromPath)
  await documentStorage.upload(
    toPath,
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  )
}

async function listTemplates(): Promise<DocumentTemplate[]> {
  const userId = await requireStudioUserId()
  const { data, error } = await supabase
    .from('document_templates')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  throwOnError(error)
  return ((data ?? []) as TemplateRow[]).map(mapTemplate)
}

async function listVersions(
  templateId: string,
): Promise<DocumentTemplateVersion[]> {
  await requireStudioUserId()
  const { data, error } = await supabase
    .from('document_template_versions')
    .select('*')
    .eq('template_id', templateId)
    .order('version_number', { ascending: false })
  throwOnError(error)
  return ((data ?? []) as TemplateVersionRow[]).map(mapTemplateVersion)
}

async function getTemplate(id: string): Promise<DocumentTemplate | null> {
  const userId = await requireStudioUserId()
  const { data, error } = await supabase
    .from('document_templates')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  throwOnError(error)
  return data ? mapTemplate(data as TemplateRow) : null
}

async function getTemplateSummary(
  id: string,
): Promise<DocumentTemplateSummary | null> {
  const template = await getTemplate(id)
  if (!template) return null
  const versions = await listVersions(id)
  return toSummary(template, versions)
}

async function updateTemplate(
  id: string,
  input: UpdateTemplateInput,
): Promise<DocumentTemplate> {
  const userId = await requireStudioUserId()
  const existing = await getTemplate(id)
  if (!existing) throw new Error('Szablon nie istnieje.')

  if (input.isDefault === true) {
    await clearDefaultsForType(userId, input.docType ?? existing.docType)
  }

  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.description !== undefined) patch.description = input.description
  if (input.docType !== undefined) patch.doc_type = input.docType
  if (input.category !== undefined) patch.category = input.category
  if (input.status !== undefined) patch.status = input.status
  if (input.currentVersionId !== undefined) {
    patch.current_version_id = input.currentVersionId
  }
  if (input.isDefault !== undefined) patch.is_default = input.isDefault
  if (input.aiAnalyzedAt !== undefined) patch.ai_analyzed_at = input.aiAnalyzedAt
  if (input.questionnaireFormId !== undefined) {
    patch.questionnaire_form_id = input.questionnaireFormId
  }

  const { data, error } = await supabase
    .from('document_templates')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single()
  throwOnError(error)
  return mapTemplate(data as TemplateRow)
}

async function createTemplate(
  input: CreateTemplateInput,
): Promise<DocumentTemplate> {
  const userId = await requireStudioUserId()
  const docType = input.docType ?? 'contract'
  if (input.isDefault) {
    await clearDefaultsForType(userId, docType)
  }
  const { data, error } = await supabase
    .from('document_templates')
    .insert({
      user_id: userId,
      name: input.name.trim(),
      description: input.description ?? null,
      doc_type: docType,
      category: input.category ?? null,
      status: 'draft',
      is_default: Boolean(input.isDefault),
    })
    .select('*')
    .single()
  throwOnError(error)
  return mapTemplate(data as TemplateRow)
}

async function createVersion(
  input: CreateTemplateVersionInput,
): Promise<DocumentTemplateVersion> {
  const userId = await requireStudioUserId()
  const existing = await listVersions(input.templateId)
  const next = (existing[0]?.versionNumber ?? 0) + 1
  const { data, error } = await supabase
    .from('document_template_versions')
    .insert({
      template_id: input.templateId,
      version_number: next,
      source_docx_path: input.sourceDocxPath ?? null,
      source_file_name: input.sourceFileName ?? null,
      definition_checksum: input.definitionChecksum ?? null,
      locale: input.locale ?? 'pl',
      notes: input.notes ?? null,
      created_by: userId,
    })
    .select('*')
    .single()
  throwOnError(error)
  const version = mapTemplateVersion(data as TemplateVersionRow)
  if (input.setAsCurrent !== false) {
    await updateTemplate(input.templateId, { currentVersionId: version.id })
  }
  return version
}

async function removeTemplate(id: string): Promise<void> {
  const userId = await requireStudioUserId()
  const template = await getTemplate(id)
  if (!template) return

  const formIds = new Set<string>()
  if (template.questionnaireFormId) {
    formIds.add(template.questionnaireFormId)
  }

  // Also find AI forms that reference this template in schema meta.
  const { data: forms, error: formsError } = await supabase
    .from('forms')
    .select('id, schema')
    .eq('user_id', userId)
  throwOnError(formsError)
  for (const row of (forms ?? []) as { id: string; schema: unknown }[]) {
    const meta = (row.schema as { meta?: Record<string, unknown> } | null)?.meta
    if (meta?.sourceDocumentTemplateId === id) {
      formIds.add(row.id)
    }
  }

  for (const formId of formIds) {
    await unlinkAndDeleteQuestionnaireForm(formId, userId)
  }

  const versions = await listVersions(id)
  for (const version of versions) {
    if (version.sourceDocxPath) {
      try {
        await documentStorage.remove(version.sourceDocxPath)
      } catch {
        // continue — DB delete is source of truth
      }
    }
  }

  const { error } = await supabase
    .from('document_templates')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  throwOnError(error)
}

async function unlinkAndDeleteQuestionnaireForm(
  formId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from('packages')
    .update({ questionnaire_form_id: null })
    .eq('user_id', userId)
    .eq('questionnaire_form_id', formId)

  const { data: instances, error: instancesError } = await supabase
    .from('form_instances')
    .select('id')
    .eq('form_id', formId)
  throwOnError(instancesError)

  const instanceIds = ((instances ?? []) as { id: string }[]).map((i) => i.id)
  if (instanceIds.length > 0) {
    const { error: answersError } = await supabase
      .from('form_answers')
      .delete()
      .in('instance_id', instanceIds)
    throwOnError(answersError)

    const { error: deleteInstancesError } = await supabase
      .from('form_instances')
      .delete()
      .in('id', instanceIds)
    throwOnError(deleteInstancesError)
  }

  const { error: deleteFormError } = await supabase
    .from('forms')
    .delete()
    .eq('id', formId)
    .eq('user_id', userId)
  throwOnError(deleteFormError)
}

async function getVersion(
  id: string,
): Promise<DocumentTemplateVersion | null> {
  await requireStudioUserId()
  const { data, error } = await supabase
    .from('document_template_versions')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  throwOnError(error)
  return data ? mapTemplateVersion(data as TemplateVersionRow) : null
}

/** Explicit function module — no `this` / method binding. */
export const documentTemplateService: DocumentTemplateService = {
  list: listTemplates,

  async listSummaries() {
    const templates = await listTemplates()
    const summaries: DocumentTemplateSummary[] = []
    for (const template of templates) {
      const versions = await listVersions(template.id)
      summaries.push(await toSummary(template, versions))
    }
    return summaries
  },

  get: getTemplate,
  getSummary: getTemplateSummary,
  create: createTemplate,
  update: updateTemplate,

  async archive(id) {
    return updateTemplate(id, { status: 'archived', isDefault: false })
  },

  async restore(id) {
    return updateTemplate(id, { status: 'draft' })
  },

  remove: removeTemplate,

  async duplicate(id) {
    const userId = await requireStudioUserId()
    const source = await getTemplateSummary(id)
    if (!source) throw new Error('Szablon nie istnieje.')

    const created = await createTemplate({
      name: `${source.name} (kopia)`,
      description: source.description,
      docType: source.docType,
      category: source.category,
      isDefault: false,
    })

    const versions = await listVersions(id)
    const current =
      versions.find((v) => v.id === source.currentVersionId) ?? versions[0]

    if (current?.sourceDocxPath) {
      const path = documentStorage.paths.templateSource(userId, created.id, 1)
      await copyStorageFile(current.sourceDocxPath, path)
      await createVersion({
        templateId: created.id,
        sourceDocxPath: path,
        sourceFileName: current.sourceFileName,
        notes: current.notes,
        setAsCurrent: true,
      })
    }

    const summary = await getTemplateSummary(created.id)
    if (!summary) throw new Error('Nie udało się utworzyć kopii.')
    return summary
  },

  async setDefault(id) {
    return updateTemplate(id, { isDefault: true })
  },

  async clearDefault(id) {
    return updateTemplate(id, { isDefault: false })
  },

  async uploadTemplate(input: UploadTemplateInput) {
    assertDocx(input.file)
    const userId = await requireStudioUserId()

    const created = await createTemplate({
      name: input.name.trim(),
      description: input.description ?? null,
      docType: input.docType,
      isDefault: input.setAsDefault,
    })

    try {
      const path = documentStorage.paths.templateSource(userId, created.id, 1)
      await documentStorage.upload(path, input.file, input.file.type || undefined)
      await createVersion({
        templateId: created.id,
        sourceDocxPath: path,
        sourceFileName: input.file.name,
        setAsCurrent: true,
      })
      await updateTemplate(created.id, { status: 'draft' })
    } catch (err) {
      await removeTemplate(created.id)
      throw err
    }

    const summary = await getTemplateSummary(created.id)
    if (!summary) throw new Error('Nie udało się utworzyć szablonu.')
    return summary
  },

  async uploadNewVersion(templateId, file, options) {
    assertDocx(file)
    const userId = await requireStudioUserId()
    const template = await getTemplate(templateId)
    if (!template) throw new Error('Szablon nie istnieje.')

    const existing = await listVersions(templateId)
    const next = (existing[0]?.versionNumber ?? 0) + 1
    const path = documentStorage.paths.templateSource(userId, templateId, next)
    await documentStorage.upload(path, file, file.type || undefined)

    return createVersion({
      templateId,
      sourceDocxPath: path,
      sourceFileName: file.name,
      notes: options?.notes ?? null,
      setAsCurrent: options?.setAsCurrent !== false,
    })
  },

  listVersions,
  createVersion,
  getVersion,

  async setCurrentVersion(templateId, versionId) {
    const version = await getVersion(versionId)
    if (!version || version.templateId !== templateId) {
      throw new Error('Wersja nie należy do tego szablonu.')
    }
    return updateTemplate(templateId, { currentVersionId: versionId })
  },

  async duplicateVersion(versionId) {
    const userId = await requireStudioUserId()
    const source = await getVersion(versionId)
    if (!source) throw new Error('Wersja nie istnieje.')
    if (!source.sourceDocxPath) {
      throw new Error('Ta wersja nie ma pliku źródłowego.')
    }

    const existing = await listVersions(source.templateId)
    const next = (existing[0]?.versionNumber ?? 0) + 1
    const path = documentStorage.paths.templateSource(
      userId,
      source.templateId,
      next,
    )
    await copyStorageFile(source.sourceDocxPath, path)

    return createVersion({
      templateId: source.templateId,
      sourceDocxPath: path,
      sourceFileName: source.sourceFileName,
      notes: source.notes
        ? `Kopia v${source.versionNumber}: ${source.notes}`
        : `Kopia v${source.versionNumber}`,
      setAsCurrent: false,
    })
  },
}
