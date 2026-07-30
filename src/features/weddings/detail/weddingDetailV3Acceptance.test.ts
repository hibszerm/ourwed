/**
 * Wedding Detail Overview + commercial finance — no persistent readiness UI.
 * (Product label: V3 Overview / Umowa i finanse cleanup.)
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getOverviewBand } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { validateContractGeneration } from '@/lib/utils/validateContractGeneration'
import { buildReferenceCompany } from '@/lib/dev/referenceWedding'
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

function stubWedding(overrides: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w1',
    couple: {
      partner1: 'Iza Karczewska',
      partner2: 'Jan Kulewski',
      partner1FirstName: 'Iza',
      partner1LastName: 'Karczewska',
      partner2FirstName: 'Jan',
      partner2LastName: 'Kulewski',
      email: 'iza@example.com',
      phone: '500100200',
      venue: 'Villa Love',
      city: 'Izdebnik',
    },
    date: '2026-07-29',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Video Mini',
    packageId: null,
    price: 9500,
    depositAmount: 1000,
    currency: 'PLN',
    packageItems: [{ title: 'Video', sortOrder: 0, enabled: true }],
    finalPaymentDueDate: '2026-07-15',
    bridePreparationLocation: 'Zabrze prep',
    groomPreparationLocation: 'Ruda prep',
    ceremonyLocation: 'Kościół',
    receptionLocation: 'Villa Love',
    accentColor: '#0a0a0a',
    createdAt: '2026-01-01',
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
    ...overrides,
  }
}

const v2Root = resolve(process.cwd(), 'src/features/weddings/detail/v2')
const pagePath = resolve(process.cwd(), 'src/pages/WeddingDetailPage.tsx')

function overviewSources(): string {
  return [
    readFileSync(resolve(v2Root, 'WeddingDetailV2.tsx'), 'utf8'),
    readFileSync(resolve(v2Root, 'WeddingOverviewWorkspace.tsx'), 'utf8'),
    readFileSync(resolve(v2Root, 'WeddingOverviewBand.tsx'), 'utf8'),
    readFileSync(resolve(v2Root, 'WeddingWorkspaceHeader.tsx'), 'utf8'),
  ].join('\n')
}

run('1–3. Overview has no Gotowość / counts / Wymaga uzupełnienia', () => {
  const overview = overviewSources()
  assert(!overview.includes('Gotowość umowy'), 'no readiness title')
  assert(!overview.includes('Wymaga uzupełnienia'), 'no incomplete badge')
  assert(!overview.includes('readinessCount'), 'no count prop')
})

run('4–8. Umowa i finanse is commercial — no readiness checklist', () => {
  const contract = readFileSync(
    resolve(v2Root, 'WeddingContractFinanceWorkspace.tsx'),
    'utf8',
  )
  assert(!contract.includes('Gotowość umowy'), 'no readiness')
  assert(!contract.includes('Wymaga uzupełnienia'), 'no status')
  assert(!contract.includes('getReadinessGroups'), 'no groups')
  assert(!contract.includes('requiredTotal'), 'no totals')
  assert(contract.includes('Pakiet i usługi'), 'package section')
  assert(contract.includes('Finanse'), 'finance section')
  assert(contract.includes('Płatności'), 'payments section')
  assert(
    contract.includes('Umowa nie została jeszcze wygenerowana'),
    'lifecycle',
  )
  assert(contract.includes("onAction('generate_contract')"), 'generate CTA')
})

run('9–12. Generation guard + missing dialog on page', () => {
  const page = readFileSync(pagePath, 'utf8')
  assert(page.includes('validateContractGeneration'), 'guard')
  assert(page.includes('MissingContractDataDialog'), 'dialog')
  assert(page.includes('handleGenerateContract'), 'handler')
  const validation = validateContractGeneration(
    stubWedding(),
    buildReferenceCompany({ regon: null, bankAccount: null }),
  )
  assertEq(validation.isReady, false, 'blocks incomplete')
  assert(
    validation.missingGroups.every((g) => g.items.length > 0),
    'only blockers',
  )
})

run('13. Workflow stage Rezerwacja remains visible', () => {
  const header = readFileSync(
    resolve(v2Root, 'WeddingWorkspaceHeader.tsx'),
    'utf8',
  )
  assert(header.includes('WorkflowBadge'), 'stage badge')
  assertEq(getOverviewBand(stubWedding()).stageLabel, 'Rezerwacja', 'band')
})

run('14. Canonical details page has no V1 readiness / V1 shell', () => {
  const page = readFileSync(pagePath, 'utf8')
  assert(!page.includes('WeddingDetailV1'), 'no v1')
  assert(!page.includes('Gotowość'), 'no gotowosc')
  assert(page.includes('WeddingDetailV2'), 'v2 only')
})

run('15. Workspace shell remains', () => {
  const shell = readFileSync(resolve(v2Root, 'WeddingDetailV2.tsx'), 'utf8')
  assert(shell.includes('WeddingWorkspaceTabs'), 'tabs')
  assert(shell.includes('WeddingDayWorkspace'), 'day')
  assert(shell.includes('WeddingContractFinanceWorkspace'), 'contract')
  assert(!shell.includes('evaluateWeddingContractReadiness'), 'no page eval')
  assert(!shell.includes('companyDetailsService'), 'no company on load')
})

run('16. Readiness panel file deleted', () => {
  assert(
    !existsSync(
      resolve(
        process.cwd(),
        'src/features/weddings/components/detail/WeddingContractReadiness.tsx',
      ),
    ),
    'deleted',
  )
})

console.log('\nwedding detail on-demand readiness: done')
