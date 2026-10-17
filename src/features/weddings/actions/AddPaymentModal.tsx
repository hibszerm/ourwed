import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import {
  defaultPaymentReceiverKey,
  paymentReceiverFields,
  paymentReceiverOptionKey,
  paymentService,
  resolvePaymentReceiverOption,
  type PaymentReceiverOption,
} from '@/lib/api/paymentService'
import { useAuth } from '@/features/auth/AuthProvider'
import { weddingActionsService } from '@/lib/api/weddingActionsService'
import { useInvalidateWedding } from '@/features/weddings/hooks/useInvalidateWedding'
import type { Payment, PaymentMethod, Wedding } from '@/types/wedding'
import formStyles from './actionForm.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

interface AddPaymentModalProps {
  open: boolean
  onClose: () => void
  wedding: Wedding
  /** Prefill as deposit (zadatek) when creating. */
  asDeposit?: boolean
  /** When set, modal edits this payment instead of creating. */
  payment?: Payment | null
}

function depositModalDescription(suggested: number): string {
  if (suggested > 0) {
    return 'Zarejestruj otrzymany zadatek. Kwota została wstępnie uzupełniona na podstawie ustalonej kwoty zadatku.'
  }
  return 'Zarejestruj otrzymany zadatek.'
}

function suggestedDepositAmount(wedding: Wedding, asDeposit: boolean): number {
  if (!asDeposit) return 0
  return weddingActionsService.getSuggestedDepositAmount(wedding)
}

function modalTitle(asDeposit: boolean, editing: boolean): string {
  if (editing) {
    return asDeposit ? 'Edytuj zadatek' : 'Edytuj wpłatę'
  }
  return asDeposit ? 'Dodaj zadatek' : 'Dodaj wpłatę'
}

function modalDescription(
  asDeposit: boolean,
  editing: boolean,
  suggested: number,
): string {
  if (editing) {
    return asDeposit
      ? 'Zmień dane zarejestrowanego zadatku.'
      : 'Zmień dane zarejestrowanej wpłaty.'
  }
  if (asDeposit) return depositModalDescription(suggested)
  return 'Zarejestruj nową wpłatę od pary. Kwoty Wpłacono i Pozostało zaktualizują się od razu.'
}

export function AddPaymentModal({
  open,
  onClose,
  wedding,
  asDeposit = false,
  payment = null,
}: AddPaymentModalProps) {
  const editing = Boolean(payment)
  const treatAsDeposit = payment ? payment.type === 'deposit' : asDeposit
  const suggested = editing
    ? 0
    : suggestedDepositAmount(wedding, treatAsDeposit)
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle(treatAsDeposit, editing)}
      description={modalDescription(treatAsDeposit, editing, suggested)}
      busy={busy}
      size="md"
      showClose
      mobilePresentation="center"
      primaryAction={
        <Button
          type="submit"
          form="add-payment-form"
          variant="primary"
          disabled={busy}
        >
          {busy
            ? 'Zapisywanie…'
            : editing
              ? 'Zapisz'
              : treatAsDeposit
                ? 'Dodaj zadatek'
                : 'Dodaj wpłatę'}
        </Button>
      }
    >
      {open ? (
        <AddPaymentForm
          key={
            payment
              ? `edit-${payment.id}`
              : `${wedding.id}-${treatAsDeposit ? 'deposit' : 'pay'}-${suggested}`
          }
          wedding={wedding}
          asDeposit={treatAsDeposit}
          suggested={suggested}
          payment={payment}
          busy={busy}
          setBusy={setBusy}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  )
}

