export type FeatureId =
  | 'finanse'
  | 'powiadomienia'
  | 'zadania'
  | 'umowy'
  | 'pakiety'
  | 'sluby'
  | 'sesje'
  | 'kalendarz'
  | 'ankiety'

export type AtlasSize = 'hero' | 'large' | 'medium' | 'compact'

export type FeatureAtlasDef = {
  id: FeatureId
  title: string
  description: string
  /** 12-column editorial span (desktop). */
  colSpan: number
  size: AtlasSize
}

/** Product Atlas — asymmetric editorial order (not equal grid). */
export const ATLAS_MODULES: readonly FeatureAtlasDef[] = [
  {
    id: 'finanse',
    title: 'Finanse',
    description: 'Przychody, wpłaty i pozostałe rozliczenia całego sezonu.',
    colSpan: 7,
    size: 'hero',
  },
  {
    id: 'powiadomienia',
    title: 'Powiadomienia',
    description: 'Przypomnienia o bieżących sprawach',
    colSpan: 5,
    size: 'hero',
  },
  {
    id: 'zadania',
    title: 'Zadania',
    description: 'Kolejne kroki zlecenia są gotowe do odhaczenia.',
    colSpan: 4,
    size: 'compact',
  },
  {
    id: 'umowy',
    title: 'Umowy',
    description: 'Dokument powstaje z danych zlecenia — bez przepisywania.',
    colSpan: 4,
    size: 'compact',
  },
  {
    id: 'pakiety',
    title: 'Pakiety',
    description: 'Ustal pakiety i wykorzystaj w zleceniach',
    colSpan: 4,
    size: 'compact',
  },
  {
    id: 'sluby',
    title: 'Śluby',
    description: 'Każde zlecenie ma własną kartę, status i kontekst dnia.',
    colSpan: 5,
    size: 'medium',
  },
  {
    id: 'kalendarz',
    title: 'Kalendarz',
    description: 'Śluby i sesje w jednym spokojnym terminarzu.',
    colSpan: 7,
    size: 'large',
  },
  {
    id: 'sesje',
    title: 'Sesje',
    description: 'Sesje i dodatkowe terminy w tym samym systemie.',
    colSpan: 5,
    size: 'medium',
  },
  {
    id: 'ankiety',
    title: 'Ankiety',
    description: 'Para uzupełnia dane raz — OurWed wykorzystuje je dalej.',
    colSpan: 7,
    size: 'large',
  },
] as const

/** @deprecated Use ATLAS_MODULES — kept for acceptance compatibility. */
export const FEATURE_CARDS = ATLAS_MODULES
