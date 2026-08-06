/**
 * Landing V3 classic lock / wedding-day simplification acceptance.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LANDING_PRICING } from './data/pricingData'
import { SECURITY_CLAIMS, SECURITY_REJECTED } from './data/securityClaims'
import {
  SECURITY_ANIMATION_DURATION_S,
  SECURITY_RECORDS,
  SECURITY_SHACKLE_RATIO,
} from './data/securityRecords'
import { IMPORT_SPREADSHEET_ROWS } from './data/importDemoData'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const FEATURE = join(ROOT, 'src/features/landing-v3')

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  landing-v3 — ${msg}`)
}

function readAllSources(dir: string): string {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === 'node_modules') continue
      out.push(readAllSources(full))
      continue
    }
    if (/\.(tsx?|css)$/.test(name) && !name.includes('.test.')) {
      out.push(readFileSync(full, 'utf8'))
    }
  }
  return out.join('\n')
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let idx = 0
  while (true) {
    const found = haystack.indexOf(needle, idx)
    if (found === -1) return count
    count += 1
    idx = found + needle.length
  }
}

const router = readFileSync(join(ROOT, 'src/routes/router.tsx'), 'utf8')
assert(router.includes("path: '/landing-v3'"), 'route /landing-v3')
assert(router.includes("path: '/'"), 'production / preserved')
assert(
  !readFileSync(join(ROOT, 'src/pages/LandingPage.tsx'), 'utf8').includes(
    'landing-v3',
  ),
  'production LandingPage untouched',
)

const page = readFileSync(join(FEATURE, 'LandingV3Page.tsx'), 'utf8')
assert(
  page.includes('data-landing-v3-rebuild="classic-lock-day"'),
  'rebuild marker',
)

const mainSlice = page.slice(page.indexOf('<main'))
const order = [
  'Act1Hero',
  'ImportExistingWorkSection',
  'AssignmentOverviewSection',
  'QuestionnairesContractsSection',
  'FinanceSection',
  'QuestionnaireDaySection',
  'MobileWeddingDaySection',
  'SecuritySection',
  'CalendarSection',
  'BriefSection',
  'WeddingsSessionsSection',
  'PricingSection',
  'FaqSection',
  'FinalCtaSection',
]
let last = -1
for (const name of order) {
  const idx = mainSlice.indexOf(`<${name}`)
  assert(idx > last, `section order: ${name}`)
  last = idx
}

assert(
  countOccurrences(page, '<MobileWeddingDaySection') === 1,
  'MobileWeddingDaySection once',
)

for (const rel of [
  'product/SecurityLockAnimation.tsx',
  'product/ProtectedDataAnimation.tsx',
  'product/ProtectedDataSeal.tsx',
  'product/ProtectedDataSeal.module.css',
  'sections/CalendarBriefSection.tsx',
]) {
  assert(!existsSync(join(FEATURE, rel)), `deleted ${rel}`)
}

const sources = readAllSources(FEATURE)
assert(!/\buseScroll\b/.test(sources), 'no useScroll')
assert(!sources.includes('ProtectedDataSeal'), 'ProtectedDataSeal removed')
assert(!sources.includes('lv3-security-replay'), 'no replay control')
assert(!sources.includes('Pokaż animację ponownie'), 'no replay label')
assert(!/\bAI-powered\b/i.test(sources), 'no AI')
assert(!/sztuczna inteligencja/i.test(sources), 'no AI PL')
assert(!/Marcin Hibszer/i.test(sources), 'no real name')

const security = readFileSync(join(FEATURE, 'sections/SecuritySection.tsx'), 'utf8')
assert(security.includes('ClassicDataLock'), 'ClassicDataLock used')
assert(
  security.includes('threshold: mobile ? 0.22 : 0.68') ||
    security.includes('threshold: mobile ? 0.28 : 0.68') ||
    security.includes('threshold: 0.68'),
  '65–70% desktop trigger',
)
assert(security.includes('MobileSecurityArtboard'), 'mobile security artboard')
assert(
  security.includes('heading-copy-artboard-facts'),
  'mobile security order heading→copy→artboard→facts',
)
assert(security.includes('Uwierzytelnianie'), 'mobile security fact labels')
assert(
  security.indexOf('lv3-security-visual') < security.indexOf('lv3-security-copy') ||
    security.includes('securityMobileIntro'),
  'visual before or with structured mobile copy',
)
assert(!security.includes('position: sticky'), 'no sticky security')

const lock = readFileSync(join(FEATURE, 'product/ClassicDataLock.tsx'), 'utf8')
const lockCss = readFileSync(
  join(FEATURE, 'product/ClassicDataLock.module.css'),
  'utf8',
)
assert(lock.includes('data-motion="security-lock"'), 'security motion')
assert(lock.includes('data-lock-shape="classic-vertical"'), 'classic vertical')
assert(lock.includes('SECURITY_ANIMATION_DURATION_S'), 'duration constant')
assert(SECURITY_ANIMATION_DURATION_S >= 3.6, 'duration >= 3.6s')
assert(
  SECURITY_SHACKLE_RATIO >= 0.48 && SECURITY_SHACKLE_RATIO <= 0.54,
  'shackle ratio 0.48–0.54',
)
assert(lock.includes('data-shackle-ratio'), 'shackle ratio attr')
assert(lock.includes('data-keyhole="circle-stem"'), 'keyhole exists')
assert(lock.includes('data-keyhole-part="circle"'), 'keyhole circle')
assert(lock.includes('data-keyhole-part="stem"'), 'keyhole stem')
assert(lock.includes('<svg'), 'svg shackle')
assert(!/\breplay\b/i.test(lock), 'no replay logic')
assert(!lock.includes('setForceOpen'), 'no replay reset')
assert(!lock.includes('SECURITY_LOCK_CATEGORIES'), 'no category table inside lock')
assert(lockCss.includes('clamp(450px') && lockCss.includes('490px'), 'body height')
assert(lockCss.includes('clamp(400px') && lockCss.includes('440px'), 'body width')
assert(SECURITY_RECORDS.length === 6, 'six records')
assert(SECURITY_CLAIMS.length === 4, 'four claims')

const day = readFileSync(
  join(FEATURE, 'sections/QuestionnaireDaySection.tsx'),
  'utf8',
)
assert(day.includes('data-day-timing="calm-confirm"'), 'calm day timing')
assert(day.includes('data-day-status="static"'), 'static status')
assert(day.includes('Dane z ankiety zastosowane'), 'applied status copy')
assert(!day.includes('3 zmiany do zatwierdzenia'), 'no intermediate review state')
assert(!day.includes('zatwierdzone'), 'no old approved intermediate')
assert(!day.includes('data-affected'), 'no row highlight sequence')
assert(day.includes('delay: reduced ? 0 : 2.0'), 'totals last')
assert(day.includes('lv3-day-totals'), 'totals test id')

const calCss = readFileSync(
  join(FEATURE, 'product/CalendarLandingPreview.module.css'),
  'utf8',
)
assert(calCss.includes('max-width: 1080px'), 'calendar max-width constrained')
assert(calCss.includes('min-height: 690px'), 'calendar height floor')
assert(calCss.includes('max-height: 730px'), 'calendar height ceiling')
assert(
  calCss.includes('aspect-ratio: 1.52') || calCss.includes('1.52 / 1'),
  'calendar aspect',
)

const calPreview = readFileSync(
  join(FEATURE, 'product/CalendarLandingPreview.tsx'),
  'utf8',
)
assert(calPreview.includes('data-calendar-layout="full-month"'), 'full-month')
assert((calPreview.match(/day:\s*(null|\d+)/g) ?? []).length === 35, '35 cells')

const importSec = readFileSync(
  join(FEATURE, 'sections/ImportExistingWorkSection.tsx'),
  'utf8',
)
assert(IMPORT_SPREADSHEET_ROWS.length >= 4, 'import rows')

const pricing = readFileSync(join(FEATURE, 'sections/PricingSection.tsx'), 'utf8')
assert(LANDING_PRICING.monthlyPrice === 49, 'monthly 49')
assert(LANDING_PRICING.annualPrice === 490, 'annual 490')
assert(pricing.includes('Okres próbny'), 'trial label')

assert(countOccurrences(sources, 'data-motion="hero"') === 1, 'hero motion')
assert(countOccurrences(sources, 'data-motion="security-lock"') === 1, 'security motion')
assert(
  countOccurrences(sources, 'data-motion="mobile-wedding-day"') === 1,
  'mobile motion once',
)

const mobileSec = readFileSync(
  join(FEATURE, 'sections/MobileWeddingDaySection.tsx'),
  'utf8',
)
const mobileSeq = readFileSync(
  join(FEATURE, 'motion/mobileWeddingDaySequence.ts'),
  'utf8',
)
const mobileHook = readFileSync(
  join(FEATURE, 'hooks/useMobileWeddingDaySequence.ts'),
  'utf8',
)
const mobileSources = readAllSources(join(FEATURE, 'components/mobile'))
const iphone = readFileSync(
  join(FEATURE, 'components/mobile/IPhoneMockup.tsx'),
  'utf8',
)
const iphoneCss = readFileSync(
  join(FEATURE, 'components/mobile/IPhoneMockup.module.css'),
  'utf8',
)
const navPreview = readFileSync(
  join(FEATURE, 'components/mobile/IPhoneNavigationPreview.tsx'),
  'utf8',
)
const navCss = readFileSync(
  join(FEATURE, 'components/mobile/IPhoneNavigationPreview.module.css'),
  'utf8',
)
const routeMap = readFileSync(
  join(FEATURE, 'components/mobile/MobileRouteMap.tsx'),
  'utf8',
)
const routeMapCss = readFileSync(
  join(FEATURE, 'components/mobile/MobileRouteMap.module.css'),
  'utf8',
)

assert(mobileSec.includes('Wszystko pod ręką.'), 'mobile heading')
assert(mobileSec.includes('Nawet w dniu ślubu.'), 'mobile heading line 2')
assert(
  mobileSec.includes(
    'Plan dnia, kontakty, lokalizacje i brief masz zawsze przy sobie',
  ),
  'mobile support copy',
)
assert(!/rozliczenia/i.test(mobileSec), 'support copy omits rozliczenia')
assert(mobileSec.includes('lv3-mobile-benefits'), 'benefits outside animation')
assert(mobileSec.includes('Mobilny widok'), 'responsive web wording')
assert(mobileSec.includes('przeglądarce telefonu'), 'browser phone wording')
assert(mobileSec.includes('data-demo-oneshot="true"'), 'oneshot marker')
assert(mobileSec.includes('data-final-state="brief"'), 'final brief persists')
assert(mobileSec.includes('IPhoneMockup'), 'uses IPhoneMockup')
assert(mobileSec.includes('IPhoneNavigationPreview'), 'uses nav preview')
assert(mobileSec.includes('MobileBriefView'), 'uses MobileBriefView')
assert(
  mobileSec.includes(
    'Mobilny widok OurWed pokazuje plan dnia, prowadzi z Apartamentów Stary Rynek do Hotelu Liberté',
  ),
  'accessible description',
)
assert(!/App Store|Google Play|native app|aplikacj[aę] natywn/i.test(mobileSec), 'no store/native claims')
assert(!/\buseScroll\b/.test(mobileSec + mobileHook + mobileSeq), 'no useScroll')
assert(!/maps\.google|googleapis\.com\/maps|<iframe/i.test(mobileSources + mobileSec), 'no maps SDK/iframe')

assert(!existsSync(join(FEATURE, 'components/mobile/MobileDeviceFrame.tsx')), 'old device frame deleted')
assert(!existsSync(join(FEATURE, 'components/mobile/MobileNavigationHandoff.tsx')), 'old handoff deleted')
assert(!existsSync(join(FEATURE, 'components/mobile/MobileRoutePreview.tsx')), 'old route preview deleted')
assert(existsSync(join(FEATURE, 'data/mobileWeddingDayDemo.ts')), 'shared mobile demo data')
assert(existsSync(join(FEATURE, 'components/mobile/MobileBriefView.tsx')), 'MobileBriefView exists')
assert(!mobileSeq.includes("'itinerary'"), 'no primary itinerary phase')
assert(!mobileSeq.includes("'complete'"), 'no complete phase')
assert(!mobileSeq.includes("'returning'"), 'no returning phase token')
assert(mobileSeq.includes("'assignReturn'"), 'assignment return phase')
assert(mobileSeq.includes("'briefReveal'"), 'brief reveal phase')
assert(mobileSeq.includes('briefProgress'), 'brief progress in snapshot')
assert(mobileSeq.includes('doneAt: 12.5'), 'brief final hold timing')
assert(!mobileHook.includes('allowLoop'), 'no soft loop')
assert(!/replay|Pokaż ponownie/i.test(mobileSec), 'no replay control')

const mobileDemo = readFileSync(
  join(FEATURE, 'data/mobileWeddingDayDemo.ts'),
  'utf8',
)
const briefView = readFileSync(
  join(FEATURE, 'components/mobile/MobileBriefView.tsx'),
  'utf8',
)
assert(mobileDemo.includes('mobileWeddingDayDemo'), 'shared demo object')
assert(mobileDemo.includes('getMobileNavigationLeg'), 'nav leg derivation')
assert(mobileDemo.includes('getMobileBriefContent'), 'brief derivation')
assert(mobileDemo.includes("location: 'Apartamenty Stary Rynek'"), 'origin location')
assert(mobileDemo.includes("location: 'Hotel Liberté'"), 'destination location')
assert(mobileDemo.includes('durationMinutes: 21'), 'nav duration 21')
assert(mobileDemo.includes('distanceKm: 16'), 'nav distance 16')
assert(mobileDemo.includes("fromLabel: 'z Apartamentów Stary Rynek'"), 'from label')
assert(mobileDemo.includes("navigationDestinationStopId: 'bride-preparations'"), 'nav destination stop')
assert(!mobileDemo.includes('41 min'), 'old 41 min removed')
assert(!mobileDemo.includes('46 km'), 'old 46 km removed')
assert(!mobileSources.includes('41 min'), 'no stale 41 min in mobile UI')
assert(!mobileSources.includes('46 km'), 'no stale 46 km in mobile UI')
assert(
  !mobileSources.includes("to: 'Folwark Wąsowo'") &&
    !mobileDemo.includes("to: 'Folwark Wąsowo'"),
  'Folwark not nav destination',
)
assert(briefView.includes('data-mobile-screen="brief"'), 'brief screen layer')
assert(briefView.includes('data-brief-section="contacts"'), 'brief contacts')
assert(briefView.includes('data-brief-section="shots"'), 'brief shot list')
assert(briefView.includes('getMobileBriefContent'), 'brief uses shared content')
assert(mobileDemo.includes("label: 'Pierwszy taniec'"), 'first dance')
assert(mobileDemo.includes("time: '20:15'"), 'first dance time')
assert(!briefView.includes('500 ') && !briefView.includes('tel:'), 'brief contacts without phone numbers')
assert(mobileSeq.includes('REDUCED_MOTION_SNAPSHOT'), 'reduced motion snapshot')
assert(mobileSeq.includes('briefProgress: 1'), 'reduced motion ends on brief')

assert(iphone.includes('data-device-ratio={IPHONE_DEVICE_RATIO.token}'), 'ratio token attr')
assert(mobileSeq.includes("token: '393:852'"), 'ratio 393:852')
assert(iphoneCss.includes('aspect-ratio: 393 / 852'), 'css aspect-ratio')
assert(!iphoneCss.includes('aspect-ratio: 390 / 844'), 'old 390:844 removed')
assert(/\.body\s*\{[^}]*aspect-ratio: 393 \/ 852/.test(iphoneCss), 'body uses aspect-ratio')
assert(!/\.body\s*\{[^}]*\bheight\s*:/.test(iphoneCss), 'no conflicting body height')
assert(iphoneCss.includes('clamp(410px, 26vw, 430px)'), 'primary width clamp')
assert(iphoneCss.includes('clamp(350px, 22vw, 365px)'), 'secondary width clamp')
assert(iphoneCss.includes('clamp(238px, 64vw, 258px)'), 'mobile primary width')
assert(iphoneCss.includes('clamp(184px, 50vw, 202px)'), 'mobile secondary width')
assert(iphone.includes('data-phone-layers="body-bezel-display"'), 'body/bezel/display')
assert(iphone.includes('data-phone-layer="body"'), 'body layer')
assert(iphone.includes('data-phone-layer="bezel"'), 'bezel layer')
assert(iphone.includes('data-phone-layer="display"'), 'display layer')
assert(iphone.includes('phoneDisplayMask'), 'display mask class')
assert(iphoneCss.includes('overflow: hidden'), 'mask overflow hidden')
assert(iphoneCss.includes('contain: paint'), 'mask contain paint')
assert(iphoneCss.includes('isolation: isolate'), 'mask isolation')
assert(iphoneCss.includes('border-radius: clamp(48px'), 'body radius 48–52')
assert(iphoneCss.includes('border-radius: clamp(40px'), 'display radius 40–43')
assert(iphoneCss.includes('padding: 3.5px'), 'physical edge 3–4px')
assert(iphoneCss.includes('padding: 5.5px'), 'bezel 5–6px')
assert(
  1 - (3.5 * 2 + 5.5 * 2) / 420 >= 0.92,
  'display ≥92% body width at 420',
)
assert(iphoneCss.includes('clamp(108px, 26%, 116px)'), 'island width')
assert(iphoneCss.includes('height: 31px'), 'island height')
assert(!iphoneCss.includes('transition:') || !iphoneCss.match(/\.phoneDisplayMask[\s\S]*?transition:/), 'mask radius not animated')

assert(mobileSeq.includes('IPHONE_PERSPECTIVE'), 'perspective constants')
assert(mobileSeq.includes('rotateZ: 0.4'), 'primary rotateZ')
assert(mobileSeq.includes('rotateY: -0.8'), 'primary rotateY')
assert(mobileSeq.includes('rotateZ: -2.8'), 'secondary rotateZ')
assert(mobileSeq.includes('rotateY: 1.2'), 'secondary rotateY')

assert(mobileSources.includes('data-screen-layer="assignment"'), 'assignment layer')
assert(mobileSources.includes('data-screen-layer="chooser"'), 'chooser layer')
assert(mobileSources.includes('data-screen-layer="navigation"'), 'navigation layer')
assert(mobileSources.includes('data-screen-layer="brief"'), 'brief layer')
assert(mobileSources.includes('data-mobile-screen="itinerary"'), 'secondary itinerary')
assert(mobileSec.includes('<MobileItineraryView />'), 'static itinerary')
assert(mobileSec.indexOf('IPhoneMockup') < mobileSec.indexOf('MobileAssignmentView'), 'layers inside mockup children')

assert(existsSync(join(FEATURE, 'components/mobile/MobileRouteMap.tsx')), 'MobileRouteMap exists')
assert(navPreview.includes('MobileRouteMap'), 'nav uses MobileRouteMap')
assert(!navPreview.includes('<svg'), 'old inline map svg removed from nav preview')
assert(routeMap.includes('data-route-curved="true"'), 'curved route')
assert(routeMap.includes('data-route-stroke="thin-blue"'), 'thin blue route')
assert(routeMap.includes('data-map-svg="intentional"'), 'intentional map svg')
assert(routeMap.includes('data-map-component="MobileRouteMap"'), 'map component marker')
assert(routeMap.includes('viewBox={b.viewBox}'), 'uses bounds viewBox')
assert(mobileSeq.includes("viewBox: '0 0 360 430'"), 'map viewBox 0 0 360 430')
assert(routeMapCss.includes('stroke: #2f6fed'), 'blue route color')
assert(routeMapCss.includes('stroke-width: 4.8'), 'route stroke ≤5.5')
assert(!/stroke-width:\s*(?:[6-9]|1\d)/.test(routeMapCss), 'no oversized route stroke')
assert(mobileDemo.includes("location: 'Apartamenty Stary Rynek'"), 'start label source')
assert(mobileDemo.includes("location: 'Hotel Liberté'"), 'end label source')
assert(routeMap.includes('data-route-label="start"'), 'start label node')
assert(routeMap.includes('data-route-label="end"'), 'end label node')
assert(navPreview.includes('data-nav-status'), 'nav status')
assert(mobileDemo.includes('Otwieranie w Google Maps'), 'opening status')
assert(mobileDemo.includes('Nawigacja otwarta'), 'opened status')
assert(!routeMap.includes('Array.from'), 'no procedural roads')
assert(routeMap.includes('data-road-tier="main"'), 'main road tier')
assert(routeMap.includes('data-road-tier="local"'), 'local road tier')
assert(routeMap.includes('175 118'), 'route has horizontal first leg')
assert(routeMap.includes('210 188'), 'route turns downward')
assert(routeMap.includes('292 328'), 'route ends at destination')
assert(routeMap.includes('188 275'), 'route has mid bend')
assert(routeMap.includes('250 322'), 'route has final approach bend')
assert(!routeMap.includes('clip-path') && !routeMapCss.includes('text-overflow'), 'no clipped label styles')

const mapBounds = {
  safe: { xMin: 24, xMax: 336, yMin: 28, yMax: 392 },
  start: { x: 72, y: 96 },
  end: { x: 292, y: 328 },
}
assert(mobileSeq.includes('xMin: 24') && mobileSeq.includes('xMax: 336'), 'safe x bounds')
assert(mobileSeq.includes('yMin: 28') && mobileSeq.includes('yMax: 392'), 'safe y bounds')
assert(
  mapBounds.start.x >= mapBounds.safe.xMin &&
    mapBounds.start.x <= mapBounds.safe.xMax &&
    mapBounds.start.y >= mapBounds.safe.yMin &&
    mapBounds.start.y <= mapBounds.safe.yMax,
  'start inside safe area',
)
assert(
  mapBounds.end.x >= mapBounds.safe.xMin &&
    mapBounds.end.x <= mapBounds.safe.xMax &&
    mapBounds.end.y >= mapBounds.safe.yMin &&
    mapBounds.end.y <= mapBounds.safe.yMax,
  'end inside safe area',
)
assert(mobileSeq.includes('strokeMax: 5.5'), 'stroke max constant')
assert(navCss.includes('max-height: 62%'), 'map height capped')
assert(navCss.includes('padding:') && navCss.includes('1.85rem'), 'route card home-indicator spacing')

assert(mobileSeq.includes('getMobileNavigationLeg'), 'route summary from shared demo')
assert(mobileSec.includes('benefitIndex'), 'numbered benefit rows')
assert(mobileSeq.includes("index: '01'"), 'benefit 01')
assert(mobileSeq.includes("index: '02'"), 'benefit 02')
assert(mobileSeq.includes("index: '03'"), 'benefit 03')
assert(mobileSeq.includes("index: '04'"), 'benefit 04')
assert(mobileSeq.includes("'done'"), 'final persistent state')
assert(!mobileSeq.includes('toastVisible'), 'no toast return')

assert(existsSync(join(FEATURE, 'components/MobileScaledStage.tsx')), 'MobileScaledStage exists')
assert(existsSync(join(FEATURE, 'hooks/useLandingViewportMode.ts')), 'viewport mode hook')
assert(existsSync(join(FEATURE, 'hooks/useMobileSectionActivation.ts')), 'mobile activation hook')
assert(existsSync(join(FEATURE, 'components/MobileRevealAnchor.tsx')), 'MobileRevealAnchor exists')
assert(
  existsSync(join(FEATURE, 'components/mobile-artboards/MobileImportArtboard.tsx')),
  'import mobile artboard',
)
assert(
  existsSync(join(FEATURE, 'components/mobile-artboards/MobileAssignmentArtboard.tsx')),
  'assignment mobile artboard',
)
assert(
  existsSync(join(FEATURE, 'components/mobile-artboards/MobileQcArtboard.tsx')),
  'qc mobile artboard',
)
assert(
  existsSync(join(FEATURE, 'components/mobile-artboards/MobileFinanceArtboard.tsx')),
  'finance mobile artboard',
)
assert(
  existsSync(join(FEATURE, 'components/mobile-artboards/MobileSecurityArtboard.tsx')),
  'security mobile artboard',
)
assert(
  existsSync(join(FEATURE, 'components/mobile-artboards/MobileCalendarArtboard.tsx')),
  'calendar mobile artboard',
)
assert(
  existsSync(join(FEATURE, 'components/mobile-artboards/MobileBriefArtboard.tsx')),
  'brief mobile artboard',
)
assert(
  existsSync(join(FEATURE, 'components/mobile-artboards/MobileDayArtboard.tsx')),
  'day mobile artboard',
)
assert(
  existsSync(join(FEATURE, 'components/mobile-artboards/MobileSessionsArtboard.tsx')),
  'sessions mobile artboard',
)
assert(
  existsSync(join(FEATURE, 'components/mobile-artboards/MobilePricingArtboard.tsx')),
  'pricing mobile artboard',
)

const importArt = readFileSync(
  join(FEATURE, 'components/mobile-artboards/MobileImportArtboard.tsx'),
  'utf8',
)
assert(importArt.includes('slice(0, 3)'), 'import shows max 3 rows')
assert(importArt.includes('Gotowe do zatwierdzenia'), 'import result status')
assert(importArt.includes('data-dominant="true"'), 'import dominant result')
assert(importArt.includes('importPreviews'), 'import source pair')

const assignArt = readFileSync(
  join(FEATURE, 'components/mobile-artboards/MobileAssignmentArtboard.tsx'),
  'utf8',
)
assert(assignArt.includes('assignHub'), 'assignment central hub')
assert(assignArt.includes('assignGrid'), 'assignment module grid')
assert(assignArt.includes('assignConnectors'), 'assignment connectors')
assert((assignArt.match(/title: '/g) || []).length >= 6, 'six assignment modules')

const qcArt = readFileSync(
  join(FEATURE, 'components/mobile-artboards/MobileQcArtboard.tsx'),
  'utf8',
)
assert(qcArt.includes('data-surface="questionnaire"'), 'qc questionnaire surface')
assert(qcArt.includes('data-surface="contract"'), 'qc contract surface')
assert(qcArt.includes('data-surface-w="200"'), 'qc form width ~200')
assert(qcArt.includes('data-surface-w="224"'), 'qc doc width ~224')
assert(qcArt.includes('data-composition="qc-overlap"'), 'qc overlap composition')
assert(qcArt.includes('Adrian Nowak'), 'qc partner Adrian Nowak')
assert(qcArt.includes('MAP'), 'qc mapping chips')
assert(importArt.includes('importDocSurface'), 'import real document surface')

const mobileCss = readFileSync(
  join(FEATURE, 'components/mobile-artboards/mobileArtboard.module.css'),
  'utf8',
)
const mobileWeddingCss = readFileSync(
  join(FEATURE, 'sections/MobileWeddingDaySection.module.css'),
  'utf8',
)
assert(mobileCss.includes('min-height: 570px') || mobileCss.includes('570px'), 'import min height scale')
assert(mobileCss.includes('height: 660px') || mobileCss.includes('min-height: 640px'), 'qc tall artboard')
assert(mobileWeddingCss.includes('2.5rem'), 'phone copy gap')
assert(mobileWeddingCss.includes('1.6rem'), 'benefit proximity')

const secArt = readFileSync(
  join(FEATURE, 'components/mobile-artboards/MobileSecurityArtboard.tsx'),
  'utf8',
)
assert(secArt.includes('SECURITY_RECORDS.slice(0, 4)'), 'security records immediate')
assert(secArt.includes('data-anim-duration="1.75"'), 'security ≤1.8s')
assert(secArt.includes('START'), 'security start positions visible')
assert(secArt.includes('Dane zabezpieczone'), 'security status label')

const finArt = readFileSync(
  join(FEATURE, 'components/mobile-artboards/MobileFinanceArtboard.tsx'),
  'utf8',
)
assert(finArt.includes('finRow2'), 'finance bento row2')
assert(finArt.includes('finSeason'), 'finance season panel')
assert(finArt.includes('Wpłacono'), 'finance paid card')

const dayArt = readFileSync(
  join(FEATURE, 'components/mobile-artboards/MobileDayArtboard.tsx'),
  'utf8',
)
assert(dayArt.includes('data-surface="questionnaire"'), 'day questionnaire surface')
assert(dayArt.includes('data-surface="itinerary"'), 'day itinerary surface')
assert(dayArt.includes('Zastosowano odpowiedzi'), 'day applied status')

const briefArt = readFileSync(
  join(FEATURE, 'components/mobile-artboards/MobileBriefArtboard.tsx'),
  'utf8',
)
assert(briefArt.includes('data-brief-layer="rear"'), 'brief rear page')
assert(briefArt.includes('data-brief-layer="primary"'), 'brief primary page')

const sessionsArt = readFileSync(
  join(FEATURE, 'components/mobile-artboards/MobileSessionsArtboard.tsx'),
  'utf8',
)
assert(sessionsArt.includes('sessionWedding'), 'sessions wedding dominant')
assert(sessionsArt.includes('sessionSession'), 'sessions session card')

const calArt = readFileSync(
  join(FEATURE, 'components/mobile-artboards/MobileCalendarArtboard.tsx'),
  'utf8',
)
assert(calArt.includes('Czerwiec 2027'), 'calendar full month')
assert(calArt.includes('Google Calendar'), 'calendar google integration')
assert(calArt.includes('Apple Calendar'), 'calendar apple integration')

assert(
  existsSync(join(ROOT, 'docs/landing-v3-mobile-parity.md')),
  'parity specification exists',
)
assert(
  readFileSync(join(ROOT, 'docs/landing-v3-mobile-parity.md'), 'utf8').includes(
    'Desktop ↔ Mobile Parity',
  ),
  'parity doc titled',
)

const stageSrc = readFileSync(join(FEATURE, 'components/MobileScaledStage.tsx'), 'utf8')
const stageCss = readFileSync(join(FEATURE, 'components/MobileScaledStage.module.css'), 'utf8')
assert(stageSrc.includes('baseHeight * scale'), 'stage exact outer height')
assert(stageSrc.includes('fallbackDelayMs'), 'stage fallback')
assert(stageCss.includes('transform-origin: top center'), 'stage CSS origin')
assert(!stageCss.includes('zoom:'), 'no CSS zoom')

assert(importSec.includes('MobileImportArtboard'), 'import mounts mobile artboard')
assert(importSec.includes('isMobileLandingMode'), 'import variant isolation')
assert(readFileSync(join(FEATURE, 'sections/FinanceSection.tsx'), 'utf8').includes('MobileFinanceArtboard'), 'finance mounts mobile')
assert(readFileSync(join(FEATURE, 'sections/SecuritySection.tsx'), 'utf8').includes('MobileSecurityArtboard'), 'security mounts mobile')
assert(readFileSync(join(FEATURE, 'sections/AssignmentOverviewSection.tsx'), 'utf8').includes('MobileAssignmentArtboard'), 'assignment mounts mobile')
assert(readFileSync(join(FEATURE, 'sections/PricingSection.tsx'), 'utf8').includes('MobilePricingArtboard'), 'pricing mounts mobile')
assert(iphoneCss.includes('238px'), 'mobile primary phone width')
assert(iphoneCss.includes('184px'), 'mobile secondary phone width')
assert(mobileSeq.includes('doneAt: 6.4'), 'mobile simple doneAt 6.4')
assert(readFileSync(join(FEATURE, 'hooks/useSectionReveal.ts'), 'utf8').includes('effectiveThreshold'), 'tall-section adaptive reveal')
assert(iphoneCss.includes('perspective: none'), 'mobile perspective flattened')
assert(mobileSec.includes('useLandingViewportMode'), 'section uses viewport mode')
assert(mobileSec.includes('0.8'), 'phone requires 80% primary visible')
assert(briefView.includes('compact'), 'brief supports compact layout')

const marketing = [page, security, day, pricing, importSec, mobileSec].join('\n')
for (const rejected of SECURITY_REJECTED) {
  assert(
    !new RegExp(rejected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(marketing),
    `no unsupported claim: ${rejected}`,
  )
}

console.log('PASS  landing-v3')
