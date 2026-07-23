import { noteService } from '@/lib/api/noteService'
import { notificationService } from '@/lib/api/notificationService'
import { requireStudioUserId } from '@/lib/api/ownership'
import { timelineEventService } from '@/lib/api/timelineEventService'
import { supabase } from '@/lib/supabase'
import { nowIso, throwOnError } from '@/lib/supabase/helpers'
import type {
  FormAnswerJson,
  FormAnswerRecord,
  FormCategory,
  FormDefinition,
  FormInstance,
  FormInstanceStatus,
  FormSchema,
} from '@/types/formEngine'

/** Secure random token ≈ 32 URL-safe characters. */
function generateSecureToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, 32)
}

interface FormRow {
  id: string
  name: string
  slug: string
  description: string | null
  category: string
  schema: FormSchema
  version: number
  is_active: boolean
  created_at: string
  user_id?: string | null
}

interface FormInstanceRow {
  id: string
  form_id: string
  wedding_id: string | null
  user_id?: string | null
  token: string
  status: string
  expires_at: string | null
  opened_at: string | null
  submitted_at: string | null
  approved_at: string | null
  rejected_at: string | null
  created_at: string
}

interface FormAnswerRow {
  id: string
  instance_id: string
  answer_json: FormAnswerJson
  created_at: string
}

function mapForm(row: FormRow): FormDefinition {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    category: row.category as FormCategory,
    schema: (row.schema ?? {}) as FormSchema,
    version: row.version,
    isActive: row.is_active,
    createdAt: row.created_at,
  }
}

function mapInstance(row: FormInstanceRow): FormInstance {
  return {
    id: row.id,
    formId: row.form_id,
    weddingId: row.wedding_id,
    token: row.token,
    status: row.status as FormInstanceStatus,
    expiresAt: row.expires_at,
    openedAt: row.opened_at,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at ?? null,
    rejectedAt: row.rejected_at ?? null,
    createdAt: row.created_at,
  }
}

function mapAnswer(row: FormAnswerRow): FormAnswerRecord {
  return {
    id: row.id,
    instanceId: row.instance_id,
    answerJson: (row.answer_json ?? {}) as FormAnswerJson,
    createdAt: row.created_at,
  }
}

function isExpired(instance: FormInstance): boolean {
  if (!instance.expiresAt) return false
  return new Date(instance.expiresAt).getTime() <= Date.now()
}

export interface CreateFormInstanceOptions {
  /** Null = lead questionnaire (no wedding yet). */
  weddingId?: string | null
  expiresAt?: string | null
}

/**
 * Form Engine service — production Supabase layer.
 * Tables: forms, form_instances, form_answers.
 */
export async function getForms(): Promise<FormDefinition[]> {
  const userId = await requireStudioUserId()
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true })

  throwOnError(error)

  return ((data ?? []) as FormRow[]).map(mapForm)
}

/**
 * Active questionnaire templates for "Generuj ankietę":
 * studio-owned first, then global templates (user_id null).
 */
export async function listActiveFormTemplates(
  category: FormCategory = 'contract',
): Promise<FormDefinition[]> {
  const userId = await requireStudioUserId()

  const owned = await supabase
    .from('forms')
    .select('*')
    .eq('category', category)
    .eq('is_active', true)
    .eq('user_id', userId)
    .order('name', { ascending: true })
  throwOnError(owned.error)

  const global = await supabase
    .from('forms')
    .select('*')
    .eq('category', category)
    .eq('is_active', true)
    .is('user_id', null)
    .order('name', { ascending: true })
  throwOnError(global.error)

  const ownedRows = ((owned.data ?? []) as FormRow[]).map(mapForm)
  const globalRows = ((global.data ?? []) as FormRow[]).map(mapForm)
  const ownedSlugs = new Set(ownedRows.map((f) => f.slug))

  return [
    ...ownedRows,
    ...globalRows.filter((f) => !ownedSlugs.has(f.slug)),
  ]
}

export async function getForm(id: string): Promise<FormDefinition | null> {
  const userId = await requireStudioUserId()
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('id', id)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .maybeSingle()

  throwOnError(error)

  if (!data) return null
  return mapForm(data as FormRow)
}

