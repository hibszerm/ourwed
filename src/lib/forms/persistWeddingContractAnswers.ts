import {
  getLatestSubmittedFormAnswerRecord,
  updateFormAnswerJson,
} from '@/lib/api/forms'
import { FIELD_KEY_TO_CONTRACT_QUESTION_ID } from '@/lib/forms/contractQuestionCatalog'
import { weddingToContractAnswerFields } from '@/lib/forms/weddingCoupleNameFields'
import type { FormAnswerJson } from '@/types/formEngine'
import type { Wedding } from '@/types/wedding'

export { weddingToContractAnswerFields } from '@/lib/forms/weddingCoupleNameFields'

export type StudioContractAnswerPersistPlan =
  | {
      kind: 'updated_existing_submission'
      instanceId: string
      nextAnswerJson: FormAnswerJson
    }
  | { kind: 'skipped_no_submission' }

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

/**
 * Decide whether studio-entered couple fields may patch an existing
 * submitted/approved contract questionnaire. Never manufactures a first
 * submission — photographer data lives on weddings columns.
 */
export function planStudioContractAnswerPersist(input: {
  latest: { instanceId: string; answerJson: FormAnswerJson } | null
  fields: Record<string, string>
}): StudioContractAnswerPersistPlan {
  if (!input.latest?.instanceId) {
    return { kind: 'skipped_no_submission' }
  }
  return {
    kind: 'updated_existing_submission',
    instanceId: input.latest.instanceId,
    nextAnswerJson: mergeFieldsIntoAnswerJson(input.latest.answerJson, input.fields),
  }
}

/**
 * Sync partner / location detail into an already-submitted contract questionnaire.
 * If no submitted/approved instance exists, this is a no-op.
 */
export async function persistWeddingContractAnswerFields(
  wedding: Wedding,
): Promise<StudioContractAnswerPersistPlan> {
  const fields = weddingToContractAnswerFields(wedding)
  const latest = await getLatestSubmittedFormAnswerRecord(wedding.id, 'contract')
  const plan = planStudioContractAnswerPersist({
    latest: latest
      ? { instanceId: latest.instanceId, answerJson: latest.answerJson }
      : null,
    fields,
  })

  if (plan.kind === 'skipped_no_submission') return plan

  await updateFormAnswerJson(plan.instanceId, plan.nextAnswerJson)
  return plan
}
