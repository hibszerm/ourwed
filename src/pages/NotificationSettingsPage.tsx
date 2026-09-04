/* eslint-disable react-hooks/set-state-in-effect -- page load + retry mirror AdminEmailsPage */
import { useEffect, useState } from 'react'
import { SettingsLayout } from '@/features/settings/SettingsLayout'
import {
  SettingsAlert,
  SettingsHelper,
  SettingsMuted,
  SettingsPreferenceList,
  SettingsPreferenceRow,
  SettingsSaveStatus,
  SettingsSection,
  SettingsSectionHeader,
  SettingsSwitch,
  SettingsWorkspace,
} from '@/features/settings/SettingsWorkspace'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { NOTIFICATION_CATALOG } from '@/lib/notifications/catalog'
import {
  notificationPreferencesService,
  type EmailPreferenceMap,
} from '@/lib/api/notificationPreferencesService'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

export function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<EmailPreferenceMap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const next = await notificationPreferencesService.getEmailPreferences()
      setPrefs(next)
    } catch (err) {
      setPrefs(null)
      setError(
        getUserFacingErrorMessage(
          err,
          'Nie udało się wczytać preferencji powiadomień.',
        ),
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onToggle(
    eventType: keyof EmailPreferenceMap,
    enabled: boolean,
  ) {
    if (!prefs || busyKey) return
    const previous = prefs[eventType]
    setPrefs({ ...prefs, [eventType]: enabled })
    setBusyKey(eventType)
    setSavedKey(null)
    setError(null)
    try {
      await notificationPreferencesService.setEmailPreference(eventType, enabled)
      setSavedKey(eventType)
    } catch {
      setPrefs({ ...prefs, [eventType]: previous })
      setError('Nie udało się zapisać preferencji. Spróbuj ponownie.')
    } finally {
      setBusyKey(null)
    }
  }

  const headerStatus = busyKey ? (
    <SettingsSaveStatus status="saving">Zapisywanie…</SettingsSaveStatus>
  ) : error && prefs ? (
    <SettingsSaveStatus status="error">{error}</SettingsSaveStatus>
  ) : savedKey ? (
    <SettingsSaveStatus status="saved">Zapisano</SettingsSaveStatus>
  ) : null

  return (
    <SettingsLayout
      title="Preferencje powiadomień"
      subtitle="Wybierz, o czym OurWed ma informować Cię e-mailem."
      action={headerStatus}
    >
      <PageContainer width="full">
        {loading ? (
          <SettingsMuted>Ładowanie…</SettingsMuted>
        ) : error && !prefs ? (
          <EmptyState
            title="Nie udało się wczytać powiadomień"
            description={error}
            action={
              <Button type="button" variant="secondary" onClick={() => void load()}>
                Spróbuj ponownie
              </Button>
            }
          />
        ) : prefs ? (
          <SettingsWorkspace testId="notification-settings-page">
            {error ? <SettingsAlert>{error}</SettingsAlert> : null}

            <SettingsSection labelledBy="notif-email">
              <SettingsSectionHeader
                id="notif-email"
                title="E-mail"
                description="Alerty wysyłane na adres konta, gdy para uzupełni ankietę."
              />
              <SettingsPreferenceList>
                {NOTIFICATION_CATALOG.map((entry) => {
                  const enabled = prefs[entry.eventType]
                  const titleId = `email-title-${entry.eventType}`
                  return (
                    <SettingsPreferenceRow
                      key={entry.eventType}
                      titleId={titleId}
                      title={entry.label}
                      description={entry.description}
                      control={
                        <SettingsSwitch
                          id={`email-${entry.eventType}`}
                          checked={enabled}
                          disabled={busyKey === entry.eventType}
                          labelledBy={titleId}
                          testId={`pref-email-${entry.eventType}`}
                          onCheckedChange={(next) =>
                            void onToggle(entry.eventType, next)
                          }
                        />
                      }
                    />
                  )
                })}
              </SettingsPreferenceList>
            </SettingsSection>

            <SettingsHelper>
              Powiadomienia w aplikacji są zarządzane przez OurWed i nie
              wyłącza się ich w tym miejscu.
            </SettingsHelper>
          </SettingsWorkspace>
        ) : null}
      </PageContainer>
    </SettingsLayout>
  )
}
