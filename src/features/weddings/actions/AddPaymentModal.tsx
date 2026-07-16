import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { weddingActionsService } from '@/lib/api/weddingActionsService'
import { useInvalidateWedding } from '@/features/weddings/hooks/useInvalidateWedding'
import type { PaymentMethod, Wedding } from '@/types/wedding'
import formStyles from './actionForm.module.css'

interface AddPaymentModalProps {
  open: boolean
  onClose: () => void
  wedding: Wedding
  /** Prefill as deposit (zadatek). */
  asDeposit?: boolean
}

export function AddPaymentModal({
  open,
  onClose,
  wedding,
  asDeposit = false,
}: AddPaymentModalProps) {
  const invalidate = useInvalidateWedding()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('transfer')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const today = new Date().toISOString().slice(0, 10)
    setDate(today)
    setMethod('transfer')
    setNote('')
    setError(null)
    setBusy(false)

    if (asDeposit) {
      setAmount(String(weddingActionsService.getSuggestedDepositAmount(wedding)))
    } else {
      setAmount('')
    }
  }, [open, asDeposit, wedding])

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
      await weddingActionsService.addPayment({
        weddingId: wedding.id,
        amount: Math.round(parsed),
        date,
        method,
        note: note.trim() || undefined,
        type: asDeposit ? 'deposit' : 'installment',
        label: asDeposit ? 'Zadatek' : 'Wpłata',
      })
      await invalidate(wedding.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się dodać wpłaty.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={asDeposit ? 'Dodaj zadatek' : 'Dodaj wpłatę'}
      description={
        asDeposit
          ? 'Zarejestruj wpłatę zadatku. Kwota została wstępnie uzupełniona według ustawień (30% wartości umowy).'
          : 'Zarejestruj nową wpłatę od pary. Kwoty Wpłacono i Pozostało zaktualizują się od razu.'
      }
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
      <form id="add-payment-form" className={formStyles.form} onSubmit={handleSubmit}>
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
    </Modal>
  )
}
