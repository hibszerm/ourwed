import type { Notification } from '@/types/wedding'

let notificationsStore: Notification[] = [
  {
    id: 'n1',
    title: 'Termin oddania teasera',
    message: 'Anna i Michał: teaser powinien być gotowy za 3 dni.',
    createdAt: '2026-07-14',
    read: false,
    type: 'warning',
  },
  {
    id: 'n2',
    title: 'Nowa wiadomość od pary',
    message: 'Katarzyna potwierdziła finalny shooting schedule.',
    createdAt: '2026-07-13',
    read: false,
    type: 'info',
  },
  {
    id: 'n3',
    title: 'Checklista sprzętu zakończona',
    message: 'Wszystkie pozycje sprzętowe dla ślubu Anny i Michała są gotowe.',
    createdAt: '2026-07-12',
    read: true,
    type: 'success',
  },
  {
    id: 'n4',
    title: 'Dostawa galerii',
    message: 'Przygotuj finalny eksport galerii dla poprzedniego zlecenia.',
    createdAt: '2026-07-11',
    read: true,
    type: 'info',
  },
]

export const mockNotifications = notificationsStore

export function getNotifications(): Notification[] {
  return [...notificationsStore]
}

export function addNotification(notification: Notification): void {
  notificationsStore = [notification, ...notificationsStore]
}
