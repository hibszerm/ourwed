import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Search } from 'lucide-react'
import { IconChevronDown } from '@/components/icons'
import { ModernWeddingCard } from '@/features/weddings/modern/ModernWeddingCard'
import { ModernWeddingLedger } from '@/features/weddings/modern/ModernWeddingLedger'
import { ModernWeddingsViewSwitch } from '@/features/weddings/modern/ModernWeddingsViewSwitch'
import {
  filterWorkspaceWeddingRows,
  filterWorkspaceWeddingRowsForList,
  getPrimaryWorkspaceYears,
  getWorkspaceWeddingDate,
  resolveWorkspaceSelectedYear,
  type WorkspaceScopeFilter,
  type WorkspaceWeddingDisplayItem,
} from '@/features/weddings/modern/workspaceWeddings'
import {
  isArchivedOrCancelled,
  splitModernWeddingsSeasons,
} from '@/features/weddings/modern/modernWeddingsModel'
import {
  groupAssignmentsBySeason,
  formatWeddingSeasonCount,
} from '@/features/shared/presentation/groupAssignmentsBySeason'
import { prefersReducedMotion } from '@/features/shared/presentation/seasonNavigation'
import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'
import type { WeddingsViewMode } from '@/features/weddings/presentation/weddingsViewMode'
import styles from './ModernWeddingsWorkspace.module.css'

interface ModernWeddingsWorkspaceProps {
  weddings: WorkspaceWeddingDisplayItem[]
  scope: WorkspaceScopeFilter
  onScopeChange: (scope: WorkspaceScopeFilter) => void
  viewMode: WeddingsViewMode
  onViewChange: (mode: WeddingsViewMode) => void
  entrance?: 'full' | 'soft'
}

function CardCollection({ weddings }: { weddings: WorkspaceWeddingDisplayItem[] }) {
  if (weddings.length === 0) return null
  return (
    <div className={styles.grid} data-testid="modern-weddings-grid">
      {weddings.map((wedding) => (
        <ModernWeddingCard key={wedding.id} wedding={wedding} />
      ))}
    </div>
  )
}

function SeasonCollection({
  weddings,
  viewMode,
}: {
  weddings: WorkspaceWeddingDisplayItem[]
  viewMode: WeddingsViewMode
}) {
  const [shown, setShown] = useState(viewMode)
  const [animateView, setAnimateView] = useState(false)
  if (viewMode !== shown) {
    setShown(viewMode)
    setAnimateView(true)
  }

  if (weddings.length === 0) return null

  const body =
    viewMode === 'list' ? (
      <ModernWeddingLedger weddings={weddings} />
    ) : (
      <CardCollection weddings={weddings} />
    )

  return (
    <div key={viewMode} className={animateView ? styles.viewIn : undefined}>
      {body}
    </div>
  )
}

