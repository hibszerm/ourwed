import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { WeddingCard } from '@/features/weddings/components/WeddingCard'
import {
  demoWedding,
  demoWeddings,
  demoWeddingTasks,
  getDemoSeasonFinance,
} from '@/features/landing/demoData'
import { formatCurrency } from '@/lib/utils/currency'
import styles from './JourneyChapter.module.css'

export function JourneyChapter({
  id,
  eyebrow,
  title,
  subtitle,
  children,
  tone = 'default',
}: {
  id: string
  eyebrow: string
  title: string
  subtitle: string
  children: ReactNode
  tone?: 'default' | 'emphasis'
}) {
  const reduce = useReducedMotion()

  return (
    <section
      id={id}
      className={`${styles.chapter} ${tone === 'emphasis' ? styles.chapterEmphasis : ''}`.trim()}
    >
      <div className={styles.inner}>
        <motion.header
          className={styles.header}
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.subtitle}>{subtitle}</p>
        </motion.header>

        <motion.div
          className={styles.stage}
          initial={reduce ? false : { opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.06 }}
        >
          {children}
        </motion.div>
      </div>
    </section>
  )
}

/** Inquiry → accept into CRM */
export function InquiryVignette() {
  const reduce = useReducedMotion()
  return (
    <div className={styles.inquiry}>
      <motion.article
        className={styles.panel}
        animate={reduce ? undefined : { y: [0, -4, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <p className={styles.panelKicker}>Nowe zgłoszenie</p>
        <h3 className={styles.panelTitle}>Julia &amp; Tomasz</h3>
        <p className={styles.panelMeta}>Ślub · 12.09.2027 · Kraków</p>
        <dl className={styles.metaList}>
          <div>
            <dt>Pakiet</dt>
            <dd>Foto + Film</dd>
          </div>
          <div>
            <dt>Źródło</dt>
            <dd>Ankieta umowna</dd>
          </div>
        </dl>
        <div className={styles.actionRow}>
          <span className={styles.btnGhost}>Odrzuć</span>
          <span className={styles.btnPrimary}>Akceptuj</span>
        </div>
      </motion.article>
      <motion.div
        className={styles.arrow}
        initial={reduce ? false : { opacity: 0.4 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        →
      </motion.div>
      <motion.article
        className={`${styles.panel} ${styles.panelSoft}`}
        initial={reduce ? false : { opacity: 0.5, scale: 0.98 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ delay: 0.15, duration: 0.4 }}
      >
        <p className={styles.panelKicker}>W CRM</p>
        <h3 className={styles.panelTitle}>Julia &amp; Tomasz</h3>
        <p className={styles.panelMeta}>Rezerwacja · 12.09.2027</p>
        <div className={styles.pillRow}>
          <span className={styles.pill}>Workflow</span>
          <span className={styles.pillOk}>Aktywny</span>
        </div>
      </motion.article>
    </div>
  )
}

export function WeddingsVignette() {
  const list = demoWeddings.slice(0, 3)
  return (
    <div className={styles.weddingGrid}>
      {list.map((w, i) => (
        <motion.div
          key={w.id}
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ delay: i * 0.08, duration: 0.4 }}
        >
          <WeddingCard wedding={w} disabled shortNames />
        </motion.div>
      ))}
    </div>
  )
}

export function QuestionnaireVignette() {
  const answers = [
    ['Imię panny młodej', 'Anna'],
    ['Imię pana młodego', 'Michał'],
    ['Data ślubu', '22.08.2026'],
    ['Pakiet', demoWedding.packageName],
    ['Ceremonia', demoWedding.ceremonyLocation ?? '—'],
  ] as const

  return (
    <div className={styles.formPanel}>
      <div className={styles.formHead}>
        <p className={styles.panelKicker}>Ankieta publiczna</p>
        <h3 className={styles.panelTitle}>Dane do umowy</h3>
        <p className={styles.panelMeta}>Para wypełnia linkiem — bez konta</p>
      </div>
      <ul className={styles.answerList}>
        {answers.map(([q, a], i) => (
          <motion.li
            key={q}
            initial={{ opacity: 0, x: 10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 + i * 0.07 }}
          >
            <span>{q}</span>
            <strong>{a}</strong>
            <Check size={14} strokeWidth={2.25} className={styles.check} />
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

export function PackageVignette() {
  const packages = [
    { name: 'Foto', price: '6 500 zł', items: ['8 h reportażu', 'Galeria online', 'Pendrive'] },
    {
      name: 'Premium',
      price: formatCurrency(demoWedding.price),
      items: ['Foto + film', 'Highlight', 'Drone'],
      featured: true,
    },
    { name: 'Film', price: '7 200 zł', items: ['Teledysk', 'Full film', 'Same day edit'] },
  ]

  return (
    <div className={styles.pkgGrid}>
      {packages.map((p, i) => (
        <motion.article
          key={p.name}
          className={`${styles.pkgCard} ${p.featured ? styles.pkgFeatured : ''}`.trim()}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.08 }}
        >
          <p className={styles.panelKicker}>{p.featured ? 'Wybrany' : 'Pakiet'}</p>
          <h3 className={styles.panelTitle}>{p.name}</h3>
          <p className={styles.pkgPrice}>{p.price}</p>
          <ul>
            {p.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </motion.article>
      ))}
    </div>
  )
}

export function TimelineVignette() {
  const events =
    demoWedding.schedule.length > 0
      ? demoWedding.schedule.slice(0, 6)
      : [
          { id: '1', time: '12:00', title: 'Przygotowania' },
          { id: '2', time: '14:30', title: 'Ceremonia' },
          { id: '3', time: '16:00', title: 'Sesja' },
          { id: '4', time: '18:00', title: 'Wesele' },
        ]

  return (
    <div className={styles.timelinePanel}>
      <p className={styles.panelKicker}>Harmonogram dnia</p>
      <h3 className={styles.panelTitle}>
        {demoWedding.couple.partner1FirstName} &amp;{' '}
        {demoWedding.couple.partner2FirstName}
      </h3>
      <ol className={styles.timeline}>
        {events.map((ev, i) => (
          <motion.li
            key={ev.id}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06 }}
          >
            <time>{'time' in ev ? String(ev.time) : ''}</time>
            <span>{ev.title}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}

export function OpsVignette() {
  const gear = demoWedding.checklist.slice(0, 5)
  const stops = [
    { label: 'Studio', detail: 'Start' },
    { label: 'Przygotowania', detail: demoWedding.preparationLocation ?? '—' },
    { label: 'Ceremonia', detail: demoWedding.ceremonyLocation ?? '—' },
    { label: 'Przyjęcie', detail: demoWedding.receptionLocation ?? '—' },
  ]

  return (
    <div className={styles.opsGrid}>
      <div className={styles.panel}>
        <p className={styles.panelKicker}>Sprzęt</p>
        <ul className={styles.checkList}>
          {gear.map((item, i) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
            >
              <span className={item.completed ? styles.boxOn : styles.box} />
              {item.label}
            </motion.li>
          ))}
        </ul>
      </div>
      <div className={styles.panel}>
        <p className={styles.panelKicker}>Trasa</p>
        <ol className={styles.route}>
          {stops.map((s, i) => (
            <li key={s.label}>
              <b>{i + 1}</b>
              <div>
                <strong>{s.label}</strong>
                <em>{s.detail}</em>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export function PaymentsVignette() {
  const season = getDemoSeasonFinance()
  const pays = demoWedding.payments
  const maxMonthly = Math.max(...season.monthly.map((m) => m.revenue), 1)

  return (
    <div className={styles.payGrid}>
      <div className={styles.panel}>
        <p className={styles.panelKicker}>Sezon</p>
        <p className={styles.bigStat}>{formatCurrency(season.seasonRevenue)}</p>
        <p className={styles.panelMeta}>
          Przychód · wpłacono {formatCurrency(season.paidTotal)}
        </p>
        <div className={styles.bars}>
          {season.monthly.map((m) => (
            <div key={m.key} className={styles.barCol}>
              <div
                className={styles.bar}
                style={{
                  height: `${Math.max(8, (m.revenue / maxMonthly) * 100)}%`,
                }}
              />
              <span>{m.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.panel}>
        <p className={styles.panelKicker}>Ślub · płatności</p>
        <ul className={styles.payList}>
          {pays.map((p) => (
            <li key={p.id}>
              <div>
                <strong>{p.label}</strong>
                <em>{formatCurrency(p.amount)}</em>
              </div>
              <span className={p.paid ? styles.pillOk : styles.pill}>
                {p.paid ? 'Wpłacono' : 'Do zapłaty'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function TasksVignette() {
  const tasks = demoWeddingTasks.slice(0, 5)
  const deliverables = demoWedding.deliverables.slice(0, 3)

  return (
    <div className={styles.opsGrid}>
      <div className={styles.panel}>
        <p className={styles.panelKicker}>Zadania</p>
        <ul className={styles.checkList}>
          {tasks.map((t, i) => (
            <motion.li
              key={t.id}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
            >
              <span className={t.completed ? styles.boxOn : styles.box} />
              {t.title}
            </motion.li>
          ))}
        </ul>
      </div>
      <div className={styles.panel}>
        <p className={styles.panelKicker}>Oddanie</p>
        <ul className={styles.deliverList}>
          {deliverables.map((d) => (
            <li key={d.id}>
              <strong>{d.name}</strong>
              <span>{d.completed ? 'Gotowe' : 'W trakcie'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function DocumentsVignette() {
  const rows = [
    { token: '{{ bride_first_name }}', value: 'Natalia' },
    { token: '{{ groom_first_name }}', value: 'Tomasz' },
    { token: '{{ ceremony_place }}', value: 'Pałac na Wodzie' },
    { token: '{{ package }}', value: 'Foto + Film' },
  ]

  return (
    <div className={styles.docGen}>
      <div className={styles.docGenHead}>
        <div>
          <p className={styles.panelKicker}>Generowanie</p>
          <h3 className={styles.panelTitle}>Ten sam szablon · nowa para</h3>
        </div>
        <span className={styles.docGenTag}>Natalia &amp; Tomasz</span>
      </div>
      <p className={styles.docxLabel}>Umowa_GP_Natalia_Tomasz.docx</p>
      <div className={styles.fillList}>
        {rows.map((row, i) => (
          <motion.div
            key={row.token}
            className={styles.fillRow}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 + i * 0.08 }}
          >
            <code>{row.token}</code>
            <strong>{row.value}</strong>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
