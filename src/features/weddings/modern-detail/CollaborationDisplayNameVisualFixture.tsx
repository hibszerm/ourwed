import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { ModernWeddingDetailHeader } from '@/features/weddings/modern-detail/ModernWeddingDetailHeader'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import type { Wedding } from '@/types/wedding'
import styles from './CollaborationDisplayNameVisualFixture.module.css'

type FixtureMode = 'owner' | 'synced' | 'personal' | 'restored'

const FIXTURE_WEDDING_ID = '09270d9d-b8c0-4944-9e3b-b382a8875dbd'
const INITIAL_OWNER_NAME = 'Joanna Testowa i Maciej Testowy'
const INITIAL_PERSONAL_NAME = 'Joanna + Maciej / mój montaż'

function makeWedding(displayName: string): Wedding {
  return {
    id: FIXTURE_WEDDING_ID,
    date: '2027-06-21',
    status: 'active',
    workflowStage: 'contract',
    couple: { partner1: 'QA Final A', partner2: 'Collaboration Test', email: '', phone: '', venue: 'Villa Love', city: 'Kraków' },
    displayName,
    packageName: 'Studio Full Day',
    price: 0,
    packageItems: [], checklist: [], schedule: [], payments: [], finances: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' }, notes: [], deliverables: [], timeline: [],
    accentColor: '#345', createdAt: '2026-01-01T00:00:00.000Z',
  }
}

const fixtureModes: Array<{ id: FixtureMode; label: string }> = [
  { id: 'owner', label: 'A · Właściciel' },
  { id: 'synced', label: 'B · Współpracownik — nazwa właściciela' },
  { id: 'personal', label: 'C · Współpracownik — własna nazwa' },
  { id: 'restored', label: 'D · Po przywróceniu' },
]

/** Synthetic-only local fixture for owner/collaborator rename visual review. */
export function CollaborationDisplayNameVisualFixture() {
  const [mode, setMode] = useState<FixtureMode>('owner')
  const [ownerName, setOwnerName] = useState(INITIAL_OWNER_NAME)
  const [personalName, setPersonalName] = useState(INITIAL_PERSONAL_NAME)
  const [hasPersonalName, setHasPersonalName] = useState(false)
  const sharedName = hasPersonalName ? personalName : ownerName
  const isShared = mode !== 'owner'
  const ownerWedding = makeWedding(ownerName)
  const sharedWedding = makeWedding(sharedName)

  function selectMode(next: FixtureMode) {
    if (next === 'personal') setHasPersonalName(true)
    if (next === 'synced' || next === 'restored') setHasPersonalName(false)
    setMode(next)
  }

  async function saveOwnerName(wedding: Wedding): Promise<Wedding> {
    const canonicalName = wedding.displayName?.trim()
      || getWeddingDisplayName({ couple: wedding.couple, displayName: null })
    setOwnerName(canonicalName)
    return { ...wedding, displayName: canonicalName }
  }

  async function savePersonalName(name: string): Promise<string> {
    setPersonalName(name)
    setHasPersonalName(true)
    return name
  }

  async function restoreOwnerName(): Promise<string> {
    setHasPersonalName(false)
    setMode('restored')
    return ownerName
  }

  return (
    <PageContainer width="wide">
      <main className={styles.page} data-testid="collaboration-display-name-fixture">
        <header className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Lokalny podgląd · dane syntetyczne</p>
            <h1>Nazwa zlecenia</h1>
            <p>Ten ekran nie zapisuje danych w Supabase.</p>
          </div>
          <nav className={styles.modeSwitch} aria-label="Stan podglądu">
            {fixtureModes.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={mode === item.id ? 'primary' : 'secondary'}
                aria-pressed={mode === item.id}
                onClick={() => selectMode(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </nav>
        </header>

        <div className={styles.columns}>
          <section className={styles.panel} aria-labelledby="fixture-owner-heading">
            <h2 id="fixture-owner-heading">Właściciel</h2>
            <ModernWeddingDetailHeader
              wedding={ownerWedding}
              places={[]}
              onWeddingUpdated={(updated) => setOwnerName(updated.displayName || INITIAL_OWNER_NAME)}
              onOwnerSave={saveOwnerName}
              enableBriefAction={false}
              requireProForOwnerEdit={false}
            />
            <p className={styles.note}>Zapis właściciela zmienia wyłącznie stan tego podglądu.</p>
          </section>

          <section className={styles.panel} aria-labelledby="fixture-shared-heading">
            <h2 id="fixture-shared-heading">Współpracownik</h2>
            <ModernWeddingDetailHeader
              wedding={sharedWedding}
              places={[]}
              mode="shared"
              ownerCanonicalDisplayName={ownerName}
              hasPersonalDisplayNameOverride={hasPersonalName}
              onWeddingUpdated={() => undefined}
              onSaveSharedDisplayName={savePersonalName}
              onRestoreOwnerDisplayName={restoreOwnerName}
              enableBriefAction={false}
            />
            <p className={styles.note}>
              Stan: {isShared ? hasPersonalName ? 'własna nazwa' : 'nazwa właściciela' : 'porównanie z właścicielem'}
              {' · '}{mode === 'restored' ? 'po przywróceniu synchronizacji' : 'bez połączenia z bazą'}
            </p>
          </section>
        </div>
      </main>
    </PageContainer>
  )
}
