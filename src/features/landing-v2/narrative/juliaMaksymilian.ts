/**
 * Landing V2 narrative — Source of Truth.
 * Julia i Maksymilian. Marketing-local only. No DB. Distinct from Landing V3 fiction.
 */

import { WORKFLOW_STAGE_LABELS, WORKFLOW_STAGES } from '@/lib/utils/workflow'

export const LANDING_V2_TABS = [
  { id: 'overview', label: 'Przegląd' },
  { id: 'wedding_day', label: 'Logistyka' },
  { id: 'contract_finance', label: 'Umowa i finanse' },
  { id: 'pre_wedding_questionnaire', label: 'Ankieta przedślubna' },
  { id: 'activity', label: 'Historia' },
] as const

export type LandingV2TabId = (typeof LANDING_V2_TABS)[number]['id']

export type AssignmentChapterId =
  | 'overview'
  | 'contract'
  | 'finance'
  | 'questionnaire'

export const juliaMaksymilian = {
  studio: {
    companyName: 'Studio Klar',
    ownerFirstName: 'Marta',
    ownerLastName: 'Lewandowska',
  },
  wedding: {
    coupleName: 'Julia i Maksymilian',
    isoDate: '2027-06-12',
    date: {
      day: '12',
      month: 'CZE',
      weekday: 'sobota',
    },
    longDate: '12 czerwca 2027',
    longDateShort: 'Sobota, 12 czerwca',
    packageName: 'Reportaż Premium',
    metaLine: 'Villa Love · Reportaż Premium',
    contractStatus: 'Podpisana',
    questionnaireStatus: 'Wypełniona',
    story: {
      eyebrow: 'Stan',
      title: 'Na ten moment wszystko gotowe',
      support: 'Umowa podpisana. Ankieta przedślubna wypełniona.',
    },
    places: {
      juliaPrep: {
        label: 'Przygotowania Julii',
        place: 'Hotel Stary',
        city: 'Kraków',
        time: '11:00',
      },
      maksPrep: {
        label: 'Przygotowania Maksymiliana',
        place: 'Hotel Saski',
        city: 'Kraków',
        time: '11:30',
      },
      ceremony: {
        label: 'Ceremonia',
        place: 'Kościół Świętych Apostołów Piotra i Pawła',
        city: 'Kraków',
        time: '15:00',
      },
      reception: {
        label: 'Przyjęcie',
        place: 'Villa Love',
        city: 'Izdebnik',
        time: '17:30',
      },
    },
    countdown: {
      value: '28',
      unit: 'dni',
      caption: 'do ślubu',
    },
    nextSteps: [
      { label: 'Brief przedślubny', value: 'Gotowy' },
      { label: 'Plan dnia', value: 'Uzupełniony' },
      { label: 'Pozostała płatność', value: '31 maja 2027' },
    ],
  },
  commercial: {
    contractValue: '10 900 zł',
    paid: '1 000 zł',
    remaining: '9 900 zł',
    depositLabel: 'Zadatek',
    depositAmount: '1 000 zł',
    depositStatus: 'Opłacony',
    travelLabel: 'Dojazd',
    travelAmount: '800 zł',
    paymentDueLabel: 'Termin płatności',
    paymentDueDate: '31 maja 2027',
    finalPaymentLabel: 'Pozostała płatność',
    finalPaymentAmount: '9 900 zł',
    paymentHistoryLabel: 'Historia wpłat',
  },
  package: {
    name: 'Reportaż Premium',
    coverage: '10 godz. · oddanie do 90 dni',
    contents: [
      'Film ślubny',
      'Teledysk / highlight',
      'Reportaż fotograficzny',
      'Drugi operator — 4 godz.',
    ],
    depositFact: '1 000 zł',
    overtimeFact: '350 zł / godz.',
    deliveryFact: 'do 90 dni',
  },
  schedule: [
    {
      time: '11:00',
      role: 'Przygotowania Julii',
      place: 'Hotel Stary · Kraków',
    },
    {
      time: '11:30',
      role: 'Przygotowania Maksymiliana',
      place: 'Hotel Saski · Kraków',
    },
    {
      time: '15:00',
      role: 'Ceremonia',
      place: 'Kościół Świętych Apostołów Piotra i Pawła · Kraków',
    },
    {
      time: '17:30',
      role: 'Przyjęcie',
      place: 'Villa Love · Izdebnik',
    },
  ],
  coverageEnd: {
    label: 'Planowany koniec reportażu',
    time: '00:30',
  },
  /** Landing-only demo route legs between schedule stops (not production travel). */
  routeLegs: [
    { duration: '~12 min', distance: '4,8 km' },
    { duration: '~15 min', distance: '6,1 km' },
    { duration: '~38 min', distance: '27 km' },
  ],
  routeTotals: {
    duration: '~65 min',
    distance: '~38 km',
  },
  /** SVG map pin positions (viewBox 0–100) — marketing illustration only. */
  mapPoints: [
    { id: 'julia', label: 'Hotel Stary', x: 28, y: 26 },
    { id: 'maks', label: 'Hotel Saski', x: 42, y: 38 },
    { id: 'ceremony', label: 'Ceremonia', x: 58, y: 48 },
    { id: 'reception', label: 'Villa Love', x: 78, y: 72 },
  ],
  questionnaire: {
    status: 'Wypełniona',
    submittedLabel: 'Odpowiedzi pary',
    summary: [
      { label: 'Liczba gości', value: '120' },
      { label: 'First look', value: 'Tak' },
      { label: 'Godzina ślubu', value: '15:00' },
      { label: 'Pierwszy taniec', value: '19:30' },
    ],
    locations: [
      {
        label: 'Przygotowania Panny Młodej',
        value: 'Hotel Stary, Kraków',
      },
      {
        label: 'Przygotowania Pana Młodego',
        value: 'Hotel Saski, Kraków',
      },
      {
        label: 'Ceremonia',
        value: 'Kościół Świętych Apostołów Piotra i Pawła, Kraków',
      },
      {
        label: 'Przyjęcie',
        value: 'Villa Love, Izdebnik',
      },
    ],
    priorities: [
      {
        label: 'Na czym najbardziej Wam zależy?',
        value:
          'Naturalne emocje, ujęcia rodziny i przyjaciół, krótka sesja po ceremonii — bez długiego znikania z wesela.',
      },
      {
        label: 'Ważne osoby / momenty',
        value:
          'Rodzice, dziadkowie, wejście na salę, pierwszy taniec, podziękowania.',
      },
    ],
    notes: [
      {
        label: 'Dodatkowe uwagi',
        value: 'Naturalny reportaż — bez częstego ustawiania do kamery.',
      },
      {
        label: 'Sesja w dniu ślubu',
        value: 'Tak — około 20 minut po obiedzie.',
      },
    ],
    /** Flat list retained for any legacy consumers / acceptance scans. */
    answers: [
      { label: 'Liczba gości', value: '120' },
      { label: 'First look', value: 'Tak' },
      { label: 'Godzina ślubu', value: '15:00' },
      { label: 'Pierwszy taniec', value: '19:30' },
      {
        label: 'Przygotowania Panny Młodej',
        value: 'Hotel Stary, Kraków',
      },
      {
        label: 'Przygotowania Pana Młodego',
        value: 'Hotel Saski, Kraków',
      },
      {
        label: 'Ceremonia',
        value: 'Kościół Świętych Apostołów Piotra i Pawła, Kraków',
      },
      {
        label: 'Przyjęcie',
        value: 'Villa Love, Izdebnik',
      },
      {
        label: 'Na czym najbardziej Wam zależy?',
        value:
          'Naturalne emocje, ujęcia rodziny i przyjaciół, krótka sesja po ceremonii — bez długiego znikania z wesela.',
      },
      {
        label: 'Ważne osoby / momenty',
        value:
          'Rodzice, dziadkowie, wejście na salę, pierwszy taniec, podziękowania.',
      },
      {
        label: 'Dodatkowe uwagi',
        value: 'Naturalny reportaż — bez częstego ustawiania do kamery.',
      },
      {
        label: 'Sesja w dniu ślubu',
        value: 'Tak — około 20 minut po obiedzie.',
      },
    ],
  },
  season: {
    monthLabel: 'Czerwiec 2027',
    year: 2027,
    monthIndex: 5,
    daysInMonth: 30,
    /** 0 = Sunday … used for calendar grid start (June 2027 starts Tuesday) */
    startWeekday: 2,
    events: [
      { day: 5, kind: 'session' as const, name: 'Sesja narzeczeńska — Ewa i Tomek' },
      { day: 12, kind: 'wedding' as const, name: 'Julia i Maksymilian' },
      { day: 19, kind: 'wedding' as const, name: 'Natalia i Piotr' },
      { day: 26, kind: 'wedding' as const, name: 'Oliwia i Bartek' },
    ],
    list: [
      { dateLabel: '05.06', name: 'Ewa i Tomek', kind: 'Sesja', highlight: false },
      { dateLabel: '12.06', name: 'Julia i Maksymilian', kind: 'Ślub', highlight: true },
      { dateLabel: '19.06', name: 'Natalia i Piotr', kind: 'Ślub', highlight: false },
      { dateLabel: '26.06', name: 'Oliwia i Bartek', kind: 'Ślub', highlight: false },
    ],
  },
  workflowLabels: WORKFLOW_STAGES.map((stage) => WORKFLOW_STAGE_LABELS[stage]),
  tabs: LANDING_V2_TABS,
  problemFragments: [
    'Umowa.docx',
    'Zadatek 1 000 zł',
    '12 czerwca',
    '15:00 ceremonia',
    'Ankieta wypełniona',
    'Hotel Stary',
    'Hotel Saski',
    'Villa Love',
    'Pozostało 9 900 zł',
  ],
  faq: [
    {
      q: 'Czy para musi zakładać konto?',
      a: 'Nie. Para korzysta z bezpiecznego linku. Konto OurWed jest tylko dla Ciebie i studia.',
    },
    {
      q: 'Czy mogę używać własnych umów?',
      a: 'Tak. Dodajesz własne szablony dokumentów i generujesz umowy na podstawie danych zlecenia.',
    },
    {
      q: 'Czy OurWed działa na telefonie?',
      a: 'Tak. Możesz sprawdzić zlecenie, brief i harmonogram także w terenie.',
    },
    {
      q: 'Czy mogę połączyć kalendarz?',
      a: 'Zlecenia mogą trafiać do Google Calendar i Apple Calendar. OurWed pozostaje źródłem danych.',
    },
    {
      q: 'Czy trzeba podawać kartę na start?',
      a: 'Nie. Możesz założyć konto i skorzystać z okresu próbnego bez karty płatniczej.',
    },
  ],
  copy: {
    nav: {
      brand: 'OurWed',
      product: 'Produkt',
      howItWorks: 'Jak działa',
      pricing: 'Cennik',
      login: 'Zaloguj się',
      tryFree: 'Wypróbuj za darmo',
    },
    hero: {
      title: 'Obsługa zleceń ślubnych bez chaosu.',
      support:
        'Śluby, sesje, umowy, ankiety, płatności i plan dnia — w jednym spokojnym miejscu pracy.',
      primaryCta: 'Wypróbuj 30 dni za darmo',
      secondaryCta: 'Zobacz, jak działa',
      microcopy: 'Bez karty płatniczej.',
    },
    problem: {
      id: 'jak-dziala',
      titleLines: ['Jedno zlecenie.', 'Dziesiątki rzeczy do dopilnowania.'],
    },
    resolution: {
      title: 'Wszystko przy jednym zleceniu.',
      support: 'Rozproszone informacje zbierają się wokół jednego ślubu w OurWed.',
    },
    assignment: {
      id: 'produkt',
      chapters: [
        {
          id: 'overview' as const,
          tabId: 'overview' as const,
          title: 'Wszystko zaczyna się od jednego miejsca.',
          support:
            'Para, termin, pakiet, miejsca i najważniejszy stan realizacji są zawsze pod ręką.',
        },
        {
          id: 'contract' as const,
          tabId: 'contract_finance' as const,
          title: 'Umowa bez przepisywania wszystkiego od nowa.',
          support:
            'Dane zlecenia i pary są już w systemie. Możesz wykorzystać je przy przygotowaniu dokumentów.',
        },
        {
          id: 'finance' as const,
          tabId: 'contract_finance' as const,
          title: 'Wiesz dokładnie, co zostało zapłacone.',
          support: 'Wartość, wpłaty i pozostała kwota pozostają przy zleceniu.',
        },
        {
          id: 'questionnaire' as const,
          tabId: 'pre_wedding_questionnaire' as const,
          title: 'Zamiast szukać ustaleń po wiadomościach.',
          support:
            'Para przekazuje informacje w jednym miejscu, a Ty masz przed ślubem kompletny plan.',
        },
      ],
    },
    graphite: {
      titleLines: ['W dniu ślubu nie potrzebujesz CRM-u.', 'Potrzebujesz planu.'],
    },
    weddingDay: {
      nowLabel: 'Teraz',
      nextLabel: 'Następnie',
    },
    season: {
      lead: 'A to tylko jeden ślub.',
      title: 'Cały sezon też masz pod kontrolą.',
      support: 'Kalendarz i lista zleceń pokazują nadchodzące śluby oraz sesje w jednym rytmie.',
    },
    workflow: {
      title: 'OurWed prowadzi zlecenie przez cały proces — nie tylko przechowuje dane.',
    },
    proof: [
      {
        title: 'Mniej pamiętania',
        body: 'Terminy, płatności i kolejne kroki są przy zleceniu.',
      },
      {
        title: 'Mniej szukania',
        body: 'Dane pary, miejsca, ankiety i dokumenty nie giną między aplikacjami.',
      },
      {
        title: 'Więcej spokoju',
        body: 'Otwierasz jedno miejsce i wiesz, co dzieje się ze zleceniem.',
      },
    ],
    pricing: {
      id: 'cennik',
      title: 'Wszystko, czego potrzebujesz do prowadzenia sezonu.',
      cta: 'Wypróbuj OurWed',
      microcopy: 'Bez karty płatniczej.',
    },
    faq: {
      title: 'Pytania przed startem',
    },
    finalCta: {
      titleLines: ['Następny sezon', 'może być spokojniejszy.'],
      primaryCta: 'Wypróbuj 30 dni za darmo',
      secondaryCta: 'Zaloguj się',
      microcopy: 'Bez karty płatniczej.',
    },
    footer: {
      brand: 'OurWed',
      product: 'Produkt',
      pricing: 'Cennik',
      login: 'Zaloguj się',
      register: 'Wypróbuj za darmo',
    },
  },
} as const

export type JuliaMaksymilianNarrative = typeof juliaMaksymilian
