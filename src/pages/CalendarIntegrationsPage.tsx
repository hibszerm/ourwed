import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { calendarIntegrationsService } from '@/features/calendar-integrations/calendarIntegrationsService'
import { calendarIntegrationQueryKeys } from '@/features/calendar-integrations/queryKeys'
import type {
  AppleIntegrationView,
  CalendarBackfillMode,
} from '@/features/calendar-integrations/types'
import styles from './CalendarIntegrationsPage.module.css'

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

export function CalendarIntegrationsPage() {
  const userId = useStudioAuthId()
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
      showToast(err.message || 'Nie udało się rozpocząć OAuth', 'error')
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
    onError: (err: Error) => showToast(err.message, 'error'),
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
    onError: (err: Error) => showToast(err.message, 'error'),
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
    onError: (err: Error) => showToast(err.message, 'error'),
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
    onError: (err: Error) => showToast(err.message, 'error'),
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
    onError: (err: Error) => showToast(err.message, 'error'),
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
    onError: (err: Error) => showToast(err.message, 'error'),
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
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const updateAppleMutation = useMutation({
    mutationFn: calendarIntegrationsService.updateAppleSettings,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: calendarIntegrationQueryKeys.settings(userId),
      })
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const refreshAppleMutation = useMutation({
    mutationFn: () => calendarIntegrationsService.refreshAppleFeedMeta(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: calendarIntegrationQueryKeys.settings(userId),
      })
      showToast(
        'Zaktualizowano dane feedu. Apple Calendar odświeży subskrypcję według własnego harmonogramu.',
        'info',
      )
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const google = settingsQuery.data?.google
  const apple = settingsQuery.data?.apple
  const revealedUrl =
    appleReveal?.subscriptionUrl ?? apple?.subscriptionUrl ?? null

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
    if (provider === 'google') {
      updateGoogleMutation.mutate({ [field]: next })
    } else {
      updateAppleMutation.mutate({ [field]: next })
    }
  }

  return (
    <AppLayout
      title="Integracje"
      subtitle="Kalendarze zewnętrzne"
    >
      <PageContainer width="wide">
        <div className={styles.page}>
          <p className={styles.back}>
            <Link to="/ustawienia" className={styles.backLink}>
              ← Ustawienia
            </Link>
          </p>

          <header className={styles.header}>
            <div>
              <h2 className={styles.title}>Kalendarze</h2>
              <p className={styles.lead}>
                OurWed jest źródłem prawdy. Synchronizacja działa w jedną
                stronę: OurWed → Google Calendar oraz OurWed → Apple Calendar
                (subskrypcja ICS). Zmiany wprowadzone bezpośrednio w Google nie
                aktualizują zleceń w OurWed.
              </p>
            </div>
          </header>

          {settingsQuery.isError ? (
            <p className={styles.warning} role="alert">
              Nie udało się wczytać ustawień integracji. Odśwież stronę.
            </p>
          ) : null}

          <div className={styles.cards}>
            <Card padding="lg" className={styles.card}>
              <CardHeader
                title="Google Calendar"
                subtitle={
                  google?.connected
                    ? google.needsReconnect
                      ? 'Wymaga ponownego połączenia'
                      : 'Połączono'
                    : 'Niepołączony'
                }
              />

              {!google?.connected ? (
                <>
                  <p className={styles.body}>
                    Automatycznie dodawaj śluby i sesje z OurWed do wybranego
                    kalendarza Google.
                  </p>
                  <div className={styles.field}>
                    <span className={styles.label}>Pierwsza synchronizacja</span>
                    <div className={styles.radioGroup} role="radiogroup">
                      <label className={styles.check}>
                        <input
                          type="radio"
                          name="google-backfill"
                          checked={backfillDraft === 'future'}
                          onChange={() => setBackfillDraft('future')}
                        />
                        Tylko przyszłe zlecenia
                      </label>
                      <label className={styles.check}>
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
                      onClick={() => {
                        window.localStorage.setItem(
                          'ourwed:calendar-backfill-pending',
                          backfillDraft,
                        )
                        connectMutation.mutate(backfillDraft)
                      }}
                    >
                      {connectMutation.isPending
                        ? 'Łączenie…'
                        : 'Połącz z Google Calendar'}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <dl className={styles.meta}>
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
                      Połączenie z Google Calendar wygasło. Połącz konto
                      ponownie.
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
                      Kalendarz docelowy
                    </label>
                    <select
                      id="google-calendar"
                      className={styles.select}
                      value={google.calendarId ?? ''}
                      disabled={updateGoogleMutation.isPending}
                      onChange={(e) => {
                        const id = e.target.value
                        const cal = calendarsQuery.data?.find((c) => c.id === id)
                        updateGoogleMutation.mutate({
                          calendarId: id,
                          calendarName: cal?.summary ?? null,
                        })
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

                  <fieldset className={styles.fieldset}>
                    <legend>Synchronizuj automatycznie</legend>
                    <label className={styles.check}>
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
                    <label className={styles.check}>
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
                    <span className={styles.label}>Zakres synchronizacji</span>
                    <div className={styles.radioGroup}>
                      <label className={styles.check}>
                        <input
                          type="radio"
                          checked={google.backfillMode === 'future'}
                          onChange={() =>
                            updateGoogleMutation.mutate({
                              backfillMode: 'future',
                            })
                          }
                        />
                        Tylko przyszłe zlecenia
                      </label>
                      <label className={styles.check}>
                        <input
                          type="radio"
                          checked={google.backfillMode === 'all_active'}
                          onChange={() =>
                            updateGoogleMutation.mutate({
                              backfillMode: 'all_active',
                            })
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
                        onClick={() => connectMutation.mutate(backfillDraft)}
                      >
                        Połącz ponownie
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        disabled={syncNowMutation.isPending}
                        onClick={() => syncNowMutation.mutate()}
                      >
                        {syncNowMutation.isPending
                          ? 'Synchronizowanie…'
                          : 'Synchronizuj teraz'}
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      disabled={reconcileMutation.isPending}
                      onClick={() => reconcileMutation.mutate()}
                    >
                      {reconcileMutation.isPending
                        ? 'Czyszczenie…'
                        : 'Usuń duplikaty OurWed'}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => setDisconnectOpen(true)}
                    >
                      Odłącz Google Calendar
                    </Button>
                  </div>
                </>
              )}
            </Card>

            <Card padding="lg" className={styles.card}>
              <CardHeader
                title="Apple Calendar"
                subtitle={apple?.active ? 'Aktywny' : 'Nieaktywny'}
              />

              <p className={styles.body}>
                Dodaj prywatny kalendarz OurWed do aplikacji Kalendarz na
                iPhonie, iPadzie lub Macu. Subskrypcja jest tylko do odczytu —
                bez logowania Apple i bez hasła.
              </p>

              {!apple?.active ? (
                <>
                  <fieldset className={styles.fieldset}>
                    <legend>Synchronizuj</legend>
                    <label className={styles.check}>
                      <input type="checkbox" defaultChecked disabled />
                      Śluby
                    </label>
                    <label className={styles.check}>
                      <input type="checkbox" defaultChecked disabled />
                      Sesje
                    </label>
                  </fieldset>
                  <div className={styles.field}>
                    <span className={styles.label}>Zakres</span>
                    <div className={styles.radioGroup}>
                      <label className={styles.check}>
                        <input
                          type="radio"
                          checked={backfillDraft === 'future'}
                          onChange={() => setBackfillDraft('future')}
                        />
                        Tylko przyszłe zlecenia
                      </label>
                      <label className={styles.check}>
                        <input
                          type="radio"
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
                      onClick={() => activateAppleMutation.mutate()}
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
                    <span className={styles.label}>Prywatny link</span>
                    <code className={styles.urlMask}>
                      {appleReveal?.maskedUrl ||
                        apple.maskedUrl ||
                        'webcal://••••/ourwed.ics'}
                    </code>
                    <p className={styles.hint}>
                      Apple Calendar okresowo odświeża subskrybowane kalendarze.
                      Zmiany mogą pojawić się z opóźnieniem.
                    </p>
                  </div>

                  <fieldset className={styles.fieldset}>
                    <legend>Synchronizuj</legend>
                    <label className={styles.check}>
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
                    <label className={styles.check}>
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
                    <Button variant="secondary" onClick={() => void copyLink()}>
                      Skopiuj link
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={refreshAppleMutation.isPending}
                      onClick={() => refreshAppleMutation.mutate()}
                    >
                      Odśwież dane kalendarza
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setRotateOpen(true)}
                    >
                      Wygeneruj nowy link
                    </Button>
                    <Button
                      variant="danger"
                      disabled={disableAppleMutation.isPending}
                      onClick={() => disableAppleMutation.mutate()}
                    >
                      Wyłącz kalendarz
                    </Button>
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
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
            onClick={() => disconnectMutation.mutate()}
          >
            Odłącz
          </Button>
        }
      >
        <div className={styles.radioGroup}>
          <label className={styles.check}>
            <input
              type="radio"
              checked={removeEvents}
              onChange={() => setRemoveEvents(true)}
            />
            Usuń wydarzenia OurWed z Google i odłącz
          </label>
          <label className={styles.check}>
            <input
              type="radio"
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
            onClick={() => rotateAppleMutation.mutate()}
          >
            Wygeneruj nowy link
          </Button>
        }
      >
        <p className={styles.body}>
          To działanie unieważnia poprzedni prywatny URL. Zlecenia w OurWed
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
              applyCategoryToggle(
                disableCategoryConfirm.provider,
                disableCategoryConfirm.field,
                false,
              )
              setDisableCategoryConfirm(null)
            }}
          >
            Wyłącz
          </Button>
        }
      >
        <p className={styles.body}>
          W Apple Calendar wydarzenia znikną po odświeżeniu subskrypcji.
        </p>
      </Modal>
    </AppLayout>
  )
}