/** Active form definition for a category (prefer studio-owned, then template). */
export async function getActiveFormByCategory(
  category: FormCategory,
): Promise<FormDefinition | null> {
  const userId = await requireStudioUserId()

  const owned = await supabase
    .from('forms')
    .select('*')
    .eq('category', category)
    .eq('is_active', true)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  throwOnError(owned.error)
  if (owned.data) return mapForm(owned.data as FormRow)

  const template = await supabase
    .from('forms')
    .select('*')
    .eq('category', category)
    .eq('is_active', true)
    .is('user_id', null)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  throwOnError(template.error)
  if (!template.data) return null
  return mapForm(template.data as FormRow)
}

export interface CreateFormDefinitionInput {
  name: string
  slug: string
  description?: string | null
  category: FormCategory
  schema: FormSchema
  version?: number
  isActive?: boolean
}

/**
 * Create a studio-owned form definition (questionnaire template).
 * Instances can be issued unlimited times via createFormInstance / generate.
 */
export async function createFormDefinition(
  input: CreateFormDefinitionInput,
): Promise<FormDefinition> {
  const userId = await requireStudioUserId()
  const slug = input.slug.trim().slice(0, 120) || 'questionnaire'
  const version = input.version ?? 1

  const { data, error } = await supabase
    .from('forms')
    .insert({
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      category: input.category,
      schema: input.schema,
      version,
      is_active: input.isActive ?? true,
      user_id: userId,
    })
    .select('*')
    .single()

  throwOnError(error)
  if (!data) {
    throw new Error('Nie udało się utworzyć formularza.')
  }
  return mapForm(data as FormRow)
}

export interface UpdateFormDefinitionInput {
  name?: string
  description?: string | null
  isActive?: boolean
  schema?: FormSchema
  category?: FormCategory
}

/** Update studio-owned questionnaire template metadata / schema. */
export async function updateFormDefinition(
  id: string,
  input: UpdateFormDefinitionInput,
): Promise<FormDefinition> {
  const userId = await requireStudioUserId()
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null
  }
  if (input.isActive !== undefined) patch.is_active = input.isActive
  if (input.schema !== undefined) patch.schema = input.schema
  if (input.category !== undefined) patch.category = input.category

  const { data, error } = await supabase
    .from('forms')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single()

  throwOnError(error)
  if (!data) throw new Error('Nie udało się zaktualizować szablonu.')
  return mapForm(data as FormRow)
}

/** Soft-archive: template stays for history; answers are untouched. */
export async function archiveFormDefinition(id: string): Promise<FormDefinition> {
  return updateFormDefinition(id, { isActive: false })
}

export async function restoreFormDefinition(id: string): Promise<FormDefinition> {
  return updateFormDefinition(id, { isActive: true })
}

/** Duplicate a studio-owned template as a new active form. */
export async function duplicateFormDefinition(id: string): Promise<FormDefinition> {
  const userId = await requireStudioUserId()
  const source = await getForm(id)
  if (!source) throw new Error('Szablon nie istnieje.')
  if (source.id !== id) throw new Error('Szablon nie istnieje.')

  const { data: owned, error: ownedError } = await supabase
    .from('forms')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  throwOnError(ownedError)
  if (!owned) {
    throw new Error('Można duplikować tylko własne szablony.')
  }

  const baseSlug = `${source.slug}-kopia`.slice(0, 100)
  const stamp = Date.now().toString(36)
  return createFormDefinition({
    name: `${source.name} (kopia)`,
    slug: `${baseSlug}-${stamp}`,
    description: source.description,
    category: source.category,
    schema: source.schema,
    version: 1,
    isActive: true,
  })
}

async function countFormInstances(formId: string): Promise<number> {
  const { count, error } = await supabase
    .from('form_instances')
    .select('id', { count: 'exact', head: true })
    .eq('form_id', formId)
  throwOnError(error)
  return count ?? 0
}

/**
 * Hard-delete a studio-owned template.
 * Never deletes form_instances or form_answers — blocked if any instances exist.
 */
