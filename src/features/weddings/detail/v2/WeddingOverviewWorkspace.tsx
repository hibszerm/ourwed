import { WeddingAssignmentStatus } from '@/features/weddings/detail/v2/WeddingAssignmentStatus'
import { WeddingOverviewCurrentState } from '@/features/weddings/detail/v2/WeddingOverviewCurrentState'
import type { WeddingPlace } from '@/types/travel'
import type { Task, Wedding, WeddingNote } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

interface WeddingOverviewWorkspaceProps {
  wedding: Wedding
  places: WeddingPlace[]
  notes: WeddingNote[]
  tasks: Task[]
  onAddNote?: () => void
  onEditNotes?: () => void
  onEditTasks?: () => void
  onSendQuestionnaire?: () => void
  onOpenPreWeddingTab?: () => void
}

/**
 * Overview answers current status / attention / context.
 * Chronological history lives on the Historia tab.
 */
export function WeddingOverviewWorkspace({
  wedding,
  places,
  notes,
  tasks,
  onAddNote,
  onEditNotes,
  onEditTasks,
  onSendQuestionnaire,
  onOpenPreWeddingTab,
}: WeddingOverviewWorkspaceProps) {
  return (
    <div
      className={styles.overviewMain}
      data-testid="wedding-overview-workspace"
    >
      <WeddingAssignmentStatus wedding={wedding} places={places} />
      <WeddingOverviewCurrentState
        wedding={wedding}
        notes={notes}
        tasks={tasks}
        onAddNote={onAddNote}
        onEditNotes={onEditNotes}
        onEditTasks={onEditTasks}
        onSendQuestionnaire={onSendQuestionnaire}
        onOpenPreWeddingTab={onOpenPreWeddingTab}
      />
    </div>
  )
}
