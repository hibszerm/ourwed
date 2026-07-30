import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { IconChevronDown } from '@/components/icons'
import {
  getDefaultExpandedSeasons,
  groupAssignmentsBySeason,
  type SeasonGroup,
} from '@/features/shared/presentation/groupAssignmentsBySeason'
import {
  expandSeasonKeepingOthers,
  prefersReducedMotion,
  resolveSeasonChipSelection,
  toggleSeasonExpanded,
} from '@/features/shared/presentation/seasonNavigation'
import styles from './SeasonGroupedList.module.css'

export type SeasonGroupedListProps<T> = {
  items: readonly T[]
  getDate: (item: T) => string | null | undefined
  getSearchText: (item: T) => string
  formatCount: (count: number) => string
  searchPlaceholder: string
  renderItems: (items: T[]) => ReactNode
  filterItem?: (item: T) => boolean
  referenceYear?: number
  emptySearchTitle?: string
  emptySearchDescription?: string
}

type ManualExpansion = {
  signature: string
  seasons: Set<number>
}

function seasonSignature(groups: readonly SeasonGroup<unknown>[]): string {
  return groups.map((g) => g.season).join('|')
}

function findScrollRoot(node: HTMLElement | null): Element | null {
  let el: HTMLElement | null = node
  while (el) {
    const { overflowY } = getComputedStyle(el)
    if (
      overflowY === 'auto' ||
      overflowY === 'scroll' ||
      overflowY === 'overlay'
    ) {
      return el
    }
    el = el.parentElement
  }
  return null
}

