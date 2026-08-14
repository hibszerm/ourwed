/**
 * Canonical fictional demo data for Landing V3.
 * One assignment throughout — never real studio or user data.
 */

import { toCalendarEvent } from '@/features/calendar/utils/calendarEvents'
import type { Question } from '@/types/form'
import type {
  StudioTravelSettings,
  TravelPlan,
  TravelSegment,
  WeddingPlace,
} from '@/types/travel'
import type { Notification, Task, Wedding } from '@/types/wedding'

export const DEMO_WEDDING_ID = 'lv3-julia-adrian'
export const DEMO_GREETING_NAME = 'Studio'

export const DEMO_ASSIGNMENT = {
  id: DEMO_WEDDING_ID,
  partner1: 'Julia Nowak',
  partner2: 'Adrian Kowalski',
  displayName: 'Julia i Adrian',
  date: '2027-06-12',
  dateLabel: '12 czerwca 2027',
  countdownLabel: '42 dni',
  reception: 'Folwark Wąsowo, Wąsowo',
  ceremony: 'Kościół św. Anny, Poznań',
  bridePrep: 'Hotel Liberté, Poznań',
  groomPrep: 'Apartamenty Stary Rynek, Poznań',
  packageName: 'Film + Foto',
  contractValue: 12900,
  paid: 5500,
  remaining: 7400,
  contractValueLabel: '12 900 zł',
  paidLabel: '5 500 zł',
  remainingLabel: '7 400 zł',
  finalDueLabel: '5 czerwca 2027',
  ceremonyTime: '14:00',
  receptionTime: '17:00',
  paidPercent: 42.6,
} as const

export const DEMO_CAPABILITY_LINE =
  'Zlecenia · Umowy · Ankiety · Płatności · Plan dnia · Kalendarze' as const

export const DEMO_PROCESS_STEPS = [
  {
    id: 'add',
    short: 'Zlecenie',
    label: 'Dodajesz zlecenie',
    hint: 'Para, data, pakiet i lokalizacja w jednym zapisie.',
  },
  {
    id: 'data',
    short: 'Dane pary',
    label: 'Para przekazuje dane',
    hint: 'Bezpieczny link do ankiety — bez konta po stronie pary.',
  },
  {
    id: 'contract',
    short: 'Umowa',
    label: 'Generujesz umowę',
    hint: 'Dokument z Twojego szablonu i danych zlecenia.',
  },
  {
    id: 'payments',
    short: 'Płatności',
    label: 'Rejestrujesz wpłaty',
    hint: 'Zaliczka, kolejne wpłaty i pozostała kwota przy zleceniu.',
  },
  {
    id: 'day',
    short: 'Plan dnia',
    label: 'Para uzupełnia plan dnia',
    hint: 'Lokalizacje, godziny i dojazd wracają do workspace.',
  },
  {
    id: 'brief',
    short: 'Brief',
    label: 'Pobierasz brief',
    hint: 'PDF z harmonogramem i kontaktami przed wyjazdem.',
  },
] as const

export const DEMO_FINANCE_PAYMENTS = [
  {
    id: 'dep',
    label: 'Zaliczka',
    amountLabel: '2 500 zł',
    status: 'paid' as const,
    statusLabel: 'Opłacona',
    dateLabel: '14 stycznia 2027',
  },
  {
    id: 'second',
    label: 'Druga wpłata',
    amountLabel: '3 000 zł',
    status: 'paid' as const,
    statusLabel: 'Opłacona',
    dateLabel: '12 marca 2027',
  },
  {
    id: 'rest',
    label: 'Pozostała kwota',
    amountLabel: '7 400 zł',
    status: 'due' as const,
    statusLabel: 'Termin: 5 czerwca 2027',
    dateLabel: '5 czerwca 2027',
  },
] as const

export const DEMO_SESSION = {
  displayName: 'Marta i Jakub',
  dateLabel: '4 maja 2027',
  timeLabel: '17:00–19:00',
  location: 'Park Cytadela, Poznań',
  priceLabel: '1 200 zł',
  statusLabel: 'Sesja',
} as const

