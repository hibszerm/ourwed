import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { companyDetailsService } from '@/lib/api/companyDetailsService'
import { packageService } from '@/lib/api/packageService'
import { extraServiceService } from '@/lib/api/extraServiceService'
import { normalizeContractQuestionnaireConfig } from '@/lib/forms/contractQuestionnaireSnapshot'
import { buildContractQuestionnaireTemplate } from '@/lib/forms/contractQuestionnaireTemplate'
import {
  canAddExtrasBlock,
  canAddLocationRole,
  canAddPackageBlock,
  canAddSystemKey,
  createBlockOfType,
  createSystemFieldBlock,
  reorderBlocks,
  syncLegacyFieldsFromBlocks,
} from '@/lib/forms/questionnaireBlocks'
import { QuestionField } from '@/features/forms/QuestionField'
import { formEngine } from '@/lib/forms/formEngine'
import {
  groupQuestionsIntoSections,
  isFullWidthQuestion,
} from '@/features/forms/formSections'
import type { ContractQuestionnaireConfig } from '@/types/contractQuestionnaire'
import type {
  ContractQuestionnaireBlock,
  SystemFieldKey,
} from '@/types/questionnaireBlocks'
import type { AnswerValue } from '@/types/form'
import publicStyles from '@/features/forms/FormPublicPage.module.css'
import styles from './ContractQuestionnaireBuilder.module.css'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'dirty'

const ADD_GROUPS: {
  title: string
  items: Array<
    | { kind: 'block'; type: ContractQuestionnaireBlock['type']; label: string }
    | { kind: 'system'; systemKey: SystemFieldKey; label: string }
    | {
        kind: 'location'
        role: 'bride_preparation' | 'groom_preparation' | 'ceremony' | 'reception'
        label: string
      }
  >
}[] = [
  {
    title: 'Treść',
    items: [
      { kind: 'block', type: 'heading', label: 'Nagłówek' },
      { kind: 'block', type: 'text', label: 'Tekst' },
      { kind: 'block', type: 'divider', label: 'Separator' },
    ],
  },
  {
    title: 'Pytania',
    items: [
      { kind: 'block', type: 'short_text', label: 'Krótka odpowiedź' },
      { kind: 'block', type: 'long_text', label: 'Długa odpowiedź' },
      { kind: 'block', type: 'single_choice', label: 'Jednokrotny wybór' },
      { kind: 'block', type: 'multiple_choice', label: 'Wielokrotny wybór' },
      { kind: 'block', type: 'checkbox', label: 'Pole wyboru' },
      { kind: 'block', type: 'date', label: 'Data' },
      { kind: 'block', type: 'email', label: 'E-mail' },
      { kind: 'block', type: 'phone', label: 'Telefon' },
      { kind: 'block', type: 'number', label: 'Liczba' },
    ],
  },
  {
    title: 'Dane ślubu',
    items: [
      { kind: 'block', type: 'packages', label: 'Pakiety' },
      { kind: 'block', type: 'additional_services', label: 'Usługi dodatkowe' },
      {
        kind: 'system',
        systemKey: 'partner1.address',
        label: 'Adres do umowy',
      },
    ],
  },
]

interface ContractQuestionnaireBuilderProps {
  initialConfig: ContractQuestionnaireConfig | null | undefined
  dataUpdatedAt: number
}

