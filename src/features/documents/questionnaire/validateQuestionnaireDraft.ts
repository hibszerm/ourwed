/**
 * Pre-save validation for QuestionnaireDraft — strict 1:1 couple rules.
 */

import type { QuestionOption } from '@/types/form'
import { selectEnabledQuestionnaireQuestions } from './buildQuestionnaireFromReviewDraft'
import type { DraftQuestion, QuestionnaireDraft } from './types'

export class QuestionnaireValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuestionnaireValidationError'
  }
}

function isPackageQuestion(q: DraftQuestion): boolean {
  return (
    q.fieldKey === 'packageId' ||
    q.id === 'q-package' ||
    q.registryKey === 'package.name'
  )
}

/**
 * Validate the review draft before building the FormTemplate.
 * Expects `questions` to already be the enabled couple subset
 * (from selectEnabledQuestionnaireQuestions), or a full draft —
 * both are accepted; eligibility is re-checked.
 */
export function validateQuestionnaireDraft(
  draft: QuestionnaireDraft,
  /** Live Studio packages — used only to verify the catalog is non-empty. */
  studioPackages: QuestionOption[] = [],
): void {
  const name = draft.name?.trim()
  if (!name) {
    throw new QuestionnaireValidationError('Podaj nazwę ankiety.')
  }

  const enabledCouple = selectEnabledQuestionnaireQuestions(draft.questions)
  if (enabledCouple.length === 0) {
    throw new QuestionnaireValidationError(
      'Włącz co najmniej jedno pytanie dla pary, aby zapisać ankietę.',
    )
  }

  for (const q of enabledCouple) {
    if (!q.title?.trim()) {
      throw new QuestionnaireValidationError(
        'Każde włączone pytanie musi mieć tytuł.',
      )
    }

    if (!q.type) {
      throw new QuestionnaireValidationError(
        `Pytanie „${q.title}” ma nieprawidłowy typ.`,
      )
    }

    if (isPackageQuestion(q)) {
      if (q.type !== 'select' || q.id !== 'q-package') {
        throw new QuestionnaireValidationError(
          'Pakiet musi używać wbudowanej definicji q-package (Select).',
        )
      }
      if (q.options && q.options.length > 0) {
        throw new QuestionnaireValidationError(
          'Pole Pakiet nie może zawierać zapisanych opcji — pakiety ładują się na żywo ze Studio.',
        )
      }
      if (studioPackages.length === 0) {
        throw new QuestionnaireValidationError(
          'Pytanie „Pakiet” wymaga pakietów w ustawieniach studia. Dodaj pakiet lub wyłącz to pytanie.',
        )
      }
    }
  }
}
