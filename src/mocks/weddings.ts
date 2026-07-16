import type { Wedding } from '@/types/wedding'
import { mockPackages } from '@/mocks/packages'
import { getWeddingTimeline } from '@/mocks/weddingTimeline'
import {
  appendAdditionalDeliverable,
  createWeddingDeliverablesFromPackage,
} from '@/lib/utils/deliverables'

function packageDeliverablesForWedding(weddingId: string, packageName: string) {
  const pkg = mockPackages.find((p) => p.name === packageName)
  if (!pkg) return []
  return createWeddingDeliverablesFromPackage(weddingId, pkg)
}

export const mockWeddings: Wedding[] = [
  {
    id: 'w1',
    couple: {
      partner1: 'Anna',
      partner2: 'Michał',
      partner1Phone: '+48 600 123 456',
      partner1Email: 'anna@email.pl',
      partner2Phone: '+48 600 654 321',
      partner2Email: 'michal@email.pl',
      email: 'anna.michal@email.pl',
      phone: '+48 600 123 456',
      venue: 'Pałac w Wilanowie',
      city: 'Warszawa',
    },
    date: '2026-08-15',
    workflowStage: 'preparation',
    packageName: 'Photo + Film Signature',
    price: 45000,
    ceremonyLocation: 'Kościół św. Anny, Warszawa',
    receptionLocation: 'Pałac w Wilanowie, Warszawa',
    accentColor: '#7c5cbf',
    createdAt: '2026-03-10',
    checklist: [
      { id: 'c1', label: 'Podpisanie umowy', completed: true, category: 'Formalności' },
      { id: 'c2', label: 'Zaliczka wpłacona', completed: true, category: 'Płatności' },
      { id: 'c3', label: 'Ankieta ślubna od pary', completed: true, category: 'Komunikacja' },
      { id: 'c4', label: 'Potwierdzony shooting schedule', completed: false, category: 'Timeline' },
      { id: 'c5', label: 'Lista kluczowych ujęć od pary', completed: false, category: 'Przygotowanie' },
      { id: 'c6', label: 'Checklista sprzętu gotowa', completed: false, category: 'Sprzęt' },
      { id: 'c7', label: 'Plan backupu kart pamięci', completed: false, category: 'Postprodukcja' },
      { id: 'c8', label: 'Potwierdzenie godzin z second shooterem', completed: false, category: 'Zespół' },
    ],
    schedule: [
      { id: 's1', time: '09:30', title: 'Przygotowania u panny młodej', location: 'Wilanów' },
      { id: 's2', time: '11:00', title: 'Przygotowania u pana młodego', location: 'Wilanów' },
      { id: 's3', time: '12:30', title: 'Ceremonia', location: 'Kościół św. Anny' },
      { id: 's4', time: '14:15', title: 'Portrety po ceremonii', location: 'Ogród pałacowy' },
      { id: 's5', time: '16:00', title: 'Start reportażu weselnego', location: 'Pałac w Wilanowie' },
      { id: 's6', time: '18:00', title: 'Pierwszy taniec i teaser shots', location: 'Sala balowa' },
      { id: 's7', time: '23:30', title: 'Zakończenie coverage', location: 'Pałac w Wilanowie' },
    ],
    finances: [
      { id: 'f3', label: 'Wynagrodzenie second shootera', amount: 2800, type: 'expense', paid: false, dueDate: '2026-08-12' },
      { id: 'f4', label: 'Archiwizacja materiału na SSD', amount: 900, type: 'expense', paid: false, dueDate: '2026-08-20' },
    ],
    payments: [
      {
        id: 'p1',
        label: 'Zaliczka',
        amount: 15000,
        type: 'deposit',
        paid: true,
        paidAt: '2026-03-15',
      },
      {
        id: 'p2',
        label: 'Druga transza',
        amount: 15000,
        type: 'installment',
        paid: false,
        dueDate: '2026-07-25',
      },
    ],
    questionnaires: {
      contractData: { status: 'completed', sentAt: '2026-03-10', completedAt: '2026-03-10' },
      weddingQuestionnaire: { status: 'completed', sentAt: '2026-04-01', completedAt: '2026-05-20' },
    },
    contract: {
      status: 'signed',
      generatedAt: '2026-03-11',
      sentAt: '2026-03-11',
      signedAt: '2026-03-12',
    },
    notes: [
      {
        id: 'n1',
        content: 'Para chce mocno reportażowy styl i naturalny color grading.',
        createdAt: '2026-05-10',
        author: 'Karolina',
      },
      {
        id: 'n2',
        content: 'Priorytet: szybki teaser do 72 godzin po ślubie.',
        createdAt: '2026-06-02',
        author: 'Karolina',
      },
      {
        id: 'n3',
        content: 'Ujęcia rodzinne tylko po ceremonii, max 20 minut.',
        createdAt: '2026-06-28',
        author: 'Karolina',
      },
    ],
    deliverables: (() => {
      const base = packageDeliverablesForWedding('w1', 'Photo + Film Signature')
      return base.map((d) =>
        d.packageDeliverableId === 'pd-teaser' || d.packageDeliverableId === 'pd-reel'
          ? { ...d, completed: true, completedAt: '2026-08-18' }
          : d,
      )
    })(),
    timeline: getWeddingTimeline('w1'),
  },
  {
    id: 'w2',
    couple: {
      partner1: 'Katarzyna',
      partner2: 'Piotr',
      email: 'kasia.piotr@email.pl',
      phone: '+48 601 234 567',
      venue: 'Dworek nad Jeziorem',
      city: 'Mazury',
    },
    date: '2026-09-20',
    workflowStage: 'deposit',
    packageName: 'Film Documentary',
    price: 32000,
    ceremonyLocation: 'Altana nad jeziorem, Mazury',
    receptionLocation: 'Dworek nad Jeziorem, Mazury',
    accentColor: '#5c8f7c',
    createdAt: '2026-04-15',
    checklist: [
      { id: 'c1', label: 'Podpisanie umowy', completed: true, category: 'Formalności' },
      { id: 'c2', label: 'Pierwsza zaliczka opłacona', completed: true, category: 'Płatności' },
      { id: 'c3', label: 'Ankieta kontraktowa', completed: true, category: 'Komunikacja' },
      { id: 'c4', label: 'Lista ujęć filmowych od pary', completed: false, category: 'Przygotowanie' },
      { id: 'c5', label: 'Rezerwacja operatora drona', completed: false, category: 'Zespół' },
      { id: 'c6', label: 'Potwierdzenie shooting schedule', completed: false, category: 'Timeline' },
    ],
    schedule: [
      { id: 's1', time: '10:30', title: 'Look-up miejsc pod b-roll', location: 'Mazury' },
      { id: 's2', time: '12:00', title: 'Ceremonia plenerowa', location: 'Altana nad jeziorem' },
      { id: 's3', time: '14:00', title: 'Sesja portretowa', location: 'Pomost nad jeziorem' },
      { id: 's4', time: '17:00', title: 'Reportaż weselny', location: 'Dworek' },
      { id: 's5', time: '21:30', title: 'Ujęcia nocne i zakończenie', location: 'Plaża przy dworku' },
    ],
    finances: [
      { id: 'f3', label: 'Operator drona', amount: 1800, type: 'expense', paid: false, dueDate: '2026-09-01' },
    ],
    payments: [
      {
        id: 'p1',
        label: 'Zaliczka',
        amount: 10000,
        type: 'deposit',
        paid: true,
        paidAt: '2026-04-20',
      },
      {
        id: 'p2',
        label: 'Druga transza',
        amount: 12000,
        type: 'installment',
        paid: false,
        dueDate: '2026-08-15',
      },
    ],
    questionnaires: {
      contractData: { status: 'completed', sentAt: '2026-04-15', completedAt: '2026-04-16' },
      weddingQuestionnaire: { status: 'sent', sentAt: '2026-05-01' },
    },
    contract: {
      status: 'signed',
      generatedAt: '2026-04-17',
      sentAt: '2026-04-17',
      signedAt: '2026-04-18',
    },
    notes: [
      {
        id: 'n1',
        content: 'Para chce film w formie dokumentalnej bez inscenizowanych scen.',
        createdAt: '2026-04-15',
        author: 'Karolina',
      },
    ],
    deliverables: appendAdditionalDeliverable(
      packageDeliverablesForWedding('w2', 'Film Documentary'),
      'w2',
      'Dron',
    ),
    timeline: getWeddingTimeline('w2'),
  },
  {
    id: 'w3',
    couple: {
      partner1: 'Zuzanna',
      partner2: 'Jakub',
      email: 'zuzia.jakub@email.pl',
      phone: '+48 602 345 678',
      venue: 'Hotel Grand Kraków',
      city: 'Kraków',
    },
    date: '2027-01-10',
    workflowStage: 'reservation',
    packageName: 'Premium Full Day',
    price: 58000,
    ceremonyLocation: 'Sala kryształowa, Hotel Grand Kraków',
    receptionLocation: 'Sala balowa, Hotel Grand Kraków',
    accentColor: '#5c7cbf',
    createdAt: '2026-06-20',
    checklist: [
      { id: 'c1', label: 'Podpisanie umowy', completed: false, category: 'Formalności' },
      { id: 'c2', label: 'Wpłata zaliczki', completed: false, category: 'Płatności' },
      { id: 'c3', label: 'Wysłanie ankiety kontraktowej', completed: true, category: 'Komunikacja' },
      { id: 'c4', label: 'Wybór pakietu dostawy (teaser + galeria)', completed: false, category: 'Dostawa' },
      { id: 'c5', label: 'Ustalenie terminu spotkania online', completed: false, category: 'Komunikacja' },
    ],
    schedule: [
      { id: 's1', time: '14:30', title: 'Portrety pary', location: 'Lobby hotelowe' },
      { id: 's2', time: '16:00', title: 'Reportaż przyjęcia', location: 'Sala balowa' },
      { id: 's3', time: '20:00', title: 'Ujęcia after-dark', location: 'Taras hotelu' },
    ],
    finances: [
      { id: 'f2', label: 'Rezerwacja terminu second shootera', amount: 2200, type: 'expense', paid: false, dueDate: '2026-11-01' },
    ],
    payments: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: {
      status: 'none',
    },
    notes: [
      {
        id: 'n1',
        content: 'Para chce elegancki film z naciskiem na emocje podczas przysięgi.',
        createdAt: '2026-06-20',
        author: 'Karolina',
      },
      {
        id: 'n2',
        content: 'Do potwierdzenia: czy potrzebny dodatkowy operator audio.',
        createdAt: '2026-07-01',
        author: 'Karolina',
      },
    ],
    deliverables: packageDeliverablesForWedding('w3', 'Premium Full Day'),
    timeline: getWeddingTimeline('w3'),
  },
]
