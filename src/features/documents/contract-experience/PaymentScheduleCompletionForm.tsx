/**
 * Manual payment schedule completion form (production Polish UI).
 */

import { useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import {
  formatPlnMajorUnits,
  type DetectedPaymentSchedule,
} from '@/features/documents/template/payment-schedule'
import styles from './PaymentScheduleCompletionForm.module.css'

const entrySchema = z.object({
  entryId: z.string(),
  amount: z
    .string()
    .min(1, 'Podaj kwotę')
    .refine((v) => {
      const n = Number(v.replace(/\s/g, '').replace(',', '.'))
      return Number.isFinite(n) && n > 0 && Number.isInteger(Math.round(n))
    }, 'Kwota musi być dodatnią liczbą całkowitą'),
  dueDateText: z.string().optional(),
})

const formSchema = z.object({
  entries: z.array(entrySchema).min(1),
})

export type PaymentScheduleFormValues = z.infer<typeof formSchema>

function parseAmountMajor(raw: string): number {
  return Math.round(Number(raw.replace(/\s/g, '').replace(',', '.')))
}

export function PaymentScheduleCompletionForm(props: {
  schedule: DetectedPaymentSchedule
  busy?: boolean
  onCancel: () => void
  onSubmit: (input: {
    entries: Array<{
      entryId: string
      amount: number
      dueDateText?: string | null
    }>
  }) => void | Promise<void>
}) {
  const defaults = useMemo(
    () => ({
      entries: props.schedule.entries.map((e) => ({
        entryId: e.id,
        amount:
          e.amount != null ? String(e.amount) : '',
        dueDateText: e.dueDateText ?? e.dueDate ?? '',
      })),
    }),
    [props.schedule],
  )

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<PaymentScheduleFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
    mode: 'onChange',
  })

  const watched = useWatch({ control, name: 'entries' }) ?? defaults.entries
  const sum = watched.reduce((n, e) => {
    const v = e.amount?.trim() ? parseAmountMajor(e.amount) : 0
    return n + (Number.isFinite(v) ? v : 0)
  }, 0)
  const total = props.schedule.totalContractAmount
  const remaining = total - sum
  const allFilled = watched.every(
    (e, i) => {
      const entry = props.schedule.entries[i]
      if (!e.amount?.trim()) return false
      if (entry?.requiresManualDueDate && !e.dueDateText?.trim()) return false
      return true
    },
  )
  const sumOk = sum === total
  const canSubmit = allFilled && sumOk && !props.busy

  return (
    <section className={styles.card} aria-labelledby="payment-schedule-heading">
      <p className={styles.eyebrow}>Uzupełnienie umowy</p>
      <h2 id="payment-schedule-heading">Umowa wymaga uzupełnienia</h2>
      <p className={styles.lead}>
        Ten szablon zawiera niestandardowy harmonogram płatności. OurWed nie może
        bezpiecznie wyznaczyć wszystkich rat automatycznie. Uzupełnij kwoty i
        terminy poniżej.
      </p>

      <form
        className={styles.form}
        onSubmit={handleSubmit(async (values) => {
          await props.onSubmit({
            entries: values.entries.map((e) => ({
              entryId: e.entryId,
              amount: parseAmountMajor(e.amount),
              dueDateText: e.dueDateText?.trim() || null,
            })),
          })
        })}
      >
        <div className={styles.entries}>
          {props.schedule.entries.map((entry, index) => (
            <fieldset key={entry.id} className={styles.entry}>
              <legend className={styles.entryLabel}>{entry.label}</legend>
              {entry.amountSource === 'ourwed' && entry.amount != null ? (
                <p className={styles.sourceHint}>
                  Kwota z OurWed: {formatPlnMajorUnits(entry.amount)}
                </p>
              ) : (
                <p className={styles.sourceHintRequired}>Wymaga uzupełnienia</p>
              )}
              <label className={styles.field}>
                <span>Termin płatności</span>
                <input
                  type="text"
                  {...register(`entries.${index}.dueDateText`)}
                  disabled={props.busy}
                />
              </label>
              <label className={styles.field}>
                <span>Kwota (zł)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="np. 4500"
                  {...register(`entries.${index}.amount`)}
                  disabled={
                    props.busy ||
                    (entry.amountSource === 'ourwed' && !entry.requiresManualAmount)
                  }
                />
                {errors.entries?.[index]?.amount ? (
                  <span className={styles.fieldError}>
                    {errors.entries[index]?.amount?.message}
                  </span>
                ) : null}
              </label>
              <input type="hidden" {...register(`entries.${index}.entryId`)} />
            </fieldset>
          ))}
        </div>

        <dl className={styles.totals}>
          <div>
            <dt>Wartość umowy</dt>
            <dd>{formatPlnMajorUnits(total)}</dd>
          </div>
          <div>
            <dt>Suma płatności</dt>
            <dd>{formatPlnMajorUnits(sum)}</dd>
          </div>
          <div>
            <dt>
              {remaining < 0
                ? 'Przekroczono wartość umowy o'
                : 'Pozostało do rozdzielenia'}
            </dt>
            <dd data-over={remaining < 0 ? 'true' : undefined}>
              {formatPlnMajorUnits(Math.abs(remaining))}
            </dd>
          </div>
        </dl>

        <div className={styles.actions}>
          <Button
            type="button"
            variant="ghost"
            onClick={props.onCancel}
            disabled={props.busy}
          >
            Anuluj
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            Zastosuj i utwórz podgląd
          </Button>
        </div>
      </form>
    </section>
  )
}
