/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react'
import {
  AdminApiRequestError,
  fetchAuditList,
} from '@/admin/api/adminApi'
import type { AdminAuditListResult } from '@/admin/api/types'
import { AdminStateMessage } from '@/admin/components/AdminStateMessage'
import { appendAdminAuditEvent } from '@/admin/lib/adminAudit'
import { formatAdminDateTime, formatUpdatedAt } from '@/admin/lib/adminFormat'
import styles from '@/admin/styles/admin.module.css'

const PAGE_SIZE = 50

/** Allow-listed action labels for display — never dump raw metadata. */
const ACTION_LABELS: Record<string, string> = {
  'admin.login_success': 'Logowanie',
  'admin.mfa_enrollment_completed': 'Weryfikacja MFA (enrolment)',
  'admin.mfa_challenge_success': 'Weryfikacja MFA',
  'admin.logout': 'Wylogowanie',
  'admin.audit_viewed': 'Podgląd audytu',
  'admin.unauthorized_attempt': 'Próba nieautoryzowana',
  'subscription.trial_extended': 'Przedłużenie trial',
  'subscription.manual_access_granted': 'Przyznanie ręcznego PRO',
  'subscription.manual_access_revoked': 'Cofnięcie ręcznego dostępu',
}

export function AdminAuditPage() {
  const [offset, setOffset] = useState(0)
  const [action, setAction] = useState('')
  const [data, setData] = useState<AdminAuditListResult | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'forbidden'>(
    'loading',
  )
  const viewedLogged = useRef(false)

  async function load(nextOffset: number, nextAction: string) {
    setState('loading')
    try {
      const result = await fetchAuditList({
        limit: PAGE_SIZE,
        offset: nextOffset,
        action: nextAction || null,
      })
      setData(result)
      setOffset(nextOffset)
      setState('ready')
      if (!viewedLogged.current) {
        viewedLogged.current = true
        void appendAdminAuditEvent({ action: 'admin.audit_viewed' })
      }
    } catch (err) {
      setState(
        err instanceof AdminApiRequestError && err.code !== 'admin_fetch_failed'
          ? 'forbidden'
          : 'error',
      )
    }
  }

  useEffect(() => {
    void load(0, '')
  }, [])

  return (
    <div>
      <div data-testid="admin-audit">
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.sans}>Audyt</h1>
            <p className={styles.pageLead}>
              Dziennik działań administratora. Tylko odczyt.
            </p>
          </div>
        </header>

        <div className={styles.toolbar}>
          <input
            className={styles.toolbarInput}
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Filtr działania (dokładna nazwa)"
            aria-label="Filtr działania"
          />
          <button
            type="button"
            className={styles.primaryBtn}
            style={{ width: 'auto' }}
            onClick={() => void load(0, action)}
          >
            Filtruj
          </button>
        </div>

        {state === 'loading' ? <AdminStateMessage state="loading" /> : null}
        {state === 'error' || state === 'forbidden' ? (
          <AdminStateMessage
            state={state === 'forbidden' ? 'forbidden' : 'error'}
            onRetry={() => void load(offset, action)}
          />
        ) : null}

        {state === 'ready' && data ? (
          <>
            <p className={styles.freshness}>{formatUpdatedAt(data.updatedAt)}</p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Administrator</th>
                    <th>Działanie</th>
                    <th>Obiekt</th>
                    <th>Wynik</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <AdminStateMessage state="empty">0</AdminStateMessage>
                      </td>
                    </tr>
                  ) : (
                    data.rows.map((row) => (
                      <tr key={row.id}>
                        <td>{formatAdminDateTime(row.createdAt)}</td>
                        <td>{row.adminMaskedEmail ?? '—'}</td>
                        <td>{ACTION_LABELS[row.action] ?? row.action}</td>
                        <td>
                          {[row.targetType, row.targetId].filter(Boolean).join(' · ') ||
                            '—'}
                        </td>
                        <td>{row.result === 'error' ? 'Błąd' : 'OK'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className={styles.pager}>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={offset <= 0}
                onClick={() => void load(Math.max(0, offset - PAGE_SIZE), action)}
              >
                Poprzednia
              </button>
              <span>
                {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} / {data.total}
              </span>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={offset + PAGE_SIZE >= data.total}
                onClick={() => void load(offset + PAGE_SIZE, action)}
              >
                Następna
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
