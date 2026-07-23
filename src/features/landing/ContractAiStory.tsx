import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion'
import { Check, FileText, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import analysisUi from '@/features/documents/import/AiAnalysisExperience.module.css'
import styles from './ContractAiStory.module.css'

const ANALYSIS_STAGES = [
  'Dokument przesłany',
  'Analizowanie struktury dokumentu',
  'Rozpoznawanie zmiennych',
  'Wyszukiwanie danych Pary Młodej',
  'Przygotowywanie konfiguracji',
  'Gotowe',
] as const

const VARIABLES = [
  { id: 'v1', label: 'Imię Panny Młodej', value: 'Aleksandra' },
  { id: 'v2', label: 'Imię Pana Młodego', value: 'Michał' },
  { id: 'v3', label: 'Telefon', value: '+48 500 000 000' },
  { id: 'v4', label: 'Data ślubu', value: '14.08.2027' },
  { id: 'v5', label: 'Pakiet', value: 'Premium' },
  { id: 'v6', label: 'Ceremonia', value: 'Kościół św. Jana' },
  { id: 'v7', label: 'Wesele', value: 'Pałac Mała Wieś' },
  { id: 'v8', label: 'Godzina', value: '15:00' },
] as const

const CHAPTERS = [
  { id: 'upload', label: 'Dokument', range: [0, 0.22] },
  { id: 'ai', label: 'Analiza AI', range: [0.18, 0.48] },
  { id: 'vars', label: 'Zmienne', range: [0.44, 0.78] },
  { id: 'end', label: 'Gotowe', range: [0.74, 1] },
] as const

const R = {
  contract: [0.0, 0.28],
  analysis: [0.18, 0.52],
  variables: [0.44, 0.82],
  finale: [0.76, 1.0],
} as const

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n))
}

function localOf(g: number, start: number, end: number) {
  if (end <= start) return 0
  return clamp01((g - start) / (end - start))
}

