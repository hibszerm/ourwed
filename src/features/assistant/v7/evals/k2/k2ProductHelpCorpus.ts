/**
 * K2 product-help eval corpus — natural Polish phrasings only (NL examples stay in evals).
 * expectedCapabilityIds: any match in top-k sealed results counts as recall hit.
 */

export type K2HelpTurn = {
  id: string
  user: string
  /** Empty = unsupported / must not invent product behavior */
  expectedCapabilityIds: string[]
  kind: 'direct' | 'colloquial' | 'location' | 'procedural' | 'vague' | 'negative'
  /** Soft answer grounding tokens (optional). */
  answerShouldMention?: string[]
  /** Critical hallucination markers that must NOT appear. */
  answerMustNotClaim?: string[]
}

export const K2_PRODUCT_HELP_CORPUS: K2HelpTurn[] = [
  // payments.add
  {
    id: 'pay-direct',
    user: 'Jak dodać wpłatę?',
    expectedCapabilityIds: ['payments.add'],
    kind: 'direct',
    answerShouldMention: ['Umowa i finanse'],
  },
  {
    id: 'pay-colloquial',
    user: 'Klient właśnie mi zapłacił, gdzie mam to wpisać?',
    expectedCapabilityIds: ['payments.add'],
    kind: 'colloquial',
  },
  {
    id: 'pay-location',
    user: 'Gdzie w OurWed zapisuje się zaliczkę od pary?',
    expectedCapabilityIds: ['payments.add'],
    kind: 'location',
  },
  {
    id: 'pay-procedural',
    user: 'Co mam zrobić, żeby odnotować płatność w zleceniu?',
    expectedCapabilityIds: ['payments.add'],
    kind: 'procedural',
  },

  // weddings.create
  {
    id: 'wed-create-direct',
    user: 'Jak dodać nowe zlecenie?',
    expectedCapabilityIds: ['weddings.create'],
    kind: 'direct',
  },
  {
    id: 'wed-create-colloquial',
    user: 'Mam nową parę — jak wprowadzić ich do systemu?',
    expectedCapabilityIds: [
      'weddings.create',
      'questionnaires.contract.send',
    ],
    kind: 'colloquial',
  },
  {
    id: 'wed-create-location',
    user: 'Gdzie dodaje się ślub / zlecenie?',
    expectedCapabilityIds: ['weddings.create'],
    kind: 'location',
  },
  {
    id: 'wed-create-procedural',
    user: 'Jakie mam sposoby na dodanie potwierdzonego zlecenia?',
    expectedCapabilityIds: ['weddings.create'],
    kind: 'procedural',
  },

  // weddings.open
  {
    id: 'wed-open-direct',
    user: 'Jak otworzyć kartę zlecenia?',
    expectedCapabilityIds: ['weddings.open'],
    kind: 'direct',
  },
  {
    id: 'wed-open-location',
    user: 'Gdzie znajdę szczegóły konkretnego ślubu?',
    expectedCapabilityIds: ['weddings.open', 'weddings.create'],
    kind: 'location',
  },
  {
    id: 'wed-open-vague',
    user: 'Jak wejść w zlecenie pary z listy?',
    expectedCapabilityIds: ['weddings.open'],
    kind: 'vague',
  },

  // weddings.tab.contract_finance
  {
    id: 'tab-finance-direct',
    user: 'Gdzie jest zakładka Umowa i finanse?',
    expectedCapabilityIds: ['weddings.tab.contract_finance'],
    kind: 'direct',
  },
  {
    id: 'tab-finance-procedural',
    user: 'Jak przejść do finansów w zleceniu?',
    expectedCapabilityIds: ['weddings.tab.contract_finance', 'payments.add'],
    kind: 'procedural',
  },

  // weddings.tab.wedding_day
  {
    id: 'tab-day-direct',
    user: 'Gdzie jest zakładka Dzień ślubu?',
    expectedCapabilityIds: ['weddings.tab.wedding_day'],
    kind: 'direct',
  },
  {
    id: 'tab-day-vague',
    user: 'Gdzie w zleceniu ogarniam plan dnia realizacji?',
    expectedCapabilityIds: ['weddings.tab.wedding_day', 'day.places.edit'],
    kind: 'vague',
  },

  // contracts.generate
  {
    id: 'contract-direct',
    user: 'Jak wygenerować umowę?',
    expectedCapabilityIds: ['contracts.generate'],
    kind: 'direct',
  },
  {
    id: 'contract-prereq',
    user: 'Co jest potrzebne do wygenerowania umowy?',
    expectedCapabilityIds: ['contracts.generate'],
    kind: 'procedural',
    answerShouldMention: ['pakiet'],
  },
  {
    id: 'contract-colloquial',
    user: 'Chcę zrobić umowę DOCX dla pary — od czego zacząć?',
    expectedCapabilityIds: ['contracts.generate', 'packages.manage'],
    kind: 'colloquial',
  },
  {
    id: 'contract-location',
    user: 'Gdzie w OurWed generuje się umowę?',
    expectedCapabilityIds: ['contracts.generate'],
    kind: 'location',
  },
  {
    id: 'contract-send-note',
    user: 'Czy OurWed wysyła umowę mailem do pary?',
    expectedCapabilityIds: ['contracts.generate'],
    kind: 'vague',
    answerMustNotClaim: ['wysyła e-mailem automatycznie', 'podpis elektroniczny'],
  },

  // questionnaires.contract.send
  {
    id: 'cq-send-direct',
    user: 'Jak wysłać ankietę do umowy?',
    expectedCapabilityIds: ['questionnaires.contract.send'],
    kind: 'direct',
  },
  {
    id: 'cq-send-colloquial',
    user: 'Chcę zebrać dane od pary linkiem przed założeniem zlecenia — jak?',
    expectedCapabilityIds: ['questionnaires.contract.send', 'weddings.create'],
    kind: 'colloquial',
  },
  {
    id: 'cq-send-location',
    user: 'Gdzie generuje się link ankiety dane do umowy?',
    expectedCapabilityIds: ['questionnaires.contract.send'],
    kind: 'location',
  },
  {
    id: 'cq-send-procedural',
    user: 'Jak utworzyć link do ankiety kontraktowej?',
    expectedCapabilityIds: ['questionnaires.contract.send'],
    kind: 'procedural',
  },

  // questionnaires.contract.pending
  {
    id: 'cq-pending-direct',
    user: 'Gdzie są oczekujące odpowiedzi z ankiety do umowy?',
    expectedCapabilityIds: ['questionnaires.contract.pending'],
    kind: 'direct',
  },
  {
    id: 'cq-pending-colloquial',
    user: 'Para wypełniła ankietę — gdzie to zaakceptować, żeby powstało zlecenie?',
    expectedCapabilityIds: ['questionnaires.contract.pending'],
    kind: 'colloquial',
  },
  {
    id: 'cq-pending-location',
    user: 'Co to jest skrzynka Oczekujące?',
    expectedCapabilityIds: ['questionnaires.contract.pending'],
    kind: 'location',
  },

  // q.prewedding.send
  {
    id: 'pq-direct',
    user: 'Jak wysłać ankietę przedślubną?',
    expectedCapabilityIds: ['q.prewedding.send'],
    kind: 'direct',
  },
  {
    id: 'pq-vague',
    user: 'Jak wysłać parze tę ankietę przed ślubem?',
    expectedCapabilityIds: ['q.prewedding.send'],
    kind: 'vague',
  },
  {
    id: 'pq-location',
    user: 'Gdzie w zleceniu jest ankieta przedślubna?',
    expectedCapabilityIds: ['q.prewedding.send'],
    kind: 'location',
  },
  {
    id: 'pq-procedural',
    user: 'Co zrobić, żeby para uzupełniła harmonogram dnia ślubu ankietą?',
    expectedCapabilityIds: ['q.prewedding.send'],
    kind: 'procedural',
  },

  // packages.manage
  {
    id: 'pkg-direct',
    user: 'Gdzie zarządza się pakietami?',
    expectedCapabilityIds: ['packages.manage'],
    kind: 'direct',
  },
  {
    id: 'pkg-colloquial',
    user: 'Chcę zmienić ofertę pakietów i wzór umowy — gdzie to jest?',
    expectedCapabilityIds: ['packages.manage'],
    kind: 'colloquial',
  },
  {
    id: 'pkg-location',
    user: 'Gdzie w OurWed są pakiety studio?',
    expectedCapabilityIds: ['packages.manage'],
    kind: 'location',
  },
  {
    id: 'pkg-procedural',
    user: 'Jak dodać nowy pakiet z szablonem DOCX?',
    expectedCapabilityIds: ['packages.manage'],
    kind: 'procedural',
  },

  // travel.settings
  {
    id: 'travel-settings-direct',
    user: 'Gdzie ustawić koszt dojazdu?',
    expectedCapabilityIds: ['travel.settings', 'travel.resolve_fee'],
    kind: 'direct',
  },
  {
    id: 'travel-settings-location',
    user: 'Gdzie w OurWed ustawia się koszty dojazdu (reguły globalne)?',
    expectedCapabilityIds: ['travel.settings'],
    kind: 'location',
  },
  {
    id: 'travel-settings-colloquial',
    user: 'Gdzie konfiguruję stawki za dojazd dla całego studia?',
    expectedCapabilityIds: ['travel.settings'],
    kind: 'colloquial',
  },

  // travel.resolve_fee
  {
    id: 'travel-fee-direct',
    user: 'Jak ustalić dojazd przy konkretnym zleceniu?',
    expectedCapabilityIds: ['travel.resolve_fee'],
    kind: 'direct',
  },
  {
    id: 'travel-fee-procedural',
    user: 'Jak oznaczyć, że dojazd jest w cenie albo płatny?',
    expectedCapabilityIds: ['travel.resolve_fee'],
    kind: 'procedural',
  },
  {
    id: 'travel-fee-vague',
    user: 'Dojazd dolicza się do wartości umowy — kiedy?',
    expectedCapabilityIds: ['travel.resolve_fee'],
    kind: 'vague',
  },

  // day.places.edit
  {
    id: 'places-direct',
    user: 'Jak zmienić miejsca dnia ślubu?',
    expectedCapabilityIds: ['day.places.edit'],
    kind: 'direct',
  },
  {
    id: 'places-location',
    user: 'Gdzie edytuję adres ceremonii i przyjęcia?',
    expectedCapabilityIds: ['day.places.edit'],
    kind: 'location',
  },
  {
    id: 'places-colloquial',
    user: 'Para zmieniła salę — gdzie to poprawić w OurWed?',
    expectedCapabilityIds: ['day.places.edit'],
    kind: 'colloquial',
  },
  {
    id: 'places-procedural',
    user: 'Jak zaktualizować przygotowania panny młodej na karcie?',
    expectedCapabilityIds: ['day.places.edit'],
    kind: 'procedural',
  },

  // sessions.create
  {
    id: 'sess-direct',
    user: 'Jak utworzyć sesję?',
    expectedCapabilityIds: ['sessions.create'],
    kind: 'direct',
  },
  {
    id: 'sess-colloquial',
    user: 'Chcę dodać sesję narzeczeńską — jak?',
    expectedCapabilityIds: ['sessions.create'],
    kind: 'colloquial',
  },
  {
    id: 'sess-location',
    user: 'Gdzie dodaje się nową sesję zdjęciową?',
    expectedCapabilityIds: ['sessions.create'],
    kind: 'location',
  },
  {
    id: 'sess-procedural',
    user: 'Jakie kroki, żeby zapisać nową sesję w kalendarzu pracy?',
    expectedCapabilityIds: ['sessions.create'],
    kind: 'procedural',
  },

  // tasks.create
  {
    id: 'task-direct',
    user: 'Jak dodać zadanie?',
    expectedCapabilityIds: ['tasks.create'],
    kind: 'direct',
  },
  {
    id: 'task-colloquial',
    user: 'Chcę sobie przypisać todo do ślubu — gdzie?',
    expectedCapabilityIds: ['tasks.create'],
    kind: 'colloquial',
  },
  {
    id: 'task-location',
    user: 'Gdzie w OurWed są zadania?',
    expectedCapabilityIds: ['tasks.create'],
    kind: 'location',
  },
  {
    id: 'task-procedural',
    user: 'Jak utworzyć zadanie firmowe albo przy zleceniu?',
    expectedCapabilityIds: ['tasks.create'],
    kind: 'procedural',
  },

  // guide.open
  {
    id: 'guide-direct',
    user: 'Gdzie jest Przewodnik OurWed?',
    expectedCapabilityIds: ['guide.open'],
    kind: 'direct',
  },
  {
    id: 'guide-colloquial',
    user: 'Chcę poczytać o tym, jak działa OurWed — gdzie to jest?',
    expectedCapabilityIds: ['guide.open'],
    kind: 'colloquial',
  },
  {
    id: 'guide-location',
    user: 'Jak otworzyć wbudowaną pomoc / przewodnik?',
    expectedCapabilityIds: ['guide.open'],
    kind: 'location',
  },

  // negatives / unsupported in Knowledge V1
  {
    id: 'neg-esign',
    user: 'Jak włączyć podpis kwalifikowany umowy w OurWed?',
    expectedCapabilityIds: [],
    kind: 'negative',
    answerMustNotClaim: ['podpis kwalifikowany', 'DocuSign', 'e-podpis w aplikacji'],
  },
  {
    id: 'neg-email-blast',
    user: 'Jak wysłać masowy newsletter do wszystkich par z OurWed?',
    expectedCapabilityIds: [],
    kind: 'negative',
    answerMustNotClaim: ['newsletter', 'masowa wysyłka e-mail'],
  },
  {
    id: 'neg-inventory',
    user: 'Jak zarządzać magazynem sprzętu fotograficznego w OurWed?',
    expectedCapabilityIds: [],
    kind: 'negative',
    answerMustNotClaim: ['magazyn sprzętu', 'inventory'],
  },
  {
    id: 'neg-client-portal-chat',
    user: 'Jak włączyć czat na żywo z parą w portalu klienta?',
    expectedCapabilityIds: [],
    kind: 'negative',
    answerMustNotClaim: ['czat na żywo', 'live chat'],
  },
  {
    id: 'neg-auto-nav',
    user: 'Przenieś mnie automatycznie do dodawania wpłaty.',
    expectedCapabilityIds: ['payments.add'],
    kind: 'negative',
    answerMustNotClaim: ['przenoszę Cię', 'otwieram modal'],
  },
]

