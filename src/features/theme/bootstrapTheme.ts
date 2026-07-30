/**
 * Synchronous theme bootstrap — import before React paint to limit FOUC.
 * Reads only a validated theme ID from localStorage (never full token JSON).
 */
import { applyThemeToDocument } from '@/features/theme/applyTheme'
import { readCachedThemeId } from '@/features/theme/themeCache'

applyThemeToDocument(readCachedThemeId(null))