export function ContractQuestionnaireBuilder({
  initialConfig,
  dataUpdatedAt,
}: ContractQuestionnaireBuilderProps) {
  const [config, setConfig] = useState<ContractQuestionnaireConfig>(() =>
    normalizeContractQuestionnaireConfig(initialConfig ?? null),
  )
  const [hydratedAt, setHydratedAt] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [catalogPackages, setCatalogPackages] = useState<
    Array<{ id: string; name: string }>
  >([])
  const [catalogExtras, setCatalogExtras] = useState<
    Array<{ id: string; name: string }>
  >([])

  const configRef = useRef(config)
  const dirtyRef = useRef(false)
  const lastSavedRef = useRef(JSON.stringify(config))
  configRef.current = config

  if (dataUpdatedAt !== hydratedAt && !dirtyRef.current) {
    const next = normalizeContractQuestionnaireConfig(initialConfig ?? null)
    setHydratedAt(dataUpdatedAt)
    setConfig(next)
    lastSavedRef.current = JSON.stringify(next)
    setDirty(false)
    setSaveStatus('idle')
  }

  const persist = useEffectEvent(async () => {
    const snapshot = syncLegacyFieldsFromBlocks(configRef.current)
    const serialized = JSON.stringify(snapshot)
    if (serialized === lastSavedRef.current) {
      dirtyRef.current = false
      setDirty(false)
      return
    }
    setSaveStatus('saving')
    setSaveError(null)
    try {
      await companyDetailsService.upsert({ questionnaireConfig: snapshot })
      if (
        JSON.stringify(syncLegacyFieldsFromBlocks(configRef.current)) ===
        serialized
      ) {
        dirtyRef.current = false
        setDirty(false)
        lastSavedRef.current = serialized
        setSaveStatus('saved')
      }
    } catch (err) {
      setSaveStatus('error')
      setSaveError(
        err instanceof Error ? err.message : 'Nie udało się zapisać ankiety',
      )
    }
  })

  useEffect(() => {
    void (async () => {
      try {
        const [pkgs, extras] = await Promise.all([
          packageService.list({ activeOnly: true }),
          extraServiceService.list({ activeOnly: true }),
        ])
        setCatalogPackages(pkgs.map((p) => ({ id: p.id, name: p.name })))
        setCatalogExtras(extras.map((e) => ({ id: e.id, name: e.name })))
      } catch {
        setCatalogPackages([])
        setCatalogExtras([])
      }
    })()
  }, [])

  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const blocks = [...(config.blocks ?? [])].sort((a, b) => a.order - b.order)
  const selected = blocks.find((b) => b.id === selectedId) ?? null

  function commit(nextBlocks: ContractQuestionnaireBlock[]) {
    dirtyRef.current = true
    setDirty(true)
    setSaveStatus('dirty')
    setConfig((prev) =>
      syncLegacyFieldsFromBlocks({
        ...prev,
        blocks: nextBlocks.map((b, i) => ({ ...b, order: i })),
      }),
    )
  }

  function updateBlock(
    id: string,
    patch: Partial<ContractQuestionnaireBlock>,
  ) {
    commit(
      blocks.map((b) =>
        b.id === id ? ({ ...b, ...patch } as ContractQuestionnaireBlock) : b,
      ),
    )
  }

  function addFromMenu(
    item: (typeof ADD_GROUPS)[number]['items'][number],
  ) {
    let created: ContractQuestionnaireBlock | null = null
    if (item.kind === 'block') {
      if (item.type === 'packages' && !canAddPackageBlock(blocks)) return
      if (item.type === 'additional_services' && !canAddExtrasBlock(blocks))
        return
      created = createBlockOfType(item.type, blocks.length)
      if (
        created?.type === 'location' &&
        !canAddLocationRole(blocks, created.locationRole)
      ) {
        for (const role of [
          'bride_preparation',
          'groom_preparation',
          'ceremony',
          'reception',
        ] as const) {
          if (canAddLocationRole(blocks, role)) {
            created.locationRole = role
            break
          }
        }
        if (!canAddLocationRole(blocks, created.locationRole)) return
      }
    } else if (item.kind === 'system') {
      if (!canAddSystemKey(blocks, item.systemKey)) return
      created = createSystemFieldBlock(item.systemKey, blocks.length)
    } else {
      if (!canAddLocationRole(blocks, item.role)) return
      created = createBlockOfType('location', blocks.length)
      if (created?.type === 'location') {
        created.locationRole = item.role
        created.label = item.label
      }
    }
    if (!created) return
    const insertAt = selected
      ? blocks.findIndex((b) => b.id === selected.id) + 1
      : blocks.length
    const next = [...blocks]
    next.splice(insertAt, 0, created)
    commit(next)
    setSelectedId(created.id)
    setShowAdd(false)
    setInspectorOpen(true)
  }

  function duplicateBlock(id: string) {
    const src = blocks.find((b) => b.id === id)
    if (!src || src.type === 'system_field') return
    if (src.type === 'packages' || src.type === 'additional_services') return
    const copy = createBlockOfType(src.type, blocks.length)
    if (!copy) return
    const merged = {
      ...src,
      ...copy,
      id: copy.id,
      order: blocks.length,
    } as ContractQuestionnaireBlock
    if (
      merged.type === 'location' &&
      !canAddLocationRole(blocks, merged.locationRole)
    ) {
      return
    }
    commit([...blocks, merged])
    setSelectedId(merged.id)
  }

  function deleteBlock(id: string) {
    const src = blocks.find((b) => b.id === id)
    if (!src) return
    if (src.type === 'system_field' && src.required) {
      if (
        !window.confirm(
          'To pole systemowe jest zwykle wymagane. Na pewno chcesz je usunąć z ankiety?',
        )
      ) {
        return
      }
    }
    commit(blocks.filter((b) => b.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function selectBlock(id: string) {
    setSelectedId(id)
    setInspectorOpen(true)
    setMenuOpenId(null)
  }

  const statusLabel =
    saveStatus === 'saving'
      ? 'Zapisywanie…'
      : saveStatus === 'saved' && !dirty
        ? 'Zapisano'
        : saveStatus === 'error'
          ? 'Błąd zapisu'
          : dirty
            ? 'Niezapisane zmiany'
            : 'Zapisano'

  const emptyPackages = catalogPackages.length === 0
  const emptyExtras = catalogExtras.length === 0

  return (
    <div className={styles.editor} data-testid="questionnaire-builder">
      <header className={styles.topBar}>
        <p className={styles.configNote}>
          Zmiany dotyczą nowo wysyłanych ankiet.
        </p>
        <div className={styles.topBarActions}>
          <span
            className={styles.saveState}
            data-status={dirty ? 'dirty' : saveStatus}
            data-testid="questionnaire-save-status"
          >
            {statusLabel}
          </span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPreviewOpen(true)}
          >
            Podgląd
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={saveStatus === 'saving' || !dirty}
            onClick={() => void persist()}
          >
            Zapisz
          </Button>
        </div>
      </header>

      {saveError ? (
        <p className={styles.saveError} role="alert">
          {saveError}
        </p>
      ) : null}

      {(emptyPackages || emptyExtras) && (
        <div className={styles.configWarn} role="status">
          {emptyPackages ? (
            <p>Brak aktywnych pakietów — sekcja pakietów będzie ukryta w ankiecie publicznej.</p>
          ) : null}
          {emptyExtras ? (
            <p>Brak aktywnych usług dodatkowych.</p>
          ) : null}
        </div>
      )}

      <div className={styles.workspace}>
        <aside className={styles.elementPanel} data-testid="builder-element-panel">
          <Button
            type="button"
            variant="secondary"
            className={styles.addTrigger}
            onClick={() => setShowAdd((v) => !v)}
          >
            Dodaj element
          </Button>
          {showAdd ? (
            <div className={styles.addPanel} role="listbox">
              {ADD_GROUPS.map((group) => (
                <div key={group.title} className={styles.addGroup}>
                  <p className={styles.addGroupTitle}>{group.title}</p>
                  {group.items.map((item) => {
                    const disabled =
                      (item.kind === 'block' &&
                        item.type === 'packages' &&
                        !canAddPackageBlock(blocks)) ||
                      (item.kind === 'block' &&
                        item.type === 'additional_services' &&
                        !canAddExtrasBlock(blocks)) ||
                      (item.kind === 'system' &&
                        !canAddSystemKey(blocks, item.systemKey)) ||
                      (item.kind === 'location' &&
                        !canAddLocationRole(blocks, item.role))
                    const key =
                      item.kind === 'block'
                        ? item.type
                        : item.kind === 'system'
                          ? item.systemKey
                          : item.role
                    return (
                      <button
                        key={key}
                        type="button"
                        className={styles.addItem}
                        disabled={disabled}
                        onClick={() => addFromMenu(item)}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.panelHint}>
              Kliknij „Dodaj element”, aby wstawić treść, pytanie lub pole systemowe.
            </p>
          )}
        </aside>

        <main
          className={styles.canvasColumn}
          data-testid="questionnaire-builder-canvas"
        >
          <div className={styles.canvasSheet}>
            {blocks.map((block) => (
              <CanvasBlock
                key={block.id}
                block={block}
                selected={selectedId === block.id}
                menuOpen={menuOpenId === block.id}
                packages={catalogPackages}
                extras={catalogExtras}
                onSelect={() => selectBlock(block.id)}
                onUpdate={(patch) => updateBlock(block.id, patch)}
                onToggleMenu={() =>
                  setMenuOpenId((cur) => (cur === block.id ? null : block.id))
                }
                onMove={(dir) => commit(reorderBlocks(blocks, block.id, dir))}
                onDuplicate={() => duplicateBlock(block.id)}
                onToggleEnabled={() =>
                  updateBlock(block.id, { enabled: !block.enabled })
                }
                onDelete={() => deleteBlock(block.id)}
              />
            ))}
          </div>
        </main>

        <aside
          className={[
            styles.inspector,
            inspectorOpen && selected ? styles.inspectorOpen : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-testid="builder-inspector"
        >
          <div className={styles.inspectorInner}>
            <div className={styles.inspectorHeader}>
              <h2 className={styles.inspectorTitle}>Ustawienia</h2>
              <button
                type="button"
                className={styles.inspectorClose}
                onClick={() => setInspectorOpen(false)}
              >
                Zamknij
              </button>
            </div>
            {selected ? (
              <BlockInspector
                block={selected}
                onChange={(patch) => updateBlock(selected.id, patch)}
                onDuplicate={() => duplicateBlock(selected.id)}
                onDelete={() => deleteBlock(selected.id)}
                onToggleEnabled={() =>
                  updateBlock(selected.id, { enabled: !selected.enabled })
                }
              />
            ) : (
              <p className={styles.panelHint}>
                Wybierz element na canvasie, aby edytować właściwości.
              </p>
            )}
          </div>
        </aside>
      </div>

      <Modal
        open={previewOpen}
        title="Podgląd ankiety"
        description="Ten sam renderer co ankieta publiczna — bez wysyłki."
        onClose={() => setPreviewOpen(false)}
        primaryAction={
          <Button type="button" variant="primary" onClick={() => setPreviewOpen(false)}>
            Zamknij
          </Button>
        }
      >
        <QuestionnairePreview
          config={config}
          packages={catalogPackages}
          extras={catalogExtras}
        />
      </Modal>
    </div>
  )
}

function CanvasBlock({
  block,
  selected,
  menuOpen,
  packages,
  extras,
  onSelect,
  onUpdate,
  onToggleMenu,
  onMove,
  onDuplicate,
  onToggleEnabled,
  onDelete,
}: {
  block: ContractQuestionnaireBlock
  selected: boolean
  menuOpen: boolean
  packages: Array<{ id: string; name: string }>
  extras: Array<{ id: string; name: string }>
  onSelect: () => void
  onUpdate: (patch: Partial<ContractQuestionnaireBlock>) => void
  onToggleMenu: () => void
  onMove: (dir: -1 | 1) => void
  onDuplicate: () => void
  onToggleEnabled: () => void
  onDelete: () => void
}) {
  const isSystem =
    block.type === 'system_field' ||
    block.type === 'packages' ||
    block.type === 'additional_services' ||
    block.type === 'location'

  return (
    <div
      className={[
        styles.canvasBlock,
        selected ? styles.canvasBlockSelected : '',
        !block.enabled ? styles.canvasBlockDisabled : '',
        block.type === 'heading' ? styles.canvasBlockHeading : '',
        block.type === 'text' ? styles.canvasBlockText : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-selected={selected ? 'true' : 'false'}
      onClick={onSelect}
    >
      <div className={styles.blockToolbar} data-testid="block-toolbar">
        <span className={styles.dragHandle} aria-hidden title="Przenieś">
          ⋮⋮
        </span>
        {isSystem ? <span className={styles.systemChip}>Systemowe</span> : null}
        <div className={styles.toolbarActions}>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={(e) => {
              e.stopPropagation()
              onToggleEnabled()
            }}
          >
            {block.enabled ? 'Wyłącz' : 'Włącz'}
          </button>
          {!isSystem || block.type === 'location' ? (
            <button
              type="button"
              className={styles.toolBtn}
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate()
              }}
            >
              Duplikuj
            </button>
          ) : null}
          <button
            type="button"
            className={styles.toolBtn}
            onClick={(e) => {
              e.stopPropagation()
              onToggleMenu()
            }}
            aria-expanded={menuOpen}
          >
            Więcej
          </button>
        </div>
        {menuOpen ? (
          <div className={styles.blockMenu} role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation()
                onMove(-1)
              }}
            >
              Przenieś w górę
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation()
                onMove(1)
              }}
            >
              Przenieś w dół
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.dangerMenu}
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
            >
              Usuń
            </button>
          </div>
        ) : null}
      </div>

      <div className={styles.blockBody}>
        {block.type === 'heading' && (
          <input
            className={styles.inlineHeading}
            data-level={block.level ?? 2}
            value={block.text}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onUpdate({ text: e.target.value })}
            aria-label="Tekst nagłówka"
          />
        )}
        {block.type === 'text' && (
          <textarea
            className={styles.inlineParagraph}
            value={block.content}
            rows={3}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onUpdate({ content: e.target.value })}
            aria-label="Treść tekstu"
          />
        )}
        {block.type === 'divider' && <hr className={styles.divider} />}
        {(block.type === 'system_field' ||
          block.type === 'short_text' ||
          block.type === 'long_text' ||
          block.type === 'email' ||
          block.type === 'phone' ||
          block.type === 'date' ||
          block.type === 'number' ||
          block.type === 'checkbox' ||
          block.type === 'single_choice' ||
          block.type === 'multiple_choice' ||
          block.type === 'location' ||
          block.type === 'packages' ||
          block.type === 'additional_services') && (
          <FieldPreview
            block={block}
            packages={packages}
            extras={extras}
            onUpdate={onUpdate}
          />
        )}
      </div>
    </div>
  )
}

function FieldPreview({
  block,
  packages,
  extras,
  onUpdate,
}: {
  block: ContractQuestionnaireBlock
  packages: Array<{ id: string; name: string }>
  extras: Array<{ id: string; name: string }>
  onUpdate: (patch: Partial<ContractQuestionnaireBlock>) => void
}) {
  const label = 'label' in block ? block.label : ''
  const helper = 'helperText' in block ? block.helperText : ''
  const inputType =
    block.type === 'system_field'
      ? block.inputType
      : block.type === 'long_text'
        ? 'textarea'
        : block.type === 'date'
          ? 'date'
          : block.type === 'email'
            ? 'email'
            : block.type === 'phone'
              ? 'phone'
              : 'text'

  return (
    <div className={styles.fieldPreview}>
      <input
        className={styles.inlineLabel}
        value={label}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onUpdate({ label: e.target.value } as Partial<ContractQuestionnaireBlock>)}
        aria-label="Etykieta pytania"
      />
      <input
        className={styles.inlineHelper}
        value={helper ?? ''}
        placeholder="Tekst pomocniczy (opcjonalnie)"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) =>
          onUpdate({ helperText: e.target.value } as Partial<ContractQuestionnaireBlock>)
        }
        aria-label="Tekst pomocniczy"
      />
      {block.type === 'packages' && (
        <div className={styles.optionPreview}>
          {packages.length === 0 ? (
            <p className={styles.emptyCatalog}>Brak aktywnych pakietów</p>
          ) : (
            packages.slice(0, 4).map((p) => (
              <label key={p.id} className={styles.optionChip}>
                <input type="checkbox" disabled />
                {p.name}
              </label>
            ))
          )}
        </div>
      )}
      {block.type === 'additional_services' && (
        <div className={styles.optionPreview}>
          {extras.length === 0 ? (
            <p className={styles.emptyCatalog}>Brak aktywnych usług dodatkowych</p>
          ) : (
            extras.slice(0, 4).map((s) => (
              <label key={s.id} className={styles.optionChip}>
                <input type="checkbox" disabled />
                {s.name}
              </label>
            ))
          )}
        </div>
      )}
      {(block.type === 'location' ||
        (block.type === 'system_field' && block.inputType === 'address')) && (
        <input className={styles.fakeInput} disabled placeholder="Wpisz adres…" />
      )}
      {block.type !== 'packages' &&
        block.type !== 'additional_services' &&
        block.type !== 'location' &&
        !(block.type === 'system_field' && block.inputType === 'address') &&
        inputType === 'textarea' && (
          <textarea className={styles.fakeTextarea} disabled rows={2} />
        )}
      {block.type !== 'packages' &&
        block.type !== 'additional_services' &&
        block.type !== 'location' &&
        !(block.type === 'system_field' && block.inputType === 'address') &&
        inputType !== 'textarea' && (
          <input
            className={styles.fakeInput}
            disabled
            placeholder={
              inputType === 'date'
                ? 'dd.mm.rrrr'
                : inputType === 'email'
                  ? 'email@domena.pl'
                  : ''
            }
          />
        )}
    </div>
  )
}