export type K2MixedTurn = {
  id: string
  user: string
  expectKnowledgeIds: string[]
  expectCrmToolsAny: string[]
  notes?: string
}

/** Mixed knowledge + CRM — fixture names from V7_FIXTURE_WEDDINGS. */
export const K2_MIXED_CORPUS: K2MixedTurn[] = [
  {
    id: 'mixed-pay-nearest',
    user: 'Jak dodać wpłatę do mojego najbliższego ślubu?',
    expectKnowledgeIds: ['payments.add'],
    expectCrmToolsAny: [
      'search_resources',
      'sort_resources',
      'select_nearest_assignments',
      'inspect_resource',
    ],
  },
  {
    id: 'mixed-travel-named',
    user: 'Chcę zmienić koszt dojazdu dla Anny — gdzie to zrobię?',
    expectKnowledgeIds: ['travel.resolve_fee', 'travel.settings'],
    expectCrmToolsAny: ['search_resources', 'inspect_resource', 'refine_resources'],
  },
  {
    id: 'mixed-contract-named',
    user:
      'Co muszę jeszcze zrobić, żeby wygenerować umowę dla Julii? Powiedz też gdzie to kliknąć.',
    expectKnowledgeIds: ['contracts.generate'],
    expectCrmToolsAny: ['search_resources', 'inspect_resource', 'refine_resources'],
    notes:
      'CRM may not expose full contract readiness; knowledge grounding still required.',
  },
  {
    id: 'mixed-places-named',
    user: 'Jak zmienić miejsca dnia ślubu u Anny?',
    expectKnowledgeIds: ['day.places.edit'],
    expectCrmToolsAny: ['search_resources', 'inspect_resource', 'refine_resources'],
  },
]

export function summarizeK2HelpCorpus(): {
  turns: number
  supported: number
  negative: number
} {
  return {
    turns: K2_PRODUCT_HELP_CORPUS.length,
    supported: K2_PRODUCT_HELP_CORPUS.filter((t) => t.expectedCapabilityIds.length > 0)
      .length,
    negative: K2_PRODUCT_HELP_CORPUS.filter((t) => t.kind === 'negative').length,
  }
}
