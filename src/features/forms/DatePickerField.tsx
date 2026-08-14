/**
 * Polish calendar date picker.
 * Desktop: anchored popover + optional manual text entry.
 * Mobile: visualViewport dialog without keyboard (button trigger).
 * Display: dd.MM.yyyy · Storage: yyyy-MM-dd
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { MobileFieldDialog } from '@/components/ui/MobileFieldDialog'
import { ResponsiveFieldOverlay } from '@/components/ui/ResponsiveFieldOverlay'
import { useIsMobileOverlay } from '@/components/ui/useIsMobileOverlay'
import {
  WEEKDAYS_PL,
  MONTHS_PL,
  buildMonthGrid,
  isSameDay,
  isoToPolishDisplay,
  parseFlexibleDate,
  toIsoDate,
  toPolishDisplay,
} from '@/features/forms/datePickerUtils'
import fieldStyles from './QuestionField.module.css'
import styles from './DatePickerField.module.css'

interface DatePickerFieldProps {
  id?: string
  value: string
  onChange: (isoDate: string) => void
  placeholder?: string
  disabled?: boolean
  error?: string
}

/**
 * Desktop calendar footprint — matches Contract half-column density.
 * Caps wide Pre-Wedding question-card anchors without enlarging narrow ones.
 */
const DESKTOP_CALENDAR_MAX_WIDTH = 320

