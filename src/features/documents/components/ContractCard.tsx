import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { ContractStatusBadge } from '@/features/documents/components/ContractStatusBadge'
import {
  formatContractDate,
  getContractUiStatus,
  templateServiceTypeLabel,
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
  onUse,
}: {
  template: DocumentTemplateSummary
  onRename: () => void
  onDuplicate: () => void
  onReplace: () => void
  onReanalyze?: () => void
  onDelete: () => void
  onUse?: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const status = getContractUiStatus(template)
  const attentionMessage =
    template.meta.automaticAttentionIssues?.[0]?.message ?? null

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const primaryAction =
    status === 'ready'
      ? { label: 'Użyj szablonu', disabled: false, onClick: onUse }
      : status === 'analyzing'
        ? { label: 'Analizowanie…', disabled: true, onClick: undefined }
        : status === 'attention'
          ? { label: 'Zobacz', disabled: false, onClick: undefined }
          : status === 'error'
            ? {
                label: 'Spróbuj ponownie',
                disabled: !onReanalyze,
                onClick: onReanalyze,
              }
            : null

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
                onReplace()
              }}
            >
              Wgraj nową wersję
            </button>
            <Link
              to={`/ustawienia/dokumenty/szablony/${template.id}`}
              role="menuitem"
              className={styles.overflowItem}
              onClick={() => setMenuOpen(false)}
            >
              Podgląd
            </Link>
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
                Ponownie przeanalizuj
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
            <dt>Typ</dt>
            <dd>
              {templateServiceTypeLabel(
                template.meta.templateServiceType,
                template.category,
              )}
            </dd>
          </div>
          <div>
            <dt>Dodano</dt>
            <dd>{formatContractDate(template.createdAt)}</dd>
          </div>
          <div>
            <dt>Ostatnio użyty</dt>
            <dd>{formatContractDate(template.updatedAt)}</dd>
          </div>
          <div>
            <dt>Wygenerowano</dt>
            <dd>{template.usageCount}</dd>
          </div>
        </dl>
        {status === 'attention' && attentionMessage ? (
          <p className={styles.contractCardHint}>{attentionMessage}</p>
        ) : null}
      </Link>

      {primaryAction ? (
        <div className={styles.contractCardPrimary}>
          {primaryAction.onClick || primaryAction.label === 'Zobacz' ? (
            primaryAction.label === 'Zobacz' ? (
              <Link
                to={`/ustawienia/dokumenty/szablony/${template.id}`}
                className={styles.contractCardPrimaryBtn}
              >
                {primaryAction.label}
              </Link>
            ) : (
              <button
                type="button"
                className={styles.contractCardPrimaryBtn}
                disabled={primaryAction.disabled}
                onClick={(e) => {
                  e.preventDefault()
                  primaryAction.onClick?.()
                }}
              >
                {primaryAction.label}
              </button>
            )
          ) : (
            <button
              type="button"
              className={styles.contractCardPrimaryBtn}
              disabled
            >
              {primaryAction.label}
            </button>
          )}
        </div>
      ) : null}
    </article>
  )
}
