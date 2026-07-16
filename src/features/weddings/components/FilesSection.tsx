import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import styles from './FilesSection.module.css'

export function FilesSection() {
  return (
    <Card>
      <CardHeader title="Pliki" subtitle="Materiały i dostawy" />
      <div className={styles.body}>
        <EmptyState
          title="Brak przesłanych plików"
          description="Tutaj pojawią się galerie, filmy i inne materiały po dostarczeniu."
        />
      </div>
    </Card>
  )
}
