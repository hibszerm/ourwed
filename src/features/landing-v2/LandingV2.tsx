import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DeviceFrame } from '@/features/landing-v2/devices/DeviceFrame'
import {
  ContractMagicScreen,
  DesktopAppScreen,
  MobileAppScreen,
  type ContractBeat,
  type DesktopScreenId,
  type MobileScreenId,
} from '@/features/landing-v2/screens/AppScreens'
import { SceneLabel } from '@/features/landing-v2/shared/SceneLabel'
import { usePrefersReducedMotion } from '@/features/landing-v2/shared/usePrefersReducedMotion'
import styles from './LandingV2.module.css'

gsap.registerPlugin(ScrollTrigger)

const DESKTOP_SCREENS: { id: DesktopScreenId; label: string }[] = [
  { id: 'dashboard', label: 'Cały biznes na jednym pulpicie.' },
  { id: 'weddings', label: 'Wszystkie śluby. Zero arkuszy.' },
  { id: 'detail', label: 'Każdy projekt — kompletny i spokojny.' },
  { id: 'tasks', label: 'Nigdy nie zapomnisz o terminie.' },
  { id: 'payments', label: 'Płatności zawsze pod kontrolą.' },
  { id: 'contracts', label: 'Profesjonalne umowy w sekundy.' },
  { id: 'questionnaires', label: 'Klienci uzupełniają dane sami.' },
  { id: 'timeline', label: 'Dzień ślubu na osi czasu.' },
  { id: 'notifications', label: 'Wiesz, zanim coś umknie.' },
  { id: 'equipment', label: 'Sprzęt spakowany przed wyjazdem.' },
  { id: 'calendar', label: 'Sezon w jednym spojrzeniu.' },
  { id: 'stats', label: 'Biznes, który rośnie spokojnie.' },
]

const MOBILE_SCREENS: { id: MobileScreenId; label: string }[] = [
  { id: 'today', label: 'Dzisiejszy ślub — od razu jasny.' },
  { id: 'nav', label: 'Dojeżdżasz bez chaosu.' },
  { id: 'timeline', label: 'Harmonogram zawsze przy Tobie.' },
  { id: 'equipment', label: 'Checklistę odhaczasz w biegu.' },
  { id: 'notes', label: 'Szybka notatka. Nic nie ginie.' },
  { id: 'contact', label: 'Klient pod ręką.' },
  { id: 'location', label: 'Każde miejsce — jedno stuknięcie.' },
  { id: 'done', label: 'Zrobione. Idziesz dalej.' },
  { id: 'offline', label: 'Działa także bez sieci.' },
]

const CONTRACT_BEATS: { beat: ContractBeat; label: string }[] = [
  { beat: 'upload', label: 'Dodajesz umowę raz.' },
  { beat: 'analysis', label: 'Przygotowujemy dokument.' },
  { beat: 'ready', label: 'Gotowa do użycia w pakietach.' },
  { beat: 'generate', label: 'Tworzymy umowę na ślub.' },
  { beat: 'done', label: 'Gotowy dokument. Bez przepisywania.' },
]

const METRICS = [
  { value: 1200, suffix: '+', label: 'Utworzonych umów' },
  { value: 850, suffix: '+', label: 'Zakończonych ślubów' },
  { value: 40, suffix: 'h', label: 'Oszczędzonych godzin / miesiąc' },
  { value: 100, suffix: '%', label: 'Terminów dotrzymanych' },
]

type LandingV2Props = {
  onLogin: () => void
  onRegister: () => void
}

