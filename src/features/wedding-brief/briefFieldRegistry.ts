/**
 * Wedding Brief field classification + destination registry.
 * Every operational questionnaire answer must map somewhere (or ADMIN_ONLY).
 */

export type BriefClassification =
  | 'IDENTITY'
  | 'CONTACT'
  | 'TIMELINE'
  | 'LOCATION'
  | 'LOGISTICS'
  | 'CRITICAL_NOTE'
  | 'PHOTO_VIDEO_PRIORITY'
  | 'FAMILY_SENSITIVITY'
  | 'CEREMONY_NOTE'
  | 'GROUP_PHOTO'
  | 'VENDOR'
  | 'COMMERCIAL'
  | 'ADMIN_ONLY'
  | 'OPERATIONAL_OTHER'

/** Where a fact is rendered in the field brief. */
export type BriefDestination =
  | 'assignment'
  | 'contacts'
  | 'timeline'
  | 'locations'
  | 'nie_przegap'
  | 'section_family'
  | 'section_ceremony'
  | 'section_photo'
  | 'section_group_photo'
  | 'section_blessing_logistics'
  | 'section_music'
  | 'section_other'
  | 'vendors'
  | 'settlement'
  | 'additional'
  | 'omit'

export type BriefFieldRule = {
  classification: BriefClassification
  destination: BriefDestination
  /** Concise field-brief label (not the verbose questionnaire prompt). */
  briefLabel: string
  /** Prefer Nie przegap when content is high-priority. */
  criticalEligible?: boolean
}

/** Rules keyed by weddingDayMapping. */
export const BRIEF_MAPPING_RULES: Record<string, BriefFieldRule> = {
  weddingDate: {
    classification: 'IDENTITY',
    destination: 'assignment',
    briefLabel: 'Data ślubu',
  },
  brideName: {
    classification: 'CONTACT',
    destination: 'contacts',
    briefLabel: 'Panna Młoda',
  },
  bridePhone: {
    classification: 'CONTACT',
    destination: 'contacts',
    briefLabel: 'Panna Młoda',
  },
  groomName: {
    classification: 'CONTACT',
    destination: 'contacts',
    briefLabel: 'Pan Młody',
  },
  groomPhone: {
    classification: 'CONTACT',
    destination: 'contacts',
    briefLabel: 'Pan Młody',
  },
  bridePreparationLocation: {
    classification: 'LOCATION',
    destination: 'locations',
    briefLabel: 'Przygotowania Panny Młodej',
  },
  groomPreparationLocation: {
    classification: 'LOCATION',
    destination: 'locations',
    briefLabel: 'Przygotowania Pana Młodego',
  },
  groomDepartureNote: {
    classification: 'LOGISTICS',
    destination: 'section_blessing_logistics',
    briefLabel: 'Wyjazd Pana Młodego',
    criticalEligible: true,
  },
  blessingPlan: {
    classification: 'CEREMONY_NOTE',
    destination: 'section_blessing_logistics',
    briefLabel: 'Błogosławieństwo',
    criticalEligible: true,
  },
  departureToCeremonyTime: {
    classification: 'TIMELINE',
    destination: 'timeline',
    briefLabel: 'Wyjazd do ceremonii',
  },
  ceremonyLocation: {
    classification: 'LOCATION',
    destination: 'locations',
    briefLabel: 'Ceremonia',
  },
  ceremonyTime: {
    classification: 'TIMELINE',
    destination: 'timeline',
    briefLabel: 'Ceremonia',
  },
  ceremonyNotes: {
    classification: 'CEREMONY_NOTE',
    destination: 'nie_przegap',
    briefLabel: 'Ceremonia — priorytety',
    criticalEligible: true,
  },
  groupPhotoPlan: {
    classification: 'GROUP_PHOTO',
    destination: 'nie_przegap',
    briefLabel: 'Zdjęcie grupowe',
    criticalEligible: true,
  },
  guestWishesPlan: {
    classification: 'CEREMONY_NOTE',
    destination: 'section_ceremony',
    briefLabel: 'Życzenia od gości',
  },
  receptionVenue: {
    classification: 'LOCATION',
    destination: 'locations',
    briefLabel: 'Przyjęcie',
  },
  receptionArrivalTime: {
    classification: 'TIMELINE',
    destination: 'timeline',
    briefLabel: 'Przyjęcie',
  },
  guestCount: {
    classification: 'IDENTITY',
    destination: 'assignment',
    briefLabel: 'Liczba gości',
  },
  smallGroupPhotosPlan: {
    classification: 'GROUP_PHOTO',
    destination: 'section_group_photo',
    briefLabel: 'Zdjęcia w mniejszych grupach',
  },
  photoVideoPriorities: {
    classification: 'PHOTO_VIDEO_PRIORITY',
    destination: 'section_photo',
    briefLabel: 'Zdjęcia i film — priorytety',
    criticalEligible: true,
  },
  sensitiveFamilyNotes: {
    classification: 'FAMILY_SENSITIVITY',
    destination: 'nie_przegap',
    briefLabel: 'Rodzina i wrażliwe sytuacje',
    criticalEligible: true,
  },
  djBandProvider: {
    classification: 'VENDOR',
    destination: 'vendors',
    briefLabel: 'DJ / zespół',
  },
}

