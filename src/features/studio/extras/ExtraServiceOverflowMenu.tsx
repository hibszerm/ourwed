import { useEffect, useId, useRef } from 'react'
import { MoreVertical } from 'lucide-react'
import { FloatingPortal } from '@/components/ui/FloatingPortal'
import styles from './ModernExtraServicesWorkspace.module.css'

const EXTRA_OVERFLOW_PLACEMENT = {
  gap: 4,
  minMenuWidth: 148,
  maxMenuWidth: 220,
  align: 'end' as const,
  forceAnchored: true,
  maxMenuHeight: 120,
  minSpace: 96,
  padding: 8,
}

export function ExtraServiceOverflowMenu({
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
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
        onClick={() => onOpenChange(!open)}
      >
        <MoreVertical size={18} strokeWidth={2} aria-hidden />
      </button>
      <FloatingPortal
        open={open}
        anchorRef={triggerRef}
        options={EXTRA_OVERFLOW_PLACEMENT}
      >
        {() => (
          <div
            ref={menuRef}
            id={menuId}
            className={styles.menuPanel}
            role="menu"
            data-testid="extras-overflow-menu"
          >
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => run(onEdit)}
            >
              Edytuj
            </button>
            <button
              type="button"
              role="menuitem"
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              onClick={() => run(onDelete)}
            >
              Usuń
            </button>
          </div>
        )}
      </FloatingPortal>
    </div>
  )
}
