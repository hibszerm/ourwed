import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { LocationSearchField } from '@/features/travel/LocationSearchField'
import { useWeddings } from '@/features/weddings/hooks/useWeddings'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { formatDate } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import {
  getSessionRemainingAmount,
  getSessionTotalPaid,
} from '@/features/sessions/presentation/sessionFinance'
import {
  SESSION_TYPE_LABELS,
  SESSION_TYPES,
} from '@/features/sessions/presentation/sessionType'
import {
  sessionFormSchema,
  type SessionFormValues,
} from '@/features/sessions/sessionFormSchema'
import type { CreateSessionInput, Session, SessionLocation } from '@/types/session'
import type { GeoPlace } from '@/types/travel'
import styles from './SessionForm.module.css'

function locationToGeoPlace(location?: SessionLocation | null): GeoPlace | null {
  if (!location) return null
  const formatted =
    location.formattedAddress?.trim() || location.address?.trim() || ''
  if (
    !formatted &&
    !location.name &&
    !location.placeId &&
    location.latitude == null
  ) {
    return null
  }
  return {
    placeId: location.placeId ?? null,
    formattedAddress: formatted,
    latitude: location.latitude ?? null,
    longitude: location.longitude ?? null,
    label: location.name ?? null,
    provider: location.source === 'google' ? 'google' : location.source ?? null,
  }
}

function geoPlaceToLocation(place: GeoPlace | null): SessionLocation | undefined {
  if (!place) return undefined
  const name = place.label?.trim() || undefined
  const formatted = place.formattedAddress?.trim() || undefined
  if (
    !name &&
    !formatted &&
    !place.placeId &&
    place.latitude == null &&
    place.longitude == null
  ) {
    return undefined
  }
  return {
    name,
    address: formatted,
    formattedAddress: formatted,
    placeId: place.placeId ?? undefined,
    latitude: place.latitude ?? undefined,
    longitude: place.longitude ?? undefined,
    source: place.provider ?? undefined,
  }
}

function sessionToFormValues(
  session?: Session,
  defaultDate?: string,
): SessionFormValues {
  if (!session) {
    return {
      customName: '',
      primaryPerson: { firstName: '', lastName: '' },
      secondaryPerson: { firstName: '', lastName: '' },
      sessionType: 'engagement',
      customSessionType: '',
      date: defaultDate?.trim() || '',
      startTime: '',
      endTime: '',
      location: undefined,
      totalPrice: 0,
      depositAmount: 0,
      notes: '',
      linkedWeddingId: null,
    }
  }
  return {
    customName: session.customName ?? '',
    primaryPerson: {
      firstName: session.primaryPerson.firstName ?? '',
      lastName: session.primaryPerson.lastName ?? '',
    },
    secondaryPerson: {
      firstName: session.secondaryPerson?.firstName ?? '',
      lastName: session.secondaryPerson?.lastName ?? '',
    },
    sessionType: session.sessionType,
    customSessionType: session.customSessionType ?? '',
    date: session.date,
    startTime: session.startTime ?? '',
    endTime: session.endTime ?? '',
    location: session.location,
    totalPrice: session.totalPrice,
    depositAmount: session.depositAmount,
    notes: session.notes ?? '',
    linkedWeddingId: session.linkedWeddingId ?? null,
  }
}

function formValuesToCreateInput(
  values: SessionFormValues,
): CreateSessionInput {
  const sessionType = values.sessionType
  return {
    customName: values.customName?.trim() || undefined,
    primaryPerson: {
      firstName: values.primaryPerson?.firstName?.trim() || undefined,
      lastName: values.primaryPerson?.lastName?.trim() || undefined,
    },
    secondaryPerson: {
      firstName: values.secondaryPerson?.firstName?.trim() || undefined,
      lastName: values.secondaryPerson?.lastName?.trim() || undefined,
    },
    sessionType,
    customSessionType:
      sessionType === 'other'
        ? values.customSessionType?.trim() || undefined
        : undefined,
    date: values.date,
    startTime: values.startTime?.trim() || undefined,
    endTime: values.endTime?.trim() || undefined,
    location: values.location
      ? {
          name: values.location.name,
          address: values.location.address,
          formattedAddress: values.location.formattedAddress,
          placeId: values.location.placeId,
          latitude: values.location.latitude ?? undefined,
          longitude: values.location.longitude ?? undefined,
          source: values.location.source,
          verificationStatus: values.location.verificationStatus,
        }
      : undefined,
    totalPrice: values.totalPrice || 0,
    depositAmount: values.depositAmount || 0,
    notes: values.notes?.trim() || undefined,
    linkedWeddingId: values.linkedWeddingId || null,
  }
}