/**
 * Rules for known question IDs without weddingDayMapping
 * (or overrides when mapping is absent).
 */
export const BRIEF_QUESTION_RULES: Record<string, BriefFieldRule> = {
  q20: {
    classification: 'LOGISTICS',
    destination: 'additional',
    briefLabel: 'Harmonogram (uwaga)',
  },
  q22: {
    classification: 'PHOTO_VIDEO_PRIORITY',
    destination: 'section_music',
    briefLabel: 'Muzyka do filmu',
  },
  q23: {
    classification: 'PHOTO_VIDEO_PRIORITY',
    destination: 'section_photo',
    briefLabel: 'Preferencje zdjęć i filmu',
  },
  q25: {
    classification: 'VENDOR',
    destination: 'vendors',
    briefLabel: 'Usługodawcy',
  },
  q27_info: {
    classification: 'ADMIN_ONLY',
    destination: 'omit',
    briefLabel: 'Wskazówki',
  },
  q28: {
    classification: 'ADMIN_ONLY',
    destination: 'omit',
    briefLabel: 'Potwierdzenie wskazówek',
  },
}

export const OPERATIONAL_SECTION_TITLES: Record<
  Extract<
    BriefDestination,
    | 'section_family'
    | 'section_ceremony'
    | 'section_photo'
    | 'section_group_photo'
    | 'section_blessing_logistics'
    | 'section_music'
    | 'section_other'
  >,
  string
> = {
  section_family: 'Rodzina i ważne sytuacje',
  section_ceremony: 'Ceremonia',
  section_photo: 'Zdjęcia i film',
  section_group_photo: 'Zdjęcia grupowe',
  section_blessing_logistics: 'Błogosławieństwo i logistyka',
  section_music: 'Muzyka / preferencje',
  section_other: 'Pozostałe istotne informacje',
}

export function resolveBriefFieldRule(input: {
  questionId: string
  mapping?: string | null
  questionType?: string
}): BriefFieldRule {
  if (input.questionType === 'information' || input.questionType === 'acknowledgement') {
    return (
      BRIEF_QUESTION_RULES[input.questionId] ?? {
        classification: 'ADMIN_ONLY',
        destination: 'omit',
        briefLabel: 'Administracyjne',
      }
    )
  }
  if (input.mapping && BRIEF_MAPPING_RULES[input.mapping]) {
    return BRIEF_MAPPING_RULES[input.mapping]!
  }
  if (BRIEF_QUESTION_RULES[input.questionId]) {
    return BRIEF_QUESTION_RULES[input.questionId]!
  }
  // Unmapped non-empty answers → additional (never silent drop).
  return {
    classification: 'OPERATIONAL_OTHER',
    destination: 'additional',
    briefLabel: 'Dodatkowa informacja',
  }
}

export function isAdminOnlyRule(rule: BriefFieldRule): boolean {
  return rule.classification === 'ADMIN_ONLY' || rule.destination === 'omit'
}
