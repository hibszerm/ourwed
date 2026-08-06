import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { appendAdminAuditEvent } from '@/admin/lib/adminAudit'
import {
  decideAdminAccess,
  fetchAdminSessionStatus,
  fetchAuthenticatorAssurance,
  type AdminAssurance,
  type AdminSessionStatus,
} from '@/admin/lib/adminAuthorization'
import {
  AdminAuthContext,
  type AdminAuthContextValue,
} from '@/admin/auth/adminAuthContext'

async function loadAuthSnapshot(hasSession: boolean): Promise<{
  status: AdminSessionStatus | null
  assurance: AdminAssurance | null
}> {
  if (!hasSession) {
    return { status: null, assurance: null }
  }
  const [status, assurance] = await Promise.all([
    fetchAdminSessionStatus(),
    fetchAuthenticatorAssurance(),
  ])
  return { status, assurance }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AdminSessionStatus | null>(null)
  const [assurance, setAssurance] = useState<AdminAssurance | null>(null)

  const applySnapshot = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession)
    const snap = await loadAuthSnapshot(!!nextSession)
    setStatus(snap.status)
    setAssurance(snap.assurance)
  }, [])

  const refreshAuthorization = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await applySnapshot(data.session)
  }, [applySnapshot])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      await applySnapshot(data.session)
      if (!cancelled) setLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event, nextSession) => {
        if (cancelled) return
        if (
          event === 'SIGNED_IN' ||
          event === 'SIGNED_OUT' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED'
        ) {
          setLoading(true)
          await applySnapshot(nextSession)
          if (!cancelled) setLoading(false)
        }
      },
    )

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [applySnapshot])

  const signOut = useCallback(async () => {
    try {
      await appendAdminAuditEvent({ action: 'admin.logout' })
    } finally {
      await supabase.auth.signOut()
      setSession(null)
      setStatus(null)
      setAssurance(null)
    }
  }, [])

  const decision = useMemo(
    () =>
      decideAdminAccess({
        loading,
        hasSession: !!session,
        status,
        assurance,
      }),
    [loading, session, status, assurance],
  )

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      status,
      assurance,
      decision,
      refreshAuthorization,
      signOut,
    }),
    [
      loading,
      session,
      status,
      assurance,
      decision,
      refreshAuthorization,
      signOut,
    ],
  )

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  )
}
