import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import {
  compensationV3QueryKeys,
  compensationV3Service,
  type CompensationV3Model,
} from './compensationV3Service'
import { invalidateCompensationPrivateMutation } from './compensationV3Cache'
import styles from './CollaborativeCompensationCard.module.css'

function displayMoney(value: string | null, currency: string): string {
  if (value == null) return '—'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount)
}

function parseAmount(value: string): string | null {
  const normalized = value.trim().replace(',', '.')
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(normalized)) return null
  return normalized.includes('.') ? normalized : `${normalized}.00`
}

function settlementLabel(model: CompensationV3Model): string {
  if (!model.personalValueKnown || model.balance == null) return 'Do ustalenia'
  const balance = Number(model.balance)
  const received = Number(model.receivedTotal)
  if (balance < 0) return 'Do przekazania'
  if (balance === 0) return 'Rozliczone'
  if (received > 0) return 'Częściowo rozliczone'
  return 'Do otrzymania'
}

export function CollaborativeCompensationCard({
  weddingId,
  userId,
  accessVersion,
  compensationLevel,
}: {
  weddingId: string
  userId: string | undefined
  accessVersion: string
  compensationLevel: 0 | 1 | 2
}) {
  const queryClient = useQueryClient()
  const sharedKey = compensationV3QueryKeys.shared(userId, weddingId, accessVersion)
  const sharedQuery = useQuery({
    queryKey: sharedKey,
    queryFn: () => compensationV3Service.getShared(weddingId),
    enabled: Boolean(userId && compensationLevel >= 0),
    staleTime: 0,
    retry: false,
  })
  const relationshipId = typeof sharedQuery.data?.relationship_id === 'string'
    ? sharedQuery.data.relationship_id
    : ''
  const privateKey = compensationV3QueryKeys.private(userId, relationshipId || 'unavailable', accessVersion)
  const query = useQuery({
    queryKey: privateKey,
    queryFn: () => compensationV3Service.getPrivate(relationshipId, sharedQuery.data ?? {}),
    enabled: Boolean(userId && relationshipId && sharedQuery.isSuccess),
    staleTime: 0,
    retry: false,
  })
  const [draft, setDraft] = useState<{
    key: string
    fallbackAmount: string
    fallbackDueDate: string
    officialAmount: string
    officialDueDate: string
  } | null>(null)
  const [receiptAmount, setReceiptAmount] = useState('')
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const model = query.data
  const draftKey = model ? `${model.relationshipId}:${model.privateRevision}:${model.termsRevision ?? 'none'}` : ''
  const form = draft?.key === draftKey && draft ? draft : {
    key: draftKey,
    fallbackAmount: model?.fallbackAmount ?? '',
    fallbackDueDate: model?.fallbackDueDate ?? '',
    officialAmount: model?.valueSource === 'official_compensation' ? model.personalValue ?? '' : '',
    officialDueDate: model?.valueSource === 'official_compensation' ? model.dueDate ?? '' : '',
  }

  useEffect(() => () => {
    queryClient.removeQueries({ queryKey: ['collaboration-compensation-v3', 'private', userId] })
  }, [queryClient, userId])

  const refresh = async () => {
    await invalidateCompensationPrivateMutation(queryClient, {
      userId,
      weddingId,
      relationshipId: model!.relationshipId,
      accessVersion,
    })
  }
  const saveFallback = useMutation({
    mutationFn: () => compensationV3Service.updateFallback({
      relationshipId: model!.relationshipId,
      expectedRevision: model!.privateRevision,
      amount: form.fallbackAmount === '' ? null : parseAmount(form.fallbackAmount),
      dueDate: form.fallbackDueDate || null,
    }),
    onSuccess: refresh,
  })
  const addReceipt = useMutation({
    mutationFn: () => compensationV3Service.createPrivateReceipt({
      relationshipId: model!.relationshipId,
      amount: parseAmount(receiptAmount) ?? '',
      receivedOn: receiptDate,
      description: null,
      expectedRevision: model!.privateRevision,
    }),
    onSuccess: async () => {
      setReceiptAmount('')
      await refresh()
    },
  })
  const saveOfficial = useMutation({
    mutationFn: () => compensationV3Service.updateOfficialTerms({
      relationshipId: model!.relationshipId,
      weddingId,
      accessVersion,
      expectedTermsRevision: model!.termsRevision ?? '0',
      amount: parseAmount(form.officialAmount) ?? '',
      dueDate: form.officialDueDate || null,
      active: true,
    }),
    onSuccess: async () => {
      await refresh()
    },
  })
  const deleteReceipt = useMutation({
    mutationFn: (item: CompensationV3Model['privateReceipts'][number]) =>
      compensationV3Service.deletePrivateReceipt({
        receiptId: item.id,
        expectedReceiptRevision: item.revision,
        expectedPrivateRevision: model!.privateRevision,
      }),
    onSuccess: refresh,
  })

  const busy = saveFallback.isPending || addReceipt.isPending || saveOfficial.isPending || deleteReceipt.isPending
  const mutationError = saveFallback.error ?? addReceipt.error ?? saveOfficial.error ?? deleteReceipt.error
  if (sharedQuery.isPending || query.isPending) return <Card className={styles.card}><p role="status">Ładowanie rozliczenia…</p></Card>
  if (sharedQuery.isError || query.isError || !model) return <Card className={styles.card}><p className={styles.error} role="alert">Nie udało się wczytać rozliczenia.</p></Card>

  const showOfficial = model.compensationLevel > 0 && model.valueSource === 'official_compensation'
  const canEditOfficial = model.compensationLevel === 2 && model.activeMembership
  const balance = model.balance == null ? null : Number(model.balance)

  async function submit(action: () => Promise<unknown>) {
    setError(null)
    try { await action() } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Nie udało się zapisać zmian.'
      setError(message === 'CONFLICT' ? 'Dane zmieniły się w międzyczasie. Odśwież widok i spróbuj ponownie.' : 'Nie udało się zapisać zmian.')
      await query.refetch()
    }
  }

  return (
    <Card className={styles.card} padding="md">
      <CardHeader title="Moje rozliczenie" subtitle={model.weddingLabel} />
      <dl className={styles.metrics}>
        <div><dt>Wartość dla mnie</dt><dd>{model.personalValueKnown ? displayMoney(model.personalValue, model.currency) : 'Nie ustawiono'}</dd></div>
        <div><dt>Otrzymano</dt><dd>{displayMoney(model.receivedTotal, model.currency)}</dd></div>
        <div><dt>{balance != null && balance < 0 ? 'Do przekazania' : 'Pozostało'}</dt><dd>{balance == null ? '—' : displayMoney(String(Math.abs(balance)), model.currency)}</dd></div>
      </dl>
      <p className={styles.status}>{settlementLabel(model)}</p>
      {model.dueDate ? <p className={styles.dueDate}>Termin: {new Date(`${model.dueDate}T00:00:00`).toLocaleDateString('pl-PL')}</p> : null}

      {showOfficial && !canEditOfficial ? <p className={styles.note}>Wartość ustalona z właścicielem.</p> : null}
      {canEditOfficial ? (
        <div className={styles.editor}>
          <h4>Ustalona wartość</h4>
          <Input id={`official-amount-${weddingId}`} label="Kwota" type="number" min="0" step="0.01" value={form.officialAmount} onChange={(event) => setDraft({ ...form, officialAmount: event.target.value })} disabled={busy} />
          <Input id={`official-due-${weddingId}`} label="Termin" type="date" value={form.officialDueDate} onChange={(event) => setDraft({ ...form, officialDueDate: event.target.value })} disabled={busy} />
          <Button type="button" variant="secondary" disabled={busy || parseAmount(form.officialAmount) == null} onClick={() => void submit(() => saveOfficial.mutateAsync())}>Zapisz ustalenie</Button>
        </div>
      ) : null}

      {!showOfficial && model.activeMembership ? (
        <div className={styles.editor}>
          <h4>Moja prywatna wartość</h4>
          <Input id={`fallback-amount-${weddingId}`} label="Kwota" type="number" min="0" step="0.01" value={form.fallbackAmount} onChange={(event) => setDraft({ ...form, fallbackAmount: event.target.value })} disabled={busy} hint="Ta kwota jest widoczna tylko dla Ciebie." />
          <Input id={`fallback-due-${weddingId}`} label="Termin (opcjonalnie)" type="date" value={form.fallbackDueDate} onChange={(event) => setDraft({ ...form, fallbackDueDate: event.target.value })} disabled={busy} />
          <Button type="button" variant="secondary" disabled={busy || (form.fallbackAmount !== '' && parseAmount(form.fallbackAmount) == null)} onClick={() => void submit(() => saveFallback.mutateAsync())}>Zapisz prywatną wartość</Button>
        </div>
      ) : null}

      {model.activeMembership ? (
        <div className={styles.editor}>
          <h4>Dodaj prywatną wpłatę</h4>
          <div className={styles.receiptForm}>
            <Input id={`receipt-amount-${weddingId}`} label="Kwota" type="number" min="0.01" step="0.01" value={receiptAmount} onChange={(event) => setReceiptAmount(event.target.value)} disabled={busy} />
            <Input id={`receipt-date-${weddingId}`} label="Data" type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} disabled={busy} />
          </div>
          <Button type="button" variant="secondary" disabled={busy || parseAmount(receiptAmount) == null || Number(receiptAmount.replace(',', '.')) <= 0} onClick={() => void submit(() => addReceipt.mutateAsync())}>Dodaj wpis</Button>
        </div>
      ) : null}

      {model.clientReceipts.length || model.privateReceipts.length ? (
        <div className={styles.receipts}>
          <h4>Wpłaty</h4>
          {model.clientReceipts.map((item) => <div className={styles.receiptRow} key={`client-${item.paymentId}`}><span>{item.label}<small>Wpłata od klienta · {item.receivedOn}</small></span><strong>{displayMoney(item.amount, model.currency)}</strong></div>)}
          {model.privateReceipts.map((item) => <div className={styles.receiptRow} key={item.id}><span>Prywatna wpłata<small>{item.receivedOn}{item.description ? ` · ${item.description}` : ''}</small></span><strong>{displayMoney(item.amount, model.currency)}</strong>{model.activeMembership ? <button type="button" className={styles.remove} aria-label="Usuń prywatną wpłatę" disabled={busy} onClick={() => void submit(() => deleteReceipt.mutateAsync(item))}>Usuń</button> : null}</div>)}
        </div>
      ) : null}
      {error || mutationError ? <p className={styles.error} role="alert">{error ?? 'Nie udało się zapisać zmian.'}</p> : null}
    </Card>
  )
}
