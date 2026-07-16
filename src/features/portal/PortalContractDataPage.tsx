import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { portalService } from '@/lib/api/portalService'
import { mockPackages } from '@/mocks/packages'
import type { ContractQuestionnaire } from '@/types/portal'
import styles from './PortalContractDataPage.module.css'

const personSchema = z.object({
  firstName: z.string().min(1, 'Wymagane'),
  lastName: z.string().min(1, 'Wymagane'),
  address: z.string().min(1, 'Wymagane'),
  postalCode: z.string().min(1, 'Wymagane'),
  city: z.string().min(1, 'Wymagane'),
  phone: z.string().min(1, 'Wymagane'),
  email: z.string().email('Podaj poprawny e-mail'),
})

const schema = z.object({
  weddingDate: z.string().min(1, 'Wybierz datę'),
  partner1: personSchema,
  partner2: personSchema,
  packageId: z.string().min(1, 'Wybierz pakiet'),
  preparationLocation: z.string().optional(),
  ceremonyLocation: z.string().min(1, 'Wymagane'),
  receptionLocation: z.string().min(1, 'Wymagane'),
  additionalNotes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const emptyPerson = {
  firstName: '',
  lastName: '',
  address: '',
  postalCode: '',
  city: '',
  phone: '',
  email: '',
}

export function PortalContractDataPage() {
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [submitting, setSubmitting] = useState(false)

  const { data: settings } = useQuery({
    queryKey: ['portal-settings'],
    queryFn: () => portalService.getSettings(),
  })

  const { data: wedding, isLoading } = useQuery({
    queryKey: ['portal-wedding', token],
    queryFn: () => portalService.getWeddingForToken(token),
    enabled: Boolean(token),
  })

  const defaultPackageId = useMemo(() => {
    if (!wedding) return mockPackages[0]?.id ?? ''
    return (
      mockPackages.find((p) => p.name === wedding.packageName)?.id ??
      mockPackages[0]?.id ??
      ''
    )
  }, [wedding])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: wedding
      ? {
          weddingDate: wedding.date,
          partner1: {
            firstName: wedding.couple.partner1,
            lastName: '',
            address: '',
            postalCode: '',
            city: wedding.couple.city || '',
            phone: wedding.couple.partner1Phone || wedding.couple.phone || '',
            email: wedding.couple.partner1Email || wedding.couple.email || '',
          },
          partner2: {
            firstName: wedding.couple.partner2,
            lastName: '',
            address: '',
            postalCode: '',
            city: wedding.couple.city || '',
            phone: wedding.couple.partner2Phone || '',
            email: wedding.couple.partner2Email || '',
          },
          packageId: defaultPackageId,
          preparationLocation: '',
          ceremonyLocation: wedding.ceremonyLocation ?? '',
          receptionLocation: wedding.receptionLocation ?? '',
          additionalNotes: '',
        }
      : undefined,
    defaultValues: {
      weddingDate: '',
      partner1: emptyPerson,
      partner2: emptyPerson,
      packageId: mockPackages[0]?.id ?? '',
      preparationLocation: '',
      ceremonyLocation: '',
      receptionLocation: '',
      additionalNotes: '',
    },
  })

  async function onSubmit(data: FormValues) {
    setSubmitting(true)
    const payload: ContractQuestionnaire = {
      weddingDate: data.weddingDate,
      partner1: data.partner1,
      partner2: data.partner2,
      packageId: data.packageId,
      preparationLocation: data.preparationLocation ?? '',
      ceremonyLocation: data.ceremonyLocation,
      receptionLocation: data.receptionLocation,
      additionalNotes: data.additionalNotes ?? '',
    }

    const result = await portalService.submitContractQuestionnaire(token, payload)
    setSubmitting(false)

    if (result?.success) {
      await queryClient.invalidateQueries({ queryKey: ['portal-wedding', token] })
      await queryClient.invalidateQueries({ queryKey: ['weddings'] })
      navigate(`/portal/${token}/sukces`)
    }
  }

  if (isLoading || !wedding) {
    return <p className={styles.loading}>Ładowanie formularza...</p>
  }

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Dane do umowy</h1>
      <p className={styles.lead}>
        {settings?.contractInstructions ??
          'Prosimy o uzupełnienie danych potrzebnych do przygotowania umowy.'}
      </p>

      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <fieldset className={styles.fieldset}>
          <legend>Ślub</legend>
          <label className={styles.field}>
            <span>Data ślubu *</span>
            <input type="date" className={styles.input} {...register('weddingDate')} />
            {errors.weddingDate && (
              <span className={styles.error}>{errors.weddingDate.message}</span>
            )}
          </label>
          <label className={styles.field}>
            <span>Wybrany pakiet *</span>
            <select className={styles.input} {...register('packageId')}>
              {mockPackages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name}
                </option>
              ))}
            </select>
            {errors.packageId && (
              <span className={styles.error}>{errors.packageId.message}</span>
            )}
          </label>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>Panna młoda</legend>
          <PersonFields prefix="partner1" register={register} errors={errors.partner1} />
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>Pan młody</legend>
          <PersonFields prefix="partner2" register={register} errors={errors.partner2} />
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>Lokalizacje</legend>
          <label className={styles.field}>
            <span>Przygotowania</span>
            <input className={styles.input} {...register('preparationLocation')} />
          </label>
          <label className={styles.field}>
            <span>Ceremonia *</span>
            <input className={styles.input} {...register('ceremonyLocation')} />
            {errors.ceremonyLocation && (
              <span className={styles.error}>{errors.ceremonyLocation.message}</span>
            )}
          </label>
          <label className={styles.field}>
            <span>Przyjęcie weselne *</span>
            <input className={styles.input} {...register('receptionLocation')} />
            {errors.receptionLocation && (
              <span className={styles.error}>{errors.receptionLocation.message}</span>
            )}
          </label>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>Dodatkowe informacje</legend>
          <label className={styles.field}>
            <span>Uwagi</span>
            <textarea className={styles.textarea} rows={4} {...register('additionalNotes')} />
          </label>
        </fieldset>

        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Wysyłanie...' : 'Wyślij dane'}
          </Button>
        </div>
      </form>
    </section>
  )
}

