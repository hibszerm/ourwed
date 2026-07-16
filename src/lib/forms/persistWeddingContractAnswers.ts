import {
  createFormInstance,
  getForms,
  getLatestSubmittedFormAnswerRecord,
  updateFormAnswerJson,
} from '@/lib/api/forms'
import { CONTRACT_QUESTION_ID_TO_FIELD_KEY } from '@/lib/forms/contractQuestionnaireTemplate'
import { splitPersonName } from '@/lib/api/weddings/weddingMappers'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import type { FormAnswerJson } from '@/types/formEngine'
import type { Wedding } from '@/types/wedding'

const FIELD_KEY_TO_QUESTION_ID: Record<string, string> = Object.fromEntries(
  Object.entries(CONTRACT_QUESTION_ID_TO_FIELD_KEY).map(([qid, key]) => [
    key,
    qid,
  ]),
)

/**
 * Build the contract-questionnaire fieldKey map from a Wedding view model.
 * Same shape that mergeFormAnswersIntoWedding reads.
 */
export function weddingToContractAnswerFields(
  wedding: Wedding,
): Record<string, string> {
  const c = wedding.couple
  const brideFirst =
    c.partner1FirstName?.trim() || splitPersonName(c.partner1).first
  const brideLast =
    c.partner1LastName?.trim() || splitPersonName(c.partner1).last
  const groomFirst =
    c.partner2FirstName?.trim() || splitPersonName(c.partner2).first
  const groomLast =
    c.partner2LastName?.trim() || splitPersonName(c.partner2).last

  return {
    'partner1.firstName': brideFirst,
    'partner1.lastName': brideLast,
    'partner1.phone': c.partner1Phone?.trim() || c.phone?.trim() || '',
    'partner1.email': c.partner1Email?.trim() || c.email?.trim() || '',
    'partner1.address': c.partner1Address?.trim() || '',
    'partner1.postalCode': c.partner1PostalCode?.trim() || '',
    'partner1.city': c.partner1City?.trim() || c.city?.trim() || '',
    'partner2.firstName': groomFirst,
    'partner2.lastName': groomLast,
    'partner2.phone': c.partner2Phone?.trim() || '',
    'partner2.email': c.partner2Email?.trim() || '',
    weddingDate: wedding.date || '',
    packageId: wedding.packageId || '',
    preparationLocation: wedding.preparationLocation?.trim() || '',
    ceremonyLocation: wedding.ceremonyLocation?.trim() || '',
    receptionLocation: wedding.receptionLocation?.trim() || '',
  }
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
    const questionId = FIELD_KEY_TO_QUESTION_ID[key]
    if (questionId) prevValues[questionId] = value
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