export function LandingV2({ onLogin, onRegister }: LandingV2Props) {
  const reduced = usePrefersReducedMotion()

  const awakenRef = useRef<HTMLElement | null>(null)
  const awakenPinRef = useRef<HTMLDivElement | null>(null)
  const awakenDeviceRef = useRef<HTMLDivElement | null>(null)

  const tourRef = useRef<HTMLElement | null>(null)
  const tourPinRef = useRef<HTMLDivElement | null>(null)

  const contractRef = useRef<HTMLElement | null>(null)
  const contractPinRef = useRef<HTMLDivElement | null>(null)

  const morphRef = useRef<HTMLElement | null>(null)
  const morphPinRef = useRef<HTMLDivElement | null>(null)
  const morphDeviceRef = useRef<HTMLDivElement | null>(null)

  const mobileRef = useRef<HTMLElement | null>(null)
  const mobilePinRef = useRef<HTMLDivElement | null>(null)

  const syncRef = useRef<HTMLElement | null>(null)
  const metricsRef = useRef<HTMLElement | null>(null)

  const [lidOpen, setLidOpen] = useState(reduced ? 1 : 0)
  const [screenOn, setScreenOn] = useState(reduced ? 1 : 0)
  const [desktopId, setDesktopId] = useState<DesktopScreenId>(
    reduced ? 'dashboard' : 'boot',
  )
  const [desktopLabel, setDesktopLabel] = useState(DESKTOP_SCREENS[0]!.label)
  const [contractBeat, setContractBeat] = useState<ContractBeat>(
    reduced ? 'done' : 'idle',
  )
  const [contractLabel, setContractLabel] = useState(CONTRACT_BEATS[0]!.label)
  const [morph, setMorph] = useState(reduced ? 1 : 0)
  const [mobileId, setMobileId] = useState<MobileScreenId>('today')
  const [mobileLabel, setMobileLabel] = useState(MOBILE_SCREENS[0]!.label)
  const [syncPulse, setSyncPulse] = useState(0)
  const [metricProgress, setMetricProgress] = useState(reduced ? 1 : 0)

  const lastDesktopIdx = useRef(-1)
  const lastContractIdx = useRef(-1)
  const lastMobileIdx = useRef(-1)
  const lastAwakenPhase = useRef('')
  const lastMorphBucket = useRef(-1)
  const lastLidBucket = useRef(-1)
  const lastScreenBucket = useRef(-1)
  const lastSyncBucket = useRef(-1)
  const lastMetricBucket = useRef(-1)

  useEffect(() => {
    if (reduced) return

    const ctx = gsap.context(() => {
      // Chapter 1 — device awakens
      if (awakenRef.current && awakenPinRef.current && awakenDeviceRef.current) {
        const state = { lid: 0, screen: 0 }
        gsap
          .timeline({
            scrollTrigger: {
              trigger: awakenRef.current,
              start: 'top top',
              end: 'bottom bottom',
              scrub: 0.65,
              pin: awakenPinRef.current,
              anticipatePin: 1,
            },
          })
          .to(state, {
            lid: 1,
            duration: 0.55,
            ease: 'none',
            onUpdate: () => {
              const rounded = Math.round(state.lid * 32) / 32
              if (rounded !== lastLidBucket.current) {
                lastLidBucket.current = rounded
                setLidOpen(rounded)
              }
            },
          })
          .to(state, {
            screen: 1,
            duration: 0.45,
            ease: 'none',
            onUpdate: () => {
              const rounded = Math.round(state.screen * 32) / 32
              if (rounded !== lastScreenBucket.current) {
                lastScreenBucket.current = rounded
                setScreenOn(rounded)
              }
              const phase = state.screen > 0.55 ? 'dash' : 'boot'
              if (phase !== lastAwakenPhase.current) {
                lastAwakenPhase.current = phase
                setDesktopId(phase === 'dash' ? 'dashboard' : 'boot')
              }
            },
          })
      }

      // Chapter 2 — product tour (screen only)
      if (tourRef.current && tourPinRef.current) {
        const state = { i: 0 }
        gsap.to(state, {
          i: DESKTOP_SCREENS.length - 0.001,
          ease: 'none',
          scrollTrigger: {
            trigger: tourRef.current,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.5,
            pin: tourPinRef.current,
            anticipatePin: 1,
            onUpdate: () => {
              const idx = Math.min(
                DESKTOP_SCREENS.length - 1,
                Math.floor(state.i),
              )
              if (idx === lastDesktopIdx.current) return
              lastDesktopIdx.current = idx
              const screen = DESKTOP_SCREENS[idx]!
              setDesktopId(screen.id)
              setDesktopLabel(screen.label)
              setLidOpen(1)
              setScreenOn(1)
            },
          },
        })
      }

      // Chapter 3 — contract magic
      if (contractRef.current && contractPinRef.current) {
        const state = { i: 0 }
        gsap.to(state, {
          i: CONTRACT_BEATS.length - 0.001,
          ease: 'none',
          scrollTrigger: {
            trigger: contractRef.current,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.55,
            pin: contractPinRef.current,
            anticipatePin: 1,
            onUpdate: () => {
              const idx = Math.min(
                CONTRACT_BEATS.length - 1,
                Math.floor(state.i),
              )
              if (idx === lastContractIdx.current) return
              lastContractIdx.current = idx
              const beat = CONTRACT_BEATS[idx]!
              setContractBeat(beat.beat)
              setContractLabel(beat.label)
            },
          },
        })
      }

      // Chapter 4 — laptop → phone morph
      if (morphRef.current && morphPinRef.current && morphDeviceRef.current) {
        const state = { m: 0 }
        gsap.to(state, {
          m: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: morphRef.current,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.7,
            pin: morphPinRef.current,
            anticipatePin: 1,
            onUpdate: () => {
              const rounded = Math.round(state.m * 40) / 40
              if (rounded !== lastMorphBucket.current) {
                lastMorphBucket.current = rounded
                setMorph(rounded)
              }
            },
          },
        })
      }

      // Chapter 5 — mobile wedding day
      if (mobileRef.current && mobilePinRef.current) {
        const state = { i: 0 }
        gsap.to(state, {
          i: MOBILE_SCREENS.length - 0.001,
          ease: 'none',
          scrollTrigger: {
            trigger: mobileRef.current,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.5,
            pin: mobilePinRef.current,
            anticipatePin: 1,
            onUpdate: () => {
              const idx = Math.min(
                MOBILE_SCREENS.length - 1,
                Math.floor(state.i),
              )
              if (idx === lastMobileIdx.current) return
              lastMobileIdx.current = idx
              const screen = MOBILE_SCREENS[idx]!
              setMobileId(screen.id)
              setMobileLabel(screen.label)
            },
          },
        })
      }

      // Chapter 6 — sync pulse
      if (syncRef.current) {
        ScrollTrigger.create({
          trigger: syncRef.current,
          start: 'top 70%',
          end: 'bottom 40%',
          scrub: true,
          onUpdate: (self) => {
            const rounded = Math.round(self.progress * 24) / 24
            if (rounded !== lastSyncBucket.current) {
              lastSyncBucket.current = rounded
              setSyncPulse(rounded)
            }
          },
        })
      }

      // Chapter 7 — metrics
      if (metricsRef.current) {
        ScrollTrigger.create({
          trigger: metricsRef.current,
          start: 'top 75%',
          end: 'center center',
          scrub: true,
          onUpdate: (self) => {
            const rounded = Math.round(self.progress * 24) / 24
            if (rounded !== lastMetricBucket.current) {
              lastMetricBucket.current = rounded
              setMetricProgress(rounded)
            }
          },
        })
      }
    })

    return () => {
      ctx.revert()
    }
  }, [reduced])

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <a
            href="#"
            className={styles.logo}
            onClick={(e) => {
              e.preventDefault()
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            <span className={styles.logoMark} aria-hidden>
              OW
            </span>
            <span className={styles.logoText}>OurWed</span>
          </a>
          <nav className={styles.navLinks} aria-label="Nawigacja">
            <button type="button" className={styles.navGhost} onClick={onLogin}>
              Zaloguj się
            </button>
            <button type="button" className={styles.navCta} onClick={onRegister}>
              Wypróbuj
            </button>
          </nav>
        </div>
      </header>

      <main>
        {/* Chapter 1 */}
        <section
          ref={awakenRef}
          className={styles.runway}
          style={{ height: reduced ? 'auto' : '280vh' }}
          aria-label="OurWed budzi się"
        >
          <div ref={awakenPinRef} className={styles.pin}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>Dla fotografów i filmowców ślubnych</p>
              <h1 className={styles.heroTitle}>
                Twój biznes ślubny.
                <br />
                Wreszcie spokojny.
              </h1>
              <p className={styles.heroSub}>
                Od pierwszego zapytania do zakończenia projektu — w jednym,
                spokojnym miejscu.
              </p>
            </div>
            <div ref={awakenDeviceRef} className={styles.deviceWrap}>
              <DeviceFrame
                lidOpen={lidOpen}
                screenOn={screenOn}
                morph={0}
              >
                <DesktopAppScreen id={desktopId === 'boot' ? 'boot' : 'dashboard'} />
              </DeviceFrame>
            </div>
            {!reduced ? (
              <p className={styles.scrollHint}>Przewiń, aby zobaczyć</p>
            ) : null}
          </div>
        </section>

        {/* Chapter 2 */}
        <section
          ref={tourRef}
          className={styles.runway}
          style={{ height: reduced ? 'auto' : '420vh' }}
          aria-label="Produkt"
        >
          <div ref={tourPinRef} className={styles.pin}>
            <div className={styles.tourLayout}>
              <SceneLabel
                eyebrow="Studio"
                title={desktopLabel}
                align="left"
              />
              <DeviceFrame lidOpen={1} screenOn={1} morph={0}>
                <DesktopAppScreen id={desktopId === 'boot' ? 'dashboard' : desktopId} />
              </DeviceFrame>
              <div className={styles.spacerLabel} />
            </div>
          </div>
        </section>

        {/* Chapter 3 */}
        <section
          ref={contractRef}
          className={styles.runway}
          style={{ height: reduced ? 'auto' : '260vh' }}
          aria-label="Umowy pakietu"
        >
          <div ref={contractPinRef} className={styles.pin}>
            <div className={styles.tourLayout}>
              <SceneLabel
                eyebrow="Umowy"
                title={contractLabel}
                align="left"
              />
              <DeviceFrame lidOpen={1} screenOn={1} morph={0}>
                <ContractMagicScreen beat={contractBeat} />
              </DeviceFrame>
              <div className={styles.spacerLabel} />
            </div>
          </div>
        </section>

        {/* Chapter 4 */}
        <section
          ref={morphRef}
          className={styles.runway}
          style={{ height: reduced ? 'auto' : '220vh' }}
          aria-label="Od biurka do dnia ślubu"
        >
          <div ref={morphPinRef} className={styles.pin}>
            <p className={styles.morphCopy}>
              To samo studio.
              <br />
              Teraz w kieszeni.
            </p>
            <div ref={morphDeviceRef} className={styles.deviceWrap}>
              <DeviceFrame
                lidOpen={1}
                screenOn={1}
                morph={morph}
              >
                {morph < 0.55 ? (
                  <DesktopAppScreen id="detail" />
                ) : (
                  <MobileAppScreen id="today" />
                )}
              </DeviceFrame>
            </div>
          </div>
        </section>

        {/* Chapter 5 */}
        <section
          ref={mobileRef}
          className={styles.runway}
          style={{ height: reduced ? 'auto' : '360vh' }}
          aria-label="Dzień ślubu"
        >
          <div ref={mobilePinRef} className={styles.pin}>
            <div className={styles.tourLayout}>
              <SceneLabel
                eyebrow="Dzień ślubu"
                title={mobileLabel}
                align="left"
              />
              <DeviceFrame lidOpen={1} screenOn={1} morph={1} mode="phone">
                <MobileAppScreen id={mobileId} />
              </DeviceFrame>
              <div className={styles.spacerLabel} />
            </div>
          </div>
        </section>

        {/* Chapter 6 */}
        <section
          ref={syncRef}
          className={styles.sync}
          aria-label="Synchronizacja"
        >
          <div className={styles.syncInner}>
            <p className={styles.eyebrow}>Wszystko razem</p>
            <h2 className={styles.sectionTitle}>
              Zmiana na telefonie.
              <br />
              Od razu w studio.
            </h2>
            <div className={styles.syncRow}>
              <div
                className={styles.syncDevice}
                style={{ opacity: 0.55 + syncPulse * 0.45 }}
              >
                <DeviceFrame morph={1} mode="phone" lidOpen={1} screenOn={1}>
                  <MobileAppScreen id="done" />
                </DeviceFrame>
              </div>
              <div
                className={styles.syncPulse}
                style={{
                  opacity: 0.25 + syncPulse * 0.75,
                  transform: `scaleX(${0.4 + syncPulse * 0.6})`,
                }}
              />
              <div
                className={styles.syncDevice}
                style={{ opacity: 0.35 + syncPulse * 0.65 }}
              >
                <DeviceFrame morph={0} lidOpen={1} screenOn={1}>
                  <DesktopAppScreen id="tasks" />
                </DeviceFrame>
              </div>
            </div>
          </div>
        </section>

        {/* Chapter 7 */}
        <section
          ref={metricsRef}
          className={styles.metrics}
          aria-label="Zaufanie produktu"
        >
          <div className={styles.metricsInner}>
            <p className={styles.eyebrow}>Spokój w liczbach</p>
            <div className={styles.metricsGrid}>
              {METRICS.map((m) => (
                <div key={m.label} className={styles.metric}>
                  <strong>
                    {Math.round(m.value * metricProgress)}
                    {m.suffix}
                  </strong>
                  <span>{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Chapter 8 */}
        <section className={styles.finale} aria-label="Zacznij">
          <div className={styles.finaleInner}>
            <h2 className={styles.finaleTitle}>
              Gotowy na spokojniejszy
              <br />
              sezon ślubny?
            </h2>
            <p className={styles.finaleSub}>
              One miejsce. Cały workflow. Zero chaosu w dniu ślubu.
            </p>
            <div className={styles.finaleActions}>
              <button
                type="button"
                className={styles.navCta}
                onClick={onRegister}
              >
                Wypróbuj OurWed
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={onLogin}
              >
                Zobacz demo — zaloguj się
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.logoText}>OurWed</span>
          <p>Platforma dla branży ślubnej.</p>
          <p className={styles.copy}>© {new Date().getFullYear()} OurWed</p>
        </div>
      </footer>
    </div>
  )
}
