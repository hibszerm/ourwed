import type { WeddingTimelineEntry } from '@/types/wedding'

export const mockWeddingTimelines: Record<string, WeddingTimelineEntry[]> = {
  w1: [
    {
      id: 'tl-w1-8',
      title: 'Para uzupełniła ankietę ślubną',
      date: '2026-05-20',
      type: 'questionnaire_completed',
      description: 'Harmonogram dnia i lista ujęć priorytetowych.',
    },
    {
      id: 'tl-w1-7',
      title: 'Wysłano ankietę ślubną',
      date: '2026-04-01',
      type: 'questionnaire_sent',
    },
    {
      id: 'tl-w1-6',
      title: 'Wpłynął zadatek',
      date: '2026-03-15',
      type: 'payment_received',
      description: '15 000 zł — zaliczka.',
    },
    {
      id: 'tl-w1-5',
      title: 'Umowa podpisana',
      date: '2026-03-12',
      type: 'contract_signed',
    },
    {
      id: 'tl-w1-4',
      title: 'Wygenerowano umowę',
      date: '2026-03-11',
      type: 'contract_generated',
    },
    {
      id: 'tl-w1-3',
      title: 'Para uzupełniła dane',
      date: '2026-03-10',
      type: 'questionnaire_completed',
    },
    {
      id: 'tl-w1-2',
      title: 'Wysłano ankietę do umowy',
      date: '2026-03-10',
      type: 'questionnaire_sent',
    },
    {
      id: 'tl-w1-1',
      title: 'Dodano zlecenie',
      date: '2026-03-10',
      type: 'created',
    },
  ],
  w2: [
    {
      id: 'tl-w2-6',
      title: 'Wysłano ankietę ślubną',
      date: '2026-05-01',
      type: 'questionnaire_sent',
    },
    {
      id: 'tl-w2-5',
      title: 'Wpłynął zadatek',
      date: '2026-04-20',
      type: 'payment_received',
      description: '10 000 zł — zaliczka.',
    },
    {
      id: 'tl-w2-4',
      title: 'Umowa podpisana',
      date: '2026-04-18',
      type: 'contract_signed',
    },
    {
      id: 'tl-w2-3',
      title: 'Wygenerowano umowę',
      date: '2026-04-17',
      type: 'contract_generated',
    },
    {
      id: 'tl-w2-2',
      title: 'Para uzupełniła dane',
      date: '2026-04-16',
      type: 'questionnaire_completed',
    },
    {
      id: 'tl-w2-1',
      title: 'Dodano zlecenie',
      date: '2026-04-15',
      type: 'created',
    },
  ],
  w3: [
    {
      id: 'tl-w3-1',
      title: 'Dodano zlecenie',
      date: '2026-06-20',
      type: 'created',
      description: 'Pakiet Premium Full Day.',
    },
  ],
}

export function getWeddingTimeline(weddingId: string): WeddingTimelineEntry[] {
  return mockWeddingTimelines[weddingId] ?? []
}