interface SessionFormProps {
  mode: 'create' | 'edit'
  initial?: Session
  /** Prefill date on create (e.g. calendar `?date=`). */
  defaultDate?: string
  submitLabel: string
  cancelTo: string
  pending?: boolean
  onSubmit: (input: CreateSessionInput) => void | Promise<void>
}

export function SessionForm({
  mode,
  initial,
  defaultDate,
  submitLabel,
  cancelTo,
  pending,
  onSubmit,
}: SessionFormProps) {
  const { data: weddings = [] } = useWeddings()
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false)
  const [placeText, setPlaceText] = useState(
    () =>
      initial?.location?.formattedAddress ||
      initial?.location?.address ||
      '',
  )

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SessionFormValues>({
    // zod + RHF generics diverge slightly on defaults; values are validated at submit.
    resolver: zodResolver(sessionFormSchema) as never,
    defaultValues: sessionToFormValues(initial, defaultDate),
  })

  const sessionType = watch('sessionType')
  const totalPrice = watch('totalPrice') || 0
  const location = watch('location')
  const ledgerPayments = mode === 'edit' ? initial?.payments ?? [] : []
  const totalPaid = getSessionTotalPaid(ledgerPayments)
  const remaining = getSessionRemainingAmount(totalPrice, ledgerPayments)

  useEffect(() => {
    if (sessionType !== 'other') {
      setValue('customSessionType', '')
    }
  }, [sessionType, setValue])

  const geoPlace = useMemo(() => locationToGeoPlace(location), [location])

  const weddingOptions = useMemo(
    () =>
      [...weddings].sort((a, b) => a.date.localeCompare(b.date)).map((w) => ({
        id: w.id,
        label: `${getWeddingDisplayName(w)} — ${formatDate(w.date, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}`,
      })),
    [weddings],
  )

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit(async (values) => {
        await onSubmit(formValuesToCreateInput(values))
      })}
      noValidate
    >
      <section className={styles.section} aria-labelledby="session-basic">
        <h2 id="session-basic" className={styles.sectionTitle}>
          Podstawowe informacje
        </h2>
        <Input
          label="Nazwa sesji — opcjonalnie"
          placeholder="np. Sesja narzeczeńska w Tatrach"
          hint="Możesz podać własną nazwę albo oprzeć się na imionach osób."
          error={errors.customName?.message}
          {...register('customName')}
        />
        <div className={styles.grid2}>
          <Input
            label="Imię (osoba 1)"
            error={errors.primaryPerson?.firstName?.message}
            {...register('primaryPerson.firstName')}
          />
          <Input
            label="Nazwisko (osoba 1)"
            {...register('primaryPerson.lastName')}
          />
          <Input
            label="Imię (osoba 2) — opcjonalnie"
            {...register('secondaryPerson.firstName')}
          />
          <Input
            label="Nazwisko (osoba 2) — opcjonalnie"
            {...register('secondaryPerson.lastName')}
          />
        </div>
        <Select
          label="Rodzaj sesji"
          error={errors.sessionType?.message}
          {...register('sessionType')}
        >
          {SESSION_TYPES.map((type) => (
            <option key={type} value={type}>
              {SESSION_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
        {sessionType === 'other' ? (
          <Input
            label="Wpisz rodzaj sesji"
            placeholder="np. Chrzest, portretowa, produktowa"
            error={errors.customSessionType?.message}
            {...register('customSessionType')}
          />
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="session-datetime">
        <h2 id="session-datetime" className={styles.sectionTitle}>
          Data i godzina
        </h2>
        <div className={styles.grid3}>
          <Input
            type="date"
            label="Data"
            error={errors.date?.message}
            {...register('date')}
          />
          <Input
            type="time"
            label="Godzina rozpoczęcia"
            error={errors.startTime?.message}
            {...register('startTime')}
          />
          <Input
            type="time"
            label="Godzina zakończenia"
            error={errors.endTime?.message}
            {...register('endTime')}
          />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="session-location">
        <h2 id="session-location" className={styles.sectionTitle}>
          Lokalizacja
        </h2>
        <Controller
          control={control}
          name="location"
          render={({ field }) => (
            <>
              <LocationSearchField
                label="Szukaj miejsca"
                value={placeText}
                place={geoPlace}
                compactDisplay
                preserveName={field.value?.name}
                nameManuallyEdited={nameManuallyEdited}
                commitTypedOnBlur
                placeholder="Zacznij wpisywać nazwę lub adres…"
                onChangeText={setPlaceText}
                onSelectPlace={(place) => {
                  const next = geoPlaceToLocation(place)
                  field.onChange(next)
                  setPlaceText(
                    place?.formattedAddress || place?.label || '',
                  )
                  if (!nameManuallyEdited && place?.label) {
                    // keep name from Places
                  }
                }}
              />
              <div className={styles.grid2}>
                <Input
                  label="Nazwa miejsca"
                  value={field.value?.name ?? ''}
                  onChange={(e) => {
                    setNameManuallyEdited(true)
                    field.onChange({
                      ...field.value,
                      name: e.target.value,
                    })
                  }}
                />
                <Input
                  label="Adres"
                  value={
                    field.value?.address ||
                    field.value?.formattedAddress ||
                    ''
                  }
                  onChange={(e) => {
                    const address = e.target.value
                    field.onChange({
                      ...field.value,
                      address,
                      formattedAddress: address,
                    })
                    setPlaceText(address)
                  }}
                />
              </div>
            </>
          )}
        />
      </section>

      <section className={styles.section} aria-labelledby="session-finance">
        <h2 id="session-finance" className={styles.sectionTitle}>
          Finanse
        </h2>
        <div className={styles.grid3}>
          <Input
            type="number"
            min={0}
            step="1"
            label="Cena (zł)"
            error={errors.totalPrice?.message}
            {...register('totalPrice', { valueAsNumber: true })}
          />
          <Input
            type="number"
            min={0}
            step="1"
            label="Ustalona zaliczka (zł)"
            hint="To kwota ustalona w umowie — nie jest automatycznie rejestrowana jako wpłata."
            error={errors.depositAmount?.message}
            {...register('depositAmount', { valueAsNumber: true })}
          />
          {mode === 'edit' ? (
            <div className={styles.remainingBox}>
              <span className={styles.remainingLabel}>Wpłacono</span>
              <span className={styles.remainingValue}>
                {formatCurrency(totalPaid)}
              </span>
            </div>
          ) : null}
          <div className={styles.remainingBox}>
            <span className={styles.remainingLabel}>Pozostało</span>
            <span className={styles.remainingValue}>
              {formatCurrency(remaining)}
            </span>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="session-link">
        <h2 id="session-link" className={styles.sectionTitle}>
          Powiąż ze ślubem
        </h2>
        <Select
          label="Ślub (opcjonalnie)"
          {...register('linkedWeddingId', {
            setValueAs: (v) => (v === '' || v == null ? null : String(v)),
          })}
        >
          <option value="">— Bez powiązania —</option>
          {weddingOptions.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </Select>
      </section>

      <section className={styles.section} aria-labelledby="session-notes">
        <h2 id="session-notes" className={styles.sectionTitle}>
          Notatki
        </h2>
        <Textarea
          label="Notatki"
          rows={4}
          placeholder="Opcjonalne uwagi do sesji…"
          {...register('notes')}
        />
      </section>

      <div className={styles.actions}>
        <Link to={cancelTo}>
          <Button type="button" variant="secondary">
            Anuluj
          </Button>
        </Link>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending
            ? mode === 'create'
              ? 'Tworzenie…'
              : 'Zapisywanie…'
            : submitLabel}
        </Button>
      </div>
    </form>
  )
}
