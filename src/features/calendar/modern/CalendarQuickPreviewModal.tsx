import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Backdrop } from '@/components/ui/Backdrop'
import { Button } from '@/components/ui/Button'
import { IconClose } from '@/components/icons'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { useOverlay } from '@/components/ui/overlay/useOverlay'
import {
  formatModernCalendarRemainingValue,
  getModernCalendarPreviewPlaces,
  getModernCalendarPreviewTime,
  getModernCalendarRemaining,
  getModernCalendarTypeSlot,
} from '@/features/calendar/modern/modernCalendarModel'
import {
  formatLedgerFullDate,
  getEditorialDateParts,
} from '@/features/weddings/modern/modernWeddingsModel'
import type { CalendarUiEvent } from '@/features/calendar/utils/calendarEvents'
import styles from './CalendarQuickPreviewModal.module.css'

const CLOSE_MS = 200

interface CalendarQuickPreviewModalProps {
  event: CalendarUiEvent | null
  onClose: () => void
}

export function CalendarQuickPreviewModal({
  event,
  onClose,
}: CalendarQuickPreviewModalProps) {
  const [displayed, setDisplayed] = useState<CalendarUiEvent | null>(event)
  const [closing, setClosing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const kindId = useId()
  const open = Boolean(displayed)

  if (event && (displayed !== event || closing)) {
    setDisplayed(event)
    setClosing(false)
  } else if (!event && displayed && !closing) {
    setClosing(true)
  }

  useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(() => {
      setDisplayed(null)
      setClosing(false)
    }, CLOSE_MS)
    return () => window.clearTimeout(timer)
  }, [closing])

  useOverlay({
    open,
    onClose,
    panelRef,
    initialFocus: 'panel',
  })

  if (!displayed) return null

  const kindLabel = displayed.entityType === 'wedding' ? 'Ślub' : 'Sesja'
  const title =
    displayed.entityType === 'wedding' ? displayed.coupleLabel : displayed.title
  const support = getModernCalendarTypeSlot(displayed)
  const dateParts = getEditorialDateParts(displayed.dateKey)
  const dateLabel = dateParts ? formatLedgerFullDate(dateParts) : displayed.dateKey
  const timeLabel = getModernCalendarPreviewTime(displayed)
  const remaining = getModernCalendarRemaining(displayed.dateKey)
  const places = getModernCalendarPreviewPlaces(displayed)

  return (
    <ModalPortal>
      <div
        className={styles.root}
        role="presentation"
        data-closing={closing ? 'true' : 'false'}
        data-testid="modern-calendar-preview"
      >
        <Backdrop onClick={onClose} />
        <div
          ref={panelRef}
          className={styles.panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${kindId} ${titleId}`}
          tabIndex={-1}
        >
          <button
            type="button"
            className={styles.close}
            aria-label="Zamknij"
            onClick={onClose}
          >
            <IconClose width={18} height={18} />
          </button>

          <div className={styles.body}>
            <p id={kindId} className={styles.eyebrow}>
              {kindLabel}
            </p>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {support ? <p className={styles.support}>{support}</p> : null}

            <div className={styles.facts}>
              <div className={styles.fact}>
                <p className={styles.label}>Data</p>
                <p className={styles.value}>{dateLabel}</p>
              </div>

              {timeLabel ? (
                <div className={styles.fact}>
                  <p className={styles.label}>Godzina</p>
                  <p className={styles.value}>{timeLabel}</p>
                </div>
              ) : null}

              {remaining?.kind === 'today' ? (
                <div className={styles.fact}>
                  <p className={styles.label}>Dzisiaj</p>
                </div>
              ) : remaining?.kind === 'future' ? (
                <div className={styles.fact}>
                  <p className={styles.label}>Pozostało</p>
                  <p className={styles.value}>
                    {formatModernCalendarRemainingValue(remaining.days)}
                  </p>
                </div>
              ) : null}

              {places.reception ? (
                <div className={styles.fact}>
                  <p className={styles.label}>Przyjęcie</p>
                  <p className={styles.value}>{places.reception}</p>
                </div>
              ) : null}

              {places.session ? (
                <div className={styles.fact}>
                  <p className={styles.label}>Lokalizacja</p>
                  <p className={styles.value}>{places.session}</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className={styles.footer}>
            <Link to={displayed.href}>
              <Button type="button" variant="primary">
                Otwórz zlecenie
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