export const DEMO_SEASON = {
  yearLabel: 'Sezon 2027',
  contractedLabel: '184 500 zł',
  paidLabel: '96 200 zł',
  remainingLabel: '88 300 zł',
  activeCount: 18,
  months: [
    { id: 'jan', label: 'Styczeń', amountLabel: '8 500 zł', amount: 8500 },
    { id: 'feb', label: 'Luty', amountLabel: '12 400 zł', amount: 12400 },
    { id: 'mar', label: 'Marzec', amountLabel: '17 200 zł', amount: 17200 },
    { id: 'apr', label: 'Kwiecień', amountLabel: '14 800 zł', amount: 14800 },
    { id: 'may', label: 'Maj', amountLabel: '21 600 zł', amount: 21600 },
    { id: 'jun', label: 'Czerwiec', amountLabel: '21 700 zł', amount: 21700 },
  ],
  monthFocus: {
    label: 'Czerwiec 2027',
    assignments: 4,
    valueLabel: '31 800 zł',
    paidLabel: '16 400 zł',
    remainingLabel: '15 400 zł',
  },
} as const

const MASK = {
  phone: '500 100 200',
  email: 'julia.adrian@example.com',
  city: 'Poznań',
} as const

function payments(): Wedding['payments'] {
  return [
    {
      id: 'lv3-pay-deposit',
      label: 'Zaliczka',
      amount: 2500,
      type: 'deposit',
      paid: true,
      paidAt: '2027-01-14',
      dueDate: '2027-01-14',
      method: 'transfer',
    },
    {
      id: 'lv3-pay-second',
      label: 'Druga wpłata',
      amount: 3000,
      type: 'installment',
      paid: true,
      paidAt: '2027-03-12',
      dueDate: '2027-03-12',
      method: 'transfer',
    },
    {
      id: 'lv3-pay-final',
      label: 'Pozostała kwota',
      amount: 7400,
      type: 'final',
      paid: false,
      dueDate: '2027-06-05',
      method: 'transfer',
    },
  ]
}

function baseCouple(
  p1First: string,
  p1Last: string,
  p2First: string,
  p2Last: string,
  venue: string,
  city: string,
): Wedding['couple'] {
  return {
    partner1: `${p1First} ${p1Last}`,
    partner2: `${p2First} ${p2Last}`,
    partner1FirstName: p1First,
    partner1LastName: p1Last,
    partner2FirstName: p2First,
    partner2LastName: p2Last,
    partner1Phone: MASK.phone,
    partner1Email: MASK.email,
    partner1City: city,
    partner2Phone: MASK.phone,
    partner2Email: MASK.email,
    partner2City: city,
    email: MASK.email,
    phone: MASK.phone,
    venue,
    city,
  }
}

