export const landingV2Copy = {
  heroEyebrow: 'Dla fotografów i filmowców ślubnych',
  heroTitle: 'Twój biznes ślubny.\nWreszcie spokojny.',
  heroSub:
    'Od pierwszego zapytania do zakończenia projektu — w jednym, spokojnym miejscu.',
  scrollHint: 'Przewiń',

  desktop: [
    {
      id: 'dashboard',
      side: 'left' as const,
      title: 'Cały biznes pod kontrolą.',
      body: 'Pulpit, terminy i klienci — bez arkuszy.',
    },
    {
      id: 'wedding',
      side: 'right' as const,
      title: 'Każdy projekt kompletny.',
      body: 'Statusy, pakiet i ludzie w jednym widoku.',
    },
    {
      id: 'tasks',
      side: 'left' as const,
      title: 'Nigdy nie zapomnisz o terminie.',
      body: 'Zadania prowadzą Cię do dnia ślubu.',
    },
    {
      id: 'payments',
      side: 'right' as const,
      title: 'Płatności dokładnie tam, gdzie powinny.',
      body: 'Zaliczki i raty pod kontrolą.',
    },
    {
      id: 'contractCue',
      side: 'left' as const,
      title: 'Umowy bez przepisywania.',
      body: 'Wzór raz. Dane ślubu — automatycznie.',
    },
  ],

  contract: {
    title: 'Umowa gotowa w kilka chwil.',
    body: 'Bez ręcznego przepisywania danych i bez naruszania treści wzoru.',
  },

  morph: {
    title: 'To samo studio.\nTeraz w kieszeni.',
  },

  mobile: [
    {
      id: 'today',
      title: 'W dniu ślubu masz tylko to, czego naprawdę potrzebujesz.',
    },
    {
      id: 'nav',
      title: 'Jedno dotknięcie i jedziesz do kolejnej lokalizacji.',
    },
    {
      id: 'timeline',
      title: 'Harmonogram zawsze przy Tobie.',
    },
    {
      id: 'checklist',
      title: 'Lista sprzętu zawsze przy Tobie.',
    },
    {
      id: 'contact',
      title: 'Klient pod ręką.',
    },
    {
      id: 'offline',
      title: 'Działa także bez sieci.',
    },
  ],

  sync: {
    title: 'Zmiana na telefonie.\nOd razu w studio.',
    body: 'Ta sama checklista. Ten sam projekt. Zero dogadywania.',
  },

  cta: {
    title: 'Spokój zaczyna się przed pierwszym ślubem.',
    body: 'One miejsce. Cały workflow. Zero chaosu w dniu ślubu.',
    primary: 'Wypróbuj OurWed',
    secondary: 'Zobacz, jak działa',
  },
} as const
