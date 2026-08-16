/**
 * Wedding location address search must reuse LocationSearchField and stack
 * above WeddingEditDrawerV2 (z-index 10000). Typing alone does not verify.
 *
 * Run: npm run test:wedding-location-search
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  adaptLegacyWeddingLocationFields,
  mergeLocationAnswerWithExisting,
  normalizeLocationAnswer,
  weddingPlaceToGeoPlace,
} from '@/features/travel/weddingLocationModel'
import { isPlaceVerified } from '@/features/travel/locationVerification'
import type { GeoPlace, WeddingPlace } from '@/types/travel'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

const editor = read(
  'src/features/weddings/detail/editing/fields/WeddingLocationEditor.tsx',
)
const search = read('src/features/travel/LocationSearchField.tsx')
const questionnaire = read(
  'src/features/prewedding/QuestionnaireLocationField.tsx',
)
const drawer = read(
  'src/features/weddings/detail/v2/WeddingEditDrawerV2.tsx',
)
const drawerCss = read(
  'src/features/weddings/detail/v2/WeddingEditDrawerV2.module.css',
)
const overlay = read('src/components/ui/overlay/useOverlay.ts')
const roles = read(
  'src/features/weddings/detail/editing/fields/LocationRoleFields.tsx',
)
const v2 = read('src/features/weddings/detail/v2/WeddingDetailV2.tsx')
const overview = read(
  'src/features/weddings/detail/v2/WeddingOverviewEssentials.tsx',
)
const day = read('src/features/weddings/detail/v2/WeddingDayWorkspace.tsx')

{
  assertIncludes(editor, 'LocationSearchField', '1: wedding uses shared search')
  assertNotIncludes(editor, 'AddressField', '1: no legacy AddressField')
  assertIncludes(questionnaire, 'LocationSearchField', '1: questionnaire same primitive')
  assertIncludes(search, 'LOCATION_SEARCH_OVERLAY_Z_INDEX = 11050', '1: z above drawer')
  assertIncludes(search, 'zIndex={LOCATION_SEARCH_OVERLAY_Z_INDEX}', '1: wired to overlays')
  assertIncludes(drawerCss, 'z-index: 10000', '1: drawer panel stacking')
  const zWedding = 11050
  const zDrawer = 10000
  assert(zWedding > zDrawer, '1: location overlay above drawer')
  console.log('PASS  1  shared LocationSearchField + z-index above drawer')
}

{
  const free: WeddingPlace = {
    id: '1',
    weddingId: 'w',
    role: 'bride_preparation',
    label: '3 maja',
    placeId: null,
    formattedAddress: 'Jeszcze nie wiemy',
    latitude: null,
    longitude: null,
    sortOrder: 1,
    createdAt: '',
    updatedAt: '',
  }
  const adapted = adaptLegacyWeddingLocationFields(free)
  assert(adapted.formattedAddress === 'Jeszcze nie wiemy', '2: free text init')
  assert(adapted.name === '3 maja', '2: name preserved')
  assert(!isPlaceVerified(free), '2: still unverified')
  const geo = weddingPlaceToGeoPlace(free)!
  assert(geo.placeId == null && geo.latitude == null, '3: typing model unverified')
  console.log('PASS  2–3  free-text init; typing alone does not verify')
}

{
  const selected: GeoPlace = {
    placeId: 'ChIJ_test',
    formattedAddress: '3 Maja 66, 00-001 Warszawa',
    latitude: 50.32,
    longitude: 18.78,
    label: 'Zabrze',
    provider: 'google',
  }
  assert(isPlaceVerified({
    formattedAddress: selected.formattedAddress,
    latitude: selected.latitude,
    longitude: selected.longitude,
  }), '4: selection verifies')
  assertIncludes(editor, 'onSelectPlace', '4: select path')
  assertIncludes(editor, 'preserveName={name}', '5: venue name preserved')
  assertIncludes(editor, 'nameManuallyEdited', '5: manual name lock')
  console.log('PASS  4–5  GeoPlace selection verifies; name preserved')
}

{
  assertIncludes(drawer, 'backdropDismissArmed', '6: open hotfix intact')
  assertIncludes(overlay, 'hasNestedFieldOverlayOpen', '6: Escape defers to suggestions')
  assertIncludes(
    overlay,
    'data-floating-portal="true"',
    '6: nested portal Escape gate',
  )
  assertIncludes(
    overlay,
    'location-mobile-address-dialog',
    '6: mobile dialog Escape gate',
  )
  console.log('PASS  6  drawer open hotfix + suggestion Escape safety')
}

{
  assertIncludes(roles, 'WeddingLocationEditor', '7: all roles shared editor')
  assertIncludes(roles, 'bride_preparation', '7: bride')
  assertIncludes(roles, 'groom_preparation', '7: groom')
  assertIncludes(roles, 'ceremony', '7: ceremony')
  assertIncludes(roles, 'reception', '7: reception')
  assertIncludes(overview, 'Edytuj lokalizacje', '8: Overview entry')
  assertIncludes(v2, "onEditSection('locations')", '8: Overview→locations')
  assertIncludes(day, 'onEditLocationRole', '9: Wedding Day entry')
  assertIncludes(editor, 'commitTypedOnBlur', '10: free-text save policy')
  assertIncludes(
    editor,
    'Adres wymaga weryfikacji, zanim będzie można obliczyć trasę.',
    '10: unverified hint',
  )
  const merged = mergeLocationAnswerWithExisting(
    normalizeLocationAnswer({ address: 'Ustalone później' }),
    null,
  )
  assert(merged.formattedAddress === 'Ustalone później', '10: address alias')
  console.log('PASS  7–10  roles, entry points, free-text policy')
}

{
  assertNotIncludes(
    questionnaire,
    'LOCATION_SEARCH_OVERLAY_Z_INDEX',
    '11: questionnaire source unchanged (uses shared field defaults)',
  )
  assertIncludes(questionnaire, 'LocationSearchField', '11: still shared')
  console.log('PASS  11  questionnaire UX not rewritten')
}

console.log('\nAll wedding location search acceptance checks passed.')