export function DatePickerField({
  id,
  value,
  onChange,
  placeholder = 'dd.mm.rrrr',
  disabled = false,
  error,
}: DatePickerFieldProps) {
  const listId = useId()
  const isMobile = useIsMobileOverlay()
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const portalRef = useRef<HTMLElement | null>(null)
  const parsed = parseFlexibleDate(value)
  const [open, setOpen] = useState(false)
  const [display, setDisplay] = useState(
    parsed ? toPolishDisplay(parsed) : value ? isoToPolishDisplay(value) : '',
  )
  const [localError, setLocalError] = useState<string | null>(null)
  const today = new Date()
  const [viewYear, setViewYear] = useState(
    parsed?.getFullYear() ?? today.getFullYear(),
  )
  const [viewMonth, setViewMonth] = useState(
    parsed?.getMonth() ?? today.getMonth(),
  )
  /** Mobile draft selection — committed only on Wybierz. */
  const [draftDay, setDraftDay] = useState<Date | null>(parsed)

  useEffect(() => {
    const p = parseFlexibleDate(value)
    setDisplay(p ? toPolishDisplay(p) : value ? isoToPolishDisplay(value) : '')
    if (p) {
      setViewYear(p.getFullYear())
      setViewMonth(p.getMonth())
      setDraftDay(p)
    } else {
      setDraftDay(null)
    }
  }, [value])

  useEffect(() => {
    if (!open || isMobile) return
    function onDoc(e: MouseEvent | TouchEvent) {
      const t = e.target as Node
      if (inputRef.current?.contains(t)) return
      if (portalRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
    }
  }, [open, isMobile])

  function commitManual(raw: string) {
    if (!raw.trim()) {
      setLocalError(null)
      onChange('')
      setDisplay('')
      return
    }
    const dt = parseFlexibleDate(raw)
    if (!dt) {
      setLocalError('Podaj datę w formacie dd.mm.rrrr')
      return
    }
    setLocalError(null)
    onChange(toIsoDate(dt))
    setDisplay(toPolishDisplay(dt))
  }

  function selectDayDesktop(day: Date) {
    setLocalError(null)
    onChange(toIsoDate(day))
    setDisplay(toPolishDisplay(day))
    setOpen(false)
  }

  function openMobile() {
    if (disabled) return
    // Ensure keyboard is closed before calendar opens.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    const p = parseFlexibleDate(value)
    setDraftDay(p)
    if (p) {
      setViewYear(p.getFullYear())
      setViewMonth(p.getMonth())
    }
    setOpen(true)
  }

  function cancelMobile() {
    const p = parseFlexibleDate(value)
    setDraftDay(p)
    setOpen(false)
  }

  function confirmMobile() {
    if (!draftDay) {
      setOpen(false)
      return
    }
    setLocalError(null)
    onChange(toIsoDate(draftDay))
    setDisplay(toPolishDisplay(draftDay))
    setOpen(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault()
      setOpen(true)
    }
  }

  const grid = buildMonthGrid(viewYear, viewMonth)
  const years: number[] = []
  for (let y = today.getFullYear() - 5; y <= today.getFullYear() + 15; y += 1) {
    years.push(y)
  }

  const selectedForUi = isMobile ? draftDay : parsed

  const calendarBody = (
    <div
      ref={(node) => {
        portalRef.current = node
      }}
      id={listId}
      className={[styles.popover, isMobile ? styles.popoverDialog : '']
        .filter(Boolean)
        .join(' ')}
      role={isMobile ? undefined : 'dialog'}
      aria-label="Kalendarz"
      data-datepicker="true"
      data-testid="date-picker-popover"
      data-overlay-mode={isMobile ? 'dialog' : 'anchored'}
    >
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.navBtn}
          aria-label="Poprzedni miesiąc"
          onClick={() => {
            if (viewMonth === 0) {
              setViewMonth(11)
              setViewYear((y) => y - 1)
            } else setViewMonth((m) => m - 1)
          }}
        >
          ‹
        </button>
        <div className={styles.monthYear}>
          <span className={styles.monthLabel}>{MONTHS_PL[viewMonth]}</span>
          <select
            className={styles.yearSelect}
            value={viewYear}
            aria-label="Rok"
            data-testid="date-year-select"
            onChange={(e) => setViewYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={styles.navBtn}
          aria-label="Następny miesiąc"
          onClick={() => {
            if (viewMonth === 11) {
              setViewMonth(0)
              setViewYear((y) => y + 1)
            } else setViewMonth((m) => m + 1)
          }}
        >
          ›
        </button>
      </div>

      <div className={styles.weekdays} aria-hidden>
        {WEEKDAYS_PL.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className={styles.grid} role="grid">
        {grid.map((day, i) => {
          if (!day) {
            return <span key={`e-${i}`} className={styles.empty} />
          }
          const selected = selectedForUi
            ? isSameDay(day, selectedForUi)
            : false
          const isToday = isSameDay(day, today)
          return (
            <button
              key={toIsoDate(day)}
              type="button"
              role="gridcell"
              className={[
                styles.day,
                selected ? styles.daySelected : '',
                isToday ? styles.dayToday : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                if (isMobile) setDraftDay(day)
                else selectDayDesktop(day)
              }}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>

      {!isMobile ? (
        <div className={styles.sheetActions}>
          <button
            type="button"
            className={styles.todayBtn}
            onClick={() => selectDayDesktop(today)}
          >
            Dzisiaj
          </button>
        </div>
      ) : null}
    </div>
  )

  return (
    <div className={styles.wrap}>
      {isMobile ? (
        <button
          ref={triggerRef}
          id={id}
          type="button"
          className={[fieldStyles.input, styles.mobileTrigger]
            .filter(Boolean)
            .join(' ')}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={listId}
          data-testid="mobile-date-trigger"
          onClick={openMobile}
        >
          <span className={display ? undefined : styles.placeholder}>
            {display || placeholder}
          </span>
        </button>
      ) : (
        <input
          ref={inputRef}
          id={id}
          className={fieldStyles.input}
          type="text"
          inputMode="numeric"
          placeholder={placeholder}
          value={display}
          disabled={disabled}
          readOnly={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={listId}
          autoComplete="off"
          onChange={(e) => {
            setDisplay(e.target.value)
            setLocalError(null)
          }}
          onBlur={() => commitManual(display)}
          onFocus={() => {
            if (!disabled) setOpen(true)
          }}
          onClick={() => {
            if (!disabled) setOpen(true)
          }}
          onKeyDown={onKeyDown}
        />
      )}
      {(error || localError) && (
        <span className={styles.error}>{error || localError}</span>
      )}

      {!isMobile ? (
        <ResponsiveFieldOverlay
          open={open && !disabled}
          anchorRef={inputRef}
          onClose={() => setOpen(false)}
          maxMenuHeight={420}
          maxMenuWidth={DESKTOP_CALENDAR_MAX_WIDTH}
          scrollBody={false}
        >
          {() => calendarBody}
        </ResponsiveFieldOverlay>
      ) : (
        <MobileFieldDialog
          open={open && !disabled}
          title="Wybierz datę"
          onClose={cancelMobile}
          restoreFocusRef={triggerRef}
          testId="mobile-date-dialog"
          footer={
            <>
              <button
                type="button"
                className={styles.footerCancel}
                data-testid="mobile-date-cancel"
                onClick={cancelMobile}
              >
                Anuluj
              </button>
              <button
                type="button"
                className={styles.footerConfirm}
                data-testid="mobile-date-confirm"
                disabled={!draftDay}
                onClick={confirmMobile}
              >
                Wybierz
              </button>
            </>
          }
        >
          {calendarBody}
        </MobileFieldDialog>
      )}
    </div>
  )
}
