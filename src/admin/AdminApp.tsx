import { useEffect, useMemo } from 'react'
import { Navigate, createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AdminAuthGuard } from '@/admin/auth/AdminAuthGuard'
import { AdminAuthProvider } from '@/admin/auth/AdminAuthProvider'
import { resolveAdminMount } from '@/admin/config'
import { AdminAuditPage } from '@/admin/pages/AdminAuditPage'
import { AdminEmailsPage } from '@/admin/pages/AdminEmailsPage'
import { AdminIntegrationsPage } from '@/admin/pages/AdminIntegrationsPage'
import { AdminLoginPage } from '@/admin/pages/AdminLoginPage'
import { AdminMfaSetupPage } from '@/admin/pages/AdminMfaSetupPage'
import { AdminMfaVerifyPage } from '@/admin/pages/AdminMfaVerifyPage'
import { AdminOverviewPage } from '@/admin/pages/AdminOverviewPage'
import { AdminSubscriptionsPage } from '@/admin/pages/AdminSubscriptionsPage'
import { AdminSystemPage } from '@/admin/pages/AdminSystemPage'
import { AdminUnauthorizedPage } from '@/admin/pages/AdminUnauthorizedPage'
import { AdminUserDetailPage } from '@/admin/pages/AdminUserDetailPage'
import { AdminUsersPage } from '@/admin/pages/AdminUsersPage'

function createAdminRouter(basename: string) {
  return createBrowserRouter(
    [
      {
        path: '/login',
        element: <AdminLoginPage />,
      },
      {
        path: '/unauthorized',
        element: <AdminUnauthorizedPage />,
      },
      {
        element: <AdminAuthGuard />,
        children: [
          { path: '/mfa/setup', element: <AdminMfaSetupPage /> },
          { path: '/mfa/verify', element: <AdminMfaVerifyPage /> },
          { path: '/overview', element: <AdminOverviewPage /> },
          { path: '/users', element: <AdminUsersPage /> },
          { path: '/users/:userId', element: <AdminUserDetailPage /> },
          { path: '/subscriptions', element: <AdminSubscriptionsPage /> },
          { path: '/emails', element: <AdminEmailsPage /> },
          { path: '/integrations', element: <AdminIntegrationsPage /> },
          { path: '/system', element: <AdminSystemPage /> },
          { path: '/audit', element: <AdminAuditPage /> },
          { path: '/', element: <Navigate to="/overview" replace /> },
          { path: '*', element: <Navigate to="/overview" replace /> },
        ],
      },
    ],
    { basename },
  )
}

/**
 * Isolated admin application boundary.
 * No customer AppLayout, sidebar, landing, or registration.
 */
export function AdminApp() {
  const mount = resolveAdminMount()
  const router = useMemo(
    () => createAdminRouter(mount.basename),
    [mount.basename],
  )

  useEffect(() => {
    const previous = document.title
    document.title = 'OurWed Platform'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <AdminAuthProvider>
      <RouterProvider router={router} />
    </AdminAuthProvider>
  )
}
