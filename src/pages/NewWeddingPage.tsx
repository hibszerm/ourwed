import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { IconArrowLeft, IconChevronRight } from '@/components/icons'
import { useCreateWedding } from '@/features/weddings/hooks/useCreateWedding'
import { studioPackages } from '@/lib/catalog/packages'
import { coupleName, formatDate } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import { WORKFLOW_STAGE_LABELS } from '@/lib/utils/workflow'
import styles from './NewWeddingPage.module.css'

const STEPS = [
  { id: 1, label: 'Para' },
  { id: 2, label: 'Pakiet' },
  { id: 3, label: 'Lokalizacja' },
  { id: 4, label: 'Podsumowanie' },
] as const

const schema = z.object({
  partner1: z.string().min(1, 'Podaj imię pierwszej osoby'),
  partner2: z.string().min(1, 'Podaj imię drugiej osoby'),
  date: z.string().min(1, 'Wybierz datę ślubu'),
  packageName: z.string().min(1, 'Wybierz pakiet'),
  price: z.number({ error: 'Podaj cenę' }).min(1, 'Podaj cenę'),
  depositPaid: z.boolean(),
  depositAmount: z.number().optional(),
  depositPaymentDate: z.string().optional(),
  ceremonyLocation: z.string().optional(),
  receptionLocation: z.string().optional(),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.depositPaid) {
    if (!data.depositAmount || data.depositAmount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['depositAmount'],
        message: 'Podaj kwotę zaliczki',
      })
    }
    if (!data.depositPaymentDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['depositPaymentDate'],
        message: 'Podaj datę wpłaty zaliczki',
      })
    }
  }
})

type FormValues = z.infer<typeof schema>

const stepFields: (keyof FormValues)[][] = [
  ['partner1', 'partner2', 'date'],
  ['packageName', 'price', 'depositPaid', 'depositAmount', 'depositPaymentDate'],
  ['ceremonyLocation', 'receptionLocation'],
  ['notes'],
]

