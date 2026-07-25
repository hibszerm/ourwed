import { useNavigate } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import styles from '../../MappingWizard.module.css'

/**
 * @deprecated Save step no longer creates questionnaire templates.
 * Contract import saves document templates only via SimpleContractImportFlow.
 */
export function SaveStep({ templateId }: { templateId: string }) {
  const navigate = useNavigate()

  return (
    <section className={styles.stepPanel} aria-labelledby="save-success-title">
      <div className={styles.saveHero}>
        <CheckCircle2 size={28} strokeWidth={1.5} aria-hidden />
        <h2 id="save-success-title" className={styles.stepTitle}>
          Analiza zakończona
        </h2>
        <p className={styles.stepBody}>
          Ankieta do umowy jest konfigurowana osobno w module Ankiety. Ten
          kreator nie tworzy już typów ankiet.
        </p>
      </div>

      <div className={styles.stepActions}>
        <Button
          type="button"
          variant="primary"
          onClick={() => navigate('/ankiety/dane-do-umowy')}
        >
          Przejdź do ankiety do umowy
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            navigate(`/ustawienia/dokumenty/szablony/${templateId}`)
          }
        >
          Wróć do szablonu umowy
        </Button>
      </div>
    </section>
  )
}