function BlockInspector({
  block,
  onChange,
  onDuplicate,
  onDelete,
  onToggleEnabled,
}: {
  block: ContractQuestionnaireBlock
  onChange: (patch: Partial<ContractQuestionnaireBlock>) => void
  onDuplicate: () => void
  onDelete: () => void
  onToggleEnabled: () => void
}) {
  const lockedMapping =
    block.type === 'system_field' ||
    block.type === 'packages' ||
    block.type === 'additional_services' ||
    block.type === 'location'

  return (
    <div className={styles.inspectorBody}>
      {lockedMapping ? (
        <p className={styles.panelHint}>
          Pole systemowe — mapowanie do danych ślubu jest chronione.
          {block.type === 'system_field' ? ` (${block.systemKey})` : ''}
        </p>
      ) : null}

      {block.type === 'heading' && (
        <>
          <Input
            label="Tekst nagłówka"
            value={block.text}
            onChange={(e) => onChange({ text: e.target.value })}
          />
          <label className={styles.label}>
            Poziom
            <select
              value={block.level ?? 2}
              onChange={(e) =>
                onChange({ level: Number(e.target.value) as 1 | 2 | 3 })
              }
            >
              <option value={1}>H1</option>
              <option value={2}>H2</option>
              <option value={3}>H3</option>
            </select>
          </label>
        </>
      )}
      {block.type === 'text' && (
        <label className={styles.label}>
          Treść
          <textarea
            className={styles.textarea}
            rows={5}
            value={block.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
        </label>
      )}
      {'label' in block && (
        <Input
          label="Etykieta"
          value={block.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      )}
      {'helperText' in block && (
        <Input
          label="Tekst pomocniczy"
          value={block.helperText ?? ''}
          onChange={(e) => onChange({ helperText: e.target.value })}
        />
      )}
      {'required' in block && (
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={Boolean(block.required)}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          Wymagane
        </label>
      )}
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={block.enabled}
          onChange={onToggleEnabled}
        />
        Włączone
      </label>

      {(block.type === 'packages' || block.type === 'additional_services') && (
        <p className={styles.panelHint}>
          {block.type === 'packages'
            ? 'Opcje pochodzą z aktywnych pakietów w katalogu studia.'
            : 'Opcje pochodzą z aktywnych usług dodatkowych.'}
        </p>
      )}

      {(block.type === 'single_choice' || block.type === 'multiple_choice') && (
        <label className={styles.label}>
          Opcje (jedna na linię: wartość|etykieta)
          <textarea
            className={styles.textarea}
            rows={4}
            value={(block.options ?? [])
              .map((o) =>
                o.value === o.label ? o.label : `${o.value}|${o.label}`,
              )
              .join('\n')}
            onChange={(e) => {
              const options = e.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, i) => {
                  const [value, label] = line.includes('|')
                    ? line.split('|', 2)
                    : [line, line]
                  const prev = block.options?.[i]
                  return {
                    id: prev?.id ?? `opt_${block.id}_${i}`,
                    value: value.trim(),
                    label: (label ?? value).trim(),
                  }
                })
              onChange({ options })
            }}
          />
        </label>
      )}

      <div className={styles.fieldActions}>
        {!lockedMapping || block.type === 'location' ? (
          <button type="button" className={styles.toolBtn} onClick={onDuplicate}>
            Duplikuj
          </button>
        ) : null}
        <button type="button" className={styles.dangerBtn} onClick={onDelete}>
          Usuń
        </button>
      </div>
    </div>
  )
}

