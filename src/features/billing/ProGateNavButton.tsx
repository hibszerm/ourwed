import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { ProLockIcon } from '@/features/billing/ProLockIcon'
import {
  PRO_LOCKED_ARIA,
  PRO_LOCKED_HINT,
  type ProGateActionKey,
} from '@/features/billing/proGateActions'
import type { ComponentProps } from 'react'

type ButtonProps = ComponentProps<typeof Button>

/**
 * Navigates to `to` only when PRO is active; otherwise opens upgrade dialog.
 */
export function ProGateNavButton({
  to,
  children,
  actionKey,
  ...buttonProps
}: ButtonProps & {
  to: string
  children: React.ReactNode
  actionKey?: ProGateActionKey
}) {
  const navigate = useNavigate()
  const { requirePro, canUsePro } = useProAccessGate()
  const locked = canUsePro === false

  return (
    <Button
      {...buttonProps}
      type="button"
      title={locked ? PRO_LOCKED_HINT : buttonProps.title}
      aria-label={
        locked
          ? `${typeof children === 'string' ? children : 'Akcja'} — ${PRO_LOCKED_ARIA}`
          : buttonProps['aria-label']
      }
      style={{
        ...buttonProps.style,
        opacity: locked ? 0.72 : buttonProps.style?.opacity,
      }}
      onClick={(e) => {
        buttonProps.onClick?.(e)
        if (e.defaultPrevented) return
        requirePro(() => navigate(to), { actionKey })
      }}
    >
      {locked ? (
        <span
          style={{
            display: 'inline-flex',
            marginRight: '0.35rem',
            verticalAlign: 'middle',
          }}
        >
          <ProLockIcon />
        </span>
      ) : null}
      {children}
    </Button>
  )
}
