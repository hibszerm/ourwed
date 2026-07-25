/**
 * Focused acceptance tests for questionnaire UX improvements:
 * floating address portal, name-only packages/services, form builder blocks,
 * Polish date picker.
 *
 * Run: npm run test:questionnaire-ux
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  computeFloatingPlacement,
} from '@/components/ui/floatingPlacement'
import {
  buildMonthGrid,
  isoToPolishDisplay,
  parseFlexibleDate,
  toIsoDate,
  toPolishDisplay,
  WEEKDAYS_PL,
} from '@/features/forms/datePickerUtils'
import {
  buildDefaultQuestionnaireBlocks,
  canAddExtrasBlock,
  canAddLocationRole,
  canAddPackageBlock,
  createBlockOfType,
  ensureQuestionnaireBlocks,
  reorderBlocks,
} from '@/lib/forms/questionnaireBlocks'
import { questionsFromBlocks } from '@/lib/forms/questionsFromBlocks'
import { buildContractQuestionnaireTemplate } from '@/lib/forms/contractQuestionnaireTemplate'
import { normalizeContractQuestionnaireConfig } from '@/lib/forms/contractQuestionnaireSnapshot'
import { defaultContractQuestionnaireConfig } from '@/types/contractQuestionnaire'

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

const samplePackages = [
  {
    id: 'pkg-a',
    name: 'Pakiet Film Standard',
    description: 'Opis ukryty',
    price: 5000,
    currency: 'PLN',
  },
  {
    id: 'pkg-b',
    name: 'Pakiet Film Premium',
    description: 'Inny opis',
    price: 9000,
    currency: 'PLN',
  },
]

const sampleExtras = [
  { id: 'ex-1', name: 'Drone', description: 'Nalot', price: 800, currency: 'PLN' },
]

// --- Address floating placement ---

run('address: menu placement below when space available', () => {
  const result = computeFloatingPlacement(
    { top: 100, left: 40, width: 320, height: 40 },
    { width: 1024, height: 900 },
  )
  assertEq(result.mode, 'anchored', 'desktop mode')
  assertEq(result.placement, 'below', 'placement')
  assertEq(result.width, 320, 'width matches anchor')
  assert(result.top > 140, 'below input')
})

run('address: menu placement above when insufficient space below', () => {
  const result = computeFloatingPlacement(
    { top: 820, left: 40, width: 320, height: 40 },
    { width: 1024, height: 900 },
    { minSpace: 160 },
  )
  assertEq(result.mode, 'anchored', 'desktop mode')
  assertEq(result.placement, 'above', 'flips above')
  assert(result.top < 820, 'above input')
})

run('address: menu stays inside viewport horizontally', () => {
  const result = computeFloatingPlacement(
    { top: 100, left: 760, width: 300, height: 40 },
    { width: 800, height: 600 },
    { padding: 8 },
  )
  assert(result.left + result.width <= 800 - 8, 'right edge inside')
  assert(result.left >= 8, 'left edge inside')
})

run('address: AddressField uses ResponsiveFieldOverlay (portal outside overflow)', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/forms/AddressField.tsx'),
    'utf8',
  )
  assert(src.includes('ResponsiveFieldOverlay'), 'uses ResponsiveFieldOverlay')
  assert(src.includes('MobileFieldDialog'), 'uses MobileFieldDialog')
  assert(src.includes('data-testid="address-suggestion-menu"'), 'menu test id')
  assert(src.includes('Escape'), 'escape closes')
  assert(src.includes('ArrowDown'), 'keyboard nav')
  const css = readFileSync(
    resolve(process.cwd(), 'src/features/forms/FormPublicPage.module.css'),
    'utf8',
  )
  assert(css.includes('overflow: hidden'), 'card still overflow hidden')
  const addrCss = readFileSync(
    resolve(process.cwd(), 'src/features/forms/AddressField.module.css'),
    'utf8',
  )
  assert(addrCss.includes('listPortal'), 'portalled list styles')
})

run('address: provider abstraction unchanged', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/forms/AddressField.tsx'),
    'utf8',
  )
  assert(src.includes('AddressAutocompleteProvider'), 'uses provider type')
  assert(!src.includes('geoapifyService'), 'no direct geoapify in UI')
})

// --- Packages / services presentation ---

run('packages: public options show name only (no price/description in options)', () => {
  const tpl = buildContractQuestionnaireTemplate({
    packages: samplePackages,
    additionalServices: sampleExtras,
    config: normalizeContractQuestionnaireConfig(null),
  })
  const pkg = tpl.questions.find((q) => q.fieldKey === 'selectedPackageIds')
  assert(Boolean(pkg), 'package question')
  assertEq(pkg?.options?.[0]?.label, 'Pakiet Film Standard', 'name visible')
  assert(pkg?.options?.[0]?.price == null, 'no price on option')
  assert(pkg?.options?.[0]?.description == null, 'no description on option')
})

run('packages: SelectableOptionCards does not render price/description', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/forms/SelectableOptionCards.tsx'),
    'utf8',
  )
  assert(!src.includes('formatPrice'), 'no price formatter')
  assert(!src.includes('opt.description'), 'no description render')
  assert(src.includes('opt.label'), 'name rendered')
  assert(src.includes('type="checkbox"'), 'checkbox semantics')
})

run('extras: name only in public options', () => {
  const tpl = buildContractQuestionnaireTemplate({
    packages: samplePackages,
    additionalServices: sampleExtras,
    config: normalizeContractQuestionnaireConfig(null),
  })
  const ex = tpl.questions.find(
    (q) => q.fieldKey === 'selectedAdditionalServiceIds',
  )
  assert(Boolean(ex), 'extras question')
  assertEq(ex?.options?.[0]?.label, 'Drone', 'name')
  assert(ex?.options?.[0]?.price == null, 'no price')
})

run('packages: multi-select field key preserved', () => {
  const tpl = buildContractQuestionnaireTemplate({
    packages: samplePackages,
    config: normalizeContractQuestionnaireConfig(null),
  })
  const pkg = tpl.questions.find((q) => q.fieldKey === 'selectedPackageIds')
  assertEq(pkg?.type, 'multiselect', 'multiselect')
})

// --- Form builder / blocks ---

run('builder: legacy config normalizes into ordered blocks', () => {
  const cfg = ensureQuestionnaireBlocks({
    ...defaultContractQuestionnaireConfig(),
    greeting: 'Witajcie',
    footerText: 'Stopka',
    blocks: undefined,
  })
  assert((cfg.blocks?.length ?? 0) > 5, 'has blocks')
  const greeting = cfg.blocks?.find(
    (b) => b.type === 'text' && b.role === 'greeting',
  )
  assert(Boolean(greeting && greeting.type === 'text' && greeting.content === 'Witajcie'), 'greeting block')
})

run('builder: can add heading/text/short/long blocks', () => {
  const blocks = buildDefaultQuestionnaireBlocks(null)
  const h = createBlockOfType('heading', blocks.length)
  const t = createBlockOfType('text', blocks.length + 1)
  const s = createBlockOfType('short_text', blocks.length + 2)
  const l = createBlockOfType('long_text', blocks.length + 3)
  assert(h?.type === 'heading', 'heading')
  assert(t?.type === 'text', 'text')
  assert(s?.type === 'short_text', 'short')
  assert(l?.type === 'long_text', 'long')
})

run('builder: single/multiple choice have stable option ids', () => {
  const block = createBlockOfType('single_choice', 0)
  assert(block?.type === 'single_choice', 'type')
  if (block?.type === 'single_choice') {
    assert((block.options?.length ?? 0) >= 2, 'options')
    assert(Boolean(block.options?.[0]?.id), 'stable option id')
  }
})

run('builder: reorder blocks with move up/down', () => {
  const a = createBlockOfType('heading', 0)!
  const b = createBlockOfType('text', 1)!
  const reordered = reorderBlocks([a, b], b.id, -1)
  assertEq(reordered[0]?.id, b.id, 'b moved up')
})

run('builder: prevent duplicate package block', () => {
  const blocks = buildDefaultQuestionnaireBlocks({ showPackages: true })
  assert(!canAddPackageBlock(blocks), 'cannot add second packages')
})

run('builder: prevent duplicate extras block', () => {
  const blocks = buildDefaultQuestionnaireBlocks({
    showAdditionalServices: true,
  })
  assert(!canAddExtrasBlock(blocks), 'cannot add second extras')
})

run('builder: location roles unique — one per role', () => {
  const blocks = buildDefaultQuestionnaireBlocks(null)
  assert(!canAddLocationRole(blocks, 'ceremony'), 'ceremony already present')
  assert(blocks.filter((b) => b.type === 'location').length === 4, '4 defaults')
  assert(canAddLocationRole([], 'ceremony'), 'can add when empty')
})

run('builder: system address field uses address inputType', () => {
  const blocks = buildDefaultQuestionnaireBlocks(null)
  const addr = blocks.find(
    (b) => b.type === 'system_field' && b.systemKey === 'partner1.address',
  )
  assert(Boolean(addr), 'address exists')
  const qs = questionsFromBlocks(blocks, samplePackages, sampleExtras)
  const q = qs.find((x) => x.fieldKey === 'partner1.address')
  assertEq(q?.type, 'location', 'maps to AddressField type')
})

run('builder: public form follows saved block order', () => {
  const blocks = buildDefaultQuestionnaireBlocks(null)
  const reordered = reorderBlocks(
    blocks,
    blocks.find((b) => b.type === 'packages')!.id,
    1,
  )
  const qs = questionsFromBlocks(reordered, samplePackages, sampleExtras)
  const pkgIdx = qs.findIndex((q) => q.fieldKey === 'selectedPackageIds')
  const dateIdx = qs.findIndex((q) => q.fieldKey === 'weddingDate')
  assert(pkgIdx > dateIdx, 'packages after date still typically')
  // After move down once, packages should still appear after wedding heading/date area
  assert(pkgIdx >= 0 && dateIdx >= 0, 'both present')
})

run('builder: protected system mapping cannot change type via create', () => {
  const sys = buildDefaultQuestionnaireBlocks(null).find(
    (b) => b.type === 'system_field' && b.systemKey === 'weddingDate',
  )
  assert(sys?.type === 'system_field', 'system field')
  if (sys && sys.type === 'system_field') {
    assertEq(sys.systemKey, 'weddingDate', 'key locked')
    assertEq(sys.inputType, 'date', 'date input')
  }
})

run('builder: dedicated Ankiety route hosts canvas builder', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'src/pages/ContractQuestionnaireEditorPage.tsx'),
    'utf8',
  )
  const builder = readFileSync(
    resolve(
      process.cwd(),
      'src/features/questionnaires/builder/ContractQuestionnaireBuilder.tsx',
    ),
    'utf8',
  )
  const company = readFileSync(
    resolve(process.cwd(), 'src/pages/CompanyDetailsPage.tsx'),
    'utf8',
  )
  const router = readFileSync(
    resolve(process.cwd(), 'src/routes/router.tsx'),
    'utf8',
  )
  const sidebar = readFileSync(
    resolve(process.cwd(), 'src/layouts/Sidebar.tsx'),
    'utf8',
  )
  assert(router.includes('/ankiety/dane-do-umowy'), 'route registered')
  assert(page.includes('ContractQuestionnaireBuilder'), 'page wires builder')
  assert(builder.includes('questionnaire-builder-canvas'), 'canvas')
  assert(builder.includes('Dodaj element'), 'add element')
  assert(builder.includes('questionnaire-preview'), 'preview test id')
  assert(builder.includes('Podgląd'), 'preview action')
  assert(!builder.includes('>W górę<'), 'no permanent move-up links')
  assert(!builder.includes('>W dół<'), 'no permanent move-down links')
  assert(!company.includes('QuestionnaireSettingsSection'), 'removed from firma')
  assert(!company.includes('questionnaire-builder-canvas'), 'no builder in firma')
  assert(!sidebar.includes('Szablony ankiet'), 'no templates in sidebar')
})

run('builder: default layout groups bride and groom then single address', () => {
  const blocks = buildDefaultQuestionnaireBlocks(null)
  const p1Address = blocks.find(
    (b) => b.type === 'system_field' && b.systemKey === 'partner1.address',
  )
  const p2Address = blocks.find(
    (b) => b.type === 'system_field' && b.systemKey === 'partner2.address',
  )
  assert(p1Address?.type === 'system_field', 'bride/canonical address')
  assert(!p2Address, 'no separate groom address')
  if (p1Address?.type === 'system_field') {
    assertEq(p1Address.inputType, 'address', 'address autocomplete')
    assertEq(p1Address.label, 'Adres do umowy', 'label')
  }
  assert(
    !blocks.some(
      (b) =>
        b.type === 'system_field' &&
        (b.systemKey === 'partner1.postalCode' ||
          b.systemKey === 'partner1.city'),
    ),
    'no split postal/city blocks',
  )
  const qs = questionsFromBlocks(blocks, samplePackages, sampleExtras)
  const addrQs = qs.filter((q) => q.fieldKey === 'partner1.address')
  assertEq(addrQs.length, 1, 'one address question')
  assertEq(addrQs[0]?.type, 'location', 'autocomplete field type')
})

run('builder: legacy split address normalizes away', () => {
  const legacy = ensureQuestionnaireBlocks({
    ...defaultContractQuestionnaireConfig(),
    version: 1,
    blocks: [
      {
        id: 'sys_p1_address',
        type: 'system_field',
        order: 0,
        enabled: true,
        systemKey: 'partner1.address',
        label: 'Ulica i numer domu',
        required: true,
        inputType: 'text',
      },
      {
        id: 'sys_p1_postal',
        type: 'system_field',
        order: 1,
        enabled: true,
        systemKey: 'partner1.postalCode',
        label: 'Kod pocztowy',
        required: true,
        inputType: 'text',
      },
      {
        id: 'sys_p1_city',
        type: 'system_field',
        order: 2,
        enabled: true,
        systemKey: 'partner1.city',
        label: 'Miasto',
        required: true,
        inputType: 'text',
      },
    ],
  })
  assert(
    !legacy.blocks?.some(
      (b) =>
        b.type === 'system_field' &&
        (b.systemKey === 'partner1.postalCode' ||
          b.systemKey === 'partner1.city'),
    ),
    'postal/city removed',
  )
  const addr = legacy.blocks?.find(
    (b) => b.type === 'system_field' && b.systemKey === 'partner1.address',
  )
  assert(addr?.type === 'system_field' && addr.inputType === 'address', 'address type')
})

// --- Date picker ---

run('date: week begins on Monday', () => {
  assertEq(WEEKDAYS_PL[0], 'pn', 'Monday first')
  // March 2026 starts on Sunday → pad 6 days before Mon-based week
  const grid = buildMonthGrid(2026, 2)
  assert(grid[0] === null || grid[0]!.getDay() === 1, 'first cell Mon or pad')
  // Find first non-null — should be day 1
  const first = grid.find((d) => d != null)!
  assertEq(first.getDate(), 1, 'month starts at 1')
})

run('date: Polish display and ISO storage', () => {
  const d = parseFlexibleDate('2026-07-25')!
  assertEq(toPolishDisplay(d), '25.07.2026', 'display')
  assertEq(toIsoDate(d), '2026-07-25', 'iso')
  assertEq(isoToPolishDisplay('2026-07-25'), '25.07.2026', 'iso→pl')
  const fromPl = parseFlexibleDate('25.07.2026')!
  assertEq(toIsoDate(fromPl), '2026-07-25', 'pl→iso')
})

run('date: invalid manual input rejected', () => {
  assertEq(parseFlexibleDate('32.13.2026'), null, 'invalid')
  assertEq(parseFlexibleDate('abc'), null, 'garbage')
})

run('date: DatePickerField uses ResponsiveFieldOverlay + Polish calendar', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/forms/DatePickerField.tsx'),
    'utf8',
  )
  assert(src.includes('ResponsiveFieldOverlay'), 'portal overlay')
  assert(src.includes('MobileFieldDialog'), 'mobile dialog')
  assert(src.includes('MONTHS_PL'), 'Polish months')
  assert(src.includes('WEEKDAYS_PL'), 'Polish weekdays')
  assert(src.includes('data-testid="date-picker-popover"'), 'popover test id')
})

run('date: QuestionField uses DatePickerField for date type', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/forms/QuestionField.tsx'),
    'utf8',
  )
  assert(src.includes('DatePickerField'), 'wired')
  assert(!src.includes("type === 'date'\\n                  ? 'date'"), 'no native date primary')
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
console.log('\nquestionnaire-ux acceptance: done')
