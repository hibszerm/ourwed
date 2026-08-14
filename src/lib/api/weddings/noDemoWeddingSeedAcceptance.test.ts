/**
 * P0 release guard: empty wedding reads must never auto-insert CRM demo data.
 * Run: npm run test:no-demo-wedding-seed
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

const weddingService = read('src/lib/api/weddingService.ts')
const tenantCaches = read('src/lib/api/tenantModuleCaches.ts')
const calendarLight = read('src/lib/api/calendarLightService.ts')
const landingDemo = read('src/features/landing-v3/data/demoData.ts')
const weddingsPage = read('src/pages/WeddingsPage.tsx')
const dashboardPage = read('src/pages/DashboardPage.tsx')

{
  assertNotIncludes(
    weddingService,
    'ensureDemoWedding',
    'no ensureDemoWedding helper',
  )
  assertNotIncludes(
    weddingService,
    'loadWeddingsOrSeedDemo',
    'no loadWeddingsOrSeedDemo path',
  )
  assertNotIncludes(
    weddingService,
    'getWeddingDemoInFlightMap',
    'no demo in-flight map coupling',
  )
  assertNotIncludes(
    weddingService,
    'anna.michal@email.pl',
    'no Anna/Michał demo email insert',
  )
  assertNotIncludes(
    weddingService,
    'Pałac w Wilanowie',
    'no Wilanów demo venue insert',
  )
  assertNotIncludes(
    weddingService,
    "bride_name: 'Anna'",
    'no hardcoded Anna bride seed',
  )
  assertNotIncludes(
    weddingService,
    "groom_name: 'Michał'",
    'no hardcoded Michał groom seed',
  )

  const getAllStart = weddingService.indexOf('async getAll()')
  assert(getAllStart >= 0, 'getAll exists')
  const getAllEnd = weddingService.indexOf('async getById', getAllStart)
  assert(getAllEnd > getAllStart, 'getAll bounds')
  const getAllBody = weddingService.slice(getAllStart, getAllEnd)

  assertIncludes(
    getAllBody,
    'fetchWeddingsForUser(userId)',
    'getAll is a pure read via fetchWeddingsForUser',
  )
  assertNotIncludes(getAllBody, '.insert(', 'getAll must not insert')
  assertNotIncludes(getAllBody, 'seedNewWeddingSideEffects', 'getAll must not seed side effects')
  assertNotIncludes(getAllBody, 'ensureDemo', 'getAll must not call ensureDemo*')
  console.log('PASS  weddingService.getAll is read-only (no demo seed)')
}

{
  assertNotIncludes(
    tenantCaches,
    'getWeddingDemoInFlightMap',
    'demo in-flight map removed from tenant caches',
  )
  assertNotIncludes(
    tenantCaches,
    'weddingDemoInFlight',
    'demo in-flight storage removed',
  )
  assertIncludes(
    tenantCaches,
    'clearTenantModuleCaches',
    'auth reset still has tenant cache clear hook',
  )
  console.log('PASS  tenant demo in-flight map removed')
}

{
  assertNotIncludes(calendarLight, 'ensureDemo', 'calendar light has no demo seed')
  assertNotIncludes(calendarLight, '.insert(', 'calendar light weddings read has no insert')
  assertIncludes(
    calendarLight,
    'NEVER calls finalizeWeddingViews / weddingService.getAll / session payments.',
    'calendar light stays independent of getAll',
  )
  console.log('PASS  calendar light path does not seed')
}

{
  assertIncludes(landingDemo, 'export', 'landing demoData module remains')
  assertNotIncludes(
    weddingService,
    'demoData',
    'weddingService does not import landing demoData',
  )
  assertNotIncludes(
    weddingService,
    'landing-v3',
    'weddingService does not couple to landing',
  )
  console.log('PASS  landing demoData stays independent of CRM weddingService')
}

{
  assertIncludes(weddingsPage, 'Brak ślubów', 'weddings empty state preserved')
  assertIncludes(
    weddingsPage,
    'weddings.length === 0',
    'weddings page handles empty array',
  )
  assertIncludes(
    dashboardPage,
    'weddings ?? []',
    'dashboard tolerates missing/empty weddings',
  )
  console.log('PASS  empty-account UI paths handle []')
}

console.log('\nAll no-demo-wedding-seed acceptance checks passed.')
