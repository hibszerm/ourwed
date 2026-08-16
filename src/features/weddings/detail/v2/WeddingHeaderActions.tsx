import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { WeddingIdentityEditDialog } from '@/features/weddings/detail/v2/WeddingIdentityEditDialog'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { downloadWeddingBriefPdf } from '@/features/wedding-brief/downloadWeddingBriefPdf'
import { mapPdfRenderErrorForUser } from '@/features/documents/pdf/pdfRenderErrors'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

interface Props {
  wedding: Wedding
  onWeddingUpdated: (wedding: Wedding) => void
  onArchive: () => Promise<void>
  onDelete: () => Promise<void>
}

/**
 * Compact header overflow — identity edit, brief, archive/delete.
 */
export function WeddingHeaderActions({
  wedding,
  onWeddingUpdated,
  onArchive,
  onDelete,
}: Props) {
  const { requirePro } = useProAccessGate()
  const menuId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [identityOpen, setIdentityOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [briefError, setBriefError] = useState<string | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  async function handleBrief() {
    if (busy) return
    setMenuOpen(false)
    setBriefError(null)
    setBusy(true)
    try {
      await downloadWeddingBriefPdf(wedding.id)
    } catch (e) {
      const raw = getUserFacingErrorMessage(e, '')
      setBriefError(mapPdfRenderErrorForUser(raw))
    } finally {
      setBusy(false)
    }
  }

  async function handleArchive() {
    setBusy(true)
    try {
      await onArchive()
      setArchiveOpen(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (confirmText !== 'USUŃ') return
    setBusy(true)
    try {
      await onDelete()
      setDeleteOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.headerActions} data-testid="wedding-header-actions">
      <div className={styles.headerMenuWrap} ref={wrapRef}>
        <button
          type="button"
          className={styles.headerMenuBtn}
          aria-label="Więcej działań zlecenia"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          data-testid="wedding-header-menu-btn"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal size={18} strokeWidth={1.75} aria-hidden />
        </button>
        {menuOpen ? (
          <div id={menuId} className={styles.headerMenu} role="menu">
            <Link
              role="menuitem"
              to={`/sluby/${wedding.id}/dzien-slubu`}
              className={styles.headerMenuLink}
              data-testid="wedding-menu-day-cockpit"
              onClick={() => setMenuOpen(false)}
            >
              Tryb dnia ślubu
            </Link>
            <button
              type="button"
              role="menuitem"
              data-testid="wedding-menu-edit-identity"
              onClick={() => {
                requirePro(() => {
                  setMenuOpen(false)
                  setIdentityOpen(true)
                })
              }}
            >
              Edytuj nazwę i datę
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid="wedding-menu-brief"
              disabled={busy}
              onClick={() => void handleBrief()}
            >
              Pobierz brief PDF
            </button>
            <div className={styles.headerMenuSeparator} role="separator" />
            <button
              type="button"
              role="menuitem"
              data-testid="wedding-menu-archive"
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
              className={styles.headerMenuDanger}
              data-testid="wedding-menu-delete"
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
        ) : null}
      </div>

      {briefError ? (
        <p className={styles.briefErrorInline} role="alert">
          {briefError}
        </p>
      ) : null}

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
            data-testid="wedding-archive-confirm"
            onClick={() => void handleArchive()}
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
            data-testid="wedding-delete-confirm"
            onClick={() => void handleDelete()}
          >
            {busy ? 'Usuwanie…' : 'Usuń na zawsze'}
          </Button>
        }
      >
        <Input
          label="Wpisz USUŃ, aby potwierdzić"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          data-testid="wedding-delete-confirm-input"
        />
      </Modal>
    </div>
  )
}
