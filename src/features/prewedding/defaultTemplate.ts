// =============================================================================
// Default Pre-Wedding Questionnaire Template
// OurWed built-in — chronological Wedding-day flow (v2)
// =============================================================================
// Internal source_key values (pre_wedding_default_v*) are stable identifiers only.
// v1 key is preserved for upgrade recognition. New seeds use v2.
// Do not mutate submitted questionnaire schema_snapshot_json from the app.

import type { PreWeddingTemplateSchema } from '@/types/preweddingQuestionnaire'

/** Legacy built-in key — existing studio templates / snapshots may still reference it. */
export const DEFAULT_TEMPLATE_SOURCE_KEY_V1 = 'pre_wedding_default_v1'

/** Current built-in key for newly seeded default templates. */
export const DEFAULT_TEMPLATE_SOURCE_KEY = 'pre_wedding_default_v2'

export const DEFAULT_TEMPLATE_NAME = 'Ankieta przedślubna'

export const DEFAULT_TEMPLATE_TITLE = 'Ankieta przedślubna'

export const DEFAULT_TEMPLATE_INTRODUCTION =
  'Cześć! Wasze odpowiedzi pomogą nam lepiej przygotować się do dnia ślubu.\n' +
  'Potrzebujemy od Was kilku informacji, które pozwolą nam lepiej zaplanować cały dzień.'

const TIPS_HELP =
  'Łapcie kilka wskazówek od Nas :)\n' +
  '1. Podczas przysięgi patrzcie na siebie i stójcie do siebie przodem.\n' +
  '2. Na zdjęciach i filmie najlepiej wygląda jednolite (najlepiej białe lub ciepłe) oświetlenie na sali.\n' +
  '3. Jeśli jakieś detale są dla Was ważne to przygotujcie je proszę na przygotowaniach w jednym miejscu.\n' +
  '4. Nie stresujcie się za bardzo - na pewno wszystko się uda :)\n' +
  '5. Jeśli planujecie atrakcje na Weselu, które chcecie mieć na zdjęciach i filmie pamiętajcie aby zaplanować je przed końcem naszej pracy.'