function PersonFields({
  prefix,
  register,
  errors,
}: {
  prefix: 'partner1' | 'partner2'
  register: ReturnType<typeof useForm<FormValues>>['register']
  errors?: {
    firstName?: { message?: string }
    lastName?: { message?: string }
    address?: { message?: string }
    postalCode?: { message?: string }
    city?: { message?: string }
    phone?: { message?: string }
    email?: { message?: string }
  }
}) {
  return (
    <div className={styles.grid}>
      <label className={styles.field}>
        <span>Imię *</span>
        <input className={styles.input} {...register(`${prefix}.firstName`)} />
        {errors?.firstName && <span className={styles.error}>{errors.firstName.message}</span>}
      </label>
      <label className={styles.field}>
        <span>Nazwisko *</span>
        <input className={styles.input} {...register(`${prefix}.lastName`)} />
        {errors?.lastName && <span className={styles.error}>{errors.lastName.message}</span>}
      </label>
      <label className={`${styles.field} ${styles.full}`}>
        <span>Adres *</span>
        <input className={styles.input} {...register(`${prefix}.address`)} />
        {errors?.address && <span className={styles.error}>{errors.address.message}</span>}
      </label>
      <label className={styles.field}>
        <span>Kod pocztowy *</span>
        <input className={styles.input} {...register(`${prefix}.postalCode`)} />
        {errors?.postalCode && (
          <span className={styles.error}>{errors.postalCode.message}</span>
        )}
      </label>
      <label className={styles.field}>
        <span>Miasto *</span>
        <input className={styles.input} {...register(`${prefix}.city`)} />
        {errors?.city && <span className={styles.error}>{errors.city.message}</span>}
      </label>
      <label className={styles.field}>
        <span>Telefon *</span>
        <input className={styles.input} type="tel" {...register(`${prefix}.phone`)} />
        {errors?.phone && <span className={styles.error}>{errors.phone.message}</span>}
      </label>
      <label className={styles.field}>
        <span>Email *</span>
        <input className={styles.input} type="email" {...register(`${prefix}.email`)} />
        {errors?.email && <span className={styles.error}>{errors.email.message}</span>}
      </label>
    </div>
  )
}
