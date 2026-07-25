/**
 * visualViewport + mobile dialog acceptance tests.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  computeFloatingPlacement,
  isMobileOverlayViewport,
  MOBILE_OVERLAY_BREAKPOINT,
} from '@/components/ui/floatingPlacement'
import {
  readVisualViewportBounds,
  subscribeVisualViewport,
} from '@/components/ui/visualViewportBounds'

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

run('1. overlay top uses offsetTop from visualViewport helper', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/components/ui/visualViewportBounds.ts'),
    'utf8',
  )
  assert(src.includes('offsetTop'), 'offsetTop')
  assert(src.includes('vv.height'), 'height')
  const bounds = readVisualViewportBounds({
    visualViewport: {
      offsetTop: 40,
      offsetLeft: 0,
      width: 390,
      height: 500,
      addEventListener() {},
      removeEventListener() {},
    },
    innerWidth: 390,
    innerHeight: 844,
  } as unknown as Window)
  assertEq(bounds.top, 40, 'top')
  assertEq(bounds.height, 500, 'height')
  assert(bounds.fromVisualViewport, 'from vv')
})

run('2. overlay height uses visualViewport.height', () => {
  const dialog = computeFloatingPlacement(
    { top: 100, left: 0, width: 300, height: 40 },
    { width: 390, height: 500 },
    { forceDialog: true },
  )
  assertEq(dialog.mode, 'dialog', 'dialog mode')
  assert(typeof dialog.height === 'number', 'height set')
})

run('3–5. subscribe listens to resize/scroll/orientation', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/components/ui/visualViewportBounds.ts'),
    'utf8',
  )
  assert(src.includes("addEventListener('resize'"), 'resize')
  assert(src.includes("addEventListener('scroll'"), 'scroll')
  assert(src.includes('orientationchange'), 'orientation')
  const dialog = readFileSync(
    resolve(process.cwd(), 'src/components/ui/MobileFieldDialog.tsx'),
    'utf8',
  )
  assert(dialog.includes('subscribeVisualViewport'), 'dialog subscribes')
})

run('6. missing visualViewport falls back safely', () => {
  const bounds = readVisualViewportBounds({
    innerWidth: 800,
    innerHeight: 600,
  } as unknown as Window)
  assertEq(bounds.top, 0, 'top 0')
  assertEq(bounds.height, 600, 'innerHeight')
  assert(!bounds.fromVisualViewport, 'fallback')
})

run('7. event listeners removed on unsubscribe', () => {
  const removed: string[] = []
  const fakeVv = {
    offsetTop: 0,
    offsetLeft: 0,
    width: 390,
    height: 600,
    addEventListener() {},
    removeEventListener(type: string) {
      removed.push(`vv:${type}`)
    },
  }
  const fakeWin = {
    visualViewport: fakeVv,
    innerWidth: 390,
    innerHeight: 844,
    addEventListener() {},
    removeEventListener(type: string) {
      removed.push(`win:${type}`)
    },
  } as unknown as Window
  const unsub = subscribeVisualViewport(() => undefined, fakeWin)
  unsub()
  assert(removed.includes('win:resize'), 'win resize removed')
  assert(removed.includes('win:orientationchange'), 'orientation removed')
  assert(removed.includes('vv:resize'), 'vv resize removed')
  assert(removed.includes('vv:scroll'), 'vv scroll removed')
})

run('mobile address: dialog + dedicated search + use typed', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/forms/AddressField.tsx'),
    'utf8',
  )
  assert(src.includes('MobileFieldDialog'), 'mobile dialog')
  assert(src.includes('mobile-address-search'), 'dedicated search')
  assert(src.includes('Użyj wpisanego adresu'), 'manual action')
  assert(src.includes('useIsMobileOverlay'), 'breakpoint hook')
  assert(src.includes('ResponsiveFieldOverlay'), 'desktop overlay')
  assert(src.includes("data-overlay-mode={isMobile ? 'dialog' : 'anchored'}"), 'modes')
})

run('mobile address: compact rows + body scroll lock', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'src/features/forms/AddressField.module.css'),
    'utf8',
  )
  assert(css.includes('min-height: 56px'), 'compact min')
  assert(css.includes('max-height: 68px'), 'compact max')
  const lock = readFileSync(
    resolve(process.cwd(), 'src/components/ui/bodyScrollLock.ts'),
    'utf8',
  )
  assert(lock.includes('savedScrollY'), 'saves scroll')
  assert(lock.includes('scrollTo'), 'restores scroll')
  const dialog = readFileSync(
    resolve(process.cwd(), 'src/components/ui/MobileFieldDialog.tsx'),
    'utf8',
  )
  assert(dialog.includes('lockBodyScroll'), 'locks')
  assert(dialog.includes('unlockBodyScroll'), 'unlocks')
})

run('mobile date: no keyboard trigger + confirm/cancel', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/forms/DatePickerField.tsx'),
    'utf8',
  )
  assert(src.includes('MobileFieldDialog'), 'dialog')
  assert(src.includes('mobile-date-trigger'), 'button trigger')
  assert(src.includes('document.activeElement.blur'), 'blurs before open')
  assert(src.includes('Wybierz'), 'confirm')
  assert(src.includes('Anuluj'), 'cancel')
  assert(src.includes('draftDay'), 'draft state')
  assert(src.includes('date-year-select'), 'select year')
  // Mobile path must not use inputMode numeric on the trigger
  assert(src.includes('type="button"'), 'button trigger')
  assert(
    src.includes('ResponsiveFieldOverlay'),
    'desktop still anchored',
  )
})

run('desktop address/date remain anchored', () => {
  const addr = readFileSync(
    resolve(process.cwd(), 'src/features/forms/AddressField.tsx'),
    'utf8',
  )
  const date = readFileSync(
    resolve(process.cwd(), 'src/features/forms/DatePickerField.tsx'),
    'utf8',
  )
  const overlay = readFileSync(
    resolve(process.cwd(), 'src/components/ui/ResponsiveFieldOverlay.tsx'),
    'utf8',
  )
  assert(addr.includes('!isMobile'), 'desktop branch')
  assert(date.includes('!isMobile'), 'desktop branch')
  assert(overlay.includes("mode !== 'anchored'"), 'anchored only')
  assertEq(
    computeFloatingPlacement(
      { top: 100, left: 40, width: 320, height: 40 },
      { width: 1024, height: 900 },
    ).mode,
    'anchored',
    'desktop placement',
  )
  assert(isMobileOverlayViewport(MOBILE_OVERLAY_BREAKPOINT - 1), 'mobile bp')
  assert(!isMobileOverlayViewport(MOBILE_OVERLAY_BREAKPOINT + 1), 'desktop bp')
})

run('dialog CSS uses visual viewport height variable', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'src/components/ui/MobileFieldDialog.module.css'),
    'utf8',
  )
  assert(css.includes('--visual-viewport-height'), 'css var')
  assert(css.includes('safe-area-inset'), 'safe area')
  assert(css.includes('min-height: 0'), 'flex scroll')
})
