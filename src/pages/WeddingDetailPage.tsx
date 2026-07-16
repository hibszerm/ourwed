import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { IconArrowLeft } from '@/components/icons'
import { getTasks } from '@/mocks/tasks'
import { useWedding } from '@/features/weddings/hooks/useWedding'
import {
  WeddingDetailHero,
  type WeddingHeroAction,
} from '@/features/weddings/components/detail/WeddingDetailHero'
import { WeddingDetailStatus } from '@/features/weddings/components/detail/WeddingDetailStatus'
import { WeddingDetailWorkflow } from '@/features/weddings/components/detail/WeddingDetailWorkflow'
import { WeddingDetailCurrentStage } from '@/features/weddings/components/detail/WeddingDetailCurrentStage'
import { WeddingDetailTimeline } from '@/features/weddings/components/detail/WeddingDetailTimeline'
import { WeddingDetailTasks } from '@/features/weddings/components/detail/WeddingDetailTasks'
import { WeddingDetailQuestionnaires } from '@/features/weddings/components/detail/WeddingDetailQuestionnaires'
import { WeddingDetailFinances } from '@/features/weddings/components/detail/WeddingDetailFinances'
import { WeddingDetailContact } from '@/features/weddings/components/detail/WeddingDetailContact'
import { ScheduleSection } from '@/features/weddings/components/ScheduleSection'
import { EquipmentSection } from '@/features/weddings/components/EquipmentSection'
import { NotesSection } from '@/features/weddings/components/NotesSection'
import { DeliverablesSection } from '@/features/weddings/components/DeliverablesSection'
import { SendQuestionnaireModal } from '@/features/weddings/actions/SendQuestionnaireModal'
import { AddPaymentModal } from '@/features/weddings/actions/AddPaymentModal'
import { AddNoteModal } from '@/features/weddings/actions/AddNoteModal'
import { GenerateContractModal } from '@/features/weddings/actions/GenerateContractModal'
import { isWeddingQuestionnaireComplete } from '@/lib/utils/questionnaires'
import { isSectionVisible } from '@/lib/utils/workflow'
import type { QuestionnaireKind } from '@/lib/api/weddingActionsService'
import styles from './WeddingDetailPage.module.css'

type ModalState =
  | { type: 'questionnaire'; kind: QuestionnaireKind }
  | { type: 'payment'; asDeposit: boolean }
  | { type: 'note' }
  | { type: 'contract' }
  | null

export function WeddingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: wedding, isLoading } = useWedding(id ?? '')
  const [modal, setModal] = useState<ModalState>(null)

  if (isLoading) {
    return (
      <AppLayout>
        <PageContainer>
          <div className={styles.loading}>Ładowanie szczegółów ślubu...</div>
        </PageContainer>
      </AppLayout>
    )
  }

  if (!wedding) {
    return (
      <AppLayout title="Nie znaleziono">
        <PageContainer>
          <p className={styles.notFound}>Ślub o podanym identyfikatorze nie istnieje.</p>
          <Link to="/sluby">
            <Button variant="secondary">Wróć do listy</Button>
          </Link>
        </PageContainer>
      </AppLayout>
    )
  }

  const stage = wedding.workflowStage
  const weddingTasks = getTasks().filter((t) => t.weddingId === wedding.id)

  const showSchedule = isWeddingQuestionnaireComplete(wedding.questionnaires)
  const showEquipment = isSectionVisible(stage, 'equipment')
  const showDeliverables = isSectionVisible(stage, 'deliverables')

  const hasConditional = showSchedule || showEquipment || showDeliverables

  function handleHeroAction(action: WeddingHeroAction) {
    switch (action) {
      case 'send_contract_questionnaire':
        setModal({ type: 'questionnaire', kind: 'contractData' })
        break
      case 'generate_contract':
        setModal({ type: 'contract' })
        break
      case 'add_payment':
        setModal({ type: 'payment', asDeposit: false })
        break
      case 'add_deposit':
        setModal({ type: 'payment', asDeposit: true })
        break
      case 'add_note':
        setModal({ type: 'note' })
        break
    }
  }

  function closeModal() {
    setModal(null)
  }

  return (
    <AppLayout
      action={
        <Link to="/sluby">
          <Button variant="ghost">
            <IconArrowLeft />
            Wróć do listy
          </Button>
        </Link>
      }
    >
      <PageContainer>
        <div className={styles.page}>
          <WeddingDetailHero wedding={wedding} onAction={handleHeroAction} />

          <WeddingDetailStatus wedding={wedding} />

          <WeddingDetailWorkflow currentStage={stage} />

          <WeddingDetailCurrentStage wedding={wedding} />

          <div className={styles.row}>
            <WeddingDetailFinances
              wedding={wedding}
              contractPrice={wedding.price}
              payments={wedding.payments}
              onAddPayment={() => setModal({ type: 'payment', asDeposit: false })}
              onAddDeposit={() => setModal({ type: 'payment', asDeposit: true })}
            />
            <WeddingDetailContact couple={wedding.couple} />
          </div>

          <div className={styles.row}>
            <WeddingDetailQuestionnaires
              questionnaires={wedding.questionnaires}
              onSend={(kind) => setModal({ type: 'questionnaire', kind })}
            />
            <WeddingDetailTasks tasks={weddingTasks} />
          </div>

          {hasConditional && (
            <div className={styles.conditional}>
              {showSchedule && (
                <div className={styles.conditionalItem}>
                  <ScheduleSection events={wedding.schedule} />
                </div>
              )}
              {showEquipment && (
                <div className={styles.conditionalItem}>
                  <EquipmentSection items={wedding.checklist} />
                </div>
              )}
              {showDeliverables && (
                <div className={styles.conditionalItem}>
                  <DeliverablesSection deliverables={wedding.deliverables} />
                </div>
              )}
            </div>
          )}

          <WeddingDetailTimeline entries={wedding.timeline} />

          <div className={styles.notes}>
            <NotesSection
              notes={wedding.notes}
              onAddNote={() => setModal({ type: 'note' })}
            />
          </div>
        </div>
      </PageContainer>

      <SendQuestionnaireModal
        open={modal?.type === 'questionnaire'}
        onClose={closeModal}
        wedding={wedding}
        kind={modal?.type === 'questionnaire' ? modal.kind : 'contractData'}
      />
      <AddPaymentModal
        open={modal?.type === 'payment'}
        onClose={closeModal}
        wedding={wedding}
        asDeposit={modal?.type === 'payment' ? modal.asDeposit : false}
      />
      <AddNoteModal
        open={modal?.type === 'note'}
        onClose={closeModal}
        wedding={wedding}
      />
      <GenerateContractModal
        open={modal?.type === 'contract'}
        onClose={closeModal}
        wedding={wedding}
      />
    </AppLayout>
  )
}