export function SeasonGroupedList<T>({
  items,
  getDate,
  getSearchText,
  formatCount,
  searchPlaceholder,
  renderItems,
  filterItem,
  referenceYear: referenceYearProp,
  emptySearchTitle = 'Brak wyników',
  emptySearchDescription = 'Spróbuj innej frazy wyszukiwania.',
}: SeasonGroupedListProps<T>) {
  const referenceYear = referenceYearProp ?? new Date().getFullYear()
  const searchId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef(new Map<number, HTMLElement>())
  const chipRefs = useRef(new Map<string, HTMLButtonElement>())
  const preSearchManual = useRef<ManualExpansion | null>(null)

  const [query, setQuery] = useState('')
  const [manual, setManual] = useState<ManualExpansion | null>(null)
  const [activeYear, setActiveYear] = useState<number | null>(null)
  const [stickyStuck, setStickyStuck] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (filterItem && !filterItem(item)) return false
      if (!q) return true
      return getSearchText(item).toLowerCase().includes(q)
    })
  }, [items, query, filterItem, getSearchText])

  const groups = useMemo(
    () => groupAssignmentsBySeason(filtered, getDate, { referenceYear }),
    [filtered, getDate, referenceYear],
  )

  const seasons = useMemo(() => groups.map((g) => g.season), [groups])
  const signature = seasonSignature(groups)
  const searching = query.trim().length > 0

  const defaultExpanded = useMemo(
    () => getDefaultExpandedSeasons(groups, referenceYear),
    [groups, referenceYear],
  )

  const expanded = useMemo(() => {
    if (searching) return new Set(seasons)
    if (manual && manual.signature === signature) return manual.seasons
    return defaultExpanded
  }, [searching, seasons, manual, signature, defaultExpanded])

  const { allSelected, currentYear } = resolveSeasonChipSelection({
    seasons,
    expanded,
    activeYear: activeYear ?? seasons[0] ?? null,
  })

  const showChipsRow = groups.length > 1

  function commitExpansion(next: Set<number>) {
    setManual({ signature, seasons: next })
  }

  function toggleSeason(season: number) {
    commitExpansion(toggleSeasonExpanded(expanded, season))
  }

  function scrollToSeason(season: number) {
    const node = sectionRefs.current.get(season)
    if (!node) return
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth'
    node.scrollIntoView({ behavior, block: 'start' })
  }

  function expandAll() {
    commitExpansion(new Set(seasons))
    if (seasons[0] != null) {
      setActiveYear(seasons[0])
      requestAnimationFrame(() => scrollToSeason(seasons[0]!))
    }
  }

  function focusSeason(season: number) {
    commitExpansion(expandSeasonKeepingOthers(expanded, season))
    setActiveYear(season)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToSeason(season))
    })
  }

  function handleQueryChange(value: string) {
    const wasSearching = query.trim().length > 0
    const willSearch = value.trim().length > 0

    if (!wasSearching && willSearch) {
      preSearchManual.current =
        manual && manual.signature === signature
          ? { signature, seasons: new Set(manual.seasons) }
          : { signature, seasons: new Set(expanded) }
    }

    setQuery(value)

    if (wasSearching && !willSearch) {
      const restored = preSearchManual.current
      preSearchManual.current = null
      if (restored && restored.signature === signature) {
        setManual(restored)
      } else {
        setManual(null)
      }
    }
  }

  useEffect(() => {
    const sticky = stickyRef.current
    if (!sticky || !showChipsRow) return

    const sentinel = sticky.previousElementSibling
    if (!(sentinel instanceof HTMLElement)) return

    const root = findScrollRoot(sticky)
    const observer = new IntersectionObserver(
      ([entry]) => {
        const stuck = Boolean(entry && !entry.isIntersecting)
        setStickyStuck((prev) => (prev === stuck ? prev : stuck))
      },
      { root, threshold: 1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [showChipsRow, signature])

  useEffect(() => {
    if (groups.length === 0) return

    const root = findScrollRoot(rootRef.current)
    const stickyHeight = stickyRef.current?.offsetHeight ?? 48
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .map((e) => ({
            season: Number((e.target as HTMLElement).dataset.season),
            top: e.boundingClientRect.top,
          }))
          .filter((v) => Number.isFinite(v.season))
          .sort((a, b) => a.top - b.top)

        const next = visible[0]?.season
        if (next == null) return
        setActiveYear((prev) => (prev === next ? prev : next))
      },
      {
        root,
        rootMargin: `-${stickyHeight + 8}px 0px -55% 0px`,
        threshold: [0, 0.15, 0.4],
      },
    )

    for (const season of seasons) {
      const el = sectionRefs.current.get(season)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [groups, seasons, signature, showChipsRow])

  useEffect(() => {
    if (!showChipsRow) return
    const key = allSelected
      ? 'all'
      : currentYear != null
        ? String(currentYear)
        : null
    if (!key) return
    const btn = chipRefs.current.get(key)
    btn?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      inline: 'nearest',
      block: 'nearest',
    })
  }, [allSelected, currentYear, showChipsRow])

  if (items.length === 0) {
    return null
  }

  return (
    <div
      className={styles.root}
      data-testid="season-grouped-list"
      ref={rootRef}
    >
      <div className={styles.toolbar}>
        <label className={styles.searchLabel} htmlFor={searchId}>
          <span className={styles.srOnly}>Szukaj</span>
          <input
            id={searchId}
            type="search"
            className={styles.search}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            autoComplete="off"
          />
        </label>
      </div>

      {showChipsRow ? (
        <>
          <div className={styles.stickySentinel} aria-hidden />
          <div
            ref={stickyRef}
            className={styles.stickyNav}
            data-stuck={stickyStuck ? 'true' : 'false'}
            data-testid="season-sticky-nav"
          >
            <div
              className={styles.chips}
              role="toolbar"
              aria-label="Sezony"
              data-testid="season-chips"
            >
              <Chip
                label="Wszystkie"
                pressed={allSelected}
                current={false}
                buttonRef={(el) => {
                  if (el) chipRefs.current.set('all', el)
                  else chipRefs.current.delete('all')
                }}
                onClick={expandAll}
              />
              {groups.map((g) => (
                <Chip
                  key={g.season}
                  label={String(g.season)}
                  pressed={false}
                  current={currentYear === g.season}
                  buttonRef={(el) => {
                    const key = String(g.season)
                    if (el) chipRefs.current.set(key, el)
                    else chipRefs.current.delete(key)
                  }}
                  onClick={() => focusSeason(g.season)}
                />
              ))}
            </div>
          </div>
        </>
      ) : null}

      {groups.length === 0 ? (
        <div className={styles.emptySearch} role="status">
          <p className={styles.emptyTitle}>{emptySearchTitle}</p>
          <p className={styles.emptyDesc}>{emptySearchDescription}</p>
        </div>
      ) : (
        <div className={styles.seasons}>
          {groups.map((group) => (
            <SeasonSection
              key={group.season}
              group={group}
              expanded={expanded.has(group.season)}
              formatCount={formatCount}
              renderItems={renderItems}
              onToggle={() => toggleSeason(group.season)}
              sectionRef={(el) => {
                if (el) sectionRefs.current.set(group.season, el)
                else sectionRefs.current.delete(group.season)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({
  label,
  pressed,
  current,
  onClick,
  buttonRef,
}: {
  label: string
  pressed: boolean
  current: boolean
  onClick: () => void
  buttonRef?: (el: HTMLButtonElement | null) => void
}) {
  const active = pressed || current
  return (
    <button
      type="button"
      ref={buttonRef}
      className={active ? styles.chipActive : styles.chip}
      aria-pressed={pressed ? true : false}
      aria-current={current ? 'true' : undefined}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function SeasonSection<T>({
  group,
  expanded,
  formatCount,
  renderItems,
  onToggle,
  sectionRef,
}: {
  group: SeasonGroup<T>
  expanded: boolean
  formatCount: (count: number) => string
  renderItems: (items: T[]) => ReactNode
  onToggle: () => void
  sectionRef: (el: HTMLElement | null) => void
}) {
  const panelId = `season-panel-${group.season}`
  const headerId = `season-header-${group.season}`

  return (
    <section
      className={styles.season}
      ref={sectionRef}
      data-season={group.season}
      data-expanded={expanded ? 'true' : 'false'}
    >
      <h2 className={styles.seasonHeading}>
        <button
          type="button"
          id={headerId}
          className={styles.seasonHeader}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className={styles.seasonMeta}>
            <span className={styles.seasonYear}>{group.season}</span>
            <span className={styles.seasonCount}>
              {formatCount(group.items.length)}
            </span>
          </span>
          <span
            className={styles.seasonIcon}
            data-expanded={expanded ? 'true' : 'false'}
            aria-hidden
          >
            <IconChevronDown width={18} height={18} />
          </span>
        </button>
      </h2>

      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        className={styles.panel}
        data-open={expanded ? 'true' : 'false'}
        aria-hidden={!expanded}
      >
        <div className={styles.panelInner}>
          {expanded ? renderItems(group.items) : null}
        </div>
      </div>
    </section>
  )
}
