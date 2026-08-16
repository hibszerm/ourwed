// =============================================================================
// N3 — Polish production UI copy guard (presentation regressions)
// =============================================================================

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let passed = 0
let failed = 0

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`  FAIL  ${msg}`)
    failed++
  } else {
    console.log(`  PASS  ${msg}`)
    passed++
  }
}

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

console.log('\nN3 Polish copy sweep — architecture guard\n')

const sidebar = read('src/layouts/Sidebar.tsx')
assert(sidebar.includes("label: 'Pulpit'"), 'sidebar Pulpit')
assert(!sidebar.includes("label: 'Dashboard'"), 'no Dashboard nav label')

const auth = read('src/features/auth/services/authService.ts')
assert(auth.includes("role: 'Konto'"), 'sidebar role fallback Konto')
assert(!auth.includes("role: 'Studio'"), 'no Studio role fallback')

const entitlement = read('src/lib/billing/entitlement.ts')
assert(entitlement.includes("title: 'Okres próbny PRO'"), 'trial title Polish')
assert(!entitlement.includes("title: 'PRO Trial'"), 'no PRO Trial title')

const sub = read('src/pages/SubscriptionSettingsPage.tsx')
assert(sub.includes('Okres próbny PRO'), 'subscription page trial Polish')
assert(!sub.includes('>PRO Trial<'), 'no PRO Trial heading')

const docsHub = read('src/pages/DocumentsHubPage.tsx')
assert(docsHub.includes('Szablony umów'), 'documents hub Polish')
assert(!docsHub.includes('Contract Templates'), 'no Contract Templates UI')

const travel = read('src/features/weddings/components/detail/WeddingDetailTravel.tsx')
assert(travel.includes('title="Dojazd"'), 'travel section Polish')
assert(!travel.includes('title="Travel"'), 'no Travel title')

const loc = read('src/features/travel/LocationSearchField.tsx')
assert(loc.includes('aria-label="Wyszukiwanie"'), 'searching a11y Polish')
assert(loc.includes('aria-label="Wyczyść adres"'), 'clear address a11y Polish')
assert(!loc.includes('aria-label="Searching"'), 'no Searching a11y')
assert(!loc.includes('aria-label="Clear address"'), 'no Clear address a11y')

const danger = read('src/features/weddings/components/detail/WeddingDangerZone.tsx')
assert(danger.includes("=== 'USUŃ'"), 'delete confirm keyword USUŃ')
assert(!danger.includes("=== 'DELETE'"), 'no DELETE confirm keyword')

const header = read('src/features/weddings/detail/v2/WeddingHeaderActions.tsx')
assert(header.includes("!== 'USUŃ'"), 'header delete confirm USUŃ')
assert(!header.includes("!== 'DELETE'"), 'header no DELETE')

const v2 = read('src/pages/DashboardV2Page.tsx')
assert(v2.includes('Pulpit V2 · Beta'), 'v2 chrome Polish')
assert(!v2.includes('Dashboard V2 · Beta'), 'no English Dashboard V2 chrome')

// Founder brand runtime/defaults (N1 purge) — exclude migration SQL
const defaultTpl = read('src/features/prewedding/defaultTemplate.ts')
assert(!/Gentlemen Productions/i.test(defaultTpl), 'default template no Gentlemen')
assert(!/gentlemenproductions@gmail/i.test(defaultTpl), 'default template no founder gmail')

const packages = read('src/pages/PackagesPage.tsx')
assert(!packages.includes("from '@/lib/dev/"), 'PackagesPage no lib/dev')

console.log(`\nn3-polish-copy: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exitCode = 1
