import { useContext } from 'react'
import { AdminAuthContext } from '@/admin/auth/adminAuthContext'

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider')
  }
  return ctx
}