/** Primary assignment — Julia Nowak i Adrian Kowalski. */
export const demoWedding: Wedding = {
  id: DEMO_WEDDING_ID,
  couple: baseCouple(
    'Julia',
    'Nowak',
    'Adrian',
    'Kowalski',
    'Folwark Wąsowo',
    'Wąsowo',
  ),
  displayName: DEMO_ASSIGNMENT.displayName,
  date: DEMO_ASSIGNMENT.date,
  ceremonyTime: DEMO_ASSIGNMENT.ceremonyTime,
  status: 'active',
  workflowStage: 'wedding_day',
  packageName: DEMO_ASSIGNMENT.packageName,
  packageId: null,
  price: DEMO_ASSIGNMENT.contractValue,
  depositAmount: DEMO_ASSIGNMENT.paid,
  currency: 'PLN',
  packageItems: [
    {
      title: 'Film ślubny',
      description: 'Teaser + film główny',
      sortOrder: 1,
      enabled: true,
    },
    {
      title: 'Fotoreportaż',
      description: 'Całodniowa relacja foto',
      sortOrder: 2,
      enabled: true,
    },
    {
      title: 'Galeria online',
      sortOrder: 3,
      enabled: true,
    },
  ],
  coverageHours: 12,
  deliveryMonths: 3,
  finalPaymentDueDate: '2027-06-05',
  bridePreparationLocation: DEMO_ASSIGNMENT.bridePrep,
  groomPreparationLocation: DEMO_ASSIGNMENT.groomPrep,
  ceremonyLocation: DEMO_ASSIGNMENT.ceremony,
  receptionLocation: DEMO_ASSIGNMENT.reception,
  preparationLocation: DEMO_ASSIGNMENT.bridePrep,
  primaryLocation: {
    venueName: 'Folwark Wąsowo',
    locality: 'Wąsowo',
    displayText: 'Folwark Wąsowo, Wąsowo',
    source: 'reception',
  },
  accentColor: '#1d272b',
  createdAt: '2026-09-14T10:00:00.000Z',
  checklist: [],
  schedule: [
    {
      id: 'lv3-s1',
      time: '09:30',
      title: 'Przygotowania Pana Młodego',
      location: DEMO_ASSIGNMENT.groomPrep,
    },
    {
      id: 'lv3-s2',
      time: '11:00',
      title: 'Przygotowania Panny Młodej',
      location: DEMO_ASSIGNMENT.bridePrep,
    },
    {
      id: 'lv3-s3',
      time: '14:00',
      title: 'Ceremonia',
      location: DEMO_ASSIGNMENT.ceremony,
    },
    {
      id: 'lv3-s4',
      time: '17:00',
      title: 'Przyjęcie weselne',
      location: DEMO_ASSIGNMENT.reception,
    },
  ],
  payments: payments(),
  finances: [],
  questionnaires: {
    contractData: {
      status: 'completed',
      sentAt: '2026-09-20',
      completedAt: '2026-09-22',
    },
    weddingQuestionnaire: {
      status: 'completed',
      sentAt: '2027-04-01',
      completedAt: '2027-04-28',
    },
  },
  contract: {
    status: 'signed',
    generatedAt: '2026-09-25',
    sentAt: '2026-09-26',
    signedAt: '2026-10-02',
  },
  notes: [
    {
      id: 'lv3-n1',
      content:
        'Para prosi o dyskretne ujęcia podczas ceremonii. Tort o 21:30.',
      createdAt: '2027-04-28T12:00:00.000Z',
      author: 'System',
      badge: 'Ankieta przedślubna',
      source: 'wedding_questionnaire',
    },
  ],
  deliverables: [
    {
      id: 'lv3-d1',
      name: 'Teaser wideo',
      source: 'package',
      completed: false,
      deliveryDate: '2027-07-10',
    },
    {
      id: 'lv3-d2',
      name: 'Galeria online',
      source: 'package',
      completed: false,
      deliveryDate: '2027-09-12',
    },
  ],
  timeline: [
    {
      id: 'lv3-t1',
      title: 'Rezerwacja utworzona',
      date: '2026-09-14',
      type: 'created',
    },
    {
      id: 'lv3-t2',
      title: 'Umowa podpisana',
      date: '2026-10-02',
      type: 'contract_signed',
    },
    {
      id: 'lv3-t3',
      title: 'Ankieta przedślubna ukończona',
      date: '2027-04-28',
      type: 'questionnaire_completed',
    },
  ],
}

function secondaryWedding(input: {
  id: string
  displayName: string
  p1: [string, string]
  p2: [string, string]
  date: string
  venue: string
  city: string
  ceremony: string
  packageName: string
  price: number
  deposit: number
  accent: string
  contractStatus: Wedding['contract']['status']
}): Wedding {
  return {
    id: input.id,
    couple: baseCouple(
      input.p1[0],
      input.p1[1],
      input.p2[0],
      input.p2[1],
      input.venue,
      input.city,
    ),
    displayName: input.displayName,
    date: input.date,
    ceremonyTime: '15:00',
    status: 'active',
    workflowStage: 'preparation',
    packageName: input.packageName,
    packageId: null,
    price: input.price,
    depositAmount: input.deposit,
    currency: 'PLN',
    packageItems: [],
    ceremonyLocation: input.ceremony,
    receptionLocation: `${input.venue}, ${input.city}`,
    primaryLocation: {
      venueName: input.venue,
      locality: input.city,
      displayText: `${input.venue}, ${input.city}`,
      source: 'reception',
    },
    accentColor: input.accent,
    createdAt: '2026-10-01T10:00:00.000Z',
    checklist: [],
    schedule: [
      {
        id: `${input.id}-cer`,
        time: '15:00',
        title: 'Ceremonia',
        location: input.ceremony,
      },
    ],
    payments: [
      {
        id: `${input.id}-dep`,
        label: 'Zadatek',
        amount: input.deposit,
        type: 'deposit',
        paid: true,
        paidAt: '2026-10-15',
        dueDate: '2026-10-15',
        method: 'transfer',
      },
      {
        id: `${input.id}-fin`,
        label: 'Płatność końcowa',
        amount: input.price - input.deposit,
        type: 'final',
        paid: false,
        dueDate: input.date,
        method: 'transfer',
      },
    ],
    finances: [],
    questionnaires: {
      contractData: { status: 'completed', sentAt: '2026-10-05', completedAt: '2026-10-08' },
      weddingQuestionnaire: { status: 'sent', sentAt: '2027-01-10' },
    },
    contract: {
      status: input.contractStatus,
      signedAt: input.contractStatus === 'signed' ? '2026-10-20' : undefined,
      sentAt: input.contractStatus !== 'none' ? '2026-10-18' : undefined,
      generatedAt: input.contractStatus !== 'none' ? '2026-10-16' : undefined,
    },
    notes: [],
    deliverables: [],
    timeline: [],
  }
}

