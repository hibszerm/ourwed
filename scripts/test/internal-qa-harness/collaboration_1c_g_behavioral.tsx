/* eslint-disable react-refresh/only-export-components -- local disposable browser fixture. */
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { CollaborationAccessManagementSheet } from '@/features/collaboration/CollaborationAccessManagementSheet'
import { WeddingCollaborationOwnerPanel } from '@/features/collaboration/WeddingCollaborationOwnerPanel'
import { CollaborationPermissionPresetManager } from '@/features/collaboration/CollaborationPermissionPresetManager'
import type { Wedding } from '@/types/wedding'

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wedding = { id: '8cg00000-0000-4000-8000-000000000001', date: '2027-06-01', status: 'active',
  workflowStage: 'planning', packageName: 'Local', price: 1000, currency: 'PLN', packageItems: [],
  couple: { partner1: 'Ala', partner2: 'Olek' }, displayName: 'Lokalne zlecenie' } as unknown as Wedding

declare global {
  interface Window { __onecgTest?: { login(email: string, password: string): Promise<void>; currentUserId(): string | null } }
}

function Controls() {
  const auth = useAuth()
  const [page, setPage] = useState<'settings' | 'pending' | 'accepted' | 'invite'>('settings')
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    window.__onecgTest = {
      async login(email, password) {
        const result = await auth.login(email, password)
        if (!result.success) throw new Error('local_test_login_failed')
      },
      currentUserId: () => auth.user?.id ?? null,
    }
    return () => { delete window.__onecgTest }
  }, [auth])
  return <main>
    <output data-testid="auth-user-id">{auth.user?.id ?? 'signed-out'}</output>
    <nav aria-label="Test surfaces">
      <button type="button" onClick={() => { setPage('settings'); setOpen(false) }}>Ustawienia</button>
      <button type="button" onClick={() => { setPage('pending'); setOpen(true) }}>Oczekujące</button>
      <button type="button" onClick={() => { setPage('accepted'); setOpen(true) }}>Aktywne</button>
      <button type="button" onClick={() => { setPage('invite'); setOpen(false) }}>Nowe zaproszenie</button>
    </nav>
    {page === 'settings' ? <CollaborationPermissionPresetManager /> : null}
    {page === 'pending' && open ? <CollaborationAccessManagementSheet weddingId={wedding.id}
      invitationId="8cg00000-0000-4000-8000-000000000002" returnFocusTargetRef={triggerRef}
      onClose={() => setOpen(false)} /> : null}
    {page === 'accepted' && open ? <CollaborationAccessManagementSheet weddingId={wedding.id}
      membershipId="8cg00000-0000-4000-8000-000000000003" returnFocusTargetRef={triggerRef}
      onClose={() => setOpen(false)} /> : null}
    {page === 'invite' ? <WeddingCollaborationOwnerPanel wedding={wedding} /> : null}
    <button type="button" data-testid="return-focus" ref={triggerRef}>Return focus</button>
  </main>
}

createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><AuthProvider><Controls /></AuthProvider></QueryClientProvider>)
