/**
 * Shared notification catalog — Settings UI + delivery defaults.
 * Keep in sync with SQL helpers in notification_engine migration.
 */

export const NOTIFICATION_EVENT_TYPES = [
  'questionnaire.contract.completed',
  'questionnaire.prewedding.completed',
] as const

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number]

export type NotificationChannel = 'in_app' | 'email'

export type NotificationCatalogEntry = {
  eventType: NotificationEventType
  category: 'questionnaires'
  categoryLabel: string
  label: string
  description: string
  channels: {
    in_app: { defaultEnabled: boolean; userConfigurable: boolean }
    email: { defaultEnabled: boolean; userConfigurable: boolean }
  }
}

export const NOTIFICATION_CATALOG: NotificationCatalogEntry[] = [
  {
    eventType: 'questionnaire.contract.completed',
    category: 'questionnaires',
    categoryLabel: 'Ankiety',
    label: 'Dane do umowy',
    description:
      'Powiadom mnie, gdy para uzupełni ankietę z danymi do umowy.',
    channels: {
      in_app: { defaultEnabled: true, userConfigurable: false },
      email: { defaultEnabled: true, userConfigurable: true },
    },
  },
  {
    eventType: 'questionnaire.prewedding.completed',
    category: 'questionnaires',
    categoryLabel: 'Ankiety',
    label: 'Ankieta przedślubna',
    description:
      'Powiadom mnie, gdy para uzupełni ankietę przedślubną.',
    channels: {
      in_app: { defaultEnabled: true, userConfigurable: false },
      email: { defaultEnabled: true, userConfigurable: true },
    },
  },
]

export function defaultEmailEnabled(eventType: string): boolean {
  const entry = NOTIFICATION_CATALOG.find((e) => e.eventType === eventType)
  return entry?.channels.email.defaultEnabled ?? false
}