export async function deleteFormDefinition(id: string): Promise<void> {
  const userId = await requireStudioUserId()

  const { data: owned, error: ownedError } = await supabase
    .from('forms')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  throwOnError(ownedError)
  if (!owned) throw new Error('Szablon nie istnieje lub nie należy do firmy.')

  const instanceCount = await countFormInstances(id)
  if (instanceCount > 0) {
    throw new Error(
      'Ten szablon ma powiązane ankiety. Zarchiwizuj go zamiast usuwać — odpowiedzi klientów pozostaną bezpieczne.',
    )
  }

  await supabase
    .from('packages')
    .update({ questionnaire_form_id: null })
    .eq('user_id', userId)
    .eq('questionnaire_form_id', id)

  await supabase
    .from('document_templates')
    .update({ questionnaire_form_id: null })
    .eq('user_id', userId)
    .eq('questionnaire_form_id', id)

  const { error } = await supabase
    .from('forms')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  throwOnError(error)
}

export async function bulkArchiveFormDefinitions(ids: string[]): Promise<void> {
  for (const id of ids) {
    await archiveFormDefinition(id)
  }
}

export async function bulkDeleteFormDefinitions(ids: string[]): Promise<void> {
  for (const id of ids) {
    await deleteFormDefinition(id)
  }
}

/**
 * Issue a new public form link.
 * Always generates a fresh token — never reuses an old one.
 * Pass weddingId for wedding-scoped questionnaires; omit/null for lead intake.
 */
export async function createFormInstance(
  formId: string,
  weddingId?: string | null,
  options?: CreateFormInstanceOptions,
): Promise<FormInstance> {
  const form = await getForm(formId)
  if (!form) {
    throw new Error('Formularz nie istnieje.')
  }
  if (!form.isActive) {
    throw new Error('Formularz jest nieaktywny.')
  }

  const token = generateSecureToken()
  const resolvedWeddingId =
    options?.weddingId !== undefined ? options.weddingId : (weddingId ?? null)
  const userId = await requireStudioUserId()

  const { data, error } = await supabase
    .from('form_instances')
    .insert({
      form_id: formId,
      wedding_id: resolvedWeddingId,
      user_id: userId,
      token,
      status: 'pending',
      expires_at: options?.expiresAt ?? null,
      opened_at: null,
      submitted_at: null,
    })
    .select('*')
    .single()

  throwOnError(error)

  if (!data) {
    throw new Error('Nie udało się utworzyć instancji formularza.')
  }

  return mapInstance(data as FormInstanceRow)
}

export async function getFormInstanceById(
  id: string,
): Promise<FormInstance | null> {
  const { data, error } = await supabase
    .from('form_instances')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  throwOnError(error)
  if (!data) return null
  return mapInstance(data as FormInstanceRow)
}

/** List all instances newest-first (CRM Questionnaires module). */
export async function listFormInstances(): Promise<FormInstance[]> {
  const userId = await requireStudioUserId()
  const { data, error } = await supabase
    .from('form_instances')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  throwOnError(error)
  return ((data ?? []) as FormInstanceRow[]).map(mapInstance)
}

/** Submitted lead questionnaires awaiting approval (no wedding yet). */
export async function listPendingLeadInstances(): Promise<FormInstance[]> {
  const userId = await requireStudioUserId()
  const { data, error } = await supabase
    .from('form_instances')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'submitted')
    .is('wedding_id', null)
    .order('submitted_at', { ascending: false })

  throwOnError(error)
  return ((data ?? []) as FormInstanceRow[]).map(mapInstance)
}

export async function getFormAnswersByInstanceId(
  instanceId: string,
): Promise<FormAnswerRecord | null> {
  const { data, error } = await supabase
    .from('form_answers')
    .select('*')
    .eq('instance_id', instanceId)
    .maybeSingle()

  throwOnError(error)
  if (!data) return null
  return mapAnswer(data as FormAnswerRow)
}

/** Batch-load answers for CRM search/list enrichment. */
export async function listFormAnswersByInstanceIds(
  instanceIds: string[],
): Promise<Map<string, FormAnswerRecord>> {
  const map = new Map<string, FormAnswerRecord>()
  if (instanceIds.length === 0) return map

  const { data, error } = await supabase
    .from('form_answers')
    .select('*')
    .in('instance_id', instanceIds)

  throwOnError(error)

  for (const row of (data ?? []) as FormAnswerRow[]) {
    map.set(row.instance_id, mapAnswer(row))
  }
  return map
}

