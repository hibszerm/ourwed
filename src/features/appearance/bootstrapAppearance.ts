/**
 * Synchronous appearance bootstrap — import before React paint to limit FOUC.
 * Reads only a validated appearance from localStorage (never OS preference).
 */
import { applyAppearanceToDocument } from '@/features/appearance/applyAppearance'
import { readCachedAppearance } from '@/features/appearance/appearanceCache'

applyAppearanceToDocument(readCachedAppearance(null))
