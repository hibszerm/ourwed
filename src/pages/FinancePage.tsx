import { useMemo, useState } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { FinanceHealthChips } from '@/features/finance/FinanceHealthChips'
import { FinanceKindChips } from '@/features/finance/FinanceKindChips'
import { FinanceKpiStrip } from '@/features/finance/FinanceKpiStrip'
import { FinanceMonthChart } from '@/features/finance/FinanceMonthChart'
import {
  FinanceMonthChips,
  FinanceMonthSelect,
} from '@/features/finance/FinanceMonthChips'
import { FinanceSummaryPanel } from '@/features/finance/FinanceSummaryPanel'
import {
  FinanceWeddingCards,
  FinanceWeddingTable,
} from '@/features/finance/FinanceWeddingList'
import {
  FINANCE_MONTH_LABELS_FULL,
  FINANCE_SEASON_PREVIEW_LIMIT,
} from '@/features/finance/financeLabels'
import { useFinanceEntranceReveal } from '@/features/finance/useFinanceEntranceReveal'
import {
  useFinanceSeason,
  useResolvedFinanceSeasonYear,
} from '@/features/finance/useFinanceSeason'
import {
  filterFinanceAssignments,
  projectFinanceSubset,
  sortFinanceAssignments,
} from '@/lib/finance/financeSeasonFilters'
import type {
  FinanceKindFilter,
  FinancePaymentFilter,
  FinanceSortField,
} from '@/lib/finance/financeSeasonTypes'
import styles from '@/features/finance/FinanceCenter.module.css'

type FinanceTab = 'season' | 'weddings'

