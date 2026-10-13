/* eslint-disable react-refresh/only-export-components -- Vite test entry intentionally mounts local fixture components. */
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Link, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { CollaborativeWeddingDetailPage, CollaborativeWeddingListPage } from '@/features/collaboration/CollaborativeWeddingPages'
import { collaborativeWeddingQueryKeys } from '@/features/collaboration/useCollaborativeWeddings'
import type { CollaborativeWeddingDetail, CollaborativeWeddingListItem } from '@/features/collaboration/collaborativeWeddingTypes'
import { queryClient } from '@/lib/queryClient'

const weddingId = 'a1000000-0000-4000-8000-000000000001'
const listItem: CollaborativeWeddingListItem = {
  wedding_id: weddingId,
  couple_first_name: 'Ada',
  couple_second_name: 'Member',
  wedding_date: '2027-06-01',
}
const collaborativeDetail: CollaborativeWeddingDetail = {
  ...listItem,
  places: [{ role: 'ceremony', formatted_address: 'Local synthetic ceremony address', operational_time: '09:05' }],
}
const removedCollaborativeListUserIds = new Set<string>()

queryClient.getQueryCache().subscribe((event) => {
  if (event.type !== 'removed') return
  const key = event.query.queryKey
  if (key[0] === 'collaboration' && key[1] === 'weddings' && typeof key[2] === 'string') {
    removedCollaborativeListUserIds.add(key[2])
  }
})

declare global {
  interface Window {
    __collabTest?: {
      login(email: string, password: string): Promise<void>
      logout(): Promise<void>
      currentUserId(): string | null
      refetchDetail(weddingId?: string): Promise<void>
      seedPrivateCaches(userId: string): void
      seedAccessLossIsolation(userId: string, otherUserId: string): void
      wasCollaborativeListRemoved(userId: string): boolean
      cacheSnapshot(userId: string, weddingId?: string): {
        collaborativeDetail: CollaborativeWeddingDetail | undefined
        collaborativeListHasWedding: boolean
        collaborativeListPresent: boolean
        collaborativeListPageLengths: number[]
        ownerWedding: unknown
        ownerWeddingList: unknown
        mutationCount: number
      }
      otherIdentityListPresent(userId: string): boolean
    }
  }
}

function TestControls() {
  const auth = useAuth()

  useEffect(() => {
    window.__collabTest = {
      async login(email, password) {
        const result = await auth.login(email, password)
        if (!result.success) throw new Error('local_test_login_failed')
      },
      logout: auth.logout,
      currentUserId: () => auth.user?.id ?? null,
      async refetchDetail(targetWeddingId = weddingId) {
        if (!auth.user?.id) throw new Error('local_test_user_required')
        await queryClient.invalidateQueries({
          queryKey: collaborativeWeddingQueryKeys.detail(auth.user.id, targetWeddingId),
          exact: true,
        })
      },
      seedPrivateCaches(userId) {
        queryClient.setQueryData(collaborativeWeddingQueryKeys.list(userId), {
          pages: [[listItem]],
          pageParams: [{ afterWeddingDate: null, afterWeddingId: null }],
        })
        queryClient.setQueryData(collaborativeWeddingQueryKeys.detail(userId, weddingId), collaborativeDetail)
        const ownerWedding = {
          id: weddingId,
          brideName: 'Owner private sentinel',
          groomName: 'Owner private sentinel',
          phone: 'OWNER_PRIVATE_PHONE_SENTINEL',
          contractValue: 90000,
        }
        queryClient.setQueryData(['weddings', userId], [ownerWedding])
        queryClient.setQueryData(['weddings', userId, weddingId], ownerWedding)
        queryClient.getMutationCache().build(queryClient, {
          mutationKey: ['tenant-private-mutation', userId],
          mutationFn: async () => null,
        })
      },
      seedAccessLossIsolation(userId, otherUserId) {
        const ownerWedding = {
          id: weddingId,
          brideName: 'Owner cache survives targeted access loss',
          groomName: 'Owner cache survives targeted access loss',
        }
        queryClient.setQueryData(['weddings', userId, weddingId], ownerWedding)
        queryClient.setQueryData(collaborativeWeddingQueryKeys.list(otherUserId), {
          pages: [[{ ...listItem, wedding_id: 'a1000000-0000-4000-8000-000000000099' }]],
          pageParams: [{ afterWeddingDate: null, afterWeddingId: null }],
        })
      },
      wasCollaborativeListRemoved(userId) {
        return removedCollaborativeListUserIds.has(userId)
      },
      cacheSnapshot(userId, targetWeddingId = weddingId) {
        const collaborativeList = queryClient.getQueryData<{
          pages: CollaborativeWeddingListItem[][]
        }>(collaborativeWeddingQueryKeys.list(userId))
        return {
          collaborativeDetail: queryClient.getQueryData<CollaborativeWeddingDetail>(
            collaborativeWeddingQueryKeys.detail(userId, targetWeddingId),
          ),
          collaborativeListHasWedding: Boolean(collaborativeList?.pages.flat().some((item) => item.wedding_id === targetWeddingId)),
          collaborativeListPresent: queryClient.getQueryData(collaborativeWeddingQueryKeys.list(userId)) !== undefined,
          collaborativeListPageLengths: collaborativeList?.pages.map((page) => page.length) ?? [],
          ownerWedding: queryClient.getQueryData(['weddings', userId, weddingId]),
          ownerWeddingList: queryClient.getQueryData(['weddings', userId]),
          mutationCount: queryClient.getMutationCache().getAll().length,
        }
      },
      otherIdentityListPresent(userId) {
        return queryClient.getQueryData(collaborativeWeddingQueryKeys.list(userId)) !== undefined
      },
    }
    return () => { delete window.__collabTest }
  }, [auth])

  return <output data-testid="auth-user-id">{auth.user?.id ?? 'signed-out'}</output>
}

function StartPage() {
  return <main><h1>Local behavior test</h1><Link to="/wspolpraca/sluby">Open collaboration</Link></main>
}

function App() {
  return <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <HashRouter>
        <TestControls />
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="/wspolpraca/sluby" element={<CollaborativeWeddingListPage />} />
          <Route path="/wspolpraca/sluby/:weddingId" element={<CollaborativeWeddingDetailPage />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  </QueryClientProvider>
}

createRoot(document.getElementById('root')!).render(<App />)
