import type { Question } from '@/types/form'

/** Presentation-only grouping by `section_title` — not part of Form Engine. */
export interface FormQuestionSection {
  id: string
  title: string
  description?: string
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
        description: question.description,
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

  // Structural-only headings (no child fields) must not become empty cards.
  return sections.filter((section) => section.questions.length > 0)
}

/** True when the section is the shared Lokalizacje venue card. */
export function isLocationsSection(section: {
  id?: string
  title?: string
}): boolean {
  return (
    section.id === 'sys_heading_wedding_locations' ||
    section.title === 'Lokalizacje' ||
    section.title === 'Miejsca dnia ślubu'
  )
}

/** Fields that should span the full card width in a 2-col grid. */
export function isFullWidthQuestion(question: Question): boolean {
  // Venue locations render in cardBodyStack (always 1-col). Contract address
  // and other .address identity fields stay full-width in mixed grids.
  if (question.type === 'location') {
    return true
  }
  return (
    question.type === 'textarea' ||
    question.type === 'email' ||
    question.type === 'multiselect' ||
    question.id === 'q-notes' ||
    question.id === 'q-package' ||
    question.id === 'q-extras'
  )
}