export function FinancePage() {
  const [tab, setTab] = useState<FinanceTab>('season')
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [month, setMonth] = useState<number | null>(null)
  const [kindFilter, setKindFilter] = useState<FinanceKindFilter>('all')
  const [paymentFilter, setPaymentFilter] =
    useState<FinancePaymentFilter>('all')
  const [sortField, setSortField] = useState<FinanceSortField>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const { seasonYear, yearsQuery } = useResolvedFinanceSeasonYear(selectedYear)
  const seasonQuery = useFinanceSeason(seasonYear)

  const model = seasonQuery.data
  const availableYears = useMemo(() => {
    const set = new Set(yearsQuery.data ?? [])
    if (seasonYear != null) {
      set.add(seasonYear)
      set.add(seasonYear - 1)
      set.add(seasonYear + 1)
    }
    return [...set].sort((a, b) => a - b)
  }, [yearsQuery.data, seasonYear])

  const kindScoped = useMemo(() => {
    if (!model) return []
    return filterFinanceAssignments(model.assignments, {
      paymentFilter: 'all',
      kindFilter,
      month: null,
    })
  }, [model, kindFilter])

  const projected = useMemo(
    () => projectFinanceSubset(kindScoped),
    [kindScoped],
  )

  const filtered = useMemo(() => {
    if (!model) return []
    const base = filterFinanceAssignments(model.assignments, {
      paymentFilter,
      kindFilter,
      month,
    })
    return sortFinanceAssignments(base, sortField, sortDir)
  }, [model, paymentFilter, kindFilter, month, sortField, sortDir])

  const preview = useMemo(
    () => filtered.slice(0, FINANCE_SEASON_PREVIEW_LIMIT),
    [filtered],
  )

  const seasonEmpty = Boolean(model && kindScoped.length === 0)
  const filterEmpty = Boolean(
    model && kindScoped.length > 0 && filtered.length === 0,
  )
  const hasMoreThanPreview = filtered.length > FINANCE_SEASON_PREVIEW_LIMIT

  const showBody =
    model != null ||
    (seasonQuery.isFetching && seasonQuery.isPlaceholderData)

  const dataReady = Boolean(model) && !seasonEmpty
  const { phase: reveal, completeEntrance, entranceLocked } =
    useFinanceEntranceReveal(dataReady)

  function changeSeason(year: number) {
    if (reveal === 'prep' || reveal === 'play') {
      completeEntrance()
    }
    setSelectedYear(year)
    setMonth(null)
  }

  function selectMonth(next: number | null) {
    if (reveal === 'prep' || reveal === 'play') {
      completeEntrance()
    }
    setMonth(next)
  }

  function selectTab(next: FinanceTab) {
    if (next === 'weddings' && (reveal === 'prep' || reveal === 'play')) {
      completeEntrance()
    }
    setTab(next)
  }

  function openAllWeddings() {
    selectTab('weddings')
  }

  const kindCounts = {
    all: model?.assignments.length ?? 0,
    wedding: model?.kpis.weddingCount ?? 0,
    session: model?.kpis.sessionCount ?? 0,
  }

  function renderSeasonNavigator() {
    return (
      <>
        <button
          type="button"
          className={styles.seasonNav}
          aria-label="Poprzedni sezon"
          disabled={seasonYear == null}
          onClick={() => {
            if (seasonYear == null) return
            changeSeason(seasonYear - 1)
          }}
        >
          ‹
        </button>
        <label className={styles.seasonSelectLabel}>
          <span className={styles.srOnly}>Sezon</span>
          <select
            className={styles.seasonSelect}
            value={seasonYear ?? ''}
            disabled={seasonYear == null}
            onChange={(e) => changeSeason(Number(e.target.value))}
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                Sezon {y}
              </option>
            ))}
            {availableYears.length === 0 ? <option value="">—</option> : null}
          </select>
        </label>
        <button
          type="button"
          className={styles.seasonNav}
          aria-label="Następny sezon"
          disabled={seasonYear == null}
          onClick={() => {
            if (seasonYear == null) return
            changeSeason(seasonYear + 1)
          }}
        >
          ›
        </button>
      </>
    )
  }

  return (
    <AppLayout>
      <PageContainer width="full" className={styles.pageShell}>
        <div className={styles.workspace} data-finance-workspace>
          <PageHeader
            className={styles.financeHeader}
            title="Finanse"
            action={
              <div
                className={`${styles.seasonControl} ${styles.seasonControlHeader}`}
                aria-label="Wybór sezonu"
              >
                {renderSeasonNavigator()}
              </div>
            }
          />

          <div
            className={styles.root}
            data-finance-reveal={reveal}
            data-finance-entrance-locked={entranceLocked ? '1' : '0'}
            data-finance-root
          >
            <div className={styles.controlStack}>
              <div className={styles.controlTopRow}>
                <div
                  className={styles.tabs}
                  role="tablist"
                  aria-label="Widok finansów"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'season'}
                    className={`${styles.tab} ${tab === 'season' ? styles.tabActive : ''}`}
                    onClick={() => selectTab('season')}
                  >
                    Sezon
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'weddings'}
                    className={`${styles.tab} ${tab === 'weddings' ? styles.tabActive : ''}`}
                    onClick={() => selectTab('weddings')}
                  >
                    Zlecenia
                  </button>
                </div>

                <div
                  className={`${styles.seasonControl} ${styles.seasonControlStack}`}
                  aria-label="Wybór sezonu"
                >
                  {renderSeasonNavigator()}
                </div>
              </div>

              <FinanceKindChips
                active={kindFilter}
                onChange={setKindFilter}
                counts={kindCounts}
              />
            </div>

            {seasonQuery.isError && !model ? (
              <EmptyState
                title="Nie udało się załadować finansów"
                description={
                  seasonQuery.error instanceof Error
                    ? seasonQuery.error.message
                    : 'Spróbuj odświeżyć stronę.'
                }
              />
            ) : !showBody || !model ? null : (
              <>
                {seasonEmpty ? (
                  <EmptyState
                    title="Brak zleceń w tym sezonie."
                    description="Wybierz inny sezon albo dodaj ślub lub sesję z datą w tym roku."
                  />
                ) : (
                  <>
                    <FinanceKpiStrip
                      kpis={projected.kpis}
                      empty={false}
                      kindFilter={kindFilter}
                      reveal={reveal}
                    />

                    {tab === 'season' ? (
                      <>
                        <section
                          className={styles.analyticsSection}
                          data-finance-analytics
                        >
                          <div className={styles.analyticsChart}>
                            <FinanceMonthChart
                              months={projected.months}
                              selectedMonth={month}
                              onSelectMonth={selectMonth}
                            />
                          </div>
                          {seasonYear != null ? (
                            <div className={styles.analyticsSummary}>
                              <FinanceSummaryPanel
                                seasonYear={seasonYear}
                                kpis={projected.kpis}
                                months={projected.months}
                                selectedMonth={month}
                                kindFilter={kindFilter}
                                reveal={reveal}
                              />
                            </div>
                          ) : null}
                        </section>
                        <FinanceHealthChips
                          kpis={projected.kpis}
                          active={paymentFilter}
                          onChange={setPaymentFilter}
                        />
                        <section className={styles.listSection}>
                          <div className={styles.sectionHead}>
                            <h2 className={styles.sectionTitle}>
                              {month == null
                                ? 'Podgląd zleceń'
                                : `Podgląd — ${FINANCE_MONTH_LABELS_FULL[month - 1]}`}
                            </h2>
                            <p className={styles.sectionHint}>
                              Do {FINANCE_SEASON_PREVIEW_LIMIT} pozycji. Pełna
                              lista w zakładce Zlecenia.
                            </p>
                          </div>
                          {filterEmpty ? (
                            <EmptyState title="Brak zleceń spełniających wybrane kryteria." />
                          ) : (
                            <>
                              <div className={styles.assignmentTableGate}>
                                <FinanceWeddingTable assignments={preview} />
                              </div>
                              <div className={styles.assignmentCardsGate}>
                                <FinanceWeddingCards assignments={preview} />
                              </div>
                              {hasMoreThanPreview || filtered.length > 0 ? (
                                <div className={styles.previewCta}>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="md"
                                    onClick={openAllWeddings}
                                  >
                                    Zobacz wszystkie zlecenia
                                  </Button>
                                </div>
                              ) : null}
                            </>
                          )}
                        </section>
                      </>
                    ) : (
                      <>
                        {/* Zlecenia tab has no chart — keep explicit month control. */}
                        <div className={styles.desktopOnly}>
                          <FinanceMonthChips
                            months={projected.months}
                            selectedMonth={month}
                            onSelectMonth={selectMonth}
                          />
                        </div>
                        <div className={styles.mobileOnly}>
                          <FinanceMonthSelect
                            months={projected.months}
                            selectedMonth={month}
                            onSelectMonth={selectMonth}
                          />
                        </div>
                        <FinanceHealthChips
                          kpis={projected.kpis}
                          active={paymentFilter}
                          onChange={setPaymentFilter}
                        />
                        <div className={styles.toolbar}>
                          <label className={styles.sortLabel}>
                            Sortuj
                            <select
                              className={styles.sortSelect}
                              value={`${sortField}:${sortDir}`}
                              onChange={(e) => {
                                const [field, dir] = e.target.value.split(
                                  ':',
                                ) as [FinanceSortField, 'asc' | 'desc']
                                setSortField(field)
                                setSortDir(dir)
                              }}
                            >
                              <option value="date:asc">Data ↑</option>
                              <option value="date:desc">Data ↓</option>
                              <option value="contract_value:desc">
                                Wartość ↓
                              </option>
                              <option value="contract_value:asc">
                                Wartość ↑
                              </option>
                              <option value="total_paid:desc">
                                Wpłacono ↓
                              </option>
                              <option value="total_paid:asc">Wpłacono ↑</option>
                              <option value="remaining:desc">
                                Pozostało ↓
                              </option>
                              <option value="remaining:asc">
                                Pozostało ↑
                              </option>
                            </select>
                          </label>
                        </div>
                        {filterEmpty ? (
                          <EmptyState title="Brak zleceń spełniających wybrane kryteria." />
                        ) : (
                          <>
                            <div className={styles.assignmentTableGate}>
                              <FinanceWeddingTable assignments={filtered} />
                            </div>
                            <div className={styles.assignmentCardsGate}>
                              <FinanceWeddingCards assignments={filtered} />
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  )
}
