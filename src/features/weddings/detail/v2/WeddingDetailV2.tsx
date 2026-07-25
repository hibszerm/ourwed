import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { companyDetailsService } from '@/lib/api/companyDetailsService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { evaluateWeddingContractReadiness } from '@/lib/utils/weddingContractReadiness'
import { WeddingActivityWorkspace } from '@/features/weddings/detail/v2/WeddingActivityWorkspace'
import { WeddingContextSidebar } from '@/features/weddings/detail/v2/WeddingContextSidebar'
import { WeddingContractFinanceWorkspace } from '@/features/weddings/detail/v2/WeddingContractFinanceWorkspace'
import { WeddingDayWorkspace } from '@/features/weddings/detail/v2/WeddingDayWorkspace'
import { WeddingManagementSection } from '@/features/weddings/detail/v2/WeddingManagementSection'
import { WeddingOverviewBand } from '@/features/weddings/detail/v2/WeddingOverviewBand'
import { WeddingOverviewWorkspace } from '@/features/weddings/detail/v2/WeddingOverviewWorkspace'
import { WeddingWorkspaceHeader } from '@/features/weddings/detail/v2/WeddingWorkspaceHeader'
import { WeddingWorkspaceTabs } from '@/features/weddings/detail/v2/WeddingWorkspaceTabs'
import type {
  WeddingDetailSharedProps,
  WeddingWorkspaceTab,
} from '@/features/weddings/detail/v2/weddingDetailV2Types'
import {
  buildActivityFeed,
  getMissingReadinessItems,
  getNextAction,
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
    packageBasePrice,
    onChangeWedding,
    onChangePayments,
    onChangeTasks,
    onChangeExtras,
    onChangePackageBasePrice,
    onHeroAction,
    onRequestVerifyLocations,
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

  const { data: company } = useQuery({
    queryKey: ['company-details', userId],
    queryFn: () => companyDetailsService.get(),
    enabled: Boolean(userId),
  })

  const readiness = evaluateWeddingContractReadiness(wedding, company)
  const band = getOverviewBand(wedding, readiness)
  const nextAction = getNextAction(wedding, readiness)
  const missing = getMissingReadinessItems(readiness)
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
        readinessLabel={band.readinessLabel}
        readinessReady={band.readinessReady}
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
                nextAction={nextAction}
                missing={missing}
                recent={feed}
                onAction={onHeroAction}
                onOpenContractTab={() => setTab('contract_finance')}
                onOpenActivityTab={() => setTab('activity')}
              />
              <WeddingContextSidebar
                wedding={wedding}
                places={places}
                contacts={contacts}
                onEditLocations={onRequestVerifyLocations}
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
              onRequestVerifyLocations={onRequestVerifyLocations}
            />
          ) : null}

          {tab === 'contract_finance' ? (
            <WeddingContractFinanceWorkspace
              wedding={wedding}
              readiness={readiness}
              payments={payments}
              extras={extras}
              editing={editing}
              packageBasePrice={packageBasePrice}
              onChangeWedding={onChangeWedding}
              onChangePayments={onChangePayments}
              onChangeExtras={onChangeExtras}
              onChangePackageBasePrice={onChangePackageBasePrice}
              onAction={onHeroAction}
              forcePackageOpen={packageFocus}
            />
          ) : null}

          {tab === 'activity' ? (
            <WeddingActivityWorkspace
              wedding={wedding}
              feed={feed}
              tasks={tasks}
              editing={editing}
              onAddNote={onAddNote}
              onChangeTasks={onChangeTasks}
            />
          ) : null}
        </div>
      </div>

      {!editing ? (
        <WeddingManagementSection onArchive={onArchive} onDelete={onDelete} />
      ) : null}
    </div>
  )
}
