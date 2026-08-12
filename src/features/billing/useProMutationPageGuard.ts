import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProAccessGate } from '@/features/billing/ProAccessGate'

/**
 * For deep-linked create/edit routes: if PRO is inactive, open upgrade dialog
 * once and replace-navigate to a safe view route. Does not flash as expired while loading.
 */
export function useProMutationPageGuard(fallbackTo: string) {
  const { canUsePro, loading, openUpgradeDialog } = useProAccessGate()
  const navigate = useNavigate()
  const gatedRef = useRef(false)

  useEffect(() => {
    if (loading || canUsePro !== false || gatedRef.current) return
    gatedRef.current = true
    openUpgradeDialog('pro_required_action')
    navigate(fallbackTo, { replace: true })
  }, [loading, canUsePro, openUpgradeDialog, navigate, fallbackTo])

  return { blocked: !loading && canUsePro === false, loading }
}
