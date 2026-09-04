import { useState } from 'react'
import { GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ExtraServiceOverflowMenu } from '@/features/studio/extras/ExtraServiceOverflowMenu'
import {
  EXTRA_SERVICES_ADD_LABEL,
  EXTRA_SERVICES_EMPTY_COPY,
  EXTRA_SERVICES_EMPTY_TITLE,
  EXTRA_SERVICES_SUBTITLE,
  EXTRA_SERVICES_TITLE,
} from '@/features/studio/extras/extraServicesCopy'
import { EXTRA_SERVICE_IN_USE_MESSAGE } from '@/lib/api/extraServiceErrors'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import { formatCurrency } from '@/lib/utils/currency'
import type { ExtraService } from '@/types/package'
import styles from './ModernExtraServicesWorkspace.module.css'

export type ExtraServiceEditorValues = {
  name: string
  description: string | null
  price: number
  isActive: boolean
}

type DeleteKind = 'checking' | 'unused' | 'used'

interface ModernExtraServicesWorkspaceProps {
  services: ExtraService[]
  isLoading: boolean
  isError: boolean
  error: unknown
  onRetry: () => void
  saveBusy: boolean
  onSave: (
    values: ExtraServiceEditorValues,
    editingId: string | null,
  ) => Promise<boolean>
  onReorder: (fromId: string, toId: string) => Promise<void>
  onCheckUsed: (id: string) => Promise<boolean>
  onDelete: (id: string) => Promise<void>
  canMutate: (action?: () => void) => boolean
}

function parsePrice(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.')
  if (normalized === '') return null
  const value = Number(normalized)
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

export function ModernExtraServicesWorkspace({
  services,
  isLoading,
  isError,
  error,
  onRetry,
  saveBusy,
  onSave,
  onReorder,
  onCheckUsed,
  onDelete,
  canMutate,
}: ModernExtraServicesWorkspaceProps) {
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ExtraService | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ExtraService | null>(null)
  const [deleteKind, setDeleteKind] = useState<DeleteKind>('checking')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const showEmpty = !isLoading && !isError && services.length === 0 && !creating

  function startCreate() {
    if (!canMutate()) return
    setEditing(null)
    setCreating(true)
    setOpenMenuId(null)
  }

  function startEdit(service: ExtraService) {
    if (!canMutate()) return
    setCreating(false)
    setEditing(service)
    setOpenMenuId(null)
  }

  function cancelEditor() {
    setCreating(false)
    setEditing(null)
  }

  async function requestDelete(service: ExtraService) {
    if (!canMutate()) return
    setPendingDelete(service)
    setDeleteKind('checking')
    setDeleteError(null)
    setDeleteBusy(false)
    try {
      const used = await onCheckUsed(service.id)
      setDeleteKind(used ? 'used' : 'unused')
    } catch {
      setDeleteKind('unused')
    }
  }

  function closeDelete() {
    if (deleteBusy) return
    setPendingDelete(null)
    setDeleteError(null)
  }

  async function confirmDelete() {
    if (!pendingDelete || deleteKind !== 'unused') return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await onDelete(pendingDelete.id)
      if (editing?.id === pendingDelete.id) setEditing(null)
      setPendingDelete(null)
    } catch (err) {
      setDeleteError(
        getUserFacingErrorMessage(err, EXTRA_SERVICE_IN_USE_MESSAGE),
      )
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className={styles.page} data-testid="extras-modern">
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{EXTRA_SERVICES_TITLE}</h1>
          <p className={styles.lead}>{EXTRA_SERVICES_SUBTITLE}</p>
        </div>
        <div className={styles.actions}>
          <Button
            type="button"
            variant="primary"
            className={styles.createAction}
            onClick={startCreate}
            disabled={creating}
          >
            {EXTRA_SERVICES_ADD_LABEL}
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className={styles.catalog}>
          <div
            className={styles.surface}
            aria-hidden
            data-testid="extras-loading"
          >
            <div className={styles.skeleton}>
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className={styles.skeletonRow} />
              ))}
            </div>
          </div>
        </div>
      ) : isError ? (
        <div className={styles.catalog}>
          <div className={styles.surface} data-testid="extras-error">
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Nie udało się załadować usług</p>
              <p className={styles.emptyDesc}>
                {getUserFacingErrorMessage(error, 'Spróbuj ponownie.')}
              </p>
              <Button type="button" variant="secondary" onClick={onRetry}>
                Spróbuj ponownie
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.catalog}>
          <div
            className={styles.surface}
            data-testid="extras-catalog-surface"
          >
            {creating ? (
              <ExtraServiceEditor
                key="create"
                initial={null}
                busy={saveBusy}
                onCancel={cancelEditor}
                onSave={async (values) => {
                  const saved = await onSave(values, null)
                  if (saved) setCreating(false)
                }}
              />
            ) : null}

            {showEmpty ? (
              <div className={styles.empty} data-testid="extras-empty">
                <p className={styles.emptyTitle}>{EXTRA_SERVICES_EMPTY_TITLE}</p>
                <p className={styles.emptyDesc}>{EXTRA_SERVICES_EMPTY_COPY}</p>
                <Button type="button" variant="primary" onClick={startCreate}>
                  {EXTRA_SERVICES_ADD_LABEL}
                </Button>
              </div>
            ) : services.length > 0 ? (
              <ul className={styles.list} data-testid="extras-catalog">
                {services.map((service) =>
                  editing?.id === service.id ? (
                    <li key={service.id}>
                      <ExtraServiceEditor
                        key={service.id}
                        initial={service}
                        busy={saveBusy}
                        onCancel={cancelEditor}
                        onSave={async (values) => {
                          const saved = await onSave(values, service.id)
                          if (saved) setEditing(null)
                        }}
                      />
                    </li>
                  ) : (
                    <CatalogRow
                      key={service.id}
                      service={service}
                      dragging={dragId === service.id}
                      menuOpen={openMenuId === service.id}
                      onMenuOpenChange={(open) =>
                        setOpenMenuId(open ? service.id : null)
                      }
                      onEdit={() => startEdit(service)}
                      onDelete={() => void requestDelete(service)}
                      onDragStart={() => {
                        if (!canMutate()) return
                        setDragId(service.id)
                      }}
                      onDragOver={() => undefined}
                      onDrop={() => {
                        if (dragId) void onReorder(dragId, service.id)
                        setDragId(null)
                      }}
                      onDragEnd={() => setDragId(null)}
                    />
                  ),
                )}
              </ul>
            ) : null}
          </div>
        </div>
      )}

      <Modal
        open={pendingDelete != null}
        title={
          deleteKind === 'used'
            ? 'Nie można usunąć usługi'
            : deleteKind === 'checking'
              ? 'Usuwanie usługi'
              : 'Usunąć usługę na stałe?'
        }
        busy={deleteBusy || deleteKind === 'checking'}
        onClose={closeDelete}
        cancelLabel={deleteKind === 'used' ? undefined : 'Anuluj'}
        hideFooter={deleteKind === 'used'}
        showClose={deleteKind === 'used'}
        primaryAction={
          deleteKind === 'unused' ? (
            <Button
              type="button"
              variant="danger"
              disabled={deleteBusy}
              onClick={() => void confirmDelete()}
            >
              {deleteBusy ? 'Usuwanie…' : 'Usuń'}
            </Button>
          ) : undefined
        }
      >
        <p className={styles.dialogBody}>
          {deleteKind === 'checking'
            ? 'Sprawdzam, czy usługa jest używana w zleceniach…'
            : deleteKind === 'used'
              ? EXTRA_SERVICE_IN_USE_MESSAGE
              : `Usługa „${pendingDelete?.name ?? ''}” zostanie usunięta na stałe z katalogu. Nie da się tego cofnąć.`}
        </p>
        {deleteError ? <p className={styles.error}>{deleteError}</p> : null}
        {deleteKind === 'used' ? (
          <div className={styles.editorActions}>
            <Button type="button" variant="secondary" onClick={closeDelete}>
              Zamknij
            </Button>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function CatalogRow({
  service,
  dragging,
  menuOpen,
  onMenuOpenChange,
  onEdit,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  service: ExtraService
  dragging: boolean
  menuOpen: boolean
  onMenuOpenChange: (open: boolean) => void
  onEdit: () => void
  onDelete: () => void
  onDragStart: () => void
  onDragOver: () => void
  onDrop: () => void
  onDragEnd: () => void
}) {
  return (
    <li
      className={`${styles.row} ${dragging ? styles.rowDragging : ''}`}
      data-testid="extras-row"
      data-inactive={service.isActive ? undefined : 'true'}
      onDragOver={(event) => {
        event.preventDefault()
        onDragOver()
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop()
      }}
    >
      <button
        type="button"
        className={styles.grip}
        aria-label="Zmień kolejność"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move'
          onDragStart()
        }}
        onDragEnd={onDragEnd}
      >
        <GripVertical size={14} strokeWidth={2} aria-hidden />
      </button>
      <div className={styles.identity}>
        <p className={styles.name}>{service.name}</p>
        {service.description ? (
          <p className={styles.desc}>{service.description}</p>
        ) : null}
        {!service.isActive ? (
          <p className={styles.status}>Nieaktywna</p>
        ) : null}
      </div>
      <p className={styles.price}>{formatCurrency(service.price)}</p>
      <div className={styles.rowActions}>
        <ExtraServiceOverflowMenu
          open={menuOpen}
          onOpenChange={onMenuOpenChange}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </li>
  )
}

