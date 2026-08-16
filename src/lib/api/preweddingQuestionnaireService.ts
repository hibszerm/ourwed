// =============================================================================
// Pre-Wedding Questionnaire Service
// Photographer-authenticated CRUD + public RPC calls
// =============================================================================

import { supabase } from '@/lib/supabase'
import { resolveStudioUserId } from '@/lib/api/studioUser'
import { timelineEventService } from '@/lib/api/timelineEventService'
import { notificationService } from '@/lib/api/notificationService'
import {
  DEFAULT_TEMPLATE_INTRODUCTION,
  DEFAULT_TEMPLATE_NAME,
  DEFAULT_TEMPLATE_SCHEMA,
  DEFAULT_TEMPLATE_SOURCE_KEY,
  DEFAULT_TEMPLATE_SOURCE_KEY_V1,
  DEFAULT_TEMPLATE_TITLE,
} from '@/features/prewedding/defaultTemplate'
import {
  locationAnswerToPlainText,
  isAnswerEmpty,
} from '@/features/prewedding/preweddingLocation'
import { regenerateSchemaIds } from '@/features/prewedding/templateSchemaUtils'
import {
  mergeLocationAnswerWithExisting,
  normalizeLocationAnswer,
} from '@/features/travel/weddingLocationModel'
import { buildPrefill } from '@/lib/api/preweddingPrefill'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import type { WeddingPlaceRole } from '@/types/travel'
import type {
  PrefillValue,
  PreWeddingAnswerValue,
  PreWeddingTemplateSchema,
  PublicPreWeddingForm,
  QuestionnaireTemplate,
  QuestionnaireTemplateType,
  WeddingDayMappingProposal,
  WeddingQuestionnaire,
  WeddingQuestionnaireStatus,
} from '@/types/preweddingQuestionnaire'
import type { Wedding } from '@/types/wedding'
import {
  persistShareToken,
  readShareToken,
} from '@/features/prewedding/preweddingShareHelpers'
import { devWarnArgs } from '@/lib/debug/devConsole'

