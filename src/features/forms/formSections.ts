import type { Question } from '@/types/form'

/** Presentation-only grouping by `section_title` — not part of Form Engine. */
export interface FormQuestionSection {
  id: string
  title: string
  questions: Question[]
}

export function groupQuestionsIntoSections(
  questions: Question[],
): FormQuestionSection[] {
  const sections: FormQuestionSection[] = []
  let current: FormQuestionSection | null = null

  for (const question of questions) {
    if (question.type === 'section_title') {
      current = {
        id: question.id,
        title: question.label,
        questions: [],
      }
      sections.push(current)
      continue
    }

    if (!current) {
      current = {
        id: 'section-default',
        title: '',
        questions: [],
      }
      sections.push(current)
    }

    current.questions.push(question)
  }

  return sections
}

/** Fields that should span the full card width in a 2-col grid. */
export function isFullWidthQuestion(question: Question): boolean {
  return (
    question.type === 'textarea' ||
    question.type === 'location' ||
    question.type === 'email' ||
    question.fieldKey?.endsWith('.address') === true ||
    question.id === 'q-notes' ||
    question.id === 'q-prep' ||
    question.id === 'q-ceremony' ||
    question.id === 'q-reception'
  )
}
