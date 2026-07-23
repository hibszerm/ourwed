import type { QuestionnaireListItem } from '@/lib/api/questionnaireService'
import { getRemainingAmount, getTotalPaid } from '@/lib/utils/finance'
import type { TravelPlan } from '@/types/travel'
import type { FormInstance } from '@/types/formEngine'
import type {
  FinanceItem,
  Notification,
  Payment,
  Task,
  Wedding,
  WorkflowStage,
} from '@/types/wedding'

export const DEMO_WEDDING_ID = 'demo-wedding-anna-michal'
export const DEMO_USER_NAME = 'Anna'

const MASK = {
  phone: '••• ••• •••',
  email: '••••••••@gmail.com',
  address: 'ul. ********',
  postal: '**-***',
} as const

function couple(
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
    partner1Address: MASK.address,
    partner1PostalCode: MASK.postal,
    partner1City: city,
    partner2Phone: MASK.phone,
    partner2Email: MASK.email,
    partner2Address: MASK.address,
    partner2PostalCode: MASK.postal,
    partner2City: city,
    email: MASK.email,
    phone: MASK.phone,
    venue,
    city,
  }
}

function payments(deposit: number, remaining: number, depositPaidAt: string, finalDue: string): Payment[] {
  return [
    {
      id: `pay-d-${deposit}-${depositPaidAt}`,
      label: 'Zadatek',
      amount: deposit,
      type: 'deposit',
      paid: true,
      paidAt: depositPaidAt,
      dueDate: depositPaidAt,
      method: 'transfer',
    },
    {
      id: `pay-f-${remaining}-${finalDue}`,
      label: 'Płatność końcowa',
      amount: remaining,
      type: 'final',
      paid: false,
      dueDate: finalDue,
      method: 'transfer',
    },
  ]
}

function baseWedding(input: {
  id: string
  couple: Wedding['couple']
  date: string
  ceremonyTime: string
  stage: WorkflowStage
  packageName: string
  price: number
  deposit: number
  accent: string
  prep: string
  ceremony: string
  reception: string
  createdAt: string
  paymentRows: Payment[]
  finances?: FinanceItem[]
}): Wedding {
  return {
    id: input.id,
    couple: input.couple,
    date: input.date,
    ceremonyTime: input.ceremonyTime,
    status: 'active',
    workflowStage: input.stage,
    packageName: input.packageName,
    packageId: null,
    price: input.price,
    depositAmount: input.deposit,
    currency: 'PLN',
    preparationLocation: input.prep,
    ceremonyLocation: input.ceremony,
    receptionLocation: input.reception,
    accentColor: input.accent,
    createdAt: input.createdAt,
    checklist: [],
    schedule: [],
    payments: input.paymentRows,
    finances: input.finances ?? [],
    questionnaires: {
      contractData: { status: 'completed', sentAt: input.createdAt.slice(0, 10), completedAt: input.createdAt.slice(0, 10) },
      weddingQuestionnaire: { status: 'sent', sentAt: input.createdAt.slice(0, 10) },
    },
    contract: { status: 'signed', signedAt: input.createdAt.slice(0, 10) },
    notes: [],
    deliverables: [],
    timeline: [],
  }
}

