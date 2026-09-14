import { createContext, useContext, type ReactNode } from 'react'

export type AssistantContextValue = {
  open: boolean
  openAssistant: () => void
  closeAssistant: () => void
  MobileLauncher: () => ReactNode
  SidebarLauncher: () => ReactNode
}

export const AssistantContext = createContext<AssistantContextValue | null>(
  null,
)

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext)
  if (!ctx) {
    throw new Error('useAssistant must be used within AssistantProvider')
  }
  return ctx
}

export function useAssistantOptional(): AssistantContextValue | null {
  return useContext(AssistantContext)
}
