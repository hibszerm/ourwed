/**
 * Travel Settings UX — dirty/saved state, no technical metadata.
 * Run: npm run test:travel-settings-ux
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  EMPTY_TRAVEL_SETTINGS_FORM,
  hasConfirmedTravelOrigin,
  isTravelSettingsFormDirty,
  resolveTravelSettingsSaveUi,
  toTravelSettingsFormState,
  type TravelSettingsFormState,
} from '@/features/travel/travelSettingsFormState'
import type { StudioTravelSettings } from '@/types/travel'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

function persistedSettings(
  overrides: Partial<StudioTravelSettings> = {},
): StudioTravelSettings {
  return {
    id: 'st1',
    userId: 'u1',
    studioName: 'Studio',
    street: 'ul. Testowa',
    buildingNumber: '1',
    postalCode: '00-001',
    city: 'Warszawa',
    country: 'Polska',
    formattedAddress: 'ul. Testowa 1, 00-001 Warszawa',
    latitude: 52.23,
    longitude: 21.01,
    placeId: 'ChIJtest',
    freeDistanceKm: 200,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

run('A. persisted settings load → Zapisano', () => {
  const form = toTravelSettingsFormState(persistedSettings())
  const baseline = toTravelSettingsFormState(persistedSettings())
  assert(!isTravelSettingsFormDirty(form, baseline), 'not dirty')
  const ui = resolveTravelSettingsSaveUi({
    loaded: true,
    isDirty: false,
    isSaving: false,
    hasSaveError: false,
  })
  assertEq(ui.label, 'Zapisano', 'label')
  assertEq(ui.state, 'saved', 'state')
  assert(!ui.showPrimarySave, 'not primary')
})

run('B. change free distance → Zapisz', () => {
  const baseline = toTravelSettingsFormState(persistedSettings())
  const form: TravelSettingsFormState = {
    ...baseline,
    freeDistanceKm: '250',
  }
  assert(isTravelSettingsFormDirty(form, baseline), 'dirty')
  const ui = resolveTravelSettingsSaveUi({
    loaded: true,
    isDirty: true,
    isSaving: false,
    hasSaveError: false,
  })
  assertEq(ui.label, 'Zapisz', 'label')
  assert(ui.showPrimarySave, 'primary')
})

run('C. change start location field → Zapisz', () => {
  const baseline = toTravelSettingsFormState(persistedSettings())
  const form = { ...baseline, city: 'Kraków', place: null }
  assert(isTravelSettingsFormDirty(form, baseline), 'dirty')
})

run('D. select new Google address → Zapisz', () => {
  const baseline = toTravelSettingsFormState(persistedSettings())
  const form: TravelSettingsFormState = {
    ...baseline,
    place: {
      placeId: 'ChIJnew',
      formattedAddress: 'Nowa 2, Kraków',
      latitude: 50.06,
      longitude: 19.94,
    },
    formattedAddress: 'Nowa 2, Kraków',
  }
  assert(isTravelSettingsFormDirty(form, baseline), 'dirty after place select')
})

run('E. successful save → Zapisano', () => {
  const before = toTravelSettingsFormState(
    persistedSettings({ freeDistanceKm: 200 }),
  )
  const afterSave = toTravelSettingsFormState(
    persistedSettings({ freeDistanceKm: 250 }),
  )
  // Simulate: form was dirty, then both reset to saved payload.
  assert(
    isTravelSettingsFormDirty(
      { ...before, freeDistanceKm: '250' },
      before,
    ),
    'was dirty',
  )
  assert(
    !isTravelSettingsFormDirty(afterSave, afterSave),
    'clean after baseline reset',
  )
  const ui = resolveTravelSettingsSaveUi({
    loaded: true,
    isDirty: false,
    isSaving: false,
    hasSaveError: false,
  })
  assertEq(ui.label, 'Zapisano', 'after save')
})

run('F. failed save → must NOT show Zapisano', () => {
  const ui = resolveTravelSettingsSaveUi({
    loaded: true,
    isDirty: true,
    isSaving: false,
    hasSaveError: true,
  })
  assertEq(ui.label, 'Zapisz', 'still save')
  assert(ui.state !== 'saved', 'not saved')

  const cleanButError = resolveTravelSettingsSaveUi({
    loaded: true,
    isDirty: false,
    isSaving: false,
    hasSaveError: true,
  })
  assertEq(cleanButError.label, 'Zapisz', 'error keeps actionable save')
  assert(cleanButError.state !== 'saved', 'no false saved')
})

run('G/H. page source hides coordinates and place_id', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/pages/TravelSettingsPage.tsx'),
    'utf8',
  )
  assert(!src.includes('Współrzędne'), 'no coordinates copy')
  assert(!src.includes('place_id zapisany'), 'no place_id copy')
  assert(!src.includes('toFixed('), 'no lat/lng formatting in UI')
  assert(!src.includes('zgeokod'), 'no geocode jargon')
  assert(src.includes('Adres potwierdzony'), 'calm confirmation')
  const search = readFileSync(
    resolve(process.cwd(), 'src/features/travel/LocationSearchField.tsx'),
    'utf8',
  )
  assert(
    !search.includes('Location saved with coordinates'),
    'no English coordinates status in search field',
  )
  assert(
    src.includes('na karcie ślubu'),
    'free-km copy mentions wedding card',
  )
  assert(src.includes('resolveTravelSettingsSaveUi'), 'save ui helper')
  assert(src.includes('isTravelSettingsFormDirty'), 'dirty helper')
  assert(src.includes('travel-settings-saved'), 'saved test id')
  assert(src.includes('section-gap') || src.includes('styles.sections'), 'spacing')
})

run('I. async init: empty→persisted sets form and baseline together (not dirty)', () => {
  const empty = EMPTY_TRAVEL_SETTINGS_FORM
  assert(!isTravelSettingsFormDirty(empty, empty), 'initial empty clean')
  const loaded = toTravelSettingsFormState(persistedSettings())
  // Hydration assigns the same object shape to form and baseline in one step.
  assert(!isTravelSettingsFormDirty(loaded, loaded), 'post-hydrate clean')
  const ui = resolveTravelSettingsSaveUi({
    loaded: true,
    isDirty: false,
    isSaving: false,
    hasSaveError: false,
  })
  assertEq(ui.label, 'Zapisano', 'no Zapisz on load')
})

run('J. hidden coords/placeId do not leave permanent dirty after save', () => {
  const saved = persistedSettings({
    latitude: 52.2296756,
    longitude: 21.0122287,
    placeId: 'ChIJabc',
  })
  const form = toTravelSettingsFormState(saved)
  const baseline = toTravelSettingsFormState(saved)
  assert(hasConfirmedTravelOrigin(form), 'confirmed')
  assert(!isTravelSettingsFormDirty(form, baseline), 'clean with hidden geo')
  // Re-map from same server row (invalidate refetch) stays clean.
  const remapped = toTravelSettingsFormState(saved)
  assert(!isTravelSettingsFormDirty(remapped, baseline), 'remap clean')
})

run('saving label + address confirmation without exposing geo', () => {
  const saving = resolveTravelSettingsSaveUi({
    loaded: true,
    isDirty: true,
    isSaving: true,
    hasSaveError: false,
  })
  assertEq(saving.label, 'Zapisywanie…', 'saving')
  assert(saving.disabled, 'disabled while saving')

  assert(
    hasConfirmedTravelOrigin(
      toTravelSettingsFormState(persistedSettings()),
    ),
    'has coords internally',
  )
  assert(
    !hasConfirmedTravelOrigin({ place: null }),
    'no confirmation without place',
  )
})

console.log('Travel settings UX acceptance finished.')
