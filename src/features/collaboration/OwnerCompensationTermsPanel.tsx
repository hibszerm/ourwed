import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/features/auth/AuthProvider'
import { invalidateFinanceQueries } from '@/features/finance/invalidateFinanceQueries'
import {
  compensationV3QueryKeys,
  compensationV3Service,
  type OwnerCompensationRelationshipV3,
} from './compensationV3Service'
import styles from './CollaborativeCompensationCard.module.css'

function amount(value: string | null, currency: string): string {
  if (value == null) return 'Nie ustalono'
  const numeric = Number(value)
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(numeric)
    : 'Nie ustalono'
}

function validAmount(value: string): string | null {
  const normalized = value.trim().replace(',', '.')
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(normalized)) return null
  return normalized.includes('.') ? normalized : `${normalized}.00`
}

export function OwnerCompensationTermsPanel({
  weddingId,
  currency,
}: {
  weddingId: string
  currency: string
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = compensationV3QueryKeys.owner(user?.id, weddingId)
  const query = useQuery({
    queryKey,
    queryFn: () => compensationV3Service.getOwnerRelationships(weddingId),
    enabled: Boolean(user?.id),
    staleTime: 0,
  })
  const [selected, setSelected] = useState<OwnerCompensationRelationshipV3 | null>(null)
  const [amountInput, setAmountInput] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [active, setActive] = useState(true)
  const mutation = useMutation({
    mutationFn: () => compensationV3Service.mutateOwnerTerms({
      relationshipId: selected!.relationshipId,
      expectedTermsRevision: selected!.termsRevision,
      amount: validAmount(amountInput) ?? '',
      dueDate: dueDate || null,
      active,
    }),
    onSuccess: async () => {
      setSelected(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey, exact: true }),
        queryClient.invalidateQueries({ queryKey: ['personal-finance-v3', user?.id] }),
        invalidateFinanceQueries(queryClient),
      ])
    },
  })

  function edit(row: OwnerCompensationRelationshipV3) {
    setSelected(row)
    setAmountInput(row.amount ?? '')
    setDueDate(row.dueDate ?? '')
    setActive(row.active)
    mutation.reset()
  }

  if (query.isPending) return <p className={styles.note} role="status">Ładowanie ustaleń finansowych…</p>
  if (query.isError) return <p className={styles.error} role="alert">Nie udało się wczytać ustaleń finansowych.</p>
  if (!query.data?.length) return null

  return (
    <section className={styles.ownerTerms} aria-label="Oficjalne ustalenia finansowe">
      <h3>Ustalenia finansowe</h3>
      <p className={styles.note}>Te kwoty wpływają na wartość zlecenia dla Ciebie. Prywatne rozliczenia współpracowników pozostają niewidoczne.</p>
      <ul className={styles.ownerTermsList}>
        {query.data.map((row) => (
          <li key={row.relationshipId}>
            <span>
              <strong>{row.recipientLabel}</strong>
              <small>{row.active ? 'Aktywne ustalenie' : row.amount == null ? 'Brak ustalenia' : 'Wycofane ustalenie'} · {amount(row.active ? row.amount : null, row.currency)}</small>
            </span>
            <Button type="button" variant="secondary" onClick={() => edit(row)}>
              {row.amount == null ? 'Ustal kwotę' : 'Zmień'}
            </Button>
          </li>
        ))}
      </ul>
      <Modal
        open={Boolean(selected)}
        title={`Ustalenie · ${selected?.recipientLabel ?? 'współpracownik'}`}
        description="Oficjalna kwota jest podstawą wyliczenia Twojej wartości osobistej. Widoczność dla współpracownika zależy od jego poziomu dostępu do rozliczeń."
        onClose={() => setSelected(null)}
        mobilePresentation="center"
        primaryAction={(
          <Button type="button" disabled={mutation.isPending || validAmount(amountInput) == null}
            onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Zapisywanie…' : 'Zapisz ustalenie'}
          </Button>
        )}
      >
        <div className={styles.ownerTermsEditor}>
          <Input id="owner-compensation-amount" label={`Kwota (${currency})`} type="number" min="0" step="0.01" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} />
          <Input id="owner-compensation-date" label="Termin (opcjonalnie)" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          <label className={styles.ownerTermsToggle}>
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            <span>Uwzględnij w bieżących wyliczeniach</span>
          </label>
          {mutation.isError ? <p className={styles.error} role="alert">Dane mogły się zmienić. Odśwież ustalenia i spróbuj ponownie.</p> : null}
        </div>
      </Modal>
    </section>
  )
}
