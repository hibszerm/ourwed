import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'
import styles from './StudioCatalog.module.css'

export function PackageItemOverflowMenu({
  open,
  onOpenChange,
  enabled,
  onEdit,
  onToggleEnabled,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  enabled: boolean
  onEdit: () => void
  onToggleEnabled: () => void
  onDelete: () => void
}) {
  const [placement, setPlacement] = useState<'below' | 'above'>('below')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    setPlacement(spaceBelow < 200 ? 'above' : 'below')
  }, [open])

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        onOpenChange(false)
      }
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
      className={styles.itemOverflow}
      ref={rootRef}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.itemMenuBtn}
        aria-label="Więcej działań"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => onOpenChange(!open)}
      >
        <MoreVertical size={18} strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          className={`${styles.itemOverflowPanel} ${
            placement === 'above' ? styles.itemOverflowPanelAbove : ''
          }`}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className={styles.itemOverflowItem}
            onClick={() => run(onEdit)}
          >
            Edytuj
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.itemOverflowItem}
            onClick={() => run(onToggleEnabled)}
          >
            {enabled ? 'Wyłącz' : 'Włącz'}
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${styles.itemOverflowItem} ${styles.itemOverflowItemDanger}`}
            onClick={() => run(onDelete)}
          >
            Usuń
          </button>
        </div>
      ) : null}
    </div>
  )
}