/** Primary clickable wedding — fully populated. */
export const demoWedding: Wedding = {
  id: DEMO_WEDDING_ID,
  couple: couple('Anna', 'Kowalska', 'Michał', 'Kowalski', 'Pałac Mała Wieś', 'Grójec'),
  date: '2026-08-22',
  ceremonyTime: '14:30',
  status: 'active',
  workflowStage: 'preparation',
  packageName: 'Reportaż Premium',
  packageId: null,
  price: 8500,
  depositAmount: 3000,
  currency: 'PLN',
  preparationLocation: 'Villa Love',
  ceremonyLocation: 'Kościół św. Anny',
  receptionLocation: 'Pałac Mała Wieś',
  accentColor: '#0a0a0a',
  createdAt: '2026-03-12T10:00:00.000Z',
  checklist: [
    { id: 'eq1', label: 'Aparat + zapasowe baterie', completed: true, category: 'camera' },
    { id: 'eq2', label: 'Obiektyw 35 mm / 85 mm', completed: true, category: 'camera' },
    { id: 'eq3', label: 'Lampy błyskowe', completed: true, category: 'light' },
    { id: 'eq4', label: 'Mikrofony krawatowe', completed: false, category: 'audio' },
    { id: 'eq5', label: 'Statyw + gimbal', completed: false, category: 'support' },
  ],
  schedule: [
    { id: 's1', time: '10:00', title: 'Przyjazd do Panny Młodej', location: 'Villa Love' },
    { id: 's2', time: '11:45', title: 'Przyjazd do Pana Młodego', location: 'Hotel Verte, Warszawa' },
    { id: 's3', time: '13:00', title: 'First Look', location: 'Ogród Saski' },
    { id: 's4', time: '14:30', title: 'Ceremonia', location: 'Kościół św. Anny' },
    { id: 's5', time: '16:00', title: 'Życzenia', location: 'Pałac Mała Wieś' },
    { id: 's6', time: '17:00', title: 'Obiad', location: 'Pałac Mała Wieś' },
    { id: 's7', time: '18:30', title: 'Sesja', location: 'Park przy pałacu' },
    { id: 's8', time: '20:00', title: 'Pierwszy taniec', location: 'Pałac Mała Wieś' },
    { id: 's9', time: '22:00', title: 'Tort', location: 'Pałac Mała Wieś' },
  ],
  payments: payments(3000, 5500, '2026-04-02', '2026-08-15'),
  finances: [
    { id: 'ex1', label: 'Asystent fotograf', amount: 800, type: 'expense', paid: true, dueDate: '2026-08-22' },
    { id: 'ex2', label: 'Wynajem lamp', amount: 350, type: 'expense', paid: false, dueDate: '2026-08-20' },
  ],
  questionnaires: {
    contractData: { status: 'completed', sentAt: '2026-03-15', completedAt: '2026-03-18' },
    weddingQuestionnaire: { status: 'completed', sentAt: '2026-06-01', completedAt: '2026-06-20' },
  },
  contract: {
    status: 'signed',
    generatedAt: '2026-03-20',
    sentAt: '2026-03-21',
    signedAt: '2026-03-28',
  },
  notes: [
    {
      id: 'n1',
      content: 'Para prosi o dyskretne ujęcia podczas ceremonii. Tort o 22:00 — ważny moment rodzinny.',
      createdAt: '2026-06-21T12:00:00.000Z',
      author: 'System',
      badge: 'Ankieta ślubna',
      source: 'wedding_questionnaire',
    },
    {
      id: 'n2',
      content: 'Dojazd do Pałacu Mała Wieś — parking od strony ogrodu.',
      createdAt: '2026-07-02T09:00:00.000Z',
      author: 'Anna',
    },
  ],
  deliverables: [
    { id: 'd1', name: 'Teaser wideo', source: 'package', completed: false, deliveryDate: '2026-09-05' },
    { id: 'd2', name: 'Galeria online', source: 'package', completed: false, deliveryDate: '2026-10-15' },
  ],
  timeline: [
    { id: 't1', title: 'Rezerwacja utworzona', date: '2026-03-12', type: 'created', description: 'Nowe zlecenie Anna & Michał' },
    { id: 't2', title: 'Ankieta umowy ukończona', date: '2026-03-18', type: 'questionnaire_completed' },
    { id: 't3', title: 'Umowa podpisana', date: '2026-03-28', type: 'contract_signed' },
    { id: 't4', title: 'Zadatek otrzymany', date: '2026-04-02', type: 'payment_received', description: '3 000 zł' },
    { id: 't5', title: 'Ankieta ślubna ukończona', date: '2026-06-20', type: 'questionnaire_completed' },
  ],
}

