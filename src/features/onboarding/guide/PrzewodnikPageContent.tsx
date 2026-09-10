import {
  useCallback,
  useId,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type SVGProps,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  IconCalendar,
  IconCheck,
  IconCog,
  IconDashboard,
  IconDocuments,
  IconFinances,
  IconSettings,
  IconWeddings,
} from '@/components/icons'
import { ProGateNavButton } from '@/features/billing/ProGateNavButton'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import {
  GUIDE_DEFAULT_CATEGORY_ID,
  GUIDE_LEARN_CATEGORIES,
  type GuideLearnAction,
  type GuideLearnCategory,
  type GuideLearnCategoryId,
} from '@/features/onboarding/guide/guideEducationContent'
import {
  buildGuidePreparePresentation,
  type GuidePrepareAction,
} from '@/features/onboarding/guide/guidePreparePresentation'
import {
  deriveSetupGuidanceState,
  studioPackagesSetupSignalsQueryKey,
} from '@/features/onboarding/setup/setupGuidanceReadiness'
import { SETUP_GUIDANCE_ROUTES } from '@/features/onboarding/setup/setupGuidanceRoutes'
import {
  companyDetailsQueryKey,
  companyDetailsService,
} from '@/lib/api/companyDetailsService'
import { packageService } from '@/lib/api/packageService'
import styles from './PrzewodnikPage.module.css'

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

const PREPARE_ICONS: Record<
  'packages' | 'templates' | 'company',
  IconComponent
> = {
  packages: IconSettings,
  templates: IconDocuments,
  company: IconCog,
}

const LEARN_ICONS: Record<GuideLearnCategoryId, IconComponent> = {
  zlecenia: IconWeddings,
  umowy: IconDocuments,
  'dzien-slubu': IconCalendar,
  finanse: IconFinances,
  organizacja: IconDashboard,
}

const GUIDE_QUERY_STALE_MS = 30_000

function PrepareModuleAction({ action }: { action: GuidePrepareAction }) {
  const navigate = useNavigate()

  if (action.style === 'action-row') {
    return (
      <button
        type="button"
        className={styles.prepareActionRow}
        onClick={() => navigate(action.to)}
      >
        {action.label}
      </button>
    )
  }

  return (
    <Link to={action.to} className={styles.quietLink}>
      {action.label}
    </Link>
  )
}

function StoryActions({ actions }: { actions: readonly GuideLearnAction[] }) {
  const navigate = useNavigate()

  return (
    <div className={styles.storyActions}>
      {actions.map((action) => {
        if (action.proActionKey) {
          return (
            <ProGateNavButton
              key={action.label}
              to={action.to}
              actionKey={action.proActionKey}
              size="sm"
              variant={
                action.prominence === 'primary'
                  ? 'primary'
                  : action.prominence === 'secondary'
                    ? 'secondary'
                    : 'ghost'
              }
              className={styles.storyActionButton}
            >
              {action.label}
            </ProGateNavButton>
          )
        }

        if (action.prominence === 'quiet') {
          return (
            <Link key={action.label} to={action.to} className={styles.quietLink}>
              {action.label}
            </Link>
          )
        }

        return (
          <button
            key={action.label}
            type="button"
            className={
              action.prominence === 'primary'
                ? styles.storyPrimaryAction
                : styles.storySecondaryAction
            }
            onClick={() => navigate(action.to)}
          >
            {action.label}
          </button>
        )
      })}
    </div>
  )
}

