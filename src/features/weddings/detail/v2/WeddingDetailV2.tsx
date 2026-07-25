import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { WeddingActivityWorkspace } from '@/features/weddings/detail/v2/WeddingActivityWorkspace'
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
    onChangeTasks,
    onHeroAction,
    onRequestVerifyLocations,
    onEditSection,
    onSaveEdit,
    onCancelEdit,
    saving,
    onAddNote,
    onArchive,
    onDelete,
  } = props

  const userId = useStudioAuthId()
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
      <WeddingWorkspaceHeader
        wedding={wedding}
        places={places}
        editing={editing}
        onAction={onHeroAction}
      />

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
                stage={wedding.workflowStage}
                recent={feed}
                onOpenActivityTab={() => setTab('activity')}
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

          {tab === 'activity' ? (
            <WeddingActivityWorkspace
              wedding={wedding}
              feed={feed}
              tasks={tasks}
              editing={false}
              onAddNote={onAddNote}
              onChangeTasks={onChangeTasks}
              onEditTasks={() => onEditSection?.('tasks')}
              onEditNotes={() => onEditSection?.('notes')}
            />
          ) : null}
        </div>
      </div>

      {!editing ? (
        <WeddingManagementSection onArchive={onArchive} onDelete={onDelete} />
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
