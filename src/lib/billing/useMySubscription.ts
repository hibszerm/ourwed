/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from 'react'
import type { SubscriptionSummary } from '@/lib/billing/entitlement'
import { fetchMySubscriptionSummary } from '@/lib/billing/subscriptionApi'
import { ensureTrialNotifications } from '@/lib/billing/trialNotifications'

export type SubscriptionHookState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SubscriptionSummary }

/**
 * Customer entitlement for the signed-in billing account.
 * Refreshes on focus; fetch failure is never treated as expired.
 */
export function useMySubscription() {
  const [state, setState] = useState<SubscriptionHookState>({ status: 'loading' })

  const refresh = useCallback(async () => {
    try {
      const data = await fetchMySubscriptionSummary()
      setState({ status: 'ready', data })
    } catch (err) {
      setState({
        status: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Nie udało się sprawdzić statusu subskrypcji.',
      })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  // Periodic revalidation so admin grant/extend unlocks without logout.
  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh()
    }, 60_000)
    return () => window.clearInterval(id)
  }, [refresh])

  useEffect(() => {
    if (state.status !== 'ready') return
    void ensureTrialNotifications(state.data.entitlement).catch(() => {
      /* never block UX */
    })
  }, [state])

  return { state, refresh }
}
