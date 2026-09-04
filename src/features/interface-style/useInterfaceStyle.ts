import { useContext } from 'react'
import {
  InterfaceStyleContext,
  type InterfaceStyleContextValue,
} from '@/features/interface-style/interfaceStyleContext'

export function useInterfaceStyle(): InterfaceStyleContextValue {
  const ctx = useContext(InterfaceStyleContext)
  if (!ctx) {
    throw new Error(
      'useInterfaceStyle must be used within InterfaceStyleProvider',
    )
  }
  return ctx
}

export function useInterfaceStyleOptional(): InterfaceStyleContextValue | null {
  return useContext(InterfaceStyleContext)
}
