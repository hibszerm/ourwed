import { createContext, useContext } from 'react'

export type ProductRenderMode = 'responsive' | 'desktopParity'

const DesktopParityContext = createContext<ProductRenderMode>('responsive')

export const DesktopParityProvider = DesktopParityContext.Provider

/** Inside a scaled product canvas, force desktop presentation. */
export function useProductRenderMode(): ProductRenderMode {
  return useContext(DesktopParityContext)
}

export function useIsDesktopParity(): boolean {
  return useContext(DesktopParityContext) === 'desktopParity'
}
