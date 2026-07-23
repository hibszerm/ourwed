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
  'Analizowanie struktury',
  'Rozpoznawanie pól',
  'Dane klientów',
  'Konfiguracja',
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

const QUESTIONS = [
  { id: 'q1', label: 'Imię Panny Młodej', answer: 'Aleksandra' },
  { id: 'q2', label: 'Imię Pana Młodego', answer: 'Michał' },
  { id: 'q3', label: 'Miejsce ceremonii', answer: 'Kościół św. Jana' },
  { id: 'q4', label: 'Miejsce wesela', answer: 'Pałac Mała Wieś' },
  { id: 'q5', label: 'Wybrany pakiet', answer: 'Premium' },
] as const

const FILLS = [
  { token: '{{ bride_first_name }}', value: 'Natalia' },
  { token: '{{ groom_first_name }}', value: 'Tomasz' },
  { token: '{{ ceremony_place }}', value: 'Pałac na Wodzie' },
  { token: '{{ package }}', value: 'Premium' },
] as const

const CHAPTERS = [
  { id: 'upload', label: 'Dokument', range: [0, 0.12] },
  { id: 'ai', label: 'Analiza', range: [0.1, 0.24] },
  { id: 'vars', label: 'Pola', range: [0.22, 0.36] },
  { id: 'form', label: 'Formularz', range: [0.34, 0.48] },
  { id: 'fill', label: 'Odpowiedzi', range: [0.46, 0.6] },
  { id: 'crm', label: 'Projekt', range: [0.58, 0.72] },
  { id: 'gen', label: 'Umowa', range: [0.7, 0.86] },
  { id: 'end', label: 'Gotowe', range: [0.84, 1] },
] as const

const R = {
  contract: [0.0, 0.14],
  analysis: [0.1, 0.26],
  variables: [0.22, 0.38],
  questionnaire: [0.34, 0.5],
  fill: [0.46, 0.62],
  crm: [0.58, 0.74],
  generate: [0.7, 0.88],
  finale: [0.84, 1.0],
} as const

/** Mobile: one card at a time, soft overlap between beats */
const M = {
  contract: [0.0, 0.14],
  analysis: [0.1, 0.26],
  variables: [0.22, 0.38],
  questionnaire: [0.34, 0.5],
  fill: [0.46, 0.62],
  crm: [0.58, 0.74],
  generate: [0.7, 0.9],
  finale: [0.86, 1.0],
} as const

const MOBILE_DOTS = [
  M.contract,
  M.analysis,
  M.variables,
  M.questionnaire,
  M.fill,
  M.crm,
  M.generate,
] as const

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n))
}

function localOf(g: number, start: number, end: number) {
  if (end <= start) return 0
  return clamp01((g - start) / (end - start))
}

