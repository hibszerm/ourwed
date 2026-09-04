/**
 * Content normalization for the three owned pre-wedding candidate templates.
 * Does not seed defaults, assign source_keys, or change required/mappings.
 */

import type {
  PreWeddingQuestion,
  PreWeddingSection,
  PreWeddingTemplateSchema,
} from '@/types/preweddingQuestionnaire'

export type CandidateKind = 'film' | 'photography' | 'photo_video'

export const CANDIDATE_PUBLIC_TITLE = 'Ankieta przedślubna'

export const CANDIDATE_PUBLIC_INTRO =
  'Cześć! Już niedługo się widzimy. Potrzebujemy od Was kilku informacji, które pomogą nam dobrze przygotować się do Waszego dnia.'

export const CANDIDATE_SCHEDULE_LABEL =
  'Jeśli macie harmonogram wesela, wklejcie go poniżej albo napiszcie, gdzie możemy go znaleźć.'

export const CANDIDATE_SCHEDULE_PLACEHOLDER =
  'np. wklejony poniżej albo link do dokumentu'

export const CANDIDATE_MUSIC_LABEL =
  'Zazwyczaj wybieramy licencjonowaną muzykę do teledysku i filmu. Jeśli jakiś utwór jest dla Was ważny i chcecie, aby został użyty w teledysku lub filmie, podeślijcie go proszę przed dniem wesela.'

export const CANDIDATE_MUSIC_OPTIONS_FILM = [
  'Zdajemy się na Wasz wybór',
  'Podeślemy własne propozycje',
] as const

export const CANDIDATE_NO_FILM_OPTION = 'Nie mamy filmu'

export const CANDIDATE_MUSIC_OPTIONS_PHOTOGRAPHY = [
  ...CANDIDATE_MUSIC_OPTIONS_FILM,
  CANDIDATE_NO_FILM_OPTION,
] as const

export const CANDIDATE_VENDORS_LABEL =
  'Wymieńcie nam proszę wszystkich Waszych usługodawców, z których korzystacie tego dnia (suknie, makijaż, dekoracje, fryzura itp.).'

export const CANDIDATE_TIPS_SECTION_TITLE = 'Wskazówki'

export const SPEECH_QUESTION_ID = 'q_speeches'

export const TIPS_INFO_ID = 'q27_info'
export const TIPS_ACK_ID = 'q28'

const MAPPING_TO_CANONICAL_ID: Record<string, string> = {
  weddingDate: 'q1',
  brideName: 'q2',
  bridePhone: 'q3',
  bridePreparationLocation: 'q4',
  groomName: 'q5',
  groomPhone: 'q6',
  groomPreparationLocation: 'q7',
  groomDepartureNote: 'q8',
  blessingPlan: 'q9',
  departureToCeremonyTime: 'q10',
  ceremonyLocation: 'q11',
  ceremonyTime: 'q12',
  ceremonyNotes: 'q13',
  groupPhotoPlan: 'q14',
  guestWishesPlan: 'q15',
  receptionVenue: 'q16',
  receptionArrivalTime: 'q17',
  guestCount: 'q18',
  smallGroupPhotosPlan: 'q19',
  photoVideoPriorities: 'q21',
  sensitiveFamilyNotes: 'q24',
  djBandProvider: 'q26',
}

export type CandidateTemplateInput = {
  title: string
  introduction: string
  schema: PreWeddingTemplateSchema
}

export function restoreTipsHelpText(helpText: string): string {
  let text = helpText.replace(/\r\n/g, '\n')
  text = text.replace(/\bode mnie\b/gi, 'od nas')
  text = text.replace(/\bmojej pracy\b/gi, 'naszej pracy')
  if (!text.includes('\n')) {
    text = text.replace(/:\)\s*(?=\d+\.)/g, ':)\n')
    text = text.replace(/(?<!\n)(\d+)\.\s+/g, '\n$1. ')
  }
  return text.replace(/[ \t]+\n/g, '\n').trim()
}

function cloneSchema(schema: PreWeddingTemplateSchema): PreWeddingTemplateSchema {
  return JSON.parse(JSON.stringify(schema)) as PreWeddingTemplateSchema
}

function isHashedGeneratedId(id: string): boolean {
  return /^(q|s)_[0-9a-f]{8,}$/i.test(id)
}