export async function revokeFormInstance(id: string): Promise<FormInstance> {
  const { data, error } = await supabase
    .from('form_instances')
    .update({ status: 'revoked' })
    .eq('id', id)
    .in('status', ['pending', 'opened'])
    .select('*')
    .single()

  throwOnError(error)
  if (!data) {
    throw new Error('Nie można unieważnić tej ankiety.')
  }
  return mapInstance(data as FormInstanceRow)
}

export async function deleteFormInstance(id: string): Promise<void> {
  const { error } = await supabase.from('form_instances').delete().eq('id', id)
  throwOnError(error)
}

export async function archiveFormInstance(id: string): Promise<FormInstance> {
  const { data, error } = await supabase
    .from('form_instances')
    .update({ status: 'archived' })
    .eq('id', id)
    .eq('status', 'rejected')
    .select('*')
    .single()

  throwOnError(error)
  if (!data) {
    throw new Error('Nie można zarchiwizować tej ankiety.')
  }
  return mapInstance(data as FormInstanceRow)
}

export async function rejectFormInstance(id: string): Promise<FormInstance> {
  const { data, error } = await supabase
    .from('form_instances')
    .update({
      status: 'rejected',
      rejected_at: nowIso(),
    })
    .eq('id', id)
    .eq('status', 'submitted')
    .is('wedding_id', null)
    .select('*')
    .single()

  throwOnError(error)
  if (!data) {
    throw new Error('Nie można odrzucić tej ankiety.')
  }
  return mapInstance(data as FormInstanceRow)
}

export async function markFormInstanceApproved(
  id: string,
  weddingId: string,
): Promise<FormInstance> {
  const { data, error } = await supabase
    .from('form_instances')
    .update({
      status: 'approved',
      wedding_id: weddingId,
      approved_at: nowIso(),
    })
    .eq('id', id)
    .eq('status', 'submitted')
    .is('wedding_id', null)
    .select('*')
    .single()

  if (error?.code === 'PGRST116') {
    throw new Error('Nie można zatwierdzić tej ankiety.')
  }
  throwOnError(error)
  if (!data) {
    throw new Error('Nie można zatwierdzić tej ankiety.')
  }
  return mapInstance(data as FormInstanceRow)
}

/**
 * Atomically claim a submitted lead before creating a wedding.
 * Prevents double-approve races that create orphan weddings.
 * Sets status=approved with wedding_id still null; caller attaches wedding_id next.
 */
export async function claimSubmittedLeadInstance(
  id: string,
): Promise<FormInstance> {
  const { data, error } = await supabase
    .from('form_instances')
    .update({
      status: 'approved',
      approved_at: nowIso(),
    })
    .eq('id', id)
    .eq('status', 'submitted')
    .is('wedding_id', null)
    .select('*')
    .single()

  if (error?.code === 'PGRST116') {
    throw new Error('Nie można zatwierdzić tej ankiety.')
  }
  throwOnError(error)
  if (!data) {
    throw new Error('Nie można zatwierdzić tej ankiety.')
  }
  return mapInstance(data as FormInstanceRow)
}

/** Attach the newly created wedding to an already-claimed lead instance. */
export async function attachWeddingToApprovedInstance(
  id: string,
  weddingId: string,
): Promise<FormInstance> {
  const { data, error } = await supabase
    .from('form_instances')
    .update({ wedding_id: weddingId })
    .eq('id', id)
    .eq('status', 'approved')
    .is('wedding_id', null)
    .select('*')
    .single()

  if (error?.code === 'PGRST116') {
    throw new Error('Nie można zatwierdzić tej ankiety.')
  }
  throwOnError(error)
  if (!data) {
    throw new Error('Nie można zatwierdzić tej ankiety.')
  }
  return mapInstance(data as FormInstanceRow)
}

/** Roll back a claim if wedding creation fails after claimSubmittedLeadInstance. */
export async function releaseClaimedLeadInstance(id: string): Promise<void> {
  const { error } = await supabase
    .from('form_instances')
    .update({
      status: 'submitted',
      approved_at: null,
    })
    .eq('id', id)
    .eq('status', 'approved')
    .is('wedding_id', null)

  throwOnError(error)
}

