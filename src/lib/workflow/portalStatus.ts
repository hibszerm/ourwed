import { getDaysUntil } from '@/lib/utils/dates'
import { getDepositPaid } from '@/lib/utils/finance'
import type { PortalStatusStep } from '@/types/portal'
import type { Wedding } from '@/types/wedding'

function areAllDeliverablesCompleted(wedding: Wedding): boolean {
  if (wedding.deliverables.length === 0) return false
  return wedding.deliverables.every((d) => d.completed)
}

/**
 * Couple-facing collaboration timeline derived from wedding data.
 * Uses the same signals as the Workflow Engine — never hardcoded stage alone.
 */
export function getPortalStatusSteps(wedding: Wedding): PortalStatusStep[] {
  const contractQ = wedding.questionnaires.contractData.status === 'completed'
  const contractSigned = wedding.contract.status === 'signed'
  const depositPaid = getDepositPaid(wedding.payments) > 0
  const weddingQ = wedding.questionnaires.weddingQuestionnaire.status === 'completed'
  const weddingDone = getDaysUntil(wedding.date) < 0
  const inPost =
    wedding.workflowStage === 'post_production' ||
    wedding.workflowStage === 'completed' ||
    weddingDone
  const materialsDone =
    wedding.workflowStage === 'completed' || areAllDeliverablesCompleted(wedding)

  return [
    {
      id: 'reserved',
      label: 'Termin zarezerwowany',
      completed: true,
      stage: 'reservation',
    },
    {
      id: 'contract_questionnaire',
      label: 'Ankieta do umowy',
      completed: contractQ,
      stage: 'reservation',
    },
    {
      id: 'contract',
      label: 'Umowa',
      completed: contractSigned,
      stage: 'contract',
    },
    {
      id: 'deposit',
      label: 'Zadatek',
      completed: depositPaid,
      stage: 'deposit',
    },
    {
      id: 'wedding_questionnaire',
      label: 'Ankieta ślubna',
      completed: weddingQ,
      stage: 'preparation',
    },
    {
      id: 'wedding_day',
      label: 'Dzień ślubu',
      completed: weddingDone || wedding.workflowStage === 'wedding_day' || inPost,
      stage: 'wedding_day',
    },
    {
      id: 'post_production',
      label: 'Postprodukcja',
      completed: wedding.workflowStage === 'post_production' || materialsDone,
      stage: 'post_production',
    },
    {
      id: 'delivered',
      label: 'Materiały oddane',
      completed: materialsDone,
      stage: 'completed',
    },
  ]
}
