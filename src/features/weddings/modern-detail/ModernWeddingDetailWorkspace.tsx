import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { calendarIntegrationQueryKeys } from '@/features/calendar-integrations/queryKeys'
import { invalidateFinanceQueries } from '@/features/finance/invalidateFinanceQueries'
import { ModernWeddingQuestionnaireWorkspace } from '@/features/weddings/modern-detail/ModernWeddingQuestionnaireWorkspace'
import { ModernWeddingContractFinanceWorkspace } from '@/features/weddings/modern-detail/ModernWeddingContractFinanceWorkspace'
import { ModernWeddingHistoriaWorkspace } from '@/features/weddings/modern-detail/ModernWeddingHistoriaWorkspace'
import { DeliveryDeadlineModal } from '@/features/weddings/detail/v2/DeliveryDeadlineModal'
import { WeddingWorkspaceEditSurface } from '@/features/weddings/detail/v2/WeddingWorkspaceEditSurface'
import { TravelFeeResolveModal } from '@/features/weddings/detail/travel-fee/TravelFeeResolveModal'
import {
  dispatchWeddingNextAction,
  type WeddingNextActionHandlers,
} from '@/features/weddings/detail/v2/dispatchWeddingNextAction'
import type {
  WeddingDetailSharedProps,
  WeddingWorkspaceTab,
} from '@/features/weddings/detail/v2/weddingDetailV2Types'
import { resolveWeddingEditOverlayPresentation } from '@/features/weddings/detail/editing/weddingEditorTypes'
import {
  buildActivityFeed,
  parseWorkspaceTab,
} from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { ModernWeddingDetailHeader } from '@/features/weddings/modern-detail/ModernWeddingDetailHeader'
import { ModernWeddingDetailTabs } from '@/features/weddings/modern-detail/ModernWeddingDetailTabs'
import { ModernWeddingLogisticsWorkspace } from '@/features/weddings/modern-detail/ModernWeddingLogisticsWorkspace'
import { ModernWeddingOverview } from '@/features/weddings/modern-detail/ModernWeddingOverview'
import { useModernWeddingDetailContext } from '@/features/weddings/modern-detail/useModernWeddingDetailContext'
import type { CurrentStoryActionId } from '@/features/weddings/modern-detail/modernWeddingDetailModel'
import type { Wedding } from '@/types/wedding'
import styles from './ModernWeddingDetailWorkspace.module.css'

function initialWorkspaceTab(tabParam: string | null): WeddingWorkspaceTab {
  if (tabParam != null && tabParam !== '') {
    return parseWorkspaceTab(tabParam)
  }
  return 'overview'
}

/**
 * Przegląd, Logistyka, Umowa i finanse, Ankieta przedślubna, and Historia
 * are Modern presentation layers. Classic `/sluby/:id` still uses WeddingDetailV2.
 */
export function ModernWeddingDetailWorkspace(props: WeddingDetailSharedProps) {
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
    onOpenClientCollectionChecklist,
    onSaveEdit,
    onCancelEdit,
    saving,
    onArchive,
    onDelete,
    onWeddingRefreshed,
  } = props

  const userId = useStudioAuthId()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [tab, setTabState] = useState<WeddingWorkspaceTab>(() =>
    initialWorkspaceTab(searchParams.get('tab')),
  )
  const [packageFocus, setPackageFocus] = useState(false)
  const [travelFeeOpen, setTravelFeeOpen] = useState(false)
  const [deliveryDeadlineOpen, setDeliveryDeadlineOpen] = useState(false)
  const ctx = useModernWeddingDetailContext(wedding)

  const setTab = useCallback((next: WeddingWorkspaceTab) => {
    setTabState(next)
    if (next !== 'contract_finance') setPackageFocus(false)
  }, [])

  const nextActionHandlers = useMemo<WeddingNextActionHandlers>(
    () => ({
      completeContractDataManually: () => {
        onOpenClientCollectionChecklist?.()
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
      onOpenClientCollectionChecklist,
      onHeroAction,
      onRequestVerifyLocations,
      setTab,
    ],
  )

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

  function dispatchStoryAction(id: CurrentStoryActionId) {
    switch (id) {
      case 'open_finance':
        nextActionHandlers.openContractFinance()
        return
      case 'open_delivery':
        setDeliveryDeadlineOpen(true)
        return
      case 'open_package':
        navigate('/studio/pakiety')
        return
      default: {
        dispatchWeddingNextAction(
          {
            id,
            title: '',
            priority: 'blocker',
            destination: { kind: 'wedding_tab', tab: 'overview' },
          },
          nextActionHandlers,
        )
      }
    }
  }

  return (
    <div
      className={styles.workspace}
      data-testid="modern-wedding-detail"
    >
      <ModernWeddingDetailHeader
        wedding={wedding}
        places={ctx.places}
        onWeddingUpdated={(next) => void handleWeddingUpdated(next)}
        onArchive={onArchive}
        onDelete={onDelete}
      />

      <ModernWeddingDetailTabs value={tab} onChange={setTab} />

      <div
        className={
          tab === 'overview' ||
          tab === 'wedding_day' ||
          tab === 'contract_finance' ||
          tab === 'pre_wedding_questionnaire' ||
          tab === 'activity'
            ? styles.body
            : styles.bridgeBody
        }
        role="tabpanel"
        id={`ws-panel-${tab}`}
        aria-labelledby={`ws-tab-${tab}`}
      >
        {tab === 'overview' ? (
          <ModernWeddingOverview
            wedding={wedding}
            places={ctx.places}
            action={ctx.action}
            applyCount={ctx.applyCount}
            preStatus={ctx.preStatus}
            missingTemplate={ctx.missingTemplate}
            onStoryAction={dispatchStoryAction}
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
          <ModernWeddingLogisticsWorkspace
            wedding={wedding}
            places={ctx.places}
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
                return
              }
              if (onEditSection) onEditSection('locations')
              else onRequestVerifyLocations()
            }}
          />
        ) : null}

        {tab === 'contract_finance' ? (
          <ModernWeddingContractFinanceWorkspace
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
          <ModernWeddingQuestionnaireWorkspace
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
          <ModernWeddingHistoriaWorkspace
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

      {editing ? (
        <WeddingWorkspaceEditSurface
          props={props}
          focusSection={editorSection}
          saving={saving}
          saveError={props.saveError}
          overlayPresentation={resolveWeddingEditOverlayPresentation(
            editorSection,
          )}
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

      <DeliveryDeadlineModal
        open={deliveryDeadlineOpen}
        wedding={wedding}
        onClose={() => setDeliveryDeadlineOpen(false)}
        onSaved={(next) => {
          setDeliveryDeadlineOpen(false)
          void handleWeddingUpdated(next)
        }}
      />
    </div>
  )
}