/**
 * Resolve a public token via SECURITY DEFINER RPC (works for anon clients).
 * First successful open moves `pending` → `opened` and sets `opened_at`.
 */
export async function getFormInstanceByToken(
  token: string,
): Promise<FormInstance | null> {
  const { data, error } = await supabase.rpc('public_get_form_by_token', {
    p_token: token,
  })
  throwOnError(error)
  if (!data || typeof data !== 'object') return null

  const payload = data as { instance?: FormInstanceRow; form?: FormRow }
  if (!payload.instance) return null
  return mapInstance(payload.instance)
}

/** Public token payload including form definition (for /form/:token page). */
export async function getPublicFormByToken(token: string): Promise<{
  instance: FormInstance
  form: FormDefinition
  packages: Array<{ id: string; name: string }>
} | null> {
  const { data, error } = await supabase.rpc('public_get_form_by_token', {
    p_token: token,
  })
  throwOnError(error)
  if (!data || typeof data !== 'object') return null

  const payload = data as {
    instance?: FormInstanceRow
    form?: FormRow
    packages?: unknown
  }
  if (!payload.instance || !payload.form) return null

  const rawPackages = payload.packages
  const packages: Array<{ id: string; name: string }> = []
  let list: unknown = rawPackages
  if (typeof rawPackages === 'string') {
    try {
      list = JSON.parse(rawPackages) as unknown
    } catch {
      list = null
    }
  }
  if (Array.isArray(list)) {
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const id = String(row.id ?? row.value ?? '').trim()
      const name = String(row.name ?? row.label ?? '').trim()
      if (id && name) packages.push({ id, name })
    }
  }

  if (import.meta.env.DEV) {
    console.info('[getPublicFormByToken] packages', {
      packagesLength: packages.length,
      packageIds: packages.map((p) => p.id),
      packageNames: packages.map((p) => p.name),
      rawType: Array.isArray(rawPackages) ? 'array' : typeof rawPackages,
    })
  }

  return {
    instance: mapInstance(payload.instance),
    form: mapForm(payload.form),
    packages,
  }
}

/**
 * Persist answers for a public token (anon-safe RPC).
 */
export async function submitFormByToken(
  token: string,
  answerJson: FormAnswerJson,
): Promise<FormAnswerRecord> {
  const { data, error } = await supabase.rpc('public_submit_form_by_token', {
    p_token: token,
    p_answer_json: answerJson,
  })

  if (error) {
    const message = error.message || ''
    if (message.includes('ALREADY_SUBMITTED')) {
      throw new Error('Formularz został już wysłany.')
    }
    if (message.includes('LINK_REVOKED')) {
      throw new Error('Link do formularza został unieważniony.')
    }
    if (message.includes('LINK_EXPIRED')) {
      throw new Error('Link do formularza wygasł.')
    }
    if (message.includes('INVALID_TOKEN')) {
      throw new Error('Link do formularza jest nieprawidłowy.')
    }
    throwOnError(error)
  }

  const payload = data as { answer?: FormAnswerRow } | null
  if (!payload?.answer) {
    throw new Error('Nie udało się zapisać odpowiedzi.')
  }
  return mapAnswer(payload.answer)
}

/**
 * Persist one JSON answers document and mark the instance submitted.
 * Studio-authenticated path (RLS). Prefer submitFormByToken for public links.
 */
