/**
 * Manual block + substring selection fallback.
 */

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EXPERIMENT_FIELD_LABELS } from './fieldRegistry'
import type { ContractFieldKey, IndexedDocxBlock } from './types'
import styles from './AiContractExperimentPage.module.css'

type Props = {
  fieldKey: ContractFieldKey
  blocks: IndexedDocxBlock[]
  onCancel: () => void
  onConfirm: (blockId: string, sourceText: string) => void
}

export function ManualBlockSelector({
  fieldKey,
  blocks,
  onCancel,
  onConfirm,
}: Props) {
  const [search, setSearch] = useState('')
  const [blockId, setBlockId] = useState('')
  const [sourceText, setSourceText] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return blocks
    return blocks.filter(
      (b) =>
        b.id.toLowerCase().includes(q) || b.text.toLowerCase().includes(q),
    )
  }, [blocks, search])

  const selected = blocks.find((b) => b.id === blockId)

  return (
    <div className={styles.manualSelector} data-testid="manual-block-selector">
      <h3 className={styles.reviewGroupTitle}>
        Ręczne wskazanie: {EXPERIMENT_FIELD_LABELS[fieldKey]}
      </h3>
      <label className={styles.label}>
        Szukaj bloku
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ID lub fragment tekstu"
        />
      </label>
      <div className={styles.blockList}>
        {filtered.slice(0, 30).map((b) => (
          <button
            key={b.id}
            type="button"
            className={`${styles.blockPick} ${blockId === b.id ? styles.blockPickActive : ''}`}
            onClick={() => {
              setBlockId(b.id)
              setSourceText(b.text)
            }}
          >
            <span className={styles.blockMeta}>{b.id}</span>
            {b.text || <span className={styles.muted}>(pusty)</span>}
          </button>
        ))}
      </div>
      {selected ? (
        <label className={styles.label}>
          Dokładny fragment w bloku
          <input
            type="text"
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
          />
        </label>
      ) : null}
      <div className={styles.actions}>
        <Button
          type="button"
          disabled={!blockId || !sourceText.trim()}
          onClick={() => onConfirm(blockId, sourceText.trim())}
        >
          Zapisz ręczne mapowanie
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Anuluj
        </Button>
      </div>
    </div>
  )
}