export function canonicalQuestionId(question: PreWeddingQuestion): string {
  const mapping = question.weddingDayMapping?.trim()
  if (mapping && MAPPING_TO_CANONICAL_ID[mapping]) {
    return MAPPING_TO_CANONICAL_ID[mapping]!
  }
  if (question.type === 'information') return TIPS_INFO_ID
  if (question.type === 'acknowledgement') return TIPS_ACK_ID
  if (/harmonogram/i.test(question.label)) return 'q20'
  if (
    question.type === 'single_choice' &&
    /muzyk/i.test(question.label)
  ) {
    return 'q22'
  }
  if (question.type === 'long_text' && /podoba/i.test(question.label)) {
    return 'q23'
  }
  if (/usługodawc/i.test(question.label)) return 'q25'
  if (/przemow/i.test(question.label)) {
    return SPEECH_QUESTION_ID
  }
  return question.id
}

function remapSchemaIds(schema: PreWeddingTemplateSchema): PreWeddingTemplateSchema {
  return {
    sections: schema.sections.map((section, index) => {
      const nextSectionId = isHashedGeneratedId(section.id)
        ? `s${index + 1}`
        : section.id
      return {
        ...section,
        id: nextSectionId,
        questions: section.questions.map((question) => ({
          ...question,
          id: canonicalQuestionId(question),
        })),
      }
    }),
  }
}

function isMusicQuestion(question: PreWeddingQuestion): boolean {
  return question.id === 'q22' || /muzyk/i.test(question.label)
}

function isScheduleQuestion(question: PreWeddingQuestion): boolean {
  return question.id === 'q20' || /harmonogram/i.test(question.label)
}

function isVendorsQuestion(question: PreWeddingQuestion): boolean {
  return question.id === 'q25' || /usługodawc/i.test(question.label)
}

function isTipsSection(section: PreWeddingSection): boolean {
  return (
    /wskazówk/i.test(section.title) ||
    section.questions.some((q) => q.type === 'information' || q.id === TIPS_INFO_ID)
  )
}

function normalizeQuestionCopy(
  question: PreWeddingQuestion,
  kind: CandidateKind,
): PreWeddingQuestion {
  const next: PreWeddingQuestion = { ...question }
  if (isScheduleQuestion(next)) {
    next.label = CANDIDATE_SCHEDULE_LABEL
    if (next.placeholder) {
      next.placeholder = CANDIDATE_SCHEDULE_PLACEHOLDER
    }
  }
  if (isMusicQuestion(next)) {
    next.label = CANDIDATE_MUSIC_LABEL
    if (kind === 'photography') {
      const hasNoFilm = (next.options ?? []).includes(CANDIDATE_NO_FILM_OPTION)
      next.options = hasNoFilm
        ? [...CANDIDATE_MUSIC_OPTIONS_PHOTOGRAPHY]
        : [...CANDIDATE_MUSIC_OPTIONS_FILM]
    } else {
      next.options = [...CANDIDATE_MUSIC_OPTIONS_FILM]
    }
  }
  if (isVendorsQuestion(next)) {
    next.label = CANDIDATE_VENDORS_LABEL
  }
  if (next.id === TIPS_INFO_ID && typeof next.helpText === 'string') {
    next.helpText = restoreTipsHelpText(next.helpText)
  }
  return next
}

export function normalizeCandidateTemplate(
  kind: CandidateKind,
  input: CandidateTemplateInput,
): CandidateTemplateInput {
  const remapped = remapSchemaIds(cloneSchema(input.schema))
  const schema: PreWeddingTemplateSchema = {
    sections: remapped.sections.map((section) => {
      const title = isTipsSection(section)
        ? CANDIDATE_TIPS_SECTION_TITLE
        : section.title.trim()
      return {
        ...section,
        title,
        questions: section.questions.map((question) =>
          normalizeQuestionCopy(question, kind),
        ),
      }
    }),
  }
  return {
    title: CANDIDATE_PUBLIC_TITLE,
    introduction: CANDIDATE_PUBLIC_INTRO,
    schema,
  }
}

export function collectQuestionIds(schema: PreWeddingTemplateSchema): string[] {
  return schema.sections.flatMap((s) => s.questions.map((q) => q.id))
}

export function requiredFlagMap(
  schema: PreWeddingTemplateSchema,
): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const section of schema.sections) {
    for (const question of section.questions) {
      out[canonicalQuestionId(question)] = Boolean(question.required)
    }
  }
  return out
}

export function mappingMap(
  schema: PreWeddingTemplateSchema,
): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const section of schema.sections) {
    for (const question of section.questions) {
      out[canonicalQuestionId(question)] = question.weddingDayMapping ?? null
    }
  }
  return out
}

export function hasGroupPhotoQuestion(schema: PreWeddingTemplateSchema): boolean {
  return schema.sections.some((section) =>
    section.questions.some(
      (q) =>
        q.weddingDayMapping === 'groupPhotoPlan' ||
        /zdjęcie grupowe/i.test(q.label),
    ),
  )
}