export function ModernWeddingsWorkspace({
  weddings,
  scope,
  onScopeChange,
  viewMode,
  onViewChange,
  entrance = 'full',
}: ModernWeddingsWorkspaceProps) {
  const todayKey = localCalendarDateKey()
  const referenceYear = Number(todayKey.slice(0, 4))
  const searchId = `modern-weddings-search`
  const sectionRefs = useRef(new Map<number, HTMLElement>())

  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [expandedYears, setExpandedYears] = useState<Set<number> | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [historyYearsExpanded, setHistoryYearsExpanded] = useState<Set<number> | null>(null)
  const [previousOpen, setPreviousOpen] = useState(true)
  const [pendingScroll, setPendingScroll] = useState<number | null>(null)

  const scopedWeddings = useMemo(
    () => filterWorkspaceWeddingRows(weddings, scope),
    [weddings, scope],
  )
  const allCatalog = useMemo(
    () => weddings.filter((item) => {
      if (showArchived || item.ownershipKind === 'shared') return true
      return !isArchivedOrCancelled(item.wedding)
    }),
    [weddings, showArchived],
  )

  const hiddenArchivedCount = useMemo(
    () => scopedWeddings.filter((item) =>
      item.ownershipKind === 'owned' && isArchivedOrCancelled(item.wedding),
    ).length,
    [scopedWeddings],
  )

  const catalog = useMemo(() => {
    return scopedWeddings.filter((item) => {
      if (
        !showArchived
        && item.ownershipKind === 'owned'
        && isArchivedOrCancelled(item.wedding)
      ) return false
      return true
    })
  }, [scopedWeddings, showArchived])

  // Year choices and validity are global to the safe canonical catalog so an
  // ownership filter can legitimately produce an empty result for a year.
  const activeSelectedYear = resolveWorkspaceSelectedYear(selectedYear, allCatalog)
  const invalidSelectedYear = selectedYear != null && activeSelectedYear == null

  const catalogGroups = useMemo(() => {
    return groupAssignmentsBySeason(allCatalog, getWorkspaceWeddingDate, {
      referenceYear,
    })
  }, [allCatalog, referenceYear])

  const allSeasonYears = useMemo(
    () => catalogGroups.map((group) => group.season),
    [catalogGroups],
  )
  const chipYears = useMemo(
    () => getPrimaryWorkspaceYears(allSeasonYears, referenceYear),
    [allSeasonYears, referenceYear],
  )

  const searching = query.trim().length > 0

  const visible = useMemo(
    () => filterWorkspaceWeddingRowsForList(catalog, {
      scope: 'all',
      year: activeSelectedYear,
      query: searching ? query : '',
    }),
    [catalog, activeSelectedYear, searching, query],
  )

  const layers = useMemo(() => {
    const groups = groupAssignmentsBySeason(visible, getWorkspaceWeddingDate, {
      referenceYear,
    })
    return splitModernWeddingsSeasons(groups, referenceYear)
  }, [visible, referenceYear])

  const storedExpandedYears = useMemo(
    () => invalidSelectedYear ? new Set(chipYears) : expandedYears ?? new Set(chipYears),
    [invalidSelectedYear, chipYears, expandedYears],
  )

  useEffect(() => {
    if (!invalidSelectedYear) return
    // Filtering already uses the synchronous derived value above. Clear the
    // stale selection so it cannot reappear if this year returns later.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedYear(null)
    setExpandedYears(new Set(chipYears))
  }, [invalidSelectedYear, chipYears])

  const displayedYears = useMemo(
    () => activeSelectedYear == null ? storedExpandedYears : new Set([activeSelectedYear]),
    [activeSelectedYear, storedExpandedYears],
  )

  const historyOpen = activeSelectedYear != null
    ? layers.previous.some((group) => group.season === activeSelectedYear)
    : previousOpen

  const displayedHistoryYears = useMemo(() => {
    if (activeSelectedYear != null) return new Set([activeSelectedYear])
    return historyYearsExpanded ?? new Set(allSeasonYears.filter((year) => year < referenceYear))
  }, [activeSelectedYear, historyYearsExpanded, allSeasonYears, referenceYear])

  function scrollToSeason(season: number) {
    const node = sectionRefs.current.get(season)
    if (!node) return
    node.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  useLayoutEffect(() => {
    if (pendingScroll == null) return
    const node = sectionRefs.current.get(pendingScroll)
    if (!node) return
    scrollToSeason(pendingScroll)
    setPendingScroll(null)
  }, [pendingScroll, displayedYears])

  function selectYear(season: number) {
    setSelectedYear(season)
    setExpandedYears(new Set([season]))
    setPendingScroll(season)
  }

  function showAllCurrentFuture() {
    setSelectedYear(null)
    setExpandedYears(new Set(chipYears))
    setPreviousOpen(true)
  }

  function toggleYear(season: number) {
    setExpandedYears((current) => {
      const next = new Set(current ?? chipYears)
      if (next.has(season)) next.delete(season)
      else next.add(season)
      return next
    })
  }

  const onlyArchivedHidden =
    !searching &&
    visible.length === 0 &&
    hiddenArchivedCount > 0 &&
    scopedWeddings.length > 0

  const undated = visible.filter(
    (item) => !getWorkspaceWeddingDate(item),
  )

  const scopeEmpty = catalog.length === 0 && !searching
  const filteredEmpty = (catalog.length > 0 && visible.length === 0)
    || (activeSelectedYear != null && catalog.length === 0)

  return (
    <div
      className={styles.root}
      data-testid="modern-weddings-workspace"
      data-entrance={entrance}
    >
      <section className={styles.surface} data-testid="weddings-list-surface">
      <div className={styles.controls} data-testid="weddings-primary-toolbar">
        <label className={styles.searchLabel} htmlFor={searchId}>
          <span className={styles.srOnly}>Szukaj</span>
          <Search className={styles.searchIcon} size={16} strokeWidth={1.8} aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            className={styles.search}
            placeholder="Szukaj pary, miejsca lub pakietu…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            aria-label="Szukaj pary, miejsca lub pakietu"
          />
        </label>
        <div className={styles.scopeFilter} role="group" aria-label="Zakres ślubów" data-testid="weddings-ownership-filter">
          {([
            ['all', 'Wszystkie'],
            ['mine', 'Moje'],
            ['shared', 'Udostępnione'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={scope === value ? styles.scopeActive : styles.scopeOption}
              aria-pressed={scope === value}
              onClick={() => onScopeChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.desktopViewSwitch}>
          <ModernWeddingsViewSwitch value={viewMode} onChange={onViewChange} />
        </div>
      </div>

        <div className={styles.secondaryToolbar} data-testid="weddings-year-filter">
          <div className={styles.chips} role="group" aria-label="Filtruj według roku">
            <button
              type="button"
              className={activeSelectedYear == null ? styles.yearActive : styles.yearChip}
              aria-pressed={activeSelectedYear == null}
              onClick={showAllCurrentFuture}
            >
              Wszystkie lata
            </button>
            {chipYears.map((year) => (
              <button
                key={year}
                type="button"
                className={activeSelectedYear === year ? styles.yearActive : styles.yearChip}
                aria-pressed={activeSelectedYear === year}
                onClick={() => selectYear(year)}
              >
                {year}
              </button>
            ))}
          </div>
          <div className={styles.mobileViewSwitch}>
            <ModernWeddingsViewSwitch value={viewMode} onChange={onViewChange} />
          </div>
        </div>

      <div className={styles.listBody} data-testid="weddings-list-body">

      {hiddenArchivedCount > 0 && !onlyArchivedHidden ? (
        <div className={styles.archiveRow}>
          <button
            type="button"
            className={styles.archiveButton}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? 'Ukryj zarchiwizowane' : 'Pokaż zarchiwizowane'}
          </button>
        </div>
      ) : null}

      {searching && visible.length === 0 ? (
        <div className={styles.empty} role="status">
          <p className={styles.emptyTitle}>Brak wyników</p>
          <p className={styles.emptyDesc}>Spróbuj innej frazy wyszukiwania.</p>
        </div>
      ) : filteredEmpty ? (
        <div className={styles.empty} role="status">
          <p className={styles.emptyTitle}>
            {activeSelectedYear != null && scope === 'shared'
              ? `Brak udostępnionych ślubów w ${activeSelectedYear} roku`
              : 'Brak ślubów dla wybranych filtrów'}
          </p>
          <p className={styles.emptyDesc}>Zmień rok lub zakres, aby zobaczyć inne śluby.</p>
        </div>
      ) : onlyArchivedHidden ? (
        <div className={styles.empty} role="status">
          <p className={styles.emptyTitle}>Zarchiwizowane śluby są ukryte</p>
          <p className={styles.emptyDesc}>
            W tym widoku pokazujemy aktywne rezerwacje.
          </p>
          <button
            type="button"
            className={styles.reveal}
            onClick={() => setShowArchived(true)}
          >
            Pokaż zarchiwizowane
          </button>
        </div>
      ) : scopeEmpty ? (
        <div className={styles.empty} role="status">
          <p className={styles.emptyTitle}>
            {scope === 'mine' ? 'Brak własnych ślubów' : 'Brak udostępnionych ślubów'}
          </p>
          <p className={styles.emptyDesc}>
            {scope === 'mine'
              ? 'Możesz przełączyć zakres na Udostępnione, aby zobaczyć dostępne wspólne zlecenia.'
              : 'Udostępnione zlecenia pojawią się tutaj po przyjęciu zaproszenia.'}
          </p>
        </div>
      ) : (
        <div className={styles.seasons}>
          {layers.active ? (
            <SeasonBlock
              season={layers.active.season}
              count={layers.active.items.length}
              expanded={displayedYears.has(layers.active.season)}
              tone="primary"
              onToggle={() => toggleYear(layers.active!.season)}
              sectionRef={(el) => {
                if (el) sectionRefs.current.set(layers.active!.season, el)
                else sectionRefs.current.delete(layers.active!.season)
              }}
            >
              <SeasonCollection
                weddings={layers.active.items}
                viewMode={viewMode}
              />
            </SeasonBlock>
          ) : null}

          {layers.future.map((group) => (
            <SeasonBlock
              key={`future-${group.season}`}
              season={group.season}
              count={group.items.length}
              expanded={displayedYears.has(group.season)}
              tone="primary"
              onToggle={() => toggleYear(group.season)}
              sectionRef={(el) => {
                if (el) sectionRefs.current.set(group.season, el)
                else sectionRefs.current.delete(group.season)
              }}
            >
              <SeasonCollection weddings={group.items} viewMode={viewMode} />
            </SeasonBlock>
          ))}

          {layers.previous.length > 0 ? (
            <PreviousSeasons
              groups={layers.previous}
              viewMode={viewMode}
              open={historyOpen}
              searching={searching}
              expanded={displayedHistoryYears}
              onToggleOpen={() => setPreviousOpen((v) => !v)}
              onToggleYear={(season) =>
                setHistoryYearsExpanded((prev) => {
                  const next = new Set(prev ?? allSeasonYears.filter((year) => year < referenceYear))
                  if (next.has(season)) next.delete(season)
                  else next.add(season)
                  return next
                })
              }
              sectionRef={(season, el) => {
                if (el) sectionRefs.current.set(season, el)
                else sectionRefs.current.delete(season)
              }}
            />
          ) : null}
          {undated.length > 0 ? (
            <section className={styles.undated} data-testid="modern-weddings-undated">
              <h2 className={styles.undatedHeading}>Termin do ustalenia</h2>
              <SeasonCollection weddings={undated} viewMode={viewMode} />
            </section>
          ) : null}
        </div>
      )}
      </div>
      </section>
    </div>
  )
}

function PreviousSeasons({
  groups,
  viewMode,
  open,
  searching,
  expanded,
  onToggleOpen,
  onToggleYear,
  sectionRef,
}: {
  groups: { season: number; items: WorkspaceWeddingDisplayItem[] }[]
  viewMode: WeddingsViewMode
  open: boolean
  searching: boolean
  expanded: Set<number>
  onToggleOpen: () => void
  onToggleYear: (season: number) => void
  sectionRef: (season: number, el: HTMLElement | null) => void
}) {
  return (
    <section
      className={styles.previous}
      data-testid="modern-weddings-previous-seasons"
    >
      <h2 className={styles.previousHeading}>
        <button
          type="button"
          className={styles.previousHeader}
          aria-expanded={open}
          aria-controls="modern-previous-seasons-panel"
          onClick={() => {
            if (searching) return
            onToggleOpen()
          }}
        >
          <span>Poprzednie sezony</span>
          <span
            className={styles.seasonIcon}
            data-expanded={open ? 'true' : 'false'}
            aria-hidden
          >
            <IconChevronDown width={18} height={18} />
          </span>
        </button>
      </h2>
      <div
        id="modern-previous-seasons-panel"
        className={styles.accordion}
        data-open={open ? 'true' : 'false'}
        aria-hidden={!open}
        inert={open ? undefined : true}
      >
        <div className={styles.accordionInner}>
          {groups.map((group) => (
            <SeasonBlock
              key={`previous-${group.season}`}
              season={group.season}
              count={group.items.length}
              expanded={expanded.has(group.season)}
              tone="history"
              onToggle={() => onToggleYear(group.season)}
              sectionRef={(el) => sectionRef(group.season, el)}
            >
              <SeasonCollection
                weddings={group.items}
                viewMode={viewMode}
              />
            </SeasonBlock>
          ))}
        </div>
      </div>
    </section>
  )
}

function SeasonBlock({
  season,
  count,
  expanded,
  tone,
  onToggle,
  sectionRef,
  children,
}: {
  season: number
  count: number
  expanded: boolean
  tone: 'primary' | 'history'
  onToggle: () => void
  sectionRef: (el: HTMLElement | null) => void
  children: ReactNode
}) {
  const panelId = `modern-season-panel-${tone}-${season}`
  const headerId = `modern-season-header-${tone}-${season}`
  const history = tone === 'history'

  return (
    <section
      className={history ? styles.historySeason : styles.season}
      ref={sectionRef}
      data-season={season}
      data-expanded={expanded ? 'true' : 'false'}
    >
      <h2 className={history ? styles.historyHeading : styles.seasonHeading}>
        <button
          type="button"
          id={headerId}
          className={history ? styles.historyHeader : styles.seasonHeader}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
        >
          {history ? (
            <>
              <span className={styles.historyYear}>{season}</span>
              <span className={styles.historyTrail}>
                <span className={styles.historyCount}>
                  {formatWeddingSeasonCount(count)}
                </span>
                <span
                  className={styles.seasonIcon}
                  data-expanded={expanded ? 'true' : 'false'}
                  aria-hidden
                >
                  <IconChevronDown width={16} height={16} />
                </span>
              </span>
            </>
          ) : (
            <>
              <span className={styles.seasonMeta}>
                <span className={styles.seasonYear}>{season}</span>
                <span className={styles.seasonCount}>
                  {formatWeddingSeasonCount(count)}
                </span>
              </span>
              <span
                className={styles.seasonIcon}
                data-expanded={expanded ? 'true' : 'false'}
                aria-hidden
              >
                <IconChevronDown width={18} height={18} />
              </span>
            </>
          )}
        </button>
      </h2>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        className={styles.accordion}
        data-open={expanded ? 'true' : 'false'}
        aria-hidden={!expanded}
        inert={expanded ? undefined : true}
      >
        <div className={styles.accordionInner}>
          <div className={styles.seasonPanel}>{children}</div>
        </div>
      </div>
    </section>
  )
}
