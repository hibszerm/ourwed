import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, Upload } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import {
  useDocumentTemplateMutations,
  useDocumentTemplates,
} from '@/features/documents/hooks/useDocumentTemplates'
import {
  TemplateDefaultBadge,
  TemplateStatusBadge,
} from '@/features/documents/components/TemplateStatusBadge'
import {
  TemplateFiltersBar,
  UploadTemplateModal,
} from '@/features/documents/components/TemplateModals'
import {
  formatTemplateDate,
  getCategoryMeta,
  type TemplateSortKey,
} from '@/features/documents/templateMeta'
import type { DocumentTemplateSummary } from '@/types/documents'
import styles from '@/features/documents/DocumentsTemplates.module.css'

function sortTemplates(
  items: DocumentTemplateSummary[],
  sort: TemplateSortKey,
): DocumentTemplateSummary[] {
  const next = [...items]
  switch (sort) {
    case 'newest':
      return next.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    case 'oldest':
      return next.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
    case 'alpha':
      return next.sort((a, b) => a.name.localeCompare(b.name, 'pl'))
    case 'updated':
    default:
      return next.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
  }
}

export function DocumentTemplatesPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { data: templates = [], isLoading, isError } = useDocumentTemplates()
  const { upload } = useDocumentTemplateMutations()

  const [uploadOpen, setUploadOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState<TemplateSortKey>('updated')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = templates.filter((t) => {
      if (category !== 'all' && t.docType !== category) return false
      if (status !== 'all' && t.status !== status) return false
      if (!q) return true
      return (
        t.name.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q)
      )
    })
    return sortTemplates(list, sort)
  }, [templates, search, category, status, sort])

  async function handleUpload(input: {
    name: string
    description: string
    docType: DocumentTemplateSummary['docType']
    file: File
    setAsDefault: boolean
  }) {
    const created = await upload.mutateAsync({
      name: input.name,
      description: input.description || null,
      docType: input.docType,
      file: input.file,
      setAsDefault: input.setAsDefault,
    })
    showToast('Szablon został przesłany.', 'success')
    setUploadOpen(false)
    navigate(`/ustawienia/dokumenty/szablony/${created.id}`)
  }

  return (
    <AppLayout
      title="Szablony dokumentów"
      subtitle="Biblioteka umów i dokumentów prawnych"
      action={
        <Button
          type="button"
          variant="primary"
          onClick={() => setUploadOpen(true)}
        >
          <Upload size={16} style={{ marginRight: 6 }} aria-hidden />
          Dodaj szablon
        </Button>
      }
    >
      <PageContainer width="wide">
        <div className={styles.page}>
          <nav className={styles.breadcrumb} aria-label="Okruszki">
            <Link to="/ustawienia">Ustawienia</Link>
            <span className={styles.sep}>/</span>
            <Link to="/ustawienia/dokumenty">Dokumenty</Link>
            <span className={styles.sep}>/</span>
            <span>Szablony</span>
          </nav>

          {isLoading ? (
            <p className={styles.fileHint}>Ładowanie biblioteki…</p>
          ) : isError ? (
            <EmptyState
              title="Nie udało się załadować biblioteki"
              description="Sprawdź połączenie i spróbuj ponownie."
            />
          ) : templates.length === 0 ? (
            <EmptyState
              icon={<FileText size={36} strokeWidth={1.5} />}
              title="Brak szablonów dokumentów"
              description="Dodaj pierwszą umowę DOCX, aby zbudować bibliotekę dokumentów studia."
              action={
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setUploadOpen(true)}
                >
                  Dodaj szablon
                </Button>
              }
            />
          ) : (
            <>
              <TemplateFiltersBar
                search={search}
                category={category}
                status={status}
                sort={sort}
                onSearchChange={setSearch}
                onCategoryChange={setCategory}
                onStatusChange={setStatus}
                onSortChange={setSort}
              />

              {filtered.length === 0 ? (
                <EmptyState
                  title="Nic nie pasuje do filtrów"
                  description="Zmień kategorię, status lub wyszukiwanie."
                />
              ) : (
                <>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Szablon</th>
                          <th>Kategoria</th>
                          <th>Wersja</th>
                          <th>Status</th>
                          <th>Aktualizacja</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((t) => {
                          const cat = getCategoryMeta(t.docType)
                          const Icon = cat.icon
                          return (
                            <tr
                              key={t.id}
                              className={styles.tableRow}
                              onClick={() =>
                                navigate(
                                  `/ustawienia/dokumenty/szablony/${t.id}`,
                                )
                              }
                            >
                              <td>
                                <div className={styles.nameCell}>
                                  <span className={styles.iconWrapSm}>
                                    <Icon size={18} strokeWidth={1.75} />
                                  </span>
                                  <div>
                                    <p className={styles.nameCellTitle}>
                                      {t.name}
                                    </p>
                                    {t.isDefault && (
                                      <div style={{ marginTop: 4 }}>
                                        <TemplateDefaultBadge />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td>{cat.label}</td>
                              <td>
                                {t.currentVersionNumber
                                  ? `v${t.currentVersionNumber}`
                                  : '—'}
                              </td>
                              <td>
                                <TemplateStatusBadge status={t.status} />
                              </td>
                              <td>{formatTemplateDate(t.updatedAt)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className={styles.cards}>
                    {filtered.map((t) => {
                      const cat = getCategoryMeta(t.docType)
                      const Icon = cat.icon
                      return (
                        <Link
                          key={t.id}
                          to={`/ustawienia/dokumenty/szablony/${t.id}`}
                          className={styles.card}
                        >
                          <div className={styles.cardTop}>
                            <span className={styles.iconWrap}>
                              <Icon size={22} strokeWidth={1.75} />
                            </span>
                            <div className={styles.cardBody}>
                              <div className={styles.cardTitleRow}>
                                <h2 className={styles.cardTitle}>{t.name}</h2>
                                <TemplateStatusBadge status={t.status} />
                                {t.isDefault && <TemplateDefaultBadge />}
                              </div>
                              <p className={styles.meta}>
                                <span>{cat.label}</span>
                                <span>
                                  {t.currentVersionNumber
                                    ? `Wersja v${t.currentVersionNumber}`
                                    : 'Bez wersji'}
                                </span>
                                <span>{formatTemplateDate(t.updatedAt)}</span>
                              </p>
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </PageContainer>

      <UploadTemplateModal
        open={uploadOpen}
        busy={upload.isPending}
        error={
          upload.error instanceof Error ? upload.error.message : null
        }
        onClose={() => setUploadOpen(false)}
        onSubmit={handleUpload}
      />
    </AppLayout>
  )
}
