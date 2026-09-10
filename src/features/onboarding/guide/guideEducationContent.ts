import { FIRST_RUN_ROUTES } from '@/features/onboarding/firstRunRoutes'
import { SETUP_GUIDANCE_ROUTES } from '@/features/onboarding/setup/setupGuidanceRoutes'

export type GuideLearnCategoryId =
  | 'zlecenia'
  | 'umowy'
  | 'dzien-slubu'
  | 'finanse'
  | 'organizacja'

export const GUIDE_DEFAULT_CATEGORY_ID: GuideLearnCategoryId = 'zlecenia'

export type GuideLearnAction = {
  label: string
  to: string
  proActionKey?: 'create_wedding'
  prominence: 'primary' | 'secondary' | 'quiet'
}

export type GuideStoryModule = {
  label: string
  body: string
}

/** Sequential stages (contracts, wedding day, payments). */
export type GuideStoryFlowStep = {
  label: string
}

/** Mutually exclusive entry paths that converge (bookings). */
export type GuideStoryPath = {
  label: string
  body: string
  /** Outcome chip — truthful per path (not always direct → Zlecenie). */
  outcome: string
}

export type GuideStoryInset = {
  title: string
  body: string
  footnote?: string
}

export type GuideStoryComposition =
  | 'begin-paths'
  | 'pipeline'
  | 'day-flow'
  | 'commercial'
  | 'rhythm'

export type GuideLearnCategory = {
  id: GuideLearnCategoryId
  title: string
  eyebrow: string
  headline: string
  intro: string
  composition: GuideStoryComposition
  /** Alternative entry paths — NOT a numbered sequence. */
  paths?: readonly GuideStoryPath[]
  /** True sequential progression. */
  flow?: readonly GuideStoryFlowStep[]
  /** Compact supporting facts (not equal-weight cards). */
  facts?: readonly GuideStoryModule[]
  inset?: GuideStoryInset
  note?: string
  actions: readonly GuideLearnAction[]
}

/** Verified product destinations used by Guide education CTAs. */
export const GUIDE_EDUCATION_ROUTES = {
  importSeason: FIRST_RUN_ROUTES.import,
  addBooking: FIRST_RUN_ROUTES.createManual,
  addBookingQuick: FIRST_RUN_ROUTES.createExisting,
  contractQuestionnaire: FIRST_RUN_ROUTES.collectByQuestionnaire,
  contractQuestionnaireEditor: '/ankiety/dane-do-umowy',
  packages: SETUP_GUIDANCE_ROUTES.packages,
  extras: '/studio/uslugi',
  questionnaires: '/ankiety',
  pending: '/oczekujace',
  finances: '/finanse',
  weddings: FIRST_RUN_ROUTES.weddingsList,
  dashboard: '/dashboard',
  tasks: '/zadania',
  notifications: '/powiadomienia',
  calendar: '/kalendarz',
  travelSettings: '/ustawienia/podroz',
} as const

/**
 * Guide V3.2 education — claims verified against production gates/services.
 * Sources: validateContractGeneration, travelFeeCommercial, paymentService,
 * questionnaireService.listPending / approve, notification catalog,
 * CalendarPage merge, taskService scopes, Dashboard V3.
 */
