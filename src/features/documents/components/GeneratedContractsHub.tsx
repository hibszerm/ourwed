import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { GeneratedWeddingContractService } from '@/features/documents/template'
import { useWeddings } from '@/features/weddings/hooks/useWeddings'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import type { DocumentTemplateSummary } from '@/types/documents'
import styles from '@/features/documents/DocumentsTemplates.module.css'

export function GeneratedContractsHub({
  templates,
}: {
  templates: DocumentTemplateSummary[]
}) {
  const { data: weddings = [] } = useWeddings()
  const { data: contracts = [], isLoading, isError } = useQuery({
    queryKey: ['generated-wedding-contracts', 'studio'],
    queryFn: () => GeneratedWeddingContractService.listAllForStudio(),
  })
  const [search, setSearch] = useState('')
  const [templateId, setTemplateId] = useState('all')
  const [period, setPeriod] = useState<'all' | 'upcoming' | 'past'>('all')
  const weddingById = useMemo(
    () => new Map(weddings.map((item) => [item.id, item])),
    [weddings],
  )
  const templateById = useMemo(
    () => new Map(templates.map((item) => [item.id, item])),
    [templates],
  )
  const today = new Date().toISOString().slice(0, 10)

  const visible = useMemo(
    () =>
      contracts.filter((contract) => {
        const wedding = weddingById.get(contract.weddingId)
        const couple = wedding
          ? getWeddingDisplayName(wedding).toLocaleLowerCase('pl-PL')
          : ''
        if (search.trim() && !couple.includes(search.trim().toLocaleLowerCase('pl-PL'))) {
          return false
        }
        if (templateId !== 'all' && contract.templateId !== templateId) return false
        if (period === 'upcoming' && (!wedding?.date || wedding.date < today)) return false
        if (period === 'past' && (!wedding?.date || wedding.date >= today)) return false
        return true
      }),
    [contracts, period, search, templateId, today, weddingById],
  )

  if (isLoading) return <p className={styles.quietHint}>Ładowanie umów…</p>
  if (isError) {
    return (
      <EmptyState
        title="Nie udało się wczytać umów"
        description="Sprawdź połączenie i spróbuj ponownie."
      />
    )
  }

  return (
    <section className={styles.generatedSection} aria-labelledby="generated-title">
      <div>
        <h2 id="generated-title" className={styles.sectionHeading}>
          Wygenerowane umowy
        </h2>
        <p className={styles.quietHint}>
          Wyłącznie dokumenty, których artefakt został poprawnie zapisany.
        </p>
      </div>
      <div className={styles.generatedFilters}>
        <label>
          <span className={styles.srOnly}>Szukaj pary</span>
          <input
            type="search"
            value={search}
            placeholder="Szukaj pary…"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          aria-label="Filtruj według szablonu"
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
        >
          <option value="all">Wszystkie szablony</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtruj według terminu ślubu"
          value={period}
          onChange={(event) =>
            setPeriod(event.target.value as 'all' | 'upcoming' | 'past')
          }
        >
          <option value="all">Wszystkie terminy</option>
          <option value="upcoming">Nadchodzące</option>
          <option value="past">Minione</option>
        </select>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          icon={<FileText size={24} aria-hidden />}
          title={contracts.length ? 'Brak wyników' : 'Nie ma jeszcze wygenerowanych umów'}
          description={
            contracts.length
              ? 'Zmień wyszukiwanie lub filtry.'
              : 'Dokument pojawi się po zapisaniu go z poziomu ślubu.'
          }
        />
      ) : (
        <div className={styles.generatedGrid}>
          {visible.map((contract) => {
            const wedding = weddingById.get(contract.weddingId)
            const template = templateById.get(contract.templateId)
            return (
              <Link
                key={contract.draft.id}
                className={styles.generatedCard}
                to={`/sluby/${contract.weddingId}/umowy/${contract.draft.id}`}
              >
                <div className={styles.generatedCardTop}>
                  <h3>{contract.draft.title}</h3>
                  <span>Gotowa</span>
                </div>
                <p>
                  {wedding ? getWeddingDisplayName(wedding) : 'Ślub'}
                </p>
                <dl>
                  <div>
                    <dt>Szablon</dt>
                    <dd>{template?.name ?? 'Szablon archiwalny'}</dd>
                  </div>
                  <div>
                    <dt>Data ślubu</dt>
                    <dd>{wedding?.date ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Wersja</dt>
                    <dd>v{contract.generationVersion ?? 1}</dd>
                  </div>
                  <div>
                    <dt>Formaty</dt>
                    <dd>
                      {[...new Set(contract.artifacts.map((item) => item.format))]
                        .map((item) => item.toUpperCase())
                        .join(', ')}
                    </dd>
                  </div>
                </dl>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
