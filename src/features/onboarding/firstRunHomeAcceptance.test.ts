/**
 * First-run Home Phase 1 — discriminator + CTA routing acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/onboarding/firstRunHomeAcceptance.test.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  isZeroWeddingHistory,
  shouldShowFirstRunHome,
} from '@/features/onboarding/firstRunDiscriminator'
import { FIRST_RUN_ROUTES } from '@/features/onboarding/firstRunRoutes'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (e) {
    console.error(`FAIL  ${name}`)
    throw e
  }
}

run('discriminator: zero weddings → first-run', () => {
  assert(isZeroWeddingHistory(0), 'zero history')
  assert(
    shouldShowFirstRunHome({ totalWeddingHistoryCount: 0 }),
    'show first-run',
  )
})

run('discriminator: any history (incl. archived) blocks first-run', () => {
  assert(!isZeroWeddingHistory(1), 'one wedding')
  assert(
    !shouldShowFirstRunHome({ totalWeddingHistoryCount: 1 }),
    'history blocks',
  )
  assert(
    !shouldShowFirstRunHome({ totalWeddingHistoryCount: 3 }),
    'multi history',
  )
})

run('discriminator: upcoming-empty is NOT the discriminator', () => {
  // Simulated: history exists even if UI upcoming is empty.
  assert(
    !shouldShowFirstRunHome({ totalWeddingHistoryCount: 2 }),
    'established empty season stays operational',
  )
})

run('discriminator: session skip only hides while history is still zero', () => {
  assert(
    !shouldShowFirstRunHome({
      totalWeddingHistoryCount: 0,
      sessionPreferOperationalDashboard: true,
    }),
    'session skip',
  )
  assert(
    !shouldShowFirstRunHome({
      totalWeddingHistoryCount: 1,
      sessionPreferOperationalDashboard: true,
    }),
    'history still wins',
  )
})

run('CTA routes map to existing product paths', () => {
  assertEq(FIRST_RUN_ROUTES.import, '/sluby/import', 'import')
  assertEq(FIRST_RUN_ROUTES.createExisting, '/sluby/nowy?quick=1', 'existing')
  assertEq(FIRST_RUN_ROUTES.createManual, '/sluby/nowy', 'manual')
  assertEq(
    FIRST_RUN_ROUTES.collectByQuestionnaire,
    '/ankiety/dane-do-umowy?generate=1',
    'questionnaire',
  )
})

run('Dashboard pages mount FirstRunHome on zero history', () => {
  const classic = read('src/pages/DashboardPage.tsx')
  const v3 = read('src/pages/DashboardV3Page.tsx')
  assert(classic.includes('FirstRunHome'), 'classic imports FirstRunHome')
  assert(v3.includes('FirstRunHome'), 'v3 imports FirstRunHome')
  assert(classic.includes('shouldShowFirstRunHome'), 'classic discriminator')
  assert(v3.includes('shouldShowFirstRunHome'), 'v3 discriminator')
  assert(
    classic.includes('totalWeddingHistoryCount: weddings.length'),
    'classic uses total list length',
  )
  assert(
    v3.includes('totalWeddingHistoryCount: weddings.length'),
    'v3 uses total list length',
  )
  assert(
    !classic.includes('getUpcomingAssignments'),
    'classic first-run not gated on upcoming helper',
  )
  const v3FirstRunStart = v3.indexOf('if (showFirstRun)')
  const v3AfterFirstRun = v3.indexOf('\n  return (', v3FirstRunStart + 1)
  const v3FirstRunBlock = v3.slice(
    v3FirstRunStart,
    v3AfterFirstRun > v3FirstRunStart ? v3AfterFirstRun : v3.length,
  )
  assert(v3FirstRunBlock.includes('FirstRunHome'), 'v3 first-run mounts FirstRunHome')
  assert(
    !v3FirstRunBlock.includes('desktopHeader'),
    'v3 first-run omits desktop operational header',
  )
  assert(
    v3FirstRunBlock.includes('width="wide"'),
    'v3 first-run uses wide content width',
  )
})

run('FirstRunHome copy + CTAs are present', () => {
  const home = read('src/features/onboarding/FirstRunHome.tsx')
  assert(home.includes('Witaj w OurWed'), 'welcome title')
  assert(home.includes('Zorganizujmy Twój sezon w jednym miejscu.'), 'headline')
  assert(home.includes('Jak chcesz zacząć?'), 'section')
  assert(home.includes('Mam już zlecenia'), 'path A')
  assert(home.includes('Mam nowe zlecenie'), 'path B')
  assert(home.includes('Importuj z pliku'), 'import CTA')
  assert(home.includes('Dodaj istniejące zlecenie ręcznie'), 'manual existing')
  assert(home.includes('Mam już dane pary'), 'manual new')
  assert(home.includes('Chcę zebrać dane ankietą'), 'questionnaire CTA')
  assert(
    home.includes(
      'Import nie wysyła żadnych wiadomości do Twoich klientów.',
    ),
    'import reassurance',
  )
  assert(home.includes('Zobacz, jak działa OurWed'), 'learn')
  assert(home.includes('Pomiń i przejdź do Pulpitu'), 'skip')
  assert(home.includes('Zacznij pracę w OurWed'), 'learn primary close')
  assert(home.includes('Przygotuj dzień ślubu'), 'learn day step')
  assert(
    home.includes(
      'Wyślij parze ankietę przedślubną, a harmonogram, miejsca i najważniejsze ustalenia trafią automatycznie do zlecenia.',
    ),
    'learn day step describes pre-wedding questionnaire automation',
  )
  assert(home.includes('Wedding Brief PDF'), 'learn day step mentions Wedding Brief')
  assert(
    !home.includes(
      'Przed realizacją zbierasz harmonogram, miejsca i najważniejsze ustalenia w jednym miejscu.',
    ),
    'generic day-prep copy removed',
  )
  assert(home.includes('Prowadź zlecenie do końca'), 'learn close-out step')
  assert(
    home.includes('Masz już umowę? Możesz dodać istniejący PDF lub DOCX'),
    'optional source-contract note',
  )
  assert(home.includes("size=\"story\""), 'story modal width')
  assert(home.includes('ShieldCheck'), 'import trust icon')
  assert(home.includes('FolderInput'), 'existing-season icon')
  assert(home.includes('ClipboardList'), 'new-booking icon')
  assert(home.includes('FIRST_RUN_ROUTES.import'), 'import route wired')
  assert(
    home.includes('FIRST_RUN_ROUTES.collectByQuestionnaire'),
    'questionnaire route wired',
  )
  assert(home.includes('secondaryCtaSupported'), 'questionnaire CTA presence')
  assert(!home.includes('37%'), 'no gamification')
  assert(!home.includes('emoji'), 'no emoji markers')
})

run('questionnaire generate deep-link + quick create query', () => {
  const editor = read('src/pages/ContractQuestionnaireEditorPage.tsx')
  const create = read('src/pages/NewWeddingPage.tsx')
  assert(editor.includes("searchParams.get('generate')"), 'generate query')
  assert(editor.includes('setGenerateOpen(true)'), 'opens generate modal')
  assert(editor.includes('billingLoading'), 'waits for billing gate')
  assert(editor.includes('if (billingLoading) return'), 'does not consume intent while loading')
  assert(create.includes("searchParams.get('quick')"), 'quick query')
  assert(create.includes('preferQuickCreate'), 'quick default')
})

run('session skip is not a DB onboarding state machine', () => {
  const pref = read('src/features/onboarding/firstRunSessionPreference.ts')
  assert(pref.includes('sessionStorage'), 'session only')
  assert(!pref.includes('supabase'), 'no supabase')
  assert(!pref.includes('from('), 'no table writes')
})

console.log('\nAll first-run Home acceptance checks passed.')
