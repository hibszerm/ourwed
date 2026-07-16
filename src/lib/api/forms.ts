import { noteService } from '@/lib/api/noteService'
import { notificationService } from '@/lib/api/notificationService'
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
}

interface FormInstanceRow {
  id: string
  form_id: string
  wedding_id: string | null
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
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .order('name', { ascending: true })

  throwOnError(error)

  return ((data ?? []) as FormRow[]).map(mapForm)
}

export async function getForm(id: string): Promise<FormDefinition | null> {
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  throwOnError(error)

  if (!data) return null
  return mapForm(data as FormRow)
}

/** Active form definition for a category (highest version wins). */
export async function getActiveFormByCategory(
  category: FormCategory,
): Promise<FormDefinition | null> {
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('category', category)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  throwOnError(error)

  if (!data) return null
  return mapForm(data as FormRow)
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

  const { data, error } = await supabase
    .from('form_instances')
    .insert({
      form_id: formId,
      wedding_id: resolvedWeddingId,
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
  const { data, error } = await supabase
    .from('form_instances')
    .select('*')
    .order('created_at', { ascending: false })

  throwOnError(error)
  return ((data ?? []) as FormInstanceRow[]).map(mapInstance)
}

/** Submitted lead questionnaires awaiting approval (no wedding yet). */
export async function listPendingLeadInstances(): Promise<FormInstance[]> {
  const { data, error } = await supabase
    .from('form_instances')
    .select('*')
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
    .select('*')
    .single()

  throwOnError(error)
  if (!data) {
    throw new Error('Nie można zatwierdzić tej ankiety.')
  }
  return mapInstance(data as FormInstanceRow)
}

/**
 * Resolve a public token.
 * First successful open moves `pending` → `opened` and sets `opened_at`.
 */
export async function getFormInstanceByToken(
  token: string,
): Promise<FormInstance | null> {
  const { data, error } = await supabase
    .from('form_instances')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  throwOnError(error)

  if (!data) return null

  let instance = mapInstance(data as FormInstanceRow)

  if (
    instance.status === 'revoked' ||
    instance.status === 'approved' ||
    instance.status === 'rejected' ||
    instance.status === 'archived'
  ) {
    return instance
  }

  if (isExpired(instance) && instance.status !== 'submitted') {
    if (instance.status !== 'expired') {
      const { data: expiredRow, error: expireError } = await supabase
        .from('form_instances')
        .update({ status: 'expired' })
        .eq('id', instance.id)
        .select('*')
        .single()

      throwOnError(expireError)
      if (expiredRow) {
        instance = mapInstance(expiredRow as FormInstanceRow)
      }
    }
    return instance
  }

  if (instance.status === 'pending') {
    const openedAt = nowIso()
    const { data: openedRow, error: openError } = await supabase
      .from('form_instances')
      .update({
        status: 'opened',
        opened_at: openedAt,
      })
      .eq('id', instance.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle()

    throwOnError(openError)

    if (openedRow) {
      instance = mapInstance(openedRow as FormInstanceRow)
    }
  }

  return instance
}

/**
 * Persist one JSON answers document and mark the instance submitted.
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
    // Lead questionnaire → Pending Wedding queue (submitted + null wedding_id).
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
      // Studio user may be missing in public form context — non-fatal.
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