function AddPaymentForm({
  wedding,
  asDeposit,
  suggested,
  payment,
  busy,
  setBusy,
  onClose,
}: {
  wedding: Wedding
  asDeposit: boolean
  suggested: number
  payment: Payment | null
  busy: boolean
  setBusy: (v: boolean) => void
  onClose: () => void
}) {
  const invalidate = useInvalidateWedding()
  const { user } = useAuth()
  const [amount, setAmount] = useState(() => {
    if (payment) return String(payment.amount)
    return asDeposit && suggested > 0 ? String(suggested) : ''
  })
  const [date, setDate] = useState(
    () =>
      payment?.paidAt?.slice(0, 10) ??
      new Date().toISOString().slice(0, 10),
  )
  const [method, setMethod] = useState<PaymentMethod>(
    () => payment?.method ?? 'transfer',
  )
  const [note, setNote] = useState(() => payment?.note ?? '')
  const [receiverKey, setReceiverKey] = useState<string | null>(() => {
    if (!payment?.receivedByUserId) return null
    return payment.receiverRelationshipId
      ? `collaborator:${payment.receiverRelationshipId}`
      : `owner:${payment.receivedByUserId}`
  })
  const [error, setError] = useState<string | null>(null)
  const receiversQuery = useQuery({
    queryKey: ['wedding-payment-receivers-v3', user?.id, wedding.id],
    queryFn: () => paymentService.listReceivers(wedding.id),
    enabled: true,
    staleTime: 0,
  })
  const receiverOptions = useMemo(() => {
    const options = [...(receiversQuery.data ?? [])]
    if (payment?.receivedByUserId && !options.some((option) =>
      option.relationshipId === (payment.receiverRelationshipId ?? null)
        && option.userId === payment.receivedByUserId,
    )) {
      options.push({
        userId: payment.receivedByUserId,
        relationshipId: payment.receiverRelationshipId ?? null,
        label: payment.receiverLabel ?? 'Historyczny odbiorca',
        kind: payment.receiverKind === 'collaborator' ? 'collaborator' as const : 'owner' as const,
      })
    }
    return options
  }, [payment, receiversQuery.data])
  const selectedReceiverKey = receiverKey ?? (() => {
    return defaultPaymentReceiverKey(receiverOptions)
  })()

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = amount.trim().replace(',', '.')
    if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(parsed) || Number(parsed) <= 0) {
      setError('Podaj poprawną kwotę.')
      return
    }
    if (!date) {
      setError('Podaj datę wpłaty.')
      return
    }
    const receiver = resolvePaymentReceiverOption(receiverOptions, selectedReceiverKey)
    if (!receiver) {
      setError('Wybierz osobę, która otrzymała wpłatę.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      if (payment) {
        await paymentService.update(payment.id, {
          expectedRevision: payment.receiverRevision ?? '1',
          amount: parsed,
          paymentDate: date,
          method,
          note: note.trim() || null,
          paid: true,
          type: payment.type,
          ...paymentReceiverFields(receiver),
        })
      } else {
        await weddingActionsService.addPayment({
          weddingId: wedding.id,
          amount: parsed,
          date,
          method,
          note: note.trim() || undefined,
          type: asDeposit ? 'deposit' : 'installment',
          label: asDeposit ? 'Zadatek' : 'Wpłata',
          ...paymentReceiverFields(receiver),
        })
      }
      await invalidate(wedding.id)
      onClose()
    } catch (err) {
      setError(
        getUserFacingErrorMessage(
          err,
          payment
            ? 'Nie udało się zaktualizować wpłaty.'
            : 'Nie udało się dodać wpłaty.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      id="add-payment-form"
      className={`${formStyles.form} ${formStyles.paymentSheet}`}
      onSubmit={handleSubmit}
    >
      <Input
        id="payment-amount"
        label={`Kwota (${wedding.currency || 'PLN'})`}
        type="number"
        min={1}
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        required
        disabled={busy}
      />
      <Select
        id="payment-receiver"
        label="Otrzymał"
        value={selectedReceiverKey}
        onChange={(event) => setReceiverKey(event.target.value)}
        disabled={busy || receiversQuery.isPending || receiversQuery.isError}
        required
      >
        <option value="">Wybierz osobę</option>
        {receiverOptions.map((option: PaymentReceiverOption) => (
          <option
            key={option.relationshipId ?? option.userId}
            value={paymentReceiverOptionKey(option)}
          >
            {option.label}
          </option>
        ))}
      </Select>
      <Input
        id="payment-date"
        label="Data"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
        disabled={busy}
      />
      <Select
        id="payment-method"
        label="Metoda płatności"
        value={method}
        onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        disabled={busy}
      >
        <option value="transfer">Przelew</option>
        <option value="cash">Gotówka</option>
        <option value="blik">BLIK</option>
        <option value="other">Inne</option>
      </Select>
      <Textarea
        id="payment-note"
        label="Notatka (opcjonalnie)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        disabled={busy}
      />
      {error && (
        <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem', margin: 0 }}>
          {error}
        </p>
      )}
    </form>
  )
}
