/**
 * Pre-save validation for QuestionnaireDraft.
 */

import type { QuestionOption } from '@/types/form'
import type { DraftQuestion, QuestionnaireDraft } from './types'

export class QuestionnaireValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuestionnaireValidationError'
  }
}

export function validateQuestionnaireDraft(
  draft: QuestionnaireDraft,
  studioPackages: QuestionOption[] = [],
): void {
  const name = draft.name?.trim()
  if (!name) {
    throw new QuestionnaireValidationError('Podaj nazwę ankiety.')
  }

  const enabled = draft.questions.filter((q) => q.enabled)
  if (enabled.length === 0) {
    throw new QuestionnaireValidationError(
      'Włącz co najmniej jedno pytanie, aby zapisać ankietę.',
    )
  }

  const fieldKeys = new Map<string, DraftQuestion>()
  for (const q of enabled) {
    if (!q.title?.trim()) {
      throw new QuestionnaireValidationError(
        'Każde włączone pytanie musi mieć tytuł.',
      )
    }

    if (q.required && !q.type) {
      throw new QuestionnaireValidationError(
        `Pytanie „${q.title}” ma nieprawidłowy typ.`,
      )
    }

    if (q.fieldKey) {
      const prev = fieldKeys.get(q.fieldKey)
      if (prev) {
        throw new QuestionnaireValidationError(
          `Duplikat mapowania: „${prev.title}” i „${q.title}” wskazują na to samo pole.`,
        )
      }
      fieldKeys.set(q.fieldKey, q)
    }

    if (q.fieldKey === 'packageId' || q.id === 'q-package') {
      const options =
        (q.options && q.options.length > 0 ? q.options : null) ??
        studioPackages
      if (options.length === 0) {
        throw new QuestionnaireValidationError(
          'Pytanie „Pakiet” wymaga pakietów w ustawieniach studia. Dodaj pakiet lub wyłącz to pytanie.',
        )
      }
      if (q.type !== 'select' || q.id !== 'q-package') {
        throw new QuestionnaireValidationError(
          'Pakiet musi używać wbudowanej definicji q-package (Select).',
        )
      }
    }
  }
}
