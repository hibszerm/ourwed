import { BookOpen, Lightbulb, ListChecks } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { IconCompass } from '@/components/icons'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import styles from './GuideDiscoveryModal.module.css'

type GuideDiscoveryModalProps = {
  open: boolean
  onOpenGuide: () => void
  onDismiss: () => void
}

const BENEFITS = [
  {
    icon: BookOpen,
    label: 'Poznasz najważniejsze funkcje',
  },
  {
    icon: ListChecks,
    label: 'Przejdziesz krok po kroku przez konfigurację',
  },
  {
    icon: Lightbulb,
    label: 'Otrzymasz praktyczne wskazówki',
  },
] as const

/**
 * One-time Guide discovery — not the Phase 1 “Jak działa OurWed” story.
 */
export function GuideDiscoveryModal({
  open,
  onOpenGuide,
  onDismiss,
}: GuideDiscoveryModalProps) {
  const navigate = useNavigate()

  function handleOpen() {
    onOpenGuide()
    navigate('/przewodnik')
  }

  return (
    <Modal
      open={open}
      title="Poznaj Przewodnik"
      onClose={onDismiss}
      onCancel={onDismiss}
      cancelLabel="Może później"
      showClose
      size="md"
      mobilePresentation="center"
      initialFocus="panel"
      entrance="settle"
      panelClassName={styles.discoveryPanel}
      primaryAction={
        <Button type="button" variant="primary" onClick={handleOpen}>
          Otwórz Przewodnik
        </Button>
      }
    >
      <div className={styles.body} data-testid="guide-discovery-modal">
        <div className={styles.intro}>
          <span className={styles.mark} aria-hidden="true">
            <IconCompass width={22} height={22} />
          </span>
          <p className={styles.lede}>
            Zacznij od Przewodnika, który pomoże Ci poznać OurWed i krok po kroku
            przygotować system do codziennej pracy.
          </p>
        </div>

        <ul className={styles.benefits}>
          {BENEFITS.map(({ icon: Icon, label }) => (
            <li key={label} className={styles.benefitRow}>
              <span className={styles.benefitIcon} aria-hidden="true">
                <Icon size={16} strokeWidth={1.75} />
              </span>
              <span className={styles.benefitLabel}>{label}</span>
            </li>
          ))}
        </ul>

        <p className={styles.support}>
          Znajdziesz tam najważniejsze ustawienia, funkcje i wskazówki potrzebne
          do pełnej konfiguracji.
        </p>
      </div>
    </Modal>
  )
}
