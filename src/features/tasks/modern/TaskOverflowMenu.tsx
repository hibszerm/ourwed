import { useEffect, useId, useRef } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { FloatingPortal } from '@/components/ui/FloatingPortal'
import {
  TASKS_DELETE_LABEL,
  TASKS_EDIT_LABEL,
  TASKS_OVERFLOW_ARIA,
} from '@/features/tasks/modern/tasksCopy'
import styles from './ModernTasksWorkspace.module.css'

const TASK_OVERFLOW_PLACEMENT = {
  gap: 4,
  minMenuWidth: 148,
  maxMenuWidth: 220,
  align: 'end' as const,
  forceAnchored: true,
  maxMenuHeight: 160,
  minSpace: 96,
  padding: 8,
}

export function TaskOverflowMenu({
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
        aria-label={TASKS_OVERFLOW_ARIA}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => onOpenChange(!open)}
      >
        <MoreHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <FloatingPortal
        open={open}
        anchorRef={triggerRef}
        options={TASK_OVERFLOW_PLACEMENT}
      >
        {() => (
          <div
            ref={menuRef}
            id={menuId}
            className={styles.menuPanel}
            role="menu"
            data-testid="task-overflow-menu"
          >
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => run(onEdit)}
            >
              {TASKS_EDIT_LABEL}
            </button>
            <button
              type="button"
              role="menuitem"
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              onClick={() => run(onDelete)}
            >
              {TASKS_DELETE_LABEL}
            </button>
          </div>
        )}
      </FloatingPortal>
    </div>
  )
}
