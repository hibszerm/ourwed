import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { ModernWeddingsWorkspace } from '@/features/weddings/modern/ModernWeddingsWorkspace'
import type { WorkspaceWeddingDisplayItem, WorkspaceScopeFilter } from '@/features/weddings/modern/workspaceWeddings'
import type { WeddingsViewMode } from '@/features/weddings/presentation/weddingsViewMode'
import type { Wedding } from '@/types/wedding'
import styles from '@/pages/WeddingsModernPage.module.css'

function ownedWedding(
  id: string,
  date: string,
  partner1: string,
  partner2: string,
): Wedding {
  return {
    id,
    date,
    status: 'active',
    workflowStage: 'contract',
    couple: { partner1, partner2, email: '', phone: '', venue: '', city: '' },
    packageName: 'Studio Full Day',
    price: 24500,
    primaryLocation: {
      venueName: 'Villa Love', locality: 'Kraków',
      displayText: 'Villa Love, Kraków', source: 'reception',
    },
    packageItems: [], checklist: [], schedule: [], payments: [], finances: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' }, notes: [], deliverables: [], timeline: [],
    accentColor: '#345', createdAt: '2026-01-01T00:00:00.000Z',
  }
}

const fixtureRows: WorkspaceWeddingDisplayItem[] = [
  { ownershipKind: 'owned', id: 'fixture-owned-a', date: '2026-05-14', wedding: ownedWedding('fixture-owned-a', '2026-05-14', 'Anna Kowalska', 'Jan Nowak') },
  { ownershipKind: 'shared', id: '09270d9d-b8c0-4944-9e3b-b382a8875dbd', date: '2027-06-21', coupleFirstName: 'QA Final A', coupleSecondName: 'Collaboration Test', ownerDisplayName: 'QA Final A Studio', ownerCanonicalDisplayName: 'Joanna Testowa i Maciej Testowy', effectiveDisplayName: 'Joanna Testowa i Maciej Testowy', hasPersonalDisplayNameOverride: false },
  { ownershipKind: 'owned', id: 'fixture-owned-b', date: '2026-11-03', wedding: ownedWedding('fixture-owned-b', '2026-11-03', 'Kasia Wiśniewska', 'Tomasz Krawczyk') },
  { ownershipKind: 'owned', id: 'fixture-owned-c', date: '2027-08-18', wedding: ownedWedding('fixture-owned-c', '2027-08-18', 'Ola Nowak', 'Marek Nowak') },
]

export function WeddingsH2VisualFixture() {
  const [scope, setScope] = useState<WorkspaceScopeFilter>('all')
  const [viewMode, setViewMode] = useState<WeddingsViewMode>('grid')

  return (
    <PageContainer width="wide">
      <div className={styles.page} data-testid="weddings-h2-visual-fixture">
        <header className={styles.header}>
          <h1 className={styles.title}>Śluby</h1>
          <div className={styles.actions}>
            <Button variant="secondary">Importuj z pliku</Button>
            <Button variant="primary">Nowy ślub</Button>
          </div>
        </header>
        <ModernWeddingsWorkspace
          weddings={fixtureRows}
          scope={scope}
          onScopeChange={setScope}
          viewMode={viewMode}
          onViewChange={setViewMode}
        />
      </div>
    </PageContainer>
  )
}
