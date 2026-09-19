import { ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/currency'
import {
  ASSISTANT_CANCEL,
  ASSISTANT_CREATE_TASK_CTA,
  ASSISTANT_CREATE_WEDDING_CTA,
  ASSISTANT_EMPTY_TASKS,
  ASSISTANT_EXAMPLES_V4,
  ASSISTANT_MISSING_CEREMONY_TIME,
  ASSISTANT_MISSING_DAY_PLAN,
  ASSISTANT_MISSING_PREPARATIONS,
  ASSISTANT_NO_MATCH,
  ASSISTANT_NO_MATCH_HINT,
  ASSISTANT_SCHEDULE_EMPTY,
  ASSISTANT_SCHEDULE_EMPTY_TOMORROW,
  ASSISTANT_UNRECOGNIZED,
  ASSISTANT_UNRECOGNIZED_HINT,
} from '../copy'
import { formatPolishLongDate } from '../dates'
import type { AssistantResponse } from '../types'
import { polishCountUnit } from '../tools/aggregateRange'
import { AssistantGoalClarification } from './AssistantGoalClarification'
import styles from './Assistant.module.css'
import {
  isGoalClarificationHostEnabled,
  toGoalClarificationViewModel,
} from '../v4/goalSpec/goalClarificationHostAdapter'
import { getPendingGoalClarification } from '../v4/goalSpec/goalClarificationSession'

function displayDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatPolishLongDate(raw)
  return raw
}

function LinkCta({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" className={styles.linkAction} onClick={onClick}>
      {label}
      <ArrowRight size={16} aria-hidden />
    </button>
  )
}

function Eyebrow({ children }: { children: string }) {
  return <p className={styles.eyebrow}>{children}</p>
}

function taskDueLabel(dueDate: string): string {
  if (!dueDate) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return formatPolishLongDate(dueDate)
  }
  return dueDate
}

function isCeremonyStop(stop: {
  key: string
  title: string
}): boolean {
  return /ceremon/i.test(stop.key) || /ceremon/i.test(stop.title)
}