export function NewWeddingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefillDate = searchParams.get('date') ?? ''
  const createWedding = useCreateWedding()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [isSuccess, setIsSuccess] = useState(false)
  const [priceAutoFilledOnce, setPriceAutoFilledOnce] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      partner1: '',
      partner2: '',
      date: /^\d{4}-\d{2}-\d{2}$/.test(prefillDate) ? prefillDate : '',
      ceremonyLocation: '',
      receptionLocation: '',
      packageName: studioPackages[0]?.name ?? '',
      price: studioPackages[0]?.price ?? 0,
      depositPaid: false,
      depositAmount: undefined,
      depositPaymentDate: '',
      notes: '',
    },
  })

  const values = watch()
  const selectedPackage = watch('packageName')
  const depositPaid = watch('depositPaid')
  const depositAmount = watch('depositAmount')

  useEffect(() => {
    // One-time auto-fill: never overwrite the user price again.
    if (priceAutoFilledOnce) return
    const pkg = studioPackages.find((p) => p.name === selectedPackage)
    if (!pkg) return

    const priceIsDirty = Boolean(dirtyFields.price)
    if (!priceIsDirty) {
      setValue('price', pkg.price, { shouldDirty: false })
    }

    setPriceAutoFilledOnce(true)
  }, [selectedPackage, dirtyFields.price, priceAutoFilledOnce, setValue])

  useEffect(() => {
    if (depositPaid) {
      if (!depositAmount || depositAmount <= 0) {
        setValue('depositAmount', Math.round((values.price || 0) * 0.3))
      }
      if (!values.depositPaymentDate) {
        setValue('depositPaymentDate', new Date().toISOString().slice(0, 10))
      }
    } else {
      setValue('depositAmount', undefined)
      setValue('depositPaymentDate', '')
    }
  }, [depositAmount, depositPaid, setValue, values.depositPaymentDate, values.price])

  async function goNext() {
    const valid = await trigger(stepFields[step])
    if (!valid) return
    setDirection('forward')
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function goBack() {
    setDirection('back')
    setStep((s) => Math.max(s - 1, 0))
  }

  const handleCreate = handleSubmit(async (data) => {
    if (step !== STEPS.length - 1) return
    try {
      const wedding = await createWedding.mutateAsync(data)
      setIsSuccess(true)
      window.setTimeout(() => {
        navigate(`/sluby/${wedding.id}`)
      }, 950)
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Nie udało się utworzyć ślubu.',
      )
    }
  })

  const isLastStep = step === STEPS.length - 1
  const workflowLabel = depositPaid
    ? WORKFLOW_STAGE_LABELS.deposit
    : WORKFLOW_STAGE_LABELS.reservation

  return (
    <AppLayout
      title="Nowy ślub"
      subtitle="Dodaj parę po potwierdzeniu rezerwacji terminu"
      action={
        <Link to="/sluby">
          <Button variant="ghost">
            <IconArrowLeft />
            Anuluj
          </Button>
        </Link>
      }
    >
      <PageContainer width="narrow">
        <div className={styles.wizard}>
        <nav className={styles.progress} aria-label="Postęp kreatora">
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <ol className={styles.steps}>
            {STEPS.map((s, i) => (
              <li
                key={s.id}
                className={`${styles.stepItem} ${i <= step ? styles.stepDone : ''} ${i === step ? styles.stepActive : ''}`}
              >
                <span className={styles.stepDot}>{s.id}</span>
                <span className={styles.stepLabel}>{s.label}</span>
              </li>
            ))}
          </ol>
        </nav>

        <form
          className={styles.form}
          onSubmit={(e) => {
            // Summary must never auto-submit. Creation happens only via the explicit CTA.
            e.preventDefault()
          }}
          noValidate
        >
          <div
            key={step}
            className={`${styles.panel} ${direction === 'forward' ? styles.enterForward : styles.enterBack} ${isSuccess ? styles.panelSuccess : ''}`}
          >
            {step === 0 && (
              <>
                <header className={styles.panelHeader}>
                  <p className={styles.eyebrow}>Krok 1 z 4</p>
                  <h2 className={styles.title}>Kto się żeni?</h2>
                  <p className={styles.subtitle}>Podstawowe dane pary i termin ślubu.</p>
                </header>

                <div className={styles.fields}>
                  <label className={styles.field}>
                    <span className={styles.label}>Imię pierwszej osoby</span>
                    <input
                      className={styles.input}
                      placeholder="np. Anna"
                      autoFocus
                      {...register('partner1')}
                    />
                    {errors.partner1 && (
                      <span className={styles.error}>{errors.partner1.message}</span>
                    )}
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Imię drugiej osoby</span>
                    <input
                      className={styles.input}
                      placeholder="np. Michał"
                      {...register('partner2')}
                    />
                    {errors.partner2 && (
                      <span className={styles.error}>{errors.partner2.message}</span>
                    )}
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Data ślubu</span>
                    <input className={styles.input} type="date" {...register('date')} />
                    {errors.date && (
                      <span className={styles.error}>{errors.date.message}</span>
                    )}
                  </label>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <header className={styles.panelHeader}>
                  <p className={styles.eyebrow}>Krok 2 z 4</p>
                  <h2 className={styles.title}>Pakiet i płatność</h2>
                  <p className={styles.subtitle}>Wybierz zakres usług i ustal status zaliczki.</p>
                </header>

                <div className={styles.fields}>
                  <label className={styles.field}>
                    <span className={styles.label}>Pakiet</span>
                    <select className={styles.input} {...register('packageName')}>
                      {studioPackages.map((pkg) => (
                        <option key={pkg.id} value={pkg.name}>
                          {pkg.name}
                        </option>
                      ))}
                    </select>
                    {errors.packageName && (
                      <span className={styles.error}>{errors.packageName.message}</span>
                    )}
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Cena (PLN)</span>
                    <input
                      className={styles.input}
                      type="number"
                      {...register('price', { valueAsNumber: true })}
                    />
                    {errors.price && (
                      <span className={styles.error}>{errors.price.message}</span>
                    )}
                  </label>

                  <fieldset className={styles.field}>
                    <legend className={styles.label}>Zaliczka już wpłacona?</legend>
                    <div className={styles.toggle}>
                      <button
                        type="button"
                        className={`${styles.toggleBtn} ${!depositPaid ? styles.toggleActive : ''}`}
                        onClick={() => setValue('depositPaid', false)}
                      >
                        Nie
                      </button>
                      <button
                        type="button"
                        className={`${styles.toggleBtn} ${depositPaid ? styles.toggleActive : ''}`}
                        onClick={() => setValue('depositPaid', true)}
                      >
                        Tak
                      </button>
                    </div>
                    <input type="hidden" {...register('depositPaid')} />
                  </fieldset>

                  {depositPaid && (
                    <>
                      <label className={styles.field}>
                        <span className={styles.label}>Kwota zaliczki (PLN)</span>
                        <input
                          className={styles.input}
                          type="number"
                          {...register('depositAmount', { valueAsNumber: true })}
                        />
                        {errors.depositAmount && (
                          <span className={styles.error}>{errors.depositAmount.message}</span>
                        )}
                      </label>

                      <label className={styles.field}>
                        <span className={styles.label}>Data wpłaty zaliczki</span>
                        <input
                          className={styles.input}
                          type="date"
                          {...register('depositPaymentDate')}
                        />
                        {errors.depositPaymentDate && (
                          <span className={styles.error}>{errors.depositPaymentDate.message}</span>
                        )}
                      </label>
                    </>
                  )}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <header className={styles.panelHeader}>
                  <p className={styles.eyebrow}>Krok 3 z 4</p>
                  <h2 className={styles.title}>Lokalizacje</h2>
                  <p className={styles.subtitle}>Miejsca ceremonii i przyjęcia — opcjonalnie na tym etapie.</p>
                </header>

                <div className={styles.fields}>
                  <label className={styles.field}>
                    <span className={styles.label}>Miejsce ceremonii</span>
                    <input
                      className={styles.input}
                      placeholder="Opcjonalnie"
                      autoFocus
                      {...register('ceremonyLocation')}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Miejsce przyjęcia</span>
                    <input
                      className={styles.input}
                      placeholder="Opcjonalnie"
                      {...register('receptionLocation')}
                    />
                  </label>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <header className={styles.panelHeader}>
                  <p className={styles.eyebrow}>Krok 4 z 4</p>
                  <h2 className={styles.title}>Notatki i podsumowanie</h2>
                  <p className={styles.subtitle}>Sprawdź dane przed utworzeniem ślubu.</p>
                </header>

                <div className={styles.fields}>
                  <label className={styles.field}>
                    <span className={styles.label}>Notatki</span>
                    <textarea
                      className={`${styles.input} ${styles.textarea}`}
                      rows={3}
                      placeholder="Opcjonalnie — preferencje pary, ustalenia ze spotkania..."
                      {...register('notes')}
                    />
                  </label>

                  <div className={styles.summary}>
                    <div className={styles.previewHeader}>
                      <p className={styles.previewKicker}>Podgląd zlecenia</p>
                      <h3 className={styles.previewTitle}>
                        {values.partner1 && values.partner2
                          ? coupleName(values.partner1, values.partner2)
                          : 'Nowe zlecenie'}
                      </h3>
                    </div>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>Para</span>
                      <span className={styles.summaryValue}>
                        {values.partner1 && values.partner2
                          ? coupleName(values.partner1, values.partner2)
                          : '—'}
                      </span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>Data ślubu</span>
                      <span className={styles.summaryValue}>
                        {values.date ? formatDate(values.date) : '—'}
                      </span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>Pakiet</span>
                      <span className={styles.summaryValue}>{values.packageName || '—'}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>Cena</span>
                      <span className={styles.summaryValue}>
                        {values.price ? formatCurrency(values.price) : '—'}
                      </span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>Zaliczka</span>
                      <span className={styles.summaryValue}>
                        {depositPaid
                          ? `${formatCurrency(values.depositAmount ?? 0)} (${values.depositPaymentDate ? formatDate(values.depositPaymentDate) : 'bez daty'})`
                          : 'Nie wpłacona'}
                      </span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>Etap startowy</span>
                      <span className={styles.summaryValue}>{workflowLabel}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>Ceremonia</span>
                      <span className={styles.summaryValue}>
                        {values.ceremonyLocation || '—'}
                      </span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>Przyjęcie</span>
                      <span className={styles.summaryValue}>
                        {values.receptionLocation || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <footer className={styles.footer}>
            {step > 0 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={goBack}
                disabled={isSubmitting || createWedding.isPending || isSuccess}
              >
                Wstecz
              </Button>
            ) : (
              <span />
            )}

            {isLastStep ? (
              <Button
                type="button"
                variant="primary"
                disabled={isSubmitting || createWedding.isPending || isSuccess}
                onClick={handleCreate}
              >
                {isSuccess
                  ? 'Gotowe...'
                  : createWedding.isPending
                    ? 'Tworzenie...'
                    : 'Utwórz zlecenie'}
              </Button>
            ) : (
              <Button type="button" variant="primary" onClick={goNext}>
                Dalej
                <IconChevronRight width={16} height={16} />
              </Button>
            )}
          </footer>
        </form>
      </div>
      </PageContainer>
    </AppLayout>
  )
}
