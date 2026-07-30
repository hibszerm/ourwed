import { SHARED_STATUS_TOKENS } from '@/features/theme/statusColors'
import {
  buildLegacyColorBridge,
  SEMANTIC_TOKEN_KEYS,
  type ThemeTokenMap,
} from '@/features/theme/tokenKeys'
import { CLASSIC_TOKENS } from '@/features/theme/tokens/classic'
import { GENTLEMEN_TOKENS } from '@/features/theme/tokens/gentlemen'
import { SAGE_GARDEN_TOKENS } from '@/features/theme/tokens/sageGarden'
import { BURGUNDY_ESTATE_TOKENS } from '@/features/theme/tokens/burgundyEstate'
import { MOCHA_EDITORIAL_TOKENS } from '@/features/theme/tokens/mochaEditorial'
import {
  DEFAULT_THEME_ID,
  THEME_IDS,
  type ThemeId,
} from '@/features/theme/types'

export interface ThemeDefinition {
  id: ThemeId
  /** Polish display name */
  name: string
  /** Polish short description */
  description: string
  /** Reference palette hexes (metadata / preview dots) */
  referencePalette: readonly string[]
  sortOrder: number
  tokens: ThemeTokenMap
}

export const THEME_REGISTRY: Record<ThemeId, ThemeDefinition> = {
  classic: {
    id: 'classic',
    name: 'Classic',
    description: 'Obecny, minimalistyczny wygląd OurWed.',
    referencePalette: ['#0a0a0a', '#f7f7f7', '#ffffff', '#5c5c5c', '#e8e8e8'],
    sortOrder: 0,
    tokens: CLASSIC_TOKENS,
  },
  gentlemen: {
    id: 'gentlemen',
    name: 'Gentlemen',
    description:
      'Elegancki motyw z grafitem, ciepłym beżem i szlachetnymi brązami.',
    referencePalette: ['#0A0908', '#22333B', '#EAE0D5', '#C6AC8E', '#5E503F'],
    sortOrder: 1,
    tokens: GENTLEMEN_TOKENS,
  },
  sage_garden: {
    id: 'sage_garden',
    name: 'Sage Garden',
    description:
      'Naturalny i spokojny motyw oparty na głębokiej zieleni i jasnej szałwii.',
    referencePalette: ['#0D2B1D', '#345635', '#6B8F71', '#AEC3B0', '#E3EFD3'],
    sortOrder: 2,
    tokens: SAGE_GARDEN_TOKENS,
  },
  burgundy_estate: {
    id: 'burgundy_estate',
    name: 'Burgundy Estate',
    description:
      'Klasyczny, luksusowy motyw z bordo, kremem i ciemnym brązem.',
    referencePalette: ['#EDE7C7', '#8B0000', '#5B0202', '#200E01'],
    sortOrder: 3,
    tokens: BURGUNDY_ESTATE_TOKENS,
  },
  mocha_editorial: {
    id: 'mocha_editorial',
    name: 'Mocha Editorial',
    description:
      'Ciepły, editorialowy motyw inspirowany naturalnymi brązami i taupe.',
    referencePalette: ['#332820', '#5A4D40', '#98867B', '#D0C6BD', '#EFEDEA'],
    sortOrder: 4,
    tokens: MOCHA_EDITORIAL_TOKENS,
  },
}

export function listThemes(): ThemeDefinition[] {
  return THEME_IDS.map((id) => THEME_REGISTRY[id]).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )
}

export function getTheme(id: ThemeId): ThemeDefinition {
  return THEME_REGISTRY[id] ?? THEME_REGISTRY[DEFAULT_THEME_ID]
}

/** Full CSS custom property map for a theme (semantic + status + legacy bridges). */
export function resolveThemeCssVariables(
  id: ThemeId,
): Record<string, string> {
  const theme = getTheme(id)
  return {
    ...SHARED_STATUS_TOKENS,
    ...theme.tokens,
    ...buildLegacyColorBridge(theme.tokens),
  }
}

export function assertThemeTokensComplete(id: ThemeId): string[] {
  const missing: string[] = []
  const tokens = getTheme(id).tokens
  for (const key of SEMANTIC_TOKEN_KEYS) {
    if (!tokens[key] || typeof tokens[key] !== 'string') {
      missing.push(key)
    }
  }
  return missing
}
