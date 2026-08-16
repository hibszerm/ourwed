import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { invalidateSessionFinanceQueries } from '@/features/sessions/invalidateSessionFinanceQueries'
import { sessionPaymentService } from '@/lib/api/sessionPaymentService'
import {
  SESSION_PAYMENT_TYPE_LABELS,
  type PaymentMethod,
  type PaymentType,
  type SessionPayment,
} from '@/types/sessionPayment'
import formStyles from '@/features/weddings/actions/actionForm.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

interface SessionPaymentModalProps {
  open: boolean
  onClose: () => void
  sessionId: string
  payment?: SessionPayment | null
  /** Create mode: default type — deposit for first CTA, installment thereafter. */
  defaultType?: PaymentType
  suggestedAmount?: number
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function SessionPaymentModal({
  open,
  onClose,
  sessionId,
  payment,
  defaultType = 'installment',
  suggestedAmount,
}: SessionPaymentModalProps) {
  const queryClient = useQueryClient()
  const initialType = payment?.type ?? defaultType
  const initialAmount = payment
    ? String(payment.amount)
    : defaultType === 'deposit' &&
        suggestedAmount != null &&
        suggestedAmount > 0
      ? String(suggestedAmount)
      : ''

  const [type, setType] = useState<PaymentType>(initialType)
  const [amount, setAmount] = useState(initialAmount)
  const [paid, setPaid] = useState(payment?.paid ?? true)
  const [date, setDate] = useState(payment?.paidAt?.slice(0, 10) ?? todayIso())
  const [method, setMethod] = useState<PaymentMethod>(
    payment?.method ?? 'transfer',
  )
  const [note, setNote] = useState(payment?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = Number(amount.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Podaj poprawną kwotę.')
      return
    }
    if (paid && !date) {
      setError('Podaj datę wpłaty.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const input = {
        type,
        amount: Math.round(parsed),
        paid,
        paymentDate: paid ? date : null,
        method,
        note: note.trim() || null,
      }
      if (payment) {
        await sessionPaymentService.update(payment.id, input)
      } else {
        await sessionPaymentService.create({
          ...input,
          sessionId,
          note: input.note ?? undefined,
        })
      }
      await invalidateSessionFinanceQueries(queryClient, sessionId)
      onClose()
    } catch (err) {
      setError(
        getUserFacingErrorMessage(err, 'Nie udało się zapisać wpłaty.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const formId = payment
    ? `edit-session-payment-${payment.id}`
    : 'add-session-payment'

  const title = payment
    ? 'Edytuj wpłatę'
    : defaultType === 'deposit'
      ? 'Dodaj zaliczkę'
      : 'Dodaj wpłatę'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={
        defaultType === 'deposit' && !payment
          ? 'Zarejestruj otrzymaną zaliczkę. Ustalona zaliczka na sesji pozostaje wartością umowną.'
          : 'Wpłata zostanie uwzględniona w finansach sesji po oznaczeniu jej jako opłaconej.'
      }
      busy={busy}
      primaryAction={
        <Button
          type="submit"
          form={formId}
          variant="primary"
          disabled={busy}
        >
          {busy ? 'Zapisywanie…' : 'Zapisz'}
        </Button>
      }
    >
      <form
        id={formId}
        className={`${formStyles.form} ${formStyles.paymentSheet}`}
        onSubmit={handleSubmit}
      >
        <Select
          id={`${formId}-type`}
          label="Rodzaj"
          value={type}
          onChange={(event) => setType(event.target.value as PaymentType)}
          disabled={busy}
        >
          {Object.entries(SESSION_PAYMENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Input
          id={`${formId}-amount`}
          label="Kwota (zł)"
          type="number"
          min={1}
          step={1}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
          disabled={busy}
        />
        <label className={formStyles.checkRow}>
          <input
            type="checkbox"
            checked={paid}
            onChange={(event) => setPaid(event.target.checked)}
            disabled={busy}
          />
          <span>Opłacona</span>
        </label>
        {paid ? (
          <Input
            id={`${formId}-date`}
            label="Data wpłaty"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
            disabled={busy}
          />
        ) : null}
        <Select
          id={`${formId}-method`}
          label="Metoda"
          value={method}
          onChange={(event) =>
            setMethod(event.target.value as PaymentMethod)
          }
          disabled={busy}
        >
          <option value="transfer">Przelew</option>
          <option value="cash">Gotówka</option>
          <option value="blik">BLIK</option>
          <option value="other">Inne</option>
        </Select>
        <Textarea
          id={`${formId}-note`}
          label="Notatka (opcjonalnie)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          disabled={busy}
        />
        {error ? (
          <p
            role="alert"
            style={{
              color: 'var(--color-error)',
              fontSize: '0.875rem',
              margin: 0,
            }}
          >
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
