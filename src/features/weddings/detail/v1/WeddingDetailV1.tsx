import { WeddingDetailHero } from '@/features/weddings/components/detail/WeddingDetailHero'
import { WeddingDetailStatus } from '@/features/weddings/components/detail/WeddingDetailStatus'
import { WeddingDetailWorkflow } from '@/features/weddings/components/detail/WeddingDetailWorkflow'
import { WeddingDetailCurrentStage } from '@/features/weddings/components/detail/WeddingDetailCurrentStage'
import { WeddingDetailTimeline } from '@/features/weddings/components/detail/WeddingDetailTimeline'
import { WeddingDetailTasks } from '@/features/weddings/components/detail/WeddingDetailTasks'
import { WeddingDetailQuestionnaires } from '@/features/weddings/components/detail/WeddingDetailQuestionnaires'
import { WeddingDetailFinances } from '@/features/weddings/components/detail/WeddingDetailFinances'
import { WeddingDetailPackage } from '@/features/weddings/components/detail/WeddingDetailPackage'
import { WeddingCommercialSummaryCard } from '@/features/weddings/components/detail/WeddingCommercialSummary'
import { WeddingContractReadinessPanel } from '@/features/weddings/components/detail/WeddingContractReadiness'
import { WeddingDetailContact } from '@/features/weddings/components/detail/WeddingDetailContact'
import { WeddingDetailTravel } from '@/features/weddings/components/detail/WeddingDetailTravel'
import { WeddingDangerZone } from '@/features/weddings/components/detail/WeddingDangerZone'
import { ScheduleSection } from '@/features/weddings/components/ScheduleSection'
import { EquipmentSection } from '@/features/weddings/components/EquipmentSection'
import { NotesSection } from '@/features/weddings/components/NotesSection'
import { DeliverablesSection } from '@/features/weddings/components/DeliverablesSection'
import type { WeddingDetailSharedProps } from '@/features/weddings/detail/v2/weddingDetailV2Types'
import pageStyles from '@/pages/WeddingDetailPage.module.css'

/** Legacy wedding detail layout — preserved unchanged for V1 mode. */
export function WeddingDetailV1(props: WeddingDetailSharedProps) {
  const {
    wedding,
    payments,
    notes,
    tasks,
    contacts,
    extras,
    editing,
    packageBasePrice,
    onChangeWedding,
    onChangePayments,
    onChangeNotes,
    onChangeTasks,
    onChangeContacts,
    onChangeExtras,
    onChangePackageBasePrice,
    onHeroAction,
    onRequestVerifyLocations,
    onAddNote,
    onArchive,
    onDelete,
    showSchedule,
    showEquipment,
    showDeliverables,
  } = props

  const stage = wedding.workflowStage
  const hasConditional = showSchedule || showEquipment || showDeliverables

  return (
    <div className={pageStyles.page}>
      <WeddingDetailHero
        wedding={wedding}
        onAction={onHeroAction}
        editing={editing}
        onChangeWedding={onChangeWedding}
      />

      <WeddingDetailStatus
        wedding={wedding}
        editing={editing}
        onChangeWedding={onChangeWedding}
      />

      <WeddingDetailWorkflow currentStage={stage} />

      <WeddingDetailCurrentStage wedding={wedding} />

      <WeddingCommercialSummaryCard wedding={wedding} />

      <WeddingContractReadinessPanel wedding={wedding} />

      <div className={pageStyles.row}>
        <WeddingDetailFinances
          wedding={wedding}
          contractPrice={wedding.price}
          payments={payments}
          editing={editing}
          onChangeWedding={onChangeWedding}
          onChangePayments={onChangePayments}
        />
        <WeddingDetailPackage
          wedding={wedding}
          editing={editing}
          extras={extras}
          packageBasePrice={packageBasePrice}
          onChangeWedding={onChangeWedding}
          onChangeExtras={onChangeExtras}
          onChangePackageBasePrice={onChangePackageBasePrice}
        />
        <WeddingDetailContact
          couple={wedding.couple}
          editing={editing}
          contacts={contacts}
          weddingId={wedding.id}
          onChangeCouple={(couple) => onChangeWedding({ couple })}
          onChangeContacts={onChangeContacts}
        />
      </div>

      <WeddingDetailTravel
        weddingId={wedding.id}
        onRequestVerifyLocations={onRequestVerifyLocations}
      />

      <div className={pageStyles.row}>
        <WeddingDetailQuestionnaires
          questionnaires={wedding.questionnaires}
          onSend={
            editing
              ? undefined
              : (kind) => props.onSendQuestionnaire?.(kind)
          }
        />
        <WeddingDetailTasks
          tasks={tasks}
          editing={editing}
          weddingId={wedding.id}
          onChangeTasks={onChangeTasks}
        />
      </div>

      {hasConditional ? (
        <div className={pageStyles.conditional}>
          {showSchedule ? (
            <div className={pageStyles.conditionalItem}>
              <ScheduleSection events={wedding.schedule} />
            </div>
          ) : null}
          {showEquipment ? (
            <div className={pageStyles.conditionalItem}>
              <EquipmentSection items={wedding.checklist} />
            </div>
          ) : null}
          {showDeliverables ? (
            <div className={pageStyles.conditionalItem}>
              <DeliverablesSection deliverables={wedding.deliverables} />
            </div>
          ) : null}
        </div>
      ) : null}

      <WeddingDetailTimeline entries={wedding.timeline} />

      <div className={pageStyles.notes}>
        <NotesSection
          notes={notes}
          editing={editing}
          onChangeNotes={onChangeNotes}
          onAddNote={editing ? undefined : onAddNote}
        />
      </div>

      {!editing ? (
        <WeddingDangerZone onArchive={onArchive} onDelete={onDelete} />
      ) : null}
    </div>
  )
}
