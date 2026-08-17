import {
  createFormInstance,
  getForms,
  getLatestSubmittedFormAnswerRecord,
  updateFormAnswerJson,
} from '@/lib/api/forms'
import { FIELD_KEY_TO_CONTRACT_QUESTION_ID } from '@/lib/forms/contractQuestionCatalog'
import { weddingToContractAnswerFields } from '@/lib/forms/weddingCoupleNameFields'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import type { FormAnswerJson } from '@/types/formEngine'
import type { Wedding } from '@/types/wedding'

export { weddingToContractAnswerFields } from '@/lib/forms/weddingCoupleNameFields'

/** Studio block-builder question ids — dual-write with catalog q-* ids. */
const FIELD_KEY_TO_SYSTEM_QUESTION_ID: Record<string, string> = {
  'partner1.firstName': 'sys_p1_first',
  'partner1.lastName': 'sys_p1_last',
  'partner1.phone': 'sys_p1_phone',
  'partner1.email': 'sys_p1_email',
  'partner1.address': 'sys_p1_address',
  'partner2.firstName': 'sys_p2_first',
  'partner2.lastName': 'sys_p2_last',
  'partner2.phone': 'sys_p2_phone',
  'partner2.email': 'sys_p2_email',
  'partner2.address': 'sys_p2_address',
}

function mergeFieldsIntoAnswerJson(
  existing: FormAnswerJson | null | undefined,
  fields: Record<string, string>,
): FormAnswerJson {
  const prev =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...existing }
      : {}

  const prevFields =
    prev.fields && typeof prev.fields === 'object' && !Array.isArray(prev.fields)
      ? { ...(prev.fields as Record<string, unknown>) }
      : {}

  const prevValues =
    prev.values && typeof prev.values === 'object' && !Array.isArray(prev.values)
      ? { ...(prev.values as Record<string, unknown>) }
      : {}

  for (const [key, value] of Object.entries(fields)) {
    prevFields[key] = value
    const catalogId = FIELD_KEY_TO_CONTRACT_QUESTION_ID[key]
    if (catalogId) prevValues[catalogId] = value
    const systemId = FIELD_KEY_TO_SYSTEM_QUESTION_ID[key]
    if (systemId) prevValues[systemId] = value
  }

  return {
    ...prev,
    fields: prevFields,
    values: prevValues,
  }
}

async function writeSubmittedAnswers(
  instanceId: string,
  answerJson: FormAnswerJson,
): Promise<void> {
  const { data: existing, error: findError } = await supabase
    .from('form_answers')
    .select('id')
    .eq('instance_id', instanceId)
    .maybeSingle()
  throwOnError(findError)

  if (existing?.id) {
    await updateFormAnswerJson(instanceId, answerJson)
  } else {
    const { error: insertError } = await supabase.from('form_answers').insert({
      instance_id: instanceId,
      answer_json: answerJson,
    })
    throwOnError(insertError)
  }

  const { error: statusError } = await supabase
    .from('form_instances')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', instanceId)
  throwOnError(statusError)
}

/**
 * Persist partner / location detail into contract questionnaire answers —
 * the same source of truth hydrate already uses via mergeFormAnswersIntoWedding.
 */
export async function persistWeddingContractAnswerFields(
  wedding: Wedding,
): Promise<void> {
  const fields = weddingToContractAnswerFields(wedding)
  const latest = await getLatestSubmittedFormAnswerRecord(wedding.id, 'contract')

  if (latest?.instanceId) {
    await updateFormAnswerJson(
      latest.instanceId,
      mergeFieldsIntoAnswerJson(latest.answerJson, fields),
    )
    return
  }

  const forms = await getForms()
  const contractForm = forms.find(
    (f) => f.category === 'contract' && f.isActive,
  )
  if (!contractForm) return

  const instance = await createFormInstance(contractForm.id, wedding.id)
  await writeSubmittedAnswers(
    instance.id,
    mergeFieldsIntoAnswerJson(null, fields),
  )
}
