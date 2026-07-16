import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconTasks } from '@/components/icons'
import type { WorkflowStage } from '@/types/wedding'
import styles from './QuestionnairesSection.module.css'

interface QuestionnairesSectionProps {
  stage: WorkflowStage
}

const titles: Partial<Record<WorkflowStage, string>> = {
  contract: 'Ankieta kontraktowa',
  preparation: 'Ankieta ślubna',
}

export function QuestionnairesSection({ stage }: QuestionnairesSectionProps) {
  const title = titles[stage] ?? 'Ankiety'

  return (
    <Card>
      <CardHeader title={title} subtitle="Oczekuje na wypełnienie" />
      <div className={styles.body}>
        <EmptyState
          icon={<IconTasks />}
          title="Ankieta nie została jeszcze wysłana"
          description="Wyślij ankietę do pary, aby zebrać dane potrzebne do dalszej pracy."
        />
      </div>
    </Card>
  )
}