const weddingJulia = baseWedding({
  id: 'demo-wedding-julia-tomasz',
  couple: couple('Julia', 'Wiśniewska', 'Tomasz', 'Zieliński', 'Dwór Sanna', 'Lublin'),
  date: '2026-08-29',
  ceremonyTime: '15:00',
  stage: 'deposit',
  packageName: 'Reportaż Standard',
  price: 6200,
  deposit: 2000,
  accent: '#404040',
  prep: 'Hotel Focus, Lublin',
  ceremony: 'Archikatedra lubelska',
  reception: 'Dwór Sanna',
  createdAt: '2026-04-01T10:00:00.000Z',
  paymentRows: payments(2000, 4200, '2026-04-20', '2026-08-20'),
  finances: [{ id: 'ex-j1', label: 'Dojazd Lublin', amount: 420, type: 'expense', paid: true }],
})

const weddingNatalia = baseWedding({
  id: 'demo-wedding-natalia-kacper',
  couple: couple('Natalia', 'Nowak', 'Kacper', 'Mazur', 'Hotel Narvil', 'Serock'),
  date: '2026-09-05',
  ceremonyTime: '14:00',
  stage: 'pre_wedding_questionnaire',
  packageName: 'Film + Foto',
  price: 9800,
  deposit: 3500,
  accent: '#737373',
  prep: 'Villa Park, Serock',
  ceremony: 'Kościół w Zegrzu',
  reception: 'Hotel Narvil',
  createdAt: '2026-05-10T10:00:00.000Z',
  paymentRows: payments(3500, 6300, '2026-05-28', '2026-08-28'),
  finances: [{ id: 'ex-n1', label: 'Drugi kamerzysta', amount: 1200, type: 'expense', paid: false, dueDate: '2026-09-05' }],
})

const weddingMartyna = baseWedding({
  id: 'demo-wedding-martyna-sebastian',
  couple: couple('Martyna', 'Szymańska', 'Sebastian', 'Kowalczyk', 'Pałac Żelechów', 'Żelechów'),
  date: '2026-09-12',
  ceremonyTime: '16:00',
  stage: 'contract',
  packageName: 'Mini Reportaż',
  price: 4500,
  deposit: 1500,
  accent: '#525252',
  prep: 'Apartamenty Centrum',
  ceremony: 'Kościół parafialny Żelechów',
  reception: 'Pałac Żelechów',
  createdAt: '2026-06-02T10:00:00.000Z',
  paymentRows: [
    {
      id: 'pay-ms1',
      label: 'Zadatek',
      amount: 1500,
      type: 'deposit',
      paid: false,
      dueDate: '2026-07-15',
      method: 'transfer',
    },
    {
      id: 'pay-ms2',
      label: 'Płatność końcowa',
      amount: 3000,
      type: 'final',
      paid: false,
      dueDate: '2026-09-01',
      method: 'transfer',
    },
  ],
})

const weddingMagdalena = baseWedding({
  id: 'demo-wedding-magdalena-piotr',
  couple: couple('Magdalena', 'Wójcik', 'Piotr', 'Lis', 'Folwark Łękno', 'Poznań'),
  date: '2026-07-18',
  ceremonyTime: '13:30',
  stage: 'post_production',
  packageName: 'Reportaż Premium',
  price: 8500,
  deposit: 3000,
  accent: '#a3a3a3',
  prep: 'Hotel Andersia',
  ceremony: 'Fara Poznańska',
  reception: 'Folwark Łękno',
  createdAt: '2025-11-20T10:00:00.000Z',
  paymentRows: [
    {
      id: 'pay-m1',
      label: 'Zadatek',
      amount: 3000,
      type: 'deposit',
      paid: true,
      paidAt: '2025-12-05',
      dueDate: '2025-12-01',
      method: 'transfer',
    },
    {
      id: 'pay-m2',
      label: 'Płatność końcowa',
      amount: 5500,
      type: 'final',
      paid: true,
      paidAt: '2026-07-10',
      dueDate: '2026-07-10',
      method: 'transfer',
    },
  ],
  finances: [
    { id: 'ex-m1', label: 'Montaż teaser', amount: 600, type: 'expense', paid: true },
    { id: 'ex-m2', label: 'Retusz galerii', amount: 450, type: 'expense', paid: false, dueDate: '2026-08-01' },
  ],
})

