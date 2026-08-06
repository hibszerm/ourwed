import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type {
  AdminAccessDecision,
  AdminAssurance,
  AdminSessionStatus,
} from '@/admin/lib/adminAccessDecision'

export type AdminAuthContextValue = {
  loading: boolean
  session: Session | null
  user: User | null
  status: AdminSessionStatus | null
  assurance: AdminAssurance | null
  decision: AdminAccessDecision
  refreshAuthorization: () => Promise<void>
  signOut: () => Promise<void>
}

export const AdminAuthContext = createContext<AdminAuthContextValue | null>(
  null,
)