export {
  buildPreweddingPublicUrl,
  clearShareToken,
  mapPreweddingShareError,
  persistShareToken,
  preweddingShareMessage,
  readShareToken,
} from '@/features/prewedding/preweddingShareHelpers'

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapTemplateRow(row: Record<string, unknown>): QuestionnaireTemplate {
  const rawType = row.type as string | undefined
  const type: QuestionnaireTemplateType =
    rawType === 'contract' ? 'contract' : 'pre_wedding'
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    name: row.name as string,
    type,
    sourceKey: (row.source_key as string | null) ?? null,
    title: (row.title as string) ?? '',
    introduction: (row.introduction as string) ?? '',
    schema: (row.schema_json as PreWeddingTemplateSchema) ?? { sections: [] },
    version: (row.version as number) ?? 1,
    isDefault: Boolean(row.is_default),
    isArchived: Boolean(row.is_archived),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapWeddingQuestionnaireRow(row: Record<string, unknown>): WeddingQuestionnaire {
  return {
    id: row.id as string,
    weddingId: row.wedding_id as string,
    ownerId: row.owner_id as string,
    templateId: (row.template_id as string | null) ?? null,
    templateVersion: (row.template_version as number | null) ?? null,
    title: (row.title as string) ?? '',
    introduction: (row.introduction as string) ?? '',
    schema: (row.schema_snapshot_json as PreWeddingTemplateSchema) ?? { sections: [] },
    prefill: (row.prefill_json as Record<string, import('@/types/preweddingQuestionnaire').PrefillValue>) ?? {},
    status: (row.status as WeddingQuestionnaireStatus) ?? 'draft',
    hasPublicToken: Boolean(row.public_token_hash),
    preparedAt: (row.prepared_at as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    firstOpenedAt: (row.first_opened_at as string | null) ?? null,
    lastSavedAt: (row.last_saved_at as string | null) ?? null,
    submittedAt: (row.submitted_at as string | null) ?? null,
    reopenedAt: (row.reopened_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** Count answerable (non-information) questions in a schema. */
export { countAnswerableQuestions, regenerateSchemaIds } from '@/features/prewedding/templateSchemaUtils'

// ---------------------------------------------------------------------------
// Template service
// ---------------------------------------------------------------------------

export const QUESTIONNAIRE_TEMPLATES_QUERY_KEY = ['questionnaire-templates'] as const

export const questionnaireTemplateService = {
  async listOwn(options?: {
    type?: QuestionnaireTemplateType
    includeArchived?: boolean
  }): Promise<QuestionnaireTemplate[]> {
    const userId = await resolveStudioUserId()
    let query = supabase
      .from('questionnaire_templates')
      .select('*')
      .eq('owner_id', userId)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false })

    if (options?.type) query = query.eq('type', options.type)
    if (options?.includeArchived === false) query = query.eq('is_archived', false)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(mapTemplateRow)
  },

  async listActive(type: QuestionnaireTemplateType): Promise<QuestionnaireTemplate[]> {
    return this.listOwn({ type, includeArchived: false })
  },

  async getById(id: string): Promise<QuestionnaireTemplate | null> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('questionnaire_templates')
      .select('*')
      .eq('id', id)
      .eq('owner_id', userId)
      .single()
    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data ? mapTemplateRow(data as Record<string, unknown>) : null
  },

  async getEffectiveDefault(
    type: QuestionnaireTemplateType,
  ): Promise<QuestionnaireTemplate | null> {
    const active = await this.listActive(type)
    if (active.length === 0) return null
    const marked = active.find((t) => t.isDefault)
    if (marked) return marked
    if (active.length === 1) return active[0]!
    return null
  },

  /** Get or seed the default pre-wedding template (v2 chronological). */
  async getOrSeedDefault(): Promise<QuestionnaireTemplate> {
    const userId = await resolveStudioUserId()

    const { data: existingV2 } = await supabase
      .from('questionnaire_templates')
      .select('*')
      .eq('owner_id', userId)
      .eq('source_key', DEFAULT_TEMPLATE_SOURCE_KEY)
      .maybeSingle()
    if (existingV2) return mapTemplateRow(existingV2 as Record<string, unknown>)

    const { data: existingV1 } = await supabase
      .from('questionnaire_templates')
      .select('*')
      .eq('owner_id', userId)
      .eq('source_key', DEFAULT_TEMPLATE_SOURCE_KEY_V1)
      .maybeSingle()

    if (existingV1) {
      const { data: upgraded, error: upgradeError } = await supabase
        .from('questionnaire_templates')
        .update({
          source_key: DEFAULT_TEMPLATE_SOURCE_KEY,
          name: DEFAULT_TEMPLATE_NAME,
          title: DEFAULT_TEMPLATE_TITLE,
          introduction: DEFAULT_TEMPLATE_INTRODUCTION,
          schema_json: DEFAULT_TEMPLATE_SCHEMA,
          type: 'pre_wedding',
          is_default: true,
          is_archived: false,
        })
        .eq('id', (existingV1 as { id: string }).id)
        .eq('owner_id', userId)
        .select()
        .single()
      if (upgradeError) throw upgradeError
      return mapTemplateRow(upgraded as Record<string, unknown>)
    }

    const existingActive = await this.listActive('pre_wedding')
    if (existingActive.length > 0) {
      return existingActive.find((t) => t.isDefault) ?? existingActive[0]!
    }

    const { data, error } = await supabase
      .from('questionnaire_templates')
      .insert({
        owner_id: userId,
        name: DEFAULT_TEMPLATE_NAME,
        source_key: DEFAULT_TEMPLATE_SOURCE_KEY,
        title: DEFAULT_TEMPLATE_TITLE,
        introduction: DEFAULT_TEMPLATE_INTRODUCTION,
        schema_json: DEFAULT_TEMPLATE_SCHEMA,
        type: 'pre_wedding',
        is_default: true,
        is_archived: false,
      })
      .select()
      .single()
    if (error) throw error
    return mapTemplateRow(data as Record<string, unknown>)
  },

  async create(input: {
    name: string
    type?: QuestionnaireTemplateType
    title?: string
    introduction?: string
    schema?: PreWeddingTemplateSchema
    isDefault?: boolean
    sourceKey?: string | null
  }): Promise<QuestionnaireTemplate> {
    const userId = await resolveStudioUserId()
    const type = input.type ?? 'pre_wedding'
    const makeDefault = Boolean(input.isDefault)

    if (makeDefault) {
      await supabase
        .from('questionnaire_templates')
        .update({ is_default: false })
        .eq('owner_id', userId)
        .eq('type', type)
        .eq('is_default', true)
    }

    const { data, error } = await supabase
      .from('questionnaire_templates')
      .insert({
        owner_id: userId,
        name: input.name.trim(),
        type,
        title: input.title ?? '',
        introduction: input.introduction ?? '',
        schema_json: input.schema ?? { sections: [] },
        source_key: input.sourceKey ?? null,
        is_default: makeDefault,
        is_archived: false,
      })
      .select()
      .single()
    if (error) throw error
    return mapTemplateRow(data as Record<string, unknown>)
  },

  async update(
    id: string,
    patch: Partial<{
      name: string
      title: string
      introduction: string
      schema: PreWeddingTemplateSchema
      isDefault: boolean
      isArchived: boolean
    }>,
  ): Promise<QuestionnaireTemplate> {
    const userId = await resolveStudioUserId()
    const current = await this.getById(id)
    if (!current) throw new Error('Template not found')

    if (patch.isDefault === true && current.isArchived && patch.isArchived !== false) {
      throw new Error('Archived template cannot be default')
    }

    if (patch.isDefault === true) {
      await supabase
        .from('questionnaire_templates')
        .update({ is_default: false })
        .eq('owner_id', userId)
        .eq('type', current.type)
        .eq('is_default', true)
        .neq('id', id)
    }

    const updatePayload: Record<string, unknown> = {}
    if (patch.name !== undefined) updatePayload.name = patch.name.trim()
    if (patch.title !== undefined) updatePayload.title = patch.title
    if (patch.introduction !== undefined) updatePayload.introduction = patch.introduction
    if (patch.schema !== undefined) updatePayload.schema_json = patch.schema
    if (patch.isDefault !== undefined) updatePayload.is_default = patch.isDefault
    if (patch.isArchived !== undefined) {
      updatePayload.is_archived = patch.isArchived
      if (patch.isArchived) updatePayload.is_default = false
    }

    const { data, error } = await supabase
      .from('questionnaire_templates')
      .update(updatePayload)
      .eq('id', id)
      .eq('owner_id', userId)
      .select()
      .single()
    if (error) throw error
    return mapTemplateRow(data as Record<string, unknown>)
  },

  async duplicate(id: string): Promise<QuestionnaireTemplate> {
    const source = await this.getById(id)
    if (!source) throw new Error('Template not found')
    return this.create({
      name: `${source.name} — kopia`,
      type: source.type,
      title: source.title,
      introduction: source.introduction,
      schema: regenerateSchemaIds(source.schema),
      isDefault: false,
    })
  },

  async saveAsNew(
    sourceId: string,
    name: string,
    draft: {
      title: string
      introduction: string
      schema: PreWeddingTemplateSchema
    },
  ): Promise<QuestionnaireTemplate> {
    const source = await this.getById(sourceId)
    if (!source) throw new Error('Template not found')
    return this.create({
      name: name.trim() || `${source.name} — kopia`,
      type: source.type,
      title: draft.title,
      introduction: draft.introduction,
      schema: regenerateSchemaIds(draft.schema),
      isDefault: false,
    })
  },

  async archive(id: string): Promise<void> {
    await this.update(id, { isArchived: true, isDefault: false })
  },

  async restore(id: string): Promise<QuestionnaireTemplate> {
    return this.update(id, { isArchived: false })
  },

  async setDefault(id: string): Promise<void> {
    const current = await this.getById(id)
    if (!current) throw new Error('Template not found')
    if (current.isArchived) throw new Error('Archived template cannot be default')
    await this.update(id, { isDefault: true })
  },

  async getUsageCount(id: string): Promise<number> {
    const userId = await resolveStudioUserId()
    const { count, error } = await supabase
      .from('wedding_questionnaires')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId)
      .eq('template_id', id)
    if (error) throw error
    return count ?? 0
  },
}

// ---------------------------------------------------------------------------
// Wedding questionnaire service
// ---------------------------------------------------------------------------

export { buildPrefill } from '@/lib/api/preweddingPrefill'

export const weddingQuestionnaireService = {
  async getByWeddingId(weddingId: string): Promise<WeddingQuestionnaire | null> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('wedding_questionnaires')
      .select('*')
      .eq('wedding_id', weddingId)
      .eq('owner_id', userId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data ? mapWeddingQuestionnaireRow(data as Record<string, unknown>) : null
  },

  async getById(id: string): Promise<WeddingQuestionnaire | null> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('wedding_questionnaires')
      .select('*')
      .eq('id', id)
      .eq('owner_id', userId)
      .single()
    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data ? mapWeddingQuestionnaireRow(data as Record<string, unknown>) : null
  },

  /** Prepare (create) a wedding questionnaire from a template snapshot. */
  async prepare(
    wedding: Wedding,
    template: QuestionnaireTemplate,
  ): Promise<WeddingQuestionnaire> {
    const userId = await resolveStudioUserId()
    if (template.ownerId !== userId) {
      throw new Error('Nie możesz użyć szablonu innego studia.')
    }
    if (template.isArchived) {
      throw new Error('Zarchiwizowanego szablonu nie można użyć przy nowym ślubie.')
    }
    if (template.type !== 'pre_wedding') {
      throw new Error('Ten szablon nie jest ankietą przedślubną.')
    }
    if (!template.title.trim()) {
      throw new Error('Szablon nie ma tytułu widocznego dla pary.')
    }

    const places = await weddingPlaceService.listByWeddingId(wedding.id)
    const prefill = buildPrefill(wedding, places)
    // Deep-copy schema so later template edits never touch this instance.
    const schemaSnapshot = JSON.parse(
      JSON.stringify(template.schema),
    ) as PreWeddingTemplateSchema

    const { data, error } = await supabase
      .from('wedding_questionnaires')
      .insert({
        wedding_id: wedding.id,
        owner_id: userId,
        template_id: template.id,
        template_version: template.version,
        title: template.title,
        introduction: template.introduction,
        schema_snapshot_json: schemaSnapshot,
        prefill_json: prefill,
        status: 'draft',
        prepared_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (error) throw error

    await timelineEventService.create({
      weddingId: wedding.id,
      type: 'questionnaire_sent',
      title: 'Przygotowano ankietę przedślubną.',
      description: `Na podstawie szablonu „${template.name}”.`,
      systemGenerated: true,
    })

    return mapWeddingQuestionnaireRow(data as Record<string, unknown>)
  },

  /** Mark questionnaire as ready to send (no token yet). */
  async markReady(id: string): Promise<WeddingQuestionnaire> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('wedding_questionnaires')
      .update({ status: 'ready' })
      .eq('id', id)
      .eq('owner_id', userId)
      .select()
      .single()
    if (error) throw error
    return mapWeddingQuestionnaireRow(data as Record<string, unknown>)
  },

  /** Generate a secure public token. Returns { questionnaire, token } where token is plaintext (one-time). */
  async generateToken(id: string): Promise<{ questionnaire: WeddingQuestionnaire; token: string }> {
    const { data, error } = await supabase.rpc('generate_prewedding_token', {
      p_questionnaire_id: id,
    })
    if (error) throw error
    if (typeof data !== 'string' || !data) {
      throw new Error('Token generation returned an empty payload.')
    }
    const token = data

    const { data: qRow, error: qError } = await supabase
      .from('wedding_questionnaires')
      .select('*')
      .eq('id', id)
      .single()
    if (qError) throw qError
    if (!qRow) throw new Error('Nie znaleziono ankiety po wygenerowaniu tokenu.')

    const questionnaire = mapWeddingQuestionnaireRow(qRow as Record<string, unknown>)
    persistShareToken(id, token)
    return { questionnaire: { ...questionnaire, publicToken: token }, token }
  },

  /**
   * Share / generate public link.
   * - If an active hash exists and session still has plaintext → reuse (no rotation).
   * - Otherwise generate/rotate token and return plaintext once.
   * - Rotating a link does not clear submitted answers or change submitted status.
   * Plaintext cannot be reconstructed from the stored hash.
   */
  async ensureShareLink(
    id: string,
    weddingId: string,
    options?: { rotate?: boolean },
  ): Promise<{ questionnaire: WeddingQuestionnaire; token: string; rotated: boolean }> {
    const current = await this.getById(id)
    if (!current) throw new Error('Nie znaleziono ankiety.')

    const cached = readShareToken(id)
    if (
      !options?.rotate &&
      current.hasPublicToken &&
      cached &&
      current.status !== 'draft' &&
      current.status !== 'ready' &&
      current.status !== 'archived'
    ) {
      return {
        questionnaire: { ...current, publicToken: cached },
        token: cached,
        rotated: false,
      }
    }

    if (current.status === 'draft') {
      await this.markReady(id)
    }

    return { ...(await this.send(id, weddingId)), rotated: true }
  },

  /** Send / rotate public token. Status becomes "sent" only when leaving draft/ready. */
  async send(id: string, weddingId: string): Promise<{ questionnaire: WeddingQuestionnaire; token: string }> {
    const userId = await resolveStudioUserId()
    const current = await this.getById(id)
    if (!current) throw new Error('Nie znaleziono ankiety.')

    const { token } = await this.generateToken(id)

    const leavingDraft = current.status === 'draft' || current.status === 'ready'
    let questionnaire: WeddingQuestionnaire

    if (leavingDraft) {
      const { data, error } = await supabase
        .from('wedding_questionnaires')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('owner_id', userId)
        .select()
        .single()
      if (error) throw error
      questionnaire = {
        ...mapWeddingQuestionnaireRow(data as Record<string, unknown>),
        publicToken: token,
      }
    } else {
      // Token rotation only — keep submitted / in_progress / opened / sent as-is.
      const refreshed = await this.getById(id)
      if (!refreshed) throw new Error('Nie znaleziono ankiety po wygenerowaniu tokenu.')
      questionnaire = { ...refreshed, publicToken: token }
    }

    await timelineEventService.create({
      weddingId,
      type: 'questionnaire_sent',
      title: leavingDraft
        ? 'Udostępniono ankietę przedślubną.'
        : 'Wygenerowano nowy link do ankiety przedślubnej.',
      description: leavingDraft
        ? 'Wygenerowano bezpieczny link dla pary.'
        : 'Poprzedni link został unieważniony.',
      systemGenerated: true,
    })

    return { questionnaire, token }
  },

  /** Update schema snapshot (before send only). Does NOT affect template. */
  async updateSnapshot(
    id: string,
    patch: Partial<{
      title: string
      introduction: string
      schema: PreWeddingTemplateSchema
    }>,
  ): Promise<WeddingQuestionnaire> {
    const userId = await resolveStudioUserId()
    const payload: Record<string, unknown> = {}
    if (patch.title !== undefined) payload.title = patch.title
    if (patch.introduction !== undefined) payload.introduction = patch.introduction
    if (patch.schema !== undefined) payload.schema_snapshot_json = patch.schema

    const { data, error } = await supabase
      .from('wedding_questionnaires')
      .update(payload)
      .eq('id', id)
      .eq('owner_id', userId)
      .select()
      .single()
    if (error) throw error
    return mapWeddingQuestionnaireRow(data as Record<string, unknown>)
  },

  /**
   * Upgrade draft/ready questionnaire with no meaningful answers to the v2 layout.
   * Refuses sent/opened/in_progress/submitted instances.
   */
  async upgradeEmptyDraftToDefaultV2(
    id: string,
    responseAnswers?: Record<string, PreWeddingAnswerValue> | null,
  ): Promise<WeddingQuestionnaire> {
    const current = await this.getById(id)
    if (!current) throw new Error('Nie znaleziono ankiety.')
    if (current.status !== 'draft' && current.status !== 'ready') {
      throw new Error('Można zaktualizować tylko szkic lub ankietę gotową do wysłania.')
    }
    const answers = responseAnswers ?? (await this.getResponse(id))?.answers ?? {}
    const hasAnswers = Object.values(answers).some((v) => !isAnswerEmpty(v))
    if (hasAnswers) {
      throw new Error('Ankieta ma już odpowiedzi — nie nadpisujemy układu.')
    }

    const template = await questionnaireTemplateService.getOrSeedDefault()
    return this.updateSnapshot(id, {
      title: template.title,
      introduction: template.introduction,
      schema: template.schema,
    })
  },

  /** Get couple answers (photographer view). */
  async getResponse(questionnaireId: string) {
    const userId = await resolveStudioUserId()
    // Verify ownership
    const { data: qData } = await supabase
      .from('wedding_questionnaires')
      .select('id')
      .eq('id', questionnaireId)
      .eq('owner_id', userId)
      .single()
    if (!qData) return null

    const { data, error } = await supabase
      .from('wedding_questionnaire_responses')
      .select('*')
      .eq('questionnaire_id', questionnaireId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null

    return {
      questionnaireId,
      answers: (data.answers_json as Record<string, PreWeddingAnswerValue>) ?? {},
      answeredRequired: data.answered_required as number,
      totalRequired: data.total_required as number,
      submittedAt: data.submitted_at as string | null,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    }
  },

  /** Record history event when couple opens the questionnaire. */
  async recordFirstOpened(questionnaireId: string, weddingId: string): Promise<void> {
    await timelineEventService.create({
      weddingId,
      type: 'questionnaire_sent',
      title: 'Para otworzyła ankietę przedślubną.',
      systemGenerated: true,
    })
    // Notify photographer
    await notificationService.create({
      title: 'Para otworzyła ankietę',
      message: 'Para otworzyła ankietę przedślubną.',
      type: 'info',
      entityType: 'wedding_questionnaire',
      entityId: questionnaireId,
      link: `/sluby/${weddingId}?tab=pre_wedding_questionnaire`,
    })
  },

  /** Build Wedding Day mapping proposals from submitted answers. */
  buildMappingProposals(
    questionnaire: WeddingQuestionnaire,
    answers: Record<string, PreWeddingAnswerValue>,
    wedding: Wedding,
  ): WeddingDayMappingProposal[] {
    const proposals: WeddingDayMappingProposal[] = []

    const FIELD_LABELS: Record<string, string> = {
      bridePreparationLocation: 'Adres przygotowań Panny Młodej',
      groomPreparationLocation: 'Adres przygotowań Pana Młodego',
      ceremonyLocation: 'Adres ceremonii',
      ceremonyTime: 'Godzina ślubu',
      receptionVenue: 'Sala weselna',
      photoVideoPriorities: 'Priorytety zdjęć i filmu',
      sensitiveFamilyNotes: 'Kwestie rodzinne (prywatne)',
      djBandProvider: 'DJ / Zespół',
      blessingPlan: 'Plan błogosławieństwa',
      groupPhotoPlan: 'Zdjęcie grupowe',
    }

    const CURRENT_VALUES: Record<string, string> = {
      bridePreparationLocation: wedding.bridePreparationLocation ?? '',
      groomPreparationLocation: wedding.groomPreparationLocation ?? '',
      ceremonyLocation: wedding.ceremonyLocation ?? '',
      ceremonyTime: wedding.ceremonyTime ?? '',
      receptionVenue: wedding.receptionLocation ?? '',
      photoVideoPriorities: '',
      sensitiveFamilyNotes: '',
      djBandProvider: '',
      blessingPlan: '',
      groupPhotoPlan: '',
    }

    for (const section of questionnaire.schema.sections) {
      for (const q of section.questions) {
        if (!q.weddingDayMapping) continue
        const rawAnswer = answers[q.id]
        if (isAnswerEmpty(rawAnswer)) continue
        const proposed = locationAnswerToPlainText(rawAnswer)
        if (!proposed.trim()) continue

        proposals.push({
          questionId: q.id,
          questionLabel: q.label,
          weddingDayField: q.weddingDayMapping,
          weddingDayLabel: FIELD_LABELS[q.weddingDayMapping] ?? q.weddingDayMapping,
          currentValue: CURRENT_VALUES[q.weddingDayMapping] ?? '',
          proposedValue: proposed,
          isEmpty: !CURRENT_VALUES[q.weddingDayMapping],
        })
      }
    }

    return proposals
  },

  /**
   * Upsert structured questionnaire locations into wedding_places (canonical model).
   */
  async applyLocationAnswersToWeddingPlaces(
    weddingId: string,
    proposals: WeddingDayMappingProposal[],
    answers: Record<string, PreWeddingAnswerValue>,
  ): Promise<void> {
    const ROLE_BY_FIELD: Record<string, WeddingPlaceRole> = {
      bridePreparationLocation: 'bride_preparation',
      groomPreparationLocation: 'groom_preparation',
      ceremonyLocation: 'ceremony',
      receptionVenue: 'reception',
    }

    for (const proposal of proposals) {
      const role = ROLE_BY_FIELD[proposal.weddingDayField]
      if (!role) continue
      const raw = answers[proposal.questionId]
      if (isAnswerEmpty(raw)) continue

      const incoming = normalizeLocationAnswer(raw)
      if (!incoming.name && !incoming.formattedAddress) continue

      const existing = await weddingPlaceService.getByRole(weddingId, role)
      const geo = mergeLocationAnswerWithExisting(incoming, existing)
      if (!geo.formattedAddress?.trim() && !geo.label?.trim()) continue

      try {
        await weddingPlaceService.upsert({
          weddingId,
          role,
          addressText: geo.formattedAddress,
          place: geo,
          resolve: Boolean(
            geo.formattedAddress?.trim() &&
              (geo.latitude == null || geo.longitude == null) &&
              !geo.placeId,
          ),
        })
      } catch (err) {
        devWarnArgs(
          `[prewedding.apply] location upsert failed for ${role}:`,
          err instanceof Error ? err.message : err,
        )
        await weddingPlaceService.upsert({
          weddingId,
          role,
          addressText: geo.formattedAddress,
          place: {
            ...geo,
            placeId: geo.placeId,
            latitude: geo.latitude,
            longitude: geo.longitude,
          },
          resolve: false,
        })
      }
    }
  },
}

// ---------------------------------------------------------------------------
// Public API (no auth — called by couple's browser)
// ---------------------------------------------------------------------------

export const publicPreWeddingService = {
  /** Load questionnaire via token. Returns null if not found. */
  async getByToken(token: string): Promise<PublicPreWeddingForm | null> {
    const { data, error } = await supabase.rpc('public_get_prewedding_questionnaire', {
      p_token: token,
    })
    if (error) throw error
    if (!data) return null

    const row = data as Record<string, unknown>
    return {
      id: row.id as string,
      title: (row.title as string) ?? '',
      introduction: (row.introduction as string) ?? '',
      schema: (row.schema as PreWeddingTemplateSchema) ?? { sections: [] },
      prefill: (row.prefill as Record<string, PrefillValue>) ?? {},
      status: (row.status as WeddingQuestionnaireStatus) ?? 'sent',
      submittedAt: (row.submitted_at as string | null) ?? null,
      savedAnswers: (row.saved_answers as Record<string, PreWeddingAnswerValue>) ?? {},
      answeredRequired: (row.answered_required as number) ?? 0,
      totalRequired: (row.total_required as number) ?? 0,
      studioName: (row.studio_name as string | null) ?? null,
      studioLogoUrl: (row.studio_logo_url as string | null) ?? null,
    }
  },

  /** Autosave answers. Debounce on the client side. */
  async autosave(
    token: string,
    answers: Record<string, PreWeddingAnswerValue>,
    answeredRequired: number,
    totalRequired: number,
  ): Promise<{ ok: boolean; savedAt?: string }> {
    const { data, error } = await supabase.rpc('public_autosave_prewedding_questionnaire', {
      p_token: token,
      p_answers: answers,
      p_answered_req: answeredRequired,
      p_total_req: totalRequired,
    })
    if (error) throw error
    const result = data as Record<string, unknown>
    return {
      ok: Boolean(result?.ok),
      savedAt: (result?.saved_at as string | undefined) ?? undefined,
    }
  },

  /** Final submission. */
  async submit(
    token: string,
    answers: Record<string, PreWeddingAnswerValue>,
    answeredRequired: number,
    totalRequired: number,
  ): Promise<{ ok: boolean; submittedAt?: string; alreadySubmitted?: boolean }> {
    const { data, error } = await supabase.rpc('public_submit_prewedding_questionnaire', {
      p_token: token,
      p_answers: answers,
      p_answered_req: answeredRequired,
      p_total_req: totalRequired,
    })
    if (error) throw error
    const result = data as Record<string, unknown>
    return {
      ok: Boolean(result?.ok),
      submittedAt: (result?.submitted_at as string | undefined) ?? undefined,
      alreadySubmitted: Boolean(result?.already_submitted),
    }
  },
}
