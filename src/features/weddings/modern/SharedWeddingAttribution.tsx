import { useId, useRef, useState } from 'react'
import { UsersRound } from 'lucide-react'
import { FloatingPortal } from '@/components/ui/FloatingPortal'
import { Modal } from '@/components/ui/Modal'
import styles from './SharedWeddingAttribution.module.css'

export function SharedWeddingAttribution({ ownerDisplayName }: { ownerDisplayName: string | null }) {
  const [open, setOpen] = useState(false)
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const tooltipId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const displayName = ownerDisplayName?.trim() || 'właściciela zlecenia'
  const message = `Udostępnione przez ${displayName}`
  const showDesktopTooltip = tooltipOpen
    && !open
    && typeof window !== 'undefined'
    && window.innerWidth >= 768

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-label={message}
        aria-describedby={showDesktopTooltip ? tooltipId : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={() => setTooltipOpen(true)}
        onPointerLeave={() => setTooltipOpen(false)}
        onFocus={() => setTooltipOpen(true)}
        onBlur={() => setTooltipOpen(false)}
        onClick={() => setOpen(true)}
      >
        <UsersRound size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <FloatingPortal
        open={showDesktopTooltip}
        anchorRef={buttonRef}
        options={{ forceAnchored: true, minMenuWidth: 160, maxMenuWidth: 260, maxMenuHeight: 72, gap: 7, padding: 8 }}
        zIndex={1250}
      >
        {(placement) => (
          <span
            id={tooltipId}
            role="tooltip"
            className={styles.tooltip}
            data-placement={placement.placement}
          >
            {message}
          </span>
        )}
      </FloatingPortal>
      <Modal
        open={open}
        title="Informacja o udostępnieniu"
        onClose={() => setOpen(false)}
        hideFooter
        showClose
        mobilePresentation="center"
        initialFocus="panel"
      >
        <p className={styles.dialogMessage}>{message}</p>
      </Modal>
    </>
  )
}
