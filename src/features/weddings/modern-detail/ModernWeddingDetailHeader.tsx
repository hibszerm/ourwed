import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { FloatingPortal } from '@/components/ui/FloatingPortal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { WeddingIdentityEditDialog } from '@/features/weddings/detail/v2/WeddingIdentityEditDialog'
import { useWeddingBriefAction } from '@/features/wedding-brief/useWeddingBriefAction'
import {
  daysUntilWeddingDate,
  resolveDayModeProminence,
  type DayModeProminence,
} from '@/features/weddings/modern-detail/modernWeddingDetailModel'
import { ModernWeddingIdentityHero } from '@/features/weddings/modern-detail/ModernWeddingIdentityHero'
import type { WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import styles from './ModernWeddingDetailHeader.module.css'

const HERO_OVERFLOW_PLACEMENT = {
  gap: 6,
  minMenuWidth: 232,
  maxMenuWidth: 240,
  align: 'end' as const,
  forceAnchored: true,
  maxMenuHeight: 360,
}

interface Props {
  wedding: Wedding
  places: WeddingPlace[]
  onWeddingUpdated: (wedding: Wedding) => void
  onArchive: () => Promise<void>
  onDelete: () => Promise<void>
}

export function ModernWeddingDetailHeader({
  wedding,
  places,
  onWeddingUpdated,
  onArchive,
  onDelete,
}: Props) {
  const delivered = Boolean(wedding.deliveryCompletedAt?.trim())
  const prominence = resolveDayModeProminence({
    daysUntil: daysUntilWeddingDate(wedding.date),
    delivered,
  })

  return (
    <ModernWeddingIdentityHero
      wedding={wedding}
      places={places}
      testId="modern-wedding-detail-header"
      utilities={
        <HeaderUtilities
          wedding={wedding}
          prominence={prominence}
          onWeddingUpdated={onWeddingUpdated}
          onArchive={onArchive}
          onDelete={onDelete}
        />
      }
    />
  )
}

function HeaderUtilities({
  wedding,
  prominence,
  onWeddingUpdated,
  onArchive,
  onDelete,
}: {
  wedding: Wedding
  prominence: DayModeProminence
  onWeddingUpdated: (wedding: Wedding) => void
  onArchive: () => Promise<void>
  onDelete: () => Promise<void>
}) {
  const { requirePro } = useProAccessGate()
  const menuId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [identityOpen, setIdentityOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const brief = useWeddingBriefAction(wedding.id)

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

  async function handleBrief() {
    if (brief.busy) return
    await brief.run()
    setMenuOpen(false)
  }

  const dayModeHref = `/sluby/${wedding.id}/dzien-slubu`

  return (
    <>
      <div className={styles.overflowWrap} ref={wrapRef}>
        <button
          type="button"
          ref={btnRef}
          className={styles.overflowBtn}
          aria-label="Więcej działań zlecenia"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          data-testid="modern-wedding-header-overflow"
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
              data-testid="modern-wedding-header-menu"
            >
              <button
                type="button"
                role="menuitem"
                data-testid="modern-wedding-header-edit"
                onClick={() => {
                  requirePro(() => {
                    setMenuOpen(false)
                    setIdentityOpen(true)
                  })
                }}
              >
                Edytuj
              </button>
              <Link
                role="menuitem"
                to={dayModeHref}
                className={styles.menuLink}
                data-testid="modern-wedding-day-mode"
                data-prominence={prominence}
                onClick={() => setMenuOpen(false)}
              >
                Tryb dnia ślubu
              </Link>
              <button
                type="button"
                role="menuitem"
                disabled={brief.busy}
                onClick={() => void handleBrief()}
              >
                {brief.label}
              </button>
              <div className={styles.menuSep} role="separator" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  requirePro(() => {
                    setMenuOpen(false)
                    setArchiveOpen(true)
                  })
                }}
              >
                Archiwizuj zlecenie
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuDanger}
                onClick={() => {
                  requirePro(() => {
                    setMenuOpen(false)
                    setConfirmText('')
                    setDeleteOpen(true)
                  })
                }}
              >
                Usuń zlecenie
              </button>
            </div>
          )}
        </FloatingPortal>
        {brief.error ? (
          <p className={styles.briefError} role="alert">
            {brief.error}
          </p>
        ) : null}
      </div>
      <WeddingIdentityEditDialog
        open={identityOpen}
        wedding={wedding}
        onClose={() => setIdentityOpen(false)}
        onSaved={onWeddingUpdated}
      />
      <Modal
        open={archiveOpen}
        title="Archiwizuj zlecenie"
        description="Archiwizacja zachowuje wszystkie dane. Możesz wrócić do zlecenia później."
        onClose={() => setArchiveOpen(false)}
        busy={busy}
        primaryAction={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onArchive().finally(() => {
                setBusy(false)
                setArchiveOpen(false)
              })
            }}
          >
            {busy ? 'Archiwizowanie…' : 'Archiwizuj'}
          </Button>
        }
      >
        <p>Czy na pewno chcesz zarchiwizować to zlecenie?</p>
      </Modal>
      <Modal
        open={deleteOpen}
        title="Usuń zlecenie"
        description="Usunięcie jest nieodwracalne i usuwa ślub wraz z powiązanymi rekordami."
        onClose={() => setDeleteOpen(false)}
        busy={busy}
        primaryAction={
          <Button
            type="button"
            variant="danger"
            size="sm"
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
        <Input
          label="Wpisz USUŃ, aby potwierdzić"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
        />
      </Modal>
    </>
  )
}
