import type { QuestionnaireItem, WeddingQuestionnaires } from '@/types/wedding'

export const QUESTIONNAIRE_STATUS_LABELS = {
  not_sent: 'Nie wysłano',
  sent: 'Wysłano',
  completed: 'Wypełniona',
} as const

export function isQuestionnaireCompleted(item: QuestionnaireItem): boolean {
  return item.status === 'completed'
}

export function isWeddingQuestionnaireComplete(questionnaires: WeddingQuestionnaires): boolean {
  return questionnaires.weddingQuestionnaire.status === 'completed'
}

export function getQuestionnaireStatusDate(item: QuestionnaireItem): string | undefined {
  if (item.status === 'completed') return item.completedAt
  if (item.status === 'sent') return item.sentAt
  return undefined
}

export function createDefaultQuestionnaires(): WeddingQuestionnaires {
  return {
    contractData: { status: 'not_sent' },
    weddingQuestionnaire: { status: 'not_sent' },
  }
}
