import { useContext } from 'react'
import {
  AppearanceContext,
  type AppearanceContextValue,
} from '@/features/appearance/appearanceContext'

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext)
  if (!ctx) {
    throw new Error('useAppearance must be used within AppearanceProvider')
  }
  return ctx
}

export function useAppearanceOptional(): AppearanceContextValue | null {
  return useContext(AppearanceContext)
}
