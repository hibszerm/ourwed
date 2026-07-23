import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { ContractStatusBadge } from '@/features/documents/components/ContractStatusBadge'
import {
  formatContractDate,
  getContractUiStatus,
} from '@/features/documents/contractUi'
import type { DocumentTemplateSummary } from '@/types/documents'
import styles from '../DocumentsTemplates.module.css'

export function ContractCard({
  template,
  onRename,
  onDuplicate,
  onReplace,
  onReanalyze,
  onDelete,
}: {
  template: DocumentTemplateSummary
  onRename: () => void
  onDuplicate: () => void
  onReplace: () => void
  onReanalyze?: () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const status = getContractUiStatus(template)

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  return (
    <article className={styles.contractCard}>
      <div className={styles.contractCardMenu} ref={menuRef}>
        <button
          type="button"
          className={styles.cardMenuBtn}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal size={18} aria-label="Więcej działań" />
        </button>
        {menuOpen ? (
          <div id={menuId} className={styles.overflowPanel} role="menu">
            <button
              type="button"
              role="menuitem"
              className={styles.overflowItem}
              onClick={() => {
                setMenuOpen(false)
                onRename()
              }}
            >
              Zmień nazwę
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.overflowItem}
              onClick={() => {
                setMenuOpen(false)
                onDuplicate()
              }}
            >
              Duplikuj
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.overflowItem}
              onClick={() => {
                setMenuOpen(false)
                onReplace()
              }}
            >
              Zamień źródłowy DOCX
            </button>
            {onReanalyze ? (
              <button
                type="button"
                role="menuitem"
                className={styles.overflowItem}
                onClick={() => {
                  setMenuOpen(false)
                  onReanalyze()
                }}
              >
                Ponownie przeanalizuj szablon
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className={`${styles.overflowItem} ${styles.overflowItemDanger}`}
              onClick={() => {
                setMenuOpen(false)
                onDelete()
              }}
            >
              Usuń
            </button>
          </div>
        ) : null}
      </div>

      <Link
        to={`/ustawienia/dokumenty/szablony/${template.id}`}
        className={styles.contractCardLink}
      >
        <div className={styles.contractCardHeader}>
          <h2 className={styles.contractCardTitle}>{template.name}</h2>
          <ContractStatusBadge status={status} />
        </div>

        <dl className={styles.contractMeta}>
          <div>
            <dt>Ostatnia aktualizacja</dt>
            <dd>{formatContractDate(template.updatedAt)}</dd>
          </div>
          <div>
            <dt>Wykryte zmienne</dt>
            <dd>{template.variableCount}</dd>
          </div>
          <div>
            <dt>Wygenerowano</dt>
            <dd>{template.usageCount}</dd>
          </div>
        </dl>
      </Link>
    </article>
  )
}
