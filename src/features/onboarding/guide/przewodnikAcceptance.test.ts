/**
 * Phase 2 Guide — V3.2 final copy + micro-UX acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/onboarding/guide/przewodnikAcceptance.test.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deriveSetupGuidanceState } from '@/features/onboarding/setup/setupGuidanceReadiness'
import { SETUP_GUIDANCE_ROUTES } from '@/features/onboarding/setup/setupGuidanceRoutes'
import { FIRST_RUN_ROUTES } from '@/features/onboarding/firstRunRoutes'
import {
  GUIDE_DEFAULT_CATEGORY_ID,
  GUIDE_EDUCATION_ROUTES,
  GUIDE_LEARN_CATEGORIES,
} from '@/features/onboarding/guide/guideEducationContent'
import { buildGuidePrepareModules } from '@/features/onboarding/guide/guidePreparePresentation'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
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

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function categoryText(category: (typeof GUIDE_LEARN_CATEGORIES)[number]) {
  return [
    category.headline,
    category.intro,
    ...(category.paths?.map((p) => `${p.label} ${p.body} ${p.outcome}`) ?? []),
    ...(category.flow?.map((f) => f.label) ?? []),
    ...(category.facts?.map((f) => `${f.label} ${f.body}`) ?? []),
    category.inset
      ? `${category.inset.title} ${category.inset.body} ${category.inset.footnote ?? ''}`
      : '',
    category.note ?? '',
    ...category.actions.map((a) => a.to),
  ].join('\n')
}

run('V3.2 rail + canvas architecture preserved', () => {
  const content = read(
    'src/features/onboarding/guide/PrzewodnikPageContent.tsx',
  )
  assert(content.includes('role="tablist"'), 'tablist')
  assert(content.includes('role="tabpanel"'), 'tabpanel')
  assert(content.includes('featureRail'), 'rail')
  assert(content.includes('StoryCanvas'), 'canvas')
  assert(!content.includes('learnNav'), 'no left nav')
  assert(!content.includes('Dowiedz się więcej'), 'no accordion')
  assert(GUIDE_LEARN_CATEGORIES.length === 5, 'five categories')
  assert(GUIDE_DEFAULT_CATEGORY_ID === 'zlecenia', 'default Zlecenia')
})

run('page + prepare ledes', () => {
  const content = read(
    'src/features/onboarding/guide/PrzewodnikPageContent.tsx',
  )
  assert(
    content.includes(
      'Przygotuj OurWed do swojej pracy i zobacz, jak wykorzystać',
    ),
    'page lede',
  )
  assert(
    content.includes(
      'Ustaw podstawy raz, a OurWed wykorzysta je przy kolejnych zleceniach.',
    ),
    'prepare lede',
  )
})

run('preparation statuses sentence case + action labels', () => {
  const zero = buildGuidePrepareModules(
    deriveSetupGuidanceState({ packages: [], companyName: null }),
  )
  const packages = zero.find((m) => m.id === 'packages')!
  const templates = zero.find((m) => m.id === 'templates')!
  const company = zero.find((m) => m.id === 'company')!
  assert(packages.statusLabel === 'Do ustawienia', 'packages status')
  assert(templates.statusLabel === 'Wymaga pakietu', 'template dependency')
  assert(company.statusLabel === 'Opcjonalne', 'company optional')
  assert(packages.actions[0]?.label === 'Dodaj pakiet →', 'packages CTA')
  assert(company.actions[0]?.label === 'Uzupełnij dane →', 'company CTA')
  assert(templates.actions.length === 0, 'no dead template CTA')

  const mid = buildGuidePrepareModules(
    deriveSetupGuidanceState({
      packages: [{ id: 'p1', name: 'A', activeContractTemplateId: null }],
      companyName: null,
    }),
  )
  assert(
    mid.find((m) => m.id === 'packages')?.statusLabel === 'Pakiet dodany',
    'started package label',
  )
  assert(
    mid.find((m) => m.id === 'templates')?.actions[0]?.label ===
      'Dodaj wzór umowy →',
    'template CTA after package',
  )

  const ready = buildGuidePrepareModules(
    deriveSetupGuidanceState({
      packages: [
        {
          id: 'p1',
          name: 'A',
          activeContractTemplateId: 't1',
        },
      ],
      companyName: 'Studio',
    }),
  )
  assert(
    ready.find((m) => m.id === 'packages')?.statusLabel === 'Gotowe',
    'ready packages',
  )
  assert(
    ready.find((m) => m.id === 'company')?.statusLabel === 'Gotowe',
    'ready company Gotowe not Uzupełnione',
  )
  assert(
    ready.find((m) => m.id === 'packages')?.actions[0]?.label ===
      'Zobacz pakiety →',
    'ready packages CTA',
  )
  assert(
    ready.find((m) => m.id === 'company')?.actions[0]?.label === 'Edytuj dane →',
    'ready company CTA',
  )

  const css = read('src/features/onboarding/guide/PrzewodnikPage.module.css')
  const statusBlock = css.slice(
    css.indexOf('.statusReady,'),
    css.indexOf('.moduleFooter'),
  )
  assert(statusBlock.includes('text-transform: none'), 'sentence case statuses')
  assert(!statusBlock.includes('uppercase'), 'no uppercase status styling')
  assert(
    packages.actions[0]?.to === SETUP_GUIDANCE_ROUTES.packages,
    'packages route',
  )
})

run('Zlecenia: alternatives + truthful questionnaire outcome', () => {
  const zlecenia = GUIDE_LEARN_CATEGORIES.find((c) => c.id === 'zlecenia')!
  assert(zlecenia.composition === 'begin-paths', 'begin-paths')
  assert(Boolean(zlecenia.paths && zlecenia.paths.length === 3), 'three paths')
  assert(!zlecenia.flow, 'no sequential flow chips')
  const [importPath, manualPath, questionnairePath] = zlecenia.paths!
  assert(importPath.outcome === '→ Zlecenie', 'import → wedding')
  assert(manualPath.outcome === '→ Zlecenie', 'manual → wedding')
  assert(
    questionnairePath.outcome.includes('Oczekujące'),
    'questionnaire via pending',
  )
  assert(
    questionnairePath.outcome.includes('Zlecenie'),
    'questionnaire ends in wedding',
  )
  assert(
    !questionnairePath.outcome.match(/^→ Zlecenie$/),
    'questionnaire not direct wedding',
  )
  const text = categoryText(zlecenia)
  assert(text.includes('potwierdzone zlecenia'), 'confirmed bookings')
  assert(text.includes('nie zapytania'), 'not inquiries')
  assert(text.includes('nie jest wtedy wymagana'), 'questionnaire optional')
  assert(
    text.includes('ustalane przy tworzeniu linku'),
    'user-facing package note',
  )
  assert(!text.includes('snapshot'), 'no snapshot jargon')
  assert(!text.includes('options_snapshot'), 'no options_snapshot')
  assert(!text.includes('katalogu'), 'no catalog internals')
  assert(text.includes('bez automatycznych wiadomości do pary'), 'no auto msg')
  const content = read(
    'src/features/onboarding/guide/PrzewodnikPageContent.tsx',
  )
  assert(content.includes('path.outcome'), 'renders per-path outcome')
  assert(!content.includes("→ Zlecenie'"), 'no hardcoded shared outcome string')
})

run('Umowy: natural gates + manual lifecycle + Source Contract', () => {
  const umowy = GUIDE_LEARN_CATEGORIES.find((c) => c.id === 'umowy')!
  const text = categoryText(umowy)
  assert(text.includes('komplet informacji'), 'natural gate wording')
  assert(text.includes('miejsce przyjęcia'), 'reception')
  assert(text.includes('dojazdu i płatności'), 'travel + payments')
  assert(text.includes('oznaczasz umowę jako wysłaną'), 'manual sent')
  assert(text.includes('jako podpisaną'), 'manual signed')
  assert(text.includes('nie wysyła umów e-mailem'), 'no email')
  assert(text.includes('podpisu elektronicznego'), 'no e-sign')
  assert(umowy.inset?.title.includes('umowę'), 'source inset')
  assert(
    umowy.inset?.footnote?.includes('karcie zlecenia'),
    'source on wedding card',
  )
  assert(!text.includes('pakiet + wzór = umowa'), 'no oversimplification')
})

run('Dzień ślubu: flow labels + offline truth', () => {
  const day = GUIDE_LEARN_CATEGORIES.find((c) => c.id === 'dzien-slubu')!
  const text = categoryText(day)
  assert(text.includes('Ankieta przedślubna'), 'pre-wedding')
  assert(text.includes('Plan dnia i miejsca'), 'plan + places')
  assert(text.includes('Dane w zleceniu'), 'data in wedding')
  assert(text.includes('Wedding Brief PDF'), 'brief')
  assert(!text.includes('Plan dnia w zleceniu'), 'no duplicated Plan dnia')
  assert(text.includes('działa online'), 'online-only')
  assert(
    text.includes('pobierz Wedding Brief przed realizacją'),
    'offline note',
  )
  assert(!text.includes('offline app'), 'no offline app')
  assert(!text.includes('gotowe do realizacji'), 'no overclaim readiness')
})

run('Finanse: natural copy + wedding-level due + travel', () => {
  const finanse = GUIDE_LEARN_CATEGORIES.find((c) => c.id === 'finanse')!
  const text = categoryText(finanse)
  assert(text.includes('w jednym miejscu'), 'headline place')
  assert(!text.includes('w jednym obrazie'), 'no obrazie')
  assert(text.includes('Pakiet'), 'package in value')
  assert(text.includes('Usługi dodatkowe'), 'extras')
  assert(text.includes('Płatny dojazd'), 'charged travel')
  assert(text.includes('Wartość umowy'), 'total')
  assert(text.includes('Termin płatności końcowej'), 'due label')
  assert(text.includes('całego zlecenia'), 'wedding-level')
  assert(text.includes('Nie jest przypisywany osobno'), 'not per payment')
  assert(text.includes('Nieustalony'), 'travel unresolved UI label')
  assert(text.includes('W cenie'), 'travel included UI label')
  assert(
    text.includes('dolicza się do wartości tylko wtedy, gdy jest płatny'),
    'paid travel note',
  )
  assert(!text.includes('payment_date'), 'no payment_date jargon')
  assert(!text.includes('unresolved'), 'no english enum')
})

run('Organizacja: verified notification/task/calendar truth', () => {
  const org = GUIDE_LEARN_CATEGORIES.find((c) => c.id === 'organizacja')!
  const text = categoryText(org)
  assert(text.includes('zadania na dziś'), 'dashboard tasks today')
  assert(
    text.includes('przy konkretnych zleceniach albo dla całej firmy'),
    'task scopes',
  )
  assert(!text.includes('automatycznie'), 'no auto-task claim')
  assert(text.includes('zleceń i sesji'), 'calendar sessions')
  assert(text.includes('ankietę do umowy'), 'contract notif')
  assert(text.includes('ankietę przedślubną'), 'prewedding notif')
  assert(text.includes('również e-mailem'), 'optional email')
  assert(text.includes('Oczekujące'), 'pending inset')
  assert(!text.includes('każdej zmianie'), 'no overclaim notifications')
})

run('verified routes only', () => {
  const router = read('src/routes/router.tsx')
  for (const route of Object.values(GUIDE_EDUCATION_ROUTES)) {
    const path = route.split('?')[0]
    assert(
      router.includes(`path: '${path}'`) || router.includes(`path: "${path}"`),
      `route ${path}`,
    )
  }
  assert(
    GUIDE_EDUCATION_ROUTES.addBooking === FIRST_RUN_ROUTES.createManual,
    'add booking',
  )
  const joined = GUIDE_LEARN_CATEGORIES.map(categoryText).join('\n')
  assert(!joined.includes('/umowy/zrodlowa'), 'no invented source route')
  assert(!joined.includes('/wedding-brief/new'), 'no invented brief route')
})

run('Guide page free of discovery modal (integration lives outside V3.2 content)', () => {
  const content = read(
    'src/features/onboarding/guide/PrzewodnikPageContent.tsx',
  )
  assert(!content.includes('GuideDiscoveryModal'), 'no discovery modal in Guide page')
  assert(!content.includes('guideNeedsAttention'), 'no attention flag in Guide page')
})

run('2A preserved', () => {
  const v3 = read('src/pages/DashboardV3Page.tsx')
  assert(!v3.includes('SetupGuidancePanel'), 'no setup panel')
  assert(
    v3.includes("data-has-upcoming={nextThree.length > 0 ? 'true' : 'false'}"),
    'grid fix',
  )
})

run('card-stack reduced: facts + footnote inset', () => {
  const css = read('src/features/onboarding/guide/PrzewodnikPage.module.css')
  const content = read(
    'src/features/onboarding/guide/PrzewodnikPageContent.tsx',
  )
  assert(css.includes('factList'), 'fact list')
  assert(content.includes('factList'), 'facts rendered')
  assert(css.includes('storyInsetFootnote'), 'inset footnote style')
  assert(content.includes('storyInsetFootnote'), 'footnote rendered')
  assert(!content.includes('storyModules'), 'old module cards gone')
  assert(css.includes('pathBoard'), 'path board')
})

run('mobile begin-paths denser + themed primary CTA', () => {
  const css = read('src/features/onboarding/guide/PrzewodnikPage.module.css')
  const content = read(
    'src/features/onboarding/guide/PrzewodnikPageContent.tsx',
  )
  assert(content.includes('storyInsetMobile'), 'mobile inset in main column')
  assert(content.includes('storyInsetDesktop'), 'desktop inset stays in aside')
  assert(
    content.includes('data-testid="przewodnik-inset-mobile"'),
    'mobile inset test id',
  )
  assert(
    css.includes(".storyCanvas[data-composition='begin-paths'] .storySide"),
    'mobile hides empty begin-paths side',
  )
  assert(css.includes('storyInsetMobile'), 'mobile inset class')
  assert(
    css.includes(
      'background: var(--button-primary-background, var(--color-accent))',
    ),
    'primary CTA uses appearance theme button token',
  )
  assert(
    !css.includes('background: var(--color-text-primary);'),
    'primary CTA no longer hard-coded text color fill',
  )
  // Desktop begin-paths is 1.35/0.65 — mobile/tablet must override that
  // higher-specificity rule or an empty right rail remains.
  const tabletBlock = css.slice(
    css.indexOf('@media (max-width: 1099px)'),
    css.indexOf('@media (max-width: 767px)'),
  )
  assert(
    tabletBlock.includes(
      ".storyCanvas[data-composition='begin-paths'] {\n    grid-template-columns: 1fr;",
    ),
    '≤1099px begin-paths collapses to one column',
  )
  const mobileBlock = css.slice(css.indexOf('@media (max-width: 767px)'))
  assert(
    mobileBlock.includes(
      ".storyCanvas[data-composition='begin-paths'] {\n    grid-template-columns: 1fr;",
    ),
    '≤767px begin-paths stays one column',
  )
  assert(mobileBlock.includes('.pathBoard {\n    gap: var(--space-2);\n    width: 100%;'), 'path board full width')
  assert(
    css.includes(
      "grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.65fr)",
    ),
    'desktop begin-paths side rail preserved',
  )
  for (const id of [
    'zlecenia',
    'umowy',
    'dzien-slubu',
    'finanse',
    'organizacja',
  ] as const) {
    assert(
      GUIDE_LEARN_CATEGORIES.some((c) => c.id === id),
      `theme category present: ${id}`,
    )
  }
})

console.log('\nAll Przewodnik V3.2 acceptance checks passed.')
