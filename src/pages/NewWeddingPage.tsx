import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageContainer } from '@/components/ui/PageContainer'
import { AddressField, type AddressFieldValue } from '@/features/forms/AddressField'
import { useCreateWedding } from '@/features/weddings/hooks/useCreateWedding'
import { useCreateFullWedding } from '@/features/weddings/hooks/useCreateFullWedding'
import { useWeddings } from '@/features/weddings/hooks/useWeddings'
import { buildNewWeddingCreatePayload } from '@/features/weddings/buildNewWeddingCreatePayload'
import { buildFullWeddingCreateInput } from '@/features/weddings/buildFullWeddingCreateInput'
import {
  formatContractAddressEditorial,
  hasStructuredPostalCity,
  splitContractAddressField,
} from '@/features/weddings/contractAddressFromField'
import {
  isFullCreatePartialError,
} from '@/features/weddings/createFullWedding'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { useProMutationPageGuard } from '@/features/billing/useProMutationPageGuard'
import { useQuery } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { markGuideDiscoveryEligibleIfFirstBooking } from '@/lib/guideDiscovery/eligibleSession'
import { extraServiceService } from '@/lib/api/extraServiceService'
import { packageService } from '@/lib/api/packageService'
import { weddingListLightService } from '@/lib/api/weddingListLightService'
import { computeWeddingContractValue } from '@/lib/forms/weddingExtraPricing'
import { coupleName, formatDate } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import { subscribeVisualViewport } from '@/components/ui/visualViewportBounds'
import styles from './NewWeddingPage.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

const FULL_STEPS = [
  { id: 1, label: 'Para' },
  { id: 2, label: 'Pakiet' },
  { id: 3, label: 'Miejsca' },
  { id: 4, label: 'Podsumowanie' },
] as const

const QUICK_STEPS = [
  { id: 1, label: 'Para' },
  { id: 2, label: 'Podsumowanie' },
] as const

const STEP_COPY = [
  {
    title: 'Kto się żeni?',
    subtitle: 'Podstawowe dane pary i termin ślubu.',
  },
  {
    title: 'Pakiet i płatność',
    subtitle: 'Wybierz zakres usług i ustal status zaliczki.',
  },
  {
    title: 'Miejsca',
    subtitle: 'Przygotowania, ceremonia i przyjęcie — opcjonalnie na tym etapie.',
  },
  {
    title: 'Podsumowanie',
    subtitle: 'Sprawdź dane przed utworzeniem ślubu.',
  },
] as const

const extrasSchema = z.array(
  z.object({
    extraServiceId: z.string(),
    name: z.string(),
    priceSnapshot: z.number(),
  }),
)

const locationSchema = z.custom<AddressFieldValue>().optional()

function locationLabel(value: AddressFieldValue | undefined): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  return value.formattedAddress?.trim() || value.name?.trim() || ''
}

const schema = z.object({
  partner1: z.string().min(1, 'Podaj imię i nazwisko panny młodej'),
  partner2: z.string().min(1, 'Podaj imię i nazwisko pana młodego'),
  date: z.string().min(1, 'Wybierz datę ślubu'),
  completeLater: z.boolean(),
  partner1Phone: z.string(),
  partner2Phone: z.string(),
  email: z.string(),
  contractAddress: locationSchema,
  partner1PostalCode: z.string(),
  partner1City: z.string(),
  packageId: z.string(),
  packageName: z.string(),
  price: z.number({ error: 'Podaj cenę' }).min(0, 'Podaj cenę'),
  depositAmountCatalog: z.number().optional(),
  currency: z.string().optional(),
  accentColor: z.string().optional(),
  depositPaid: z.boolean(),
  depositAmount: z.number().optional(),
  depositPaymentDate: z.string().optional(),
  extras: extrasSchema,
  bridePreparation: locationSchema,
  groomPreparation: locationSchema,
  ceremony: locationSchema,
  reception: locationSchema,
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.completeLater) return

  if (!data.partner1Phone.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['partner1Phone'],
      message: 'Podaj telefon panny młodej',
    })
  }
  if (!data.partner2Phone.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['partner2Phone'],
      message: 'Podaj telefon pana młodego',
    })
  }
  const email = data.email.trim()
  if (!email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['email'],
      message: 'Podaj adres e-mail',
    })
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['email'],
      message: 'Podaj poprawny adres e-mail',
    })
  }
  if (!locationLabel(data.contractAddress)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['contractAddress'],
      message: 'Podaj adres do umowy',
    })
  }
  if (!data.partner1PostalCode.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['partner1PostalCode'],
      message: 'Podaj kod pocztowy',
    })
  }
  if (!data.partner1City.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['partner1City'],
      message: 'Podaj miasto',
    })
  }
  if (!data.packageId.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['packageId'],
      message: 'Wybierz pakiet',
    })
  }
  if (!data.packageName.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['packageName'],
      message: 'Wybierz pakiet',
    })
  }
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