function StoryCanvas({
  category,
  panelId,
  labelledBy,
}: {
  category: GuideLearnCategory
  panelId: string
  labelledBy: string
}) {
  const Icon = LEARN_ICONS[category.id]
  const isAlternatives = category.composition === 'begin-paths'
  const hasFacts = Boolean(category.facts && category.facts.length > 0)

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className={styles.storyCanvas}
      data-testid={`przewodnik-story-${category.id}`}
      data-composition={category.composition}
    >
      <div className={styles.storyMain}>
        <div className={styles.storyEyebrowRow}>
          <span className={styles.storyIcon} aria-hidden="true">
            <Icon width={18} height={18} />
          </span>
          <span className={styles.storyEyebrow}>{category.eyebrow}</span>
        </div>
        <h3 className={styles.storyHeadline}>{category.headline}</h3>
        <p className={styles.storyIntro}>{category.intro}</p>

        {isAlternatives && category.paths && category.paths.length > 0 ? (
          <div className={styles.pathBoard} data-testid="przewodnik-alt-paths">
            <p className={styles.pathBoardLabel}>Trzy sposoby na start</p>
            <ul className={styles.pathList}>
              {category.paths.map((path) => (
                <li key={path.label} className={styles.pathItem}>
                  <div className={styles.pathCopy}>
                    <span className={styles.pathLabel}>{path.label}</span>
                    <p className={styles.pathBody}>{path.body}</p>
                  </div>
                  <span className={styles.pathResult}>{path.outcome}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!isAlternatives && category.flow && category.flow.length > 0 ? (
          <ol
            className={
              category.composition === 'commercial'
                ? styles.valueFlow
                : styles.storyFlow
            }
            aria-label={
              category.composition === 'commercial'
                ? 'Skład wartości umowy'
                : 'Przebieg'
            }
          >
            {category.flow.map((step, index) => (
              <li key={step.label} className={styles.storyFlowStep}>
                {category.composition === 'commercial' ? (
                  index > 0 ? (
                    <span className={styles.valueOp} aria-hidden="true">
                      {index === category.flow!.length - 1 ? '=' : '+'}
                    </span>
                  ) : null
                ) : (
                  <span className={styles.storyFlowIndex} aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                )}
                <span className={styles.storyFlowLabel}>{step.label}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {category.note ? <p className={styles.storyNote}>{category.note}</p> : null}

        <StoryActions actions={category.actions} />
      </div>

      <aside className={styles.storySide} aria-label="Kluczowe elementy">
        {hasFacts ? (
          <ul className={styles.factList}>
            {category.facts!.map((fact) => (
              <li key={fact.label} className={styles.factItem}>
                <span className={styles.factLabel}>{fact.label}</span>
                <p className={styles.factBody}>{fact.body}</p>
              </li>
            ))}
          </ul>
        ) : null}

        {category.inset ? (
          <div className={styles.storyInset}>
            <p className={styles.storyInsetTitle}>{category.inset.title}</p>
            <p className={styles.storyInsetBody}>{category.inset.body}</p>
            {category.inset.footnote ? (
              <p className={styles.storyInsetFootnote}>
                {category.inset.footnote}
              </p>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  )
}

/**
 * Guide V3 — preparation readiness + top feature rail + story canvas.
 */
export function PrzewodnikPageContent() {
  const userId = useStudioAuthId()
  const baseId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [selectedCategoryId, setSelectedCategoryId] =
    useState<GuideLearnCategoryId>(GUIDE_DEFAULT_CATEGORY_ID)

  const packagesQuery = useQuery({
    queryKey: studioPackagesSetupSignalsQueryKey(userId),
    queryFn: () => packageService.listSetupSignals(),
    enabled: Boolean(userId),
    staleTime: GUIDE_QUERY_STALE_MS,
  })

  const companyQuery = useQuery({
    queryKey: companyDetailsQueryKey(userId),
    queryFn: () => companyDetailsService.get(),
    enabled: Boolean(userId),
    staleTime: GUIDE_QUERY_STALE_MS,
  })

  const packagesBlocked = packagesQuery.isError
  const readinessLoading =
    Boolean(userId) &&
    !packagesBlocked &&
    (packagesQuery.isLoading ||
      (packagesQuery.isSuccess && companyQuery.isLoading))

  const derived =
    packagesQuery.isSuccess
      ? deriveSetupGuidanceState({
          packages: packagesQuery.data,
          companyName: companyQuery.isSuccess
            ? (companyQuery.data?.companyName ?? null)
            : null,
        })
      : null

  const preparePresentation = derived
    ? buildGuidePreparePresentation(derived)
    : null
  const prepareModules = preparePresentation?.modules ?? null
  const selectedIndex = GUIDE_LEARN_CATEGORIES.findIndex(
    (c) => c.id === selectedCategoryId,
  )
  const selectedCategory =
    GUIDE_LEARN_CATEGORIES[selectedIndex >= 0 ? selectedIndex : 0]
  const panelId = `${baseId}-story-panel`
  const tablistId = `${baseId}-feature-rail`

  const selectCategory = useCallback((id: GuideLearnCategoryId, index: number) => {
    setSelectedCategoryId(id)
    tabRefs.current[index]?.focus()
  }, [])

  function onRailKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const count = GUIDE_LEARN_CATEGORIES.length
    if (count === 0) return

    let next = selectedIndex >= 0 ? selectedIndex : 0
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      next = (next + 1) % count
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      next = (next - 1 + count) % count
    } else if (event.key === 'Home') {
      event.preventDefault()
      next = 0
    } else if (event.key === 'End') {
      event.preventDefault()
      next = count - 1
    } else {
      return
    }

    const category = GUIDE_LEARN_CATEGORIES[next]
    if (category) selectCategory(category.id, next)
  }

  return (
    <div className={styles.page} data-testid="przewodnik-page">
      <header className={styles.header}>
        <h1 className={styles.title}>Przewodnik</h1>
        <p className={styles.lede}>
          Przygotuj OurWed do swojej pracy i zobacz, jak wykorzystać
          najważniejsze funkcje.
        </p>
      </header>

      <section
        className={styles.prepareSection}
        aria-labelledby="przewodnik-prepare-title"
      >
        <div className={styles.sectionHeader}>
          <h2 id="przewodnik-prepare-title" className={styles.sectionTitle}>
            Przygotuj OurWed
          </h2>
          <p className={styles.sectionLede}>
            Ustaw podstawy raz, a OurWed wykorzysta je przy kolejnych zleceniach.
          </p>
        </div>

        <div
          className={styles.preparePanel}
          data-testid="przewodnik-prepare-panel"
          data-activation-stage={
            readinessLoading
              ? 'loading'
              : packagesBlocked
                ? 'error'
                : (preparePresentation?.activationStage ?? 'needs-core')
          }
          data-ready-state={
            readinessLoading
              ? 'loading'
              : packagesBlocked
                ? 'error'
                : derived?.isCoreReady
                  ? 'core-ready'
                  : 'needs-core'
          }
        >
          {packagesBlocked ? (
            <p className={styles.prepareError} role="status">
              Nie udało się sprawdzić konfiguracji. Możesz nadal przejść do
              pakietów i danych firmy.
            </p>
          ) : null}

          {companyQuery.isError && !packagesBlocked ? (
            <p className={styles.prepareHint} role="status">
              Nie udało się odczytać danych firmy. Pozostała konfiguracja jest
              dostępna.
            </p>
          ) : null}

          {!readinessLoading && preparePresentation?.summary ? (
            <div
              className={styles.prepareSummary}
              data-testid="przewodnik-prepare-summary"
              data-stage={preparePresentation.activationStage}
            >
              <p className={styles.prepareSummaryTitle}>
                {preparePresentation.summary.title}
              </p>
              <p className={styles.prepareSummaryBody}>
                {preparePresentation.summary.body}
              </p>
            </div>
          ) : null}

          <ul className={styles.prepareModules}>
            {readinessLoading
              ? (['packages', 'templates', 'company'] as const).map((id) => (
                  <li
                    key={id}
                    className={styles.prepareModule}
                    data-testid={`przewodnik-prepare-skeleton-${id}`}
                  >
                    <div className={styles.moduleTop}>
                      <span className={styles.skeletonIcon} aria-hidden="true" />
                      <div className={styles.moduleCopy}>
                        <span className={styles.skeletonLine} aria-hidden="true" />
                        <span
                          className={styles.skeletonLineShort}
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                    <div className={styles.moduleFooter}>
                      <span
                        className={styles.skeletonAction}
                        aria-hidden="true"
                      />
                    </div>
                  </li>
                ))
              : null}

            {!readinessLoading && prepareModules
              ? prepareModules.map((item) => {
                  const Icon = PREPARE_ICONS[item.id]
                  const optionalQuiet =
                    Boolean(item.optional) &&
                    preparePresentation?.activationStage === 'core_ready'
                  return (
                    <li
                      key={item.id}
                      className={`${styles.prepareModule}${
                        item.recommendedNext ? ` ${styles.prepareModuleRecommended}` : ''
                      }${optionalQuiet ? ` ${styles.prepareModuleOptionalQuiet}` : ''}`}
                      data-testid={`przewodnik-prepare-${item.id}`}
                      data-state={item.statusTone ?? 'none'}
                      data-recommended-next={
                        item.recommendedNext ? 'true' : undefined
                      }
                    >
                      <div className={styles.moduleTop}>
                        <span className={styles.iconMark} aria-hidden="true">
                          <Icon width={18} height={18} />
                        </span>
                        <div className={styles.moduleCopy}>
                          <div className={styles.titleRow}>
                            <h3 className={styles.moduleTitle}>{item.title}</h3>
                            {item.statusLabel ? (
                              <span
                                className={
                                  item.statusTone === 'ready'
                                    ? styles.statusReady
                                    : item.statusTone === 'started'
                                      ? styles.statusStarted
                                      : item.statusTone === 'optional_ready'
                                        ? styles.statusOptionalReady
                                        : item.statusTone === 'optional'
                                          ? styles.statusOptional
                                          : item.statusTone === 'dependency'
                                            ? styles.statusDependency
                                            : styles.statusRecommended
                                }
                              >
                                {item.statusTone === 'ready' ? (
                                  <IconCheck
                                    width={13}
                                    height={13}
                                    aria-hidden="true"
                                  />
                                ) : null}
                                <span>{item.statusLabel}</span>
                              </span>
                            ) : null}
                          </div>
                          <p className={styles.moduleBody}>{item.body}</p>
                        </div>
                      </div>
                      {item.actions.length > 0 ? (
                        <div className={styles.moduleFooter}>
                          {item.actions.map((action) => (
                            <PrepareModuleAction
                              key={action.label}
                              action={action}
                            />
                          ))}
                        </div>
                      ) : null}
                    </li>
                  )
                })
              : null}

            {!readinessLoading && packagesBlocked ? (
              <li className={styles.prepareModule}>
                <div className={styles.moduleTop}>
                  <span className={styles.iconMark} aria-hidden="true">
                    <IconSettings width={18} height={18} />
                  </span>
                  <div className={styles.moduleCopy}>
                    <h3 className={styles.moduleTitle}>Konfiguracja</h3>
                    <p className={styles.moduleBody}>
                      Otwórz pakiety lub dane firmy, aby kontynuować.
                    </p>
                  </div>
                </div>
                <div className={styles.moduleFooter}>
                  <Link
                    to={SETUP_GUIDANCE_ROUTES.packages}
                    className={styles.prepareActionRow}
                  >
                    Przejdź do pakietów →
                  </Link>
                </div>
              </li>
            ) : null}
          </ul>
        </div>
      </section>

      <section
        className={styles.learnSection}
        aria-labelledby="przewodnik-learn-title"
      >
        <div className={styles.sectionHeader}>
          <h2 id="przewodnik-learn-title" className={styles.sectionTitle}>
            Poznaj OurWed
          </h2>
          <p className={styles.sectionLede}>
            Wyjaśnienia funkcji, do których możesz wracać w dowolnym momencie.
          </p>
        </div>

        <div
          className={styles.featureTheater}
          data-testid="przewodnik-feature-theater"
        >
          <div
            id={tablistId}
            role="tablist"
            aria-label="Obszary produktu"
            className={styles.featureRail}
            data-testid="przewodnik-feature-rail"
            onKeyDown={onRailKeyDown}
          >
            {GUIDE_LEARN_CATEGORIES.map((category, index) => {
              const Icon = LEARN_ICONS[category.id]
              const selected = category.id === selectedCategoryId
              const tabId = `${baseId}-tab-${category.id}`

              return (
                <button
                  key={category.id}
                  id={tabId}
                  ref={(node) => {
                    tabRefs.current[index] = node
                  }}
                  type="button"
                  role="tab"
                  className={styles.featureTab}
                  aria-selected={selected}
                  aria-controls={panelId}
                  tabIndex={selected ? 0 : -1}
                  data-selected={selected ? 'true' : 'false'}
                  data-testid={`przewodnik-feature-tab-${category.id}`}
                  onClick={() => setSelectedCategoryId(category.id)}
                >
                  <span className={styles.featureTabIcon} aria-hidden="true">
                    <Icon width={16} height={16} />
                  </span>
                  <span className={styles.featureTabLabel}>{category.title}</span>
                </button>
              )
            })}
          </div>

          <StoryCanvas
            key={selectedCategory.id}
            category={selectedCategory}
            panelId={panelId}
            labelledBy={`${baseId}-tab-${selectedCategory.id}`}
          />
        </div>
      </section>
    </div>
  )
}
