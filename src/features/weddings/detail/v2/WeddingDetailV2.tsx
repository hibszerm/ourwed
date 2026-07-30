import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { WeddingActivityWorkspace } from '@/features/weddings/detail/v2/WeddingActivityWorkspace'
import { WeddingPreWeddingQuestionnaireWorkspace } from '@/features/weddings/detail/v2/WeddingPreWeddingQuestionnaireWorkspace'
import { WeddingContextSidebar } from '@/features/weddings/detail/v2/WeddingContextSidebar'
import { WeddingContractFinanceWorkspace } from '@/features/weddings/detail/v2/WeddingContractFinanceWorkspace'
import { WeddingDayWorkspace } from '@/features/weddings/detail/v2/WeddingDayWorkspace'
import { WeddingManagementSection } from '@/features/weddings/detail/v2/WeddingManagementSection'
import { WeddingOverviewBand } from '@/features/weddings/detail/v2/WeddingOverviewBand'
import { WeddingOverviewWorkspace } from '@/features/weddings/detail/v2/WeddingOverviewWorkspace'
import { WeddingWorkspaceEditSurface } from '@/features/weddings/detail/v2/WeddingWorkspaceEditSurface'
import { WeddingWorkspaceHeader } from '@/features/weddings/detail/v2/WeddingWorkspaceHeader'
import { WeddingWorkspaceTabs } from '@/features/weddings/detail/v2/WeddingWorkspaceTabs'
import type {
  WeddingDetailSharedProps,
  WeddingWorkspaceTab,
} from '@/features/weddings/detail/v2/weddingDetailV2Types'
import {
  buildActivityFeed,
  getOverviewBand,
  parseWorkspaceTab,
} from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { WEDDING_DETAIL_V2_TAB_KEY } from '@/features/weddings/detail/v2/weddingDetailV2Types'
import styles from './WeddingDetailV2.module.css'

function readTab(): WeddingWorkspaceTab {
  try {
    return parseWorkspaceTab(localStorage.getItem(WEDDING_DETAIL_V2_TAB_KEY))
  } catch {
    return 'overview'
  }
}

function writeTab(tab: WeddingWorkspaceTab) {
  try {
    localStorage.setItem(WEDDING_DETAIL_V2_TAB_KEY, tab)
  } catch {
    // ignore
  }
}

/** Premium Wedding Workspace — tabbed operational surface (not a card grid). */
export function WeddingDetailV2(props: WeddingDetailSharedProps) {
  const {
    wedding,
    payments,
    notes,
    tasks,
    contacts,
    extras,
    editing,
    editorSection = null,
    onHeroAction,
    onRequestVerifyLocations,
    onEditSection,
    onSaveEdit,
    onCancelEdit,
    saving,
    onAddNote,
    onSendQuestionnaire,
    onArchive,
    onDelete,
  } = props

  const userId = useStudioAuthId()
  const queryClient = useQueryClient()
  const [tab, setTabState] = useState<WeddingWorkspaceTab>(readTab)
  const [packageFocus, setPackageFocus] = useState(false)

  const setTab = useCallback((next: WeddingWorkspaceTab) => {
    setTabState(next)
    writeTab(next)
    if (next !== 'contract_finance') setPackageFocus(false)
  }, [])

  const { data: places = [] } = useQuery({
    queryKey: ['wedding-places', userId, wedding.id],
    queryFn: () => weddingPlaceService.listByWeddingId(wedding.id),
    enabled: Boolean(userId && wedding.id),
  })

  const band = getOverviewBand(wedding)
  const feed = buildActivityFeed({
    timeline: wedding.timeline,
    notes,
    tasks,
    wedding,
  })

  return (
    <div className={styles.workspace} data-testid="wedding-detail-v2">
      <WeddingWorkspaceHeader wedding={wedding} places={places} />

      <WeddingOverviewBand {...band} />

      <WeddingWorkspaceTabs value={tab} onChange={setTab} />

      <div className={styles.workspaceBody}>
        <div
          className={styles.workspaceMain}
          role="tabpanel"
          id={`ws-panel-${tab}`}
          aria-labelledby={`ws-tab-${tab}`}
        >
          {tab === 'overview' ? (
            <div className={styles.overviewLayout}>
              <WeddingOverviewWorkspace
                wedding={wedding}
                places={places}
                notes={notes}
                tasks={tasks}
                onAddNote={onAddNote}
                onEditNotes={() => onEditSection?.('notes')}
                onEditTasks={() => onEditSection?.('tasks')}
                onSendQuestionnaire={
                  onSendQuestionnaire
                    ? () => onSendQuestionnaire('contractData')
                    : undefined
                }
                onOpenPreWeddingTab={() => setTab('pre_wedding_questionnaire')}
              />
              <WeddingContextSidebar
                wedding={wedding}
                places={places}
                contacts={contacts}
                onEditLocations={() => {
                  if (onEditSection) onEditSection('locations')
                  else onRequestVerifyLocations()
                }}
                onEditContacts={() => onEditSection?.('contacts')}
                onEditPackage={() => onEditSection?.('package')}
                onShowPackageDetails={() => {
                  setPackageFocus(true)
                  setTab('contract_finance')
                }}
              />
            </div>
          ) : null}

          {tab === 'wedding_day' ? (
            <WeddingDayWorkspace
              wedding={wedding}
              places={places}
              onRequestVerifyLocations={() => {
                if (onEditSection) onEditSection('locations')
                else onRequestVerifyLocations()
              }}
              onEditLocationRole={(role) => {
                if (
                  role === 'bride_preparation' ||
                  role === 'groom_preparation' ||
                  role === 'ceremony' ||
                  role === 'reception'
                ) {
                  onEditSection?.(role)
                }
              }}
            />
          ) : null}

          {tab === 'contract_finance' ? (
            <WeddingContractFinanceWorkspace
              wedding={wedding}
              payments={payments}
              extras={extras}
              onAction={onHeroAction}
              forcePackageOpen={packageFocus}
              onEditPackage={() => onEditSection?.('package')}
              onEditFinances={() => onEditSection?.('finances')}
            />
          ) : null}

          {tab === 'pre_wedding_questionnaire' ? (
            <WeddingPreWeddingQuestionnaireWorkspace
              wedding={wedding}
              onWeddingSynced={() => {
                void queryClient.invalidateQueries({
                  predicate: (q) =>
                    Array.isArray(q.queryKey) && q.queryKey[0] === 'weddings',
                })
                void queryClient.invalidateQueries({
                  queryKey: ['wedding-places', userId, wedding.id],
                })
                void queryClient.invalidateQueries({
                  queryKey: ['travel-plan', userId, wedding.id],
                })
              }}
            />
          ) : null}

          {tab === 'activity' ? (
            <WeddingActivityWorkspace feed={feed} />
          ) : null}
        </div>
      </div>

      {!editing ? (
        <WeddingManagementSection
          weddingId={wedding.id}
          onEditWedding={() => onEditSection?.('contacts')}
          onArchive={onArchive}
          onDelete={onDelete}
        />
      ) : null}

      {editing ? (
        <WeddingWorkspaceEditSurface
          props={props}
          focusSection={editorSection}
          saving={saving}
          saveError={props.saveError}
          onSave={() => onSaveEdit?.()}
          onClose={() => onCancelEdit?.()}
        />
      ) : null}
    </div>
  )
}
