import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  CONTRACT_BEATS,
  DESKTOP_BEATS,
  MOBILE_BEATS,
  SCENE,
} from './sceneTimings'
import { beatIndex, clamp01, lerp, localProgress } from './deviceMotion'

gsap.registerPlugin(ScrollTrigger)

export type LandingFrameState = {
  progress: number
  lid: number
  morph: number
  screenOn: number
  camRx: number
  camRy: number
  camScale: number
  camTx: number
  camTy: number
  heroOpacity: number
  copyOpacity: number
  copySide: 'left' | 'right'
  copyTitle: string
  copyBody: string
  phase: 'boot' | 'desktop' | 'contract' | 'mobile' | 'sync' | 'cta'
  desktopBeat: (typeof DESKTOP_BEATS)[number]
  contractBeat: (typeof CONTRACT_BEATS)[number]
  mobileBeat: (typeof MOBILE_BEATS)[number]
  navDraw: number
  checklistDone: boolean
  syncReveal: number
  ctaReveal: number
  showDual: boolean
}

const DESKTOP_COPY = [
  {
    side: 'left' as const,
    title: 'Cały biznes pod kontrolą.',
    body: 'Pulpit, terminy i klienci — bez arkuszy.',
  },
  {
    side: 'right' as const,
    title: 'Każdy projekt kompletny.',
    body: 'Statusy, pakiet i ludzie w jednym widoku.',
  },
  {
    side: 'left' as const,
    title: 'Nigdy nie zapomnisz o terminie.',
    body: 'Zadania prowadzą Cię do dnia ślubu.',
  },
  {
    side: 'right' as const,
    title: 'Płatności dokładnie tam, gdzie powinny.',
    body: 'Zaliczki i raty pod kontrolą.',
  },
  {
    side: 'left' as const,
    title: 'Umowy bez przepisywania.',
    body: 'Wzór raz. Dane ślubu — automatycznie.',
  },
]

const MOBILE_COPY = [
  'W dniu ślubu masz tylko to, czego naprawdę potrzebujesz.',
  'Jedno dotknięcie i jedziesz do kolejnej lokalizacji.',
  'Harmonogram zawsze przy Tobie.',
  'Lista sprzętu zawsze przy Tobie.',
  'Klient pod ręką.',
  'Działa także bez sieci.',
]

