/**
 * Wedding location name vs address — Villa Love must survive Places selection.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  adaptLegacyWeddingLocationFields,
  didWeddingLocationRouteChange,
  getWeddingLocationDisplay,
  isAddressLikeName,
  isMeaningfulVenueName,
  mapPlaceSelectionToGeoPlace,
  mapSuggestionAndResolvedToGeoPlace,
  mergeLocationAnswerWithExisting,
  normalizeLocationAnswer,
  weddingPlaceRouteLabel,
} from '@/features/travel/weddingLocationModel'
import { getWeddingLocationItems } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import type { WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'

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

const VILLA_FORMATTED = 'Lwowska 78, 34-144 Izdebnik'

run('1. Google named venue: Villa Love persists separately from address', () => {
  const geo = mapSuggestionAndResolvedToGeoPlace(
    {
      id: 'google:abc',
      label: 'Villa Love',
      secondaryLabel: 'Lwowska, Izdebnik',
    },
    {
      formattedAddress: VILLA_FORMATTED,
      placeId: 'ChIJvilla',
      provider: 'google',
      street: 'Lwowska',
      buildingNumber: '78',
      postalCode: '34-144',
      city: 'Izdebnik',
      latitude: 49.87,
      longitude: 19.76,
      name: 'Villa Love',
      types: ['establishment', 'point_of_interest'],
    },
  )
  assertEq(geo.label, 'Villa Love', 'name')
  assertEq(geo.formattedAddress, VILLA_FORMATTED, 'address')
  assertEq(geo.placeId, 'ChIJvilla', 'placeId')
  assert(geo.latitude === 49.87 && geo.longitude === 19.76, 'coords')
  assert(geo.label !== geo.formattedAddress, 'name ≠ address')
  assert(!isAddressLikeName('Villa Love', VILLA_FORMATTED), 'not address-like')
})

run('2. Pure street selection does not invent a venue name', () => {
  const geo = mapSuggestionAndResolvedToGeoPlace(
    {
      id: 'google:street',
      label: 'Lwowska 78',
      secondaryLabel: '34-144 Izdebnik',
    },
    {
      formattedAddress: VILLA_FORMATTED,
      placeId: 'ChIJstreet',
      provider: 'google',
      street: 'Lwowska',
      buildingNumber: '78',
      postalCode: '34-144',
      city: 'Izdebnik',
      latitude: 49.87,
      longitude: 19.76,
      types: ['street_address'],
    },
  )
  assertEq(geo.label, null, 'no fake name')
  assertEq(geo.formattedAddress, VILLA_FORMATTED, 'address kept')
})

run('3. Manual name preserved when selecting address after custom name', () => {
  const geo = mapPlaceSelectionToGeoPlace({
    resolved: {
      formattedAddress: VILLA_FORMATTED,
      placeId: 'ChIJstreet',
      provider: 'google',
      street: 'Lwowska',
      buildingNumber: '78',
      types: ['street_address'],
    },
    suggestionLabel: 'Lwowska 78',
    preserveName: 'Dom Panny Młodej',
    nameManuallyEdited: true,
  })
  assertEq(geo.label, 'Dom Panny Młodej', 'custom name kept')
  assertEq(geo.formattedAddress, VILLA_FORMATTED, 'address')
})

run('4. Selecting named venue adopts name when not manually edited', () => {
  const geo = mapPlaceSelectionToGeoPlace({
    resolved: {
      formattedAddress: VILLA_FORMATTED,
      placeId: 'x',
      provider: 'google',
      name: 'Villa Love',
      types: ['establishment'],
    },
    suggestionLabel: 'Villa Love',
    preserveName: '',
    nameManuallyEdited: false,
  })
  assertEq(geo.label, 'Villa Love', 'adopted')
})

run('5. Legacy duplicate address-as-name displays once', () => {
  const adapted = adaptLegacyWeddingLocationFields({
    label: 'Lwowska 78',
    formattedAddress: VILLA_FORMATTED,
  })
  assertEq(adapted.name, null, 'strip fake name')
  const display = getWeddingLocationDisplay({
    label: 'Lwowska 78',
    formattedAddress: VILLA_FORMATTED,
  })
  assertEq(display.primary, VILLA_FORMATTED, 'single line')
  assertEq(display.secondary, null, 'no duplicate')
})

run('6. Proper name + address displays two lines', () => {
  const display = getWeddingLocationDisplay({
    label: 'Villa Love',
    formattedAddress: VILLA_FORMATTED,
  })
  assertEq(display.primary, 'Villa Love', 'primary')
  assertEq(display.secondary, VILLA_FORMATTED, 'secondary')
})

run('7. Editing identity: name-only change does not invalidate route', () => {
  const prev = {
    placeId: 'ChIJ',
    formattedAddress: VILLA_FORMATTED,
    latitude: 49.87,
    longitude: 19.76,
  }
  assert(
    !didWeddingLocationRouteChange(prev, {
      ...prev,
    }),
    'same identity',
  )
  // Name is not part of route identity — callers compare without label.
  assert(
    !didWeddingLocationRouteChange(prev, {
      placeId: prev.placeId,
      formattedAddress: prev.formattedAddress,
      latitude: prev.latitude,
      longitude: prev.longitude,
    }),
    'name omitted still same',
  )
  assert(
    didWeddingLocationRouteChange(prev, {
      ...prev,
      formattedAddress: 'Inna 1, Kraków',
    }),
    'address change invalidates',
  )
  assert(
    didWeddingLocationRouteChange(prev, {
      ...prev,
      placeId: 'other',
    }),
    'placeId change invalidates',
  )
})

run('8. Questionnaire: separate name+address, name-only, address-only', () => {
  const both = normalizeLocationAnswer({
    name: 'Villa Love',
    formattedAddress: VILLA_FORMATTED,
    placeId: 'ChIJ',
    latitude: 1,
    longitude: 2,
  })
  assertEq(both.name, 'Villa Love', 'both name')
  assertEq(both.formattedAddress, VILLA_FORMATTED, 'both addr')

  const nameOnly = normalizeLocationAnswer({ name: 'Hotel Monopol' })
  assertEq(nameOnly.name, 'Hotel Monopol', 'name only')
  assertEq(nameOnly.formattedAddress, null, 'no fabricated address')

  const addrOnly = normalizeLocationAnswer(VILLA_FORMATTED)
  assertEq(addrOnly.name, null, 'string is address')
  assertEq(addrOnly.formattedAddress, VILLA_FORMATTED, 'string addr')

  const existing: WeddingPlace = {
    id: 'p1',
    weddingId: 'w1',
    role: 'reception',
    label: 'Villa Love',
    placeId: 'ChIJ',
    formattedAddress: 'Stary adres',
    latitude: 1,
    longitude: 2,
    sortOrder: 30,
    createdAt: '',
    updatedAt: '',
  }
  const merged = mergeLocationAnswerWithExisting(
    normalizeLocationAnswer('Lwowska 78, Izdebnik'),
    existing,
  )
  assertEq(merged.label, 'Villa Love', 'keep existing name')
  assertEq(merged.formattedAddress, 'Lwowska 78, Izdebnik', 'new address')
})

run('9. Selector placeName/address for itinerary', () => {
  const wedding = {
    id: 'w1',
    date: '2026-08-01',
    receptionLocation: '',
    bridePreparationLocation: '',
    groomPreparationLocation: '',
    ceremonyLocation: '',
    preparationLocation: '',
  } as Wedding
  const places: WeddingPlace[] = [
    {
      id: 'r1',
      weddingId: 'w1',
      role: 'reception',
      label: 'Villa Love',
      placeId: 'x',
      formattedAddress: VILLA_FORMATTED,
      latitude: 49.8,
      longitude: 19.7,
      sortOrder: 30,
      createdAt: '',
      updatedAt: '',
    },
  ]
  const items = getWeddingLocationItems(wedding, places)
  const reception = items.find((i) => i.role === 'reception')!
  assertEq(reception.placeName, 'Villa Love', 'placeName')
  assertEq(reception.address, VILLA_FORMATTED, 'address')
  assertEq(
    weddingPlaceRouteLabel(places[0], 'Przyjęcie weselne'),
    'Villa Love',
    'route label',
  )
})

run('10. Source: Places mapping + editor use shared model', () => {
  const search = readFileSync(
    resolve(process.cwd(), 'src/features/travel/LocationSearchField.tsx'),
    'utf8',
  )
  assert(search.includes('mapSuggestionAndResolvedToGeoPlace'), 'shared map')
  assert(!search.includes('compactDisplay ? short'), 'no street-as-label')

  const editor = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/editing/fields/WeddingLocationEditor.tsx',
    ),
    'utf8',
  )
  assert(editor.includes('Nazwa miejsca'), 'name field')
  assert(editor.includes('Adres'), 'address field')

  const roles = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/editing/fields/LocationRoleFields.tsx',
    ),
    'utf8',
  )
  assert(roles.includes('WeddingLocationEditor'), 'shared editor')

  const proxy = readFileSync(
    resolve(process.cwd(), 'supabase/functions/places-proxy/config.ts'),
    'utf8',
  )
  assert(proxy.includes("'displayName'"), 'displayName in field mask')

  const upsert = readFileSync(
    resolve(process.cwd(), 'src/lib/api/weddingPlaceService.ts'),
    'utf8',
  )
  assert(upsert.includes('place.label === undefined'), 'explicit label clear')

  const save = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/editing/useWeddingLocationSave.tsx'.replace(
        '.tsx',
        '.ts',
      ),
    ),
    'utf8',
  )
  assert(save.includes('didWeddingLocationRouteChange'), 'route skip')
})

run('11. Meaningful name detection edge cases', () => {
  assert(isMeaningfulVenueName('Kościół św. Anny', 'ul. Grodzka 1, Kraków'), 'church')
  assert(!isMeaningfulVenueName('Lwowska', VILLA_FORMATTED, {
    addressParts: { street: 'Lwowska', buildingNumber: '78' },
  }), 'street only')
  assert(!isMeaningfulVenueName('34-144', VILLA_FORMATTED), 'postal')
  assert(!isMeaningfulVenueName('Izdebnik', VILLA_FORMATTED, {
    addressParts: { city: 'Izdebnik' },
  }), 'city')
})