export const demoUpcomingWeddings: Wedding[] = [
  secondaryWedding({
    id: 'lv3-ola-bartek',
    displayName: 'Ola i Bartek',
    p1: ['Ola', 'Wiśniewska'],
    p2: ['Bartek', 'Nowicki'],
    date: '2027-07-03',
    venue: 'Dwór Sanna',
    city: 'Lublin',
    ceremony: 'Archikatedra lubelska',
    packageName: 'Reportaż',
    price: 7800,
    deposit: 2000,
    accent: '#404040',
    contractStatus: 'signed',
  }),
  secondaryWedding({
    id: 'lv3-natalia-kacper',
    displayName: 'Natalia i Kacper',
    p1: ['Natalia', 'Lis'],
    p2: ['Kacper', 'Mazur'],
    date: '2027-07-17',
    venue: 'Hotel Narvil',
    city: 'Serock',
    ceremony: 'Kościół w Zegrzu',
    packageName: 'Film + Foto',
    price: 9800,
    deposit: 3500,
    accent: '#737373',
    contractStatus: 'sent',
  }),
  secondaryWedding({
    id: 'lv3-zofia-marek',
    displayName: 'Zofia i Marek',
    p1: ['Zofia', 'Kamińska'],
    p2: ['Marek', 'Wójcik'],
    date: '2027-08-07',
    venue: 'Pałac Mała Wieś',
    city: 'Grójec',
    ceremony: 'Kościół w Grójcu',
    packageName: 'Premium',
    price: 11200,
    deposit: 3000,
    accent: '#525252',
    contractStatus: 'signed',
  }),
]

export const demoWeddings: Wedding[] = [demoWedding, ...demoUpcomingWeddings]

export const demoPrimaryEvent = toCalendarEvent(demoWedding)
export const demoAssignmentEvents = demoWeddings.map(toCalendarEvent)

export const demoPlaces: WeddingPlace[] = [
  {
    id: 'lv3-place-groom',
    weddingId: DEMO_WEDDING_ID,
    role: 'groom_preparation',
    label: 'Apartamenty Stary Rynek',
    placeId: 'lv3-pid-groom',
    formattedAddress: DEMO_ASSIGNMENT.groomPrep,
    latitude: 52.408,
    longitude: 16.934,
    sortOrder: 10,
    createdAt: '2026-09-14T10:00:00.000Z',
    updatedAt: '2026-09-14T10:00:00.000Z',
  },
  {
    id: 'lv3-place-bride',
    weddingId: DEMO_WEDDING_ID,
    role: 'bride_preparation',
    label: 'Hotel Liberté',
    placeId: 'lv3-pid-bride',
    formattedAddress: DEMO_ASSIGNMENT.bridePrep,
    latitude: 52.41,
    longitude: 16.92,
    sortOrder: 20,
    createdAt: '2026-09-14T10:00:00.000Z',
    updatedAt: '2026-09-14T10:00:00.000Z',
  },
  {
    id: 'lv3-place-ceremony',
    weddingId: DEMO_WEDDING_ID,
    role: 'ceremony',
    label: 'Kościół św. Anny',
    placeId: 'lv3-pid-ceremony',
    formattedAddress: DEMO_ASSIGNMENT.ceremony,
    latitude: 52.406,
    longitude: 16.929,
    sortOrder: 30,
    createdAt: '2026-09-14T10:00:00.000Z',
    updatedAt: '2026-09-14T10:00:00.000Z',
  },
  {
    id: 'lv3-place-reception',
    weddingId: DEMO_WEDDING_ID,
    role: 'reception',
    label: 'Folwark Wąsowo',
    placeId: 'lv3-pid-reception',
    formattedAddress: DEMO_ASSIGNMENT.reception,
    latitude: 52.45,
    longitude: 16.55,
    sortOrder: 40,
    createdAt: '2026-09-14T10:00:00.000Z',
    updatedAt: '2026-09-14T10:00:00.000Z',
  },
]

