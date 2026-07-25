import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { ResponsiveFieldOverlay } from '@/components/ui/ResponsiveFieldOverlay'
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
 * Polish calendar date picker.
 * Desktop: anchored portalled popover.
 * Mobile: visualViewport bottom sheet.
 * Display: dd.MM.yyyy · Storage: yyyy-MM-dd
 */
export function DatePickerField({
  id,
  value,
  onChange,
  placeholder = 'dd.mm.rrrr',
  disabled = false,
  error,
}: DatePickerFieldProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
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

  useEffect(() => {
    const p = parseFlexibleDate(value)
    setDisplay(p ? toPolishDisplay(p) : value ? isoToPolishDisplay(value) : '')
    if (p) {
      setViewYear(p.getFullYear())
      setViewMonth(p.getMonth())
    }
  }, [value])

  useEffect(() => {
    if (!open) return
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
  }, [open])

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

  function selectDay(day: Date) {
    setLocalError(null)
    onChange(toIsoDate(day))
    setDisplay(toPolishDisplay(day))
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

  return (
    <div className={styles.wrap}>
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
      {(error || localError) && (
        <span className={styles.error}>{error || localError}</span>
      )}

      <ResponsiveFieldOverlay
        open={open && !disabled}
        anchorRef={inputRef}
        sheetTitle="Wybierz datę"
        onClose={() => setOpen(false)}
        maxMenuHeight={340}
        sheetFraction={0.52}
      >
        {(placement) => (
          <div
            ref={(node) => {
              portalRef.current = node
            }}
            id={listId}
            className={[
              styles.popover,
              placement.mode === 'sheet' ? styles.popoverSheet : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="dialog"
            aria-label="Kalendarz"
            data-datepicker="true"
            data-testid="date-picker-popover"
            data-overlay-mode={placement.mode}
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
                <span className={styles.monthLabel}>
                  {MONTHS_PL[viewMonth]}
                </span>
                <select
                  className={styles.yearSelect}
                  value={viewYear}
                  aria-label="Rok"
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
                const selected = parsed ? isSameDay(day, parsed) : false
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
                    onClick={() => selectDay(day)}
                  >
                    {day.getDate()}
                  </button>
                )
              })}
            </div>

            <div className={styles.sheetActions}>
              <button
                type="button"
                className={styles.todayBtn}
                onClick={() => selectDay(today)}
              >
                Dzisiaj
              </button>
              {placement.mode === 'sheet' ? (
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setOpen(false)}
                >
                  Anuluj
                </button>
              ) : null}
            </div>
          </div>
        )}
      </ResponsiveFieldOverlay>
    </div>
  )
}