/** All demo weddings — first is the only clickable one in the list. */
export const demoWeddings: Wedding[] = [
  demoWedding,
  weddingJulia,
  weddingNatalia,
  weddingMartyna,
  weddingMagdalena,
]

export const demoWeddingTasks: Task[] = [
  { id: 'wt-1', weddingId: DEMO_WEDDING_ID, title: 'Wysłano ankietę', dueDate: '2026-03-15', completed: true, priority: 'medium' },
  { id: 'wt-2', weddingId: DEMO_WEDDING_ID, title: 'Podpisano umowę', dueDate: '2026-03-28', completed: true, priority: 'high' },
  { id: 'wt-3', weddingId: DEMO_WEDDING_ID, title: 'Opłacono zaliczkę', dueDate: '2026-04-02', completed: true, priority: 'high' },
  { id: 'wt-4', weddingId: DEMO_WEDDING_ID, title: 'Dodano lokalizacje', dueDate: '2026-06-01', completed: true, priority: 'medium' },
  { id: 'wt-5', weddingId: DEMO_WEDDING_ID, title: 'Oddać teaser', dueDate: '2026-09-05', completed: false, priority: 'high' },
  { id: 'wt-6', weddingId: DEMO_WEDDING_ID, title: 'Oddać galerię', dueDate: '2026-10-15', completed: false, priority: 'medium' },
]

export const demoTasks: Task[] = [
  { id: 'task-1', weddingId: DEMO_WEDDING_ID, title: 'Oddać teaser', dueDate: '2026-09-05', completed: false, priority: 'high' },
  { id: 'task-2', weddingId: DEMO_WEDDING_ID, title: 'Potwierdzić dojazd do Pałacu Mała Wieś', dueDate: '2026-08-20', completed: false, priority: 'medium' },
  { id: 'task-3', weddingId: weddingJulia.id, title: 'Przypomnieć o zadatku końcowym', dueDate: '2026-08-18', completed: false, priority: 'high' },
  { id: 'task-4', weddingId: weddingNatalia.id, title: 'Wysłać ankietę przedślubną', dueDate: '2026-08-10', completed: false, priority: 'medium' },
]

export const demoNotifications: Notification[] = [
  {
    id: 'n-1',
    title: 'Ankieta ślubna ukończona',
    message: 'Anna & Michał uzupełnili ankietę przedślubną.',
    createdAt: new Date().toISOString(),
    read: false,
    type: 'success',
  },
  {
    id: 'n-2',
    title: 'Zbliża się ślub',
    message: 'Anna & Michał · 22 sie 2026',
    createdAt: new Date().toISOString(),
    read: false,
    type: 'info',
  },
  {
    id: 'n-3',
    title: 'Płatność końcowa',
    message: 'Pozostało 5 500 zł — termin 15 sie 2026',
    createdAt: new Date().toISOString(),
    read: true,
    type: 'warning',
  },
  {
    id: 'n-4',
    title: 'Nowe zgłoszenie',
    message: 'Karolina & Adam wysłali dane do umowy.',
    createdAt: new Date().toISOString(),
    read: false,
    type: 'info',
  },
]

export const demoMaskedMeta = {
  contractNumber: '••••••',
  peselBride: '•••••••••••',
  peselGroom: '•••••••••••',
  groomPrep: 'Hotel Verte, Warszawa',
} as const

export const demoQuestionnaireAnswers: Record<string, string> = {
  'Pierwszy taniec': 'Walc wiedeński — „Moon River”',
  'Kolory przewodnie': 'Szampański i zieleń oliwkowa',
  'Sesja plenerowa': 'Park przy Pałacu Mała Wieś, około 18:30',
  'Uwagi dla fotografów / zespołu':
    'Prosimy o dyskretne ujęcia przy ołtarzu. Tort o 22:00 — ważny moment rodzinny.',
  'Przygotowania Panny Młodej': 'Villa Love',
  'Przygotowania Pana Młodego': 'Hotel Verte, Warszawa',
}

