import type { Deadline } from '@/types/wedding'

export const mockDeadlines: Deadline[] = [
  {
    id: 'd1',
    weddingId: 'w1',
    title: 'Termin oddania teasera',
    date: '2026-08-18',
    type: 'delivery',
  },
  {
    id: 'd2',
    weddingId: 'w1',
    title: 'Druga transza od pary',
    date: '2026-07-25',
    type: 'payment',
  },
  {
    id: 'd3',
    weddingId: 'w1',
    title: 'Finalne potwierdzenie timeline',
    date: '2026-08-10',
    type: 'meeting',
  },
  {
    id: 'd4',
    weddingId: 'w2',
    title: 'Płatność za operatora drona',
    date: '2026-09-01',
    type: 'payment',
  },
  {
    id: 'd5',
    weddingId: 'w2',
    title: 'Termin oddania filmu highlight',
    date: '2026-10-10',
    type: 'delivery',
  },
  {
    id: 'd6',
    weddingId: 'w3',
    title: 'Zaliczka – pakiet Premium Full Day',
    date: '2026-08-01',
    type: 'payment',
  },
]