export async function submitForm(
  instanceId: string,
  answerJson: FormAnswerJson,
): Promise<FormAnswerRecord> {
  const { data: instanceRow, error: instanceError } = await supabase
    .from('form_instances')
    .select('*')
    .eq('id', instanceId)
    .maybeSingle()

  throwOnError(instanceError)

  if (!instanceRow) {
    throw new Error('Instancja formularza nie istnieje.')
  }

  const instance = mapInstance(instanceRow as FormInstanceRow)

  if (instance.status === 'submitted' || instance.status === 'approved') {
    throw new Error('Formularz został już wysłany.')
  }
  if (instance.status === 'revoked' || instance.status === 'rejected') {
    throw new Error('Link do formularza został unieważniony.')
  }
  if (instance.status === 'expired' || isExpired(instance)) {
    throw new Error('Link do formularza wygasł.')
  }

  // Public / unauthenticated clients must use the token RPC.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('Link do formularza jest nieprawidłowy.')
  }

  const submittedAt = nowIso()

  const { data: answerRow, error: answerError } = await supabase
    .from('form_answers')
    .insert({
      instance_id: instanceId,
      answer_json: answerJson,
    })
    .select('*')
    .single()

  throwOnError(answerError)

  if (!answerRow) {
    throw new Error('Nie udało się zapisać odpowiedzi.')
  }

  const { error: updateError } = await supabase
    .from('form_instances')
    .update({
      status: 'submitted',
      submitted_at: submittedAt,
      opened_at: instance.openedAt ?? submittedAt,
    })
    .eq('id', instanceId)

  throwOnError(updateError)

  const fields =
    answerJson &&
    typeof answerJson === 'object' &&
    'fields' in answerJson &&
    answerJson.fields &&
    typeof answerJson.fields === 'object'
      ? (answerJson.fields as Record<string, unknown>)
      : null

  const additionalNotes =
    fields && typeof fields.additionalNotes === 'string'
      ? fields.additionalNotes.trim()
      : ''

  const weddingId = instance.weddingId
  const submittedDay = submittedAt.slice(0, 10)

  if (weddingId) {
    await timelineEventService.create({
      weddingId,
      type: 'questionnaire_completed',
      title: 'Wypełniono ankietę.',
      description: 'Formularz został przesłany przez parę.',
      systemGenerated: true,
      date: submittedDay,
    })

    if (additionalNotes) {
      await noteService.create({
        weddingId,
        content: additionalNotes,
        author: 'Para',
      })
    }
  } else {
    try {
      await notificationService.create({
        title: 'Nowa ankieta złożona',
        message: 'Para wypełniła ankietę. Sprawdź oczekujące zgłoszenia.',
        type: 'success',
        entityType: 'form_instance',
        entityId: instanceId,
        link: `/ankiety/${instanceId}`,
      })
    } catch {
      // non-fatal
    }
  }

  return mapAnswer(answerRow as FormAnswerRow)
}

/**
 * Latest submitted Form Engine answers for a wedding + form category.
 */
export async function getLatestSubmittedFormAnswers(
  weddingId: string,
  category: FormCategory,
): Promise<FormAnswerJson | null> {
  const result = await getLatestSubmittedFormAnswerRecord(weddingId, category)
  return result?.answerJson ?? null
}

/** Same as getLatestSubmittedFormAnswers, plus submission timestamp and instance id. */
export async function getLatestSubmittedFormAnswerRecord(
  weddingId: string,
  category: FormCategory,
): Promise<{
  answerJson: FormAnswerJson
  submittedAt: string | null
  instanceId: string
} | null> {
  const { data: formRows, error: formsError } = await supabase
    .from('forms')
    .select('id')
    .eq('category', category)

  throwOnError(formsError)

  const formIds = ((formRows ?? []) as { id: string }[]).map((row) => row.id)
  if (formIds.length === 0) return null

  const { data: instance, error: instanceError } = await supabase
    .from('form_instances')
    .select('id, submitted_at')
    .eq('wedding_id', weddingId)
    .in('status', ['submitted', 'approved'])
    .in('form_id', formIds)
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  throwOnError(instanceError)

  if (!instance?.id) return null

  const { data: answerRow, error: answerError } = await supabase
    .from('form_answers')
    .select('answer_json')
    .eq('instance_id', instance.id)
    .maybeSingle()

  throwOnError(answerError)

  const answerJson = (answerRow as { answer_json?: FormAnswerJson } | null)
    ?.answer_json
  if (!answerJson || typeof answerJson !== 'object') {
    return null
  }

  return {
    answerJson,
    submittedAt: (instance as { submitted_at: string | null }).submitted_at,
    instanceId: instance.id,
  }
}

/** Update answer_json for an existing form_answers row (studio edit session). */
export async function updateFormAnswerJson(
  instanceId: string,
  answerJson: FormAnswerJson,
): Promise<void> {
  const { error } = await supabase
    .from('form_answers')
    .update({ answer_json: answerJson })
    .eq('instance_id', instanceId)

  throwOnError(error)
}
