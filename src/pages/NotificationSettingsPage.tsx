/* eslint-disable react-hooks/set-state-in-effect -- page load + retry mirror AdminEmailsPage */
import { useEffect, useState } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { NOTIFICATION_CATALOG } from '@/lib/notifications/catalog'
import {
  notificationPreferencesService,
  type EmailPreferenceMap,
} from '@/lib/api/notificationPreferencesService'
import styles from './NotificationSettingsPage.module.css'
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
        getUserFacingErrorMessage(err, 'Nie udało się wczytać preferencji powiadomień.'),
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

  return (
    <AppLayout
      title="Powiadomienia"
      subtitle="Wybierz, o czym OurWed ma informować Cię e-mailem."
    >
      <PageContainer width="narrow">
        {loading ? (
          <p className={styles.muted}>Ładowanie…</p>
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
          <div className={styles.page} data-testid="notification-settings-page">
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}

            <section className={styles.section} aria-labelledby="notif-ankiety">
              <h2 id="notif-ankiety" className={styles.sectionTitle}>
                Ankiety
              </h2>
              <ul className={styles.list}>
                {NOTIFICATION_CATALOG.map((entry) => {
                  const enabled = prefs[entry.eventType]
                  const id = `email-${entry.eventType}`
                  return (
                    <li key={entry.eventType} className={styles.row}>
                      <div className={styles.copy}>
                        <p className={styles.label}>{entry.label}</p>
                        <p className={styles.desc}>{entry.description}</p>
                        {savedKey === entry.eventType ? (
                          <p className={styles.saved} role="status">
                            Zapisano
                          </p>
                        ) : null}
                      </div>
                      <label className={styles.toggleWrap} htmlFor={id}>
                        <span className={styles.channel}>E-mail</span>
                        <input
                          id={id}
                          type="checkbox"
                          className={styles.toggle}
                          role="switch"
                          aria-checked={enabled}
                          checked={enabled}
                          disabled={busyKey === entry.eventType}
                          onChange={(e) =>
                            void onToggle(entry.eventType, e.target.checked)
                          }
                          data-testid={`pref-email-${entry.eventType}`}
                        />
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>

            <p className={styles.footnote}>
              Powiadomienia w aplikacji pozostają włączone dla tych zdarzeń.
            </p>
          </div>
        ) : null}
      </PageContainer>
    </AppLayout>
  )
}
