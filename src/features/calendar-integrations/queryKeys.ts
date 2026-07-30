export const calendarIntegrationQueryKeys = {
  all: ['calendar-integrations'] as const,
  settings: (userId: string | null | undefined) =>
    [...calendarIntegrationQueryKeys.all, 'settings', userId ?? 'anon'] as const,
  googleCalendars: (userId: string | null | undefined) =>
    [
      ...calendarIntegrationQueryKeys.all,
      'google-calendars',
      userId ?? 'anon',
    ] as const,
  entityStatus: (
    userId: string | null | undefined,
    entityType: 'wedding' | 'session',
    entityId: string,
  ) =>
    [
      ...calendarIntegrationQueryKeys.all,
      'entity',
      userId ?? 'anon',
      entityType,
      entityId,
    ] as const,
}
