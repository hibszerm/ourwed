import { supabase } from '@/lib/supabase'
import type { PreWeddingTemplateSchema } from '@/types/preweddingQuestionnaire'

export interface CollaborativePreweddingProjection {
  wedding_id: string
  access_version: string
  prewedding_level: 1 | 2
  questionnaire: null | {
    id: string; status: 'awaiting' | 'in_progress' | 'completed'; title: string; introduction: string
    schema: PreWeddingTemplateSchema; response_id: string | null; answers: Record<string, unknown>
    response_revision: string; answered_required: number; total_required: number; submitted_at: string | null
  }
  plan_day: { places: Array<{ id: string; role: string; name: string | null; address: string | null; sort_order: number }>
    times: Array<{ stop_key: string; time: string | null; revision: string }> }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const rev = /^(0|[1-9][0-9]*)$/
function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value)
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === 'string'
}

function validAddressAnswer(value: unknown): boolean {
  if (typeof value === 'string') return true // Legacy plain-address answer.
  if (!object(value)) return false
  if (Object.keys(value).some((key) => ![
    'placeId', 'formattedAddress', 'latitude', 'longitude', 'label', 'provider',
    'name', 'source', 'components',
  ].includes(key))) return false
  if (value.placeId !== undefined && !nullableString(value.placeId)) return false
  if (value.formattedAddress !== undefined && typeof value.formattedAddress !== 'string') return false
  if (value.latitude !== undefined && !(value.latitude === null || (typeof value.latitude === 'number' && Number.isFinite(value.latitude)))) return false
  if (value.longitude !== undefined && !(value.longitude === null || (typeof value.longitude === 'number' && Number.isFinite(value.longitude)))) return false
  if (value.label !== undefined && !nullableString(value.label)) return false
  if (value.provider !== undefined && !nullableString(value.provider)) return false
  if (value.name !== undefined && !nullableString(value.name)) return false
  if (value.source !== undefined && value.source !== 'google_places' && value.source !== 'manual') return false
  if (value.components !== undefined) {
    if (!object(value.components) || Object.keys(value.components).some((key) => !['street', 'streetNumber', 'city', 'postalCode', 'country'].includes(key))
      || Object.values(value.components).some((part) => typeof part !== 'string')) return false
  }
  return ['placeId', 'formattedAddress', 'label', 'name'].some((key) => typeof value[key] === 'string')
}

function validAnswer(question: Record<string, unknown>, answer: unknown): boolean {
  switch (question.type) {
    case 'short_text': case 'long_text': case 'date': case 'time':
      return typeof answer === 'string'
    case 'single_choice': case 'yes_no':
      return typeof answer === 'string'
        && (Array.isArray(question.options) ? question.options.includes(answer) : question.type === 'yes_no' && ['Tak', 'Nie'].includes(answer))
    case 'multiple_choice':
      return Array.isArray(answer) && answer.every((option) => typeof option === 'string'
        && (Array.isArray(question.options) ? question.options.includes(option) : false))
        && new Set(answer).size === answer.length
    case 'acknowledgement':
      return typeof answer === 'boolean'
    case 'address':
      return validAddressAnswer(answer)
    case 'information':
      return false
    default:
      return false
  }
}

