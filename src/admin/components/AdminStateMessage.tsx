import type { ReactNode } from 'react'
import styles from '@/admin/styles/admin.module.css'

export type AdminDataState = 'loading' | 'ready' | 'empty' | 'error' | 'forbidden' | 'unavailable'

export function AdminStateMessage({
  state,
  onRetry,
  children,
}: {
  state: Exclude<AdminDataState, 'ready'>
  onRetry?: () => void
  children?: ReactNode
}) {
  const copy: Record<Exclude<AdminDataState, 'ready'>, string> = {
    loading: 'Pobieranie danych…',
    empty: '0',
    error: 'Nie udało się pobrać danych',
    forbidden: 'Brak uprawnień',
    unavailable: 'Moduł nie jest jeszcze podłączony',
  }

  return (
    <div className={styles.stateBox} data-state={state} role="status">
      <p>{children ?? copy[state]}</p>
      {onRetry && (state === 'error' || state === 'forbidden') ? (
        <button type="button" className={styles.secondaryBtn} onClick={onRetry}>
          Ponów
        </button>
      ) : null}
    </div>
  )
}

export function MetricValue({
  value,
  unavailable,
}: {
  value: number | null | undefined
  unavailable?: boolean
}) {
  if (unavailable || value === null || value === undefined) {
    return <span className={styles.metricUnavailable}>Brak wiarygodnego źródła danych</span>
  }
  return <span className={styles.metricValue}>{value}</span>
}