/** Travel: Studio → Przygotowania → Ceremonia → Przyjęcie */
export const demoTravelPlan: TravelPlan = {
  weddingId: DEMO_WEDDING_ID,
  studio: {
    id: 'demo-studio',
    userId: 'demo-user',
    studioName: 'Studio OurWed',
    street: 'ul. Mokotowska',
    buildingNumber: '12',
    postalCode: '00-561',
    city: 'Warszawa',
    country: 'PL',
    formattedAddress: 'ul. Mokotowska 12, 00-561 Warszawa',
    latitude: 52.2194,
    longitude: 21.0172,
    placeId: 'demo-studio-place',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  places: [
    {
      id: 'place-prep',
      weddingId: DEMO_WEDDING_ID,
      role: 'preparation',
      label: 'Villa Love',
      placeId: 'demo-villa-love',
      formattedAddress: 'Villa Love, Konstancin-Jeziorna',
      latitude: 52.0935,
      longitude: 21.1178,
      sortOrder: 0,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
    {
      id: 'place-ceremony',
      weddingId: DEMO_WEDDING_ID,
      role: 'ceremony',
      label: 'Kościół św. Anny',
      placeId: 'demo-anna',
      formattedAddress: 'Kościół św. Anny, Krakowskie Przedmieście 68, Warszawa',
      latitude: 52.2472,
      longitude: 21.0141,
      sortOrder: 1,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
    {
      id: 'place-reception',
      weddingId: DEMO_WEDDING_ID,
      role: 'reception',
      label: 'Pałac Mała Wieś',
      placeId: 'demo-palac',
      formattedAddress: 'Pałac Mała Wieś, Mała Wieś, gm. Grójec',
      latitude: 51.8655,
      longitude: 20.8512,
      sortOrder: 2,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  ],
  segments: [
    {
      id: 'seg-1',
      weddingId: DEMO_WEDDING_ID,
      sequence: 0,
      originKind: 'studio',
      originWeddingPlaceId: null,
      destinationKind: 'wedding_place',
      destinationWeddingPlaceId: 'place-prep',
      endpointsHash: 'demo-1',
      distanceMeters: 18_000,
      distanceText: '18 km',
      durationSeconds: 22 * 60,
      durationText: '22 min',
      travelMode: 'DRIVE',
      provider: 'demo',
      status: 'ok',
      errorMessage: null,
      calculatedAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'seg-2',
      weddingId: DEMO_WEDDING_ID,
      sequence: 1,
      originKind: 'wedding_place',
      originWeddingPlaceId: 'place-prep',
      destinationKind: 'wedding_place',
      destinationWeddingPlaceId: 'place-ceremony',
      endpointsHash: 'demo-2',
      distanceMeters: 22_000,
      distanceText: '22 km',
      durationSeconds: 18 * 60,
      durationText: '18 min',
      travelMode: 'DRIVE',
      provider: 'demo',
      status: 'ok',
      errorMessage: null,
      calculatedAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'seg-3',
      weddingId: DEMO_WEDDING_ID,
      sequence: 2,
      originKind: 'wedding_place',
      originWeddingPlaceId: 'place-ceremony',
      destinationKind: 'wedding_place',
      destinationWeddingPlaceId: 'place-reception',
      endpointsHash: 'demo-3',
      distanceMeters: 12_000,
      distanceText: '12 km',
      durationSeconds: 11 * 60,
      durationText: '11 min',
      travelMode: 'DRIVE',
      provider: 'demo',
      status: 'ok',
      errorMessage: null,
      calculatedAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
  ],
  hasError: false,
  errorMessage: null,
}

function makeInstance(
  id: string,
  formId: string,
  weddingId: string | null,
  status: FormInstance['status'],
  createdAt: string,
  extras: Partial<FormInstance> = {},
): FormInstance {
  return {
    id,
    formId,
    weddingId,
    token: `demo-token-${id}`,
    status,
    expiresAt: null,
    openedAt: extras.openedAt ?? null,
    submittedAt: extras.submittedAt ?? null,
    approvedAt: extras.approvedAt ?? null,
    rejectedAt: extras.rejectedAt ?? null,
    createdAt,
  }
}

/**
 * CRM questionnaire list for the Ankiety tab.
 * Status labels match the real app (`QUESTIONNAIRE_STATUS_LABELS`).
 */
export const demoQuestionnaires: QuestionnaireListItem[] = [
  {
    instance: makeInstance('q-1', 'form-contract', DEMO_WEDDING_ID, 'submitted', '2026-03-15T10:00:00.000Z', {
      openedAt: '2026-03-16T09:00:00.000Z',
      submittedAt: '2026-03-18T14:00:00.000Z',
    }),
    form: null,
    formName: 'Dane do umowy',
    formUrl: '#',
    search: {
      bride: 'Anna Kowalska',
      groom: 'Michał Kowalski',
      email: MASK.email,
      phone: MASK.phone,
      weddingDate: '2026-08-22',
    },
  },
  {
    instance: makeInstance('q-2', 'form-schedule', DEMO_WEDDING_ID, 'pending', '2026-06-10T10:00:00.000Z'),
    form: null,
    formName: 'Harmonogram dnia',
    formUrl: '#',
    search: {
      bride: 'Anna Kowalska',
      groom: 'Michał Kowalski',
      email: MASK.email,
      phone: MASK.phone,
      weddingDate: '2026-08-22',
    },
  },
  {
    instance: makeInstance('q-3', 'form-shots', DEMO_WEDDING_ID, 'approved', '2026-06-12T10:00:00.000Z', {
      openedAt: '2026-06-13T11:00:00.000Z',
      submittedAt: '2026-06-20T16:00:00.000Z',
      approvedAt: '2026-06-21T09:00:00.000Z',
    }),
    form: null,
    formName: 'Lista ujęć',
    formUrl: '#',
    search: {
      bride: 'Anna Kowalska',
      groom: 'Michał Kowalski',
      email: MASK.email,
      phone: MASK.phone,
      weddingDate: '2026-08-22',
    },
  },
  {
    instance: makeInstance('q-4', 'form-org', DEMO_WEDDING_ID, 'opened', '2026-07-01T10:00:00.000Z', {
      openedAt: '2026-07-02T08:30:00.000Z',
    }),
    form: null,
    formName: 'Informacje organizacyjne',
    formUrl: '#',
    search: {
      bride: 'Anna Kowalska',
      groom: 'Michał Kowalski',
      email: MASK.email,
      phone: MASK.phone,
      weddingDate: '2026-08-22',
    },
  },
  {
    instance: makeInstance('q-5', 'form-contract', weddingNatalia.id, 'pending', '2026-07-08T10:00:00.000Z'),
    form: null,
    formName: 'Dane do umowy',
    formUrl: '#',
    search: {
      bride: 'Natalia Nowak',
      groom: 'Kacper Mazur',
      email: MASK.email,
      phone: MASK.phone,
      weddingDate: '2026-09-05',
    },
  },
]

/** Demo-only display overrides for marketing-friendly status copy. */
export const demoQuestionnaireStatusOverride: Record<string, string> = {
  'q-1': 'Ukończona',
  'q-2': 'Oczekuje',
  'q-3': 'Wysłana',
  'q-4': 'Ukończona',
  'q-5': 'Oczekuje',
}

/** Showcase questionnaire cards for the Ankiety tab. */
export const demoQuestionnaireCards = [
  {
    id: 'q-1',
    title: 'Ankieta do umowy',
    status: 'Ukończona',
    tone: 'success' as const,
    couple: 'Anna & Michał',
    clickable: true,
  },
  {
    id: 'q-2',
    title: 'Ankieta ślubna',
    status: 'Oczekuje',
    tone: 'warning' as const,
    couple: 'Anna & Michał',
    clickable: false,
  },
  {
    id: 'q-3',
    title: 'Harmonogram dnia',
    status: 'Wysłana',
    tone: 'info' as const,
    couple: 'Anna & Michał',
    clickable: false,
  },
  {
    id: 'q-4',
    title: 'Ankieta gości',
    status: 'Ukończona',
    tone: 'success' as const,
    couple: 'Magdalena & Piotr',
    clickable: false,
  },
] as const

export interface DemoPaymentRow {
  id: string
  weddingId: string
  coupleLabel: string
  label: string
  amount: number
  dueDate?: string
  paidAt?: string
  paid: boolean
}

export interface DemoSeasonFinance {
  seasonRevenue: number
  paidTotal: number
  remainingTotal: number
  expensesTotal: number
  profit: number
  monthly: { key: string; label: string; revenue: number }[]
  upcoming: DemoPaymentRow[]
  recent: DemoPaymentRow[]
}

const MONTH_LABELS = [
  'sty', 'lut', 'mar', 'kwi', 'maj', 'cze',
  'lip', 'sie', 'wrz', 'paź', 'lis', 'gru',
]

/** Season finance aggregates derived from demo weddings (landing only). */
export function getDemoSeasonFinance(weddings: Wedding[] = demoWeddings): DemoSeasonFinance {
  let seasonRevenue = 0
  let paidTotal = 0
  let remainingTotal = 0
  let expensesTotal = 0
  const upcoming: DemoPaymentRow[] = []
  const recent: DemoPaymentRow[] = []
  const monthlyMap = new Map<string, number>()

  for (const w of weddings) {
    seasonRevenue += w.price
    paidTotal += getTotalPaid(w.payments)
    remainingTotal += getRemainingAmount(w.price, w.payments)
    expensesTotal += w.finances.reduce((s, e) => s + e.amount, 0)

    const monthKey = w.date.slice(0, 7)
    monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + w.price)

    const coupleLabel = `${w.couple.partner1FirstName ?? w.couple.partner1} & ${w.couple.partner2FirstName ?? w.couple.partner2}`

    for (const p of w.payments) {
      const row: DemoPaymentRow = {
        id: `${w.id}-${p.id}`,
        weddingId: w.id,
        coupleLabel,
        label: p.label,
        amount: p.amount,
        dueDate: p.dueDate,
        paidAt: p.paidAt,
        paid: p.paid,
      }
      if (p.paid) recent.push(row)
      else upcoming.push(row)
    }
  }

  upcoming.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  recent.sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? ''))

  const monthlyKeys = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
  const monthly = monthlyKeys.map((key) => {
    const [, m] = key.split('-')
    const monthIndex = Number(m) - 1
    return {
      key,
      label: MONTH_LABELS[monthIndex] ?? key,
      revenue: monthlyMap.get(key) ?? 0,
    }
  })

  return {
    seasonRevenue,
    paidTotal,
    remainingTotal,
    expensesTotal,
    profit: paidTotal - expensesTotal,
    monthly,
    upcoming,
    recent: recent.slice(0, 6),
  }
}

export interface DemoStat {
  label: string
  value: string
}

export function getDemoDashboardStats(weddings: Wedding[] = demoWeddings): DemoStat[] {
  const active = weddings.filter((w) => w.status === 'active').length
  const season = getDemoSeasonFinance(weddings)
  const pendingTasks = demoTasks.filter((t) => !t.completed).length
  return [
    { label: 'Aktywne śluby', value: String(active) },
    { label: 'Przychód sezonu', value: `${Math.round(season.seasonRevenue / 1000)} tys.` },
    { label: 'Do zapłaty', value: `${Math.round(season.remainingTotal / 1000)} tys.` },
    { label: 'Zadania', value: String(pendingTasks) },
  ]
}
