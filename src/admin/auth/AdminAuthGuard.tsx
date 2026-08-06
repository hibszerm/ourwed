import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAdminAuth } from '@/admin/auth/useAdminAuth'
import { AdminShell } from '@/admin/shell/AdminShell'
import styles from '@/admin/styles/admin.module.css'

/**
 * Centralized admin guard — session + enabled owner + AAL2.
 * Public routes (login / unauthorized / mfa) are outside this layout.
 */
export function AdminAuthGuard() {
  const { decision, loading } = useAdminAuth()
  const location = useLocation()

  if (loading || decision.kind === 'loading') {
    return (
      <div className={styles.loadingScreen} data-testid="admin-auth-loading">
        <p>Sprawdzanie uprawnień…</p>
      </div>
    )
  }

  if (decision.kind === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (decision.kind === 'unauthorized') {
    return <Navigate to="/unauthorized" replace />
  }

  if (decision.kind === 'mfa_setup') {
    if (location.pathname.startsWith('/mfa/setup')) {
      return <Outlet />
    }
    return <Navigate to="/mfa/setup" replace />
  }

  if (decision.kind === 'mfa_verify') {
    if (location.pathname.startsWith('/mfa/verify')) {
      return <Outlet />
    }
    return <Navigate to="/mfa/verify" replace />
  }

  // authorized (AAL2)
  if (
    location.pathname.startsWith('/mfa/') ||
    location.pathname === '/login'
  ) {
    return <Navigate to="/overview" replace />
  }

  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  )
}
