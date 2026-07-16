import { Card, CardHeader } from '@/components/ui/Card'
import type { Wedding, WorkflowStage } from '@/types/wedding'
import styles from './WeddingDetailCurrentStage.module.css'

interface WeddingDetailCurrentStageProps {
  wedding: Wedding
}

/**
 * Contextual, human guidance about what is happening with the wedding right now.
 * Presentation-only copy — not photographer production tasks (those live in "Zadania").
 */
const STAGE_GUIDANCE: Record<WorkflowStage, string> = {
  reservation: 'Czekamy na podpisanie umowy.',
  contract: 'Umowa została wysłana i czeka na podpis.',
  deposit: 'Czekamy na wpłatę zadatku, który potwierdzi rezerwację terminu.',
  preparation:
    'Wszystko zostało dopięte. Około trzech tygodni przed ślubem otrzymasz przypomnienie o wysłaniu ankiety przedślubnej.',
  pre_wedding_questionnaire:
    'Czas zebrać od pary wszystkie szczegóły dotyczące dnia ślubu.',
  wedding_day: 'Dziś jest dzień ślubu.',
  post_production: 'Trwa selekcja i montaż materiału ze ślubu.',
  completed: 'Projekt został pomyślnie oddany.',
}

export function WeddingDetailCurrentStage({ wedding }: WeddingDetailCurrentStageProps) {
  const message = STAGE_GUIDANCE[wedding.workflowStage]

  return (
    <Card padding="md">
      <CardHeader title="Aktualny etap" />
      <p className={styles.message}>{message}</p>
    </Card>
  )
}
