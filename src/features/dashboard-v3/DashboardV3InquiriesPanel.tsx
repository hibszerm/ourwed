import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import {
  isProAccessRequiredError,
  toProAccessUserMessage,
} from '@/features/billing/proAccessError'
import {
  useInvalidateAfterQuestionnaireMutation,
  usePendingQuestionnaires,
} from '@/features/questionnaires/hooks/usePendingQuestionnaires'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import { questionnaireService } from '@/lib/api/questionnaireService'
import { formatShortDate } from '@/lib/utils/dates'
import styles from './DashboardV3InquiriesPanel.module.css'

export function DashboardV3InquiriesPanel() {
  const { requirePro, openUpgradeDialog } = useProAccessGate()
  const [busyId, setBusyId] = useState<string | null>(null)
  const { data: pending = [], isLoading } = usePendingQuestionnaires()
  const { afterApprove, afterReject } = useInvalidateAfterQuestionnaireMutation()

  async function handleAccept(id: string) {
    if (
      !requirePro(undefined, { actionKey: 'apply_questionnaire_responses' })
    ) {
      return
    }
    if (busyId) return
    setBusyId(id)
    try {
      await questionnaireService.approve(id)
      afterApprove()
    } catch (err) {
      if (isProAccessRequiredError(err)) {
        openUpgradeDialog('pro_required_action', 'apply_questionnaire_responses')
        window.alert(toProAccessUserMessage())
        return
      }
      window.alert(
        getUserFacingErrorMessage(err, 'Nie udało się zaakceptować zgłoszenia.'),
      )
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject(id: string) {
    if (
      !requirePro(undefined, { actionKey: 'apply_questionnaire_responses' })
    ) {
      return
    }
    if (busyId) return
    setBusyId(id)
    try {
      await questionnaireService.reject(id)
      afterReject()
    } catch (err) {
      if (isProAccessRequiredError(err)) {
        openUpgradeDialog('pro_required_action', 'apply_questionnaire_responses')
        window.alert(toProAccessUserMessage())
        return
      }
      window.alert(
        getUserFacingErrorMessage(err, 'Nie udało się odrzucić zgłoszenia.'),
      )
    } finally {
      setBusyId(null)
    }
  }

  const empty = !isLoading && pending.length === 0

  return (
    <section
      className={`${styles.panel} v3MaterialSecondaryCard${empty ? ` ${styles.emptyPanel}` : ''}`}
      aria-labelledby="dashboard-v3-inquiries-title"
      data-testid="dashboard-v3-inquiries"
      data-empty={empty ? 'true' : 'false'}
      data-mobile-slot={pending.length > 0 ? 'priority' : 'deferred'}
    >
      <header className={styles.header}>
        <div>
          <h2 id="dashboard-v3-inquiries-title" className={styles.title}>
            Nowe zgłoszenia
          </h2>
          {!empty ? (
            <p className={styles.subtitle}>
              {pending.length > 0
                ? `${pending.length} oczekuje na zatwierdzenie`
                : 'Brak nowych zgłoszeń'}
            </p>
          ) : null}
        </div>
        <Link to="/oczekujace" className={styles.allLink}>
          Wszystkie
        </Link>
      </header>

      {isLoading ? <p className={styles.loading}>Ładowanie…</p> : null}

      {empty ? (
        <p className={styles.emptyCopy}>Nie ma oczekujących zgłoszeń.</p>
      ) : null}

      {!isLoading && pending.length > 0 ? (
        <ul className={styles.list}>
          {pending.slice(0, 4).map((item) => (
            <li key={item.instance.id} className={styles.item}>
              <div className={styles.main}>
                <p className={styles.couple}>{item.coupleLabel}</p>
                <p className={styles.meta}>
                  <span>
                    {item.weddingDate
                      ? formatShortDate(item.weddingDate)
                      : 'Data do ustalenia'}
                  </span>
                  <span aria-hidden> · </span>
                  <span>{item.packageName || item.formName}</span>
                </p>
                <p className={styles.submitted}>
                  Wysłano{' '}
                  {item.instance.submittedAt
                    ? formatShortDate(item.instance.submittedAt.slice(0, 10))
                    : '—'}
                </p>
              </div>
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={busyId === item.instance.id}
                  onClick={() => void handleAccept(item.instance.id)}
                >
                  {busyId === item.instance.id ? 'Zapisywanie…' : 'Akceptuj'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busyId === item.instance.id}
                  onClick={() => void handleReject(item.instance.id)}
                >
                  Odrzuć
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
