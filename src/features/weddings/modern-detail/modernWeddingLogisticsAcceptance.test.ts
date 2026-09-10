/**
 * Modern Wedding Detail — Logistics (Logistyka) presentation acceptance.
 * Run: npm run test:modern-wedding-detail
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WORKSPACE_TABS } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(actual: T, expected: T, m: string) {
  if (actual !== expected) {
    throw new Error(`${m}: expected ${String(expected)}, got ${String(actual)}`)
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

const logistics = read(
  'src/features/weddings/modern-detail/ModernWeddingLogisticsWorkspace.tsx',
)
const logisticsCss = read(
  'src/features/weddings/modern-detail/ModernWeddingLogisticsWorkspace.module.css',
)
const workspace = read(
  'src/features/weddings/modern-detail/ModernWeddingDetailWorkspace.tsx',
)
const tabs = read(
  'src/features/weddings/modern-detail/ModernWeddingDetailTabs.tsx',
)
const classicDay = read(
  'src/features/weddings/detail/v2/WeddingDayWorkspace.tsx',
)
const classicTabs = read(
  'src/features/weddings/detail/v2/weddingWorkspaceSelectors.ts',
)
const travelMap = read('src/features/travel/TravelMap.tsx')
const overview = read(
  'src/features/weddings/modern-detail/ModernWeddingOverview.tsx',
)

run('Modern tab label is Logistyka; Classic stays Dzień ślubu', () => {
  assert(tabs.includes("wedding_day: 'Logistyka'"), 'modern label')
  assert(tabs.includes('WORKSPACE_TABS'), 'shared tab ids')
  assertEq(
    WORKSPACE_TABS.find((t) => t.id === 'wedding_day')?.label,
    'Dzień ślubu',
    'classic label untouched',
  )
  assert(classicTabs.includes("label: 'Dzień ślubu'"), 'selector classic copy')
  assert(!classicTabs.includes("label: 'Logistyka'"), 'no classic rename')
})

run('Modern mounts dedicated logistics workspace, not Classic bridge', () => {
  assert(workspace.includes('ModernWeddingLogisticsWorkspace'), 'modern mount')
  assert(
    !workspace.includes("from '@/features/weddings/detail/v2/WeddingDayWorkspace'"),
    'classic day workspace not imported',
  )
  assert(
    !workspace.includes('data-tab="wedding_day"'),
    'no v2 bridge wrapper for day tab',
  )
  assert(classicDay.includes('WeddingDayWorkspace'), 'classic file remains')
  assert(classicDay.includes('cockpitBanner'), 'classic cockpit banner remains')
})

run('Canonical places, order, and travel-plan are reused', () => {
  assert(logistics.includes('getWeddingLocationItems'), 'shared location items')
  assert(logistics.includes('getOperationalOrderedPlaces'), 'canonical order')
  assert(logistics.includes('travelPlanQueryKey'), 'travel-plan factory')
  assert(logistics.includes('weddingPlacesQueryKey'), 'wedding-places factory')
  assert(logistics.includes('withAuthoritativePlaces'), 'places overlay')
  assert(logistics.includes('buildTravelFlow'), 'shared flow')
  assert(logistics.includes('orderedPlaceIds'), 'explicit ids from places')
  assert(logistics.includes('places: []'), 'plan.places not authority')
  assert(logistics.includes("travelService.recalculate"), 'same recalc')
  assert(!logistics.includes('create extra place'), 'no extra model')
})

run('No Travel Fee, timeline, or Cockpit banner in Modern Logistics', () => {
  assert(!logistics.includes('TravelFee'), 'no fee component')
  assert(!logistics.includes('effectiveTravel'), 'no CV travel')
  assert(!logistics.includes('Wartość zlecenia'), 'no contract value')
  assert(!logistics.includes('ceremonyTime'), 'no ceremony clock')
  assert(!logistics.includes('operationalTimes'), 'no operational times')
  assert(!logistics.includes('coverageStart'), 'no coverage start')
  assert(!logistics.includes('cockpitBanner'), 'no cockpit banner')
  assert(!logistics.includes('dzien-slubu'), 'no cockpit promo link')
  assert(!logistics.includes('Tryb dnia ślubu'), 'no day-mode promo')
  assert(!logistics.includes('modern-wedding-places'), 'not overview places card')
  assert(!overview.includes('ModernWeddingLogisticsWorkspace'), 'overview isolated')
})

run('Movement plan: start, unnumbered stops, legs between, totals', () => {
  assert(logistics.includes('Start'), 'start label')
  assert(!logistics.includes('padStopIndex'), 'no sequence numbers')
  assert(!logisticsCss.includes('.index'), 'no index styles')
  assert(logistics.includes('data-testid="travel-leg"'), 'legs')
  assert(logistics.includes('Nawiguj'), 'navigate')
  assert(logistics.includes('buildGoogleMapsNavigationUrl'), 'nav contract')
  assert(logistics.includes('navigateToStopUrl'), 'stop url')
  assert(logistics.includes('w trasie'), 'editorial totals')
  assert(logistics.includes('modern-logistics-totals'), 'totals testid')
  assert(!logistics.includes('TravelRouteTotals'), 'no KPI totals component')
  assert(logisticsCss.includes('2fr') && logisticsCss.includes('3fr'), '40/60')
})

run('Map is existing Google Maps, larger logistics size, no polyline wired', () => {
  assert(logistics.includes('TravelMap'), 'reuse map')
  assert(logistics.includes('size="logistics"'), 'logistics size')
  assert(!logistics.includes('encodedPolyline'), 'no polyline in L1')
  assert(travelMap.includes("size?: 'default' | 'logistics'"), 'size prop')
  assert(travelMap.includes("size = 'default'"), 'classic default')
  const mapCss = read('src/features/travel/TravelMap.module.css')
  assert(mapCss.includes('height: 280px'), 'classic height kept')
  assert(mapCss.includes("data-size='logistics'"), 'logistics height hook')
  assert(mapCss.includes('height: 560px'), 'modern map mass')
})

run('Empty / loading states distinguish pending from loaded-empty', () => {
  assert(logistics.includes('isPending'), 'pending vs empty')
  assert(logistics.includes('logistics-map-loading'), 'map loading')
  assert(logistics.includes('Ładowanie mapy…'), 'loading copy')
  assert(logistics.includes('logistics-empty'), 'loaded empty')
  assert(logistics.includes('Brakuje lokalizacji'), 'empty tone')
  assert(logistics.includes('logistics-unverified'), 'unverified')
  assert(logistics.includes('previewMapStops'), 'preview markers while plan loads')
  assert(
    !logistics.includes('Ładowanie trasy…') ||
      logistics.includes('routeSettled'),
    'loading gated',
  )
})

run('Single global edit ownership; Nawiguj is the only per-stop action', () => {
  assert(logistics.includes('Edytuj miejsca'), 'global locations entry')
  assert(logistics.includes('Przelicz trasę'), 'recalculate')
  assert(!logistics.includes("loc.empty ? 'Uzupełnij' : 'Edytuj'"), 'no per-stop edit')
  assert(!logistics.includes('editRole'), 'no per-stop editor handler')
  assert(!logistics.includes('>Uzupełnij<'), 'no local Uzupełnij CTA')
  assert(logistics.includes('Nieuzupełnione'), 'incomplete copy remains')
  assert(logistics.includes('onEditLocationRole'), 'parent still can pass edit')
  assert(!logistics.includes('onDrag'), 'no drag')
  assert(!logistics.includes('reorderPlaceIds'), 'no reorder ownership')
  assert(!logistics.includes('dnd'), 'no dnd')
})

run('Modern Edytuj miejsca uses centered modal, not the right drawer', () => {
  const modernWorkspace = read(
    'src/features/weddings/modern-detail/ModernWeddingDetailWorkspace.tsx',
  )
  const classic = read(
    'src/features/weddings/detail/v2/WeddingDetailV2.tsx',
  )
  const surface = read(
    'src/features/weddings/detail/v2/WeddingWorkspaceEditSurface.tsx',
  )
  const drawer = read(
    'src/features/weddings/detail/v2/WeddingEditDrawerV2.tsx',
  )
  const drawerCss = read(
    'src/features/weddings/detail/v2/WeddingEditDrawerV2.module.css',
  )
  const fields = read(
    'src/features/weddings/detail/editing/fields/LocationRoleFields.tsx',
  )
  const overlay = read('src/components/ui/overlay/useOverlay.ts')
  const backdrop = read('src/components/ui/Backdrop.module.css')

  assert(
    modernWorkspace.includes('resolveWeddingEditOverlayPresentation'),
    'modern locations use centered overlay',
  )
  assert(
    !modernWorkspace.includes('allowCenteredPackage'),
    'package/finance no longer gated to contract tab',
  )
  assert(classic.includes('resolveWeddingEditOverlayPresentation'), 'classic centered parity')
  assert(surface.includes('LocationRoleFields'), 'same form body')
  assert(surface.includes("centeredLocations ? 'Edytuj miejsca' : meta.title"), 'modern title')
  assert(surface.includes('Uzupełnij lokalizacje używane w dniu ślubu.'), 'modern description')
  assert(drawer.includes("presentation = 'drawer'"), 'drawer remains default')
  assert(drawer.includes('modern-places-edit-modal'), 'centered testid')
  assert(drawer.includes('wedding-edit-drawer-v2'), 'classic drawer testid kept')
  assert(drawer.includes('ModalPortal'), 'portal')
  assert(drawer.includes('useOverlay'), 'shared overlay')
  assert(drawer.includes('<Backdrop'), 'shared backdrop')
  assert(drawer.includes('requestClose'), 'escape/outside go through close')
  assert(overlay.includes("event.key === 'Escape'"), 'escape')
  assert(overlay.includes('getFocusable'), 'focus trap')
  assert(overlay.includes('previouslyFocused.current?.focus'), 'focus return')
  assert(overlay.includes('lockBodyScroll'), 'body lock')
  assert(backdrop.includes('backdrop-filter: blur(10px)'), 'blur 10px')
  assert(drawerCss.includes('.rootCentered'), 'centered geometry')
  assert(drawerCss.includes('width: min(720px, 100%)'), 'editor width')
  assert(drawerCss.includes('max-height: 80vh'), 'editor max height')
  assert(drawerCss.includes('translateY(8px)'), 'open motion')
  assert(drawerCss.includes('--modern-motion-base: 240ms'), 'open duration')
  assert(drawerCss.includes('--modern-motion-close: 200ms'), 'close duration')
  assert(!drawerCss.includes('scale('), 'no scale')
  assert(drawer.includes('CENTERED_CLOSE_MS'), 'close delay for motion')
  assert(fields.includes('useWeddingLocationSave'), 'canonical mutation')
  assert(!logistics.includes('WeddingLocationEditor'), 'no forked location form in logistics')
})

run('START and wedding stops share one place hierarchy', () => {
  assert(logistics.includes('function stopPlaceLines'), 'shared hierarchy helper')
  assert(logistics.includes('function LogisticsStopHead'), 'shared stop head')
  assert(logistics.includes("primary: 'Nieuzupełnione'"), 'incomplete copy')
  assert(logistics.includes('styles.place'), 'shared primary class')
  assert(logistics.includes('styles.placeMuted'), 'muted incomplete')
  assert(!logistics.includes('startName'), 'no special start primary class')
  assert(!logistics.includes('startKicker'), 'start uses shared role class')
  assert(!logisticsCss.includes('.startName'), 'no start-only type scale')
  assert(!logisticsCss.includes('.destination {'), 'destination merged into place')
  assert(logisticsCss.includes('.place,'), 'one primary type')
  assert(logisticsCss.includes('grid-template-columns: minmax(0, 1fr) 4.75rem'), 'nav axis')
  assert(logistics.includes('role="Start"'), 'start still labelled Start')
})

console.log('\nmodern wedding logistics: done')