export function AssistantResponseRenderer({
  response,
  busy,
  hideResourceIdentity = false,
  onSelectChoice,
  onSelectClarification,
  onConfirmCreateWedding,
  onConfirmCreateTask,
  onNavigate,
  onCancelConfirm,
  goalClarificationResolvedLabel = null,
}: {
  response: AssistantResponse
  busy: boolean
  /** When context header already shows couple/date. */
  hideResourceIdentity?: boolean
  onSelectChoice: (itemId: string, kind: 'wedding' | 'session') => void
  onSelectClarification?: (optionId: string) => void
  onConfirmCreateWedding: () => void
  onConfirmCreateTask: () => void
  onNavigate: (path: string) => void
  onCancelConfirm: () => void
  /** U3: presentation-only resolved label for GoalSpec clarification. */
  goalClarificationResolvedLabel?: string | null
}) {
  switch (response.kind) {
    case 'text':
      return <p className={styles.textMessage}>{response.message}</p>

    case 'route_distance':
      return <p className={styles.textMessage}>{response.message}</p>

    case 'error': {
      const isNoMatch = response.message === ASSISTANT_NO_MATCH
      const isUnrecognized = response.message.includes('rozpoznać')
      return (
        <div className={styles.stateBlock}>
          <p className={styles.stateTitle}>{response.message}</p>
          {isNoMatch ? (
            <p className={styles.stateHint}>{ASSISTANT_NO_MATCH_HINT}</p>
          ) : null}
          {isUnrecognized ? (
            <>
              <p className={styles.stateHint}>{ASSISTANT_UNRECOGNIZED_HINT}</p>
              <ul className={styles.stateExamples}>
                {ASSISTANT_EXAMPLES_V4.slice(0, 3).map((ex) => (
                  <li key={ex}>{ex}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )
    }

    case 'unsupported':
      return (
        <div className={styles.stateBlock}>
          <p className={styles.stateTitle}>{response.message}</p>
        </div>
      )

    case 'wedding':
      return (
        <div className={styles.result}>
          {!hideResourceIdentity ? (
            <>
              <h3 className={styles.resultTitle}>
                {response.wedding.displayName}
              </h3>
              {displayDate(response.wedding.date) ? (
                <p className={styles.resultMeta}>
                  {displayDate(response.wedding.date)}
                  {response.wedding.locationLine
                    ? ` · ${response.wedding.locationLine}`
                    : ''}
                </p>
              ) : response.wedding.locationLine ? (
                <p className={styles.resultMeta}>
                  {response.wedding.locationLine}
                </p>
              ) : null}
            </>
          ) : response.wedding.locationLine ? (
            <p className={styles.resultMeta}>{response.wedding.locationLine}</p>
          ) : null}
          {response.navigate ? (
            <div className={styles.resultActions}>
              <LinkCta
                label={response.navigate.label ?? 'Otwórz zlecenie'}
                onClick={() => onNavigate(response.navigate!.path)}
              />
            </div>
          ) : null}
        </div>
      )

    case 'session':
      return (
        <div className={styles.result}>
          {!hideResourceIdentity ? (
            <h3 className={styles.resultTitle}>
              {response.session.displayName}
            </h3>
          ) : null}
          <p className={styles.resultMeta}>
            {[
              displayDate(response.session.date),
              response.session.timeLine,
              response.session.locationLine,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {response.navigate ? (
            <div className={styles.resultActions}>
              <LinkCta
                label={response.navigate.label ?? 'Otwórz sesję'}
                onClick={() => onNavigate(response.navigate!.path)}
              />
            </div>
          ) : null}
        </div>
      )

    case 'places': {
      const place = response.places[0]
      const focused = response.focusRole && response.focusRole !== 'all'
      return (
        <div className={styles.result}>
          {!hideResourceIdentity ? (
            <>
              <h3 className={styles.resultTitle}>
                {response.wedding.displayName}
              </h3>
              {displayDate(response.wedding.date) ? (
                <p className={styles.resultMeta}>
                  {displayDate(response.wedding.date)}
                </p>
              ) : null}
            </>
          ) : null}
          {response.emptyMessage &&
          (response.places.length === 0 ||
            response.places.every((p) => !p.name && !p.address)) ? (
            <div className={styles.factHero}>
              {focused && place ? <Eyebrow>{place.label}</Eyebrow> : null}
              {response.emptyMessage.split('\n').map((line, i) => (
                <p
                  key={`${i}-${line.slice(0, 24)}`}
                  className={
                    line.startsWith('W planie') ||
                    (!line.includes('nie jest') && line.length > 0 && i > 0)
                      ? styles.heroAddress
                      : styles.stateHint
                  }
                >
                  {line}
                </p>
              ))}
            </div>
          ) : focused && response.places.length === 1 && place ? (
            <div className={styles.factHero}>
              <Eyebrow>{place.label}</Eyebrow>
              {place.time ? (
                <p className={styles.heroTime}>{place.time}</p>
              ) : null}
              {!place.name && !place.address ? (
                <p className={styles.stateHint}>
                  {place.role === 'bride_preparation' ||
                  place.role === 'groom_preparation' ||
                  place.role === 'preparations'
                    ? ASSISTANT_MISSING_PREPARATIONS
                    : place.role === 'ceremony'
                      ? 'Miejsce ceremonii nie jest jeszcze ustawione.'
                      : 'Nie ustawiono.'}
                </p>
              ) : (
                <>
                  {place.name ? (
                    <p className={styles.heroPlace}>{place.name}</p>
                  ) : null}
                  {place.address ? (
                    <p className={styles.heroAddress}>{place.address}</p>
                  ) : null}
                </>
              )}
            </div>
          ) : focused && response.places.length > 1 ? (
            <div className={styles.placeStack}>
              {response.places.map((p) => (
                <div
                  key={`${p.role}-${p.participantKey ?? ''}`}
                  className={styles.placeBlock}
                >
                  <Eyebrow>{p.label}</Eyebrow>
                  {p.time ? (
                    <p className={styles.sectionValue}>{p.time}</p>
                  ) : null}
                  <p className={styles.heroPlace}>
                    {p.name || 'Nie ustawiono'}
                  </p>
                  {p.address ? (
                    <p className={styles.heroAddress}>{p.address}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.placeStack}>
              {response.places.map((p) => (
                <div
                  key={`${p.role}-${p.participantKey ?? ''}`}
                  className={styles.placeBlock}
                >
                  <Eyebrow>{p.label}</Eyebrow>
                  {p.time ? (
                    <p className={styles.sectionValue}>{p.time}</p>
                  ) : null}
                  <p className={styles.heroPlace}>
                    {p.name || 'Nie ustawiono'}
                  </p>
                  {p.address ? (
                    <p className={styles.heroAddress}>{p.address}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {response.navigate ? (
            <div className={styles.resultActions}>
              <LinkCta
                label={response.navigate.label ?? 'Otwórz zlecenie'}
                onClick={() => onNavigate(response.navigate!.path)}
              />
            </div>
          ) : null}
        </div>
      )
    }

    case 'day_plan': {
      const focus = response.focus ?? 'full'
      const stop = response.stops[0]
      if (focus === 'ceremony' || focus === 'preparations') {
        const show =
          focus === 'ceremony'
            ? stop &&
              (isCeremonyStop(stop) || stop.key === 'ceremony')
              ? stop
              : null
            : stop

        const timeMissing =
          focus === 'ceremony'
            ? !show?.time
            : !show?.time && !(show?.placeName || show?.address)

        return (
          <div className={styles.result}>
            <div className={styles.factHero}>
              <Eyebrow>
                {focus === 'ceremony' ? 'Ceremonia' : 'Przygotowania'}
              </Eyebrow>
              {timeMissing ? (
                <p className={styles.stateHint}>
                  {response.emptyMessage ??
                    (focus === 'ceremony'
                      ? ASSISTANT_MISSING_CEREMONY_TIME
                      : ASSISTANT_MISSING_PREPARATIONS)}
                </p>
              ) : show?.time ? (
                <p className={styles.heroTime}>{show.time}</p>
              ) : null}
              {show && (show.placeName || show.address) ? (
                <>
                  {show.placeName ? (
                    <p className={styles.heroPlace}>{show.placeName}</p>
                  ) : null}
                  {show.address ? (
                    <p className={styles.heroAddress}>{show.address}</p>
                  ) : null}
                </>
              ) : null}
            </div>
            {response.navigate ? (
              <div className={styles.resultActions}>
                <LinkCta
                  label={response.navigate.label ?? 'Otwórz plan dnia'}
                  onClick={() => onNavigate(response.navigate!.path)}
                />
              </div>
            ) : null}
          </div>
        )
      }

      return (
        <div className={styles.result}>
          <Eyebrow>Plan dnia</Eyebrow>
          {response.stops.length === 0 ? (
            <p className={styles.stateHint}>
              {response.emptyMessage ?? ASSISTANT_MISSING_DAY_PLAN}
            </p>
          ) : (
            <ol className={styles.timeline}>
              {response.stops.map((s) => (
                <li key={s.key} className={styles.timelineRow}>
                  <span className={styles.timelineTime}>
                    {s.time || '—'}
                  </span>
                  <span className={styles.timelineBody}>
                    <span className={styles.timelineTitle}>{s.title}</span>
                    {(s.placeName || s.address) && (
                      <span className={styles.timelinePlace}>
                        {[s.placeName, s.address].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {response.navigate ? (
            <div className={styles.resultActions}>
              <LinkCta
                label={response.navigate.label ?? 'Otwórz plan dnia'}
                onClick={() => onNavigate(response.navigate!.path)}
              />
            </div>
          ) : null}
        </div>
      )
    }

    case 'finance': {
      const remaining = response.finance.remainingToPay
      const settled = remaining === 0
      return (
        <div className={styles.result}>
          <Eyebrow>Rozliczenie</Eyebrow>
          <p className={styles.heroMoney}>{formatCurrency(remaining)}</p>
          <p className={styles.heroMoneyLabel}>
            {settled ? 'Rozliczone' : 'do zapłaty'}
          </p>
          <div className={styles.moneySummary}>
            <div className={styles.moneyRow}>
              <span className={styles.moneyLabel}>Wartość umowy</span>
              <span className={styles.moneyValue}>
                {formatCurrency(response.finance.contractValue)}
              </span>
            </div>
            <div className={styles.moneyRow}>
              <span className={styles.moneyLabel}>Wpłacono</span>
              <span className={styles.moneyValue}>
                {formatCurrency(response.finance.totalPaid)}
              </span>
            </div>
          </div>
          {response.navigate ? (
            <div className={styles.resultActions}>
              <LinkCta
                label={response.navigate.label ?? 'Otwórz finanse'}
                onClick={() => onNavigate(response.navigate!.path)}
              />
            </div>
          ) : null}
        </div>
      )
    }

    case 'schedule':
      return (
        <div className={styles.result}>
          <Eyebrow>Termin</Eyebrow>
          <h3 className={styles.resultTitle}>{response.dateLabel}</h3>
          {response.items.length === 0 ? (
            <p className={styles.stateHint}>
              {/jutro/i.test(response.dateLabel)
                ? ASSISTANT_SCHEDULE_EMPTY_TOMORROW
                : ASSISTANT_SCHEDULE_EMPTY}
            </p>
          ) : (
            <ul className={styles.agenda}>
              {response.items.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <button
                    type="button"
                    className={styles.agendaRow}
                    onClick={() =>
                      onNavigate(
                        item.kind === 'wedding'
                          ? `/sluby/${item.id}`
                          : `/sesje/${item.id}`,
                      )
                    }
                  >
                    <span className={styles.timelineTime}>
                      {item.timeLine || '—'}
                    </span>
                    <span className={styles.timelineBody}>
                      <span className={styles.timelineTitle}>
                        {item.displayName}
                      </span>
                      <span className={styles.timelinePlace}>
                        {[
                          item.kind === 'wedding' ? 'Ślub' : 'Sesja',
                          item.locationLine,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <ArrowRight className={styles.choiceArrow} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )

    case 'tasks': {
      const active = response.tasks.filter((t) => !t.completed)
      const done = response.tasks.filter((t) => t.completed)
      const list =
        active.length > 0 ? [...active, ...done] : response.tasks
      return (
        <div className={styles.result}>
          <Eyebrow>Zadania</Eyebrow>
          {list.length === 0 ? (
            <p className={styles.stateHint}>
              {response.emptyMessage ?? ASSISTANT_EMPTY_TASKS}
            </p>
          ) : (
            <ul className={styles.taskList}>
              {list.map((task) => (
                <li key={task.id} className={styles.taskRow}>
                  <span
                    className={styles.taskMark}
                    aria-hidden
                    data-done={task.completed ? 'true' : 'false'}
                  >
                    {task.completed ? '✓' : '○'}
                  </span>
                  <span className={styles.taskBody}>
                    <span
                      className={styles.taskTitle}
                      data-done={task.completed ? 'true' : 'false'}
                    >
                      {task.title}
                    </span>
                    <span className={styles.taskDue}>
                      {task.completed
                        ? 'Zakończone'
                        : taskDueLabel(task.dueDate) || 'Bez terminu'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    }

    case 'next_action':
      return (
        <div className={styles.result}>
          <Eyebrow>Następny krok</Eyebrow>
          <p className={styles.nextActionTitle}>{response.title}</p>
          {response.description ? (
            <p className={styles.resultMeta}>{response.description}</p>
          ) : null}
          {response.navigate ? (
            <div className={styles.resultActions}>
              <LinkCta
                label={response.navigate.label ?? 'Otwórz zlecenie'}
                onClick={() => onNavigate(response.navigate!.path)}
              />
            </div>
          ) : null}
        </div>
      )

    case 'choice':
      return (
        <div className={styles.result}>
          <h3 className={styles.choicePrompt}>{response.prompt}</h3>
          <ul className={styles.choiceList}>
            {response.items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <button
                  type="button"
                  className={styles.choiceButton}
                  onClick={() => onSelectChoice(item.id, item.kind)}
                >
                  <span className={styles.choiceText}>
                    <span className={styles.choiceTitle}>{item.title}</span>
                    {item.subtitle ? (
                      <span className={styles.choiceSub}>
                        {displayDate(item.subtitle) ?? item.subtitle}
                      </span>
                    ) : null}
                    {item.meta ? (
                      <span className={styles.choiceMeta}>{item.meta}</span>
                    ) : null}
                  </span>
                  <ArrowRight className={styles.choiceArrow} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )

    case 'confirmation':
      if (response.action === 'create_wedding') {
        const p = response.prepared
        return (
          <div
            className={styles.confirmCard}
            data-testid="assistant-confirm-wedding"
          >
            <Eyebrow>Nowe zlecenie</Eyebrow>
            <h3 className={styles.resultTitle}>{p.displayLabel}</h3>
            <p className={styles.resultMeta}>{p.dateLabel}</p>
            {p.duplicates.length > 0 ? (
              <div className={styles.warn}>
                Możliwe duplikaty:{' '}
                {p.duplicates
                  .map(
                    (d) =>
                      `${d.displayName}${d.weddingDate ? ` (${d.weddingDate})` : ''}`,
                  )
                  .join(', ')}
              </div>
            ) : null}
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondaryAction}
                disabled={busy}
                onClick={onCancelConfirm}
              >
                {ASSISTANT_CANCEL}
              </button>
              <button
                type="button"
                className={styles.primaryAction}
                disabled={busy}
                onClick={onConfirmCreateWedding}
              >
                {ASSISTANT_CREATE_WEDDING_CTA}
              </button>
            </div>
          </div>
        )
      }
      {
        const p = response.prepared
        return (
          <div
            className={styles.confirmCard}
            data-testid="assistant-confirm-task"
          >
            <Eyebrow>Nowe zadanie</Eyebrow>
            <h3 className={styles.resultTitle}>{p.title}</h3>
            {p.weddingDisplayName ? (
              <p className={styles.resultMeta}>{p.weddingDisplayName}</p>
            ) : null}
            {p.dueDateLabel ? (
              <p className={styles.resultMeta}>Termin: {p.dueDateLabel}</p>
            ) : null}
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondaryAction}
                disabled={busy}
                onClick={onCancelConfirm}
              >
                {ASSISTANT_CANCEL}
              </button>
              <button
                type="button"
                className={styles.primaryAction}
                disabled={busy}
                onClick={onConfirmCreateTask}
              >
                {ASSISTANT_CREATE_TASK_CTA}
              </button>
            </div>
          </div>
        )
      }

    case 'aggregate': {
      // Legacy V1 aggregate presentation — still render if produced
      const showValue =
        response.metric === 'contract_value' ||
        response.metric === 'count_and_value'
      return (
        <div className={styles.result}>
          <Eyebrow>{response.titleLabel}</Eyebrow>
          {showValue && response.totalContractValue != null ? (
            <>
              <p className={styles.heroMoney}>
                {formatCurrency(response.totalContractValue)}
              </p>
              <p className={styles.heroMoneyLabel}>
                łączna wartość zleceń ślubnych
              </p>
              <p className={styles.aggregateCountLine}>
                {response.count} {response.unitLabel}
              </p>
            </>
          ) : (
            <>
              <p className={styles.heroCount}>{response.count}</p>
              <p className={styles.heroMoneyLabel}>{response.unitLabel}</p>
            </>
          )}
          <p className={styles.aggregateRange}>{response.rangeLabel}</p>
          {response.navigate ? (
            <div className={styles.resultActions}>
              <LinkCta
                label={response.navigate.label ?? 'Otwórz'}
                onClick={() => onNavigate(response.navigate!.path)}
              />
            </div>
          ) : null}
        </div>
      )
    }

    case 'scalar':
      return (
        <div className={styles.result}>
          <Eyebrow>{response.titleLabel}</Eyebrow>
          <p className={styles.heroCount}>{response.value}</p>
          <p className={styles.heroMoneyLabel}>{response.unitLabel}</p>
          {response.rangeLabel ? (
            <p className={styles.aggregateRange}>{response.rangeLabel}</p>
          ) : null}
          {response.navigate ? (
            <div className={styles.resultActions}>
              <LinkCta
                label={response.navigate.label ?? 'Otwórz'}
                onClick={() => onNavigate(response.navigate!.path)}
              />
            </div>
          ) : null}
        </div>
      )

    case 'money':
      return (
        <div className={styles.result}>
          <Eyebrow>{response.titleLabel}</Eyebrow>
          <p className={styles.heroMoney}>{formatCurrency(response.value)}</p>
          <p className={styles.heroMoneyLabel}>{response.subtitle}</p>
          {response.count != null && response.unitLabel ? (
            <p className={styles.aggregateCountLine}>
              {response.count} {response.unitLabel}
            </p>
          ) : null}
          {response.rangeLabel ? (
            <p className={styles.aggregateRange}>{response.rangeLabel}</p>
          ) : null}
          {response.navigate ? (
            <div className={styles.resultActions}>
              <LinkCta
                label={response.navigate.label ?? 'Otwórz'}
                onClick={() => onNavigate(response.navigate!.path)}
              />
            </div>
          ) : null}
        </div>
      )

    case 'collection':
      return (
        <div className={styles.result}>
          <Eyebrow>{response.titleLabel}</Eyebrow>
          {response.truncated ? (
            <p className={styles.stateHint}>
              Znalazłem {response.resultCount}{' '}
              {response.resource === 'sessions'
                ? polishCountUnit('sessions', response.resultCount)
                : response.resource === 'assignments'
                  ? polishCountUnit('assignments', response.resultCount)
                  : polishCountUnit('weddings', response.resultCount)}
              . Pokazuję pierwsze {response.shownCount}.
            </p>
          ) : (
            <p className={styles.heroCount}>{response.resultCount}</p>
          )}
          {!response.truncated ? (
            <p className={styles.heroMoneyLabel}>
              {response.resource === 'sessions'
                ? polishCountUnit('sessions', response.resultCount)
                : response.resource === 'assignments'
                  ? polishCountUnit('assignments', response.resultCount)
                  : polishCountUnit('weddings', response.resultCount)}
            </p>
          ) : null}
          {response.rangeLabel ? (
            <p className={styles.aggregateRange}>{response.rangeLabel}</p>
          ) : null}
          <ul className={styles.choiceList}>
            {response.items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <button
                  type="button"
                  className={styles.choiceButton}
                  onClick={() =>
                    onNavigate(
                      item.kind === 'wedding'
                        ? `/sluby/${item.id}`
                        : `/sesje/${item.id}`,
                    )
                  }
                >
                  <span className={styles.choiceText}>
                    <span className={styles.choiceTitle}>{item.displayName}</span>
                    {item.date || item.meta ? (
                      <span className={styles.choiceSub}>
                        {[
                          item.date ? displayDate(item.date) : null,
                          item.meta,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    ) : null}
                  </span>
                  <ArrowRight className={styles.choiceArrow} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {response.navigate ? (
            <div className={styles.resultActions}>
              <LinkCta
                label={response.navigate.label ?? 'Otwórz'}
                onClick={() => onNavigate(response.navigate!.path)}
              />
            </div>
          ) : null}
        </div>
      )

    case 'clarification': {
      const pendingGoal =
        isGoalClarificationHostEnabled() ? getPendingGoalClarification() : null
      if (pendingGoal) {
        const view = toGoalClarificationViewModel(pendingGoal)
        return (
          <AssistantGoalClarification
            view={view}
            busy={busy}
            resolvedLabel={goalClarificationResolvedLabel}
            onSelect={(selectedValue) => onSelectClarification?.(selectedValue)}
          />
        )
      }
      return (
        <div className={styles.result}>
          <p className={styles.choicePrompt}>{response.question}</p>
          <ul className={styles.choiceList}>
            {response.options.map((opt) => (
              <li key={opt.id}>
                <button
                  type="button"
                  className={styles.choiceButton}
                  disabled={busy}
                  onClick={() => onSelectClarification?.(opt.id)}
                >
                  <span className={styles.choiceText}>
                    <span className={styles.choiceTitle}>{opt.label}</span>
                  </span>
                  <ArrowRight className={styles.choiceArrow} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )
    }

    case 'success':
      return (
        <div className={styles.result}>
          <Eyebrow>Gotowe</Eyebrow>
          <h3 className={styles.resultTitle}>{response.title}</h3>
          {response.subtitle ? (
            <p className={styles.resultMeta}>{response.subtitle}</p>
          ) : null}
          {response.navigate ? (
            <div className={styles.resultActions}>
              <LinkCta
                label={response.navigate.label ?? 'Otwórz'}
                onClick={() => onNavigate(response.navigate!.path)}
              />
            </div>
          ) : null}
        </div>
      )

    default: {
      const _exhaustive: never = response
      void _exhaustive
      void ASSISTANT_UNRECOGNIZED
      return null
    }
  }
}
