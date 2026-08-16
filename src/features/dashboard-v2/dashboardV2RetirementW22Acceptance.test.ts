/**
 * WorkflowStage retirement W2.2 — Dashboard V2 retired from production reachability.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/dashboard-v2/dashboardV2RetirementW22Acceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
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

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

run('1. /dashboard-v2 no longer mounts V2 product surface', () => {
  const router = src('src/routes/router.tsx')
  assert(!router.includes('DashboardV2Page'), 'no V2 page import')
  assert(!router.includes("from '@/pages/DashboardV2Page'"), 'no page module import')
  assert(
    router.includes("path: '/dashboard-v2'"),
    'legacy path retained for bookmarks',
  )
})

run('2. direct URL redirects safely to /dashboard', () => {
  const router = src('src/routes/router.tsx')
  const idx = router.indexOf("path: '/dashboard-v2'")
  assert(idx >= 0, 'path present')
  const chunk = router.slice(idx, idx + 160)
  assert(chunk.includes('Navigate'), 'uses Navigate')
  assert(chunk.includes('to="/dashboard"'), 'targets /dashboard')
  assert(chunk.includes('replace'), 'replace history')
})

run('3. sidebar does not link V2', () => {
  const sidebar = src('src/layouts/Sidebar.tsx')
  assert(!sidebar.includes('dashboard-v2'), 'no v2 href')
  assert(sidebar.includes("to: '/dashboard'"), 'Pulpit → /dashboard')
  assert(sidebar.includes("label: 'Pulpit'"), 'Pulpit label')
})

run('4. no production route imports V2 page', () => {
  const router = src('src/routes/router.tsx')
  assert(!router.includes('buildDashboardV2Model'), 'no model in router')
  assert(!router.includes('@/features/dashboard-v2'), 'no feature package import')
  assert(!router.includes('@/pages/DashboardV2Page'), 'no V2 page import')
})

run('5. production Dashboard unchanged light architecture', () => {
  const page = src('src/pages/DashboardPage.tsx')
  assert(page.includes('useDashboardAssignments'), 'light assignments')
  assert(!page.includes('useWeddings'), 'no heavy useWeddings')
  assert(!page.includes('workflowStage'), 'V1 not stage-driven')
})

run('6. workflowStage no longer has Dashboard V2 live consumer', () => {
  const router = src('src/routes/router.tsx')
  assert(!router.includes('DashboardV2Page'), 'V2 unmounted')
  // Source may still mention stage historically — must not be reachable via router.
  const model = src('src/features/dashboard-v2/buildDashboardV2Model.ts')
  assert(model.includes('workflowStage'), 'legacy model still on disk (unmounted)')
})

run('7. V2 old stage labels not user-visible via route', () => {
  const router = src('src/routes/router.tsx')
  assert(!router.includes('WORKFLOW_STAGE_LABELS'), 'no labels in router')
  assert(!router.includes('stageLabel'), 'no stageLabel in router')
})

run('8. no fake completion metric reachable', () => {
  const router = src('src/routes/router.tsx')
  assert(!router.includes('Ukończone śluby'), 'no completed KPI in route graph')
  assert(!router.includes('Średni postęp workflow'), 'no workflow % in route graph')
})

run('9. docs mark V2 retired', () => {
  const docs = src('docs/experimental-tools.md')
  assert(docs.includes('Retired experimental routes'), 'retired section')
  assert(docs.includes('Redirects to `/dashboard`'), 'redirect documented')
})

if (process.exitCode) {
  console.error('\nW2.2 Dashboard V2 retirement failed.')
  process.exit(1)
} else {
  console.log('\nW2.2 Dashboard V2 retirement: all checks passed.')
}
