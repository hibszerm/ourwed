export type { Appearance, AppearancePersistStatus } from '@/features/appearance/types'
export {
  APPEARANCE_IDS,
  APPEARANCE_OPTIONS,
  DEFAULT_APPEARANCE,
  isAppearance,
  validateAppearance,
} from '@/features/appearance/types'
export {
  readCachedAppearance,
  writeCachedAppearance,
  clearCachedAppearance,
} from '@/features/appearance/appearanceCache'
export {
  getUserAppearance,
  updateUserAppearance,
  appearanceQueryKeys,
  validateAppearanceForPersist,
} from '@/features/appearance/appearanceService'
export {
  applyAppearanceToDocument,
  readDocumentAppearance,
  resetAppearanceToLight,
} from '@/features/appearance/applyAppearance'
export { resolveBrowserThemeColor } from '@/features/appearance/browserThemeColor'
export {
  AppearanceProvider,
} from '@/features/appearance/AppearanceProvider'
export { useAppearance, useAppearanceOptional } from '@/features/appearance/useAppearance'
export { AppearanceCard } from '@/features/appearance/AppearanceCard'
