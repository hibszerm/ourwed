/**
 * Wedding location editor must open for free-text / unverified places.
 * Verified GeoPlace is NOT required for editability — only for route/map.
 *
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/weddings/detail/weddingLocationEditOpenAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  adaptLegacyWeddingLocationFields,
  mergeLocationAnswerWithExisting,
  normalizeLocationAnswer,
  weddingPlaceToGeoPlace,
} from '@/features/travel/weddingLocationModel'
import {
  isPlaceVerified,
  locationVerificationStatus,
} from '@/features/travel/locationVerification'
import type { WeddingPlace } from '@/types/travel'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

const freeTextPlace: WeddingPlace = {
  id: 'p-free',
  weddingId: 'w1',
  role: 'bride_preparation',
  label: '3 maja',
  placeId: null,
  formattedAddress: 'Jeszcze nie wiemy',
  latitude: null,
  longitude: null,
  sortOrder: 15,
  createdAt: '',
  updatedAt: '',
}

const partialPlace: WeddingPlace = {
  id: 'p-partial',
  weddingId: 'w1',
  role: 'groom_preparation',
  label: null,
  placeId: null,
  formattedAddress: 'Ustalone później',
  latitude: null,
  longitude: null,
  sortOrder: 10,
  createdAt: '',
  updatedAt: '',
}

const verifiedPlace: WeddingPlace = {
  id: 'p-ok',
  weddingId: 'w1',
  role: 'reception',
  label: 'Villa Love',
  placeId: 'ChIJ_test',
  formattedAddress: 'Lwowska 78, 34-144 Izdebnik',
  latitude: 49.81,
  longitude: 19.74,
  sortOrder: 30,
  createdAt: '',
  updatedAt: '',
}

{
  assert(!isPlaceVerified(freeTextPlace), '1: free-text not verified')
  assert(
    locationVerificationStatus(freeTextPlace) === 'needs_verification',
    '1: needs_verification',
  )
  assert(isPlaceVerified(verifiedPlace), '1: verified place ok')
  console.log('PASS  1  verification status matrix')
}

{
  const adapted = adaptLegacyWeddingLocationFields(freeTextPlace)
  assert(adapted.name === '3 maja', '2: name preserved')
  assert(adapted.formattedAddress === 'Jeszcze nie wiemy', '2: address preserved')
  const geo = weddingPlaceToGeoPlace(freeTextPlace)
  assert(geo != null, '2: geo from free-text')
  assert(geo!.formattedAddress === 'Jeszcze nie wiemy', '2: geo address')
  assert(geo!.placeId == null, '2: no placeId')
  assert(geo!.latitude == null && geo!.longitude == null, '2: no coords')
  console.log('PASS  2  free-text survives editor initialization model')
}

{
  const partial = adaptLegacyWeddingLocationFields(partialPlace)
  assert(partial.name == null, '3: partial name empty')
  assert(partial.formattedAddress === 'Ustalone później', '3: partial address')
  assert(weddingPlaceToGeoPlace(null) == null, '3: empty → null geo')
  console.log('PASS  3  partial + empty initialization')
}

{
  const shapes = [
    { name: '3 maja', formattedAddress: 'Jeszcze nie wiemy' },
    { name: '3 maja', address: 'Jeszcze nie wiemy' },
    { formattedAddress: 'Ustalone później' },
    { address: 'Ustalone później' },
    'Ustalone później',
  ]
  for (const shape of shapes) {
    const incoming = normalizeLocationAnswer(shape)
    const merged = mergeLocationAnswerWithExisting(incoming, null)
    assert(
      Boolean(merged.formattedAddress?.trim() || merged.label?.trim()),
      `4: shape retains editable text: ${JSON.stringify(shape)}`,
    )
  }
  console.log('PASS  4  questionnaire free-text shapes normalize for edit')
}

{
  const drawer = read(
    'src/features/weddings/detail/v2/WeddingEditDrawerV2.tsx',
  )
  assertIncludes(drawer, 'backdropDismissArmed', '5: ghost-click arm')
  assertIncludes(
    drawer,
    'generating click hits the',
    '5: documents open-click dismiss bug',
  )
  assertIncludes(drawer, 'setTimeout', '5: deferred arm')
  console.log('PASS  5  drawer open does not self-dismiss on generating click')
}

{
  const overview = read(
    'src/features/weddings/detail/v2/WeddingOverviewEssentials.tsx',
  )
  const day = read('src/features/weddings/detail/v2/WeddingDayWorkspace.tsx')
  const v2 = read('src/features/weddings/detail/v2/WeddingDetailV2.tsx')
  const surface = read(
    'src/features/weddings/detail/v2/WeddingWorkspaceEditSurface.tsx',
  )
  const editor = read(
    'src/features/weddings/detail/editing/fields/WeddingLocationEditor.tsx',
  )

  assertIncludes(overview, 'onEditLocations', '6: Overview entry')
  assertIncludes(overview, 'Edytuj lokalizacje', '6: Overview label')
  assertIncludes(day, 'onEditLocationRole', '7: Wedding Day per-role entry')
  assertIncludes(day, 'onRequestVerifyLocations', '7: Wedding Day all-locations')
  assertIncludes(v2, "onEditSection('locations')", '6/7: shared open locations')
  assertIncludes(v2, 'Always open the shared location editor', '7: never no-op')
  assertIncludes(v2, 'else onRequestVerifyLocations()', '7: role fallback')
  assertIncludes(surface, 'LocationRoleFields', '8: shared editor host')
  assertIncludes(surface, 'isLocationEditorSection', '8: location-only drawer')
  assertIncludes(
    editor,
    'Adres wymaga weryfikacji, zanim będzie można obliczyć trasę.',
    '9: verification hint separate from editability',
  )
  assertIncludes(editor, 'weddingPlaceToGeoPlace(saved)', '9: init from saved')
  console.log('PASS  6–9  Overview + Wedding Day → shared editor; verify ≠ edit')
}

{
  const travel = read('src/features/travel/travelUi.ts')
  assertIncludes(
    travel,
    'if (!place || !isPlaceVerified(place)) continue',
    '10: route stops require verification',
  )
  assertIncludes(
    travel,
    'Free-text / unresolved questionnaire places remain editable',
    '10: documents edit vs route split',
  )
  const day = read('src/features/weddings/detail/v2/WeddingDayWorkspace.tsx')
  assertIncludes(day, 'loc.verified', '10: Nawiguj gated on verified')
  console.log('PASS  10  route/map verification separate from editability')
}

{
  const page = read('src/pages/WeddingDetailPage.tsx')
  assertIncludes(page, "beginEdit('locations')", '11: page open locations')
  assertIncludes(page, 'onEditSection: openEditor', '11: shared openEditor')
  assertIncludes(page, 'isLocationEditorSection', '11: location dirty skip')
  console.log('PASS  11  page-owned editor open path')
}

console.log('\nAll wedding location edit-open acceptance checks passed.')
