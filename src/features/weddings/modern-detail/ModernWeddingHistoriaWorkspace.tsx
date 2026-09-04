import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { FloatingPortal } from '@/components/ui/FloatingPortal'
import type { ActivityFeedItem } from '@/features/weddings/detail/v2/weddingDetailV2Types'
import {
  composeModernHistoria,
  EMPTY_HISTORIA_COPY,
  HISTORIA_EYEBROW,
  HISTORIA_HEADLINE,
  routineDisclosureLabel,
  type HistoriaDay,
  type HistoriaEntry,
} from './modernWeddingHistoriaModel'
import styles from './ModernWeddingHistoriaWorkspace.module.css'

const OVERFLOW_PLACEMENT = {
  gap: 6,
  minMenuWidth: 232,
  maxMenuWidth: 240,
  align: 'end' as const,
  forceAnchored: true,
  maxMenuHeight: 360,
}

interface Props {
  feed: ActivityFeedItem[]
  onEditTasks?: () => void
  onEditNotes?: () => void
}

/**
 * Modern Historia — date-grouped editorial project memory.
 * Reuses the existing composed activity feed. Does not query timeline.
 */
export function ModernWeddingHistoriaWorkspace({
  feed,
  onEditTasks,
  onEditNotes,
}: Props) {
  const days = useMemo(() => composeModernHistoria(feed), [feed])
  const [expandedDays, setExpandedDays] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [expandedApply, setExpandedApply] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

  function toggleDay(dateKey: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(dateKey)) next.delete(dateKey)
      else next.add(dateKey)
      return next
    })
  }

  function toggleApply(id: string) {
    setExpandedApply((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div
      className={styles.page}
      data-testid="modern-wedding-historia"
    >
      <section className={styles.sheet}>
        <div className={styles.head}>
          <div>
            <p className={styles.eyebrow}>{HISTORIA_EYEBROW}</p>
            <h2 className={styles.headline}>{HISTORIA_HEADLINE}</h2>
          </div>
          <HistoriaOverflow
            onEditNotes={onEditNotes}
            onEditTasks={onEditTasks}
          />
        </div>

        {days.length === 0 ? (
          <p className={styles.empty} data-testid="historia-empty">
            {EMPTY_HISTORIA_COPY}
          </p>
        ) : (
          <div className={styles.stream}>
            {days.map((day) => (
              <HistoriaDayBlock
                key={day.dateKey || day.heading}
                day={day}
                expanded={expandedDays.has(day.dateKey)}
                expandedApply={expandedApply}
                onToggleDay={() => toggleDay(day.dateKey)}
                onToggleApply={toggleApply}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function HistoriaDayBlock({
  day,
  expanded,
  expandedApply,
  onToggleDay,
  onToggleApply,
}: {
  day: HistoriaDay
  expanded: boolean
  expandedApply: ReadonlySet<string>
  onToggleDay: () => void
  onToggleApply: (id: string) => void
}) {
  const visible = day.entries.filter((entry) => !entry.routineCollapsed)
  const collapsed = day.entries.filter((entry) => entry.routineCollapsed)
  const showCollapsed = expanded && collapsed.length > 0

  return (
    <section
      className={styles.day}
      data-testid="historia-day"
      data-date={day.dateKey}
    >
      <h3 className={styles.dayHeading}>{day.heading}</h3>
      {visible.map((entry) => (
        <HistoriaEntryRow
          key={entry.id}
          entry={entry}
          applyOpen={expandedApply.has(entry.id)}
          onToggleApply={() => onToggleApply(entry.id)}
        />
      ))}
      {collapsed.length > 0 ? (
        <button
          type="button"
          className={styles.disclosure}
          aria-expanded={expanded}
          data-testid="historia-routine-disclosure"
          onClick={onToggleDay}
        >
          {expanded
            ? 'Ukryj pozostałe aktywności'
            : routineDisclosureLabel(collapsed.length)}
        </button>
      ) : null}
      {showCollapsed
        ? collapsed.map((entry) => (
            <HistoriaEntryRow
              key={entry.id}
              entry={entry}
              applyOpen={expandedApply.has(entry.id)}
              onToggleApply={() => onToggleApply(entry.id)}
            />
          ))
        : null}
    </section>
  )
}

function HistoriaEntryRow({
  entry,
  applyOpen,
  onToggleApply,
}: {
  entry: HistoriaEntry
  applyOpen: boolean
  onToggleApply: () => void
}) {
  return (
    <article
      className={styles.entry}
      data-importance={entry.importance}
      data-kind={entry.kind}
      data-testid={entry.kind === 'note' ? 'historia-note' : 'historia-event'}
    >
      {entry.kind === 'note' && entry.authorEyebrow ? (
        <p className={styles.author}>{entry.authorEyebrow}</p>
      ) : null}
      {entry.title ? <p className={styles.title}>{entry.title}</p> : null}
      {entry.body ? <p className={styles.body}>{entry.body}</p> : null}
      {entry.applyDisclosure ? (
        <>
          <p className={styles.body}>{entry.applyDisclosure.summary}</p>
          <button
            type="button"
            className={styles.disclosure}
            aria-expanded={applyOpen}
            data-testid="historia-apply-disclosure"
            onClick={onToggleApply}
          >
            {applyOpen ? 'Ukryj szczegóły' : 'Pokaż szczegóły'}
          </button>
          {applyOpen ? (
            <p className={styles.applyDetail}>
              {entry.applyDisclosure.fullDescription}
            </p>
          ) : null}
        </>
      ) : null}
    </article>
  )
}

function HistoriaOverflow({
  onEditNotes,
  onEditTasks,
}: {
  onEditNotes?: () => void
  onEditTasks?: () => void
}) {
  const menuId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const hasActions = Boolean(onEditNotes || onEditTasks)

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Escape') return
      setMenuOpen(false)
      btnRef.current?.focus()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
    first?.focus()
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  function onMenuKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') setMenuOpen(false)
  }

  if (!hasActions) return null

  return (
    <div className={styles.overflowWrap} ref={wrapRef}>
      <button
        type="button"
        ref={btnRef}
        className={styles.overflowBtn}
        aria-label="Więcej działań historii"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        data-testid="historia-overflow-btn"
        onKeyDown={onMenuKey}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
      </button>
      <FloatingPortal
        open={menuOpen}
        anchorRef={btnRef}
        options={OVERFLOW_PLACEMENT}
      >
        {() => (
          <div
            ref={menuRef}
            id={menuId}
            className={styles.menu}
            role="menu"
            data-testid="historia-overflow-menu"
          >
            {onEditNotes ? (
              <button
                type="button"
                role="menuitem"
                data-testid="historia-edit-notes"
                onClick={() => {
                  setMenuOpen(false)
                  onEditNotes()
                }}
              >
                Edytuj notatki
              </button>
            ) : null}
            {onEditTasks ? (
              <button
                type="button"
                role="menuitem"
                data-testid="historia-edit-tasks"
                onClick={() => {
                  setMenuOpen(false)
                  onEditTasks()
                }}
              >
                Edytuj zadania
              </button>
            ) : null}
          </div>
        )}
      </FloatingPortal>
    </div>
  )
}
