import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { IconChevronDown } from '@/components/icons'
import { ModernWeddingCard } from '@/features/weddings/modern/ModernWeddingCard'
import { ModernWeddingLedger } from '@/features/weddings/modern/ModernWeddingLedger'
import { ModernWeddingsViewSwitch } from '@/features/weddings/modern/ModernWeddingsViewSwitch'
import {
  filterWorkspaceWeddingRows,
  getWorkspaceWeddingDate,
  matchesWorkspaceWeddingYear,
  matchesWorkspaceWeddingSearch,
  resolveWorkspaceSearchYear,
  type WorkspaceScopeFilter,
  type WorkspaceWeddingDisplayItem,
} from '@/features/weddings/modern/workspaceWeddings'
import {
  defaultExpandedCurrentFutureYears,
  expandAllCurrentFutureYears,
  isArchivedOrCancelled,
  listCurrentAndFutureYears,
  resolveCurrentFutureChipSelection,
  selectExclusiveCurrentFutureYear,
  splitModernWeddingsSeasons,
  toggleCurrentFutureYearExpanded,
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
      <div className={`${styles.ledgerSurface} v3MaterialSatinFlat`}>
        <ModernWeddingLedger weddings={weddings} />
      </div>
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
  const [currentFutureExpanded, setCurrentFutureExpanded] =
    useState<Set<number> | null>(null)
  const [searchYear, setSearchYear] = useState<number | null>(null)
  const [historyYearsExpanded, setHistoryYearsExpanded] = useState(
    () => new Set<number>(),
  )
  const [previousOpen, setPreviousOpen] = useState(false)
  const [pendingScroll, setPendingScroll] = useState<number | null>(null)

  const scopedWeddings = useMemo(
    () => filterWorkspaceWeddingRows(weddings, scope),
    [weddings, scope],
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

  // Derive the usable year synchronously from the complete scoped catalog so
  // a scope transition can never render with an invisible active year. The
  // effect commits that invalidation so a later scope cannot restore it.
  const activeSearchYear = resolveWorkspaceSearchYear(searchYear, catalog)
  const invalidSearchYear = searchYear != null && activeSearchYear == null

  const catalogLayers = useMemo(() => {
    const groups = groupAssignmentsBySeason(catalog, getWorkspaceWeddingDate, {
      referenceYear,
    })
    return splitModernWeddingsSeasons(groups, referenceYear)
  }, [catalog, referenceYear])

  const chipYears = useMemo(
    () => listCurrentAndFutureYears(catalogLayers),
    [catalogLayers],
  )

  const searching = query.trim().length > 0
  const explicitSearchYear = searching ? activeSearchYear : null

  const visible = useMemo(() => {
    if (!searching && explicitSearchYear == null) return catalog
    return catalog.filter((item) => {
      if (searching && !matchesWorkspaceWeddingSearch(item, query)) return false
      if (explicitSearchYear != null && !matchesWorkspaceWeddingYear(item, explicitSearchYear)) return false
      return true
    })
  }, [catalog, searching, explicitSearchYear, query])

  const layers = useMemo(() => {
    if (!searching) return catalogLayers
    const groups = groupAssignmentsBySeason(visible, getWorkspaceWeddingDate, {
      referenceYear,
    })
    return splitModernWeddingsSeasons(groups, referenceYear)
  }, [searching, catalogLayers, visible, referenceYear])

  const defaultCurrentFuture = useMemo(
    () => defaultExpandedCurrentFutureYears(chipYears, referenceYear),
    [chipYears, referenceYear],
  )

  const storedCurrentFuture = invalidSearchYear
    ? expandAllCurrentFutureYears(chipYears)
    : currentFutureExpanded ?? defaultCurrentFuture

  useEffect(() => {
    if (!invalidSearchYear) return
    // Filtering and chip state already use the synchronous derived value above;
    // this idempotent transition prevents the cleared selection resurfacing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchYear(null)
    setCurrentFutureExpanded(expandAllCurrentFutureYears(chipYears))
  }, [invalidSearchYear, chipYears])

  const displayedCurrentFuture = useMemo(() => {
    if (!searching) return storedCurrentFuture
    return new Set(listCurrentAndFutureYears(layers))
  }, [searching, storedCurrentFuture, layers])

  const historyOpen = searching
    ? layers.previous.length > 0
    : previousOpen

  const displayedHistoryYears = useMemo(() => {
    if (!searching) return historyYearsExpanded
    return new Set(layers.previous.map((group) => group.season))
  }, [searching, historyYearsExpanded, layers.previous])

  const currentFutureChipSelection = resolveCurrentFutureChipSelection(
    chipYears,
    storedCurrentFuture,
  )
  const allSelected = searching
    ? activeSearchYear == null
    : currentFutureChipSelection.allSelected
  const selectedYear = searching
    ? activeSearchYear
    : currentFutureChipSelection.selectedYear

  const showChips = chipYears.length > 1 || searching

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
  }, [pendingScroll, displayedCurrentFuture])

  function selectYear(season: number) {
    setSearchYear(season)
    setCurrentFutureExpanded(selectExclusiveCurrentFutureYear(season))
    setPendingScroll(season)
  }

  function showAllCurrentFuture() {
    setSearchYear(null)
    setCurrentFutureExpanded(expandAllCurrentFutureYears(chipYears))
  }

  function toggleCurrentFuture(season: number) {
    setCurrentFutureExpanded(
      toggleCurrentFutureYearExpanded(storedCurrentFuture, season),
    )
  }

  const onlyArchivedHidden =
    !searching &&
    visible.length === 0 &&
    hiddenArchivedCount > 0 &&
    scopedWeddings.length > 0

  const undated = (searching ? visible : catalog).filter(
    (item) => !getWorkspaceWeddingDate(item),
  )

  const scopeEmpty = catalog.length === 0 && !searching

  return (
    <div
      className={styles.root}
      data-testid="modern-weddings-workspace"
      data-entrance={entrance}
    >
      <div className={styles.controls}>
        <label className={styles.searchLabel} htmlFor={searchId}>
          <span className={styles.srOnly}>Szukaj</span>
          <input
            id={searchId}
            type="search"
            className={styles.search}
            placeholder="Szukaj pary, miejsca lub pakietu…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className={styles.scopeFilter} role="group" aria-label="Zakres ślubów">
          {([
            ['all', 'Wszystkie'],
            ['mine', 'Moje'],
            ['shared', 'Współdzielone'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={scope === value ? styles.chipActive : styles.chip}
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

      {showChips ? (
        <div className={styles.stickyNav}>
          <div className={styles.chips} role="toolbar" aria-label="Sezony">
            {showChips ? (
              <>
                <button
                  type="button"
                  className={allSelected ? styles.chipActive : styles.chip}
                  aria-pressed={allSelected}
                  onClick={showAllCurrentFuture}
                >
                  Wszystkie lata
                </button>
                {chipYears.map((year) => (
                  <button
                    key={year}
                    type="button"
                    className={
                      !allSelected && selectedYear === year
                        ? styles.chipActive
                        : styles.chip
                    }
                    aria-pressed={!allSelected && selectedYear === year}
                    aria-current={selectedYear === year ? 'true' : undefined}
                    onClick={() => selectYear(year)}
                  >
                    {year}
                  </button>
                ))}
              </>
            ) : null}
          </div>
          <div className={styles.mobileViewSwitch}>
            <ModernWeddingsViewSwitch value={viewMode} onChange={onViewChange} />
          </div>
        </div>
      ) : null}

      {searching && visible.length === 0 ? (
        <div className={styles.empty} role="status">
          <p className={styles.emptyTitle}>Brak wyników</p>
          <p className={styles.emptyDesc}>Spróbuj innej frazy wyszukiwania.</p>
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
            {scope === 'mine' ? 'Brak własnych ślubów' : 'Brak współdzielonych ślubów'}
          </p>
          <p className={styles.emptyDesc}>
            {scope === 'mine'
              ? 'Możesz przełączyć zakres na Współdzielone, aby zobaczyć dostępne wspólne zlecenia.'
              : 'Współdzielone zlecenia pojawią się tutaj po przyjęciu zaproszenia.'}
          </p>
        </div>
      ) : (
        <div className={styles.seasons}>
          {layers.active ? (
            <SeasonBlock
              season={layers.active.season}
              count={layers.active.items.length}
              expanded={displayedCurrentFuture.has(layers.active.season)}
              tone="primary"
              onToggle={() => toggleCurrentFuture(layers.active!.season)}
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
              expanded={displayedCurrentFuture.has(group.season)}
              tone="primary"
              onToggle={() => toggleCurrentFuture(group.season)}
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
                  const next = new Set(prev)
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