function ExtraServiceEditor({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial: ExtraService | null
  busy: boolean
  onCancel: () => void
  onSave: (values: ExtraServiceEditorValues) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [price, setPrice] = useState(
    initial == null ? '' : String(initial.price),
  )
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className={styles.editor}
      data-testid={initial ? 'extras-edit-form' : 'extras-create-form'}
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault()
        if (busy) return
        setError(null)
        if (!name.trim()) {
          setError('Podaj nazwę.')
          return
        }
        const priceN = parsePrice(price)
        if (priceN == null) {
          setError('Podaj poprawną cenę.')
          return
        }
        void onSave({
          name: name.trim(),
          description: description.trim() || null,
          price: priceN,
          isActive,
        }).catch((err) =>
          setError(getUserFacingErrorMessage(err, 'Nie udało się zapisać.')),
        )
      }}
    >
      <h2 className={styles.editorTitle}>
        {initial ? 'Edytuj usługę' : 'Nowa usługa'}
      </h2>
      <div className={styles.editorGrid}>
        <Input
          label="Nazwa"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
          autoComplete="off"
        />
        <Textarea
          label="Opis"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          disabled={busy}
        />
        <Input
          label="Cena"
          hint="zł"
          inputMode="decimal"
          autoComplete="off"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          disabled={busy}
        />
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            disabled={busy}
          />
          Aktywna
        </label>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.editorActions}>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Anuluj
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy
            ? 'Zapisywanie…'
            : initial
              ? 'Zapisz'
              : EXTRA_SERVICES_ADD_LABEL}
        </Button>
      </div>
    </form>
  )
}
