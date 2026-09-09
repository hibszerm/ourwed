/**
 * A6/A7 V1 — visible contract lifecycle generated → sent → signed.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/weddings/modern-detail/a6a7ContractLifecycleAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  composeModernContractHeadline,
} from '@/features/weddings/modern-detail/modernWeddingContractFinanceModel'
import {
  composeModernWeddingCurrentStory,
} from '@/features/weddings/modern-detail/modernWeddingDetailModel'
import { resolveWeddingNextAction } from '@/lib/workflow/resolveWeddingNextAction'
import type { Couple, Wedding } from '@/types/wedding'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function couple(partial: Partial<Couple> = {}): Couple {
  return {
    partner1: 'Anna Kowalska',
    partner2: 'Jan Nowak',
    partner1FirstName: 'Anna',
    partner1LastName: 'Kowalska',
    partner2FirstName: 'Jan',
    partner2LastName: 'Nowak',
    partner1Phone: '500100200',
    email: 'a@example.test',
    phone: '500100200',
    venue: '',
    city: '',
    ...partial,
  }
}

function wedding(partial: Partial<Wedding> = {}): Wedding {
  return {
    id: 'wed-a67',
    date: '2027-06-15',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Standard',
    price: 10000,
    depositAmount: 2000,
    packageItems: [],
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '#000',
    createdAt: '2026-01-01',
    couple: couple(),
    receptionLocation: 'Sala',
    travelFeeStatus: 'included',
    ...partial,
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (e) {
    console.error(`  ✗ ${name}`)
    throw e
  }
}

console.log('\nA6/A7 contract lifecycle acceptance')

run('A6/A7-1 generated: headline + next action mark sent', () => {
  const w = wedding({ contract: { status: 'generated', generatedAt: '2026-09-08' } })
  const headline = composeModernContractHeadline({
    weddingStatus: w.status,
    contractStatus: w.contract.status,
    hasTemplate: true,
    hasGenerated: true,
  })
  assertEq(headline.title, 'Wygenerowana', 'headline')
  const action = resolveWeddingNextAction(w)
  assertEq(action?.id, 'mark_contract_sent', 'resolver')
  const story = composeModernWeddingCurrentStory({
    wedding: w,
    action,
    applyCount: 0,
  })
  assertEq(story.kind, 'mark_contract_sent', 'story')
  assertEq(story.primaryAction?.label, 'Oznacz', 'CTA')
})

run('A6/A7-2 generated + incomplete collection → mark sent not questionnaire', () => {
  const w = wedding({
    couple: couple({
      partner1FirstName: '',
      partner1LastName: '',
      partner2FirstName: '',
      partner2LastName: '',
      partner1: '',
      partner2: '',
      partner1Phone: '',
      phone: '',
      email: '',
    }),
    receptionLocation: '',
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'generated' },
  })
  assertEq(
    resolveWeddingNextAction(w)?.id,
    'mark_contract_sent',
    'overrides collection CTA',
  )
})

run('A6/A7-3 sent: headline + mark signed', () => {
  const w = wedding({ contract: { status: 'sent', generatedAt: '2026-09-08' } })
  const headline = composeModernContractHeadline({
    weddingStatus: w.status,
    contractStatus: w.contract.status,
    hasTemplate: true,
    hasGenerated: true,
  })
  assertEq(headline.title, 'Wysłana', 'headline')
  assertEq(resolveWeddingNextAction(w)?.id, 'mark_contract_signed', 'resolver')
})

run('A6/A7-4 signed: lifecycle complete → deposit', () => {
  const w = wedding({
    contract: { status: 'signed', signedAt: '2026-09-09' },
    payments: [],
  })
  const headline = composeModernContractHeadline({
    weddingStatus: w.status,
    contractStatus: w.contract.status,
    signedAt: w.contract.signedAt,
    hasTemplate: true,
    hasGenerated: true,
  })
  assertEq(headline.title, 'Podpisana', 'headline')
  assertEq(resolveWeddingNextAction(w)?.id, 'record_deposit', 'next business step')
})

run('A6/A7-5 signed undo returns to generated not sent', () => {
  const modern = src(
    'src/features/weddings/modern-detail/ModernWeddingContractFinanceWorkspace.tsx',
  )
  const controls = src(
    'src/features/weddings/components/detail/WeddingContractSignedControls.tsx',
  )
  assert(modern.includes("next === 'none' ? 'none' : 'generated'"), 'modern undo → generated')
  assert(controls.includes("next === 'none' ? 'none' : 'generated'"), 'legacy undo → generated')
  assert(!modern.includes("updateStatus(wedding.id, 'sent')\n      await timeline"), 'sent has no required timeline')
})

run('A6/A7-6 downloads do not modify status', () => {
  const modern = src(
    'src/features/weddings/modern-detail/ModernWeddingContractFinanceWorkspace.tsx',
  )
  const downloadFn = modern.slice(
    modern.indexOf('async function downloadContract'),
    modern.indexOf('async function markSent'),
  )
  assert(!downloadFn.includes('updateStatus'), 'DOCX download no status write')
  assert(modern.includes('Pobierz DOCX'), 'DOCX frozen')
  assert(modern.includes('Pobierz PDF'), 'PDF frozen')
  assert(modern.includes('useContractPdfDownload'), 'PDF helper unchanged')
})

run('A6/A7-7 regenerate forces generated', () => {
  const actions = src('src/lib/api/weddingActionsService.ts')
  assert(
    actions.includes("updateStatus(wedding.id, 'generated')"),
    'regenerate/generate → generated',
  )
})

run('A6/A7-8 success overlay removes misleading send stub', () => {
  const success = src(
    'src/features/documents/contract-experience/ContractSuccessState.tsx',
  )
  assert(!success.includes('Wyślij klientowi'), 'no email tease')
  assert(!success.includes('wkrótce'), 'no coming-soon send')
  assert(success.includes('Pobierz DOCX'), 'download kept')
})

run('A6/A7 UI: mark-sent only when generated; mark-signed only when sent', () => {
  const modern = src(
    'src/features/weddings/modern-detail/ModernWeddingContractFinanceWorkspace.tsx',
  )
  assert(modern.includes("status === 'generated' && hasGenerated"), 'canMarkSent')
  assert(modern.includes("status === 'sent' && hasGenerated"), 'canSign')
  assert(modern.includes('Oznacz jako wysłaną'), 'label')
  assert(modern.includes("updateStatus(wedding.id, 'sent')"), 'writer')
})

console.log('\nOK A6/A7 contract lifecycle acceptance')
