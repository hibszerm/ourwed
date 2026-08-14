/**
 * Public questionnaire UX consistency — address portal, date containment, calendar scroll.
 * Run: npx tsx --tsconfig tsconfig.app.json src/lib/forms/questionnaireUxConsistencyAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeFloatingPlacement } from '@/components/ui/floatingPlacement'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

const loc = read('src/features/travel/LocationSearchField.tsx')
const locCss = read('src/features/travel/LocationSearchField.module.css')
const dateCss = read('src/features/forms/DatePickerField.module.css')
const dateTsx = read('src/features/forms/DatePickerField.tsx')
const overlayCss = read('src/components/ui/ResponsiveFieldOverlay.module.css')
const overlayTsx = read('src/components/ui/ResponsiveFieldOverlay.tsx')
const prePage = read('src/features/prewedding/PreWeddingPublicFormPage.tsx')
const preCss = read('src/features/prewedding/PreWeddingPublicForm.module.css')
const qf = read('src/features/forms/QuestionField.tsx')
const cardCss = read('src/features/forms/FormPublicPage.module.css')

{
  assertIncludes(loc, 'ResponsiveFieldOverlay', 'desktop suggestions portalled')
  assertIncludes(loc, 'listPortal', 'portal list class')
  assertIncludes(loc, "'anchored'", 'anchored overlay mode')
  assertNotIncludes(
    loc,
    'showDesktopList ? suggestionList : null',
    'suggestions not rendered inline under card',
  )
  assertIncludes(locCss, '.listPortal', 'portal list styles')
  assertIncludes(cardCss, 'overflow: hidden', 'contract card still clips (portal escapes)')
  console.log('PASS  desktop address portal (escape card overflow)')
}

{
  assertIncludes(loc, 'MobileFieldDialog', 'mobile address dialog preserved')
  assertIncludes(loc, 'location-mobile-address-dialog', 'mobile dialog test id')
  assertIncludes(loc, 'Zapisz adres', 'mobile confirm preserved')
  console.log('PASS  mobile address dialog preserved')
}

{
  assertIncludes(prePage, 'DatePickerField', 'pre-wedding uses shared date picker')
  assertNotIncludes(
    prePage,
    "type=\"date\"",
    'pre-wedding date field is not native type=date',
  )
  assertIncludes(qf, 'DatePickerField', 'contract still uses DatePickerField')
  assertIncludes(preCss, 'min-width: 0', 'pre-wedding field width clamp')
  assertIncludes(preCss, "input[type='date']", 'native date clamp remains for time/legacy')
  console.log('PASS  pre-wedding date uses shared DatePickerField')
}

{
  assertNotIncludes(
    dateCss.slice(dateCss.indexOf('.popover {'), dateCss.indexOf('.popoverDialog')),
    'overflow: auto',
    'desktop popover is not a nested scroll container',
  )
  assertIncludes(dateCss, 'overflow: visible', 'popover overflow visible')
  assertIncludes(dateTsx, 'scrollBody={false}', 'overlay body not scrollable for calendar')
  assertIncludes(dateTsx, 'maxMenuHeight={420}', 'calendar height budget fits month')
  assertIncludes(overlayCss, '.bodyNatural', 'natural body class')
  assertIncludes(overlayTsx, 'scrollBody', 'scrollBody prop')
  console.log('PASS  desktop calendar nested scroll removed')
}

{
  assertIncludes(dateTsx, 'DESKTOP_CALENDAR_MAX_WIDTH', 'desktop calendar max width token')
  assertIncludes(dateTsx, 'maxMenuWidth={DESKTOP_CALENDAR_MAX_WIDTH}', 'date overlay caps width')
  assertIncludes(overlayTsx, 'maxMenuWidth', 'overlay forwards maxMenuWidth')
  assertIncludes(dateTsx, 'MobileFieldDialog', 'mobile still uses dialog path')
  assertNotIncludes(
    preCss,
    '.popover',
    'pre-wedding does not override calendar popover width',
  )
  assertNotIncludes(
    preCss,
    '.grid',
    'pre-wedding does not override calendar grid',
  )

  const wide = computeFloatingPlacement(
    { top: 100, left: 40, width: 560, height: 40 },
    { width: 1280, height: 900 },
    { maxMenuWidth: 320 },
  )
  assert(wide.mode === 'anchored', 'desktop mode for wide pre-wedding-like anchor')
  assert(wide.width === 320, `wide anchor capped to compact width, got ${wide.width}`)

  const contractLike = computeFloatingPlacement(
    { top: 100, left: 40, width: 316, height: 40 },
    { width: 1280, height: 900 },
    { maxMenuWidth: 320 },
  )
  assert(
    contractLike.width === 316,
    `narrow contract-like anchor preserved, got ${contractLike.width}`,
  )

  const uncapped = computeFloatingPlacement(
    { top: 100, left: 40, width: 560, height: 40 },
    { width: 1280, height: 900 },
  )
  assert(
    uncapped.width === 560,
    'address-style menus still match full anchor when uncapped',
  )

  const mobileDialog = computeFloatingPlacement(
    { top: 100, left: 0, width: 390, height: 40 },
    { width: 390, height: 700 },
  )
  assert(mobileDialog.mode === 'dialog', 'mobile still uses dialog placement')
  console.log('PASS  desktop calendar compact width (pre-wedding vs contract)')
}

console.log('\nAll questionnaire UX consistency acceptance checks passed.')
