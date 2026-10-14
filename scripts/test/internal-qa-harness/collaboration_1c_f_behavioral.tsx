/* eslint-disable react-refresh/only-export-components -- local disposable browser fixture. */
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { CollaborationAccessManagementSheet } from '@/features/collaboration/CollaborationAccessManagementSheet'

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

declare global {
  interface Window { __onecfTest?: { login(email: string, password: string): Promise<void>; currentUserId(): string | null } }
}
function Controls() {
  const auth = useAuth()
  const [open, setOpen] = useState(true)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    window.__onecfTest = {
      async login(email, password) {
        const result = await auth.login(email, password)
        if (!result.success) throw new Error('local_test_login_failed')
      },
      currentUserId: () => auth.user?.id ?? null,
    }
    return () => { delete window.__onecfTest }
  }, [auth])
  return <main>
    <output data-testid="auth-user-id">{auth.user?.id ?? 'signed-out'}</output>
    <button type="button" data-testid="open-management" ref={triggerRef} onClick={() => setOpen(true)}>Open management</button>
    {open ? <CollaborationAccessManagementSheet weddingId="8cf00000-0000-4000-8000-000000000001"
      invitationId="8cf00000-0000-4000-8000-000000000002" returnFocusTargetRef={triggerRef}
      onClose={() => setOpen(false)} /> : null}
  </main>
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><AuthProvider><Controls /></AuthProvider></QueryClientProvider>)
