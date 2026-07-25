import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconMapPin } from '@/components/icons'
import { WorkflowBadge } from '@/components/ui/Badge'
import type { WeddingHeroAction } from '@/features/weddings/components/detail/WeddingDetailHero'
import {
  getCoupleDisplayName,
  getReceptionDisplayName,
  getWeddingCountdownLabel,
  getWeddingDateLabel,
} from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import type { WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import { weddingActionsService } from '@/lib/api/weddingActionsService'
import styles from './WeddingDetailV2.module.css'

interface WeddingWorkspaceHeaderProps {
  wedding: Wedding
  places: WeddingPlace[]
  readinessLabel: string
  readinessReady: boolean
  editing: boolean
  onAction: (action: WeddingHeroAction) => void
}

export function WeddingWorkspaceHeader({
  wedding,
  places,
  readinessLabel,
  readinessReady,
  editing,
  onAction,
}: WeddingWorkspaceHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const showDeposit = !weddingActionsService.hasDepositPayment(wedding)
  const contractSent =
    wedding.questionnaires.contractData.status !== 'not_sent'

  useEffect(() => {
    if (!moreOpen) return
    function onDoc(e: MouseEvent) {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [moreOpen])

  return (
    <header className={styles.commandHeader} data-testid="wedding-workspace-header">
      <div className={styles.commandMain}>
        <div className={styles.commandIdentity}>
          <h1 className={styles.commandTitle}>
            {getCoupleDisplayName(wedding.couple)}
          </h1>
          <p className={styles.commandMetaLine}>
            <time>{getWeddingDateLabel(wedding.date)}</time>
            {getWeddingCountdownLabel(wedding.date) ? (
              <>
                <span aria-hidden> · </span>
                <span>{getWeddingCountdownLabel(wedding.date)}</span>
              </>
            ) : null}
          </p>
          <p className={styles.commandVenueLine}>
            <IconMapPin width={14} height={14} aria-hidden />
            <span>
              {getReceptionDisplayName(wedding, places)}
              {wedding.packageName?.trim()
                ? ` · ${wedding.packageName.trim()}`
                : ''}
            </span>
          </p>
          <div className={styles.commandPills}>
            <WorkflowBadge stage={wedding.workflowStage} />
            <span
              className={styles.statusPill}
              data-ready={readinessReady}
            >
              {readinessLabel}
            </span>
            {wedding.status === 'archived' ? (
              <span className={styles.statusPillMuted}>Zarchiwizowany</span>
            ) : null}
          </div>
        </div>

        {!editing ? (
          <div className={styles.commandActions}>
            <Button
              type="button"
              variant="primary"
              className={styles.commandPrimary}
              onClick={() => onAction('generate_contract')}
            >
              Generuj umowę
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onAction('add_payment')}
            >
              Dodaj wpłatę
            </Button>
            <div className={styles.moreWrap} ref={moreRef}>
              <Button
                type="button"
                variant="ghost"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                onClick={() => setMoreOpen((v) => !v)}
              >
                Więcej
              </Button>
              {moreOpen ? (
                <div className={styles.moreMenu} role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.moreItem}
                    disabled={contractSent}
                    onClick={() => {
                      setMoreOpen(false)
                      onAction('send_contract_questionnaire')
                    }}
                  >
                    Wyślij ankietę
                  </button>
                  {showDeposit ? (
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.moreItem}
                      onClick={() => {
                        setMoreOpen(false)
                        onAction('add_deposit')
                      }}
                    >
                      Dodaj zadatek
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.moreItem}
                    onClick={() => {
                      setMoreOpen(false)
                      onAction('add_note')
                    }}
                  >
                    Dodaj notatkę
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  )
}
