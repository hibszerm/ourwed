/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/set-state-in-effect */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useMySubscription,
  type SubscriptionHookState,
} from '@/lib/billing/useMySubscription'
import type { AccountEntitlement } from '@/lib/billing/entitlement'
import {
  UpgradeRequiredDialog,
  type UpgradeDialogVariant,
} from '@/features/billing/UpgradeRequiredDialog'
import {
  PRO_LOCKED_ARIA,
  PRO_LOCKED_HINT,
  type ProGateActionKey,
} from '@/features/billing/proGateActions'
import { ProLockIcon } from '@/features/billing/ProLockIcon'
import styles from './ProGateAction.module.css'

export type RequireProOptions = {
  variant?: UpgradeDialogVariant
  actionKey?: ProGateActionKey
}

type GateContextValue = {
  canUsePro: boolean | null
  isReadOnly: boolean
  loading: boolean
  error: boolean
  entitlement: AccountEntitlement | null
  subscriptionState: SubscriptionHookState
  refresh: () => Promise<void>
  /** Gate a mutation. Returns true if allowed. */
  requirePro: (
    onAllowed?: () => void,
    variantOrOptions?: UpgradeDialogVariant | RequireProOptions,
  ) => boolean
  openUpgradeDialog: (
    variant?: UpgradeDialogVariant,
    actionKey?: ProGateActionKey,
  ) => void
  dismissExpiredAutoDialog: () => void
  expiredAutoDialogPending: boolean
  bannerHiddenForSession: boolean
  hideReadOnlyBanner: () => void
}

const GateContext = createContext<GateContextValue>({
  canUsePro: null,
  isReadOnly: false,
  loading: true,
  error: false,
  entitlement: null,
  subscriptionState: { status: 'loading' },
  refresh: async () => undefined,
  requirePro: () => true,
  openUpgradeDialog: () => undefined,
  dismissExpiredAutoDialog: () => undefined,
  expiredAutoDialogPending: false,
  bannerHiddenForSession: false,
  hideReadOnlyBanner: () => undefined,
})

export function useProAccessGate() {
  return useContext(GateContext)
}

/** Alias for clarity in call sites. */
export function useProGate() {
  return useProAccessGate()
}

function parseRequireProOptions(
  variantOrOptions?: UpgradeDialogVariant | RequireProOptions,
): RequireProOptions {
  if (variantOrOptions == null) return {}
  if (typeof variantOrOptions === 'string') {
    return { variant: variantOrOptions }
  }
  return variantOrOptions
}