export function sampleLandingFrame(progress: number): LandingFrameState {
  const p = clamp01(progress)

  const open = localProgress(p, SCENE.open.start, SCENE.open.end)
  const desktop = localProgress(p, SCENE.desktop.start, SCENE.desktop.end)
  const contract = localProgress(p, SCENE.contract.start, SCENE.contract.end)
  const morph = localProgress(p, SCENE.morph.start, SCENE.morph.end)
  const mobile = localProgress(p, SCENE.mobile.start, SCENE.mobile.end)
  const sync = localProgress(p, SCENE.sync.start, SCENE.sync.end)
  const cta = localProgress(p, SCENE.cta.start, SCENE.cta.end)

  const lid =
    p < SCENE.open.start ? 0.08 : p < SCENE.open.end ? lerp(0.08, 1, open) : 1

  const screenOn =
    p < SCENE.open.start + 0.04
      ? 0
      : p < SCENE.open.end
        ? clamp01((open - 0.35) / 0.65)
        : 1

  let camRx = 14
  let camRy = -20
  let camScale = 0.88
  let camTx = 36
  let camTy = 48

  if (p < SCENE.open.end) {
    const t = localProgress(p, SCENE.hero.start, SCENE.open.end)
    camRx = lerp(16, 11, t)
    camRy = lerp(-22, -16, t)
    camScale = lerp(0.86, 0.94, t)
    camTx = lerp(48, 18, t)
    camTy = lerp(64, 18, t)
  } else if (p < SCENE.desktop.end) {
    const t = desktop
    camRx = lerp(11, 9, t)
    camRy = lerp(-16, -10 + Math.sin(t * Math.PI) * 4, t)
    camScale = lerp(0.94, 1, t)
    camTx = lerp(18, 0, t)
    camTy = lerp(18, 0, t)
  } else if (p < SCENE.contract.end) {
    camRx = 8
    camRy = -6
    camScale = 1.02
    camTx = 0
    camTy = -8
  } else if (p < SCENE.morph.end) {
    camRx = lerp(8, 4, morph)
    camRy = lerp(-6, 0, morph)
    camScale = lerp(1.02, 0.98, morph)
    camTx = 0
    camTy = lerp(-8, 0, morph)
  } else if (p < SCENE.mobile.end) {
    camRx = 3
    camRy = lerp(0, 6, mobile)
    camScale = 1
    camTx = 0
    camTy = 0
  } else if (p < SCENE.sync.end) {
    camRx = 6
    camRy = -8
    camScale = 0.86
    camTx = -40
    camTy = 10
  } else {
    camRx = 8
    camRy = -10
    camScale = 0.8
    camTx = 0
    camTy = 20
  }

  const morphAmt = p < SCENE.morph.start ? 0 : p < SCENE.morph.end ? morph : 1

  const desktopBeat =
    DESKTOP_BEATS[beatIndex(desktop, DESKTOP_BEATS.length)] ?? 'dashboard'
  const contractBeat =
    CONTRACT_BEATS[beatIndex(contract, CONTRACT_BEATS.length)] ?? 'upload'
  const mobileBeat =
    MOBILE_BEATS[beatIndex(mobile, MOBILE_BEATS.length)] ?? 'today'

  let phase: LandingFrameState['phase'] = 'boot'
  if (p >= SCENE.cta.start) phase = 'cta'
  else if (p >= SCENE.sync.start) phase = 'sync'
  else if (p >= SCENE.mobile.start) phase = 'mobile'
  else if (p >= SCENE.morph.start) phase = morphAmt < 0.42 ? 'contract' : 'mobile'
  else if (p >= SCENE.contract.start) phase = 'contract'
  else if (p >= SCENE.open.end - 0.02) phase = 'desktop'
  else phase = screenOn > 0.4 ? 'desktop' : 'boot'

  let copyTitle = ''
  let copyBody = ''
  let copySide: 'left' | 'right' = 'left'
  let copyOpacity = 0

  if (p >= SCENE.desktop.start && p < SCENE.desktop.end) {
    const i = beatIndex(desktop, DESKTOP_COPY.length)
    const c = DESKTOP_COPY[i]!
    copyTitle = c.title
    copyBody = c.body
    copySide = c.side
    copyOpacity = desktop > 0.04 && desktop < 0.98 ? 1 : 0
  } else if (p >= SCENE.contract.start && p < SCENE.contract.end) {
    copyTitle = 'Umowa gotowa w kilka chwil.'
    copyBody =
      'Bez ręcznego przepisywania danych i bez naruszania treści wzoru.'
    copySide = 'left'
    copyOpacity = 1
  } else if (p >= SCENE.morph.start && p < SCENE.morph.end) {
    copyTitle = 'To samo studio.\nTeraz w kieszeni.'
    copyBody = ''
    copySide = 'left'
    copyOpacity = morph > 0.15 && morph < 0.9 ? 1 : morph < 0.15 ? morph / 0.15 : (1 - morph) / 0.1
  } else if (p >= SCENE.mobile.start && p < SCENE.mobile.end) {
    const i = beatIndex(mobile, MOBILE_COPY.length)
    copyTitle = MOBILE_COPY[i] ?? ''
    copyBody = ''
    copySide = 'left'
    copyOpacity = 1
  } else if (p >= SCENE.sync.start && p < SCENE.sync.end) {
    copyTitle = 'Zmiana na telefonie.\nOd razu w studio.'
    copyBody = 'Ta sama checklista. Ten sam projekt.'
    copySide = 'right'
    copyOpacity = 1
  }

  const heroOpacity =
    p < SCENE.hero.end
      ? 1
      : p < SCENE.open.end
        ? clamp01(1 - open * 1.15)
        : 0

  const navDraw =
    mobileBeat === 'nav'
      ? clamp01((mobile - beatIndex(mobile, MOBILE_BEATS.length) / MOBILE_BEATS.length) * MOBILE_BEATS.length)
      : mobileBeat === 'checklist' || phase === 'sync'
        ? 1
        : 0

  return {
    progress: p,
    lid,
    morph: morphAmt,
    screenOn,
    camRx,
    camRy,
    camScale,
    camTx,
    camTy,
    heroOpacity,
    copyOpacity: clamp01(copyOpacity),
    copySide,
    copyTitle,
    copyBody,
    phase: phase === 'cta' ? 'cta' : phase === 'boot' && screenOn > 0.5 ? 'desktop' : phase,
    desktopBeat,
    contractBeat,
    mobileBeat: phase === 'sync' ? 'checklist' : mobileBeat,
    navDraw: mobileBeat === 'nav' ? clamp01(navDraw) : 1,
    checklistDone:
      phase === 'sync' || (mobileBeat === 'checklist' && mobile > 0.7),
    syncReveal: sync,
    ctaReveal: cta,
    showDual: p >= SCENE.sync.start && p < SCENE.cta.start,
  }
}

export function createLandingTimeline(input: {
  trigger: HTMLElement
  pin: HTMLElement
  onUpdate: (frame: LandingFrameState) => void
  reducedMotion: boolean
}): () => void {
  if (input.reducedMotion) {
    input.onUpdate(sampleLandingFrame(0.32))
    return () => undefined
  }

  const state = { p: 0 }
  const tween = gsap.to(state, {
    p: 1,
    ease: 'none',
    scrollTrigger: {
      trigger: input.trigger,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.55,
      pin: input.pin,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
    onUpdate: () => {
      input.onUpdate(sampleLandingFrame(state.p))
    },
  })

  // Initial frame
  input.onUpdate(sampleLandingFrame(0))

  return () => {
    tween.scrollTrigger?.kill()
    tween.kill()
  }
}