const demoStudio: StudioTravelSettings = {
  id: 'lv3-studio',
  userId: 'lv3-demo-user',
  studioName: 'Studio OurWed Demo',
  street: 'Święty Marcin',
  buildingNumber: '12',
  postalCode: '61-803',
  city: 'Poznań',
  country: 'PL',
  formattedAddress: 'Święty Marcin 12, 61-803 Poznań',
  latitude: 52.4064,
  longitude: 16.9252,
  placeId: 'lv3-studio-place',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function segment(
  seq: number,
  originKind: TravelSegment['originKind'],
  destKind: TravelSegment['destinationKind'],
  meters: number,
  seconds: number,
  originId: string | null,
  destId: string | null,
  distanceText: string,
  durationText: string,
): TravelSegment {
  return {
    id: `lv3-seg-${seq}`,
    weddingId: DEMO_WEDDING_ID,
    sequence: seq,
    originKind,
    originWeddingPlaceId: originId,
    destinationKind: destKind,
    destinationWeddingPlaceId: destId,
    endpointsHash: `lv3-h-${seq}`,
    distanceMeters: meters,
    distanceText,
    durationSeconds: seconds,
    durationText,
    travelMode: 'DRIVE',
    provider: 'google',
    status: 'ok',
    errorMessage: null,
    calculatedAt: '2027-05-01T00:00:00.000Z',
    createdAt: '2027-05-01T00:00:00.000Z',
    updatedAt: '2027-05-01T00:00:00.000Z',
  }
}

/** Studio → Groom → Bride → Ceremony → Reception. */
export const demoTravelPlan: TravelPlan = {
  weddingId: DEMO_WEDDING_ID,
  studio: demoStudio,
  places: demoPlaces,
  segments: [
    segment(1, 'studio', 'wedding_place', 12000, 1080, null, 'lv3-place-groom', '12 km', '18 min'),
    segment(2, 'wedding_place', 'wedding_place', 16000, 1260, 'lv3-place-groom', 'lv3-place-bride', '16 km', '21 min'),
    segment(3, 'wedding_place', 'wedding_place', 18000, 1440, 'lv3-place-bride', 'lv3-place-ceremony', '18 km', '24 min'),
    segment(4, 'wedding_place', 'wedding_place', 11000, 1020, 'lv3-place-ceremony', 'lv3-place-reception', '11 km', '17 min'),
  ],
  hasError: false,
  errorMessage: null,
  persistenceError: null,
}

export const demoRouteStops = [
  { id: 'start', label: 'Start', detail: 'Studio · Poznań', time: '8:00', leg: null },
  {
    id: 'groom',
    label: 'Przygotowania Pana Młodego',
    detail: DEMO_ASSIGNMENT.groomPrep,
    time: '9:30',
    leg: { from: 'Studio', to: 'Pan Młody', duration: '18 min', distance: '12 km' },
  },
  {
    id: 'bride',
    label: 'Przygotowania Panny Młodej',
    detail: DEMO_ASSIGNMENT.bridePrep,
    time: '11:00',
    leg: { from: 'Pan Młody', to: 'Panna Młoda', duration: '21 min', distance: '16 km' },
  },
  {
    id: 'ceremony',
    label: 'Ceremonia',
    detail: DEMO_ASSIGNMENT.ceremony,
    time: '14:00',
    leg: { from: 'Panna Młoda', to: 'Ceremonia', duration: '24 min', distance: '18 km' },
  },
  {
    id: 'reception',
    label: 'Przyjęcie weselne',
    detail: DEMO_ASSIGNMENT.reception,
    time: '17:00',
    leg: { from: 'Ceremonia', to: 'Przyjęcie', duration: '17 min', distance: '11 km' },
  },
] as const

export const demoRouteTotal = {
  distance: '57 km',
  duration: '1 godz. 20 min',
} as const

export const demoNotifications: Notification[] = [
  {
    id: 'lv3-n-1',
    type: 'info',
    title: 'Ankieta przedślubna',
    message: 'Julia i Adrian przesłali odpowiedzi do przeglądu.',
    createdAt: '2027-04-28',
    createdAtIso: '2027-04-28T10:00:00.000Z',
    read: false,
  },
  {
    id: 'lv3-n-2',
    type: 'success',
    title: 'Umowa podpisana',
    message: 'Julia i Adrian — umowa oznaczona jako podpisana.',
    createdAt: '2026-10-02',
    createdAtIso: '2026-10-02T14:00:00.000Z',
    read: true,
  },
  {
    id: 'lv3-n-3',
    type: 'warning',
    title: 'Zbliżający się termin',
    message: 'Ola i Bartek — 3 tygodnie do ślubu.',
    createdAt: '2027-06-12',
    createdAtIso: '2027-06-12T08:00:00.000Z',
    read: false,
  },
]

export const demoTasks: Task[] = [
  {
    id: 'lv3-task-1',
    weddingId: DEMO_WEDDING_ID,
    title: 'Sprawdź brief przed wyjazdem',
    dueDate: DEMO_ASSIGNMENT.date,
    completed: false,
    priority: 'high',
  },
  {
    id: 'lv3-task-2',
    weddingId: DEMO_WEDDING_ID,
    title: 'Potwierdź godzinę ceremonii',
    dueDate: DEMO_ASSIGNMENT.date,
    completed: false,
    priority: 'medium',
  },
  {
    id: 'lv3-task-3',
    weddingId: 'lv3-ola-bartek',
    title: 'Wyślij przypomnienie o ankiecie',
    dueDate: '2027-06-20',
    completed: false,
    priority: 'medium',
  },
]

export const demoQuestionnaireFields: {
  question: Question
  value: string
}[] = [
  {
    question: {
      id: 'bride-prep',
      type: 'text',
      label: 'Przygotowania Panny Młodej',
      required: true,
    },
    value: DEMO_ASSIGNMENT.bridePrep,
  },
  {
    question: {
      id: 'groom-prep',
      type: 'text',
      label: 'Przygotowania Pana Młodego',
      required: true,
    },
    value: DEMO_ASSIGNMENT.groomPrep,
  },
  {
    question: {
      id: 'ceremony',
      type: 'text',
      label: 'Ceremonia',
      required: true,
    },
    value: DEMO_ASSIGNMENT.ceremony,
  },
  {
    question: {
      id: 'reception',
      type: 'text',
      label: 'Przyjęcie weselne',
      required: true,
    },
    value: DEMO_ASSIGNMENT.reception,
  },
  {
    question: {
      id: 'ceremony-time',
      type: 'text',
      label: 'Godzina ceremonii',
      required: true,
    },
    value: DEMO_ASSIGNMENT.ceremonyTime,
  },
  {
    question: {
      id: 'reception-time',
      type: 'text',
      label: 'Godzina przyjęcia',
      required: true,
    },
    value: DEMO_ASSIGNMENT.receptionTime,
  },
  {
    question: {
      id: 'notes',
      type: 'textarea',
      label: 'Dodatkowe informacje',
      required: false,
    },
    value: 'Tort o 21:30. Para prosi o dyskretne ujęcia podczas ceremonii.',
  },
]

export const demoReviewRows = [
  {
    id: 'bride',
    label: 'Miejsce przygotowań Panny Młodej',
    value: DEMO_ASSIGNMENT.bridePrep,
  },
  {
    id: 'ceremony-time',
    label: 'Godzina ceremonii',
    value: DEMO_ASSIGNMENT.ceremonyTime,
  },
  {
    id: 'reception',
    label: 'Miejsce przyjęcia weselnego',
    value: DEMO_ASSIGNMENT.reception,
  },
] as const

export const demoCalendarIntegrations = {
  google: { label: 'Google Calendar', status: 'Zsynchronizowano', pending: 'Oczekuje' },
  apple: { label: 'Apple Calendar', status: 'Aktywny', pending: 'Nieaktywny' },
} as const

export const DEMO_BENEFITS = [
  'Dane pary wracają do zlecenia bez przepisywania',
  'Umowy i ankiety na podstawie jednego źródła',
  'Kalendarze i brief gotowe przed wyjazdem',
] as const

export const DEMO_FAQ = [
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
    q: 'Jak działa synchronizacja kalendarzy?',
    a: 'Zlecenia mogą trafiać do Google Calendar i Apple Calendar. OurWed pozostaje źródłem danych.',
  },
  {
    q: 'Czy mogę zacząć bez karty płatniczej?',
    a: 'Tak. Możesz założyć bezpłatne konto i sprawdzić workflow bez karty.',
  },
] as const

export const DEMO_COMPLETION = [
  'Umowa podpisana',
  'Ankieta przedślubna wypełniona',
  'Dane dnia zatwierdzone',
  'Google Calendar zsynchronizowany',
] as const
