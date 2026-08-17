import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { calendarIntegrationQueryKeys } from '@/features/calendar-integrations/queryKeys'
import { invalidateFinanceQueries } from '@/features/finance/invalidateFinanceQueries'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { WeddingActivityWorkspace } from '@/features/weddings/detail/v2/WeddingActivityWorkspace'
import { WeddingPreWeddingQuestionnaireWorkspace } from '@/features/weddings/detail/v2/WeddingPreWeddingQuestionnaireWorkspace'
import { WeddingContractFinanceWorkspace } from '@/features/weddings/detail/v2/WeddingContractFinanceWorkspace'
import { WeddingDayWorkspace } from '@/features/weddings/detail/v2/WeddingDayWorkspace'
import { WeddingOverviewBand } from '@/features/weddings/detail/v2/WeddingOverviewBand'
import { WeddingOverviewWorkspace } from '@/features/weddings/detail/v2/WeddingOverviewWorkspace'
import { WeddingWorkspaceEditSurface } from '@/features/weddings/detail/v2/WeddingWorkspaceEditSurface'
import { WeddingWorkspaceHeader } from '@/features/weddings/detail/v2/WeddingWorkspaceHeader'
import { WeddingWorkspaceTabs } from '@/features/weddings/detail/v2/WeddingWorkspaceTabs'
import { TravelFeeResolveModal } from '@/features/weddings/detail/travel-fee/TravelFeeResolveModal'
import type { WeddingNextActionHandlers } from '@/features/weddings/detail/v2/dispatchWeddingNextAction'
import type {
  WeddingDetailSharedProps,
  WeddingWorkspaceTab,
} from '@/features/weddings/detail/v2/weddingDetailV2Types'
import {
  buildActivityFeed,
  getOverviewBand,
  parseWorkspaceTab,
} from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

/**
 * Initial tab for `/sluby/:id`.
 * - Explicit `?tab=` deep links are honored.
 * - Otherwise always Przegląd — never restore from localStorage or another wedding.
 */
function initialWorkspaceTab(
  tabParam: string | null,
): WeddingWorkspaceTab {
  if (tabParam != null && tabParam !== '') {
    return parseWorkspaceTab(tabParam)
  }
  return 'overview'
}

/** Premium Wedding Workspace — tabbed operational surface (not a card grid). */
export function WeddingDetailV2(props: WeddingDetailSharedProps) {
  const {
    wedding,
    payments,
    notes,
    tasks,
    extras,
    editing,
    editorSection = null,
    onHeroAction,
    onRequestVerifyLocations,
    onEditSection,
    onSaveEdit,
    onCancelEdit,
    saving,
    onSendQuestionnaire,
    onArchive,
    onDelete,
    onWeddingRefreshed,
  } = props

  const userId = useStudioAuthId()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [tab, setTabState] = useState<WeddingWorkspaceTab>(() =>
    initialWorkspaceTab(searchParams.get('tab')),
  )
  const [packageFocus, setPackageFocus] = useState(false)
  const [travelFeeOpen, setTravelFeeOpen] = useState(false)

  const setTab = useCallback((next: WeddingWorkspaceTab) => {
    setTabState(next)
    if (next !== 'contract_finance') setPackageFocus(false)
  }, [])

  const { data: places = [] } = useQuery({
    queryKey: ['wedding-places', userId, wedding.id],
    queryFn: () => weddingPlaceService.listByWeddingId(wedding.id),
    enabled: Boolean(userId && wedding.id),
  })

  const nextActionHandlers = useMemo<WeddingNextActionHandlers>(
    () => ({
      sendContractQuestionnaire: () => {
        onSendQuestionnaire?.('contractData')
      },
      resolveTravelFee: () => {
        setTravelFeeOpen(true)
      },
      generateContract: () => {
        onHeroAction('generate_contract')
      },
      openContractFinance: () => {
        setTab('contract_finance')
      },
      recordDeposit: () => {
        onHeroAction('add_deposit')
      },
      openPreWedding: () => {
        setTab('pre_wedding_questionnaire')
      },
      editLocations: () => {
        if (onEditSection) onEditSection('locations')
        else onRequestVerifyLocations()
      },
    }),
    [
      onEditSection,
      onHeroAction,
      onRequestVerifyLocations,
      onSendQuestionnaire,
      setTab,
    ],
  )

  const band = getOverviewBand(wedding)
  const feed = buildActivityFeed({
    timeline: wedding.timeline,
    notes,
    tasks,
    wedding,
  })

  async function handleWeddingUpdated(next: Wedding) {
    queryClient.setQueryData(['weddings', userId, wedding.id], next)
    await queryClient.invalidateQueries({ queryKey: ['weddings'] })
    await queryClient.invalidateQueries({
      queryKey: calendarIntegrationQueryKeys.entityStatus(
        userId,
        'wedding',
        wedding.id,
      ),
    })
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    await invalidateFinanceQueries(queryClient)
    onWeddingRefreshed?.(next)
  }

  return (
    <div className={styles.workspace} data-testid="wedding-detail-v2">
      <WeddingWorkspaceHeader
        wedding={wedding}
        places={places}
        onWeddingUpdated={(next) => void handleWeddingUpdated(next)}
        onArchive={onArchive}
        onDelete={onDelete}
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
            <WeddingOverviewWorkspace
              wedding={wedding}
              places={places}
              nextActionHandlers={nextActionHandlers}
              onOpenFinanceTab={() => setTab('contract_finance')}
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
                // Always open the shared location editor — never no-op.
                // Role focus when known; otherwise all locations.
                if (
                  role === 'bride_preparation' ||
                  role === 'groom_preparation' ||
                  role === 'ceremony' ||
                  role === 'reception'
                ) {
                  onEditSection?.(role)
                  return
                }
                if (onEditSection) onEditSection('locations')
                else onRequestVerifyLocations()
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
              onEditPayment={props.onEditPayment}
              onContractStatusChanged={() => {
                void queryClient.invalidateQueries({ queryKey: ['weddings'] })
                void invalidateFinanceQueries(queryClient)
              }}
              onWeddingUpdated={() => {
                void queryClient.invalidateQueries({ queryKey: ['weddings'] })
                void invalidateFinanceQueries(queryClient)
              }}
            />
          ) : null}

          {tab === 'pre_wedding_questionnaire' ? (
            <WeddingPreWeddingQuestionnaireWorkspace
              wedding={wedding}
              onWeddingSynced={(next) => {
                queryClient.setQueryData(['weddings', userId, wedding.id], next)
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
                void invalidateFinanceQueries(queryClient)
              }}
            />
          ) : null}

          {tab === 'activity' ? (
            <WeddingActivityWorkspace
              feed={feed}
              onEditTasks={
                onEditSection ? () => onEditSection('tasks') : undefined
              }
              onEditNotes={
                onEditSection ? () => onEditSection('notes') : undefined
              }
            />
          ) : null}
        </div>
      </div>

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

      <TravelFeeResolveModal
        open={travelFeeOpen}
        wedding={wedding}
        extras={extras}
        onClose={() => setTravelFeeOpen(false)}
        onSaved={(next) => {
          setTravelFeeOpen(false)
          void handleWeddingUpdated(next)
        }}
      />
    </div>
  )
}
