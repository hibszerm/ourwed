import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SettingsLayout } from '@/features/settings/SettingsLayout'
import {
  SettingsAlert,
  SettingsMuted,
  SettingsWorkspace,
} from '@/features/settings/SettingsWorkspace'
import { PageContainer } from '@/components/ui/PageContainer'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { calendarIntegrationsService } from '@/features/calendar-integrations/calendarIntegrationsService'
import { calendarIntegrationQueryKeys } from '@/features/calendar-integrations/queryKeys'
import type {
  AppleIntegrationView,
  CalendarBackfillMode,
} from '@/features/calendar-integrations/types'
import styles from './CalendarIntegrationsPage.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pl-PL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function googleStatusLabel(google: {
  connected: boolean
  needsReconnect: boolean
}): { text: string; state: 'connected' | 'idle' | 'warning' } {
  if (!google.connected) return { text: 'Niepołączono', state: 'idle' }
  if (google.needsReconnect) {
    return { text: 'Wymaga ponownego połączenia', state: 'warning' }
  }
  return { text: 'Połączono', state: 'connected' }
}

export function CalendarIntegrationsPage() {
  const userId = useStudioAuthId()
  const { requirePro } = useProAccessGate()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [appleReveal, setAppleReveal] = useState<AppleIntegrationView | null>(
    null,
  )
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [removeEvents, setRemoveEvents] = useState(true)
  const [rotateOpen, setRotateOpen] = useState(false)
  const [disableCategoryConfirm, setDisableCategoryConfirm] = useState<{
    provider: 'google' | 'apple'
    field: 'syncWeddings' | 'syncSessions'
  } | null>(null)
  const [backfillDraft, setBackfillDraft] =
    useState<CalendarBackfillMode>('future')

  const settingsQuery = useQuery({
    queryKey: calendarIntegrationQueryKeys.settings(userId),
    queryFn: () => calendarIntegrationsService.getSnapshot(),
    enabled: Boolean(userId),
  })

  const calendarsQuery = useQuery({
    queryKey: calendarIntegrationQueryKeys.googleCalendars(userId),
    queryFn: () => calendarIntegrationsService.listWritableGoogleCalendars(),
    enabled: Boolean(userId) && Boolean(settingsQuery.data?.google.connected),
  })

  useEffect(() => {
    const google = searchParams.get('google')
    if (!google) return

    // Consume the query param once so StrictMode / reloads cannot re-trigger.
    const next = new URLSearchParams(searchParams)
    next.delete('google')
    setSearchParams(next, { replace: true })

    if (google === 'connected') {
      showToast('Połączono z Google Calendar', 'success')
      window.localStorage.removeItem('ourwed:calendar-backfill-pending')
      // Initial backfill is enqueued exclusively by the OAuth callback.
      // Do not call updateGoogleSettings / sync_now here — that caused duplicates.
      void queryClient.invalidateQueries({
        queryKey: calendarIntegrationQueryKeys.all,
      })
    } else if (google === 'error' || google === 'token_failed') {
      showToast('Nie udało się połączyć z Google Calendar', 'error')
    } else if (google === 'not_configured') {
      showToast(
        'Google Calendar nie jest skonfigurowane w systemie. Brakuje sekretu GOOGLE_CALENDAR_CLIENT_SECRET (sprawdź pisownię).',
        'error',
      )
    } else {
      showToast('Połączenie z Google nie powiodło się', 'error')
    }
  }, [searchParams, setSearchParams, showToast, queryClient])

  const connectMutation = useMutation({
    mutationFn: (backfillMode: CalendarBackfillMode = 'future') =>
      calendarIntegrationsService.startGoogleOAuth(
        '/ustawienia/integracje',
        backfillMode,
      ),
    onSuccess: ({ url }) => {
      window.location.assign(url)
    },
    onError: (err: Error) => {
      showToast(getUserFacingErrorMessage(err, 'Nie udało się połączyć z Google Calendar.'), 'error')
    },
  })

  const syncNowMutation = useMutation({
    mutationFn: () => calendarIntegrationsService.syncGoogleNow(),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: calendarIntegrationQueryKeys.settings(userId),
      })
      showToast(
        `Zsynchronizowano ${result.synced} wydarzeń. ${result.updated} wymagało aktualizacji. ${result.failed} nie zostało zsynchronizowanych.`,
        result.failed > 0 ? 'info' : 'success',
      )
    },
    onError: (err: Error) => showToast(getUserFacingErrorMessage(err, 'Nie udało się zsynchronizować kalendarza.'), 'error'),
  })

  const reconcileMutation = useMutation({
    mutationFn: () => calendarIntegrationsService.reconcileGoogleDuplicates(),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: calendarIntegrationQueryKeys.all,
      })
      showToast(
        `Usunięto ${data.summary.duplicatesDeleted} duplikatów OurWed. Zachowano ${data.summary.kept} wydarzeń.`,
        'success',
      )
    },
    onError: (err: Error) => showToast(getUserFacingErrorMessage(err, 'Nie udało się uporządkować wydarzeń kalendarza.'), 'error'),
  })

  const disconnectMutation = useMutation({
    mutationFn: () =>
      calendarIntegrationsService.disconnectGoogle({ removeEvents }),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(
        calendarIntegrationQueryKeys.settings(userId),
        snapshot,
      )
      void queryClient.invalidateQueries({
        queryKey: calendarIntegrationQueryKeys.googleCalendars(userId),
      })
      setDisconnectOpen(false)
      showToast('Odłączono Google Calendar', 'success')
    },
    onError: (err: Error) => showToast(getUserFacingErrorMessage(err, 'Nie udało się odłączyć kalendarza.'), 'error'),
  })

  const updateGoogleMutation = useMutation({
    mutationFn: calendarIntegrationsService.updateGoogleSettings,
    onSuccess: (snapshot) => {
      queryClient.setQueryData(
        calendarIntegrationQueryKeys.settings(userId),
        snapshot,
      )
      void queryClient.invalidateQueries({
        queryKey: calendarIntegrationQueryKeys.googleCalendars(userId),
      })
    },
    onError: (err: Error) => showToast(getUserFacingErrorMessage(err, 'Nie udało się zapisać ustawień Google Calendar.'), 'error'),
  })

  const activateAppleMutation = useMutation({
    mutationFn: () =>
      calendarIntegrationsService.activateApple({
        syncWeddings: true,
        syncSessions: true,
        backfillMode: backfillDraft,
      }),
    onSuccess: (apple) => {
      setAppleReveal(apple)
      void queryClient.invalidateQueries({
        queryKey: calendarIntegrationQueryKeys.settings(userId),
      })
      showToast('Aktywowano kalendarz Apple', 'success')
    },
    onError: (err: Error) => showToast(getUserFacingErrorMessage(err, 'Nie udało się aktywować Apple Calendar.'), 'error'),
  })

  const rotateAppleMutation = useMutation({
    mutationFn: () => calendarIntegrationsService.rotateAppleToken(),
    onSuccess: (apple) => {
      setAppleReveal(apple)
      setRotateOpen(false)
      void queryClient.invalidateQueries({
        queryKey: calendarIntegrationQueryKeys.settings(userId),
      })
      showToast('Wygenerowano nowy link subskrypcji', 'success')
    },
    onError: (err: Error) => showToast(getUserFacingErrorMessage(err, 'Nie udało się odświeżyć powiązania Apple Calendar.'), 'error'),
  })

  const disableAppleMutation = useMutation({
    mutationFn: () => calendarIntegrationsService.disableApple(),
    onSuccess: () => {
      setAppleReveal(null)
      void queryClient.invalidateQueries({
        queryKey: calendarIntegrationQueryKeys.settings(userId),
      })
      showToast('Wyłączono kalendarz Apple', 'success')
    },
    onError: (err: Error) => showToast(getUserFacingErrorMessage(err, 'Nie udało się wyłączyć Apple Calendar.'), 'error'),
  })

  const updateAppleMutation = useMutation({
    mutationFn: calendarIntegrationsService.updateAppleSettings,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: calendarIntegrationQueryKeys.settings(userId),
      })
    },
    onError: (err: Error) => showToast(getUserFacingErrorMessage(err, 'Nie udało się zapisać ustawień Apple Calendar.'), 'error'),
  })

  const refreshAppleMutation = useMutation({
    mutationFn: () => calendarIntegrationsService.refreshAppleFeedMeta(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: calendarIntegrationQueryKeys.settings(userId),
      })
      showToast(
        'Kalendarz został odświeżony. Apple Calendar zaktualizuje wpisy według własnego harmonogramu.',
        'info',
      )
    },
    onError: (err: Error) => showToast(getUserFacingErrorMessage(err, 'Nie udało się odświeżyć Apple Calendar.'), 'error'),
  })

  const google = settingsQuery.data?.google
  const apple = settingsQuery.data?.apple
  const revealedUrl =
    appleReveal?.subscriptionUrl ?? apple?.subscriptionUrl ?? null
  const googleStatus = google
    ? googleStatusLabel(google)
    : { text: 'Niepołączono', state: 'idle' as const }

  async function copyLink() {
    if (!revealedUrl) {
      showToast(
        'Link jest widoczny tylko zaraz po aktywacji lub rotacji. Wygeneruj nowy link.',
        'info',
      )
      return
    }
    try {
      await navigator.clipboard.writeText(revealedUrl)
      showToast('Skopiowano link subskrypcji', 'success')
    } catch {
      showToast('Nie udało się skopiować linku', 'error')
    }
  }

  function requestCategoryToggle(
    provider: 'google' | 'apple',
    field: 'syncWeddings' | 'syncSessions',
    next: boolean,
  ) {
    if (!requirePro()) return
    if (!next) {
      setDisableCategoryConfirm({ provider, field })
      return
    }
    applyCategoryToggle(provider, field, true)
  }

  function applyCategoryToggle(
    provider: 'google' | 'apple',
    field: 'syncWeddings' | 'syncSessions',
    next: boolean,
  ) {
    if (!requirePro()) return
    if (provider === 'google') {
      updateGoogleMutation.mutate({ [field]: next })
    } else {
      updateAppleMutation.mutate({ [field]: next })
    }
  }

  return (
    <SettingsLayout
      title="Integracje"
      subtitle="Połącz OurWed z narzędziami, których używasz na co dzień."
    >
      <PageContainer width="full">
        <SettingsWorkspace testId="calendar-integrations">
          {settingsQuery.isError ? (
            <SettingsAlert>
              Nie udało się wczytać ustawień integracji. Odśwież stronę.
            </SettingsAlert>
          ) : null}

          {settingsQuery.isPending ? (
            <SettingsMuted>Ładowanie…</SettingsMuted>
          ) : null}

          {!settingsQuery.isPending ? (
            <>
          <article className={styles.module} data-testid="integration-google">
            <header className={styles.head}>
              <div className={styles.identity}>
                <span className={`${styles.mark} ${styles.markGoogle}`} aria-hidden>
                  G
                </span>
                <div className={styles.copy}>
                  <h2 className={styles.name}>Google Calendar</h2>
                  <p className={styles.lead}>
                    Automatycznie dodawaj śluby i sesje z OurWed do swojego
                    kalendarza Google.
                  </p>
                </div>
              </div>
              <p
                className={styles.status}
                data-state={googleStatus.state}
                aria-live="polite"
              >
                {googleStatus.text}
              </p>
            </header>

            {!google?.connected ? (
              <>
                <div className={styles.field}>
                  <span className={styles.label} id="google-backfill-label">
                    Pierwsza synchronizacja
                  </span>
                  <div
                    className={styles.choices}
                    role="radiogroup"
                    aria-labelledby="google-backfill-label"
                  >
                    <label className={styles.choice}>
                      <input
                        type="radio"
                        name="google-backfill"
                        checked={backfillDraft === 'future'}
                        onChange={() => setBackfillDraft('future')}
                      />
                      Tylko przyszłe zlecenia
                    </label>
                    <label className={styles.choice}>
                      <input
                        type="radio"
                        name="google-backfill"
                        checked={backfillDraft === 'all_active'}
                        onChange={() => setBackfillDraft('all_active')}
                      />
                      Wszystkie aktywne zlecenia
                    </label>
                  </div>
                </div>
                <div className={styles.actions}>
                  <Button
                    variant="primary"
                    disabled={connectMutation.isPending}
                    onClick={() =>
                      requirePro(() => {
                        window.localStorage.setItem(
                          'ourwed:calendar-backfill-pending',
                          backfillDraft,
                        )
                        connectMutation.mutate(backfillDraft)
                      })
                    }
                  >
                    {connectMutation.isPending
                      ? 'Łączenie…'
                      : 'Połącz z Google Calendar'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <dl className={styles.facts}>
                  <div>
                    <dt>Konto</dt>
                    <dd>{google.accountEmail || '—'}</dd>
                  </div>
                  <div>
                    <dt>Ostatnia synchronizacja</dt>
                    <dd>{formatWhen(google.lastSyncAt)}</dd>
                  </div>
                  {google.lastErrorMessage ? (
                    <div className={styles.errorBlock}>
                      <dt>Ostatni błąd</dt>
                      <dd>{google.lastErrorMessage}</dd>
                    </div>
                  ) : null}
                </dl>

                {google.needsReconnect ? (
                  <p className={styles.warning} role="status">
                    Połączenie z Google Calendar wygasło. Połącz konto ponownie.
                  </p>
                ) : null}
                {google.needsCalendarAttention ? (
                  <p className={styles.warning} role="status">
                    Wybrany kalendarz nie jest już dostępny. Wybierz inny
                    kalendarz.
                  </p>
                ) : null}

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="google-calendar">
                    Kalendarz
                  </label>
                  <select
                    id="google-calendar"
                    className={styles.select}
                    value={google.calendarId ?? ''}
                    disabled={updateGoogleMutation.isPending}
                    onChange={(e) => {
                      const id = e.target.value
                      const cal = calendarsQuery.data?.find((c) => c.id === id)
                      requirePro(() =>
                        updateGoogleMutation.mutate({
                          calendarId: id,
                          calendarName: cal?.summary ?? null,
                        }),
                      )
                    }}
                  >
                    {calendarsQuery.data?.length ? (
                      calendarsQuery.data.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.summary}
                          {c.primary ? ' (główny)' : ''}
                        </option>
                      ))
                    ) : (
                      <option value={google.calendarId ?? ''}>
                        {google.calendarName || google.calendarId || '—'}
                      </option>
                    )}
                  </select>
                </div>

                <fieldset className={styles.toggles}>
                  <legend>Dodawaj do kalendarza</legend>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={google.syncWeddings}
                      onChange={(e) =>
                        requestCategoryToggle(
                          'google',
                          'syncWeddings',
                          e.target.checked,
                        )
                      }
                    />
                    Śluby
                  </label>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={google.syncSessions}
                      onChange={(e) =>
                        requestCategoryToggle(
                          'google',
                          'syncSessions',
                          e.target.checked,
                        )
                      }
                    />
                    Sesje
                  </label>
                </fieldset>

                <div className={styles.field}>
                  <span className={styles.label} id="google-scope-label">
                    Zakres synchronizacji
                  </span>
                  <div
                    className={styles.choices}
                    role="radiogroup"
                    aria-labelledby="google-scope-label"
                  >
                    <label className={styles.choice}>
                      <input
                        type="radio"
                        name="google-backfill-connected"
                        checked={google.backfillMode === 'future'}
                        onChange={() =>
                          requirePro(() =>
                            updateGoogleMutation.mutate({
                              backfillMode: 'future',
                            }),
                          )
                        }
                      />
                      Tylko przyszłe zlecenia
                    </label>
                    <label className={styles.choice}>
                      <input
                        type="radio"
                        name="google-backfill-connected"
                        checked={google.backfillMode === 'all_active'}
                        onChange={() =>
                          requirePro(() =>
                            updateGoogleMutation.mutate({
                              backfillMode: 'all_active',
                            }),
                          )
                        }
                      />
                      Wszystkie aktywne zlecenia
                    </label>
                  </div>
                </div>

                <div className={styles.actions}>
                  {google.needsReconnect ? (
                    <Button
                      variant="primary"
                      disabled={connectMutation.isPending}
                      onClick={() =>
                        requirePro(() =>
                          connectMutation.mutate(backfillDraft),
                        )
                      }
                    >
                      Połącz ponownie
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={syncNowMutation.isPending}
                      onClick={() =>
                        requirePro(() => syncNowMutation.mutate())
                      }
                    >
                      {syncNowMutation.isPending
                        ? 'Synchronizowanie…'
                        : 'Synchronizuj teraz'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    disabled={reconcileMutation.isPending}
                    onClick={() =>
                      requirePro(() => reconcileMutation.mutate())
                    }
                  >
                    {reconcileMutation.isPending
                      ? 'Czyszczenie…'
                      : 'Usuń duplikaty OurWed'}
                  </Button>
                </div>
                <div className={styles.secondaryActions}>
                  <Button
                    variant="ghost"
                    className={styles.dangerText}
                    onClick={() => requirePro(() => setDisconnectOpen(true))}
                  >
                    Odłącz Google Calendar
                  </Button>
                </div>
              </>
            )}
          </article>

          <article className={styles.module} data-testid="integration-apple">
            <header className={styles.head}>
              <div className={styles.identity}>
                <span className={`${styles.mark} ${styles.markApple}`} aria-hidden>
                  A
                </span>
                <div className={styles.copy}>
                  <h2 className={styles.name}>Apple Calendar</h2>
                  <p className={styles.lead}>
                    Subskrybuj prywatny kalendarz OurWed w aplikacji Kalendarz
                    na iPhone, iPadzie lub Macu.
                  </p>
                </div>
              </div>
              <p
                className={styles.status}
                data-state={apple?.active ? 'active' : 'idle'}
                aria-live="polite"
              >
                {apple?.active ? 'Aktywny' : 'Nieaktywny'}
              </p>
            </header>

            {!apple?.active ? (
              <>
                <ul className={styles.contents}>
                  <li>Śluby</li>
                  <li>Sesje</li>
                </ul>
                <div className={styles.field}>
                  <span className={styles.label} id="apple-backfill-label">
                    Pierwsza synchronizacja
                  </span>
                  <div
                    className={styles.choices}
                    role="radiogroup"
                    aria-labelledby="apple-backfill-label"
                  >
                    <label className={styles.choice}>
                      <input
                        type="radio"
                        name="apple-backfill"
                        checked={backfillDraft === 'future'}
                        onChange={() => setBackfillDraft('future')}
                      />
                      Tylko przyszłe zlecenia
                    </label>
                    <label className={styles.choice}>
                      <input
                        type="radio"
                        name="apple-backfill"
                        checked={backfillDraft === 'all_active'}
                        onChange={() => setBackfillDraft('all_active')}
                      />
                      Wszystkie aktywne zlecenia
                    </label>
                  </div>
                </div>
                <div className={styles.actions}>
                  <Button
                    variant="primary"
                    disabled={activateAppleMutation.isPending}
                    onClick={() =>
                      requirePro(() => activateAppleMutation.mutate())
                    }
                  >
                    {activateAppleMutation.isPending
                      ? 'Aktywowanie…'
                      : 'Aktywuj kalendarz Apple'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className={styles.field}>
                  <span className={styles.label}>Prywatny link kalendarza</span>
                  <code className={styles.urlMask}>
                    {appleReveal?.maskedUrl ||
                      apple.maskedUrl ||
                      '••••/kalendarz'}
                  </code>
                  <p className={styles.hint}>
                    Kalendarz odświeża się sam w tle. Zmiany z OurWed mogą
                    pojawić się z krótkim opóźnieniem.
                  </p>
                </div>

                <fieldset className={styles.toggles}>
                  <legend>Pokazuj w kalendarzu</legend>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={apple.syncWeddings}
                      onChange={(e) =>
                        requestCategoryToggle(
                          'apple',
                          'syncWeddings',
                          e.target.checked,
                        )
                      }
                    />
                    Śluby
                  </label>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={apple.syncSessions}
                      onChange={(e) =>
                        requestCategoryToggle(
                          'apple',
                          'syncSessions',
                          e.target.checked,
                        )
                      }
                    />
                    Sesje
                  </label>
                </fieldset>

                <div className={styles.actions}>
                  {revealedUrl ? (
                    <Button
                      variant="primary"
                      onClick={() => {
                        window.location.href = revealedUrl
                      }}
                    >
                      Otwórz w Apple Calendar
                    </Button>
                  ) : null}
                  <Button
                    variant={revealedUrl ? 'secondary' : 'primary'}
                    onClick={() => void copyLink()}
                  >
                    Skopiuj link
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={refreshAppleMutation.isPending}
                    onClick={() =>
                      requirePro(() => refreshAppleMutation.mutate())
                    }
                  >
                    Odśwież dane kalendarza
                  </Button>
                </div>
                <div className={styles.secondaryActions}>
                  <Button
                    variant="ghost"
                    onClick={() => requirePro(() => setRotateOpen(true))}
                  >
                    Wygeneruj nowy link
                  </Button>
                  <Button
                    variant="ghost"
                    className={styles.dangerText}
                    disabled={disableAppleMutation.isPending}
                    onClick={() =>
                      requirePro(() => disableAppleMutation.mutate())
                    }
                  >
                    Wyłącz kalendarz
                  </Button>
                </div>
              </>
            )}
          </article>
            </>
          ) : null}
        </SettingsWorkspace>
      </PageContainer>

      <Modal
        open={disconnectOpen}
        title="Odłącz Google Calendar"
        description="Wybierz, co zrobić z wydarzeniami utworzonymi przez OurWed."
        onClose={() => setDisconnectOpen(false)}
        busy={disconnectMutation.isPending}
        primaryAction={
          <Button
            variant="danger"
            disabled={disconnectMutation.isPending}
            onClick={() =>
              requirePro(() => disconnectMutation.mutate())
            }
          >
            Odłącz
          </Button>
        }
      >
        <div className={styles.choices} role="radiogroup">
          <label className={styles.choice}>
            <input
              type="radio"
              name="google-disconnect"
              checked={removeEvents}
              onChange={() => setRemoveEvents(true)}
            />
            Usuń wydarzenia OurWed z Google i odłącz
          </label>
          <label className={styles.choice}>
            <input
              type="radio"
              name="google-disconnect"
              checked={!removeEvents}
              onChange={() => setRemoveEvents(false)}
            />
            Zostaw wydarzenia w Google i odłącz
          </label>
        </div>
      </Modal>

      <Modal
        open={rotateOpen}
        title="Wygeneruj nowy link"
        description="Po wygenerowaniu nowego linku poprzednia subskrypcja przestanie się aktualizować. Dodaj nowy link ponownie w Apple Calendar."
        onClose={() => setRotateOpen(false)}
        busy={rotateAppleMutation.isPending}
        primaryAction={
          <Button
            variant="primary"
            disabled={rotateAppleMutation.isPending}
            onClick={() =>
              requirePro(() => rotateAppleMutation.mutate())
            }
          >
            Wygeneruj nowy link
          </Button>
        }
      >
        <p className={styles.body}>
          To działanie unieważnia poprzedni prywatny link. Zlecenia w OurWed
          pozostają bez zmian.
        </p>
      </Modal>

      <Modal
        open={Boolean(disableCategoryConfirm)}
        title="Wyłącz synchronizację kategorii"
        description="Wyłączenie synchronizacji usunie wydarzenia tej kategorii utworzone przez OurWed z Google Calendar. Zlecenia pozostaną w OurWed."
        onClose={() => setDisableCategoryConfirm(null)}
        primaryAction={
          <Button
            variant="danger"
            onClick={() => {
              if (!disableCategoryConfirm) return
              requirePro(() => {
                applyCategoryToggle(
                  disableCategoryConfirm.provider,
                  disableCategoryConfirm.field,
                  false,
                )
                setDisableCategoryConfirm(null)
              })
            }}
          >
            Wyłącz
          </Button>
        }
      >
        <p className={styles.body}>
          W Apple Calendar wydarzenia znikną po odświeżeniu kalendarza.
        </p>
      </Modal>
    </SettingsLayout>
  )
}