/** Legacy v1 schema (7 sections) — for tests / upgrade comparisons only. */
export const DEFAULT_TEMPLATE_SCHEMA_V1: PreWeddingTemplateSchema = {
  sections: [
    {
      id: 's1',
      title: 'Podstawowe informacje',
      questions: [
        { id: 'q1', label: 'Data ślubu', type: 'date', required: true, weddingDayMapping: 'weddingDate' },
        { id: 'q2', label: 'Imię i Nazwisko Panny Młodej', type: 'short_text', required: true, weddingDayMapping: 'brideName' },
        { id: 'q3', label: 'Telefon do Panny Młodej', type: 'short_text', required: true, weddingDayMapping: 'bridePhone' },
        { id: 'q4', label: 'Adres przygotowań Panny Młodej', type: 'address', required: true, weddingDayMapping: 'bridePreparationLocation' },
        { id: 'q5', label: 'Imię i Nazwisko Pana Młodego', type: 'short_text', required: true, weddingDayMapping: 'groomName' },
        { id: 'q6', label: 'Telefon do Pana Młodego', type: 'short_text', required: true, weddingDayMapping: 'groomPhone' },
        { id: 'q7', label: 'Adres przygotowań Pana Młodego', type: 'address', required: true, weddingDayMapping: 'groomPreparationLocation' },
      ],
    },
    {
      id: 's2',
      title: 'Przygotowania i błogosławieństwo',
      questions: [
        {
          id: 'q8',
          label:
            'Godzina wyjazdu Pana Młodego do Panny Młodej. Jeśli przygotowujecie się pod jednym adresem wpiszcie to też tutaj.',
          type: 'short_text',
          required: true,
          placeholder: 'np. 12:00 lub „Nie dotyczy, przygotowujemy się razem"',
          weddingDayMapping: 'groomDepartureNote',
        },
        {
          id: 'q9',
          label: 'Czy i gdzie będzie błogosławieństwo?',
          type: 'single_choice',
          required: true,
          options: [
            'Tak, jedno wspólne u Pana Młodego',
            'Tak, jedno wspólne u Panny Młodej',
            'Tak, osobne błogosławieństwa',
            'Nie będzie błogosławieństwa / Prosimy nie uwieczniać',
          ],
          weddingDayMapping: 'blessingPlan',
        },
      ],
    },
    {
      id: 's3',
      title: 'Ceremonia',
      questions: [
        { id: 'q10', label: 'Godzina wyjazdu do Kościoła / USC', type: 'time', required: true, weddingDayMapping: 'departureToCeremonyTime' },
        { id: 'q11', label: 'Adres Kościoła / USC / Ślubu plenerowego', type: 'address', required: true, weddingDayMapping: 'ceremonyLocation' },
        { id: 'q12', label: 'Godzina Ślubu', type: 'time', required: true, weddingDayMapping: 'ceremonyTime' },
        {
          id: 'q13',
          label:
            'Ważne dodatkowe elementy Ślubu - wpiszcie tutaj proszę na czym szczególnie Wam zależy podczas CEREMONII ŚLUBU co miałoby zostać uwiecznione oprócz przysięgi.',
          type: 'long_text',
          required: true,
          weddingDayMapping: 'ceremonyNotes',
        },
        {
          id: 'q14',
          label: 'Czy i gdzie chcecie zdjęcie grupowe ze wszystkimi gośćmi?',
          type: 'single_choice',
          required: true,
          options: ['Chcemy pod kościołem', 'Chcemy pod salą', 'Nie chcemy'],
          weddingDayMapping: 'groupPhotoPlan',
        },
        {
          id: 'q15',
          label: 'Życzenia od Gości',
          type: 'single_choice',
          required: true,
          options: [
            'Przed kościołem/USC - bezpośrednio po ceremonii',
            'Życzenia odbędą się na sali',
          ],
          weddingDayMapping: 'guestWishesPlan',
        },
      ],
    },
    {
      id: 's4',
      title: 'Przyjęcie weselne',
      questions: [
        { id: 'q16', label: 'Nazwa i adres sali weselnej', type: 'address', required: true, weddingDayMapping: 'receptionVenue' },
        { id: 'q17', label: 'Godzina przyjazdu na salę weselną', type: 'time', required: true, weddingDayMapping: 'receptionArrivalTime' },
        { id: 'q18', label: 'Liczba gości weselnych', type: 'short_text', required: true, placeholder: 'np. 80', weddingDayMapping: 'guestCount' },
        {
          id: 'q19',
          label: 'Czy chcecie zdjęcia rodzinne/ze znajomymi w mniejszych grupach przy sali?',
          type: 'yes_no',
          required: true,
          options: ['Tak', 'Nie'],
          weddingDayMapping: 'smallGroupPhotosPlan',
        },
        {
          id: 'q20',
          label:
            'Jeśli macie harmonogram wesela, podeślijcie go proszę fotografowi albo napiszcie poniżej, gdzie można go znaleźć.',
          type: 'short_text',
          required: true,
          placeholder: 'np. „Wysłano na maila" lub adres gdzie można znaleźć',
        },
      ],
    },
    {
      id: 's5',
      title: 'Zdjęcia i film',
      questions: [
        {
          id: 'q21',
          label: 'Dajcie proszę znać na czym szczególnie Wam zależy na zdjęciach i filmie? :)',
          type: 'long_text',
          required: true,
          weddingDayMapping: 'photoVideoPriorities',
        },
        {
          id: 'q22',
          label:
            'Zazwyczaj sami wybieramy licencjonowaną muzykę do teledysku i filmu. Jeśli jakiś utwór jest dla Was ważny i chcecie, aby został użyty w teledysku lub filmie wyślijcie go proszę PRZED dniem wesela.',
          type: 'single_choice',
          required: true,
          options: ['Zdajemy się na Ciebie!', 'Za chwilę podeślemy coś naszego!', 'Nie mamy filmu'],
        },
        {
          id: 'q23',
          label:
            'Czy jest coś w fotografii lub filmie co Wam się podoba/nie podoba? (Na przykład czarno białe kadry, rozmazane ujęcia)',
          type: 'long_text',
          required: true,
        },
        {
          id: 'q24',
          label:
            'Jeśli są jakiekolwiek ważne kwestie rodzinne, które wymagają uwagi lub zrozumienia z naszej strony - prosimy o informację.',
          type: 'long_text',
          required: false,
          weddingDayMapping: 'sensitiveFamilyNotes',
          helpText:
            'Ta odpowiedź jest widoczna wyłącznie dla fotografa i nie jest udostępniana nigdzie publicznie.',
        },
      ],
    },
    {
      id: 's6',
      title: 'Usługodawcy',
      questions: [
        {
          id: 'q25',
          label:
            'Wymieńcie nam proszę wszystkich Waszych usługodawców, z których korzystacie tego dnia (suknie, makijaż, dekoracje, fryzura itp.) - często się wzajemnie polecamy :)',
          type: 'long_text',
          required: true,
        },
        {
          id: 'q26',
          label:
            'Podajcie proszę nazwę osób (DJ/Zespół) odpowiedzialnych za oprawę muzyczną na weselu :)',
          type: 'long_text',
          required: true,
          weddingDayMapping: 'djBandProvider',
        },
      ],
    },
    {
      id: 's7',
      title: 'Wskazówki od nas',
      questions: [
        { id: 'q27_info', label: '', type: 'information', required: false, helpText: TIPS_HELP },
        { id: 'q28', label: 'Zapoznaliśmy się ze wskazówkami', type: 'acknowledgement', required: true },
      ],
    },
  ],
}

