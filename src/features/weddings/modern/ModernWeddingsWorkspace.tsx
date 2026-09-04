import {
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
  defaultExpandedCurrentFutureYears,
  expandAllCurrentFutureYears,
  isArchivedOrCancelled,
  listCurrentAndFutureYears,
  matchesModernWeddingSearch,
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
import type { Wedding } from '@/types/wedding'
import styles from './ModernWeddingsWorkspace.module.css'

interface ModernWeddingsWorkspaceProps {
  weddings: Wedding[]
  viewMode: WeddingsViewMode
  onViewChange: (mode: WeddingsViewMode) => void
  entrance?: 'full' | 'soft'
}

function CardCollection({ weddings }: { weddings: Wedding[] }) {
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
  weddings: Wedding[]
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
  const [historyYearsExpanded, setHistoryYearsExpanded] = useState(
    () => new Set<number>(),
  )
  const [previousOpen, setPreviousOpen] = useState(false)
  const [pendingScroll, setPendingScroll] = useState<number | null>(null)

  const hiddenArchivedCount = useMemo(
    () => weddings.filter(isArchivedOrCancelled).length,
    [weddings],
  )

  const catalog = useMemo(() => {
    return weddings.filter((wedding) => {
      if (!showArchived && isArchivedOrCancelled(wedding)) return false
      return true
    })
  }, [weddings, showArchived])

  const searching = query.trim().length > 0

  const visible = useMemo(() => {
    if (!searching) return catalog
    return catalog.filter((wedding) =>
      matchesModernWeddingSearch(wedding, query),
    )
  }, [catalog, searching, query])

  const catalogLayers = useMemo(() => {
    const groups = groupAssignmentsBySeason(catalog, (w) => w.date, {
      referenceYear,
    })
    return splitModernWeddingsSeasons(groups, referenceYear)
  }, [catalog, referenceYear])

  const layers = useMemo(() => {
    if (!searching) return catalogLayers
    const groups = groupAssignmentsBySeason(visible, (w) => w.date, {
      referenceYear,
    })
    return splitModernWeddingsSeasons(groups, referenceYear)
  }, [searching, catalogLayers, visible, referenceYear])

  const chipYears = useMemo(
    () => listCurrentAndFutureYears(catalogLayers),
    [catalogLayers],
  )

  const defaultCurrentFuture = useMemo(
    () => defaultExpandedCurrentFutureYears(chipYears, referenceYear),
    [chipYears, referenceYear],
  )

  const storedCurrentFuture = currentFutureExpanded ?? defaultCurrentFuture

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

  const { allSelected, selectedYear } = resolveCurrentFutureChipSelection(
    chipYears,
    storedCurrentFuture,
  )

  const showChips = chipYears.length > 1

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
    setCurrentFutureExpanded(selectExclusiveCurrentFutureYear(season))
    setPendingScroll(season)
  }

  function showAllCurrentFuture() {
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
    weddings.length > 0

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
        <ModernWeddingsViewSwitch value={viewMode} onChange={onViewChange} />
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
            <button
              type="button"
              className={allSelected ? styles.chipActive : styles.chip}
              aria-pressed={allSelected}
              onClick={showAllCurrentFuture}
            >
              Wszystkie
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
  groups: { season: number; items: Wedding[] }[]
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