export const GUIDE_LEARN_CATEGORIES: readonly GuideLearnCategory[] = [
  {
    id: 'zlecenia',
    title: 'Zlecenia',
    eyebrow: 'Zlecenia',
    headline: 'Dodaj zlecenie tak, jak jest Ci wygodnie.',
    intro:
      'OurWed przechowuje potwierdzone zlecenia — nie zapytania. Możesz zaimportować podstawowe dane zleceń, dodać parę ręcznie albo zebrać dane ankietą.',
    composition: 'begin-paths',
    paths: [
      {
        label: 'Importujesz zlecenia',
        body: 'Import przenosi podstawowe dane z arkusza Excel lub CSV — datę, parę, kontakt, wartość i notatkę. Przed zapisem widzisz podgląd i ostrzeżenia. Import nie wysyła żadnych wiadomości do par.',
        outcome: '→ Zlecenie',
      },
      {
        label: 'Masz już dane pary',
        body: 'Dodaj potwierdzone zlecenie od razu. Ankieta do umowy nie jest wtedy wymagana.',
        outcome: '→ Zlecenie',
      },
      {
        label: 'Chcesz zebrać dane od pary',
        body: 'Wyślij ankietę do umowy. Wypełniona odpowiedź trafia do Oczekujących — po akceptacji powstaje zlecenie.',
        outcome: '→ Oczekujące → Zlecenie',
      },
    ],
    note: 'Pakiety w ankiecie są ustalane przy tworzeniu linku. Jeśli później zmienisz swoje pakiety, wcześniej utworzona ankieta nie zmieni się automatycznie.',
    inset: {
      title: 'Oczekujące',
      body: 'Tu trafiają wypełnione ankiety do umowy. Po Twojej decyzji powstaje zlecenie — bez automatycznych wiadomości do pary.',
    },
    actions: [
      {
        label: 'Dodaj zlecenie',
        to: GUIDE_EDUCATION_ROUTES.addBooking,
        proActionKey: 'create_wedding',
        prominence: 'primary',
      },
      {
        label: 'Importuj zlecenia',
        to: GUIDE_EDUCATION_ROUTES.importSeason,
        proActionKey: 'create_wedding',
        prominence: 'secondary',
      },
      {
        label: 'Ankieta do umowy',
        to: GUIDE_EDUCATION_ROUTES.contractQuestionnaire,
        prominence: 'quiet',
      },
      {
        label: 'Oczekujące',
        to: GUIDE_EDUCATION_ROUTES.pending,
        prominence: 'quiet',
      },
    ],
  },
  {
    id: 'umowy',
    title: 'Umowy',
    eyebrow: 'Umowy',
    headline: 'Od danych zlecenia do gotowego dokumentu.',
    intro:
      'Gdy pakiet ma wzór DOCX, a wymagane dane zlecenia są gotowe, OurWed może przygotować umowę.',
    composition: 'pipeline',
    flow: [
      { label: 'Pakiet + wzór DOCX' },
      { label: 'Wymagane dane' },
      { label: 'Umowa wygenerowana' },
      { label: 'Wysłana' },
      { label: 'Podpisana' },
    ],
    facts: [
      {
        label: 'Wymagane dane',
        body: 'Przed wygenerowaniem umowy OurWed sprawdza, czy zlecenie ma komplet informacji potrzebnych do dokumentu — m.in. dane pary, miejsce przyjęcia, pakiet oraz ustalenia dotyczące dojazdu i płatności.',
      },
      {
        label: 'Wysłana i podpisana',
        body: 'Po wysłaniu oznaczasz umowę jako wysłaną, a po podpisaniu — jako podpisaną. OurWed nie wysyła umów e-mailem i nie prowadzi podpisu elektronicznego.',
      },
    ],
    inset: {
      title: 'Masz już umowę do tego zlecenia?',
      body: 'Dołącz PDF lub DOCX. OurWed przeanalizuje dokument i podpowie dane, które możesz przenieść do zlecenia. To Ty decydujesz, które propozycje zaakceptować.',
      footnote: 'Znajdziesz tę funkcję na karcie zlecenia.',
    },
    actions: [
      {
        label: 'Przejdź do pakietów',
        to: GUIDE_EDUCATION_ROUTES.packages,
        prominence: 'primary',
      },
      {
        label: 'Lista zleceń',
        to: GUIDE_EDUCATION_ROUTES.weddings,
        prominence: 'quiet',
      },
    ],
  },
  {
    id: 'dzien-slubu',
    title: 'Dzień ślubu',
    eyebrow: 'Dzień ślubu',
    headline: 'Przygotuj realizację, zanim zacznie się dzień ślubu.',
    intro:
      'Zbierz harmonogram, miejsca i najważniejsze ustalenia wcześniej — a w dniu realizacji miej je pod ręką w jednym miejscu.',
    composition: 'day-flow',
    flow: [
      { label: 'Ankieta przedślubna' },
      { label: 'Plan dnia i miejsca' },
      { label: 'Dane w zleceniu' },
      { label: 'Wedding Brief PDF' },
    ],
    facts: [
      {
        label: 'Ankieta przedślubna',
        body: 'Para uzupełnia harmonogram, miejsca i najważniejsze ustalenia. Odpowiedzi trafiają do zlecenia.',
      },
      {
        label: 'Wedding Brief',
        body: 'Na podstawie danych zlecenia przygotujesz Wedding Brief PDF — zwięzłe podsumowanie na realizację.',
      },
    ],
    inset: {
      title: 'Pracujesz bez internetu?',
      body: 'OurWed działa online. Jeśli chcesz mieć najważniejsze informacje pod ręką bez internetu, pobierz Wedding Brief przed realizacją.',
    },
    actions: [
      {
        label: 'Ankiety',
        to: GUIDE_EDUCATION_ROUTES.questionnaires,
        prominence: 'primary',
      },
      {
        label: 'Lista zleceń',
        to: GUIDE_EDUCATION_ROUTES.weddings,
        prominence: 'quiet',
      },
    ],
  },
  {
    id: 'finanse',
    title: 'Finanse',
    eyebrow: 'Finanse',
    headline: 'Wartość umowy, wpłaty i dojazd w jednym miejscu.',
    intro:
      'Przy zleceniu widzisz, z czego składa się wartość umowy, ile zostało wpłacone i jaka kwota pozostała do rozliczenia.',
    composition: 'commercial',
    flow: [
      { label: 'Pakiet' },
      { label: 'Usługi dodatkowe' },
      { label: 'Płatny dojazd' },
      { label: 'Wartość umowy' },
    ],
    facts: [
      {
        label: 'Wpłaty',
        body: 'Zapisujesz zaliczkę i kolejne wpłaty. OurWed na bieżąco pokazuje, ile pozostało do rozliczenia.',
      },
      {
        label: 'Termin płatności końcowej',
        body: 'Ustalasz jeden termin dla całego zlecenia. Nie jest przypisywany osobno do każdej wpłaty.',
      },
    ],
    inset: {
      title: 'Dojazd',
      body: 'Dojazd ustalasz osobno dla każdego zlecenia. Możesz pozostawić go do ustalenia, wliczyć w cenę albo doliczyć konkretną kwotę. OurWed może podpowiedzieć koszt na podstawie Twoich ustawień, ale ostateczną decyzję zapisujesz przy zleceniu.',
      footnote: 'W zleceniu: Nieustalony · W cenie · albo kwota płatnego dojazdu.',
    },
    note: 'Dojazd dolicza się do wartości tylko wtedy, gdy jest płatny.',
    actions: [
      {
        label: 'Finanse',
        to: GUIDE_EDUCATION_ROUTES.finances,
        prominence: 'primary',
      },
      {
        label: 'Ustawienia dojazdu',
        to: GUIDE_EDUCATION_ROUTES.travelSettings,
        prominence: 'quiet',
      },
      {
        label: 'Lista zleceń',
        to: GUIDE_EDUCATION_ROUTES.weddings,
        prominence: 'quiet',
      },
    ],
  },
  {
    id: 'organizacja',
    title: 'Organizacja',
    eyebrow: 'Organizacja',
    headline: 'Zobacz, co wymaga uwagi — bez szukania po całym systemie.',
    intro:
      'Pulpit pokazuje najważniejsze rzeczy na dziś. Zadania pomagają pilnować pracy, Kalendarz porządkuje terminy, a Powiadomienia informują o nowych danych przesłanych przez pary.',
    composition: 'rhythm',
    facts: [
      {
        label: 'Pulpit',
        body: 'Najbliższe zlecenia, terminy, zadania na dziś i rzeczy wymagające uwagi.',
      },
      {
        label: 'Zadania',
        body: 'Twórz własne zadania przy konkretnych zleceniach albo dla całej firmy.',
      },
      {
        label: 'Kalendarz',
        body: 'Daty zleceń i sesji w jednym widoku.',
      },
      {
        label: 'Powiadomienia',
        body: 'Dostajesz informację, gdy para uzupełni ankietę do umowy lub ankietę przedślubną — w aplikacji, a jeśli masz włączoną tę opcję, również e-mailem.',
      },
    ],
    inset: {
      title: 'Oczekujące',
      body: 'Tu trafiają wypełnione ankiety do umowy, które wymagają Twojej decyzji przed utworzeniem zlecenia.',
    },
    actions: [
      {
        label: 'Pulpit',
        to: GUIDE_EDUCATION_ROUTES.dashboard,
        prominence: 'primary',
      },
      {
        label: 'Zadania',
        to: GUIDE_EDUCATION_ROUTES.tasks,
        prominence: 'secondary',
      },
      {
        label: 'Kalendarz',
        to: GUIDE_EDUCATION_ROUTES.calendar,
        prominence: 'quiet',
      },
      {
        label: 'Powiadomienia',
        to: GUIDE_EDUCATION_ROUTES.notifications,
        prominence: 'quiet',
      },
      {
        label: 'Oczekujące',
        to: GUIDE_EDUCATION_ROUTES.pending,
        prominence: 'quiet',
      },
    ],
  },
] as const

/** @deprecated Prefer GUIDE_LEARN_CATEGORIES */
export const GUIDE_LEARN_TOPICS = GUIDE_LEARN_CATEGORIES

export type GuideLearnTopicId = GuideLearnCategoryId
