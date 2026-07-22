import { useEffect, useId, useRef, useState } from 'react'
import { MoreHorizontal, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  TemplateDefaultBadge,
  TemplateStatusBadge,
} from '@/features/documents/components/TemplateStatusBadge'
import {
  formatTemplateDate,
  getCategoryMeta,
} from '@/features/documents/templateMeta'
import type { DocumentTemplateSummary } from '@/types/documents'
import styles from '../DocumentsTemplates.module.css'

interface TemplateDetailHeroProps {
  template: DocumentTemplateSummary
  uploadPending?: boolean
  /** Only pass when mapping/configuration requirements are satisfied. */
  onMarkReady?: () => void
  onUploadVersion: () => void
  onRename: () => void
  onDuplicate: () => void
  onArchiveOrRestore: () => void
  onDelete: () => void
  onSetDefault?: () => void
  onOpenDetails: () => void
}

export function TemplateDetailHero({
  template,
  uploadPending,
  onMarkReady,
  onUploadVersion,
  onRename,
  onDuplicate,
  onArchiveOrRestore,
  onDelete,
  onSetDefault,
  onOpenDetails,
}: TemplateDetailHeroProps) {
  const cat = getCategoryMeta(template.docType)
  const Icon = cat.icon
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const secondary = (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={onRename}>
        Zmień nazwę
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={onDuplicate}>
        Duplikuj
      </Button>
      {onSetDefault && (
        <Button type="button" size="sm" variant="secondary" onClick={onSetDefault}>
          Ustaw jako domyślny
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onArchiveOrRestore}
      >
        {template.status === 'archived' ? 'Przywróć' : 'Archiwizuj'}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDelete}>
        Usuń
      </Button>
      <button type="button" className={styles.detailsLink} onClick={onOpenDetails}>
        Szczegóły techniczne
      </button>
    </>
  )

  return (
    <header className={styles.detailHero}>
      <div className={styles.detailHeroTop}>
        <div className={styles.detailTitleBlock}>
          <span className={styles.iconWrap}>
            <Icon size={24} strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h1 className={styles.detailTitle}>{template.name}</h1>
            <div className={styles.detailBadges}>
              <TemplateStatusBadge status={template.status} />
              {template.isDefault && <TemplateDefaultBadge />}
            </div>
            <p className={styles.detailMetaLine}>
              <span>{cat.label}</span>
              <span>
                {template.currentVersionNumber
                  ? `Wersja v${template.currentVersionNumber}`
                  : 'Brak wersji'}
              </span>
              <span>Aktualizacja {formatTemplateDate(template.updatedAt)}</span>
            </p>
            {template.description && (
              <p className={styles.detailDesc}>{template.description}</p>
            )}
          </div>
        </div>

        <div className={styles.detailActions}>
          <div className={styles.actionsDesktop}>
            <Button
              type="button"
              variant="primary"
              disabled={uploadPending}
              onClick={onUploadVersion}
            >
              <Upload size={16} style={{ marginRight: 6 }} aria-hidden />
              {uploadPending ? 'Przesyłanie…' : 'Prześlij nową wersję'}
            </Button>
            {onMarkReady && (
              <Button type="button" variant="secondary" onClick={onMarkReady}>
                Oznacz jako gotowy
              </Button>
            )}
            {secondary}
          </div>

          <div className={styles.actionsMobile}>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={uploadPending}
              onClick={onUploadVersion}
            >
              <Upload size={16} style={{ marginRight: 6 }} aria-hidden />
              Nowa wersja
            </Button>
            <div className={styles.overflowMenu} ref={menuRef}>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <MoreHorizontal size={18} aria-label="Więcej działań" />
              </Button>
              {menuOpen && (
                <div id={menuId} className={styles.overflowPanel} role="menu">
                  {onMarkReady && (
                    <button
                      type="button"
                      className={styles.overflowItem}
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        onMarkReady()
                      }}
                    >
                      Oznacz jako gotowy
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.overflowItem}
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      onRename()
                    }}
                  >
                    Zmień nazwę
                  </button>
                  <button
                    type="button"
                    className={styles.overflowItem}
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      onDuplicate()
                    }}
                  >
                    Duplikuj
                  </button>
                  {onSetDefault && (
                    <button
                      type="button"
                      className={styles.overflowItem}
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        onSetDefault()
                      }}
                    >
                      Ustaw jako domyślny
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.overflowItem}
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      onArchiveOrRestore()
                    }}
                  >
                    {template.status === 'archived' ? 'Przywróć' : 'Archiwizuj'}
                  </button>
                  <button
                    type="button"
                    className={styles.overflowItem}
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      onOpenDetails()
                    }}
                  >
                    Szczegóły techniczne
                  </button>
                  <button
                    type="button"
                    className={`${styles.overflowItem} ${styles.overflowItemDanger}`}
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      onDelete()
                    }}
                  >
                    Usuń
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
