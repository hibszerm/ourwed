/**
 * U2 — Presentation-only Polish copy for GoalSpec clarifications.
 * Semantic runtime must NEVER parse these strings.
 */

import type { SemanticFieldId } from '../domainQuery/fieldRegistry'
import type { GoalMissingSlot } from './goalSpec'

export type ClarificationQuestionKey = 'measure' | 'entity_kind' | 'date_dimension'

export type ClarificationLabelKey =
  | 'measure.contract_value'
  | 'measure.paid_amount'
  | 'measure.remaining_amount'
  | 'date_dimension.wedding_date'
  | 'entity_kind.generic'

const QUESTION_COPY: Record<ClarificationQuestionKey, string> = {
  measure: 'Którą wartość masz na myśli?',
  entity_kind: 'O który element chodzi?',
  date_dimension: 'Którą datę mam wziąć pod uwagę?',
}

const MEASURE_LABEL_BY_FIELD: Partial<
  Record<SemanticFieldId, ClarificationLabelKey>
> = {
  'wedding.contract_value': 'measure.contract_value',
  'wedding.paid_amount': 'measure.paid_amount',
  'wedding.remaining_amount': 'measure.remaining_amount',
}

const LABEL_COPY: Record<ClarificationLabelKey, string> = {
  'measure.contract_value': 'Wartość umów',
  'measure.paid_amount': 'Już wpłacone',
  'measure.remaining_amount': 'Pozostało do zapłaty',
  'date_dimension.wedding_date': 'Data wesela',
  'entity_kind.generic': 'Wybierz',
}

export function clarificationQuestionCopy(
  key: ClarificationQuestionKey,
): string {
  return QUESTION_COPY[key]
}

export function clarificationLabelCopy(key: ClarificationLabelKey): string {
  return LABEL_COPY[key]
}

export function measureLabelKeyForField(
  id: SemanticFieldId,
): ClarificationLabelKey | null {
  return MEASURE_LABEL_BY_FIELD[id] ?? null
}

export function questionKeyForSlot(
  slot: GoalMissingSlot,
): ClarificationQuestionKey | null {
  if (slot === 'measure') return 'measure'
  if (slot === 'entity_kind') return 'entity_kind'
  if (slot === 'date_dimension') return 'date_dimension'
  return null
}
