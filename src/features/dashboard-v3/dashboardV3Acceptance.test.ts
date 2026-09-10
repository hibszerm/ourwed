/**
 * Experimental Dashboard V4.1.5 — Graphite composition polish. Presentation-only.
 * Run: npm run test:dashboard-v3
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveActiveShellPresentation } from '@/layouts/shellPresentation'

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

{
  const page = read('src/pages/DashboardPage.tsx')
  const primaryIdx = page.indexOf('<div className={styles.primary}>')
  const todoIdx = page.indexOf('<TodoTodayCard weddings={weddings} />')
  const deadlineIdx = page.indexOf('<NearestDeliveryDeadlineCard')
  const secondaryIdx = page.indexOf('<div className={styles.secondary}>')
  const notificationsIdx = page.indexOf('<NotificationsCard />')
  assert(primaryIdx >= 0 && secondaryIdx > primaryIdx, 'current grid columns')
  assert(todoIdx > primaryIdx && todoIdx < secondaryIdx, 'Today still left')
  assert(deadlineIdx > todoIdx && deadlineIdx < secondaryIdx, 'deadlines still left')
  assert(notificationsIdx > secondaryIdx, 'notifications still right')
  assert(!page.includes('width="full"'), 'current dashboard keeps default container')
  assert(!page.includes('DashboardV3Page'), 'current page is not V3')
  assert(!page.includes('dashboard-v3'), 'current page has no V3 route wiring')
  assert(!page.includes('useWeddings'), 'current still no heavy useWeddings')
  assert(!page.includes('workflowStage'), 'current not stage-driven')
  assert(!page.includes('DashboardV3Hero'), 'production does not use V3 hero')
  assert(!page.includes('backdrop-filter'), 'production page has no glass')
  assert(!page.includes('data-shell'), 'production dashboard does not set V3 shell')
  console.log('PASS  /dashboard composition frozen')
}

{
  const router = read('src/routes/router.tsx')
  const routePage = read('src/pages/DashboardRoutePage.tsx')
  assert(router.includes('DashboardRoutePage'), 'product dashboard is preference-resolved')
  assert(router.includes('@/pages/DashboardRoutePage'), 'resolver import')
  assert(routePage.includes('<DashboardPage />'), 'classic presentation remains reachable')
  assert(routePage.includes('<DashboardV3Page />'), 'modern presentation remains reachable')
  assert(routePage.includes("resolveScreenPresentation('dashboard'"), 'dashboard screen registry')
  assert(!routePage.includes('useDashboardAssignments'), 'resolver does not fork dashboard data')
  assert(router.includes("path: '/dashboard-v3'"), 'legacy v3 path still registered')
  assert(!router.includes('@/pages/DashboardV3Page'), 'v3 is not a separate lazy product route')
  assert(!router.includes('DashboardV2Page'), 'V2 page remains unmounted')
  const v2 = router.indexOf("path: '/dashboard-v2'")
  const v2Chunk = router.slice(v2, v2 + 180)
  assert(v2Chunk.includes('Navigate'), 'v2 still redirects')
  assert(v2Chunk.includes('to="/dashboard"'), 'v2 still targets production Pulpit')
  const dashIdx = router.indexOf("path: '/dashboard'")
  const v3Idx = router.indexOf("path: '/dashboard-v3'")
  assert(dashIdx >= 0 && v3Idx > dashIdx, 'legacy v3 path remains a sibling')
  const v3Chunk = router.slice(v3Idx, v3Idx + 220)
  assert(v3Chunk.includes('Navigate'), 'legacy v3 redirects to product Pulpit')
  assert(v3Chunk.includes('to="/dashboard"'), 'legacy v3 targets /dashboard')
  assert(!router.includes("handle: { shell: 'v3' }"), 'modern shell is not a permanent extra route')
  const dashRoute = router.slice(
    router.indexOf("path: '/dashboard'"),
    router.indexOf("path: '/dashboard-v3'"),
  )
  assert(!dashRoute.includes("shell: 'v3'"), 'production dashboard route has no hardcoded v3 shell')
  console.log('PASS  routing: preference-driven dashboard, v2/v3 retirement preserved')
}

{
  const sidebar = read('src/layouts/Sidebar.tsx')
  assert(sidebar.includes("to: '/dashboard'"), 'Pulpit still /dashboard')
  assert(sidebar.includes("label: 'Pulpit'"), 'Pulpit label')
  assert(!sidebar.includes('dashboard-v3'), 'V3 not in sidebar')
  assert(!sidebar.includes('Pulpit V3'), 'no permanent V3 nav')
  assert(sidebar.includes('presentation'), 'optional shell presentation prop')
  assert(!sidebar.includes("to: '/dashboard-v3'"), 'no extra V3 nav destination')
  console.log('PASS  sidebar unchanged')
}

{
  const v3 = read('src/pages/DashboardV3Page.tsx')
  assert(v3.includes('width="full"'), 'V3 uses full PageContainer, not 1120 default')
  assert(v3.includes('useDashboardAssignments'), 'shared assignment hook')
  assert(v3.includes('DashboardV3Hero'), 'v3 hero presentation')
  assert(v3.includes('DashboardV3TodayPanel'), 'v3 today presentation')
  assert(v3.includes('DashboardV3DeadlinePanel'), 'v3 deadline presentation')
  assert(v3.includes('DashboardV3UpcomingAssignments'), 'v3 upcoming presentation')
  assert(v3.includes('DashboardV3NotificationsPanel'), 'v3 notifications presentation')
  assert(v3.includes('DashboardV3InquiriesPanel'), 'v3 inquiries presentation')
  assert(v3.includes('DashboardV3Header'), 'v3 header presentation')
  assert(v3.includes('buildAssignmentEvents'), 'same assignment projection')
  assert(v3.includes('getNearestUpcomingAssignment'), 'same nearest helper')
  assert(v3.includes('getNextAssignmentsAfterNearest'), 'same next-three helper')
  assert(!v3.includes('TodoTodayCard'), 'does not reuse production Today card')
  assert(!v3.includes('NotificationsCard'), 'does not reuse production notifications card')
  assert(!v3.includes('PendingWeddingsCard'), 'does not reuse production inquiries card')
  assert(!v3.includes('NextAssignmentCard'), 'does not reuse production hero card')
  assert(!v3.includes('NextAssignmentsSection'), 'does not reuse production upcoming')
  assert(!v3.includes('DashboardHero'), 'does not reuse production greeting header')
  assert(!v3.includes('NearestDeliveryDeadlineCard'), 'does not reuse D3.3 panel')
  assert(!v3.includes('useWeddings'), 'no heavy useWeddings')
  assert(!v3.includes('useSessions'), 'no full useSessions')
  assert(!v3.includes('weddingService'), 'no weddingService')
  assert(!v3.includes('finalizeWedding'), 'no finalize hydrate')
  assert(!v3.includes('workflowStage'), 'no workflowStage')
  assert(!v3.includes('resolveWeddingNextAction'), 'no Next Action')
  assert(!v3.includes('buildDashboardV2Model'), 'does not revive V2 model')
  assert(!v3.includes('variant="v3"'), 'no variant=v3 on production components')
  assert(!v3.includes('variant="glass"'), 'no glass variant props')
  console.log('PASS  V3.2 isolated presentation, shared data hooks')
}

{
  const v3 = read('src/pages/DashboardV3Page.tsx')
  const heroIdx = v3.indexOf('className={styles.hero}')
  const todayIdx = v3.indexOf('className={styles.today}')
  const deadlineSlotIdx = v3.indexOf('className={styles.deadlines}')
  const upcomingIdx = v3.indexOf('className={styles.upcoming}')
  const feedIdx = v3.indexOf('className={styles.feed}')
  const todayPanelIdx = v3.indexOf('<DashboardV3TodayPanel weddings={weddings} />')
  const deadlineIdx = v3.indexOf('<DashboardV3DeadlinePanel')
  const notificationsIdx = v3.indexOf('<DashboardV3NotificationsPanel />')
  const inquiriesIdx = v3.indexOf('<DashboardV3InquiriesPanel />')
  assert(heroIdx >= 0 && todayIdx > heroIdx, 'hero then today in source')
  assert(deadlineSlotIdx > todayIdx, 'deadlines after today in source')
  assert(upcomingIdx > deadlineSlotIdx, 'upcoming after deadlines in source')
  assert(feedIdx > upcomingIdx, 'activity feed after upcoming in source')
  assert(todayPanelIdx > todayIdx && todayPanelIdx < deadlineSlotIdx, 'Today in today slot')
  assert(deadlineIdx > deadlineSlotIdx && deadlineIdx < upcomingIdx, 'deadlines in deadline slot')
  assert(notificationsIdx > feedIdx, 'notifications in feed')
  assert(inquiriesIdx > notificationsIdx, 'inquiries after notifications')
  console.log('PASS  V3.2 source order: hero → today → deadlines → upcoming → notifications → inquiries')
}

{
  const css = read('src/pages/DashboardV3Page.module.css')
  const materials = read('src/features/dashboard-v3/v3Materials.css')
  assert(css.includes('max-width: 1480px'), 'V3.2 canvas wider than V1 1120px')
  assert(
    css.includes('minmax(0, 1.72fr) minmax(340px, 0.86fr)'),
    'asymmetric main + operational rail',
  )
  assert(css.includes("'hero hero'"), 'hero spans full canvas')
  assert(css.includes("'upcomingLabel .'"), 'upcoming title sits above cards only')
  assert(css.includes("'upcoming today'"), 'upcoming cards share a row with Today')
  assert(css.includes("'feed deadlines'"), 'activity beside deadlines')
  assert(css.includes("'feed today'"), 'nearest-only collapses to feed/today')
  assert(css.includes(".layout[data-has-upcoming='false']"), 'content-driven nearest-only areas')
  assert(css.includes('align-items: start'), 'feed and deadlines do not equalize height')
  assert(!css.includes('align-items: stretch'), 'page grid does not mosaic every cell to equal height')
  assert(css.includes('@media (min-width: 1280px)'), 'desktop upcoming/today share one row height')
  assert(css.includes('align-self: stretch'), 'upcoming and today fill their shared desktop row')
  assert(
    css.includes(".layout[data-has-upcoming='true'] .upcoming"),
    'desktop stretch gated on upcoming presence',
  )
  assert(!css.includes('2.2fr'), 'old V3.1 2.2fr grid not preserved')
  assert(!css.includes("'upcoming rail'"), 'old upcoming/rail area retired')
  assert(!css.includes("'lower rail'"), 'old lower/rail area retired')
  assert(css.includes('@media (max-width: 1279px)'), 'tablet modular simplify')
  assert(css.includes("'today deadlines'"), 'tablet operational pair')
  assert(css.includes('@media (max-width: 767px)'), 'mobile collapse')
  assert(css.includes('.upcomingBand'), 'upcoming label+cards share a presentation band')
  assert(css.includes('display: contents'), 'desktop upcomingBand/feed flatten into the grid')
  assert(css.includes('prefers-reduced-motion'), 'reduced motion respected')
  assert(!css.includes('overflow-x: auto'), 'no horizontal scroll pattern')
  assert(materials.includes('.v3MaterialSatin'), 'shared satin primitive')
  assert(materials.includes('.v3MaterialSatinFlat'), 'flat satin primitive')
  assert(materials.includes('.v3MaterialHero'), 'shared hero primitive')
  assert(materials.includes('.v3MaterialOverlay'), 'overlay primitive')
  assert(!materials.includes('.v3MaterialWell'), 'hero countdown well retired')
  assert(materials.includes('.v3MaterialDarkGlass'), 'shared nav primitive')
  assert(materials.includes('.v3MaterialOperational'), 'operational tray primitive')
  assert(materials.includes('.v3MaterialSupporting'), 'supporting paper primitive')
  assert(materials.includes('.v3MaterialSecondaryCard'), 'appointment card primitive')
  assert(!materials.includes('.v3MaterialOperationalLens'), 'operational lens retired')
  assert(!materials.includes('.v3MaterialOperationalGlass'), 'operational glass retired')
  assert(materials.includes('--v3-shadow-1'), 'level 1 depth token')
  assert(materials.includes('--v3-shadow-2'), 'level 2 depth token')
  assert(!materials.includes('--v3-shadow-hero'), 'no hero multi-shadow stack')
  assert(!materials.includes('--v3-shadow-operational'), 'no operational multi-shadow stack')
  assert(!materials.includes('--v3-shadow-hover'), 'no hover material stack')
  assert(!materials.includes('--v3-shadow-inset'), 'no inset capsule stack')
  assert(!materials.includes('--v3-shadow-dark'), 'no dark halo token')
  assert(!materials.includes('--v3-inner-top'), 'no four-direction inner rim tokens')
  assert(!materials.includes('--v3-inner-bottom'), 'no inner bottom rim token')
  assert(!materials.includes('--v3-surface-glass'), 'no operational glass fill token')
  assert(materials.includes('--v3-surface-satin'), 'satin surface token')
  assert(materials.includes('--v3-surface-hero'), 'hero slab token')
  assert(!materials.includes('blur(28px)'), 'operational 28px blur removed')
  assert(!materials.includes('blur(32px)'), 'sidebar 32px blur removed')
  assert(!materials.includes('mask-image'), 'masked sheen removed')
  assert(!materials.includes('border-top-color'), 'no per-side material borders')
  assert(!materials.includes('.v3MaterialGlass::'), 'no glass pseudo optical layers')
  assert(materials.includes('--v3-environment'), 'environment material token')
  assert(materials.includes('--v3-bg-base'), 'legacy environment alias remains')
  assert(
    /--v3-environment:\s*var\(--app-background\)/.test(materials),
    'environment is native theme workspace paper',
  )
  assert(
    !/--v3-environment:[^;]*--sidebar-background/.test(materials),
    'environment does not mix nav pigment into the floor',
  )
  assert(/--v3-surface-supporting:\s*color-mix\(in srgb,\s*var\(--surface-primary\)/.test(materials), 'supporting paper sits close to hero primary')
  assert(/--v3-surface-satin:\s*var\(--v3-surface-supporting\)/.test(materials), 'satin aliases supporting paper')
  assert(/--v3-surface-hero:\s*var\(--surface-primary\)/.test(materials), 'hero is the theme primary surface')
  assert(!/--v3-surface-hero:\s*color-mix/.test(materials), 'hero fill is not a color-mix of light tokens')
  assert(!/--v3-surface-satin:\s*color-mix/.test(materials), 'satin fill is not a color-mix of light tokens')
  assert(!/--v3-surface-hero:[^;]*--text-inverse/.test(materials), 'hero fill is not bleached toward inverse')
  assert(!materials.includes('--v3-bg-light'), 'environment wash token retired')
  assert(materials.includes('var(--text-inverse)'), 'inverse remains for a quiet hero highlight only')
  assert(materials.includes('var(--text-primary)'), 'tints/shadows derive from theme text')
  assert(materials.includes('var(--border-default)'), 'borders derive from theme border')
  assert(materials.includes('var(--border-subtle)'), 'quiet borders derive from theme subtle border')
  assert(!materials.includes('--v3-well-recess'), 'countdown well recess retired')
  assert(!materials.includes('#eae4da'), 'limestone environment removed')
  assert(!materials.includes('#f3eee6'), 'limestone satin removed')
  assert(!materials.includes('#fcfaf6'), 'limestone hero removed')
  assert(!materials.includes('#d2c8b8'), 'muddy taupe floor removed')
  assert(!materials.includes('rgba(55, 45, 35'), 'warm graphite identity tint removed')
  assert(!materials.includes('rgba(26, 25, 24'), 'charcoal nav identity removed')
  console.log('PASS  V3.7 grid alignment + theme-derived material primitives')
}

{
  const hero = read('src/features/dashboard-v3/DashboardV3Hero.tsx')
  assert(hero.includes('Najbliższe zlecenie'), 'hero eyebrow')
  assert(hero.includes('assignment.href'), 'hero navigates by href')
  assert(hero.includes('Otwórz'), 'hero CTA')
  assert(hero.includes('getDashboardLocationLabel'), 'hero location')
  assert(hero.includes('assignmentTypeLabel'), 'type chip')
  assert(hero.includes('getDaysUntil'), 'countdown from real date')
  assert(!hero.includes('weather'), 'no fake weather')
  assert(!hero.includes('progress'), 'no fake progress')
  assert(!hero.includes('workflowStage'), 'no workflowStage')
  assert(!hero.includes('img'), 'no image backgrounds')
  const heroCss = read('src/features/dashboard-v3/DashboardV3Hero.module.css')
  const materials = read('src/features/dashboard-v3/v3Materials.css')
  assert(hero.includes('v3MaterialHero'), 'hero uses slab primitive')
  assert(!hero.includes('v3MaterialWell'), 'countdown is not a recessed well')
  assert(hero.includes('styles.dateDay'), 'countdown reuses the date number style')
  assert(hero.includes('do ślubu'), 'countdown caption stays real event copy')
  assert(heroCss.includes('--v3-hero-divider'), 'hero dividers share one token')
  assert(heroCss.includes('border-right: var(--v3-hero-divider)'), 'date column uses the shared divider')
  assert(heroCss.includes('border-left: var(--v3-hero-divider)'), 'countdown column uses the shared divider')
  assert(heroCss.includes('--v3-hero-rail'), 'outer columns share a rail width')
  assert(heroCss.includes('padding: 0 var(--v3-hero-rail-gap)'), 'hero center has no extra vertical inset vs rails')
  assert(!heroCss.includes('padding: 4px var(--v3-hero-rail-gap)'), 'hero center is not optically dropped vs rails')
  assert(heroCss.includes('margin-top: var(--v3-space-1, 8px)'), 'date and countdown share the same unit spacing')
  assert(!heroCss.includes('border-radius: 22px'), 'countdown has no nested rounded box')
  assert(hero.includes('v3MaterialOverlay'), 'chips use overlay primitive')
  assert(!hero.includes('v3MaterialGlassChip'), 'chips are not nested glass')
  assert(!hero.includes('v3MaterialGlassLens'), 'countdown is not a glass lens')
  assert(heroCss.includes('clamp('), 'editorial fluid type')
  assert(!heroCss.includes('backdrop-filter'), 'hero module has no backdrop-filter')
  assert(materials.includes('.v3MaterialHero'), 'hero slab lives in material system')
  assert(!materials.includes('.v3MaterialWell'), 'well material is gone')
  assert(!materials.includes('--v3-well-recess'), 'Dziś well recess is gone')
  assert(!heroCss.includes('isolation: isolate'), 'hero module has no isolation stacking')
  assert(!materials.includes('isolation: isolate'), 'no operational isolate stacking remains')
  console.log('PASS  V3.2 hero redesign stays on real assignment data')
}

{
  const today = read('src/features/dashboard-v3/DashboardV3TodayPanel.tsx')
  assert(today.includes('useDashboard'), 'shared today task hook')
  assert(today.includes('taskService.complete'), 'same complete path')
  assert(today.includes('DEFAULT_DASHBOARD_TASK_HORIZON'), 'same horizon default')
  assert(today.includes('dashboardTaskHorizonEndDate'), 'same horizon math')
  assert(today.includes('invalidateTaskDomain'), 'same invalidation')
  assert(!today.includes('priority'), 'no invented task priority')
  assert(!today.includes('workflowStage'), 'no workflow on today')
  const todayCss = read('src/features/dashboard-v3/DashboardV3TodayPanel.module.css')
  assert(today.includes('v3MaterialOperational'), 'today uses the operational tray')
  assert(!today.includes('v3MaterialOperationalLens'), 'today is not an operational lens')
  assert(!today.includes('v3MaterialSatinFlat'), 'today is not a satin-flat card')
  assert(today.includes('v3MaterialOverlay'), 'horizon uses a quiet overlay control')
  assert(!today.includes('v3MaterialGlassChip'), 'today has no nested glass chips')
  assert(!todayCss.includes('backdrop-filter'), 'today module css has no backdrop-filter')
  assert(!todayCss.includes('overflow: hidden'), 'today does not clip descendants')
  assert(!todayCss.includes('overflow-y: auto'), 'today has no internal scrollbar')
  assert(!todayCss.includes('overflow: auto'), 'today is not a scroll widget')
  assert(today.includes('const TODAY_PREVIEW_LIMIT = 2'), 'today preview shows at most two rows')
  assert(today.includes('tasks.slice(0, TODAY_PREVIEW_LIMIT)'), 'extra tasks are not rendered in the tray')
  assert(today.includes('remainingTasksLabel'), 'overflow uses a remainder action')
  assert(today.includes('to="/zadania"'), 'remainder links to the tasks page')
  assert(today.includes('{tasks.length}'), 'header count uses the full horizon')
  assert(today.includes('styles.moreSlot'), 'today always reserves a footer slot')
  assert(todayCss.includes('.moreSlot'), 'today footer slot is part of tray geometry')
  assert(todayCss.includes('min-height: 1.375rem'), 'footer slot keeps overflow from growing the tray')
  assert(todayCss.includes('padding: var(--v3-space-3, 16px)'), 'today padding pairs with upcoming cards')
  assert(todayCss.includes('min-height: 132px'), 'today tray stays present with short content')
  console.log('PASS  V3.2 today panel visual only, task semantics frozen')
}

{
  const panel = read('src/features/dashboard-v3/DashboardV3DeadlinePanel.tsx')
  assert(panel.includes('useNearestDeliveryDeadlines'), 'shared deadline hook')
  assert(panel.includes('Terminy oddania'), 'v3.2 header copy')
  assert(panel.includes('deadlineEmptyCopy'), 'honest empty via shared copy')
  assert(panel.includes('hasWeddingHistory'), 'zero-history vs established predicate')
  assert(panel.includes('getDeliveryDeadlineBand'), 'shared state helper')
  assert(panel.includes('deadline.href'), 'row navigates to detail')
  assert(panel.includes('nearest={index === 0}'), 'nearest row modest priority')
  assert(!panel.includes('<Button'), 'no repeated open buttons')
  assert(!panel.includes('>Otwórz<'), 'no visible text CTA')
  assert(!panel.includes('workflowStage'), 'no workflow stage')
  assert(!panel.includes('deliveryMonths'), 'no months/days recompute')
  assert(!panel.includes('text-xl'), 'no hero-scale names')
  const emptyCopy = read('src/features/dashboard/presentation/dashboardEmptyCopy.ts')
  assert(emptyCopy.includes('Brak terminów do pilnowania'), 'zero-history title')
  assert(
    emptyCopy.includes(
      'Gdy pojawią się terminy związane z Twoimi zleceniami, zobaczysz je tutaj.',
    ),
    'zero-history body',
  )
  assert(emptyCopy.includes('Brak aktywnych terminów'), 'established empty is factual, not false completion')
  assert(!emptyCopy.includes('Wszystko oddane'), 'no false “everything delivered” for empty deadline query')
  assert(emptyCopy.includes('Brak aktywnych terminów oddania.'), 'established empty body')
  const css = read('src/features/dashboard-v3/DashboardV3DeadlinePanel.module.css')
  assert(css.includes('font-size: var(--text-sm)'), 'name matches compact scale')
  assert(css.includes('font-size: var(--text-xs)'), 'compact date/relative')
  assert(!css.includes('--text-xl'), 'no text-xl in deadline panel')
  assert(!css.includes('--text-2xl'), 'no text-2xl in deadline panel')
  assert(css.includes('min-height: 64px'), 'desktop touch target')
  assert(css.includes('min-height: var(--touch-target)'), 'mobile deadline row uses 44px token')
  assert(css.includes('.row:focus-visible'), 'keyboard focus')
  assert(css.includes('.rowNearest'), 'nearest deadline modest emphasis')
  assert(!css.includes('rgba(255, 255, 255, 0.05)'), 'rows are not translucent mini-cards')
  assert(!css.includes('backdrop-filter'), 'deadline module css does not own the filter')
  assert(!css.includes('translateY(-1px)'), 'rows do not lift on hover')
  assert(!css.includes('0 2px 6px'), 'rows do not carry independent drop shadows')
  assert(panel.includes('v3MaterialOperational'), 'deadlines use the operational tray')
  assert(!panel.includes('v3MaterialOperationalLens'), 'deadlines are not an operational lens')
  assert(!panel.includes('v3MaterialSatinFlat'), 'deadlines are not a satin-flat card')
  console.log('PASS  V3.2 deadline panel presentation')
}

{
  const hook = read('src/features/dashboard/hooks/useNearestDeliveryDeadline.ts')
  assert(hook.includes("['dashboard', 'delivery-deadlines', userId]"), 'shared query key')
  const service = read('src/lib/api/dashboardService.ts')
  const nearestFn = service.slice(
    service.indexOf('async getNearestDeliveryDeadlines'),
    service.indexOf('},', service.indexOf('async getNearestDeliveryDeadlines')),
  )
  assert(nearestFn.includes('.limit(3)'), 'max 3 unchanged')
  console.log('PASS  deadline query architecture unchanged')
}

{
  const notes = read('src/features/dashboard-v3/DashboardV3NotificationsPanel.tsx')
  assert(notes.includes('useLatestNotifications'), 'shared notification hook')
  assert(notes.includes('NOTIFICATION_DASHBOARD_LATEST'), 'same latest limit')
  assert(notes.includes('useMarkNotificationRead'), 'same mark-read')
  assert(notes.includes('v3MaterialSupporting'), 'notifications restore supporting paper')
  assert(notes.includes('Zobacz wszystkie'), 'footer link kept')
  assert(notes.includes('/powiadomienia'), 'same notifications route')
  console.log('PASS  V3.2 notifications semantics frozen')
}

{
  const inquiries = read('src/features/dashboard-v3/DashboardV3InquiriesPanel.tsx')
  assert(inquiries.includes('usePendingQuestionnaires'), 'shared inquiry hook')
  assert(inquiries.includes('questionnaireService.approve'), 'same approve')
  assert(inquiries.includes('questionnaireService.reject'), 'same reject')
  assert(inquiries.includes('data-empty'), 'empty module can collapse')
  assert(inquiries.includes("data-mobile-slot={pending.length > 0 ? 'priority' : 'deferred'}"), 'mobile slot uses pending collection')
  assert(inquiries.includes('slice(0, 4)'), 'same preview limit')
  console.log('PASS  V3.2 inquiries semantics frozen')
}

{
  const header = read('src/features/dashboard-v3/DashboardV3Header.tsx')
  assert(!header.includes('DashboardV3PreviewSwitch'), 'preview switch retired from product header')
  assert(!existsSync(resolve(process.cwd(), 'src/features/dashboard-v3/DashboardV3PreviewSwitch.tsx')), 'preview switch component removed')
  assert(!existsSync(resolve(process.cwd(), 'src/features/dashboard-v3/DashboardV3PreviewSwitch.module.css')), 'preview switch styles removed')
  const sidebar = read('src/layouts/Sidebar.tsx')
  assert(!sidebar.includes('DashboardV3PreviewSwitch'), 'switch not in sidebar')
  const upcoming = read('src/features/dashboard-v3/DashboardV3UpcomingAssignments.tsx')
  assert(upcoming.includes('labelledBy'), 'upcoming title lives in the page grid')
  assert(!upcoming.includes('Kolejne zlecenia'), 'upcoming component does not own the band title')
  console.log('PASS  modern header has no temporary version selector')
}

{
  const prodHero = read('src/features/dashboard/components/NextWeddingCard.tsx')
  const prodToday = read('src/features/dashboard/components/TodoTodayCard.tsx')
  const prodNotes = read('src/features/dashboard/components/NotificationsCard.tsx')
  assert(!prodHero.includes('dashboard-v3'), 'production hero isolated')
  assert(!prodToday.includes('isV3'), 'production today has no v3 prop')
  assert(!prodNotes.includes('variant="v3"'), 'production notifications unvaried')
  console.log('PASS  production cards not contaminated with V3 variants')
}

{
  const layout = read('src/layouts/AppLayout.tsx')
  const layoutCss = read('src/layouts/AppLayout.module.css')
  const sidebar = read('src/layouts/Sidebar.tsx')
  const sidebarCss = read('src/layouts/Sidebar.module.css')
  const materials = read('src/features/dashboard-v3/v3Materials.css')
  assert(layout.includes('resolveActiveShellPresentation'), 'preference-aware shell helper')
  assert(layout.includes('resolveActiveShellPresentation(interfaceStyle)'), 'shell follows interfaceStyle globally')
  assert(layout.includes("data-shell={shell === 'v3' ? 'v3' : undefined}"), 'v3 shell attribute is opt-in')
  assert(layout.includes("v3Materials.css"), 'V3 material primitives load with the shell')
  assert(!layout.includes('useMatches'), 'shell is not route-handle resolved')
  assert(!layout.includes('resolveScreenPresentation'), 'screen presentation does not drive shell')
  assert(!layout.includes("pathname === '/dashboard-v3'"), 'no scattered pathname check')
  assert(!layout.includes("pathname === '/dashboard'"), 'shell is not dashboard-path gated')
  assert(layoutCss.includes("[data-shell='v3']"), 'V3 shell geometry is gated')
  assert(layoutCss.includes('animation: none'), 'V3 content does not keep a transform backdrop-root')
  assert(layoutCss.includes('@media (min-width: 768px)'), 'floating inset is desktop only')
  assert(sidebar.includes("presentation === 'v3' ? 'v3' : undefined"), 'sidebar presentation is opt-in')
  assert(sidebar.includes('v3MaterialDarkGlass'), 'sidebar uses smoked nav primitive')
  assert(sidebarCss.includes("[data-presentation='v3']"), 'V3 sidebar geometry is gated')
  assert(sidebarCss.includes('border-radius: 24px'), 'floating rail is rounded')
  assert(sidebarCss.includes('border-right: none'), 'V3 sidebar does not inherit production border-right')
  assert(!sidebarCss.includes('0 1px 2px'), 'active item has no contact shadow pill')
  const navMaterial = materials.slice(materials.indexOf('.v3MaterialDarkGlass'))
  assert(navMaterial.includes('backdrop-filter: none'), 'nav material keeps blur off')
  assert(!navMaterial.includes('blur('), 'nav material has no blur radius')
  assert(!materials.includes('blur(32px)'), 'sidebar 32px blur removed')
  assert(/--v3-surface-nav:\s*var\(--sidebar-background\)/.test(materials), 'nav fill is native sidebar pigment')
  assert(materials.includes('var(--sidebar-item-active-text)'), 'nav rim derives from theme nav text')
  assert(!materials.includes('rgba(26, 25, 24'), 'charcoal nav identity removed')
  assert(!materials.includes('rgba(32, 28, 25, 0.38)'), 'too-light nav alpha retired')
  assert(!sidebarCss.includes('--color-sidebar-text: rgba(255, 255, 255'), 'V3 does not force white nav labels')
  assert(!sidebarCss.includes('--color-sidebar-text-active: #ffffff'), 'V3 does not force white active labels')
  assert(!sidebarCss.includes('--color-sidebar-muted: rgba(255, 255, 255'), 'V3 does not force white muted labels')
  assert(sidebarCss.includes('var(--sidebar-text)'), 'V3 nav labels derive from theme sidebar-text')
  assert(sidebarCss.includes('var(--sidebar-item-active-text)'), 'V3 nav labels lift toward active-text')
  const mobileBlock = sidebarCss.slice(sidebarCss.indexOf('@media (max-width: 767px)'))
  const v3Desktop = sidebarCss.slice(sidebarCss.indexOf('/* V3 floating rail'))
  assert(mobileBlock.includes('position: fixed'), 'mobile drawer preserved')
  assert(!v3Desktop.includes('translateX(-105%)'), 'V3 desktop rail is not a drawer')
  console.log('PASS  floating V3 sidebar is interface-style-scoped')
}

{
  assert(
    resolveActiveShellPresentation('classic') === 'default',
    'classic interface keeps classic shell',
  )
  assert(
    resolveActiveShellPresentation('modern') === 'v3',
    'modern interface activates modern shell',
  )
  const helper = read('src/layouts/shellPresentation.ts')
  assert(!helper.includes('useMatches'), 'shell helper is not match-based')
  assert(!helper.includes('pathname'), 'shell helper is not path-gated')
  assert(!helper.includes('dashboardPresentation'), 'screen presentation does not drive shell')
  assert(!helper.includes('resolveShellPresentation'), 'route-handle shell path retired')
  console.log('PASS  shell presentation helper')
}

{
  const notesCss = read('src/features/dashboard-v3/DashboardV3NotificationsPanel.module.css')
  const upcomingCss = read(
    'src/features/dashboard-v3/DashboardV3UpcomingAssignments.module.css',
  )
  const inquiriesCss = read('src/features/dashboard-v3/DashboardV3InquiriesPanel.module.css')
  const today = read('src/features/dashboard-v3/DashboardV3TodayPanel.tsx')
  const todayCss = read('src/features/dashboard-v3/DashboardV3TodayPanel.module.css')
  const deadlineCss = read('src/features/dashboard-v3/DashboardV3DeadlinePanel.module.css')
  const pageCss = read('src/pages/DashboardV3Page.module.css')
  const materials = read('src/features/dashboard-v3/v3Materials.css')
  const layoutCss = read('src/layouts/AppLayout.module.css')
  const hero = read('src/features/dashboard-v3/DashboardV3Hero.tsx')
  assert(!notesCss.includes('backdrop-filter'), 'notifications stay opaque')
  assert(!upcomingCss.includes('backdrop-filter'), 'upcoming is not glass')
  assert(!upcomingCss.includes('nth-child(2)'), 'no decorative nth-child card tints')
  assert(!inquiriesCss.includes('inset 0 1px 0'), 'inquiry items have no inner inset cards')
  assert(today.includes('v3MaterialOperational'), 'today uses the operational tray')
  assert(!today.includes('v3MaterialOperationalLens'), 'today lens removed')
  assert(!materials.includes('blur(28px)'), 'no operational 28px blur')
  assert(!materials.includes('blur(32px)'), 'sidebar 32px blur removed')
  assert(!todayCss.includes('overflow: hidden'), 'today does not clip descendants')
  assert(!todayCss.includes('backdrop-filter'), 'today css has no backdrop-filter')
  assert(!deadlineCss.includes('overflow: hidden'), 'deadlines do not clip descendants')
  assert(!deadlineCss.includes('backdrop-filter'), 'deadlines css has no backdrop-filter')
  assert(!hero.includes('backdrop-filter'), 'hero source has no backdrop-filter')
  assert(!layoutCss.includes('#d2c8b8'), 'muddy taupe environment removed')
  assert(!layoutCss.includes('radial-gradient(42%'), 'seven-radial environment removed')
  assert(!layoutCss.includes('140% 90%'), '140% environment wash stays retired')
  assert(layoutCss.includes('background: var(--v3-environment, var(--app-background))'), 'shell floor stays the V3.7.3 environment token')
  assert(!layoutCss.includes('radial-gradient'), 'no atmospheric field for retired glass panels')
  assert(
    layoutCss.includes('backdrop-filter: blur(3px)'),
    'mobile nav backdrop owns subtle background blur',
  )
  assert(
    layoutCss.includes('inset: 0'),
    'mobile nav backdrop covers the full viewport',
  )
  const layoutMainAndContent = [
    layoutCss.slice(layoutCss.indexOf('.main {'), layoutCss.indexOf('.shellAccess {')),
    layoutCss.slice(layoutCss.indexOf('.content {'), layoutCss.indexOf('@keyframes')),
  ].join('\n')
  assert(!layoutMainAndContent.includes('backdrop-filter'), 'V3 main/content does not filter')
  assert(layoutCss.includes('background: transparent'), 'main column stays transparent above the floor')
  assert(layoutCss.includes('animation: none'), 'no leftover transform on V3 content')
  assert(pageCss.includes("'upcoming today'"), 'layout freeze: upcoming/today row')
  assert(pageCss.includes("'feed deadlines'"), 'layout freeze: lower row')
  assert(pageCss.includes("'hero hero'"), 'layout freeze: full-width hero')
  assert(pageCss.includes("'upcomingLabel .'"), 'upcoming label stays on its own row')
  assert(pageCss.includes("'feed today'"), 'nearest-only: operational content rises')
  assert(pageCss.includes(".layout[data-has-upcoming='false']"), 'nearest-only grid state')
  assert(pageCss.includes('align-items: start'), 'feed/deadlines stay start-aligned')
  assert(pageCss.includes('align-self: stretch'), 'desktop upcoming/today share row height')
  assert(
    pageCss.includes(".layout[data-has-upcoming='true'] .upcoming"),
    'stretch only with upcoming cards',
  )
  console.log('PASS  V4.1.3 stable operational grid bounded')
}

{
  const v3Files = [
    'src/features/dashboard-v3/v3Materials.css',
    'src/features/dashboard-v3/DashboardV3Hero.module.css',
    'src/features/dashboard-v3/DashboardV3Hero.tsx',
    'src/features/dashboard-v3/DashboardV3TodayPanel.module.css',
    'src/features/dashboard-v3/DashboardV3TodayPanel.tsx',
    'src/features/dashboard-v3/DashboardV3DeadlinePanel.module.css',
    'src/features/dashboard-v3/DashboardV3DeadlinePanel.tsx',
    'src/features/dashboard-v3/DashboardV3UpcomingAssignments.module.css',
    'src/features/dashboard-v3/DashboardV3UpcomingAssignments.tsx',
    'src/features/dashboard-v3/DashboardV3NotificationsPanel.module.css',
    'src/features/dashboard-v3/DashboardV3NotificationsPanel.tsx',
    'src/features/dashboard-v3/DashboardV3InquiriesPanel.module.css',
    'src/features/dashboard-v3/DashboardV3InquiriesPanel.tsx',
    'src/features/dashboard-v3/DashboardV3Header.module.css',
    'src/features/dashboard-v3/DashboardV3Header.tsx',
    'src/pages/DashboardV3Page.tsx',
    'src/pages/DashboardV3Page.module.css',
    'src/layouts/shellPresentation.ts',
  ]
  const joined = v3Files.map(read).join('\n')
  const materials = read('src/features/dashboard-v3/v3Materials.css')
  const sidebarCss = read('src/layouts/Sidebar.module.css')
  const layoutCss = read('src/layouts/AppLayout.module.css')
  const notesCss = read('src/features/dashboard-v3/DashboardV3NotificationsPanel.module.css')
  const todayCss = read('src/features/dashboard-v3/DashboardV3TodayPanel.module.css')
  const deadlineCss = read('src/features/dashboard-v3/DashboardV3DeadlinePanel.module.css')
  const upcomingCss = read('src/features/dashboard-v3/DashboardV3UpcomingAssignments.module.css')
  const heroCss = read('src/features/dashboard-v3/DashboardV3Hero.module.css')
  const inquiriesCss = read('src/features/dashboard-v3/DashboardV3InquiriesPanel.module.css')
  const page = read('src/pages/DashboardPage.tsx')
  const pageCss = read('src/pages/DashboardPage.module.css')

  assert(!joined.includes("[data-theme='"), 'no data-theme CSS branches in V3')
  assert(!joined.includes('[data-theme="'), 'no data-theme CSS branches in V3 (double quotes)')
  assert(!joined.includes('themeId ==='), 'no themeId equality branches in V3')
  assert(!joined.includes('switch (themeId'), 'no themeId switch in V3')
  assert(!joined.includes('V3_THEME_REGISTRY'), 'no separate V3 theme registry')
  assert(!joined.includes('V3_THEME'), 'no V3 theme table')
  assert(!materials.includes('#eae4da'), 'materials has no limestone floor')
  assert(!materials.includes('#f3eee6'), 'materials has no limestone satin')
  assert(!materials.includes('#fcfaf6'), 'materials has no limestone hero')
  assert(!materials.includes('#fbf8f3'), 'materials has no limestone fallback')
  assert(!joined.includes('#eae4da'), 'V3 presentation has no limestone floor hex')
  assert(!joined.includes('#f3eee6'), 'V3 presentation has no limestone satin hex')
  assert(!joined.includes('#fcfaf6'), 'V3 presentation has no limestone hero hex')
  assert(!joined.includes('#fbf8f3'), 'V3 presentation has no limestone menu fallback')
  assert(!joined.includes('rgba(55, 45, 35'), 'V3 presentation has no warm-graphite identity')
  assert(!joined.includes('rgba(26, 25, 24'), 'V3 presentation has no charcoal nav identity')
  assert(
    /--v3-environment:\s*var\(--app-background\)/.test(materials),
    'architecture: environment is theme workspace paper',
  )
  assert(
    !/--v3-environment:[^;]*--sidebar-background/.test(materials),
    'architecture: nav pigment stays on the sidebar, not the floor',
  )
  assert(/--v3-surface-supporting:\s*color-mix\(in srgb,\s*var\(--surface-primary\)/.test(materials), 'architecture: supporting paper near hero')
  assert(/--v3-surface-satin:\s*var\(--v3-surface-supporting\)/.test(materials), 'architecture: satin aliases supporting paper')
  assert(/--v3-surface-hero:\s*var\(--surface-primary\)/.test(materials), 'architecture: hero from surface-primary')
  assert(/--v3-surface-nav:\s*var\(--sidebar-background\)/.test(materials), 'architecture: nav is native sidebar pigment')
  assert(!materials.includes('--app-background) 92%'), 'sidebar pigment is not mixed into the environment')
  assert(!materials.includes('--v3-surface-operational-lens'), 'operational lens fill retired')
  assert(!materials.includes('--v3-radius-lens'), 'lens radius retired')
  assert(!materials.includes('--v3-lens-filter'), 'lens filter retired')
  assert(!materials.includes('.v3MaterialOperationalLens'), 'operational lens class retired')
  assert(!materials.includes('.v3MaterialOperationalGlass'), 'operational glass class retired')
  assert(!materials.includes('--v3-glass-border'), 'no leftover glass card border token')
  assert(!materials.includes('rgba(255, 255, 255'), 'no generic white rgba fills')
  assert(!materials.includes('rgba(255,255,255'), 'no compact white rgba fills')
  assert(!materials.includes('[data-theme'), 'no theme-id branches in the material file')
  assert(!materials.includes('classic'), 'no classic theme palette')
  assert(!materials.includes('graphite'), 'no graphite theme palette')
  assert(!materials.includes('sage_garden'), 'no sage theme palette')
  assert(!materials.includes('burgundy_estate'), 'no burgundy theme palette')
  assert(!materials.includes('mocha_editorial'), 'no mocha theme palette')
  const notes = read('src/features/dashboard-v3/DashboardV3NotificationsPanel.tsx')
  const upcoming = read('src/features/dashboard-v3/DashboardV3UpcomingAssignments.tsx')
  const inquiries = read('src/features/dashboard-v3/DashboardV3InquiriesPanel.tsx')
  const hero = read('src/features/dashboard-v3/DashboardV3Hero.tsx')
  const today = read('src/features/dashboard-v3/DashboardV3TodayPanel.tsx')
  const deadlines = read('src/features/dashboard-v3/DashboardV3DeadlinePanel.tsx')
  assert(notes.includes('v3MaterialSupporting'), 'notifications use supporting paper')
  assert(today.includes('v3MaterialOperational'), 'today uses the operational tray')
  assert(deadlines.includes('v3MaterialOperational'), 'deadlines use the operational tray')
  assert(upcoming.includes('v3MaterialSecondaryCard'), 'upcoming uses light appointment cards')
  assert(upcoming.includes('styles.card'), 'upcoming is three separate cards')
  assert(!upcoming.includes('styles.schedule'), 'combined schedule container removed')
  assert(!upcoming.includes('v3MaterialOperationalLens'), 'upcoming is not an operational lens')
  assert(inquiries.includes('v3MaterialSecondaryCard'), 'inquiries use a compact secondary surface')
  assert(hero.includes('v3MaterialHero'), 'hero remains the primary slab')
  assert(!hero.includes('v3MaterialOperationalLens'), 'hero is not an operational lens')
  assert(!today.includes('v3MaterialOperationalLens'), 'today lens removed')
  assert(!deadlines.includes('v3MaterialOperationalLens'), 'deadlines lens removed')
  assert(!materials.includes('::before'), 'no optical pseudo layers')
  assert(materials.includes('--v3-tint-hover'), 'hover tints are material roles, not theme palettes')
  assert(notesCss.includes('var(--color-warning-bg)'), 'warning status stays semantic')
  assert(notesCss.includes('var(--color-success-bg)'), 'success status stays semantic')
  assert(deadlineCss.includes('var(--color-warning-text)'), 'overdue copy stays semantic warning')
  assert(heroCss.includes('var(--color-accent)'), 'CTA fill stays theme accent')
  assert(heroCss.includes('var(--button-primary-text)'), 'CTA label uses theme button text')
  assert(layoutCss.includes('var(--v3-environment, var(--app-background))'), 'shell environment falls back to app background')
  const v3Desktop = sidebarCss.slice(sidebarCss.indexOf('/* V3 floating rail'))
  assert(v3Desktop.includes('border-radius: 24px'), 'V3 sidebar geometry preserved')
  assert(v3Desktop.includes('var(--sidebar-text)'), 'V3 sidebar text stays semantic')
  assert(v3Desktop.includes('var(--sidebar-item-active-text)'), 'V3 sidebar text can lift toward active-text')
  assert(!v3Desktop.includes('--color-sidebar-text: rgba(255, 255, 255'), 'V3 sidebar does not force white labels')
  assert(!page.includes('v3Materials'), 'production dashboard does not import V3 materials')
  assert(!pageCss.includes('--v3-'), 'production dashboard CSS has no V3 tokens')
  assert(!page.includes("data-shell"), 'production dashboard does not set V3 shell')

  const contentCss = [
    'src/features/dashboard-v3/DashboardV3Hero.module.css',
    'src/features/dashboard-v3/DashboardV3TodayPanel.module.css',
    'src/features/dashboard-v3/DashboardV3DeadlinePanel.module.css',
    'src/features/dashboard-v3/DashboardV3UpcomingAssignments.module.css',
    'src/features/dashboard-v3/DashboardV3NotificationsPanel.module.css',
    'src/features/dashboard-v3/DashboardV3InquiriesPanel.module.css',
    'src/pages/DashboardV3Page.module.css',
  ].map(read).join('\n')
  const surfaceConsumers = [
    'src/features/dashboard-v3/DashboardV3TodayPanel.tsx',
    'src/features/dashboard-v3/DashboardV3DeadlinePanel.tsx',
    'src/features/dashboard-v3/DashboardV3UpcomingAssignments.tsx',
    'src/features/dashboard-v3/DashboardV3NotificationsPanel.tsx',
    'src/features/dashboard-v3/DashboardV3InquiriesPanel.tsx',
    'src/features/dashboard-v3/DashboardV3Hero.tsx',
    'src/pages/DashboardV3Page.tsx',
  ].map(read).join('\n')
  assert(
    !surfaceConsumers.includes('v3MaterialOperationalLens'),
    'no information surface uses operational lens',
  )
  assert(!contentCss.includes('backdrop-filter'), 'content modules do not own backdrop-filter')
  assert(!materials.includes('backdrop-filter: var('), 'no positive backdrop-filter on V4 information materials')
  assert(materials.includes('backdrop-filter: none'), 'sidebar blur remains off')
  assert(!todayCss.includes('--v3-radius-operational'), 'today module does not own a parent card radius')
  assert(!deadlineCss.includes('--v3-radius-operational'), 'deadline module does not own a parent card radius')
  assert(upcomingCss.includes('.card'), 'upcoming restores separate cards')
  assert(upcomingCss.includes('min-height: 156px'), 'upcoming cards share a compact equal height')
  assert(/--v3-radius-secondary-box:\s*16px/.test(materials), 'one secondary-box radius')
  assert(/--v3-radius-module:\s*var\(--v3-radius-secondary-box\)/.test(materials), 'operational radius aliases the secondary box')
  assert(/--v3-radius-supporting:\s*var\(--v3-radius-secondary-box\)/.test(materials), 'supporting radius aliases the secondary box')
  assert(/--v3-radius-appointment:\s*var\(--v3-radius-secondary-box\)/.test(materials), 'appointment radius aliases the secondary box')
  assert(
    deadlineCss.includes('padding: var(--v3-space-4, 20px) var(--v3-space-4, 20px) var(--v3-space-3, 16px)'),
    'deadlines share notifications outer padding',
  )
  assert(
    notesCss.includes('padding: var(--v3-space-4, 20px) var(--v3-space-4, 20px) var(--v3-space-3, 16px)'),
    'notifications keep the shared lower-band padding',
  )
  assert(deadlineCss.includes('margin-bottom: var(--v3-space-1, 8px)'), 'deadlines title uses the shared header rhythm')
  assert(!inquiriesCss.includes('.emptyPanel .title'), 'inquiries empty title stays in the section-label system')
  console.log('PASS  V4.1.5 Graphite composition polish architecture')
}

{
  const page = read('src/pages/DashboardV3Page.tsx')
  const css = read('src/pages/DashboardV3Page.module.css')
  const todayCss = read('src/features/dashboard-v3/DashboardV3TodayPanel.module.css')
  const inquiries = read('src/features/dashboard-v3/DashboardV3InquiriesPanel.tsx')
  const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
  const desktopGrid = css.slice(0, css.indexOf('@media (max-width: 1279px)'))

  assert(page.includes('styles.upcomingBand'), 'one upcoming band node')
  assert(page.includes('styles.notifications'), 'notifications keep a presentation wrapper')
  assert(page.includes('styles.inquiries'), 'inquiries keep a presentation wrapper')
  assert(page.includes('data-has-upcoming='), 'layout tracks upcoming presence')
  assert(page.includes('{nextThree.length > 0 ? ('), 'empty upcoming band is omitted')
  assert(!page.includes('aria-hidden />\n                )'), 'no empty label placeholder branch')
  assert((page.match(/<DashboardV3InquiriesPanel/g) || []).length === 1, 'inquiries panel is not duplicated')
  assert((page.match(/<DashboardV3NotificationsPanel/g) || []).length === 1, 'notifications panel is not duplicated')
  assert((page.match(/<DashboardV3TodayPanel/g) || []).length === 1, 'today panel is not duplicated')
  assert(!page.includes('MobileDashboard'), 'no second mobile dashboard')
  assert(!page.includes('usePendingQuestionnaires'), 'page does not fork inquiry status')
  assert(inquiries.includes('usePendingQuestionnaires'), 'inquiry status stays on the existing hook')

  assert(desktopGrid.includes("'hero hero'"), 'desktop hero span unchanged')
  assert(desktopGrid.includes("'upcomingLabel .'"), 'desktop upcoming label row unchanged')
  assert(desktopGrid.includes("'upcoming today'"), 'desktop upcoming/today row unchanged')
  assert(desktopGrid.includes("'feed deadlines'"), 'desktop feed/deadlines row unchanged')
  assert(desktopGrid.includes("'feed today'"), 'desktop nearest-only feed/today row')
  assert(desktopGrid.includes(".layout[data-has-upcoming='false']"), 'desktop nearest-only areas')
  assert(desktopGrid.includes('.upcomingBand {\n  display: contents;'), 'desktop band does not add a grid box')
  assert(!desktopGrid.includes('order: 1'), 'desktop does not use mobile section order')

  assert(mobile.includes('.hero { order: 1; }'), 'mobile: nearest wedding after greeting')
  assert(mobile.includes('.upcomingBand { order: 2; }'), 'mobile: upcoming follows nearest wedding')
  assert(mobile.includes('width: 100%'), 'mobile upcoming band can use full width')
  assert(mobile.includes('.inquiries { order: 4; }'), 'mobile: active inquiries before today')
  assert(mobile.includes('.today { order: 5; }'), 'mobile: today after weddings/inquiries')
  assert(mobile.includes('.deadlines { order: 6; }'), 'mobile: deadlines after today')
  assert(mobile.includes('.notifications { order: 7; }'), 'mobile: notifications after deadlines')
  assert(
    mobile.includes(".layout:has([data-mobile-slot='deferred']) .inquiries"),
    'mobile: empty inquiries go after notifications',
  )
  assert(mobile.includes('order: 8'), 'deferred inquiries are last')
  assert(mobile.includes('.feed {\n    display: contents;'), 'mobile feed flattens so inquiries can reorder')

  const todayMobile = todayCss.slice(todayCss.indexOf('@media (max-width: 767px)'))
  assert(todayMobile.includes('width: var(--touch-target)'), 'mobile complete control is 44px wide')
  assert(todayMobile.includes('height: var(--touch-target)'), 'mobile complete control is 44px tall')
  assert(todayCss.includes('width: 22px'), 'visible check affordance stays 22px on desktop')
  console.log('PASS  Phase 1A mobile dashboard order + hit target')
}

{
  const hero = read('src/features/dashboard-v3/DashboardV3Hero.tsx')
  const heroCss = read('src/features/dashboard-v3/DashboardV3Hero.module.css')
  const upcomingCss = read(
    'src/features/dashboard-v3/DashboardV3UpcomingAssignments.module.css',
  )
  const heroMobile = heroCss.slice(heroCss.lastIndexOf('@media (max-width: 767px)'))
  const upcomingMobile = upcomingCss.slice(
    upcomingCss.lastIndexOf('@media (max-width: 767px)'),
  )
  const desktopHero = heroCss.slice(0, heroCss.indexOf('@media (max-width: 1100px)'))

  assert(hero.includes('styles.timeChip'), 'hero time is a hideable presentation class')
  assert(
    desktopHero.includes('grid-template-columns: var(--v3-hero-rail) minmax(0, 1fr) var(--v3-hero-rail)'),
    'desktop hero grammar frozen',
  )
  assert(desktopHero.includes('min-height: 280px'), 'desktop hero height frozen')
  assert(
    heroMobile.includes(
      'grid-template-columns: var(--v3-hero-rail) minmax(0, 1fr)',
    ),
    'mobile hero keeps an editorial date | identity composition',
  )
  assert(heroMobile.includes('.dateBlock {\n    display: flex;'), 'mobile restores the date rail')
  assert(heroMobile.includes('.timeChip {\n    display: none;'), 'hero time is hidden on mobile')
  assert(heroMobile.includes('-webkit-line-clamp: 2'), 'mobile hero name is bounded to two lines')
  assert(hero.includes('styles.heroLink'), 'mobile hero uses a stretched navigation target')
  assert(hero.includes('styles.cta'), 'desktop CTA remains in the hero markup')
  assert(hero.includes('styles.locationChip'), 'location has a dedicated presentation class')
  assert(heroMobile.includes('.heroLink {\n    display: block;'), 'mobile hero is fully clickable')
  assert(heroMobile.includes('.cta {\n    display: none;'), 'mobile hides the Otwórz action')
  assert(
    desktopHero.includes('.cta {\n  display: inline-flex;'),
    'desktop CTA display is preserved',
  )
  assert(desktopHero.includes('.heroLink {\n  display: none;'), 'desktop does not use the stretched hero link')
  assert(heroMobile.includes('.locationChip {'), 'mobile location has a dedicated treatment')
  assert(heroMobile.includes('background: transparent;'), 'mobile location is not a filled pill')
  assert(heroMobile.includes('border: none;'), 'mobile location has no capsule border')
  assert(!heroMobile.includes('.hero::before'), 'mobile gold/bronze accent rail is removed')
  assert(!heroMobile.includes('--dash-hero-theme'), 'mobile hero has no decorative tint layer')
  assert(!heroMobile.includes('linear-gradient('), 'mobile hero gradient is removed')
  assert(
    heroMobile.includes('var(--brand-primary) 46%'),
    'mobile countdown derives from the same theme brand token',
  )
  assert(
    heroMobile.includes('var(--brand-primary) 72%'),
    'editorial date uses one restrained theme-aware accent',
  )
  assert(
    heroMobile.includes('box-shadow: var(--v3-shadow-1'),
    'mobile hero uses the shared controlled depth',
  )
  assert(!heroMobile.includes('0 8px 18px'), 'custom ambient hero halo retired')
  assert(
    !desktopHero.includes('var(--brand-primary)'),
    'desktop hero material is not theme-tinted',
  )
  assert(!desktopHero.includes('linear-gradient('), 'desktop hero has no mobile theme gradient')
  assert(!desktopHero.includes('.hero::before'), 'desktop hero has no mobile accent rail')
  assert(
    !upcomingMobile.includes('0 8px 18px'),
    'upcoming cards do not inherit the hero shadow',
  )
  assert(
    !upcomingMobile.includes('var(--brand-primary)'),
    'upcoming cards do not inherit the hero theme tint',
  )
  assert(
    upcomingMobile.includes('grid-template-columns: 2.5rem minmax(0, 1fr) auto'),
    'upcoming rows use a date | identity | countdown strip',
  )
  assert(upcomingMobile.includes('min-height: 72px'), 'upcoming is a dense mobile row')
  assert(upcomingMobile.includes('box-shadow: none'), 'row cards do not stack desktop card depth')
  assert(upcomingMobile.includes('.time {\n    display: none;'), 'upcoming time is hidden on mobile')
  assert(upcomingMobile.includes('width: 100%'), 'upcoming cards use available width')
  console.log('PASS  mobile dashboard assignment grammar')
}

console.log('\nPASS  dashboard v4.1.5 graphite composition polish')
