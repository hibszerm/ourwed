/**
 * iOS Safari viewport fix — input ≥16px, blur-before-navigate/close, a11y meta.
 * Run: npm run test:ios-safari-viewport
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

// A — mobile form font sizes ≥16px
{
  const tokens = read('src/styles/tokens.css')
  assertIncludes(tokens, '--text-form-control-mobile: 1rem', 'A — 16px token')
  assertIncludes(tokens, '--text-form-control: var(--text-sm)', 'A — desktop form token')

  for (const [file, needle] of [
    [
      'src/components/ui/Input.module.css',
      'font-size: var(--text-form-control-mobile, 1rem)',
    ],
    [
      'src/features/forms/QuestionField.module.css',
      'font-size: var(--text-form-control-mobile, 1rem)',
    ],
    [
      'src/features/travel/LocationSearchField.module.css',
      'font-size: var(--text-form-control-mobile, 1rem)',
    ],
    [
      'src/pages/PreWeddingTemplatesPage.module.css',
      'font-size: var(--text-form-control-mobile, 1rem)',
    ],
  ] as const) {
    const css = read(file)
    assertIncludes(css, 'max-width: 767px', `${file} mobile bp`)
    assertIncludes(css, needle, `${file} mobile 16px`)
  }

  // Desktop remains 14px-capable via form-control token
  assertIncludes(
    read('src/components/ui/Input.module.css'),
    'font-size: var(--text-form-control, var(--text-sm))',
    'desktop Input keeps form-control token',
  )

  console.log('PASS  A — mobile form font sizes ≥16px')
}

// B — login blur before navigate
{
  const login = read('src/features/auth/components/LoginForm.tsx')
  assertIncludes(login, 'blurActiveElement', 'B — blur helper')
  assertIncludes(login, 'settleAfterBlur', 'B — settle')
  const blurIdx = login.indexOf('blurActiveElement()')
  const navIdx = login.indexOf("navigate('/dashboard'")
  assert(blurIdx >= 0 && navIdx > blurIdx, 'B — blur before navigate')
  assertIncludes(login, 'await settleAfterBlur()', 'B — await settle')

  console.log('PASS  B — login blur before navigate')
}

// C/D — picker confirm/cancel blur before close
{
  const loc = read('src/features/travel/LocationSearchField.tsx')
  assertIncludes(loc, 'blurPickerBeforeClose', 'C/D — blur helper')
  assertIncludes(loc, 'searchRef.current?.blur()', 'C/D — blur search')
  assertIncludes(loc, 'await blurPickerBeforeClose()', 'C/D — awaited')

  const confirmStart = loc.indexOf('async function confirmMobileAddress')
  const confirmBody = loc.slice(confirmStart, confirmStart + 900)
  assertIncludes(confirmBody, 'await blurPickerBeforeClose()', 'C — confirm blurs first')
  assertIncludes(confirmBody, 'await commitPlace', 'C — still commits')
  // Capture pending before blur so selection is not lost
  assertIncludes(confirmBody, 'const toCommit = pendingPlace', 'C — capture before blur')

  const cancelStart = loc.indexOf('async function closeMobileDialog')
  const cancelBody = loc.slice(cancelStart, cancelStart + 500)
  assertIncludes(cancelBody, 'await blurPickerBeforeClose()', 'D — cancel blurs first')
  assertNotIncludes(cancelBody, 'commitPlace', 'D — cancel does not commit')
  assertIncludes(cancelBody, 'setDialogOpen(false)', 'D — then close')

  console.log('PASS  C/D — picker confirm/cancel blur lifecycle')
}

// E — focus restore with preventScroll
{
  const dialog = read('src/components/ui/MobileFieldDialog.tsx')
  const focus = read('src/components/ui/iosFocus.ts')
  assertIncludes(focus, 'preventScroll: true', 'E — preventScroll')
  assertIncludes(dialog, 'focusWithoutScroll', 'E — uses helper')
  assertIncludes(dialog, 'settleAfterBlur', 'E — settle before restore')
  assertIncludes(dialog, 'restoreFocusRef', 'E — restore preserved')

  console.log('PASS  E — focus restore')
}

// F — scroll lock still unlocks
{
  const dialog = read('src/components/ui/MobileFieldDialog.tsx')
  assertIncludes(dialog, 'lockBodyScroll', 'F — lock')
  assertIncludes(dialog, 'unlockBodyScroll', 'F — unlock on cleanup')
  const lock = read('src/components/ui/bodyScrollLock.ts')
  assertIncludes(lock, 'window.scrollTo(0, y)', 'F — restore scrollY')

  console.log('PASS  F — body scroll unlock')
}

// G — visualViewport still attached/cleaned
{
  const dialog = read('src/components/ui/MobileFieldDialog.tsx')
  assertIncludes(dialog, 'subscribeVisualViewport', 'G — subscribe')
  assertIncludes(dialog, 'return subscribeVisualViewport', 'G — cleanup return')
  const vv = read('src/components/ui/visualViewportBounds.ts')
  assertIncludes(vv, "addEventListener('resize'", 'G — resize')
  assertIncludes(vv, "addEventListener('scroll'", 'G — scroll')
  assertIncludes(vv, 'removeEventListener', 'G — unsubscribe')

  console.log('PASS  G — visualViewport')
}

// H — accessibility viewport meta
{
  const html = read('index.html')
  assertIncludes(
    html,
    'content="width=device-width, initial-scale=1.0"',
    'H — viewport meta',
  )
  assertNotIncludes(html, 'user-scalable=no', 'H — no user-scalable=no')
  assertNotIncludes(html, 'maximum-scale=1', 'H — no maximum-scale=1')
  assertNotIncludes(html, 'maximum-scale=1.0', 'H — no maximum-scale=1.0')

  console.log('PASS  H — viewport meta accessibility')
}

console.log('\nAll iOS Safari viewport acceptance checks passed.')