export function ProAccessGateProvider({ children }: { children: ReactNode }) {
  const { state, refresh } = useMySubscription()
  const navigate = useNavigate()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogVariant, setDialogVariant] =
    useState<UpgradeDialogVariant>('expired_trial')
  const [dialogActionKey, setDialogActionKey] =
    useState<ProGateActionKey | null>(null)
  const autoShownRef = useRef(false)
  const [autoDismissed, setAutoDismissed] = useState(false)
  const [bannerHiddenForSession, setBannerHiddenForSession] = useState(false)

  const entitlement =
    state.status === 'ready' ? state.data.entitlement : null
  const canUsePro =
    state.status === 'ready' ? state.data.entitlement.canUseProFeatures : null
  const isReadOnly = canUsePro === false
  const isExpired =
    state.status === 'ready' && !state.data.entitlement.canUseProFeatures

  useEffect(() => {
    if (!isExpired || autoShownRef.current || autoDismissed) return
    autoShownRef.current = true
    setDialogVariant('expired_trial')
    setDialogActionKey(null)
    setDialogOpen(true)
  }, [isExpired, autoDismissed])

  // Clear stale read-only state when entitlement recovers (admin grant / extend).
  useEffect(() => {
    if (canUsePro !== true) return
    setDialogOpen(false)
    setAutoDismissed(false)
    setBannerHiddenForSession(false)
    setDialogActionKey(null)
    autoShownRef.current = false
  }, [canUsePro])

  const openUpgradeDialog = useCallback(
    (
      variant: UpgradeDialogVariant = 'pro_required_action',
      actionKey?: ProGateActionKey,
    ) => {
      setDialogVariant(variant)
      setDialogActionKey(actionKey ?? null)
      setDialogOpen(true)
    },
    [],
  )

  const dismissExpiredAutoDialog = useCallback(() => {
    setDialogOpen(false)
    setAutoDismissed(true)
  }, [])

  const hideReadOnlyBanner = useCallback(() => {
    setBannerHiddenForSession(true)
  }, [])

  const requirePro = useCallback(
    (
      onAllowed?: () => void,
      variantOrOptions?: UpgradeDialogVariant | RequireProOptions,
    ) => {
      const opts = parseRequireProOptions(variantOrOptions)
      const variant = opts.variant ?? 'pro_required_action'
      if (state.status === 'error') {
        onAllowed?.()
        return true
      }
      if (state.status !== 'ready') return false
      if (state.data.entitlement.canUseProFeatures) {
        onAllowed?.()
        return true
      }
      openUpgradeDialog(variant, opts.actionKey)
      return false
    },
    [state, openUpgradeDialog],
  )

  const value = useMemo<GateContextValue>(
    () => ({
      canUsePro,
      isReadOnly,
      loading: state.status === 'loading',
      error: state.status === 'error',
      entitlement,
      subscriptionState: state,
      refresh,
      requirePro,
      openUpgradeDialog,
      dismissExpiredAutoDialog,
      expiredAutoDialogPending: isExpired && !autoDismissed,
      bannerHiddenForSession,
      hideReadOnlyBanner,
    }),
    [
      canUsePro,
      isReadOnly,
      state,
      entitlement,
      refresh,
      requirePro,
      openUpgradeDialog,
      dismissExpiredAutoDialog,
      isExpired,
      autoDismissed,
      bannerHiddenForSession,
      hideReadOnlyBanner,
    ],
  )

  const effectiveDialogOpen = dialogOpen && canUsePro !== true

  return (
    <GateContext.Provider value={value}>
      {children}
      <UpgradeRequiredDialog
        open={effectiveDialogOpen}
        variant={dialogVariant}
        actionKey={dialogActionKey}
        entitlement={entitlement}
        onClose={() => {
          setDialogOpen(false)
          if (dialogVariant === 'expired_trial') setAutoDismissed(true)
        }}
        onGoToPlans={() => {
          setDialogOpen(false)
          if (dialogVariant === 'expired_trial') setAutoDismissed(true)
          navigate('/ustawienia/subskrypcja')
        }}
      />
    </GateContext.Provider>
  )
}

type ProGateActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  /** Called only when PRO is active. */
  onAllowed: () => void
  variant?: UpgradeDialogVariant
  actionKey?: ProGateActionKey
  showLock?: boolean
  className?: string
}

/**
 * Button that runs onAllowed when PRO is active; otherwise opens upgrade dialog.
 * Avoids native disabled so keyboard users can still learn why.
 */
export function ProGateAction({
  children,
  onAllowed,
  variant = 'pro_required_action',
  actionKey,
  showLock = true,
  className = '',
  type = 'button',
  ...rest
}: ProGateActionProps) {
  const { requirePro, canUsePro, loading } = useProAccessGate()
  const locked = canUsePro === false

  return (
    <button
      type={type}
      {...rest}
      className={`${styles.action} ${locked ? styles.locked : ''} ${className}`.trim()}
      title={locked ? PRO_LOCKED_HINT : rest.title}
      aria-label={
        locked
          ? `${typeof children === 'string' ? children : 'Akcja'} — ${PRO_LOCKED_ARIA}`
          : rest['aria-label']
      }
      onClick={(e) => {
        rest.onClick?.(e)
        if (e.defaultPrevented) return
        if (loading) return
        requirePro(onAllowed, { variant, actionKey })
      }}
    >
      {showLock && locked ? <ProLockIcon className={styles.lock} /> : null}
      {children}
    </button>
  )
}