/**
 * v2 — chronological Wedding-day flow (11 sections).
 * Same question IDs / required flags / options as v1; regrouped only.
 */
export const DEFAULT_TEMPLATE_SCHEMA: PreWeddingTemplateSchema = {
  sections: [
    {
      id: 's1',
      title: 'O Was i Wasz ślub',
      description: 'Na początek potwierdźcie podstawowe dane dotyczące Was i dnia ślubu.',
      questions: [
        { id: 'q1', label: 'Data ślubu', type: 'date', required: true, weddingDayMapping: 'weddingDate' },
        { id: 'q2', label: 'Imię i Nazwisko Panny Młodej', type: 'short_text', required: true, weddingDayMapping: 'brideName' },
        { id: 'q3', label: 'Telefon do Panny Młodej', type: 'short_text', required: true, weddingDayMapping: 'bridePhone' },
        { id: 'q5', label: 'Imię i Nazwisko Pana Młodego', type: 'short_text', required: true, weddingDayMapping: 'groomName' },
        { id: 'q6', label: 'Telefon do Pana Młodego', type: 'short_text', required: true, weddingDayMapping: 'groomPhone' },
      ],
    },
    {
      id: 's2',
      title: 'Przygotowania Panny Młodej',
      description: 'Podajcie miejsce, w którym odbędą się przygotowania Panny Młodej.',
      questions: [
        {
          id: 'q4',
          label: 'Adres przygotowań Panny Młodej',
          type: 'address',
          required: true,
          weddingDayMapping: 'bridePreparationLocation',
          placeholder: 'Wpisz adres lub nazwę miejsca',
        },
      ],
    },
    {
      id: 's3',
      title: 'Przygotowania Pana Młodego',
      description: 'Podajcie miejsce, w którym odbędą się przygotowania Pana Młodego.',
      questions: [
        {
          id: 'q7',
          label: 'Adres przygotowań Pana Młodego',
          type: 'address',
          required: true,
          weddingDayMapping: 'groomPreparationLocation',
          placeholder: 'Wpisz adres lub nazwę miejsca',
        },
      ],
    },
    {
      id: 's4',
      title: 'Błogosławieństwo i wyjazd',
      description: 'Opowiedzcie nam, jak będzie wyglądało spotkanie przed ceremonią i wyjazd.',
      questions: [
        {
          id: 'q8',
          label:
            'Godzina wyjazdu Pana Młodego do Panny Młodej. Jeśli przygotowujecie się pod jednym adresem wpiszcie to też tutaj.',
          type: 'short_text',
          required: true,
          placeholder: 'np. 12:00 lub „Nie dotyczy, przygotowujemy się razem"',
          weddingDayMapping: 'groomDepartureNote',
        },
        {
          id: 'q9',
          label: 'Czy i gdzie będzie błogosławieństwo?',
          type: 'single_choice',
          required: true,
          options: [
            'Tak, jedno wspólne u Pana Młodego',
            'Tak, jedno wspólne u Panny Młodej',
            'Tak, osobne błogosławieństwa',
            'Nie będzie błogosławieństwa / Prosimy nie uwieczniać',
          ],
          weddingDayMapping: 'blessingPlan',
        },
      ],
    },
    {
      id: 's5',
      title: 'Ceremonia',
      description: 'Podajcie miejsce, godzinę i najważniejsze informacje dotyczące ceremonii.',
      questions: [
        { id: 'q10', label: 'Godzina wyjazdu do Kościoła / USC', type: 'time', required: true, weddingDayMapping: 'departureToCeremonyTime' },
        {
          id: 'q11',
          label: 'Adres Kościoła / USC / Ślubu plenerowego',
          type: 'address',
          required: true,
          weddingDayMapping: 'ceremonyLocation',
          placeholder: 'Wpisz adres lub nazwę miejsca',
        },
        { id: 'q12', label: 'Godzina Ślubu', type: 'time', required: true, weddingDayMapping: 'ceremonyTime' },
        {
          id: 'q13',
          label:
            'Ważne dodatkowe elementy Ślubu - wpiszcie tutaj proszę na czym szczególnie Wam zależy podczas CEREMONII ŚLUBU co miałoby zostać uwiecznione oprócz przysięgi.',
          type: 'long_text',
          required: true,
          weddingDayMapping: 'ceremonyNotes',
        },
      ],
    },
    {
      id: 's6',
      title: 'Po ceremonii',
      description: 'Dajcie znać, jak mają wyglądać życzenia i zdjęcie grupowe po ślubie.',
      questions: [
        {
          id: 'q14',
          label: 'Czy i gdzie chcecie zdjęcie grupowe ze wszystkimi gośćmi?',
          type: 'single_choice',
          required: true,
          options: ['Chcemy pod kościołem', 'Chcemy pod salą', 'Nie chcemy'],
          weddingDayMapping: 'groupPhotoPlan',
        },
        {
          id: 'q15',
          label: 'Życzenia od Gości',
          type: 'single_choice',
          required: true,
          options: [
            'Przed kościołem/USC - bezpośrednio po ceremonii',
            'Życzenia odbędą się na sali',
          ],
          weddingDayMapping: 'guestWishesPlan',
        },
      ],
    },
    {
      id: 's7',
      title: 'Przyjęcie weselne',
      description: 'Podajcie informacje o sali i najważniejszych punktach przyjęcia.',
      questions: [
        {
          id: 'q16',
          label: 'Nazwa i adres sali weselnej',
          type: 'address',
          required: true,
          weddingDayMapping: 'receptionVenue',
          placeholder: 'Wpisz nazwę sali lub adres',
        },
        { id: 'q17', label: 'Godzina przyjazdu na salę weselną', type: 'time', required: true, weddingDayMapping: 'receptionArrivalTime' },
        { id: 'q18', label: 'Liczba gości weselnych', type: 'short_text', required: true, placeholder: 'np. 80', weddingDayMapping: 'guestCount' },
        {
          id: 'q19',
          label: 'Czy chcecie zdjęcia rodzinne/ze znajomymi w mniejszych grupach przy sali?',
          type: 'yes_no',
          required: true,
          options: ['Tak', 'Nie'],
          weddingDayMapping: 'smallGroupPhotosPlan',
        },
        {
          id: 'q20',
          label:
            'Jeśli macie harmonogram wesela, podeślijcie go proszę fotografowi albo napiszcie poniżej, gdzie można go znaleźć.',
          type: 'short_text',
          required: true,
          placeholder: 'np. „Wysłano na maila" lub adres gdzie można znaleźć',
        },
      ],
    },
    {
      id: 's8',
      title: 'Zdjęcia i film',
      description: 'Napiszcie nam, co jest dla Was szczególnie ważne i jaki styl najbardziej Wam odpowiada.',
      questions: [
        {
          id: 'q21',
          label: 'Dajcie proszę znać na czym szczególnie Wam zależy na zdjęciach i filmie? :)',
          type: 'long_text',
          required: true,
          weddingDayMapping: 'photoVideoPriorities',
        },
        {
          id: 'q22',
          label:
            'Zazwyczaj sami wybieramy licencjonowaną muzykę do teledysku i filmu. Jeśli jakiś utwór jest dla Was ważny i chcecie, aby został użyty w teledysku lub filmie wyślijcie go proszę PRZED dniem wesela.',
          type: 'single_choice',
          required: true,
          options: ['Zdajemy się na Ciebie!', 'Za chwilę podeślemy coś naszego!', 'Nie mamy filmu'],
        },
        {
          id: 'q23',
          label:
            'Czy jest coś w fotografii lub filmie co Wam się podoba/nie podoba? (Na przykład czarno białe kadry, rozmazane ujęcia)',
          type: 'long_text',
          required: true,
        },
      ],
    },
    {
      id: 's9',
      title: 'Usługodawcy',
      description: 'Podajcie osoby i firmy, z którymi będziemy współpracować w dniu ślubu.',
      questions: [
        {
          id: 'q25',
          label:
            'Wymieńcie nam proszę wszystkich Waszych usługodawców, z których korzystacie tego dnia (suknie, makijaż, dekoracje, fryzura itp.) - często się wzajemnie polecamy :)',
          type: 'long_text',
          required: true,
        },
        {
          id: 'q26',
          label:
            'Podajcie proszę nazwę osób (DJ/Zespół) odpowiedzialnych za oprawę muzyczną na weselu :)',
          type: 'long_text',
          required: true,
          weddingDayMapping: 'djBandProvider',
        },
      ],
    },
    {
      id: 's10',
      title: 'Ważne informacje',
      description:
        'Ta część jest widoczna wyłącznie dla fotografa i służy lepszemu przygotowaniu zespołu do dnia ślubu.',
      questions: [
        {
          id: 'q24',
          label:
            'Jeśli są jakiekolwiek ważne kwestie rodzinne, które wymagają uwagi lub zrozumienia z naszej strony - prosimy o informację.',
          type: 'long_text',
          required: false,
          weddingDayMapping: 'sensitiveFamilyNotes',
          helpText:
            'Ta odpowiedź jest widoczna wyłącznie dla fotografa i nie jest udostępniana publicznie.',
        },
      ],
    },
    {
      id: 's11',
      title: 'Wskazówki od nas',
      description:
        'Na koniec kilka krótkich wskazówek, które pomogą nam wspólnie stworzyć najlepsze zdjęcia i film.',
      questions: [
        { id: 'q27_info', label: '', type: 'information', required: false, helpText: TIPS_HELP },
        { id: 'q28', label: 'Zapoznaliśmy się ze wskazówkami', type: 'acknowledgement', required: true },
      ],
    },
  ],
}

/** All content question IDs that must exist in both v1 and v2. */
export const DEFAULT_TEMPLATE_QUESTION_IDS = [
  'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10',
  'q11', 'q12', 'q13', 'q14', 'q15', 'q16', 'q17', 'q18', 'q19', 'q20',
  'q21', 'q22', 'q23', 'q24', 'q25', 'q26', 'q27_info', 'q28',
] as const
