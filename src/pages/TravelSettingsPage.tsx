import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import { IconCheck } from '@/components/icons'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { PlacePicker } from '@/features/travel/PlacePicker'
import {
  EMPTY_TRAVEL_SETTINGS_FORM,
  hasConfirmedTravelOrigin,
  isTravelSettingsFormDirty,
  resolveTravelSettingsSaveUi,
  toTravelSettingsFormState,
  type TravelSettingsFormState,
} from '@/features/travel/travelSettingsFormState'
import { studioTravelSettingsService } from '@/lib/api/studioTravelSettingsService'
import { TravelProviderError } from '@/services/travelProvider'
import catalogStyles from '@/features/studio/StudioCatalog.module.css'
import editStyles from '@/features/weddings/edit/WeddingEdit.module.css'
import styles from './TravelSettingsPage.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

export function TravelSettingsPage() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { requirePro } = useProAccessGate()
  const userId = useStudioAuthId()
  const { data, dataUpdatedAt, isLoading, isError, error } = useQuery({
    queryKey: ['studio-travel-settings', userId],
    queryFn: () => studioTravelSettingsService.get(),
    enabled: Boolean(userId),
  })

  const [form, setForm] = useState<TravelSettingsFormState>(
    EMPTY_TRAVEL_SETTINGS_FORM,
  )
  const [baseline, setBaseline] = useState<TravelSettingsFormState>(
    EMPTY_TRAVEL_SETTINGS_FORM,
  )
  const [hydratedKey, setHydratedKey] = useState<string | null>(null)
  const [syncedUserId, setSyncedUserId] = useState(userId)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Reset when studio identity changes (render-time sync).
  if (userId !== syncedUserId) {
    setSyncedUserId(userId)
    setForm(EMPTY_TRAVEL_SETTINGS_FORM)
    setBaseline(EMPTY_TRAVEL_SETTINGS_FORM)
    setHydratedKey(null)
    setSaveError(null)
  }

  const isDirty = isTravelSettingsFormDirty(form, baseline)
  const hydrateKey =
    userId && dataUpdatedAt ? `${userId}:${dataUpdatedAt}` : null

  // Hydrate / re-sync from server only when clean — avoids wiping edits and
  // avoids false dirty from async population (form + baseline set together).
  if (
    !isLoading &&
    !isError &&
    hydrateKey &&
    hydrateKey !== hydratedKey &&
    !isDirty &&
    !saveError
  ) {
    const next = toTravelSettingsFormState(data)
    setForm(next)
    setBaseline(next)
    setHydratedKey(hydrateKey)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      return studioTravelSettingsService.upsert({
        studioName: form.studioName,
        street: form.street,
        buildingNumber: form.buildingNumber,
        postalCode: form.postalCode,
        city: form.city,
        country: form.country,
        place: form.place,
        geocode: !form.place?.placeId,
        freeDistanceKm: form.freeDistanceKm.trim()
          ? Math.max(0, Number(form.freeDistanceKm.replace(',', '.')) || 0)
          : null,
      })
    },
    onSuccess: async (saved) => {
      const next = toTravelSettingsFormState(saved)
      setForm(next)
      setBaseline(next)
      setSaveError(null)
      queryClient.setQueryData(['studio-travel-settings', userId], saved)
      setHydratedKey(`${userId}:${Date.now()}`)
      await queryClient.invalidateQueries({ queryKey: ['studio-travel-settings'] })
      await queryClient.invalidateQueries({ queryKey: ['travel-plan'] })
      showToast('Zapisano rozliczanie dojazdu.', 'success')
    },
    onError: (err) => {
      setSaveError(
        err instanceof TravelProviderError
          ? getUserFacingErrorMessage(err, 'Nie udało się zapisać ustawień dojazdu.')
          : getUserFacingErrorMessage(err, 'Nie udało się zapisać ustawień.'),
      )
    },
  })

  const saveUi = resolveTravelSettingsSaveUi({
    loaded: !isLoading && !isError && hydratedKey != null,
    isDirty,
    isSaving: saveMutation.isPending,
    hasSaveError: Boolean(saveError),
  })
  const addressConfirmed = hasConfirmedTravelOrigin(form)

  return (
    <AppLayout
      title="Rozliczanie dojazdu"
      subtitle="Punkt startowy i zasady rozliczania dojazdów w projektach"
      action={
        saveUi.state === 'loading' ? null : saveUi.showPrimarySave ? (
          <Button
            type="button"
            variant="primary"
            disabled={saveUi.disabled}
            onClick={() => requirePro(() => void saveMutation.mutateAsync())}
            data-testid="travel-settings-save"
            data-save-state={saveUi.state}
          >
            {saveUi.label}
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            disabled
            className={styles.savedAction}
            data-testid="travel-settings-saved"
            data-save-state={saveUi.state}
            aria-live="polite"
          >
            <IconCheck width={16} height={16} aria-hidden />
            {saveUi.label}
          </Button>
        )
      }
    >
      <PageContainer width="narrow">
        {isLoading ? (
          <p className={catalogStyles.muted}>Ładowanie…</p>
        ) : isError ? (
          <EmptyState
            title="Nie udało się załadować ustawień"
            description={
              getUserFacingErrorMessage(error, 'Spróbuj ponownie.')
            }
          />
        ) : (
          <div className={styles.sections} data-testid="travel-settings-form">
            <Card>
              <CardHeader
                title="Punkt startowy"
                subtitle="Adres firmy używany jako początek trasy: baza → przygotowania → ceremonia → przyjęcie"
              />
              <div className={catalogStyles.stack}>
                <Input
                  label="Nazwa lokalizacji (opcjonalnie)"
                  value={form.studioName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, studioName: e.target.value }))
                  }
                  data-testid="travel-settings-studio-name"
                />
                <div className={editStyles.fieldRow}>
                  <Input
                    label="Ulica"
                    value={form.street}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        street: e.target.value,
                        place: null,
                      }))
                    }
                  />
                  <Input
                    label="Numer"
                    value={form.buildingNumber}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        buildingNumber: e.target.value,
                        place: null,
                      }))
                    }
                  />
                </div>
                <div className={editStyles.fieldRow}>
                  <Input
                    label="Kod pocztowy"
                    value={form.postalCode}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        postalCode: e.target.value,
                        place: null,
                      }))
                    }
                  />
                  <Input
                    label="Miasto"
                    value={form.city}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        city: e.target.value,
                        place: null,
                      }))
                    }
                  />
                </div>
                <Input
                  label="Kraj"
                  value={form.country}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      country: e.target.value,
                      place: null,
                    }))
                  }
                />

                <PlacePicker
                  label="Wyszukaj / potwierdź adres"
                  value={form.formattedAddress}
                  place={form.place}
                  onChangeText={(text) =>
                    setForm((f) => ({
                      ...f,
                      formattedAddress: text,
                      place: null,
                    }))
                  }
                  onSelectPlace={(place) =>
                    setForm((f) => ({
                      ...f,
                      place,
                      formattedAddress:
                        place?.formattedAddress ?? f.formattedAddress,
                    }))
                  }
                />

                {addressConfirmed ? (
                  <p
                    className={styles.confirmHint}
                    data-testid="travel-settings-address-confirmed"
                  >
                    Adres potwierdzony
                  </p>
                ) : null}

                {saveError ? (
                  <p className={editStyles.dangerText} role="alert">
                    {saveError}
                  </p>
                ) : null}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Rozliczanie dojazdu"
                subtitle="Polityka studia — tylko podpowiedź przy ustalaniu kosztu dojazdu dla zlecenia"
              />
              <div className={catalogStyles.stack}>
                <Input
                  label="Dojazd bezpłatny do (km)"
                  type="number"
                  min={0}
                  step="1"
                  value={form.freeDistanceKm}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, freeDistanceKm: e.target.value }))
                  }
                  data-testid="travel-free-distance-km"
                />
                <p className={catalogStyles.muted}>
                  Ustaw dystans, do którego standardowo nie naliczasz dodatkowej
                  opłaty za dojazd. Dla każdego zlecenia możesz ustalić inną
                  kwotę na karcie ślubu.
                </p>
              </div>
            </Card>
          </div>
        )}
      </PageContainer>
    </AppLayout>
  )
}
