/**
 * Template validation for Questionnaire Library save / prepare.
 */

import {
  PREWEDDING_FIELD_TYPE_LABELS,
  type PreWeddingFieldType,
  type PreWeddingTemplateSchema,
} from '@/types/preweddingQuestionnaire'

const SUPPORTED_TYPES = new Set(
  Object.keys(PREWEDDING_FIELD_TYPE_LABELS) as PreWeddingFieldType[],
)

export interface TemplateValidationInput {
  name: string
  title: string
  schema: PreWeddingTemplateSchema
}

export function validateQuestionnaireTemplate(
  input: TemplateValidationInput,
): string[] {
  const errors: string[] = []
  if (!input.name.trim()) errors.push('Podaj wewnętrzną nazwę ankiety.')
  if (!input.title.trim()) errors.push('Podaj tytuł widoczny dla pary.')

  const questionIds = new Set<string>()
  const sections = input.schema.sections ?? []

  for (const section of sections) {
    if (!section.id) errors.push('Sekcja bez identyfikatora.')
    for (const q of section.questions ?? []) {
      if (!q.id) {
        errors.push('Pytanie bez identyfikatora.')
        continue
      }
      if (questionIds.has(q.id)) {
        errors.push(`Zduplikowane ID pytania: ${q.id}`)
      }
      questionIds.add(q.id)

      if (!SUPPORTED_TYPES.has(q.type)) {
        errors.push(`Nieobsługiwany typ pola: ${q.type}`)
      }

      if (q.type !== 'information' && !q.label.trim()) {
        errors.push('Każde pytanie musi mieć etykietę.')
      }

      if (q.type === 'single_choice' || q.type === 'multiple_choice') {
        const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean)
        if (opts.length < 2) {
          errors.push(
            `Pytanie „${q.label || q.id}” wymaga co najmniej dwóch opcji.`,
          )
        }
      }
    }
  }

  return errors
}
