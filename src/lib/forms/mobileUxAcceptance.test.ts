/**
 * Mobile UX polish — Wedding Detail tab/CTA, questionnaire editor header,
 * full-screen location picker. No live Google / Routes / email.
 *
 * Run: npm run test:mobile-ux
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MOBILE_OVERLAY_BREAKPOINT } from '@/components/ui/floatingPlacement'
import { parseWorkspaceTab } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

// ── Wedding Detail tabs ─────────────────────────────────────────────
{
  const shell = read('src/features/weddings/detail/v2/WeddingDetailV2.tsx')
  const page = read('src/pages/WeddingDetailPage.tsx')

  assertEq(parseWorkspaceTab(null), 'overview', 'A — default Przegląd')
  assertIncludes(shell, "return 'overview'", 'A — overview fallback')
  assertNotIncludes(shell, 'localStorage.getItem', 'B — no localStorage read')
  assertNotIncludes(shell, 'localStorage.setItem', 'B — no localStorage write')
  assertIncludes(page, 'key={wedding.id}', 'B — remount per wedding')
  assertIncludes(shell, "searchParams.get('tab')", 'C — ?tab= honored')
  assertEq(parseWorkspaceTab('contract_finance'), 'contract_finance', 'C — explicit tab')

  console.log('PASS  Wedding Detail default tab')
}

// ── Wedding Detail mobile hero / menu ───────────────────────────────
{
  const header = read(
    'src/features/weddings/detail/v2/WeddingWorkspaceHeader.tsx',
  )
  const actions = read(
    'src/features/weddings/detail/v2/WeddingHeaderActions.tsx',
  )
  const css = read('src/features/weddings/detail/v2/WeddingDetailV2.module.css')

  assertIncludes(header, 'Otwórz tryb dnia ślubu', 'F — desktop CTA kept')
  assertIncludes(header, 'open-wedding-day-cockpit', 'F — desktop test id')
  assertIncludes(css, 'max-width: 767px', 'D — mobile breakpoint')
  const mobileBlock = css.slice(css.lastIndexOf('@media (max-width: 767px)'))
  assertIncludes(mobileBlock, '.cockpitEntry', 'D — targets CTA')
  assertIncludes(mobileBlock, 'display: none', 'D — hides CTA on mobile')
  assertIncludes(actions, 'Tryb dnia ślubu', 'E — menu label')
  assertIncludes(actions, 'wedding-menu-day-cockpit', 'E — menu test id')
  assertIncludes(actions, '/dzien-slubu', 'E — same route')
  assertIncludes(mobileBlock, 'min-height: 44px', 'menu touch targets')
  assertIncludes(css, 'right: 0', 'menu anchored inside viewport')

  console.log('PASS  Wedding Detail mobile hero / menu')
}

// ── Questionnaire editor mobile header ──────────────────────────────
{
  const editor = read(
    'src/features/questionnaires/shared-editor/ContractQuestionnaireSectionEditor.tsx',
  )
  const css = read('src/pages/PreWeddingTemplatesPage.module.css')

  assertIncludes(css, 'editorHeaderIdentity', 'A — identity block class')
  assertIncludes(css, 'max-width: 767px', 'mobile breakpoint')
  const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
  assertIncludes(mobile, 'flex-direction: column', 'A — stacked header')
  assertIncludes(mobile, '.editorHeaderIdentity', 'A — title not beside actions')
  assertIncludes(mobile, 'width: 100%', 'B — full-width rows')
  assertNotIncludes(mobile, 'font-size: 10px', 'no font-shrink hack')

  assertIncludes(editor, "label: 'Zapisano'", 'C — clean → Zapisano')
  assertIncludes(editor, "label: 'Zapisz'", 'D — dirty → Zapisz')
  assertIncludes(editor, "label: 'Zapisywanie…'", 'E — saving label')
  assertIncludes(editor, 'showPrimarySave', 'save morph')
  assertIncludes(editor, 'Podgląd', 'F — preview accessible')
  assertIncludes(editor, 'Anuluj', 'F — cancel accessible')
  assertIncludes(editor, 'editorSecondaryActions', 'F — secondary row')
  assertIncludes(css, '.editorHeader {', 'G — desktop header preserved')

  console.log('PASS  Questionnaire editor mobile header')
}

// ── Mobile address picker ───────────────────────────────────────────
{
  const loc = read('src/features/travel/LocationSearchField.tsx')
  const qLoc = read('src/features/prewedding/QuestionnaireLocationField.tsx')
  const dialog = read('src/components/ui/MobileFieldDialog.tsx')

  assertIncludes(loc, 'useIsMobileOverlay', 'A — viewport hook (not UA)')
  assertIncludes(loc, 'MobileFieldDialog', 'A — full-screen dialog')
  assertIncludes(loc, 'location-mobile-address-dialog', 'A — dialog test id')
  assertIncludes(loc, 'Zapisz adres', 'E — confirm action')
  assertIncludes(loc, 'location-mobile-confirm', 'E — confirm test id')
  assertIncludes(loc, 'pendingPlace', 'D — temporary selection')
  assertIncludes(loc, 'location-mobile-pending', 'D — pending UI')
  assertIncludes(loc, 'closeMobileDialog', 'F — cancel path')
  assertIncludes(
    loc,
    'do not touch parent field value',
    'F — cancel preserves field',
  )
  assertIncludes(loc, 'mapSuggestionAndResolvedToGeoPlace', 'E/J — GeoPlace path')
  assertIncludes(loc, 'unresolvedFromText', 'manual typed fallback')
  assertIncludes(loc, 'location-desktop-suggestion-list', 'B — desktop inline list')
  assertIncludes(loc, 'showDesktopList = !isMobile && open', 'B/I — desktop-only inline list')
  assertIncludes(loc, 'location-mobile-trigger', 'A — mobile trigger (not inline input)')
  assertIncludes(loc, "data-overlay-mode={dialogOpen ? 'dialog' : 'inline'}", 'modes')
  assertNotIncludes(loc, 'googleapis.com', 'K — no live Google URL')

  assertIncludes(qLoc, 'LocationSearchField', 'H — shared questionnaire fields')
  assertIncludes(qLoc, 'geoPlaceToAnswer', 'J — GeoPlace answer persist')
  assertIncludes(dialog, 'lockBodyScroll', 'viewport body lock')
  assertIncludes(dialog, 'readVisualViewportBounds', 'keyboard-safe bounds')
  assertIncludes(dialog, 'closeLabel', 'Anuluj label support')
  assertIncludes(loc, 'closeLabel="Anuluj"', 'cancel label')
  assertIncludes(loc, 'restoreFocusRef', 'a11y focus restore')
  assertEq(MOBILE_OVERLAY_BREAKPOINT, 640, 'existing overlay breakpoint')

  console.log('PASS  Mobile address picker')
}

console.log('\nAll Mobile UX acceptance checks passed.')
