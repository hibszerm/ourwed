import { useEffect, useId, useRef } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { FloatingPortal } from '@/components/ui/FloatingPortal'
import styles from './ModernQuestionnaireLibrary.module.css'

const LIBRARY_OVERFLOW_PLACEMENT = {
  gap: 4,
  minMenuWidth: 188,
  maxMenuWidth: 240,
  align: 'end' as const,
  forceAnchored: true,
  maxMenuHeight: 320,
  minSpace: 248,
  padding: 8,
}

export type LibraryOverflowAction = {
  id: string
  label: string
  danger?: boolean
  onSelect: () => void
}

export function QuestionnaireLibraryOverflowMenu({
  open,
  onOpenChange,
  actions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: LibraryOverflowAction[]
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      onOpenChange(false)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onOpenChange(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  function run(action: () => void) {
    onOpenChange(false)
    triggerRef.current?.focus()
    action()
  }

  return (
    <div
      className={styles.overflow}
      ref={rootRef}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.menuBtn}
        aria-label="Więcej działań"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        data-testid="template-more-btn"
        onClick={() => onOpenChange(!open)}
      >
        <MoreHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <FloatingPortal open={open} anchorRef={triggerRef} options={LIBRARY_OVERFLOW_PLACEMENT}>
        {() => (
          <div
            ref={menuRef}
            id={menuId}
            className={styles.menuPanel}
            role="menu"
            data-testid="library-overflow-menu"
          >
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                className={
                  action.danger ? `${styles.menuItem} ${styles.menuItemDanger}` : styles.menuItem
                }
                onClick={() => run(action.onSelect)}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </FloatingPortal>
    </div>
  )
}
