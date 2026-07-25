/**
 * Cleanup + order + mobile overlay acceptance for the simplified questionnaire module.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  computeFloatingPlacement,
  isMobileOverlayViewport,
  MOBILE_OVERLAY_BREAKPOINT,
  viewportSize,
} from '@/components/ui/floatingPlacement'
import {
  buildDefaultQuestionnaireBlocks,
  CONTRACT_QUESTIONNAIRE_SECTION_ORDER,
  ensureQuestionnaireBlocks,
} from '@/lib/forms/questionnaireBlocks'
import { questionsFromBlocks } from '@/lib/forms/questionsFromBlocks'
import { buildContractQuestionnaireTemplate } from '@/lib/forms/contractQuestionnaireTemplate'
import { resolvePublicFormTemplate } from '@/lib/forms/resolvePublicFormTemplate'
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

const pkgs = [{ id: 'p1', name: 'Pakiet A', price: 1, currency: 'PLN' }]
const extras = [{ id: 'e1', name: 'Drone', price: 1, currency: 'PLN' }]

run('cleanup: sidebar has single Ankiety entry to dane-do-umowy', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/layouts/Sidebar.tsx'),
    'utf8',
  )
  assert(src.includes("/ankiety/dane-do-umowy"), 'route')
  assert(src.includes("label: 'Ankiety'"), 'label')
  assert(!src.includes('Szablony ankiet'), 'no templates nav')
  assert(!src.includes('/ankiety/szablony'), 'no templates path')
})

run('cleanup: templates page and module nav removed', () => {
  const router = readFileSync(
    resolve(process.cwd(), 'src/routes/router.tsx'),
    'utf8',
  )
  assert(!router.includes('QuestionnaireTemplatesPage'), 'no templates page')
  assert(router.includes('Navigate to="/ankiety/dane-do-umowy"'), 'redirect')
  try {
    readFileSync(
      resolve(process.cwd(), 'src/pages/QuestionnaireTemplatesPage.tsx'),
      'utf8',
    )
    throw new Error('templates page still exists')
  } catch (err) {
    assert(
      err instanceof Error && err.message.includes('ENOENT'),
      'templates page deleted',
    )
  }
  try {
    readFileSync(
      resolve(
        process.cwd(),
        'src/features/documents/questionnaire/index.ts',
      ),
      'utf8',
    )
    throw new Error('AI questionnaire folder still exists')
  } catch (err) {
    assert(
      err instanceof Error && err.message.includes('ENOENT'),
      'AI questionnaire deleted',
    )
  }
})

run('cleanup: detail page has no open history / timeline / expiry UI', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/pages/QuestionnaireDetailPage.tsx'),
    'utf8',
  )
  assert(!src.includes('Otwarto'), 'no opened')
  assert(!src.includes('Historia'), 'no history')
  assert(!src.includes('buildTimeline'), 'no timeline')
  assert(!src.includes('Ważność'), 'no expiry label')
  assert(src.includes('Wysłano'), 'keeps submitted')
})

run('cleanup: wedding UI only offers contract questionnaire', () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/components/detail/WeddingDetailQuestionnaires.tsx',
    ),
    'utf8',
  )
  assert(src.includes('contractData'), 'contract')
  assert(!src.includes('Ankieta ślubna'), 'no wedding questionnaire label')
  assert(!src.includes('weddingQuestionnaire'), 'no weddingQuestionnaire key')
})

run('order: default blocks follow product section sequence', () => {
  const blocks = buildDefaultQuestionnaireBlocks(null)
  const tpl = buildContractQuestionnaireTemplate({
    packages: pkgs,
    additionalServices: extras,
    config: ensureQuestionnaireBlocks(defaultContractQuestionnaireConfig()),
  })
  const labels = tpl.questions
    .filter(
      (q) =>
        q.type === 'section_title' ||
        q.fieldKey === 'weddingDate' ||
        q.fieldKey === 'selectedPackageIds' ||
        q.fieldKey === 'selectedAdditionalServiceIds' ||
        q.fieldKey === 'partner1.address' ||
        q.fieldKey === 'partner1.email' ||
        q.fieldKey === 'bridePreparationLocation' ||
        q.fieldKey === 'groomPreparationLocation' ||
        q.fieldKey === 'ceremonyLocation' ||
        q.fieldKey === 'receptionLocation' ||
        q.fieldKey === 'additionalNotes',
    )
    .map((q) => q.label)

  const idx = (label: string) => {
    const i = labels.findIndex((l) => l === label || l.includes(label))
    assert(i >= 0, `missing ${label}`)
    return i
  }

  const dateI = idx('Data ślubu')
  const pkgI = idx('Pakiet')
  const exI = idx('Dodatki')
  const brideI = labels.findIndex((l) => l === 'Dane Panny Młodej')
  const groomI = labels.findIndex((l) => l === 'Dane Pana Młodego')
  const addrI = idx('Adres do umowy')
  const locI = idx('Lokalizacje')
  const emailI = idx('Adres e-mail do kontaktu')
  const notesI = idx('Uwagi')

  assert(dateI < pkgI, 'date before package')
  assert(pkgI < exI, 'package before extras')
  assert(exI < brideI, 'extras before bride')
  assert(brideI < groomI, 'bride before groom')
  assert(groomI < addrI, 'groom before address')
  assert(addrI < locI, 'address before locations')
  assert(locI < emailI, 'locations before email')
  assert(emailI < notesI, 'email before notes')
  assertEq(CONTRACT_QUESTIONNAIRE_SECTION_ORDER.length, 9, '9 sections')

  const addressFields = tpl.questions.filter(
    (q) => q.fieldKey === 'partner1.address' || q.fieldKey === 'partner2.address',
  )
  assertEq(addressFields.length, 1, 'one contract address')
  assertEq(addressFields[0]?.type, 'location', 'address is location/AddressField')
  assertEq(
    tpl.questions.filter((q) => q.fieldKey === 'partner1.email').length,
    1,
    'one email',
  )
  assert(
    !tpl.questions.some((q) => q.fieldKey === 'partner1.postalCode'),
    'no postal',
  )
  assertEq(
    blocks.filter((b) => b.type === 'location').length,
    4,
    'four venue location blocks in default',
  )
  assertEq(
    blocks.filter(
      (b) => b.type === 'heading' && b.id === 'sys_heading_bride_prep',
    ).length,
    0,
    'no per-role location headings',
  )
})

run('order: stale schema address coerced to location', () => {
  const schema = {
    title: 'Old',
    type: 'contract_questionnaire' as const,
    description: 'x',
    submitLabel: 'Wyślij',
    successTitle: 'OK',
    successDescription: 'OK',
    questions: [
      {
        id: 'q-p1-address',
        type: 'text' as const,
        label: 'Ulica i numer domu',
        fieldKey: 'partner1.address',
      },
    ],
  }
  const resolved = resolvePublicFormTemplate(schema, [], {
    packages: pkgs,
    config: null,
  })
  const addr = resolved.questions.find((q) => q.fieldKey === 'partner1.address')
  assertEq(addr?.type, 'location', 'coerced')
})

run('mobile: placement dialog mode under breakpoint', () => {
  assert(isMobileOverlayViewport(MOBILE_OVERLAY_BREAKPOINT - 1), 'mobile')
  assert(!isMobileOverlayViewport(MOBILE_OVERLAY_BREAKPOINT + 1), 'desktop')
  const mobile = computeFloatingPlacement(
    { top: 100, left: 20, width: 300, height: 40 },
    { width: 390, height: 500 },
  )
  assertEq(mobile.mode, 'dialog', 'dialog mode')
  assert(typeof mobile.height === 'number' && mobile.height > 0, 'dialog has height')
  const desktop = computeFloatingPlacement(
    { top: 100, left: 40, width: 320, height: 40 },
    { width: 1024, height: 800 },
  )
  assertEq(desktop.mode, 'anchored', 'desktop anchored')
  assertEq(desktop.placement, 'below', 'below when space')
})

run('mobile: AddressField uses MobileFieldDialog + desktop overlay', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/forms/AddressField.tsx'),
    'utf8',
  )
  assert(src.includes('ResponsiveFieldOverlay'), 'desktop overlay')
  assert(src.includes('MobileFieldDialog'), 'mobile dialog')
  assert(src.includes('Wybierz adres'), 'dialog title')
  assert(src.includes('data-overlay-mode'), 'mode attr')
})

run('mobile: DatePickerField uses MobileFieldDialog without keyboard', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/forms/DatePickerField.tsx'),
    'utf8',
  )
  assert(src.includes('ResponsiveFieldOverlay'), 'desktop overlay')
  assert(src.includes('MobileFieldDialog'), 'mobile dialog')
  assert(src.includes('Wybierz datę'), 'dialog title')
  assert(src.includes('mobile-date-trigger'), 'button trigger')
  assert(src.includes('yearSelect') || src.includes('date-year-select'), 'year nav')
})

run('address: questionsFromBlocks emits location for address inputType', () => {
  const blocks = buildDefaultQuestionnaireBlocks(null)
  const qs = questionsFromBlocks(blocks, pkgs, extras)
  const addr = qs.find((q) => q.fieldKey === 'partner1.address')
  assertEq(addr?.type, 'location', 'location type')
  assertEq(addr?.label, 'Adres do umowy', 'label')
})

void viewportSize

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
console.log('\nquestionnaire cleanup/order/mobile acceptance: done')
