import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { paymentService } from '@/lib/api/paymentService'
import { weddingActionsService } from '@/lib/api/weddingActionsService'
import { useInvalidateWedding } from '@/features/weddings/hooks/useInvalidateWedding'
import type { Payment, PaymentMethod, Wedding } from '@/types/wedding'
import formStyles from './actionForm.module.css'

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
      primaryAction={
        <Button
          type="submit"
          form="add-payment-form"
          variant="primary"
          disabled={busy}
        >
          {busy ? 'Zapisywanie…' : 'Zapisz'}
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
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = Number(amount.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Podaj poprawną kwotę.')
      return
    }
    if (!date) {
      setError('Podaj datę wpłaty.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      if (payment) {
        await paymentService.update(payment.id, {
          amount: Math.round(parsed),
          paymentDate: date,
          method,
          note: note.trim() || null,
          paid: true,
          type: payment.type,
        })
      } else {
        await weddingActionsService.addPayment({
          weddingId: wedding.id,
          amount: Math.round(parsed),
          date,
          method,
          note: note.trim() || undefined,
          type: asDeposit ? 'deposit' : 'installment',
          label: asDeposit ? 'Zadatek' : 'Wpłata',
        })
      }
      await invalidate(wedding.id)
      onClose()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : payment
            ? 'Nie udało się zaktualizować wpłaty.'
            : 'Nie udało się dodać wpłaty.',
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
        label="Kwota (PLN)"
        type="number"
        min={1}
        step={1}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        required
        disabled={busy}
      />
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