function QuestionnairePreview({
  config,
  packages,
  extras,
}: {
  config: ContractQuestionnaireConfig
  packages: Array<{ id: string; name: string }>
  extras: Array<{ id: string; name: string }>
}) {
  const template = buildContractQuestionnaireTemplate({
    packages,
    additionalServices: extras,
    config,
  })
  const [values, setValues] = useState<Record<string, AnswerValue>>({})
  const sections = groupQuestionsIntoSections(template.questions)

  return (
    <div className={publicStyles.shell} data-testid="questionnaire-preview">
      <header className={publicStyles.header}>
        <p className={publicStyles.eyebrow}>{template.title}</p>
        <h2 className={publicStyles.title}>Podgląd</h2>
        <p className={publicStyles.lead}>{template.description}</p>
      </header>
      <div className={publicStyles.form}>
        {sections.map((section) => (
          <section key={section.id} className={publicStyles.card}>
            {section.title ? (
              <h3 className={publicStyles.cardTitle}>{section.title}</h3>
            ) : null}
            <div className={publicStyles.cardBodyGrid}>
              {section.questions
                .filter((q) => !formEngine.isDisplayQuestion(q))
                .map((question) => (
                  <div
                    key={question.id}
                    className={
                      isFullWidthQuestion(question)
                        ? publicStyles.fullWidth
                        : undefined
                    }
                  >
                    <QuestionField
                      question={question}
                      value={values[question.id] ?? ''}
                      onChange={(v) =>
                        setValues((prev) => ({ ...prev, [question.id]: v }))
                      }
                    />
                  </div>
                ))}
            </div>
          </section>
        ))}
        <div className={publicStyles.actions}>
          <Button type="button" variant="primary" disabled>
            {template.submitLabel} (podgląd)
          </Button>
        </div>
      </div>
      {config.footerText ? (
        <p className={publicStyles.footer}>{config.footerText}</p>
      ) : null}
    </div>
  )
}