function softOpacity(local: number) {
  if (local <= 0) return 0
  if (local < 0.18) return local / 0.18
  if (local > 0.82) return (1 - local) / 0.18
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
  return useSpring(raw, { stiffness: 90, damping: 30, mass: 0.4 })
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
            OurWed czyta strukturę i przygotowuje konfigurację.
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
          <p className={styles.flowHint}>Pola wypływają z dokumentu</p>
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

function QuestionRow({
  label,
  index,
  local,
  showAnswer,
  answer,
}: {
  label: string
  index: number
  local: MotionValue<number>
  showAnswer?: boolean
  answer?: string
}) {
  const start = 0.08 + (index / QUESTIONS.length) * 0.58
  const mid = start + 0.1
  const checkAt = start + 0.26
  const opacity = useTransform(local, [start, mid], [0, 1])
  const y = useTransform(local, [start, mid], [18, 0])
  const checked = useTransform(local, [checkAt, checkAt + 0.06], [0, 1])
  const answerOp = useTransform(local, [checkAt, checkAt + 0.1], [0, 1])

  return (
    <motion.li className={styles.qRow} style={{ opacity, y }}>
      <span className={styles.checkbox}>
        <motion.span
          className={styles.checkboxOn}
          style={{ opacity: checked, scale: checked }}
        >
          <Check size={12} strokeWidth={2.5} />
        </motion.span>
      </span>
      <span className={styles.qLabel}>{label}</span>
      {showAnswer && answer ? (
        <motion.strong className={styles.qAnswer} style={{ opacity: answerOp }}>
          {answer}
        </motion.strong>
      ) : null}
    </motion.li>
  )
}

function QuestionnaireLayer({ progress }: { progress: MotionValue<number> }) {
  const local = useTransform(progress, (g) =>
    localOf(g, R.questionnaire[0], R.questionnaire[1]),
  )
  const opacity = useTransform(local, softOpacity)
  const scale = useTransform(local, [0, 0.25, 1], [0.96, 1, 1])
  const y = useTransform(local, [0, 0.2, 1], [16, 0, -8])

  return (
    <Layer opacity={opacity} y={y} scale={scale}>
      <div className={styles.formWide}>
        <div className={styles.formHead}>
          <p className={styles.kicker}>Formularz dla klienta</p>
          <h3 className={styles.stageTitle}>Zbudowany z pól umowy</h3>
        </div>
        <ul className={styles.qList}>
          {QUESTIONS.map((q, i) => (
            <QuestionRow key={q.id} label={q.label} index={i} local={local} />
          ))}
        </ul>
      </div>
    </Layer>
  )
}

function FillLayer({ progress }: { progress: MotionValue<number> }) {
  const local = useTransform(progress, (g) => localOf(g, R.fill[0], R.fill[1]))
  const opacity = useTransform(local, softOpacity)
  const scale = useTransform(local, [0, 0.25, 1], [0.96, 1, 1])
  const y = useTransform(local, [0, 0.2, 1], [16, 0, -8])

  return (
    <Layer opacity={opacity} y={y} scale={scale}>
      <div className={styles.formWide}>
        <div className={styles.formHead}>
          <p className={styles.kicker}>Klient wypełnia</p>
          <h3 className={styles.stageTitle}>Odpowiedzi wracają do projektu</h3>
        </div>
        <ul className={styles.qList}>
          {QUESTIONS.map((q, i) => (
            <QuestionRow
              key={q.id}
              label={q.label}
              answer={q.answer}
              index={i}
              local={local}
              showAnswer
            />
          ))}
        </ul>
      </div>
    </Layer>
  )
}

function CrmLayer({ progress }: { progress: MotionValue<number> }) {
  const local = useTransform(progress, (g) => localOf(g, R.crm[0], R.crm[1]))
  const opacity = useTransform(local, softOpacity)
  const scale = useTransform(local, [0, 0.3, 1], [0.94, 1.01, 1])
  const y = useTransform(local, [0, 0.25, 1], [22, 0, -8])
  const b1 = useTransform(local, [0.38, 0.5], [0, 1])
  const b2 = useTransform(local, [0.52, 0.64], [0, 1])

  return (
    <Layer opacity={opacity} y={y} scale={scale}>
      <div className={styles.crmWide}>
        <div className={styles.crmMain}>
          <p className={styles.kicker}>Projekt</p>
          <h3 className={styles.coupleTitle}>Aleksandra &amp; Michał</h3>
          <p className={styles.coupleMeta}>14 sierpnia 2027</p>
          <p className={styles.couplePackage}>Pakiet Premium</p>
          <div className={styles.badges}>
            <motion.span className={styles.badge} style={{ opacity: b1 }}>
              <Check size={13} strokeWidth={2.5} />
              Umowa
            </motion.span>
            <motion.span className={styles.badge} style={{ opacity: b2 }}>
              <Check size={13} strokeWidth={2.5} />
              Formularz
            </motion.span>
          </div>
        </div>
        <div className={styles.crmSide}>
          <div className={styles.crmStat}>
            <span>Ceremonia</span>
            <strong>Kościół św. Jana</strong>
          </div>
          <div className={styles.crmStat}>
            <span>Wesele</span>
            <strong>Pałac Mała Wieś</strong>
          </div>
          <div className={styles.crmStat}>
            <span>Godzina</span>
            <strong>15:00</strong>
          </div>
        </div>
      </div>
    </Layer>
  )
}

function FillRow({
  token,
  value,
  index,
  local,
}: {
  token: string
  value: string
  index: number
  local: MotionValue<number>
}) {
  const start = 0.12 + index * 0.16
  const tokenOut = useTransform(
    local,
    [start, start + 0.12, start + 0.24],
    [1, 1, 0],
  )
  const valueIn = useTransform(local, [start + 0.14, start + 0.28], [0, 1])
  const valueY = useTransform(local, [start + 0.14, start + 0.28], [8, 0])
  return (
    <div className={styles.fillRow}>
      <motion.code style={{ opacity: tokenOut }}>{token}</motion.code>
      <motion.strong style={{ opacity: valueIn, y: valueY }}>
        {value}
      </motion.strong>
    </div>
  )
}

function GenerateLayer({ progress }: { progress: MotionValue<number> }) {
  const local = useTransform(progress, (g) =>
    localOf(g, R.generate[0], R.generate[1]),
  )
  const opacity = useTransform(local, softOpacity)
  const scale = useTransform(local, [0, 0.25, 1], [0.97, 1, 1])
  const y = useTransform(local, [0, 0.2, 1], [14, 0, -6])

  return (
    <Layer opacity={opacity} y={y} scale={scale}>
      <div className={styles.genWide}>
        <div className={styles.genHead}>
          <div>
            <p className={styles.kicker}>Generowanie</p>
            <h3 className={styles.stageTitle}>
              Ten sam szablon · nowy klient
            </h3>
          </div>
          <span className={styles.genTag}>Natalia &amp; Tomasz</span>
        </div>
        <div className={styles.genBody}>
          <div className={styles.genDoc}>
            <div className={styles.docxLabel}>
              Umowa_GP_Natalia_Tomasz.docx
            </div>
            <p className={styles.docxLead}>
              Niniejsza umowa zawierana jest pomiędzy Studiem a Parą Młodą.
            </p>
            <div className={styles.fillList}>
              {FILLS.map((row, i) => (
                <FillRow
                  key={row.token}
                  token={row.token}
                  value={row.value}
                  index={i}
                  local={local}
                />
              ))}
            </div>
          </div>
          <div className={styles.genNote}>
            <p>
              Wartości z formularza wstawiają się w miejsca pól. Szablon
              zostaje ten sam.
            </p>
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
          Jedna umowa.
          <br />
          Cały workflow.
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
        <QuestionnaireLayer progress={progress} />
        <FillLayer progress={progress} />
        <CrmLayer progress={progress} />
        <GenerateLayer progress={progress} />
        <FinaleLayer progress={progress} />
      </div>
    </div>
  )
}

/* ── Mobile: dedicated one-card scroll story ─────────── */

function MobileCardLayer({
  progress,
  range,
  children,
}: {
  progress: MotionValue<number>
  range: readonly [number, number]
  children: ReactNode
}) {
  const local = useTransform(progress, (g) => localOf(g, range[0], range[1]))
  const opacity = useTransform(local, softOpacity)
  const y = useTransform(local, [0, 0.2, 0.8, 1], [28, 0, 0, -18])
  const scale = useTransform(local, [0, 0.2, 0.8, 1], [0.94, 1, 1, 0.97])

  return (
    <motion.div
      className={styles.mobileLayer}
      style={{ opacity, y, scale }}
      aria-hidden
    >
      {children}
    </motion.div>
  )
}

function MobileProgressDots({ progress }: { progress: MotionValue<number> }) {
  const [active, setActive] = useState(0)
  useEffect(() => {
    return progress.on('change', (g) => {
      let idx = 0
      for (let i = 0; i < MOBILE_DOTS.length; i++) {
        if (g >= MOBILE_DOTS[i][0]) idx = i
      }
      setActive(idx)
    })
  }, [progress])

  return (
    <div className={styles.mobileDots} aria-hidden>
      {MOBILE_DOTS.map((_, i) => (
        <span
          key={i}
          className={styles.mobileDot}
          data-active={i === active ? 'true' : 'false'}
          data-done={i < active ? 'true' : 'false'}
        />
      ))}
    </div>
  )
}

function MobileScrollStory({ progress }: { progress: MotionValue<number> }) {
  const bar = useTransform(progress, (g) =>
    localOf(g, M.analysis[0], M.analysis[1]),
  )
  const barScale = useTransform(bar, [0.04, 0.95], [0.05, 1])
  const stageMv = useTransform(bar, (l) =>
    Math.min(ANALYSIS_STAGES.length - 1, Math.floor(l * ANALYSIS_STAGES.length)),
  )
  const [aiStage, setAiStage] = useState(0)
  useEffect(() => stageMv.on('change', setAiStage), [stageMv])

  const fillLocal = useTransform(progress, (g) => localOf(g, M.fill[0], M.fill[1]))

  return (
    <div className={styles.mobileStage}>
      <MobileCardLayer progress={progress} range={M.contract}>
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
          <div className={styles.docLinesCompact}>
            <i style={{ width: '72%' }} />
            <i style={{ width: '90%' }} />
            <i style={{ width: '64%' }} />
            <i style={{ width: '84%' }} />
          </div>
          <div className={styles.primaryBtn}>Analizuj AI</div>
        </div>
      </MobileCardLayer>

      <MobileCardLayer progress={progress} range={M.analysis}>
        <div className={styles.mobileCard}>
          <div className={analysisUi.iconWrap}>
            {aiStage >= ANALYSIS_STAGES.length - 1 ? (
              <Check size={20} strokeWidth={2} className={analysisUi.iconDone} />
            ) : (
              <LoaderCircle
                size={20}
                strokeWidth={1.75}
                className={`${analysisUi.iconSpin} ${styles.spin}`}
              />
            )}
          </div>
          <h3 className={styles.mobileCardTitle}>Analizujemy dokument</h3>
          <div className={analysisUi.progressTrack}>
            <motion.div
              className={analysisUi.progressFill}
              style={{ scaleX: barScale, transition: 'none' }}
            />
          </div>
          <ul className={analysisUi.stages}>
            {ANALYSIS_STAGES.map((label, i) => {
              const done = i < aiStage
              const current = i === aiStage
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
                  <span className={analysisUi.stageLabel}>{label}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </MobileCardLayer>

      <MobileCardLayer progress={progress} range={M.variables}>
        <div className={styles.mobileCard}>
          <p className={styles.kicker}>Rozpoznane pola</p>
          <h3 className={styles.mobileCardTitle}>Dokument zrozumiany</h3>
          <div className={styles.mobileChipGrid}>
            {VARIABLES.slice(0, 6).map((item) => (
              <div key={item.id} className={styles.flowChip}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </MobileCardLayer>

      <MobileCardLayer progress={progress} range={M.questionnaire}>
        <div className={styles.mobileCard}>
          <p className={styles.kicker}>Formularz</p>
          <h3 className={styles.mobileCardTitle}>Z pól umowy</h3>
          <ul className={styles.mobileQList}>
            {QUESTIONS.map((q) => (
              <li key={q.id}>
                <span className={styles.checkbox}>
                  <span className={styles.checkboxEmpty} />
                </span>
                {q.label}
              </li>
            ))}
          </ul>
        </div>
      </MobileCardLayer>

      <MobileCardLayer progress={progress} range={M.fill}>
        <div className={styles.mobileCard}>
          <p className={styles.kicker}>Klient wypełnia</p>
          <h3 className={styles.mobileCardTitle}>Odpowiedzi w projekcie</h3>
          <ul className={styles.mobileQList}>
            {QUESTIONS.map((q, i) => (
              <MobileFillRow
                key={q.id}
                label={q.label}
                answer={q.answer}
                index={i}
                local={fillLocal}
              />
            ))}
          </ul>
        </div>
      </MobileCardLayer>

      <MobileCardLayer progress={progress} range={M.crm}>
        <div className={styles.mobileCard}>
          <p className={styles.kicker}>Projekt</p>
          <h3 className={styles.coupleTitle}>Aleksandra &amp; Michał</h3>
          <p className={styles.coupleMeta}>14.08.2027 · Premium</p>
          <div className={styles.badges}>
            <span className={styles.badge}>
              <Check size={13} strokeWidth={2.5} />
              Umowa
            </span>
            <span className={styles.badge}>
              <Check size={13} strokeWidth={2.5} />
              Formularz
            </span>
          </div>
          <div className={styles.mobileCrmStats}>
            <div>
              <span>Ceremonia</span>
              <strong>Kościół św. Jana</strong>
            </div>
            <div>
              <span>Wesele</span>
              <strong>Pałac Mała Wieś</strong>
            </div>
          </div>
        </div>
      </MobileCardLayer>

      <MobileCardLayer progress={progress} range={M.generate}>
        <div className={styles.mobileCard}>
          <div className={styles.mobileGenHead}>
            <div>
              <p className={styles.kicker}>Nowa umowa</p>
              <h3 className={styles.mobileCardTitle}>Ten sam szablon</h3>
            </div>
            <span className={styles.genTag}>Natalia &amp; Tomasz</span>
          </div>
          <p className={styles.docxLabel}>Umowa_GP_Natalia_Tomasz.docx</p>
          <div className={styles.fillList}>
            {FILLS.map((row) => (
              <div key={row.token} className={styles.mobileFillStatic}>
                <code>{row.token}</code>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </MobileCardLayer>

      <MobileCardLayer progress={progress} range={M.finale}>
        <div className={styles.mobileFinale}>
          <p>
            Jedna umowa.
            <br />
            Cały workflow.
          </p>
        </div>
      </MobileCardLayer>
    </div>
  )
}

function MobileFillRow({
  label,
  answer,
  index,
  local,
}: {
  label: string
  answer: string
  index: number
  local: MotionValue<number>
}) {
  const start = 0.1 + index * 0.14
  const checked = useTransform(local, [start, start + 0.08], [0, 1])
  const answerOp = useTransform(local, [start + 0.05, start + 0.14], [0, 1])

  return (
    <li>
      <span className={styles.checkbox}>
        <motion.span
          className={styles.checkboxOn}
          style={{ opacity: checked, scale: checked }}
        >
          <Check size={12} strokeWidth={2.5} />
        </motion.span>
      </span>
      <span className={styles.mobileQCopy}>
        <em>{label}</em>
        <motion.strong style={{ opacity: answerOp }}>{answer}</motion.strong>
      </span>
    </li>
  )
}

function MobileReducedStory() {
  return (
    <div className={styles.mobileReduced}>
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
      <div className={styles.mobileCard}>
        <p className={styles.kicker}>Pola · formularz · projekt</p>
        <h3 className={styles.mobileCardTitle}>
          Jedna umowa uruchamia cały workflow
        </h3>
        <div className={styles.badges}>
          <span className={styles.badge}>
            <Check size={13} strokeWidth={2.5} />
            Umowa
          </span>
          <span className={styles.badge}>
            <Check size={13} strokeWidth={2.5} />
            Formularz
          </span>
          <span className={styles.badge}>
            <Check size={13} strokeWidth={2.5} />
            Projekt
          </span>
        </div>
      </div>
    </div>
  )
}

export function ContractAiStory() {
  const isMobile = useMediaQuery('(max-width: 900px)')
  const reduce = useReducedMotion()
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
        {isMobile
          ? 'Prześlij raz. Reszta dzieje się sama.'
          : 'Prześlij dokument raz. OurWed rozpoznaje strukturę i pola.'}
      </p>
    </header>
  )

  if (isMobile) {
    if (reduce) {
      return (
        <section id="ai-story" className={styles.mobileSection}>
          <div className={styles.innerMobile}>
            {intro}
            <MobileReducedStory />
          </div>
        </section>
      )
    }

    return (
      <section
        id="ai-story"
        ref={containerRef}
        className={styles.mobilePin}
        aria-label="Jak umowa uruchamia workflow"
      >
        <div className={styles.mobileSticky}>
          <div className={styles.mobileStickyInner}>
            {intro}
            <MobileScrollStory progress={progress} />
            <MobileProgressDots progress={progress} />
          </div>
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