function softOpacity(local: number) {
  if (local <= 0) return 0
  if (local < 0.16) return local / 0.16
  if (local > 0.84) return (1 - local) / 0.16
  return 1
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function useSmoothProgress(raw: MotionValue<number>) {
  return useSpring(raw, { stiffness: 80, damping: 28, mass: 0.45 })
}

function Layer({
  children,
  opacity,
  y,
  scale,
  x,
  interactive = false,
  className = '',
}: {
  children: ReactNode
  opacity: MotionValue<number>
  y?: MotionValue<number>
  x?: MotionValue<number>
  scale?: MotionValue<number>
  interactive?: boolean
  className?: string
}) {
  return (
    <motion.div
      className={`${styles.layer} ${className}`.trim()}
      style={{
        opacity,
        y,
        x,
        scale,
        pointerEvents: interactive ? 'auto' : 'none',
      }}
      aria-hidden={!interactive}
    >
      {children}
    </motion.div>
  )
}

function ChapterRail({ progress }: { progress: MotionValue<number> }) {
  const [active, setActive] = useState(0)
  useEffect(() => {
    return progress.on('change', (g) => {
      let idx = 0
      for (let i = 0; i < CHAPTERS.length; i++) {
        if (g >= CHAPTERS[i].range[0]) idx = i
      }
      setActive(idx)
    })
  }, [progress])

  return (
    <nav className={styles.rail} aria-label="Etapy workflow">
      {CHAPTERS.map((ch, i) => (
        <div
          key={ch.id}
          className={styles.railItem}
          data-active={i === active ? 'true' : 'false'}
          data-done={i < active ? 'true' : 'false'}
        >
          <span className={styles.railDot} />
          <span className={styles.railLabel}>{ch.label}</span>
        </div>
      ))}
    </nav>
  )
}

function MiniDoc() {
  return (
    <div className={styles.docFace}>
      <div className={styles.docFaceHead}>
        <FileText size={16} strokeWidth={1.75} />
        <span>Umowa GP – Aleksandra i Michał.pdf</span>
      </div>
      <div className={styles.docLines}>
        <i style={{ width: '62%' }} />
        <i style={{ width: '88%' }} />
        <i style={{ width: '74%' }} />
        <i style={{ width: '91%' }} />
        <i style={{ width: '55%' }} />
        <i style={{ width: '79%' }} />
        <i style={{ width: '67%' }} />
      </div>
    </div>
  )
}

function ContractLayer({ progress }: { progress: MotionValue<number> }) {
  const local = useTransform(progress, (g) => localOf(g, R.contract[0], R.contract[1]))
  const opacity = useTransform(local, softOpacity)
  const scale = useTransform(local, [0, 0.22, 0.7, 1], [0.86, 1.02, 1.04, 0.96])
  const y = useTransform(local, [0, 0.25, 1], [36, 0, -12])
  const press = useTransform(local, [0.58, 0.75], [0, 1])
  const btnScale = useTransform(press, [0, 1], [1, 0.97])

  return (
    <Layer opacity={opacity} y={y} scale={scale}>
      <div className={styles.heroPanel}>
        <div className={styles.docWide}>
          <div className={styles.docWideHead}>
            <div className={styles.docIcon}>
              <FileText size={20} strokeWidth={1.75} />
            </div>
            <div>
              <strong>Umowa GP – Aleksandra i Michał.pdf</strong>
              <span>PDF · 214 KB · gotowy do analizy</span>
            </div>
          </div>
          <div className={styles.docWideBody}>
            <div className={styles.docCol}>
              <i style={{ width: '70%' }} />
              <i style={{ width: '92%' }} />
              <i style={{ width: '84%' }} />
              <i style={{ width: '60%' }} />
              <div className={styles.docBlock} />
              <i style={{ width: '78%' }} />
              <i style={{ width: '88%' }} />
            </div>
            <div className={styles.docCol}>
              <i style={{ width: '55%' }} />
              <i style={{ width: '90%' }} />
              <i style={{ width: '72%' }} />
              <i style={{ width: '86%' }} />
              <i style={{ width: '64%' }} />
              <div className={styles.docBlock} />
              <i style={{ width: '80%' }} />
            </div>
          </div>
        </div>
        <motion.div className={styles.primaryBtn} style={{ scale: btnScale }}>
          Analizuj AI
        </motion.div>
      </div>
    </Layer>
  )
}

function AnalysisLayer({ progress }: { progress: MotionValue<number> }) {
  const local = useTransform(progress, (g) => localOf(g, R.analysis[0], R.analysis[1]))
  const opacity = useTransform(local, softOpacity)
  const y = useTransform(local, [0, 0.2, 1], [20, 0, -10])
  const scale = useTransform(local, [0, 0.25, 1], [0.97, 1, 0.99])
  const bar = useTransform(local, [0.04, 0.95], [0.05, 1])
  const stageMv = useTransform(local, (l) =>
    Math.min(ANALYSIS_STAGES.length - 1, Math.floor(l * ANALYSIS_STAGES.length)),
  )
  const [active, setActive] = useState(0)
  useEffect(() => stageMv.on('change', setActive), [stageMv])

  return (
    <Layer opacity={opacity} y={y} scale={scale}>
      <div className={styles.splitStage}>
        <div className={styles.splitDoc}>
          <MiniDoc />
        </div>
        <div className={styles.analysisWide}>
          <div className={analysisUi.iconWrap}>
            {active >= ANALYSIS_STAGES.length - 1 ? (
              <Check size={20} strokeWidth={2} className={analysisUi.iconDone} />
            ) : (
              <LoaderCircle
                size={20}
                strokeWidth={1.75}
                className={`${analysisUi.iconSpin} ${styles.spin}`}
              />
            )}
          </div>
          <h3 className={styles.stageTitle}>Analizujemy dokument</h3>
          <p className={styles.stageSub}>
            OurWed czyta strukturę dokumentu i przygotowuje konfigurację.
          </p>
          <div className={analysisUi.progressTrack}>
            <motion.div
              className={analysisUi.progressFill}
              style={{ scaleX: bar, transition: 'none' }}
            />
          </div>
          <ul className={analysisUi.stages}>
            {ANALYSIS_STAGES.map((label, i) => {
              const done = i < active
              const current = i === active
              return (
                <li
                  key={label}
                  className={analysisUi.stage}
                  data-state={done ? 'done' : current ? 'current' : 'upcoming'}
                >
                  <span className={analysisUi.stageMark}>
                    {done || (current && i === ANALYSIS_STAGES.length - 1) ? (
                      <Check size={12} strokeWidth={2.5} />
                    ) : current ? (
                      <span className={analysisUi.stageDot} />
                    ) : (
                      <span className={analysisUi.stageEmpty} />
                    )}
                  </span>
                  <span className={analysisUi.stageLabel}>
                    {current && i < ANALYSIS_STAGES.length - 1
                      ? `${label}…`
                      : label}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </Layer>
  )
}

function FlowChip({
  item,
  index,
  local,
}: {
  item: (typeof VARIABLES)[number]
  index: number
  local: MotionValue<number>
}) {
  const start = 0.08 + (index / VARIABLES.length) * 0.7
  const end = start + 0.14
  const opacity = useTransform(local, [start, end], [0, 1])
  const x = useTransform(local, [start, end], [-28 - index * 2, 0])
  const y = useTransform(local, [start, end], [8, 0])
  return (
    <motion.div className={styles.flowChip} style={{ opacity, x, y }}>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
    </motion.div>
  )
}

function VariablesLayer({ progress }: { progress: MotionValue<number> }) {
  const local = useTransform(progress, (g) =>
    localOf(g, R.variables[0], R.variables[1]),
  )
  const opacity = useTransform(local, softOpacity)
  const docScale = useTransform(local, [0, 0.4, 1], [1, 0.92, 0.88])
  const docX = useTransform(local, [0, 0.5], [40, 0])

  return (
    <Layer opacity={opacity}>
      <div className={styles.splitStage}>
        <motion.div
          className={styles.splitDoc}
          style={{ scale: docScale, x: docX }}
        >
          <MiniDoc />
          <p className={styles.flowHint}>Zmienne wypływają z dokumentu</p>
        </motion.div>
        <div className={styles.flowBoard}>
          <p className={styles.kicker}>Rozpoznane pola</p>
          <h3 className={styles.stageTitle}>Dokument zrozumiany</h3>
          <div className={styles.flowGrid}>
            {VARIABLES.map((item, i) => (
              <FlowChip key={item.id} item={item} index={i} local={local} />
            ))}
          </div>
        </div>
      </div>
    </Layer>
  )
}

function FinaleLayer({ progress }: { progress: MotionValue<number> }) {
  const local = useTransform(progress, (g) => localOf(g, R.finale[0], R.finale[1]))
  const opacity = useTransform(local, [0, 0.3, 1], [0, 1, 1])
  const y = useTransform(local, [0, 0.35], [28, 0])
  const scale = useTransform(local, [0, 0.4], [0.98, 1])

  return (
    <Layer opacity={opacity} y={y} scale={scale}>
      <div className={styles.finale}>
        <p className={styles.finaleLine}>
          Dokument zrozumiany.
          <br />
          Dalej — formularze, projekty i reszta procesu.
        </p>
      </div>
    </Layer>
  )
}

function DesktopStory({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className={styles.desktopLayout}>
      <ChapterRail progress={progress} />
      <div className={styles.stage}>
        <ContractLayer progress={progress} />
        <AnalysisLayer progress={progress} />
        <VariablesLayer progress={progress} />
        <FinaleLayer progress={progress} />
      </div>
    </div>
  )
}

function MobileBeat({
  children,
  delay = 0,
}: {
  children: ReactNode
  delay?: number
}) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={styles.mobileBeat}>{children}</div>
  return (
    <motion.div
      className={styles.mobileBeat}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
        delay,
      }}
    >
      {children}
    </motion.div>
  )
}

function MobileStory() {
  return (
    <div className={styles.mobileStack}>
      <MobileBeat>
        <div className={styles.mobileCard}>
          <div className={styles.docWideHead}>
            <div className={styles.docIcon}>
              <FileText size={20} strokeWidth={1.75} />
            </div>
            <div>
              <strong>Umowa GP – Aleksandra i Michał.pdf</strong>
              <span>PDF · 214 KB</span>
            </div>
          </div>
          <div className={styles.primaryBtn}>Analizuj AI</div>
        </div>
      </MobileBeat>

      <MobileBeat delay={0.03}>
        <div className={styles.mobileCard}>
          <h3 className={styles.stageTitle}>Analizujemy dokument</h3>
          <p className={styles.stageSub}>
            OurWed czyta strukturę dokumentu i rozpoznaje pola.
          </p>
          <ul className={analysisUi.stages}>
            {ANALYSIS_STAGES.slice(0, 4).map((label, i) => (
              <li
                key={label}
                className={analysisUi.stage}
                data-state={i < 3 ? 'done' : 'current'}
              >
                <span className={analysisUi.stageMark}>
                  {i < 3 ? (
                    <Check size={12} strokeWidth={2.5} />
                  ) : (
                    <span className={analysisUi.stageDot} />
                  )}
                </span>
                <span className={analysisUi.stageLabel}>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </MobileBeat>

      <MobileBeat delay={0.03}>
        <div className={styles.mobileCard}>
          <p className={styles.kicker}>Rozpoznane pola</p>
          <h3 className={styles.stageTitle}>Dokument zrozumiany</h3>
          <div className={styles.flowGrid}>
            {VARIABLES.slice(0, 6).map((item) => (
              <div key={item.id} className={styles.flowChip}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </MobileBeat>

      <MobileBeat delay={0.05}>
        <div className={styles.finale}>
          <p className={styles.finaleLine}>
            Dokument zrozumiany.
            <br />
            Dalej — formularze, projekty i reszta procesu.
          </p>
        </div>
      </MobileBeat>
    </div>
  )
}

export function ContractAiStory() {
  const isMobile = useMediaQuery('(max-width: 900px)')
  const containerRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })
  const progress = useSmoothProgress(scrollYProgress)

  const intro = (
    <header className={styles.intro}>
      <p className={styles.eyebrow}>03 · Dokumenty</p>
      <h2 className={styles.title}>Umowa, którą system rozumie</h2>
      <p className={styles.subtitle}>
        Prześlij dokument raz. OurWed rozpoznaje strukturę i pola.
      </p>
    </header>
  )

  if (isMobile) {
    return (
      <section id="ai-story" className={styles.mobileSection}>
        <div className={styles.innerMobile}>
          {intro}
          <MobileStory />
        </div>
      </section>
    )
  }

  return (
    <section
      id="ai-story"
      ref={containerRef}
      className={styles.pinSection}
      aria-label="Analiza dokumentu"
    >
      <div className={styles.sticky}>
        <div className={styles.innerDesktop}>
          {intro}
          <DesktopStory progress={progress} />
        </div>
      </div>
    </section>
  )
}
