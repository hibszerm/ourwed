import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { GenerateQuestionnaireModal } from '@/features/questionnaires/GenerateQuestionnaireModal'
import {
  matchesQuestionnaireSearch,
  QUESTIONNAIRE_STATUS_FILTERS,
  QUESTIONNAIRE_STATUS_LABELS,
  questionnaireService,
  questionnaireStatusVariant,
  type QuestionnaireStatusFilter,
} from '@/lib/api/questionnaireService'
import { formatShortDate } from '@/lib/utils/dates'
import styles from '@/features/questionnaires/Questionnaires.module.css'

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value.slice(0, 16).replace('T', ' ')
  return d.toLocaleString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function QuestionnairesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const [generateOpen, setGenerateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] =
    useState<QuestionnaireStatusFilter>('all')

  const { data = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['questionnaires', userId],
    queryFn: () => questionnaireService.list(),
    enabled: Boolean(userId),
  })

  const filtered = useMemo(() => {
    return data.filter((item) => {
      if (statusFilter !== 'all' && item.instance.status !== statusFilter) {
        return false
      }
      return matchesQuestionnaireSearch(item, search)
    })
  }, [data, search, statusFilter])

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url)
  }

  async function handleRevoke(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await questionnaireService.revoke(id)
      await queryClient.invalidateQueries({ queryKey: ['questionnaires'] })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Nie udało się unieważnić.')
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm('Usunąć ankietę i jej historię?')) return
    try {
      await questionnaireService.delete(id)
      await queryClient.invalidateQueries({ queryKey: ['questionnaires'] })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Nie udało się usunąć.')
    }
  }

  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all'

  return (
    <AppLayout
      title="Ankiety"
      subtitle={
        isLoading
          ? 'Ładowanie…'
          : hasActiveFilters
            ? `${filtered.length} z ${data.length}`
            : `${data.length} ${data.length === 1 ? 'ankieta' : 'ankiet'}`
      }
      action={
        <Button type="button" variant="primary" onClick={() => setGenerateOpen(true)}>
          Wygeneruj ankietę
        </Button>
      }
    >
      <PageContainer width="full">
        {!isLoading && !isError && data.length > 0 ? (
          <div className={styles.toolbar}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Szukaj: pani młoda, pan młody, e-mail, telefon, data…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Szukaj ankiet"
            />
            <div className={styles.filters} role="group" aria-label="Filtr statusu">
              {QUESTIONNAIRE_STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={
                    statusFilter === filter.id
                      ? styles.filterActive
                      : styles.filterChip
                  }
                  onClick={() => setStatusFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className={styles.loading}>Ładowanie ankiet…</div>
        ) : isError ? (
          <EmptyState
            title="Nie udało się załadować ankiet"
            description={
              error instanceof Error ? error.message : 'Spróbuj ponownie.'
            }
          />
        ) : data.length === 0 ? (
          <EmptyState
            title="Brak ankiet"
            description="Wygeneruj pierwszą ankietę i wyślij link do pary."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Brak wyników"
            description="Zmień wyszukiwanie lub filtr statusu."
          />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Typ</th>
                  <th>Utworzono</th>
                  <th>Otwarto</th>
                  <th>Wysłano</th>
                  <th>Wygaśnięcie</th>
                  <th>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ instance, formName, formUrl, search: fields }) => (
                  <tr
                    key={instance.id}
                    onClick={() => navigate(`/ankiety/${instance.id}`)}
                  >
                    <td>
                      <Badge variant={questionnaireStatusVariant(instance.status)}>
                        {QUESTIONNAIRE_STATUS_LABELS[instance.status]}
                      </Badge>
                    </td>
                    <td>
                      <p className={styles.name}>{formName}</p>
                      {(fields.bride || fields.groom) && (
                        <p className={styles.muted}>
                          {[fields.bride, fields.groom].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {!fields.bride && !fields.groom && (
                        <p className={styles.muted}>
                          {instance.weddingId
                            ? 'Przypisana do ślubu'
                            : 'Lead / przed ślubem'}
                        </p>
                      )}
                    </td>
                    <td>{formatShortDate(instance.createdAt.slice(0, 10))}</td>
                    <td>{formatDateTime(instance.openedAt)}</td>
                    <td>{formatDateTime(instance.submittedAt)}</td>
                    <td>
                      {instance.expiresAt
                        ? formatShortDate(instance.expiresAt.slice(0, 10))
                        : 'Bezterminowo'}
                    </td>
                    <td>
                      <div className={styles.actions}>
                        {(instance.status === 'pending' ||
                          instance.status === 'opened') && (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                void copyLink(formUrl)
                              }}
                            >
                              Kopiuj
                            </Button>
                            <a
                              href={formUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button type="button" variant="ghost" size="sm">
                                Otwórz
                              </Button>
                            </a>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(e) => void handleRevoke(instance.id, e)}
                            >
                              Unieważnij
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(e) => void handleDelete(instance.id, e)}
                            >
                              Usuń
                            </Button>
                          </>
                        )}
                        {instance.status === 'submitted' && (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/ankiety/${instance.id}`)
                              }}
                            >
                              Odpowiedzi
                            </Button>
                            {!instance.weddingId && (
                              <Link
                                to="/oczekujace"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button type="button" variant="secondary" size="sm">
                                  Utwórz ślub
                                </Button>
                              </Link>
                            )}
                          </>
                        )}
                        {instance.status === 'approved' && instance.weddingId && (
                          <Link
                            to={`/sluby/${instance.weddingId}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button type="button" variant="secondary" size="sm">
                              Otwórz ślub
                            </Button>
                          </Link>
                        )}
                        {instance.status === 'rejected' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={async (e) => {
                              e.stopPropagation()
                              await questionnaireService.archive(instance.id)
                              await queryClient.invalidateQueries({
                                queryKey: ['questionnaires'],
                              })
                            }}
                          >
                            Archiwizuj
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isError ? (
          <div style={{ marginTop: 16 }}>
            <Button type="button" variant="secondary" onClick={() => void refetch()}>
              Spróbuj ponownie
            </Button>
          </div>
        ) : null}
      </PageContainer>

      <GenerateQuestionnaireModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={() => {
          void queryClient.invalidateQueries({ queryKey: ['questionnaires'] })
        }}
      />
    </AppLayout>
  )
}