const QUICK_STEP_0_FIELDS: (keyof FormValues)[] = ['partner1', 'partner2', 'date']
const FULL_STEP_0_FIELDS: (keyof FormValues)[] = [
  'partner1',
  'partner1Phone',
  'partner2',
  'partner2Phone',
  'email',
  'contractAddress',
  'partner1PostalCode',
  'partner1City',
  'date',
]
const STEP_1_FIELDS: (keyof FormValues)[] = [
  'packageId',
  'packageName',
  'price',
  'depositPaid',
  'depositAmount',
  'depositPaymentDate',
]
const STEP_3_FIELDS: (keyof FormValues)[] = ['notes']

const FIELD_ORDER: (keyof FormValues)[] = [
  ...FULL_STEP_0_FIELDS,
  ...STEP_1_FIELDS,
  ...STEP_3_FIELDS,
]

function revealField(name: keyof FormValues) {
  const el = document.querySelector<HTMLElement>(
    `[name="${name}"], [id="${name}"], [data-field="${name}"]`,
  )
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

export function NewWeddingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefillDate = searchParams.get('date') ?? ''
  /** First-run / migration shortcut: start in quick-create path. */
  const preferQuickCreate = searchParams.get('quick') === '1'
  const createWedding = useCreateWedding()
  const createFullWedding = useCreateFullWedding()
  const { data: existingWeddings = [] } = useWeddings()
  const { requirePro } = useProAccessGate()
  useProMutationPageGuard('/sluby')
  const userId = useStudioAuthId()
  const {
    data: packages,
    isPending: packagesPending,
    isSuccess: packagesSuccess,
    isError: packagesError,
  } = useQuery({
    queryKey: ['studio-packages', userId, 'active'],
    queryFn: () => packageService.list({ activeOnly: true }),
    enabled: Boolean(userId),
  })
  const {
    data: extraCatalog,
    isPending: extrasPending,
    isSuccess: extrasSuccess,
    isError: extrasError,
  } = useQuery({
    queryKey: ['studio-extra-services', userId, 'active'],
    queryFn: () => extraServiceService.list({ activeOnly: true }),
    enabled: Boolean(userId),
  })
  const packagesLoading = packagesPending || !packagesSuccess
  const packageList = packagesSuccess && packages ? packages : undefined
  const extrasCatalog = extrasSuccess && extraCatalog ? extraCatalog : []
  const [step, setStep] = useState(0)
  const [isSuccess, setIsSuccess] = useState(false)
  const [priceAutoFilledOnce, setPriceAutoFilledOnce] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    control,
    setFocus,
    getFieldState,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      partner1: '',
      partner2: '',
      date: /^\d{4}-\d{2}-\d{2}$/.test(prefillDate) ? prefillDate : '',
      completeLater: preferQuickCreate,
      partner1Phone: '',
      partner2Phone: '',
      email: '',
      contractAddress: '',
      partner1PostalCode: '',
      partner1City: '',
      extras: [],
      bridePreparation: '',
      groomPreparation: '',
      ceremony: '',
      reception: '',
      packageId: '',
      packageName: '',
      price: 0,
      depositAmountCatalog: undefined,
      currency: 'PLN',
      accentColor: undefined,
      depositPaid: false,
      depositAmount: undefined,
      depositPaymentDate: '',
      notes: '',
    },
  })

  const values = watch()
  const selectedPackageId = watch('packageId')
  const depositPaid = watch('depositPaid')
  const depositAmount = watch('depositAmount')
  const completeLater = watch('completeLater')
  const selectedExtras = watch('extras')
  const pathSteps = completeLater ? QUICK_STEPS : FULL_STEPS

  useEffect(() => {
    if (completeLater && step > 1) setStep(1)
  }, [completeLater, step])

  useEffect(() => {
    if (!packageList) return
    const pkg = packageList.find((p) => p.id === selectedPackageId)
    if (!pkg) return

    setValue('packageName', pkg.name, { shouldDirty: false })
    setValue('depositAmountCatalog', pkg.depositAmount, { shouldDirty: false })
    setValue('currency', pkg.currency, { shouldDirty: false })
    setValue('accentColor', pkg.color ?? undefined, { shouldDirty: false })

    const priceIsDirty = Boolean(dirtyFields.price)
    if (!priceIsDirty || !priceAutoFilledOnce) {
      setValue('price', pkg.price, { shouldDirty: false })
    }
    if (!depositPaid) {
      setValue('depositAmount', pkg.depositAmount, { shouldDirty: false })
    }
    setPriceAutoFilledOnce(true)
  }, [
    selectedPackageId,
    packageList,
    dirtyFields.price,
    priceAutoFilledOnce,
    setValue,
    depositPaid,
  ])

  useEffect(() => {
    if (depositPaid) {
      // Prefill from package catalog only — never invent % of contract value.
      if (!depositAmount || depositAmount <= 0) {
        const fromCatalog = values.depositAmountCatalog
        if (fromCatalog != null && fromCatalog > 0) {
          setValue('depositAmount', fromCatalog)
        }
      }
      if (!values.depositPaymentDate) {
        setValue('depositPaymentDate', new Date().toISOString().slice(0, 10))
      }
    } else {
      setValue('depositAmount', undefined)
      setValue('depositPaymentDate', '')
    }
  }, [
    depositAmount,
    depositPaid,
    setValue,
    values.depositPaymentDate,
    values.depositAmountCatalog,
  ])

  useEffect(() => {
    return subscribeVisualViewport((bounds) => {
      if (typeof window === 'undefined') return
      const mobile = window.matchMedia('(max-width: 767px)').matches
      setKeyboardOpen(
        mobile &&
          bounds.fromVisualViewport &&
          window.innerHeight - bounds.height > 80,
      )
    })
  }, [])

  function focusFirstInvalid(names: (keyof FormValues)[]) {
    const first = names.find((name) => getFieldState(name).invalid)
    if (!first) return
    setFocus(first)
    window.requestAnimationFrame(() => revealField(first))
  }

  function fieldsForStep(index: number): (keyof FormValues)[] {
    if (index === 0) {
      return completeLater ? QUICK_STEP_0_FIELDS : FULL_STEP_0_FIELDS
    }
    if (completeLater) return []
    if (index === 1) return STEP_1_FIELDS
    if (index === 2) return []
    return STEP_3_FIELDS
  }

  async function goNext() {
    const names = fieldsForStep(step)
    if (names.length > 0) {
      // Trigger one field at a time so a later-step schema issue (package)
      // cannot block Full Step 1. Array trigger() treats any schema error as failure.
      const results = await Promise.all(names.map((name) => trigger(name)))
      if (results.some((ok) => !ok)) {
        focusFirstInvalid(names)
        return
      }
    }
    setStep((s) => Math.min(s + 1, pathSteps.length - 1))
    window.scrollTo(0, 0)
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0))
    window.scrollTo(0, 0)
  }

  const isLastStep = step === pathSteps.length - 1
  const creating =
    createWedding.isPending || createFullWedding.isPending

  const handleCreate = handleSubmit(
    async (data) => {
      if (!isLastStep) return
      const allowed = requirePro()
      if (!allowed) return
      // Authoritative prior count BEFORE mutation — never trust stale list cache
      // (e.g. after out-of-band delete) and never infer prior after create.
      let priorHistoryCount = existingWeddings.length
      try {
        priorHistoryCount =
          await weddingListLightService.countWeddingHistory()
      } catch {
        // Fall back to list length if head-count fails (rare).
      }
      try {
        // Quick Create: useCreateWedding + sanitizer. Full Create: useCreateFullWedding.
        // Do not route Quick through createFullWedding.
        const wedding = data.completeLater
          ? await createWedding.mutateAsync(buildNewWeddingCreatePayload(data))
          : (
              await createFullWedding.mutateAsync(
                buildFullWeddingCreateInput(data, {
                  priceIsDirty: Boolean(dirtyFields.price),
                }),
              )
            ).wedding
        markGuideDiscoveryEligibleIfFirstBooking(priorHistoryCount)
        setIsSuccess(true)
        window.setTimeout(() => {
          navigate(`/sluby/${wedding.id}`)
        }, 950)
      } catch (err) {
        if (isFullCreatePartialError(err)) {
          // Wedding exists — first-booking marker still applies from pre-mutation prior.
          markGuideDiscoveryEligibleIfFirstBooking(priorHistoryCount)
          window.alert(
            getUserFacingErrorMessage(
              err,
              'Zlecenie zostało utworzone, ale nie udało się zapisać wszystkich danych.',
            ),
          )
          navigate(`/sluby/${err.weddingId}`)
          return
        }
        window.alert(
          getUserFacingErrorMessage(err, 'Nie udało się utworzyć ślubu.'),
        )
      }
    },
    (errs) => {
      const first = FIELD_ORDER.find((name) => Boolean(errs[name]))
      if (!first) return
      setFocus(first)
      window.requestAnimationFrame(() => revealField(first))
    },
  )

  const actionsLocked = isSubmitting || creating || isSuccess
  const identity =
    values.partner1 && values.partner2
      ? coupleName(values.partner1, values.partner2)
      : 'Nowe zlecenie'
  const depositSummary = depositPaid
    ? [
        formatCurrency(values.depositAmount ?? 0),
        values.depositPaymentDate
          ? `wpłacona ${formatDate(values.depositPaymentDate)}`
          : 'bez daty',
      ].join(' · ')
    : 'Nie wpłacona'
  const previewTotal = computeWeddingContractValue({
    packageBasePrice: values.price,
    extras: selectedExtras.map((extra) => ({
      priceSnapshot: extra.priceSnapshot,
      quantity: 1,
    })),
    effectiveTravelFee: 0,
  })
  const availableExtras = extrasCatalog.filter(
    (service) =>
      !selectedExtras.some((extra) => extra.extraServiceId === service.id),
  )

  const showQuickSummary = completeLater && step === 1
  const showPackageStep = !completeLater && step === 1
  const showLocationStep = !completeLater && step === 2
  const showFullSummary = !completeLater && step === 3
  const stepCopyIndex = showQuickSummary ? 3 : step

  function addExtra(serviceId: string) {
    const service = extrasCatalog.find((row) => row.id === serviceId)
    if (!service) return
    if (selectedExtras.some((extra) => extra.extraServiceId === service.id)) {
      return
    }
    setValue(
      'extras',
      [
        ...selectedExtras,
        {
          extraServiceId: service.id,
          name: service.name,
          priceSnapshot: service.price,
        },
      ],
      { shouldDirty: true },
    )
  }

  function removeExtra(extraServiceId: string) {
    setValue(
      'extras',
      selectedExtras.filter((extra) => extra.extraServiceId !== extraServiceId),
      { shouldDirty: true },
    )
  }

  const placeRows = [
    { label: 'Przygotowania panny młodej', value: locationLabel(values.bridePreparation) },
    { label: 'Przygotowania pana młodego', value: locationLabel(values.groomPreparation) },
    { label: 'Ceremonia', value: locationLabel(values.ceremony) },
    { label: 'Przyjęcie', value: locationLabel(values.reception) },
  ].filter((row) => row.value)

  return (
    <AppLayout>
      <PageContainer>
        <div
          className={styles.page}
          data-keyboard-open={keyboardOpen ? 'true' : undefined}
        >
          <header className={styles.header}>
            <div className={styles.headerText}>
              <h1 className={styles.pageTitle}>Nowy ślub</h1>
              <p className={styles.lede}>
                Dodaj parę po potwierdzeniu rezerwacji terminu
              </p>
            </div>
            <Link to="/sluby" className={styles.cancel}>
              Anuluj
            </Link>
          </header>

          <div className={styles.progress} aria-label="Postęp kreatora">
            <p className={styles.progressLabel} aria-live="polite">
              <span className={styles.progressIndex}>
                {step + 1} / {pathSteps.length}
              </span>
              <span className={styles.progressSep} aria-hidden="true">
                ·
              </span>
              <span className={styles.progressName}>
                {pathSteps[step]?.label}
              </span>
            </p>
            <div className={styles.progressTrack} aria-hidden="true">
              <div
                className={styles.progressFill}
                style={{
                  width: `${((step + 1) / pathSteps.length) * 100}%`,
                }}
              />
            </div>
          </div>

          <form
            className={styles.form}
            onSubmit={(e) => {
              // Summary must never auto-submit. Creation happens only via the explicit CTA.
              e.preventDefault()
            }}
            noValidate
          >
            {/* Step index only. Path (quick/full) must not remount Step 1 or the checkbox loses focus. */}
            <div key={step} className={styles.body}>
              <header className={styles.stepHeader}>
                <h2 className={styles.stepTitle}>
                  {STEP_COPY[stepCopyIndex].title}
                </h2>
                <p className={styles.stepSubtitle}>
                  {STEP_COPY[stepCopyIndex].subtitle}
                </p>
              </header>

              {step === 0 && (
                <div className={styles.fields}>
                  <div className={styles.person}>
                    <p className={styles.personRole}>Panna młoda</p>
                    <Input
                      label="Imię i nazwisko"
                      placeholder="np. Anna Kowalska"
                      autoComplete="name"
                      enterKeyHint="next"
                      error={errors.partner1?.message}
                      aria-invalid={errors.partner1 ? true : undefined}
                      {...register('partner1')}
                    />
                    <div className={completeLater ? styles.conceal : undefined}>
                      <Input
                        label="Telefon"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        enterKeyHint="next"
                        error={errors.partner1Phone?.message}
                        aria-invalid={errors.partner1Phone ? true : undefined}
                        {...register('partner1Phone')}
                      />
                    </div>
                  </div>
                  <div className={styles.person}>
                    <p className={styles.personRole}>Pan młody</p>
                    <Input
                      label="Imię i nazwisko"
                      placeholder="np. Michał Nowak"
                      autoComplete="name"
                      enterKeyHint="next"
                      error={errors.partner2?.message}
                      aria-invalid={errors.partner2 ? true : undefined}
                      {...register('partner2')}
                    />
                    <div className={completeLater ? styles.conceal : undefined}>
                      <Input
                        label="Telefon"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        enterKeyHint="next"
                        error={errors.partner2Phone?.message}
                        aria-invalid={errors.partner2Phone ? true : undefined}
                        {...register('partner2Phone')}
                      />
                    </div>
                  </div>
                  <div
                    className={`${styles.person} ${completeLater ? styles.conceal : ''}`}
                    aria-hidden={completeLater || undefined}
                  >
                    <p className={styles.personRole}>Kontakt</p>
                    <Input
                      label="Email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      enterKeyHint="next"
                      error={errors.email?.message}
                      aria-invalid={errors.email ? true : undefined}
                      {...register('email')}
                    />
                    <Controller
                      name="contractAddress"
                      control={control}
                      render={({ field, fieldState }) => (
                        <div
                          className={styles.field}
                          data-field="contractAddress"
                        >
                          <span className={styles.label}>Adres do umowy</span>
                          <AddressField
                            id="contractAddress"
                            value={field.value || ''}
                            onChange={(next) => {
                              field.onChange(next)
                              if (typeof next === 'object' && next != null) {
                                const split = splitContractAddressField(next)
                                setValue(
                                  'partner1PostalCode',
                                  split.partner1PostalCode ?? '',
                                )
                                setValue(
                                  'partner1City',
                                  split.partner1City ?? '',
                                )
                              }
                            }}
                            placeholder="Wpisz adres…"
                          />
                          {fieldState.error?.message ? (
                            <p className={styles.fieldError}>
                              {fieldState.error.message}
                            </p>
                          ) : null}
                        </div>
                      )}
                    />
                    <div
                      className={
                        hasStructuredPostalCity(values.contractAddress)
                          ? `${styles.person} ${styles.conceal}`
                          : styles.person
                      }
                    >
                    <Input
                      label="Kod pocztowy"
                      autoComplete="postal-code"
                      enterKeyHint="next"
                      error={errors.partner1PostalCode?.message}
                      aria-invalid={errors.partner1PostalCode ? true : undefined}
                      {...register('partner1PostalCode')}
                    />
                    <Input
                      label="Miasto"
                      autoComplete="address-level2"
                      enterKeyHint="next"
                      error={errors.partner1City?.message}
                      aria-invalid={errors.partner1City ? true : undefined}
                      {...register('partner1City')}
                    />
                    </div>
                  </div>
                  <Input
                    type="date"
                    label="Data ślubu"
                    error={errors.date?.message}
                    aria-invalid={errors.date ? true : undefined}
                    {...register('date')}
                  />
                  <label className={styles.shortcut}>
                    <input
                      type="checkbox"
                      className={styles.shortcutInput}
                      {...register('completeLater')}
                    />
                    <span className={styles.shortcutCopy}>
                      <span className={styles.shortcutTitle}>
                        Dodatkowe dane podam później
                      </span>
                      <span className={styles.shortcutHint}>
                        Utworzysz zlecenie teraz, a pakiet, płatności i
                        pozostałe dane uzupełnisz później.
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {showPackageStep && (
                <div className={styles.fields}>
                  <Select
                    label="Pakiet"
                    error={errors.packageId?.message}
                    aria-invalid={errors.packageId ? true : undefined}
                    disabled={packagesLoading || packagesError}
                    {...register('packageId')}
                  >
                    <option value="">
                      {packagesLoading
                        ? 'Ładowanie pakietów…'
                        : packagesError
                          ? 'Nie udało się załadować pakietów'
                          : 'Wybierz pakiet'}
                    </option>
                    {packageList?.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name}
                      </option>
                    ))}
                  </Select>

                  <Input
                    label="Cena (PLN)"
                    type="number"
                    inputMode="decimal"
                    hint={
                      selectedPackageId
                        ? 'Cena z pakietu — możesz ją zmienić'
                        : undefined
                    }
                    error={errors.price?.message}
                    aria-invalid={errors.price ? true : undefined}
                    {...register('price', { valueAsNumber: true })}
                  />

                  <div className={styles.person}>
                    <p className={styles.personRole}>Usługi dodatkowe</p>
                    {extrasError ? (
                      <p className={styles.hint}>
                        Nie udało się załadować usług dodatkowych.
                      </p>
                    ) : extrasPending && !extrasSuccess ? (
                      <p className={styles.hint}>Ładowanie usług…</p>
                    ) : availableExtras.length > 0 ? (
                      <Select
                        label="Dodaj usługę"
                        value=""
                        onChange={(event) => {
                          addExtra(event.target.value)
                        }}
                      >
                        <option value="">Wybierz…</option>
                        {availableExtras.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name} — {formatCurrency(service.price)}
                          </option>
                        ))}
                      </Select>
                    ) : extrasCatalog.length === 0 ? (
                      <p className={styles.hint}>
                        Brak usług dodatkowych w katalogu.
                      </p>
                    ) : null}

                    {selectedExtras.length > 0 ? (
                      <ul className={styles.extraList}>
                        {selectedExtras.map((extra) => (
                          <li key={extra.extraServiceId} className={styles.extraRow}>
                            <div className={styles.extraCopy}>
                              <span className={styles.extraName}>{extra.name}</span>
                              <span className={styles.extraPrice}>
                                {formatCurrency(extra.priceSnapshot)}
                              </span>
                            </div>
                            <button
                              type="button"
                              className={styles.extraRemove}
                              onClick={() => removeExtra(extra.extraServiceId)}
                            >
                              Usuń
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.hint}>Możesz pominąć ten krok.</p>
                    )}

                    {selectedExtras.length > 0 ? (
                      <p className={styles.extraTotal}>
                        Razem {formatCurrency(previewTotal)}
                      </p>
                    ) : null}
                  </div>

                  <fieldset className={styles.field}>
                    <legend className={styles.label}>Zaliczka już wpłacona?</legend>
                    <p className={styles.hint}>
                      Tak rejestruje otrzymaną wpłatę przy utworzeniu zlecenia.
                    </p>
                    <div className={styles.toggle} role="group">
                      <button
                        type="button"
                        className={`${styles.toggleBtn} ${!depositPaid ? styles.toggleActive : ''}`}
                        aria-pressed={!depositPaid}
                        onClick={() => setValue('depositPaid', false)}
                      >
                        Nie
                      </button>
                      <button
                        type="button"
                        className={`${styles.toggleBtn} ${depositPaid ? styles.toggleActive : ''}`}
                        aria-pressed={depositPaid}
                        onClick={() => setValue('depositPaid', true)}
                      >
                        Tak
                      </button>
                    </div>
                    <input type="hidden" {...register('depositPaid')} />
                  </fieldset>

                  {depositPaid && (
                    <div className={styles.depositFields}>
                      <Input
                        label="Kwota zaliczki (PLN)"
                        type="number"
                        inputMode="decimal"
                        error={errors.depositAmount?.message}
                        aria-invalid={errors.depositAmount ? true : undefined}
                        {...register('depositAmount', { valueAsNumber: true })}
                      />
                      <Input
                        type="date"
                        label="Data wpłaty zaliczki"
                        error={errors.depositPaymentDate?.message}
                        aria-invalid={errors.depositPaymentDate ? true : undefined}
                        {...register('depositPaymentDate')}
                      />
                    </div>
                  )}
                </div>
              )}

              {showLocationStep && (
                <div className={styles.fields}>
                  <div className={styles.field}>
                    <span className={styles.label}>Przygotowania panny młodej</span>
                    <Controller
                      name="bridePreparation"
                      control={control}
                      render={({ field }) => (
                        <AddressField
                          value={field.value || ''}
                          onChange={field.onChange}
                          placeholder="Opcjonalnie"
                        />
                      )}
                    />
                  </div>
                  <div className={styles.field}>
                    <span className={styles.label}>Przygotowania pana młodego</span>
                    <Controller
                      name="groomPreparation"
                      control={control}
                      render={({ field }) => (
                        <AddressField
                          value={field.value || ''}
                          onChange={field.onChange}
                          placeholder="Opcjonalnie"
                        />
                      )}
                    />
                  </div>
                  <div className={styles.field}>
                    <span className={styles.label}>Ceremonia</span>
                    <Controller
                      name="ceremony"
                      control={control}
                      render={({ field }) => (
                        <AddressField
                          value={field.value || ''}
                          onChange={field.onChange}
                          placeholder="Opcjonalnie"
                        />
                      )}
                    />
                  </div>
                  <div className={styles.field}>
                    <span className={styles.label}>Przyjęcie</span>
                    <Controller
                      name="reception"
                      control={control}
                      render={({ field }) => (
                        <AddressField
                          value={field.value || ''}
                          onChange={field.onChange}
                          placeholder="Opcjonalnie"
                        />
                      )}
                    />
                  </div>
                </div>
              )}

              {showQuickSummary && (
                <div className={styles.fields}>
                  <section className={styles.review} aria-label="Podgląd zlecenia">
                    <header className={styles.reviewIdentity}>
                      <h3 className={styles.reviewTitle}>{identity}</h3>
                      <p className={styles.reviewDate}>
                        {values.date ? formatDate(values.date) : '—'}
                      </p>
                    </header>
                    <p className={styles.reviewQuiet}>
                      Pozostałe dane uzupełnisz później.
                    </p>
                  </section>
                </div>
              )}

              {showFullSummary && (
                <div className={styles.fields}>
                  <section className={styles.review} aria-label="Podgląd zlecenia">
                    <header className={styles.reviewIdentity}>
                      <h3 className={styles.reviewTitle}>{identity}</h3>
                      <p className={styles.reviewDate}>
                        {values.date ? formatDate(values.date) : '—'}
                      </p>
                    </header>
                    <dl className={styles.reviewList}>
                      <div className={styles.reviewRow}>
                        <dt>Panna młoda</dt>
                        <dd>{values.partner1}</dd>
                      </div>
                      <div className={styles.reviewRow}>
                        <dt>Telefon panny</dt>
                        <dd>{values.partner1Phone.trim() || '—'}</dd>
                      </div>
                      <div className={styles.reviewRow}>
                        <dt>Pan młody</dt>
                        <dd>{values.partner2}</dd>
                      </div>
                      <div className={styles.reviewRow}>
                        <dt>Telefon pana</dt>
                        <dd>{values.partner2Phone.trim() || '—'}</dd>
                      </div>
                      <div className={styles.reviewRow}>
                        <dt>Email</dt>
                        <dd>{values.email.trim() || '—'}</dd>
                      </div>
                      <div className={styles.reviewRow}>
                        <dt>Adres</dt>
                        <dd>
                          {formatContractAddressEditorial(
                            values.contractAddress,
                            values.partner1PostalCode,
                            values.partner1City,
                          ) || '—'}
                        </dd>
                      </div>
                      <div className={styles.reviewRow}>
                        <dt>Pakiet</dt>
                        <dd>{values.packageName || '—'}</dd>
                      </div>
                      {selectedExtras.length > 0 ? (
                        <div className={styles.reviewRow}>
                          <dt>Usługi</dt>
                          <dd>
                            {selectedExtras
                              .map((extra) => extra.name)
                              .join(', ')}
                          </dd>
                        </div>
                      ) : null}
                      <div className={styles.reviewRow}>
                        <dt>Wartość</dt>
                        <dd>
                          {previewTotal ? formatCurrency(previewTotal) : '—'}
                        </dd>
                      </div>
                      <div className={styles.reviewRow}>
                        <dt>Zaliczka</dt>
                        <dd>{depositSummary}</dd>
                      </div>
                      {placeRows.map((row) => (
                        <div key={row.label} className={styles.reviewRow}>
                          <dt>{row.label}</dt>
                          <dd>{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>

                  <Textarea
                    label="Notatki"
                    rows={3}
                    placeholder="Opcjonalnie — preferencje pary, ustalenia ze spotkania..."
                    {...register('notes')}
                  />
                </div>
              )}
            </div>

            <footer
              className={styles.footer}
              data-single={step === 0 ? 'true' : undefined}
            >
              {step > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  className={styles.backAction}
                  onClick={goBack}
                  disabled={actionsLocked}
                >
                  Wstecz
                </Button>
              ) : null}

              {isLastStep ? (
                <Button
                  type="button"
                  variant="primary"
                  className={styles.primaryAction}
                  disabled={actionsLocked}
                  onClick={handleCreate}
                >
                  {isSuccess
                    ? 'Gotowe...'
                    : creating
                      ? 'Tworzenie...'
                      : 'Utwórz zlecenie'}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  className={styles.primaryAction}
                  onClick={goNext}
                >
                  Dalej
                </Button>
              )}
            </footer>
          </form>
        </div>
      </PageContainer>
    </AppLayout>
  )
}
