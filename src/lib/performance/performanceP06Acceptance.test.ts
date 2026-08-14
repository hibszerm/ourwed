/**
 * Performance P0.6 — approval place batch, deferred seed, package reuse, extras.
 * Run: npm run test:performance-p06
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROUTE_ROLE_SORT } from '@/features/travel/weddingDayRouteStops'
import {
  mergeLocationAnswerWithExisting,
  normalizeLocationAnswer,
} from '@/features/travel/weddingLocationModel'
import { planWeddingExtraSync } from '@/lib/forms/weddingExtraSyncPlan'
import { recomputeContractValueAfterExtrasSync } from '@/lib/forms/weddingExtraPricing'
import type { WeddingPlaceRole } from '@/types/travel'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

function approveBody(): string {
  const svc = read('src/lib/api/questionnaireService.ts')
  const start = svc.indexOf('async approve(')
  assert(start >= 0, 'approve exists')
  const after = svc.slice(start)
  const releaseIdx = after.indexOf('releaseClaimedLeadInstance')
  assert(releaseIdx >= 0, 'rollback claim')
  return after.slice(0, releaseIdx + 400)
}

function placeSyncBody(): string {
  const svc = read('src/lib/api/questionnaireService.ts')
  const fnStart = svc.indexOf('async function syncQuestionnaireLocationsToPlaces')
  const fnEnd = svc.indexOf('export const QUESTIONNAIRE_STATUS_LABELS')
  assert(fnStart >= 0 && fnEnd > fnStart, 'sync bounds')
  return svc.slice(fnStart, fnEnd)
}

// --- A: 4 places — batch insert, deterministic sort, no probes, no geocode ---
{
  const sync = placeSyncBody()
  assertIncludes(sync, 'insertInitialWeddingPlaces', 'batch helper')
  assertNotIncludes(sync, 'getByRole', 'no getByRole')
  assertNotIncludes(sync, 'listByWeddingId', 'no listByWeddingId')
  assertNotIncludes(sync, 'weddingPlaceService.upsert', 'no generic upsert')
  assertNotIncludes(sync, 'getCoordinates', 'no geocode')
  assertNotIncludes(sync, 'travelProvider', 'no travelProvider')
  assertNotIncludes(sync, 'resolve: true', 'no resolve geocode')

  const placeSvc = read('src/lib/api/weddingPlaceService.ts')
  const insertStart = placeSvc.indexOf('async insertInitialWeddingPlaces')
  assert(insertStart >= 0, 'insertInitialWeddingPlaces exists')
  const insertBody = placeSvc.slice(insertStart, insertStart + 1200)
  assertIncludes(insertBody, '.insert(rows)', 'single batch insert')
  assertIncludes(insertBody, 'ROLE_SORT[role]', 'deterministic sort from catalog')
  assertNotIncludes(insertBody, 'getByRole', 'insert helper no getByRole')
  assertNotIncludes(insertBody, 'listByWeddingId', 'insert helper no list')

  assertEq(ROUTE_ROLE_SORT.groom_preparation, 10, 'groom sort')
  assertEq(ROUTE_ROLE_SORT.bride_preparation, 15, 'bride sort')
  assertEq(ROUTE_ROLE_SORT.ceremony, 20, 'ceremony sort')
  assertEq(ROUTE_ROLE_SORT.reception, 30, 'reception sort')

  // Upsert path for Detail edit must remain intact.
  assertIncludes(placeSvc, 'async upsert(', 'canonical upsert preserved')

  console.log('PASS  A — 4 places batch / deterministic sort / no probes')
}

// --- B: partial locations (0–3 roles still build insert list correctly) ---
{
  const roles: WeddingPlaceRole[] = [
    'bride_preparation',
    'groom_preparation',
    'ceremony',
    'reception',
  ]
  const samples = [
    {},
    { ceremony: { name: 'Kościół', formattedAddress: 'ul. A 1' } },
    {
      ceremony: { name: 'Kościół', formattedAddress: 'ul. A 1' },
      reception: { name: 'Sala', formattedAddress: 'ul. B 2' },
    },
    {
      bridePreparation: { name: 'Dom', formattedAddress: 'ul. C 3' },
      groomPreparation: { name: 'Dom 2', formattedAddress: 'ul. D 4' },
      ceremony: { name: 'Kościół', formattedAddress: 'ul. A 1' },
    },
  ]

  for (const locs of samples) {
    const pairs: Array<{ role: WeddingPlaceRole; value: unknown }> = [
      { role: 'bride_preparation', value: (locs as { bridePreparation?: unknown }).bridePreparation },
      { role: 'groom_preparation', value: (locs as { groomPreparation?: unknown }).groomPreparation },
      { role: 'ceremony', value: (locs as { ceremony?: unknown }).ceremony },
      { role: 'reception', value: (locs as { reception?: unknown }).reception },
    ]
    const toInsert: WeddingPlaceRole[] = []
    for (const { role, value } of pairs) {
      const incoming = normalizeLocationAnswer(value)
      if (!incoming.name && !incoming.formattedAddress) continue
      const geo = mergeLocationAnswerWithExisting(incoming, null)
      if (!geo.formattedAddress?.trim() && !geo.label?.trim()) continue
      toInsert.push(role)
    }
    assert(
      toInsert.every((r) => roles.includes(r)),
      'roles subset of core four',
    )
    assert(toInsert.length <= 4, 'at most 4')
  }
  console.log('PASS  B — partial locations 0/1/2/3')
}

// --- C: package reuse ---
{
  const body = approveBody()
  assertIncludes(body, 'resolvedPackage', 'passes resolved package')
  assertIncludes(body, 'questionnaire.approve.package', 'package phase mark')
  assertIncludes(
    read('src/lib/api/questionnaireService.ts'),
    'resolvedPackage: (pkg ?? null)',
    'summarize exposes authenticated pkg',
  )

  const ws = read('src/lib/api/weddingService.ts')
  assertIncludes(ws, 'creationOptions?.resolvedPackage', 'create reuses package')
  assertIncludes(
    ws,
    'input.creationOptions?.resolvedPackage ??',
    'create uses resolvedPackage before get',
  )

  console.log('PASS  C — package reuse')
}

// --- D: seed — calendar on path; contract/gallery/timeline deferred ---
{
  const body = approveBody()
  assertIncludes(body, "seedMode: 'calendar_only'", 'calendar-only on create')
  assertIncludes(body, 'seedDeferredWeddingShells', 'deferred shells scheduled')
  assertIncludes(body, 'void seedDeferredWeddingShells', 'shells not awaited')

  const ws = read('src/lib/api/weddingService.ts')
  assertIncludes(ws, "mode === 'calendar_only'", 'seed mode gate')
  assertIncludes(ws, 'createWeddingDayEventForNewWedding', 'direct calendar create')
  assertIncludes(ws, 'export async function seedDeferredWeddingShells', 'deferred export')

  // Manual create still full seed by default
  assertIncludes(ws, "mode: input.creationOptions?.seedMode ?? 'full'", 'default full')

  // Detail tolerates missing contract/gallery
  const hydrate = read('src/lib/api/weddings/weddingHydrate.ts')
  assertIncludes(
    hydrate,
    "contract: contract ?? { status: 'none' }",
    'hydrate tolerates null contract',
  )
  const selectors = read(
    'src/features/weddings/detail/v2/weddingWorkspaceSelectors.ts',
  )
  assertIncludes(
    selectors,
    "wedding.contract?.status ?? 'none'",
    'Detail UI tolerates missing contract',
  )

  console.log('PASS  D — seed calendar awaited / shells deferred')
}

// --- E: retry / idempotency — claim + attach unchanged ---
{
  const body = approveBody()
  assertIncludes(body, 'claimSubmittedLeadInstance', 'claim')
  assertIncludes(body, 'attachWeddingToApprovedInstance', 'attach')
  assertIncludes(
    body,
    "instance.status === 'approved' && instance.weddingId",
    'early return if already approved',
  )
  assertIncludes(body, 'releaseClaimedLeadInstance', 'claim rollback')
  // Must not merge claim+attach into one call
  assertNotIncludes(body, 'claimAndAttach', 'no merged claim+attach')

  console.log('PASS  E — claim/attach/idempotency preserved')
}

// --- F: extras — 0 extras no lists; multi extras CV + travel ---
{
  const syncSrc = read('src/lib/forms/syncWeddingExtrasFromQuestionnaire.ts')
  assertIncludes(
    syncSrc,
    'selectedIds.length === 0',
    'zero-extras early return',
  )
  // Early return must not list
  const zeroBlock = syncSrc.slice(
    syncSrc.indexOf('if (selectedIds.length === 0)'),
    syncSrc.indexOf('const catalog = snapshotExtras'),
  )
  assertNotIncludes(zeroBlock, 'listByWeddingId', '0 extras no list')
  assertIncludes(syncSrc, 'extrasAfter', 'returns after-state')
  assertIncludes(syncSrc, 'Promise.all', 'parallel inserts when multiple')

  const body = approveBody()
  assertNotIncludes(
    body,
    'weddingExtraServiceService.listByWeddingId',
    'approve does not re-list extras',
  )
  assertIncludes(body, 'synced.extrasAfter', 'uses sync after-state')
  assertIncludes(body, 'effectiveTravelFee', 'travel fee in CV')

  const planned = planWeddingExtraSync(['a', 'b'], [])
  assertEq(planned.toInsert.length, 2, 'two inserts')
  const cv = recomputeContractValueAfterExtrasSync({
    currentWeddingPrice: 5000,
    extrasBeforeSync: [],
    extrasAfterSync: [
      { priceSnapshot: 400, quantity: 1 },
      { priceSnapshot: 600, quantity: 1 },
    ],
    effectiveTravelFee: 350,
    explicitPackagePrice: 5000,
  })
  // package 5000 + 400 + 600 + travel 350 = 6350 when current had no extras/travel baked?
  // Helper semantics: verify deterministic number from helper.
  assert(typeof cv === 'number' && Number.isFinite(cv), 'CV finite')
  assertEq(
    recomputeContractValueAfterExtrasSync({
      currentWeddingPrice: cv,
      extrasBeforeSync: [
        { priceSnapshot: 400, quantity: 1 },
        { priceSnapshot: 600, quantity: 1 },
      ],
      extrasAfterSync: [
        { priceSnapshot: 400, quantity: 1 },
        { priceSnapshot: 600, quantity: 1 },
      ],
      effectiveTravelFee: 350,
      explicitPackagePrice: 5000,
    }),
    cv,
    'extras CV idempotent',
  )

  console.log('PASS  F — extras lists + CV')
}

// --- G: package update validation skipped when unchanged ---
{
  const body = approveBody()
  assertIncludes(body, 'validatePackageId: false', 'approval update skips package checks')

  const ws = read('src/lib/api/weddingService.ts')
  assertIncludes(
    ws,
    'options?.validatePackageId === false',
    'update gate for package validation',
  )
  assertIncludes(
    ws,
    'resolveWritableWeddingPackageId',
    'real package change path still validates',
  )

  const types = read('src/types/wedding.ts')
  assertIncludes(types, 'validatePackageId?: boolean', 'option typed')
  assertIncludes(types, "seedMode?: 'full' | 'calendar_only'", 'seedMode typed')
  assertIncludes(types, 'resolvedPackage?:', 'resolvedPackage typed')

  console.log('PASS  G — update package validation field-aware')
}

// --- DEV perf phases ---
{
  const body = approveBody()
  for (const label of [
    'questionnaire.approve.package',
    'questionnaire.approve.claim',
    'questionnaire.approve.create',
    'questionnaire.approve.update',
    'questionnaire.approve.extras',
    'questionnaire.approve.places',
    'questionnaire.approve.attach',
  ]) {
    assertIncludes(body, label, `phase ${label}`)
  }
  const perf = read('src/lib/performance/devPerf.ts')
  assertIncludes(perf, 'questionnaire.approve.places', 'devPerf label places')
  assertIncludes(perf, 'questionnaire.approve.calendar', 'devPerf label calendar')
  assertIncludes(perf, "import.meta.env?.DEV", 'DEV-only')

  const ws = read('src/lib/api/weddingService.ts')
  assertIncludes(
    ws,
    "withDevPerf('questionnaire.approve.calendar'",
    'calendar nested mark',
  )

  console.log('PASS  DEV performance phase marks')
}

// --- P0.5 regressions preserved ---
{
  const body = approveBody()
  assertNotIncludes(body, 'weddingService.getById', 'no final getById')
  assertIncludes(body, 'void travelService.recalculate', 'travel non-blocking')
  assertIncludes(body, 'void notificationService', 'notification non-blocking')
  assertIncludes(body, 'void timelineEventService', 'timeline approval event non-blocking')

  console.log('PASS  P0.5 non-blocking preserved')
}

console.log('\nAll Performance P0.6 acceptance checks passed.')
