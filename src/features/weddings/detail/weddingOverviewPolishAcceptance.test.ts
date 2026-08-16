/**
 * Overview final polish — identity, channels, calendar, contract signing.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/weddings/detail/weddingOverviewPolishAcceptance.test.ts
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildWeddingProgressSummary } from '@/features/weddings/detail/v2/buildWeddingProgressSummary'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import {
  getCorrespondenceDisplay,
} from '@/features/weddings/correspondence/weddingCorrespondence'
import { getHeaderStatusBadges } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import type { Couple, Wedding } from '@/types/wedding'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function couple(partial: Partial<Couple> = {}): Couple {
  return {
    partner1: 'Joanna Nowak',
    partner2: 'Krystian Kowalski',
    partner1FirstName: 'Joanna',
    partner1LastName: 'Nowak',
    partner2FirstName: 'Krystian',
    partner2LastName: 'Kowalski',
    email: 'test@example.com',
    phone: '500100200',
    venue: '',
    city: '',
    ...partial,
  }
}

function stub(partial: Partial<Wedding> = {}): Wedding {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    date: '2026-07-31',
    status: 'active',
    workflowStage: 'contract',
    packageName: 'Video Standard',
    price: 11400,
    packageItems: [],
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'completed', completedAt: '2026-07-30' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'generated', generatedAt: '2026-07-30' },
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '#000',
    createdAt: '2026-07-01',
    couple: couple(),
    ...partial,
  }
}

const root = resolve(process.cwd(), 'src/features/weddings/detail/v2')

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (e) {
    console.error(`FAIL  ${name}`)
    throw e
  }
}

run('1. Overview trimmed — no activity / questionnaires / admin / finance CTA', () => {
  const overview = readFileSync(resolve(root, 'WeddingOverviewWorkspace.tsx'), 'utf8')
  assert(!overview.includes('Ostatnia aktywność'), 'no recent activity')
  assert(!overview.includes('Ankieta do umowy'), 'no contract Q card')
  assert(!overview.includes('Ankieta przedślubna'), 'no prewedding card')
  assert(!overview.includes('WeddingManagementSection'), 'no management')
  assert(!existsSync(resolve(root, 'WeddingManagementSection.tsx')), 'management deleted')
  assert(!existsSync(resolve(root, 'WeddingContextSidebar.tsx')), 'sidebar deleted')
  assert(!existsSync(resolve(root, 'WeddingOverviewCurrentState.tsx')), 'current state deleted')
  assert(!existsSync(resolve(root, 'WeddingOverviewRecentActivity.tsx')), 'recent activity deleted')

  const essentials = readFileSync(resolve(root, 'WeddingOverviewEssentials.tsx'), 'utf8')
  assert(!essentials.includes('overview-finance-link'), 'no finance CTA')
  assert(!essentials.includes('Otwórz w Google Calendar'), 'no google open')
  assert(essentials.includes('Lokalizacje'), 'locations')
  assert(essentials.includes('Para i kontakt'), 'contact')
  assert(essentials.includes('Pakiet'), 'package')
  assert(essentials.includes('Kalendarze'), 'calendars')
})

run('2. Display name override vs derived couple title', () => {
  const base = stub()
  assertEq(
    getWeddingDisplayName(base),
    'Joanna Nowak i Krystian Kowalski',
    'derived',
  )
  assertEq(
    getWeddingDisplayName({ ...base, displayName: 'Joanna i Krystian — Willa' }),
    'Joanna i Krystian — Willa',
    'override',
  )
  assertEq(
    getWeddingDisplayName({ ...base, displayName: '   ' }),
    'Joanna Nowak i Krystian Kowalski',
    'blank clears to derived',
  )
  assertEq(
    getWeddingDisplayName({ ...base, displayName: null }),
    'Joanna Nowak i Krystian Kowalski',
    'null clears to derived',
  )
})

run('3. Identity dialog + date field present; service uses mapped displayName', () => {
  const dialog = readFileSync(resolve(root, 'WeddingIdentityEditDialog.tsx'), 'utf8')
  assert(dialog.includes('Nazwa wyświetlana'), 'label')
  assert(dialog.includes('Data ślubu'), 'date')
  assert(dialog.includes('type="date"'), 'date-only')
  assert(dialog.includes('displayName.trim() || null'), 'clear override')
  assert(dialog.includes('weddingService.update'), 'persist')
  const service = readFileSync(
    resolve(process.cwd(), 'src/lib/api/weddingService.ts'),
    'utf8',
  )
  assert(service.includes('displayName: mapped.displayName'), 'no stale override after clear')
  assert(service.includes('enqueueExternalCalendarSync'), 'calendar sync on update')
})

run('4. Contact channel rendering rules', () => {
  const ig = getCorrespondenceDisplay({
    channel: 'instagram',
    value: '@hallo',
  })
  assert(ig?.kind === 'external', 'instagram link')
  assertEq(ig?.label, '@hallo', 'handle label')
  assert(Boolean(ig && 'href' in ig && ig.href.includes('instagram.com/hallo')), 'safe url')

  const bad = getCorrespondenceDisplay({
    channel: 'facebook',
    value: 'not a url',
  })
  assert(bad?.kind === 'text', 'malformed facebook stays text')

  const empty = getCorrespondenceDisplay({ channel: 'instagram', value: '  ' })
  assertEq(empty, null, 'empty omitted')

  const essentials = readFileSync(resolve(root, 'WeddingOverviewEssentials.tsx'), 'utf8')
  assert(essentials.includes('channels.length > 0'), 'omit empty section')
})

run('5. Calendar overview status labels + manage link', () => {
  const essentials = readFileSync(resolve(root, 'WeddingOverviewEssentials.tsx'), 'utf8')
  assert(essentials.includes('Zsynchronizowano'), 'google synced')
  assert(essentials.includes('Niepołączony'), 'google disconnected')
  assert(essentials.includes('Aktywny'), 'apple active')
  assert(essentials.includes('Nieaktywny'), 'apple inactive')
  assert(essentials.includes('/ustawienia/integracje'), 'settings link')
  assert(essentials.includes('CalendarToneIcon'), 'icons')
})

run('6. Manual contract signing uses canonical status + signed_at', () => {
  const controls = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/components/detail/WeddingContractSignedControls.tsx',
    ),
    'utf8',
  )
  assert(controls.includes("updateStatus(wedding.id, 'signed')"), 'persist signed')
  assert(controls.includes('contract_signed'), 'timeline')
  assert(controls.includes('Oznacz umowę jako podpisaną'), 'action label')
  assert(controls.includes('Cofnij oznaczenie'), 'unsign')
  assert(!controls.includes('enqueueExternalCalendarSync'), 'no calendar on sign')
  assert(!controls.includes('Generuj'), 'no regenerate')

  const contractService = readFileSync(
    resolve(process.cwd(), 'src/lib/api/contractService.ts'),
    'utf8',
  )
  assert(contractService.includes("patch.signed_at = now"), 'sets signed_at')
  assert(contractService.includes('patch.signed_at = null'), 'clears on unsign')

  const signed = stub({ contract: { status: 'signed', signedAt: '2026-07-30' } })
  const progress = buildWeddingProgressSummary(signed, [])
  assert(
    progress.groups
      .find((g) => g.id === 'contract')!
      .items.some((i) => i.label === 'Umowa podpisana' && i.tone === 'complete'),
    'progress signed',
  )
  assertEq(progress.groups.length, 2, 'no payments domain')
  assertEq(
    getHeaderStatusBadges().length,
    1,
    'header type badge only (W4.2)',
  )
  assert(
    getHeaderStatusBadges().every((b) => b.label === 'Ślub'),
    'header Ślub only',
  )

  const unsigned = stub({ contract: { status: 'generated' } })
  assert(
    buildWeddingProgressSummary(unsigned, [])
      .groups.find((g) => g.id === 'contract')!
      .items.some((i) => i.label === 'Oczekuje na podpis'),
    'awaits signature',
  )
})

run('7. Header menu CSS / a11y hooks', () => {
  const actions = readFileSync(resolve(root, 'WeddingHeaderActions.tsx'), 'utf8')
  assert(actions.includes('aria-expanded'), 'menu expanded')
  assert(actions.includes('role="menu"'), 'menu role')
  assert(actions.includes('role="menuitem"'), 'menuitem')
  const css = readFileSync(resolve(root, 'WeddingDetailV2.module.css'), 'utf8')
  assert(css.includes('.headerMenu'), 'menu styles')
  assert(css.includes('.attentionCard'), 'attention styles')
  assert(css.includes('.calendarStatusList'), 'calendar styles')
})

console.log('\nwedding overview polish: done')
