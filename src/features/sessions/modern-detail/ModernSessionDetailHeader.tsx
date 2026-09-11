import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { FloatingPortal } from '@/components/ui/FloatingPortal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { getSessionDisplayName } from '@/features/sessions/presentation/getSessionDisplayName'
import { composeSessionHeroMeta } from '@/features/sessions/modern-detail/sessionDetailPresentation'
import type { Session } from '@/types/session'
import styles from './ModernSessionDetailHeader.module.css'

const HERO_OVERFLOW_PLACEMENT = {
  gap: 6,
  minMenuWidth: 200,
  maxMenuWidth: 240,
  align: 'end' as const,
  forceAnchored: true,
  maxMenuHeight: 280,
}

interface Props {
  session: Session
  onDelete: () => Promise<void>
  deleting?: boolean
}

export function ModernSessionDetailHeader({
  session,
  onDelete,
  deleting = false,
}: Props) {
  const meta = composeSessionHeroMeta(session)
  const name = getSessionDisplayName(session)

  return (
    <header
      className={styles.hero}
      data-testid="modern-session-detail-header"
    >
      <div
        className={styles.dateBlock}
        data-testid="modern-session-header-date"
        aria-hidden={meta.dateParts == null}
      >
        {meta.dateParts ? (
          <>
            <span className={styles.dateDay}>{meta.dateParts.day}</span>
            <span className={styles.dateMonth}>{meta.dateParts.month}</span>
            {meta.dateParts.weekday ? (
              <span className={styles.dateWeek}>{meta.dateParts.weekday}</span>
            ) : null}
          </>
        ) : null}
      </div>

      <div className={styles.body}>
        <h1 className={styles.name} data-testid="modern-session-header-name">
          {name}
        </h1>
        {meta.metaLine ? (
          <p className={styles.meta} data-testid="modern-session-header-meta">
            {meta.metaLine}
          </p>
        ) : null}
        <HeaderOverflow
          sessionId={session.id}
          sessionName={name}
          onDelete={onDelete}
          deleting={deleting}
        />
      </div>

      <div
        className={styles.countdown}
        data-testid="modern-session-header-countdown"
        aria-label="Odliczanie"
      >
        {meta.countdown ? (
          <>
            <span
              className={
                meta.countdown.kind === 'future'
                  ? styles.dateDay
                  : `${styles.dateDay} ${styles.dateDayWord}`
              }
            >
              {meta.countdown.value}
            </span>
            {meta.countdown.unit ? (
              <span className={styles.dateMonth}>{meta.countdown.unit}</span>
            ) : null}
            {meta.countdown.caption ? (
              <span className={styles.dateWeek}>{meta.countdown.caption}</span>
            ) : null}
          </>
        ) : null}
      </div>
    </header>
  )
}

function HeaderOverflow({
  sessionId,
  sessionName,
  onDelete,
  deleting,
}: {
  sessionId: string
  sessionName: string
  onDelete: () => Promise<void>
  deleting: boolean
}) {
  const { requirePro } = useProAccessGate()
  const menuId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Escape') return
      setMenuOpen(false)
      btnRef.current?.focus()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
    first?.focus()
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  function onMenuKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') setMenuOpen(false)
  }

  function handleDeleteClick() {
    requirePro(() => {
      setMenuOpen(false)
      setConfirmText('')
      setDeleteOpen(true)
    })
  }

  return (
    <>
      <div className={styles.overflowWrap} ref={wrapRef}>
        <button
          type="button"
          ref={btnRef}
          className={styles.overflowBtn}
          aria-label="Więcej działań sesji"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          data-testid="modern-session-header-overflow"
          onKeyDown={onMenuKey}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
        </button>
        <FloatingPortal
          open={menuOpen}
          anchorRef={btnRef}
          options={HERO_OVERFLOW_PLACEMENT}
        >
          {() => (
            <div
              ref={menuRef}
              id={menuId}
              className={styles.menu}
              role="menu"
              data-testid="modern-session-header-menu"
            >
              <Link
                role="menuitem"
                to={`/sesje/${sessionId}/edytuj`}
                className={styles.menuLink}
                data-testid="modern-session-header-edit"
                onClick={() => setMenuOpen(false)}
              >
                Edytuj sesję
              </Link>
              <div className={styles.menuSep} role="separator" />
              <button
                type="button"
                role="menuitem"
                className={styles.menuDanger}
                data-testid="modern-session-header-delete"
                disabled={deleting || busy}
                onClick={handleDeleteClick}
              >
                Usuń
              </button>
            </div>
          )}
        </FloatingPortal>
      </div>
      <Modal
        open={deleteOpen}
        title="Usuń sesję"
        description="Usunięcie jest nieodwracalne i usuwa sesję wraz z powiązanymi rekordami."
        onClose={() => {
          if (busy) return
          setDeleteOpen(false)
          setConfirmText('')
        }}
        busy={busy}
        primaryAction={
          <Button
            type="button"
            variant="danger"
            size="sm"
            data-testid="modern-session-delete-confirm"
            disabled={busy || confirmText !== 'USUŃ'}
            onClick={() => {
              setBusy(true)
              void onDelete().finally(() => setBusy(false))
            }}
          >
            {busy ? 'Usuwanie…' : 'Usuń na zawsze'}
          </Button>
        }
      >
        <p>
          Czy na pewno chcesz usunąć sesję „{sessionName}”? Tej operacji nie
          można cofnąć.
        </p>
        <Input
          label="Wpisz USUŃ, aby potwierdzić"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          data-testid="modern-session-delete-confirm-input"
        />
      </Modal>
    </>
  )
}
