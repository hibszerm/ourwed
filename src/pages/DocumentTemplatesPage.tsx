import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, MoreHorizontal, Upload } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import {
  useDocumentTemplateMutations,
  useDocumentTemplates,
} from '@/features/documents/hooks/useDocumentTemplates'
import { DeleteContractModal } from '@/features/documents/components/DeleteContractModal'
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

function ContractOverflowMenu({
  onDelete,
}: {
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className={styles.overflowMenu} ref={menuRef}>
      <button
        type="button"
        className={styles.cardMenuBtn}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <MoreHorizontal size={18} aria-label="Więcej działań" />
      </button>
      {open ? (
        <div id={menuId} className={styles.overflowPanel} role="menu">
          <button
            type="button"
            role="menuitem"
            className={`${styles.overflowItem} ${styles.overflowItemDanger}`}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
              onDelete()
            }}
          >
            Usuń kontrakt
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function DocumentTemplatesPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { data: templates = [], isLoading, isError } = useDocumentTemplates()
  const { upload, remove } = useDocumentTemplateMutations()

  const [uploadOpen, setUploadOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState<TemplateSortKey>('updated')
  const [deleteTarget, setDeleteTarget] =
    useState<DocumentTemplateSummary | null>(null)

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
    navigate(`/ustawienia/dokumenty/szablony/${created.id}/konfiguracja`)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await remove.mutateAsync(deleteTarget.id)
      showToast('Kontrakt usunięty.', 'success')
      setDeleteTarget(null)
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się usunąć.',
        'error',
      )
    }
  }

  return (
    <AppLayout
      title="Szablony dokumentów"
      subtitle="Prześlij kontrakt — AI przygotuje ankietę"
      action={
        templates.length > 0 ? (
          <Button
            type="button"
            variant="primary"
            onClick={() => setUploadOpen(true)}
          >
            <Upload size={16} style={{ marginRight: 6 }} aria-hidden />
            Prześlij kontrakt
          </Button>
        ) : undefined
      }
    >
      <PageContainer width="wide">
        <div className={styles.page}>
          {templates.length > 0 ? (
            <section className={styles.simpleIntro} aria-label="Opis">
              <p className={styles.simpleIntroBody}>
                Prześlij własne szablony umów. OurWed przeanalizuje je za pomocą
                AI, wykryje informacje dynamiczne i automatycznie utworzy ankietę,
                którą później wyślesz do par.
              </p>
              <p className={styles.simpleIntroFormats}>
                Obsługiwane formaty: <strong>DOCX</strong>, <strong>PDF</strong>
              </p>
            </section>
          ) : null}

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
              title="Brak kontraktów"
              description="Prześlij pierwszy kontrakt — OurWed automatycznie przygotuje wszystko potrzebne do generowania umów."
              action={
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setUploadOpen(true)}
                >
                  <Upload size={16} style={{ marginRight: 6 }} aria-hidden />
                  Prześlij kontrakt
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
                          <th className={styles.tableActions} aria-label="Akcje" />
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
                              <td
                                className={styles.tableActions}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ContractOverflowMenu
                                  onDelete={() => setDeleteTarget(t)}
                                />
                              </td>
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
                        <div key={t.id} className={styles.cardShell}>
                          <div className={styles.cardMenuWrap}>
                            <ContractOverflowMenu
                              onDelete={() => setDeleteTarget(t)}
                            />
                          </div>
                          <Link
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
                        </div>
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

      <DeleteContractModal
        open={Boolean(deleteTarget)}
        contractName={deleteTarget?.name ?? ''}
        busy={remove.isPending}
        onClose={() => {
          if (!remove.isPending) setDeleteTarget(null)
        }}
        onConfirm={() => void handleDelete()}
      />
    </AppLayout>
  )
}
