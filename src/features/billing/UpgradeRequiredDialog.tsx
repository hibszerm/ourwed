import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { PRO_PLAN } from '@/lib/billing/planCatalog'
import { startCheckout } from '@/lib/billing/provider'
import { formatWarsawDate, type AccountEntitlement } from '@/lib/billing/entitlement'
import {
  getProGateActionContext,
  type ProGateActionKey,
} from '@/features/billing/proGateActions'
import styles from './UpgradeRequiredDialog.module.css'

export type UpgradeDialogVariant = 'expired_trial' | 'pro_required_action'

type Props = {
  open: boolean
  variant: UpgradeDialogVariant
  entitlement: AccountEntitlement | null
  actionKey?: ProGateActionKey | null
  onClose: () => void
  onGoToPlans?: () => void
}

export function UpgradeRequiredDialog({
  open,
  variant,
  entitlement,
  actionKey,
  onClose,
  onGoToPlans,
}: Props) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [checkoutNote, setCheckoutNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) setCheckoutNote(null)
  }

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const actionContext = getProGateActionContext(actionKey)

  const title =
    variant === 'pro_required_action'
      ? 'Ta funkcja wymaga PRO.'
      : 'Twój Trial PRO dobiegł końca.'

  const body =
    variant === 'pro_required_action'
      ? (actionContext ??
        'Twój Trial już się zakończył. Wybierz plan, aby kontynuować.')
      : 'Twoje dane pozostają bezpieczne i dostępne. Wybierz PRO, aby dalej tworzyć i edytować zlecenia oraz korzystać ze wszystkich funkcji OurWed.'

  async function onChoose(interval: 'month' | 'year') {
    const accountId = entitlement?.billingAccountId
    if (!accountId) {
      setCheckoutNote('Nie udało się ustalić konta rozliczeniowego.')
      return
    }
    setBusy(true)
    const result = await startCheckout({
      billingAccountId: accountId,
      plan: 'pro',
      interval,
    })
    setBusy(false)
    if (!result.ok) {
      const ends =
        entitlement?.source === 'trial' && entitlement.accessLevel === 'pro'
          ? formatWarsawDate(entitlement.trialEndsAt)
          : null
      setCheckoutNote(
        ends
          ? `${result.message} Twój Trial pozostaje aktywny do ${ends}.`
          : result.message,
      )
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="pro-upgrade-dialog"
        data-variant={variant}
        data-action-key={actionKey ?? undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        <p className={styles.copy}>{body}</p>

        <div className={styles.plans}>
          <article className={`${styles.plan} ${styles.planAnnual}`}>
            <p className={styles.badge}>{PRO_PLAN.annual.recommendedBadge}</p>
            <h3>PRO Roczny</h3>
            <p className={styles.price}>
              {PRO_PLAN.annual.label}
              <span>{PRO_PLAN.annual.periodLabel}</span>
            </p>
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={() => void onChoose('year')}
            >
              Wybierz PRO Roczny
            </Button>
          </article>
          <article className={styles.plan}>
            <h3>PRO Miesięczny</h3>
            <p className={styles.price}>
              {PRO_PLAN.monthly.label}
              <span>{PRO_PLAN.monthly.periodLabel}</span>
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void onChoose('month')}
            >
              Wybierz plan miesięczny
            </Button>
          </article>
        </div>

        <p className={styles.recovery} data-testid="upgrade-recovery-copy">
          Po aktywacji PRO wszystkie funkcje zostaną odblokowane automatycznie.
          Twoje dane i ustawienia pozostają na swoim miejscu.
        </p>

        {checkoutNote ? (
          <p className={styles.note} role="status">
            {checkoutNote}
          </p>
        ) : null}

        <div className={styles.footer}>
          {onGoToPlans ? (
            <Button type="button" variant="ghost" onClick={onGoToPlans}>
              Zobacz plany
            </Button>
          ) : null}
          <Button type="button" variant="secondary" ref={closeRef} onClick={onClose}>
            Może później
          </Button>
        </div>
      </div>
    </div>
  )
}
