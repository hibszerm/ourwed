import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import { PlacePicker } from '@/features/travel/PlacePicker'
import { studioTravelSettingsService } from '@/lib/api/studioTravelSettingsService'
import { TravelProviderError } from '@/services/travelProvider'
import type { GeoPlace, StudioTravelSettings } from '@/types/travel'
import catalogStyles from '@/features/studio/StudioCatalog.module.css'
import editStyles from '@/features/weddings/edit/WeddingEdit.module.css'

interface FormState {
  studioName: string
  street: string
  buildingNumber: string
  postalCode: string
  city: string
  country: string
  formattedAddress: string
  place: GeoPlace | null
}

const emptyForm: FormState = {
  studioName: '',
  street: '',
  buildingNumber: '',
  postalCode: '',
  city: '',
  country: 'Polska',
  formattedAddress: '',
  place: null,
}

function toFormState(data: StudioTravelSettings | null | undefined): FormState {
  if (!data) return emptyForm
  return {
    studioName: data.studioName ?? '',
    street: data.street ?? '',
    buildingNumber: data.buildingNumber ?? '',
    postalCode: data.postalCode ?? '',
    city: data.city ?? '',
    country: data.country || 'Polska',
    formattedAddress: data.formattedAddress ?? '',
    place:
      data.placeId || data.latitude != null
        ? {
            placeId: data.placeId,
            formattedAddress: data.formattedAddress ?? '',
            latitude: data.latitude,
            longitude: data.longitude,
            label: data.studioName,
          }
        : null,
  }
}

export function TravelSettingsPage() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { data, dataUpdatedAt, isLoading, isError, error } = useQuery({
    queryKey: ['studio-travel-settings'],
    queryFn: () => studioTravelSettingsService.get(),
  })

  const [form, setForm] = useState<FormState>(emptyForm)
  const [syncedAt, setSyncedAt] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Re-hydrate from server when query data changes (initial load / after save).
  if (dataUpdatedAt !== syncedAt) {
    setSyncedAt(dataUpdatedAt)
    setForm(toFormState(data))
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
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['studio-travel-settings'] })
      await queryClient.invalidateQueries({ queryKey: ['travel-plan'] })
      setSaveError(null)
      showToast('Ustawienia podróży zostały zapisane.', 'success')
    },
    onError: (err) => {
      setSaveError(
        err instanceof TravelProviderError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Nie udało się zapisać ustawień.',
      )
    },
  })

  return (
    <AppLayout
      title="Ustawienia podróży"
      subtitle="Lokalizacja studia — domyślny punkt startowy tras"
      action={
        <Button
          type="button"
          variant="primary"
          disabled={saveMutation.isPending}
          onClick={() => void saveMutation.mutateAsync()}
        >
          {saveMutation.isPending ? 'Zapisywanie…' : 'Zapisz'}
        </Button>
      }
    >
      <PageContainer width="narrow">
        {isLoading ? (
          <p className={catalogStyles.muted}>Ładowanie…</p>
        ) : isError ? (
          <EmptyState
            title="Nie udało się załadować ustawień"
            description={
              error instanceof Error ? error.message : 'Spróbuj ponownie.'
            }
          />
        ) : (
          <Card>
            <CardHeader
              title="Lokalizacja studia"
              subtitle="Używana jako początek trasy: Studio → przygotowania → ceremonia → przyjęcie"
            />
            <div className={catalogStyles.stack}>
              <Input
                label="Nazwa studia (opcjonalnie)"
                value={form.studioName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, studioName: e.target.value }))
                }
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

              {form.place?.latitude != null && form.place.longitude != null ? (
                <p className={catalogStyles.muted}>
                  Współrzędne: {form.place.latitude.toFixed(5)},{' '}
                  {form.place.longitude.toFixed(5)}
                  {form.place.placeId ? ` · place_id zapisany` : ''}
                </p>
              ) : (
                <p className={catalogStyles.muted}>
                  Po zapisie adres zostanie zgeokodowany, jeśli nie wybrano
                  podpowiedzi z listy.
                </p>
              )}

              {saveError ? <p className={editStyles.dangerText}>{saveError}</p> : null}
            </div>
          </Card>
        )}
      </PageContainer>
    </AppLayout>
  )
}
