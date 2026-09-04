import { createContext } from 'react'
import type {
  InterfaceStyle,
  InterfaceStylePersistStatus,
} from '@/features/interface-style/types'

export interface InterfaceStyleContextValue {
  interfaceStyle: InterfaceStyle
  persistStatus: InterfaceStylePersistStatus
  persistError: string | null
  setInterfaceStyle: (interfaceStyle: InterfaceStyle) => Promise<void>
  isReconciling: boolean
}

export const InterfaceStyleContext =
  createContext<InterfaceStyleContextValue | null>(null)
