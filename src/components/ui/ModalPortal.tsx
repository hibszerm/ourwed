import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

interface ModalPortalProps {
  children: ReactNode
  /** Optional mount node; defaults to document.body. */
  container?: Element | null
}

/**
 * Renders overlay UI outside the app layout tree (into document.body).
 */
export function ModalPortal({ children, container }: ModalPortalProps) {
  if (typeof document === 'undefined') return null
  return createPortal(children, container ?? document.body)
}
