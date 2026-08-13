/**
 * Travel settings form helpers — dirty detection + save-state labels.
 * Pure functions for UX acceptance tests (no network).
 */

import type { GeoPlace, StudioTravelSettings } from '@/types/travel'

export interface TravelSettingsFormState {
  studioName: string
  street: string
  buildingNumber: string
  postalCode: string
  city: string
  country: string
  formattedAddress: string
  place: GeoPlace | null
  freeDistanceKm: string
}

export const EMPTY_TRAVEL_SETTINGS_FORM: TravelSettingsFormState = {
  studioName: '',
  street: '',
  buildingNumber: '',
  postalCode: '',
  city: '',
  country: 'Polska',
  formattedAddress: '',
  place: null,
  freeDistanceKm: '',
}

export function toTravelSettingsFormState(
  data: StudioTravelSettings | null | undefined,
): TravelSettingsFormState {
  if (!data) return { ...EMPTY_TRAVEL_SETTINGS_FORM }
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
    freeDistanceKm:
      data.freeDistanceKm != null && Number.isFinite(data.freeDistanceKm)
        ? String(data.freeDistanceKm)
        : '',
  }
}

function norm(value: string): string {
  return value.trim()
}

function placeIdentity(place: GeoPlace | null): string {
  if (!place) return ''
  const lat =
    place.latitude != null && Number.isFinite(place.latitude)
      ? String(place.latitude)
      : ''
  const lng =
    place.longitude != null && Number.isFinite(place.longitude)
      ? String(place.longitude)
      : ''
  return [
    place.placeId ?? '',
    lat,
    lng,
    norm(place.formattedAddress ?? ''),
  ].join('\u0001')
}

/** True when editable fields differ from the last persisted baseline. */
export function isTravelSettingsFormDirty(
  form: TravelSettingsFormState,
  baseline: TravelSettingsFormState,
): boolean {
  return (
    norm(form.studioName) !== norm(baseline.studioName) ||
    norm(form.street) !== norm(baseline.street) ||
    norm(form.buildingNumber) !== norm(baseline.buildingNumber) ||
    norm(form.postalCode) !== norm(baseline.postalCode) ||
    norm(form.city) !== norm(baseline.city) ||
    norm(form.country) !== norm(baseline.country) ||
    norm(form.formattedAddress) !== norm(baseline.formattedAddress) ||
    placeIdentity(form.place) !== placeIdentity(baseline.place) ||
    norm(form.freeDistanceKm) !== norm(baseline.freeDistanceKm)
  )
}

export function hasConfirmedTravelOrigin(
  form: Pick<TravelSettingsFormState, 'place'>,
): boolean {
  return (
    form.place?.latitude != null &&
    form.place.longitude != null &&
    Number.isFinite(form.place.latitude) &&
    Number.isFinite(form.place.longitude)
  )
}

export type TravelSettingsSaveUiState =
  | 'loading'
  | 'saved'
  | 'dirty'
  | 'saving'
  | 'error'

/**
 * Header action label / mode for Travel Settings.
 * - saved: calm non-primary “Zapisano”
 * - dirty / error: primary “Zapisz”
 * - saving: “Zapisywanie…”
 */
export function resolveTravelSettingsSaveUi(input: {
  loaded: boolean
  isDirty: boolean
  isSaving: boolean
  hasSaveError: boolean
}): {
  state: TravelSettingsSaveUiState
  label: string
  showPrimarySave: boolean
  disabled: boolean
} {
  if (!input.loaded) {
    return {
      state: 'loading',
      label: '',
      showPrimarySave: false,
      disabled: true,
    }
  }
  if (input.isSaving) {
    return {
      state: 'saving',
      label: 'Zapisywanie…',
      showPrimarySave: true,
      disabled: true,
    }
  }
  if (input.isDirty || input.hasSaveError) {
    return {
      state: input.hasSaveError && !input.isDirty ? 'error' : 'dirty',
      label: 'Zapisz',
      showPrimarySave: true,
      disabled: false,
    }
  }
  return {
    state: 'saved',
    label: 'Zapisano',
    showPrimarySave: false,
    disabled: true,
  }
}
