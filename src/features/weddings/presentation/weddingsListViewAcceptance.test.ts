/**
 * Weddings page grid/list view + card cleanup acceptance.
 * Run: npm run test:weddings-list-view
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseWeddingsViewMode,
  readWeddingsViewMode,
  writeWeddingsViewMode,
  WEDDINGS_VIEW_MODE_KEY,
} from '@/features/weddings/presentation/weddingsViewMode'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { formatCurrency } from '@/lib/utils/currency'
import { WORKFLOW_STAGE_LABELS } from '@/lib/utils/workflow'
import type { Couple, Wedding } from '@/types/wedding'
import type { WeddingPlace } from '@/types/travel'

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

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function couple(partial: Partial<Couple> = {}): Couple {
  return {
    partner1: 'Marcin Nowak',
    partner2: 'Anna Nowak',
    email: '',
    phone: '',
    venue: '',
    city: '',
    ...partial,
  }
}

function wedding(partial: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w-list-1',
    couple: couple(),
    date: '2026-07-24',
    status: 'active',
    workflowStage: 'deposit',
    packageName: 'Video Mini',
    price: 12000,
    packageItems: [],
    checklist: [],
    schedule: [],
    payments: [
      {
        id: 'p1',
        label: 'Zadatek',
        amount: 3500,
        type: 'deposit',
        paid: true,
        paidAt: '2026-02-01',
      },
    ],
    finances: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '#000',
    createdAt: '2026-01-01T00:00:00.000Z',
    primaryLocation: {
      venueName: 'Villa Love',
      locality: 'Izdebnik',
      displayText: 'Villa Love, Izdebnik',
      source: 'reception',
    },
    ...partial,
  }
}

function place(
  role: WeddingPlace['role'],
  formattedAddress: string,
  label: string | null = null,
): WeddingPlace {
  return {
    id: `${role}-1`,
    weddingId: 'w-list-1',
    role,
    label,
    formattedAddress,
    placeId: null,
    latitude: null,
    longitude: null,
    sortOrder: 10,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }
}

// --- View preference ---

run('1. Default view is grid without preference', () => {
  assertEq(parseWeddingsViewMode(null), 'grid', 'null')
  assertEq(parseWeddingsViewMode(undefined), 'grid', 'undefined')
  assertEq(parseWeddingsViewMode(''), 'grid', 'empty')
})

run('2. Valid preferences parse', () => {
  assertEq(parseWeddingsViewMode('list'), 'list', 'list')
  assertEq(parseWeddingsViewMode('grid'), 'grid', 'grid')
})

run('3. Invalid stored preference falls back to grid', () => {
  assertEq(parseWeddingsViewMode('table'), 'grid', 'table')
  assertEq(parseWeddingsViewMode('cards'), 'grid', 'cards')
  assertEq(parseWeddingsViewMode('{bad}'), 'grid', 'junk')
})

run('4. Preference persists via stable localStorage key', () => {
  assertEq(WEDDINGS_VIEW_MODE_KEY, 'ourwed:weddings-view-mode', 'key')
  const store = new Map<string, string>()
  const original = globalThis.localStorage
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage
  try {
    assertEq(readWeddingsViewMode(), 'grid', 'default read')
    writeWeddingsViewMode('list')
    assertEq(store.get(WEDDINGS_VIEW_MODE_KEY), 'list', 'stored list')
    assertEq(readWeddingsViewMode(), 'list', 'read list')
    writeWeddingsViewMode('grid')
    assertEq(readWeddingsViewMode(), 'grid', 'switch back')
  } finally {
    globalThis.localStorage = original
  }
})

// --- Shared presentation data ---

run('5. List and card share display helpers for same wedding', () => {
  const w = wedding()
  const places = [place('reception', 'Lwowska 78, 34-144 Izdebnik', 'Villa Love')]
  const name = getWeddingDisplayName(w)
  const location = getWeddingPrimaryLocationSummary(w, places)
  const commercial = getWeddingCommercialSummary(w)

  assertEq(name, 'Marcin Nowak i Anna Nowak', 'name')
  assertEq(location.displayText, 'Villa Love, Izdebnik', 'venue')
  assert(!location.displayText?.includes('Lwowska'), 'no street')
  assert(formatCurrency(commercial.remainingToPay).includes('zł'), 'pln')
  assertEq(WORKFLOW_STAGE_LABELS[w.workflowStage], 'Zadatek', 'stage label')
})

run('6. Same order preserved for shared collection', () => {
  const list = [
    wedding({ id: 'a', couple: couple({ partner1: 'A', partner2: 'B' }) }),
    wedding({ id: 'b', couple: couple({ partner1: 'C', partner2: 'D' }) }),
    wedding({ id: 'c', couple: couple({ partner1: 'E', partner2: 'F' }) }),
  ]
  const ids = list.map((w) => w.id)
  assertEq(ids.join(','), 'a,b,c', 'order')
  assertEq(
    list.map((w) => getWeddingDisplayName(w)).join('|'),
    'A i B|C i D|E i F',
    'names follow order',
  )
})

run('7. Missing package/location still produce scannable fields', () => {
  const w = wedding({
    packageName: '',
    primaryLocation: undefined,
    couple: couple({ venue: '', city: '' }),
  })
  const location = getWeddingPrimaryLocationSummary(w)
  const commercial = getWeddingCommercialSummary(w)
  assertEq(location.displayText, null, 'no location')
  assert(!commercial.packageName?.trim(), 'no package')
  assert(getWeddingDisplayName(w).length > 0, 'name remains')
})

// --- Source wiring ---

run('8. WeddingsPage wires switcher, preference, season grouping, exclusive views', () => {
  const page = src('src/pages/WeddingsPage.tsx')
  assert(page.includes('WeddingsViewSwitch'), 'switcher')
  assert(page.includes('readWeddingsViewMode'), 'read pref')
  assert(page.includes('writeWeddingsViewMode'), 'write pref')
  assert(page.includes('SeasonGroupedList'), 'shared season list')
  assert(page.includes('formatWeddingSeasonCount'), 'wedding counts')
  assert(page.includes("viewMode === 'list'"), 'list branch')
  assert(page.includes('<WeddingList'), 'list component')
  assert(page.includes('WeddingCard'), 'grid cards')
  assert(page.includes('weddings-grid') || page.includes('styles.grid'), 'grid')
  assert(
    page.includes("viewMode === 'list' ?") || page.includes("viewMode === 'list'"),
    'conditional render',
  )
  assert(!page.includes('<WeddingList') || !page.includes('hidden'), 'no hidden dual render')
})

run('9. View switcher is accessible segmented control', () => {
  const sw = src('src/features/weddings/components/WeddingsViewSwitch.tsx')
  assert(sw.includes('aria-pressed'), 'aria-pressed')
  assert(sw.includes('aria-label="Kafelki"'), 'grid label')
  assert(sw.includes('aria-label="Lista"'), 'list label')
  assert(sw.includes('role="group"'), 'group')
  assert(sw.includes('Kafelki'), 'label text')
  assert(sw.includes('Lista'), 'list text')
})

run('10. WeddingCard removes Workflow label/progress, keeps stage', () => {
  const card = src('src/features/weddings/components/WeddingCard.tsx')
  const css = src('src/features/weddings/components/WeddingCard.module.css')
  assert(card.includes('WorkflowBadge'), 'stage badge remains')
  assert(!card.includes('ProgressBar'), 'no progress bar')
  assert(!card.includes('getWorkflowProgress'), 'no progress helper')
  assert(!card.includes("'Workflow'") && !card.includes('"Workflow"'), 'no Workflow label')
  assert(!css.includes('progressLabel'), 'no progress css')
  assert(card.includes('getWeddingPrimaryLocationSummary'), 'shared location')
  assert(card.includes('getWeddingDisplayName'), 'shared name')
  assert(card.includes('formatDate'), 'date kept')
  assert(card.includes('getDaysUntil'), 'relative date kept')
})

run('11. WeddingList shows expected desktop fields without address', () => {
  const list = src('src/features/weddings/components/WeddingList.tsx')
  const css = src('src/features/weddings/components/WeddingList.module.css')
  assert(list.includes('getWeddingDisplayName'), 'name helper')
  assert(list.includes('getWeddingPrimaryLocationSummary'), 'location helper')
  assert(list.includes('formatCurrency'), 'currency')
  assert(list.includes('remainingToPay'), 'remaining')
  assert(list.includes('WorkflowBadge'), 'stage')
  assert(list.includes('IconChevronRight'), 'chevron')
  assert(list.includes('to={`/sluby/${wedding.id}`}'), 'navigation')
  assert(list.includes('<ul'), 'semantic list')
  assert(list.includes('<li'), 'list items')
  assert(list.includes('aria-label={`Otwórz ślub:'), 'row a11y')
  assert(!list.includes('ProgressBar'), 'no progress')
  assert(!list.includes('getWorkflowProgress'), 'no progress helper')
  assert(!list.includes('formattedAddress'), 'no full address field')
  assert(!list.includes('street'), 'no street')
  assert(css.includes('@media (max-width: 720px)'), 'mobile breakpoint')
  assert(css.includes('grid-template-areas:'), 'mobile stacked areas')
  assert(css.includes("'name stage'"), 'mobile name+stage')
  assert(css.includes('min-height: 4.75rem'), 'touch height')
  assert(css.includes('-webkit-line-clamp: 2'), 'name clamp')

  // Desktop DOM order: date → name → venue → package → remaining → stage → chevron
  const rowStart = list.indexOf('className={styles.row}')
  const rowChunk = list.slice(rowStart, list.indexOf('</Link>', rowStart))
  const datePos = rowChunk.indexOf('styles.date')
  const namePos = rowChunk.indexOf('styles.name')
  const venuePos = rowChunk.indexOf('styles.venue')
  const packagePos = rowChunk.indexOf('styles.package')
  const remainingPos = rowChunk.indexOf('styles.remainingWrap')
  const stagePos = rowChunk.indexOf('styles.stage')
  const chevronPos = rowChunk.indexOf('styles.chevron')
  assert(datePos >= 0 && namePos > datePos, 'date before name in JSX')
  assert(venuePos > namePos, 'name before venue')
  assert(packagePos > venuePos, 'venue before package')
  assert(remainingPos > packagePos, 'package before remaining')
  assert(stagePos > remainingPos, 'remaining before stage')
  assert(chevronPos > stagePos, 'stage before chevron')
  assert(
    /grid-template-columns:\s*7rem\s+minmax\(10rem/.test(css),
    'date column (7rem) precedes name column in grid-template-columns',
  )
})

run('12. Workflow domain model untouched', () => {
  const types = src('src/types/wedding.ts')
  assert(types.includes('workflowStage'), 'stage on Wedding')
  const engine = src('src/lib/workflow/workflowEngine.ts')
  assert(engine.includes('getWorkflowSnapshot'), 'engine remains')
  const utils = src('src/lib/utils/workflow.ts')
  assert(utils.includes('getWorkflowProgress'), 'progress util remains for other surfaces')
})

run('13. Empty/loading/error stay page-level', () => {
  const page = src('src/pages/WeddingsPage.tsx')
  assert(page.includes('isLoading'), 'loading')
  assert(page.includes('isError'), 'error')
  assert(page.includes('EmptyState'), 'empty')
  assert(page.includes('Brak ślubów'), 'empty copy')
  // Switcher only when there are weddings
  assert(
    page.includes('weddings.length > 0') || page.includes('weddings && weddings.length'),
    'switcher gated',
  )
})

if (process.exitCode) {
  console.error('\nWeddings list view acceptance failed.')
  process.exit(1)
} else {
  console.log('\nAll weddings list view checks passed.')
}
