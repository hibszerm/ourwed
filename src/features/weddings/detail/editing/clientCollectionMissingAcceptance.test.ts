/**
 * Path A client-collection missing groups — acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/weddings/detail/editing/clientCollectionMissingAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { listClientCollectionMissingGroups } from '@/features/weddings/detail/editing/clientCollectionMissing'
import { applyWeddingPlaces } from '@/lib/api/weddings/weddingHydrate'
import { resolveWeddingEditOverlayPresentation } from '@/features/weddings/detail/editing/weddingEditorTypes'
import type { Wedding } from '@/types/wedding'
import type { WeddingPlace } from '@/types/travel'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function assertEq<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    throw err
  }
}

function baseWedding(overrides: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w-client-collection',
    userId: 'u1',
    date: '2027-06-15',
    status: 'active',
    price: 0,
    couple: {
      partner1: 'Anna Kowalska',
      partner2: 'Jan Kowalski',
      partner1FirstName: 'Anna',
      partner1LastName: 'Kowalska',
      partner2FirstName: 'Jan',
      partner2LastName: 'Kowalski',
      partner1Phone: '+48111111111',
      partner1Address: 'ul. Testowa 1',
      partner1PostalCode: '00-001',
      partner1City: 'Warszawa',
      phone: '+48111111111',
    },
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    payments: [],
    notes: [],
    timeline: [],
    receptionLocation: 'Pałac Testowy',
    ...overrides,
  } as Wedding
}

run('1. contacts-only missing → Dane pary group only', () => {
  const w = baseWedding({
    couple: {
      ...baseWedding().couple,
      partner1Phone: '',
      phone: '',
      partner1Address: '',
      partner1PostalCode: '',
      partner1City: '',
    },
  })
  const groups = listClientCollectionMissingGroups(w)
  assertEq(groups.length, 1, 'one group')
  assertEq(groups[0]?.id, 'couple', 'couple')
  assertEq(groups[0]?.section, 'contacts', 'contacts dest')
  assert(!groups.some((g) => g.id === 'places'), 'no places')
})

run('2. reception-only missing → places group only', () => {
  const w = baseWedding({ receptionLocation: undefined })
  const groups = listClientCollectionMissingGroups(w)
  assertEq(groups.length, 1, 'one group')
  assertEq(groups[0]?.id, 'places', 'places')
  assertEq(groups[0]?.section, 'locations', 'locations dest')
  assert(!groups.some((g) => g.id === 'couple'), 'no couple')
})

run('3. multiple missing → couple + places', () => {
  const w = baseWedding({
    receptionLocation: undefined,
    couple: {
      ...baseWedding().couple,
      partner1Phone: '',
      phone: '',
    },
  })
  const groups = listClientCollectionMissingGroups(w)
  assertEq(groups.length, 2, 'two groups')
  assertEq(groups[0]?.id, 'couple', 'couple first')
  assertEq(groups[1]?.id, 'places', 'places second')
})

run('4. date-only missing → wedding_core', () => {
  const w = baseWedding({ date: '' })
  const groups = listClientCollectionMissingGroups(w)
  assert(groups.some((g) => g.id === 'wedding_core'), 'date group')
  assertEq(
    groups.find((g) => g.id === 'wedding_core')?.section,
    'wedding',
    'wedding section',
  )
})

run('5. reception via wedding_places satisfies places group', () => {
  const w = baseWedding({ receptionLocation: undefined })
  const places: WeddingPlace[] = [
    {
      id: 'p1',
      weddingId: w.id,
      role: 'reception',
      label: 'Pałac',
      formattedAddress: 'Pałac Goetz',
      latitude: 1,
      longitude: 2,
      placeId: 'geo1',
      sortOrder: 0,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ]
  const hydrated = applyWeddingPlaces(w, places)
  const groups = listClientCollectionMissingGroups(hydrated)
  assert(!groups.some((g) => g.id === 'places'), 'places resolved')
})

run('6. complete client collection → empty groups', () => {
  assertEq(listClientCollectionMissingGroups(baseWedding()).length, 0, 'empty')
})

run('7. no package/travel items in groups', () => {
  const w = baseWedding({
    receptionLocation: undefined,
    packageName: undefined,
    price: 0,
  })
  const groups = listClientCollectionMissingGroups(w)
  const blob = JSON.stringify(groups)
  assert(!blob.includes('pakiet'), 'no package')
  assert(!blob.includes('dojazd'), 'no travel')
  assert(!blob.includes('zadatek'), 'no deposit')
})

run('8. overlay presentation: all standard sections centered', () => {
  assertEq(
    resolveWeddingEditOverlayPresentation('contacts'),
    'centered',
    'contacts',
  )
  assertEq(
    resolveWeddingEditOverlayPresentation('wedding'),
    'centered',
    'wedding',
  )
  assertEq(
    resolveWeddingEditOverlayPresentation('locations'),
    'centered',
    'locations',
  )
  assertEq(
    resolveWeddingEditOverlayPresentation('package'),
    'centered',
    'package',
  )
  assertEq(
    resolveWeddingEditOverlayPresentation('finances'),
    'centered',
    'finances',
  )
  assertEq(
    resolveWeddingEditOverlayPresentation('tasks'),
    'centered',
    'tasks',
  )
  assertEq(
    resolveWeddingEditOverlayPresentation('notes'),
    'centered',
    'notes',
  )
})

run('9. wiring: checklist + dispatch + host', () => {
  const root = resolve(process.cwd())
  const read = (p: string) => readFileSync(resolve(root, p), 'utf8')
  const dialog = read(
    'src/features/weddings/detail/editing/ClientCollectionMissingDialog.tsx',
  )
  const host = read('src/features/weddings/detail/useWeddingDetailHost.ts')
  const modals = read('src/features/weddings/detail/WeddingDetailHostModals.tsx')
  const v2 = read('src/features/weddings/detail/v2/WeddingDetailV2.tsx')
  const modern = read(
    'src/features/weddings/modern-detail/ModernWeddingDetailWorkspace.tsx',
  )
  const resolver = read('src/lib/workflow/resolveWeddingNextAction.ts')

  assert(dialog.includes('client-collection-missing-dialog'), 'dialog testid')
  assert(dialog.includes('listClientCollectionMissingGroups'), 'groups helper')
  assert(dialog.includes('applyWeddingPlaces'), 'places hydrate')
  assert(!dialog.includes('Wyślij ankietę'), 'no questionnaire CTA')
  assert(host.includes("type: 'client_collection'"), 'host modal')
  assert(host.includes('openClientCollectionChecklist'), 'open checklist')
  assert(host.includes('resumeClientCollection'), 'resume flag')
  assert(modals.includes('ClientCollectionMissingDialog'), 'modals wired')
  assert(v2.includes('onOpenClientCollectionChecklist'), 'classic checklist')
  assert(v2.includes('resolveWeddingEditOverlayPresentation'), 'classic overlay')
  assert(modern.includes('onOpenClientCollectionChecklist'), 'modern checklist')
  assert(
    modern.includes('resolveWeddingEditOverlayPresentation'),
    'modern overlay',
  )
  assert(
    resolver.includes("intent: 'complete_client_collection'"),
    'resolver destination',
  )
  assert(
    v2.includes('onOpenClientCollectionChecklist?.()'),
    'classic next-action opens checklist',
  )
  assert(
    modern.includes('onOpenClientCollectionChecklist?.()'),
    'modern next-action opens checklist',
  )
})

console.log('\nOK client collection missing acceptance')
