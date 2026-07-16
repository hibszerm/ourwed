import type {
  AnswerValue,
  FormTemplate,
  Question,
  QuestionAnswer,
  QuestionType,
} from '@/types/form'

const DISPLAY_TYPES: QuestionType[] = ['section_title', 'paragraph']

export function isDisplayQuestion(question: Question): boolean {
  return DISPLAY_TYPES.includes(question.type)
}

export function getInputQuestions(template: FormTemplate): Question[] {
  return template.questions.filter((q) => !isDisplayQuestion(q))
}

export function getTemplateById(
  templates: FormTemplate[],
  id: string,
): FormTemplate | undefined {
  return templates.find((t) => t.id === id)
}

/** Resolve nested field keys like partner1.firstName from answers by fieldKey. */
export function answersToFieldMap(
  template: FormTemplate,
  answers: QuestionAnswer[],
): Record<string, AnswerValue> {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a.value]))
  const map: Record<string, AnswerValue> = {}

  for (const q of template.questions) {
    if (!q.fieldKey) continue
    const value = byQuestion.get(q.id)
    if (value !== undefined) {
      map[q.fieldKey] = value
    }
  }

  return map
}

export function getFieldString(
  fields: Record<string, AnswerValue>,
  key: string,
  fallback = '',
): string {
  const value = fields[key]
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'true' : ''
  if (Array.isArray(value)) return value.join(', ')
  return fallback
}

export function validateAnswers(
  template: FormTemplate,
  values: Record<string, AnswerValue>,
): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const q of getInputQuestions(template)) {
    if (!q.required) continue
    const value = values[q.id]
    const empty =
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)

    if (empty) {
      errors[q.id] = 'Wymagane'
      continue
    }

    if (q.type === 'email' && typeof value === 'string') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors[q.id] = 'Podaj poprawny e-mail'
      }
    }
  }

  return errors
}

export function valuesToAnswers(
  values: Record<string, AnswerValue>,
): QuestionAnswer[] {
  return Object.entries(values).map(([questionId, value]) => ({
    questionId,
    value,
  }))
}

/**
 * Form Engine — pure helpers, no I/O.
 * Extend question types here; UI and services stay thin.
 */
export const formEngine = {
  isDisplayQuestion,
  getInputQuestions,
  getTemplateById,
  answersToFieldMap,
  getFieldString,
  validateAnswers,
  valuesToAnswers,
}