export function parseCollaborativePreweddingProjection(value: unknown): CollaborativePreweddingProjection {
  if (!object(value) || !exactKeys(value, ['wedding_id', 'access_version', 'prewedding_level', 'questionnaire', 'plan_day'])) throw new Error('INVALID_PROJECTION')
  if (typeof value.wedding_id !== 'string' || !uuid.test(value.wedding_id)
    || typeof value.access_version !== 'string' || !/^(owner|[1-9][0-9]*)$/.test(value.access_version)
    || (value.prewedding_level !== 1 && value.prewedding_level !== 2) || !object(value.plan_day)
    || !exactKeys(value.plan_day, ['places', 'times']) || !Array.isArray(value.plan_day.places) || !Array.isArray(value.plan_day.times)) throw new Error('INVALID_PROJECTION')
  for (const place of value.plan_day.places) {
    if (!object(place) || !exactKeys(place, ['id', 'role', 'name', 'address', 'sort_order'])
      || typeof place.id !== 'string' || !uuid.test(place.id) || typeof place.role !== 'string'
      || !(place.name === null || typeof place.name === 'string') || !(place.address === null || typeof place.address === 'string')
      || typeof place.sort_order !== 'number' || !Number.isFinite(place.sort_order)) throw new Error('INVALID_PROJECTION')
  }
  for (const time of value.plan_day.times) {
    if (!object(time) || !exactKeys(time, ['stop_key', 'time', 'revision']) || typeof time.stop_key !== 'string'
      || !(time.time === null || (typeof time.time === 'string' && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time.time)))
      || typeof time.revision !== 'string' || !rev.test(time.revision)) throw new Error('INVALID_PROJECTION')
  }
  if (value.questionnaire !== null) {
    const q = value.questionnaire
    if (!object(q) || !exactKeys(q, ['id', 'status', 'title', 'introduction', 'schema', 'response_id', 'answers', 'response_revision', 'answered_required', 'total_required', 'submitted_at'])
      || typeof q.id !== 'string' || !uuid.test(q.id) || !['awaiting', 'in_progress', 'completed'].includes(String(q.status))
      || typeof q.title !== 'string' || typeof q.introduction !== 'string' || !object(q.schema) || !exactKeys(q.schema, ['sections'])
      || !Array.isArray(q.schema.sections) || !(q.response_id === null || (typeof q.response_id === 'string' && uuid.test(q.response_id)))
      || !object(q.answers) || typeof q.response_revision !== 'string' || !rev.test(q.response_revision)
      || !Number.isInteger(q.answered_required) || !Number.isInteger(q.total_required)
      || !(q.submitted_at === null || typeof q.submitted_at === 'string')) throw new Error('INVALID_PROJECTION')
    const questionById = new Map<string, Record<string, unknown>>()
    for (const section of q.schema.sections) {
      if (!object(section) || Object.keys(section).some((key) => !['id', 'title', 'description', 'questions'].includes(key))
        || !('id' in section) || !('title' in section) || !('questions' in section)
        || typeof section.id !== 'string' || typeof section.title !== 'string'
        || !(section.description === undefined || typeof section.description === 'string') || !Array.isArray(section.questions)) throw new Error('INVALID_PROJECTION')
      for (const question of section.questions) {
        if (!object(question) || Object.keys(question).some((key) => !['id', 'label', 'type', 'required', 'options', 'placeholder', 'helpText', 'weddingDayMapping', 'hidden'].includes(key))
          || typeof question.id !== 'string' || !question.id.trim() || typeof question.label !== 'string' || typeof question.required !== 'boolean'
          || !['short_text', 'long_text', 'date', 'time', 'single_choice', 'multiple_choice', 'yes_no', 'address', 'information', 'acknowledgement'].includes(String(question.type))
          || (question.options !== undefined && (!Array.isArray(question.options) || question.options.some((option) => typeof option !== 'string')))
          || (question.placeholder !== undefined && typeof question.placeholder !== 'string')
          || (question.helpText !== undefined && typeof question.helpText !== 'string')
          || (question.weddingDayMapping !== undefined && typeof question.weddingDayMapping !== 'string')
          || (question.hidden !== undefined && typeof question.hidden !== 'boolean')) throw new Error('INVALID_PROJECTION')
        if (questionById.has(question.id)) throw new Error('INVALID_PROJECTION')
        questionById.set(question.id, question)
      }
    }
    if (Object.entries(q.answers).some(([id, answer]) => {
      const question = questionById.get(id)
      return !question || !validAnswer(question, answer)
    })) throw new Error('INVALID_PROJECTION')
  }
  return value as unknown as CollaborativePreweddingProjection
}

export const collaborativePreweddingService = {
  async get(weddingId: string) {
    const { data, error } = await supabase.rpc('get_my_collaborative_prewedding_v3', { p_wedding_id: weddingId })
    if (error) throw error
    return parseCollaborativePreweddingProjection(data)
  },
  async saveAnswer(input: { weddingId: string; questionnaireId: string; questionId: string; value?: unknown; clear?: boolean; accessVersion: string; responseRevision: string }) {
    const { data, error } = await supabase.rpc('update_my_collaborative_prewedding_answer_v3', {
      p_wedding_id: input.weddingId, p_questionnaire_id: input.questionnaireId, p_question_id: input.questionId,
      p_value: input.clear ? null : input.value, p_clear: Boolean(input.clear),
      p_expected_access_version: input.accessVersion, p_expected_response_revision: input.responseRevision,
    })
    if (error) throw error
    if (!object(data) || !object(data.answers) || typeof data.response_revision !== 'string' || !rev.test(data.response_revision)) throw new Error('INVALID_RESPONSE')
    return data as { answers: Record<string, unknown>; response_revision: string }
  },
  async saveOwnerAnswer(input: { weddingId: string; questionnaireId: string; questionId: string; value?: unknown; clear?: boolean; responseRevision: string }) {
    // The SQL command resolves the authenticated owner relationship itself and
    // requires the explicit owner access-version sentinel; no membership is used.
    return this.saveAnswer({ ...input, accessVersion: 'owner' })
  },
  async saveTime(input: { weddingId: string; stopKey: string; time: string | null; accessVersion: string; revision: string }) {
    const { data, error } = await supabase.rpc('update_my_collaborative_prewedding_time_v3', {
      p_wedding_id: input.weddingId, p_stop_key: input.stopKey, p_time: input.time,
      p_clear: input.time === null, p_expected_access_version: input.accessVersion, p_expected_revision: input.revision,
    })
    if (error) throw error
    if (!object(data) || !(data.time === null || typeof data.time === 'string') || typeof data.revision !== 'string' || !rev.test(data.revision)) throw new Error('INVALID_RESPONSE')
    return data as { time: string | null; revision: string }
  },
}
