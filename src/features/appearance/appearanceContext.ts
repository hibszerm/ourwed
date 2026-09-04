import { createContext } from 'react'
import type {
  Appearance,
  AppearancePersistStatus,
} from '@/features/appearance/types'

export interface AppearanceContextValue {
  appearance: Appearance
  persistStatus: AppearancePersistStatus
  persistError: string | null
  setAppearance: (appearance: Appearance) => Promise<void>
  isReconciling: boolean
}

export const AppearanceContext =
  createContext<AppearanceContextValue | null>(null)
