import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageContainer } from '@/components/ui/PageContainer'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { CompanySignatureSection } from '@/features/company/signature/CompanySignatureSection'
import { buildCompanyHealth } from '@/features/company/companyHealth'
import { companyDetailsService, companyDetailsQueryKey } from '@/lib/api/companyDetailsService'
import type { CompanyDetails, UpsertCompanyDetailsInput } from '@/types/company'
import catalogStyles from '@/features/studio/StudioCatalog.module.css'

interface FormState {
  companyName: string
  ownerName: string
  nip: string
  regon: string
  vatId: string
  address: string
  postalCode: string
  city: string
  country: string
  phone: string
  email: string
  website: string
  instagram: string
  facebook: string
  bankAccount: string
  iban: string
  swift: string
  logoPath: string
  signaturePath: string
  stampPath: string
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const emptyForm: FormState = {
  companyName: '',
  ownerName: '',
  nip: '',
  regon: '',
  vatId: '',
  address: '',
  postalCode: '',
  city: '',
  country: 'Polska',
  phone: '',
  email: '',
  website: '',
  instagram: '',
  facebook: '',
  bankAccount: '',
  iban: '',
  swift: '',
  logoPath: '',
  signaturePath: '',
  stampPath: '',
}

const AUTOSAVE_MS = 1000

function toForm(data: CompanyDetails | null | undefined): FormState {
  if (!data) return emptyForm
  return {
    companyName: data.companyName ?? '',
    ownerName: data.ownerName ?? '',
    nip: data.nip ?? '',
    regon: data.regon ?? '',
    vatId: data.vatId ?? '',
    address: data.address ?? '',
    postalCode: data.postalCode ?? '',
    city: data.city ?? '',
    country: data.country || 'Polska',
    phone: data.phone ?? '',
    email: data.email ?? '',
    website: data.website ?? '',
    instagram: data.instagram ?? '',
    facebook: data.facebook ?? '',
    bankAccount: data.bankAccount ?? '',
    iban: data.iban ?? '',
    swift: data.swift ?? '',
    logoPath: data.logoPath ?? '',
    signaturePath: data.signaturePath ?? '',
    stampPath: data.stampPath ?? '',
  }
}

function serializeForm(form: FormState): string {
  return JSON.stringify(form)
}

function formToUpsertInput(form: FormState): UpsertCompanyDetailsInput {
  return {
    companyName: form.companyName,
    ownerName: form.ownerName,
    nip: form.nip,
    regon: form.regon,
    vatId: form.vatId,
    address: form.address,
    postalCode: form.postalCode,
    city: form.city,
    country: form.country,
    phone: form.phone,
    email: form.email,
    website: form.website,
    instagram: form.instagram,
    facebook: form.facebook,
    bankAccount: form.bankAccount,
    iban: form.iban,
    swift: form.swift,
    logoPath: form.logoPath || null,
    signaturePath: form.signaturePath || null,
    stampPath: form.stampPath || null,
  }
}

export function CompanyDetailsPage() {
  const userId = useStudioAuthId()
  const queryClient = useQueryClient()
  const queryKey = companyDetailsQueryKey(userId)
  const { data, dataUpdatedAt, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => companyDetailsService.get(),
    enabled: Boolean(userId),
  })

  const [form, setForm] = useState<FormState>(emptyForm)
  const [dirty, setDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const formRef = useRef(form)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const lastSavedRef = useRef(serializeForm(emptyForm))
  const saveGenRef = useRef(0)
  const mountedRef = useRef(true)
  const hydratedAtRef = useRef(0)
  const persistRef = useRef<(reason?: 'autosave' | 'flush' | 'retry') => Promise<void>>(
    async () => {},
  )

  useEffect(() => {
    formRef.current = form
  }, [form])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    // Studio account switched — clear local form baseline.
    const timer = window.setTimeout(() => {
      dirtyRef.current = false
      savingRef.current = false
      hydratedAtRef.current = 0
      lastSavedRef.current = serializeForm(emptyForm)
      setForm(emptyForm)
      setDirty(false)
      setSaveStatus('idle')
      setSaveError(null)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [userId])

  // Hydrate from query only when idle — never during dirty/saving edits.
  useEffect(() => {
    if (isLoading) return
    if (dirtyRef.current || savingRef.current) return
    if (dataUpdatedAt === hydratedAtRef.current) return

    const timer = window.setTimeout(() => {
      if (dirtyRef.current || savingRef.current) return
      if (dataUpdatedAt === hydratedAtRef.current) return
      const next = toForm(data)
      const serialized = serializeForm(next)
      hydratedAtRef.current = dataUpdatedAt
      lastSavedRef.current = serialized
      setForm(next)
      setDirty(false)
      dirtyRef.current = false
      setSaveStatus((prev) => (prev === 'error' ? prev : 'idle'))
      setSaveError(null)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [data, dataUpdatedAt, isLoading])

  async function persist(reason: 'autosave' | 'flush' | 'retry' = 'autosave') {
    const snapshot = formRef.current
    const serialized = serializeForm(snapshot)
    if (serialized === lastSavedRef.current) {
      dirtyRef.current = false
      if (mountedRef.current) {
        setDirty(false)
        if (reason === 'retry') setSaveStatus('saved')
      }
      return
    }

    const gen = ++saveGenRef.current
    savingRef.current = true
    if (mountedRef.current) {
      setSaveStatus('saving')
      setSaveError(null)
    }

    try {
      const saved = await companyDetailsService.upsert(formToUpsertInput(snapshot))

      if (gen !== saveGenRef.current) return

      // Canonical cache must match DB so SPA remounts do not restore stale values.
      if (userId) {
        queryClient.setQueryData(companyDetailsQueryKey(userId), saved)
      }

      const savedForm = toForm(saved)
      const savedSerialized = serializeForm(savedForm)
      const stillMatches =
        serializeForm(formRef.current) === serialized ||
        serializeForm(formRef.current) === savedSerialized

      if (stillMatches) {
        dirtyRef.current = false
        lastSavedRef.current = savedSerialized
        if (mountedRef.current) {
          const nextUpdatedAt =
            queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? Date.now()
          hydratedAtRef.current = nextUpdatedAt
          setForm(savedForm)
          setDirty(false)
          setSaveStatus('saved')
          setSaveError(null)
        }
      } else {
        dirtyRef.current = true
        lastSavedRef.current = savedSerialized
        if (mountedRef.current) {
          setDirty(true)
          setSaveStatus('idle')
        }
      }
    } catch (err) {
      if (gen !== saveGenRef.current) return
      if (mountedRef.current) {
        setSaveStatus('error')
        setSaveError(
          err instanceof Error ? err.message : 'Nie udało się zapisać',
        )
      }
    } finally {
      if (gen === saveGenRef.current) {
        savingRef.current = false
      }
    }
  }

  useEffect(() => {
    persistRef.current = persist
  })

  useEffect(() => {
    if (!dirty) return
    if (isLoading || isError) return

    const timer = window.setTimeout(() => {
      void persistRef.current('autosave')
    }, AUTOSAVE_MS)

    return () => window.clearTimeout(timer)
  }, [form, dirty, isLoading, isError])

  // Flush pending edits on leave so debounce cancel cannot drop a save.
  useEffect(() => {
    return () => {
      if (!dirtyRef.current || savingRef.current) return
      const snapshot = formRef.current
      if (serializeForm(snapshot) === lastSavedRef.current) return
      void companyDetailsService
        .upsert(formToUpsertInput(snapshot))
        .then((saved) => {
          if (!userId) return
          queryClient.setQueryData(companyDetailsQueryKey(userId), saved)
        })
        .catch(() => {
          /* unmount flush — error surfaces on next visit if needed */
        })
    }
  }, [queryClient, userId])

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    dirtyRef.current = true
    setDirty(true)
    setSaveStatus('idle')
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onUpload(
    kind: 'logo' | 'signature' | 'stamp',
    fileList: FileList | null,
  ) {
    const file = fileList?.[0]
    if (!file) return
    try {
      const path = await companyDetailsService.uploadAsset(kind, file)
      dirtyRef.current = true
      setDirty(true)
      setSaveStatus('idle')
      setForm((prev) => {
        if (kind === 'logo') return { ...prev, logoPath: path }
        if (kind === 'signature') return { ...prev, signaturePath: path }
        return { ...prev, stampPath: path }
      })
    } catch (err) {
      setSaveStatus('error')
      setSaveError(
        err instanceof Error ? err.message : 'Upload nie powiódł się',
      )
    }
  }

  const health = buildCompanyHealth(form)
  const missingCopy: Record<string, string> = {
    company: 'Brak nazwy firmy',
    address: 'Brak adresu',
    bank: 'Brak numeru konta',
    logo: 'Brak logo',
    signature: 'Brak podpisu',
  }
  const saveLabel =
    saveStatus === 'saving'
      ? 'Zapisywanie…'
      : saveStatus === 'saved'
        ? 'Zapisano'
        : saveStatus === 'error'
          ? 'Nie udało się zapisać'
          : dirty
            ? 'Niezapisane zmiany'
            : null

  return (
    <AppLayout
      title="Dane firmy"
      subtitle="Źródło danych do umów, dokumentów i CRM"
      action={
        saveLabel ? (
          <span
            className={catalogStyles.saveStatus}
            data-status={saveStatus}
            aria-live="polite"
          >
            {saveLabel}
          </span>
        ) : null
      }
    >
      <PageContainer width="narrow">
        {isError ? (
          <EmptyState
            title="Nie udało się załadować danych"
            description={
              error instanceof Error ? error.message : 'Spróbuj ponownie.'
            }
          />
        ) : isLoading ? (
          <p className={catalogStyles.muted}>Ładowanie…</p>
        ) : (
          <div className={catalogStyles.companyStack}>
            <p className={catalogStyles.docHint}>
              Dane z tej sekcji są automatycznie wykorzystywane podczas
              generowania umów, dokumentów, formularzy i innych elementów
              systemu.
            </p>

            <section
              className={catalogStyles.healthCard}
              aria-label="Konfiguracja firmy"
            >
              <h2 className={catalogStyles.healthTitle}>Konfiguracja firmy</h2>
              <ul className={catalogStyles.healthList}>
                {health.map((item) => (
                  <li
                    key={item.id}
                    className={catalogStyles.healthItem}
                    data-status={item.status}
                  >
                    <span className={catalogStyles.healthMark} aria-hidden>
                      {item.status === 'ok' ? '✓' : '⚠'}
                    </span>
                    <span>
                      {item.status === 'ok'
                        ? item.label
                        : (missingCopy[item.id] ?? `Brak: ${item.label}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {saveError ? (
              <div className={catalogStyles.saveError} role="alert">
                <p>{saveError}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  data-testid="company-details-retry"
                  onClick={() => void persistRef.current('retry')}
                >
                  Spróbuj ponownie
                </Button>
              </div>
            ) : null}

            <section className={catalogStyles.sectionCard}>
              <h2 className={catalogStyles.sectionTitle}>Informacje o firmie</h2>
              <p className={catalogStyles.sectionSubtitle}>
                Podstawowe dane identyfikacyjne i adres używane w dokumentach.
              </p>
              <div className={catalogStyles.sectionBody}>
                <div className={catalogStyles.row}>
                  <Input
                    label="Nazwa firmy"
                    value={form.companyName}
                    onChange={(e) => setField('companyName', e.target.value)}
                  />
                  <Input
                    label="Właściciel / reprezentant"
                    value={form.ownerName}
                    onChange={(e) => setField('ownerName', e.target.value)}
                  />
                </div>
                <div className={catalogStyles.row}>
                  <Input
                    label="NIP"
                    value={form.nip}
                    onChange={(e) => setField('nip', e.target.value)}
                  />
                  <Input
                    label="REGON"
                    value={form.regon}
                    onChange={(e) => setField('regon', e.target.value)}
                  />
                  <Input
                    label="VAT ID"
                    value={form.vatId}
                    onChange={(e) => setField('vatId', e.target.value)}
                  />
                </div>
                <Input
                  label="Adres"
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                />
                <div className={catalogStyles.row}>
                  <Input
                    label="Kod pocztowy"
                    value={form.postalCode}
                    onChange={(e) => setField('postalCode', e.target.value)}
                  />
                  <Input
                    label="Miasto"
                    value={form.city}
                    onChange={(e) => setField('city', e.target.value)}
                  />
                  <Input
                    label="Kraj"
                    value={form.country}
                    onChange={(e) => setField('country', e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className={catalogStyles.sectionCard}>
              <h2 className={catalogStyles.sectionTitle}>Rozliczenia</h2>
              <p className={catalogStyles.sectionSubtitle}>
                Dane bankowe do faktur, umów i płatności od klientów.
              </p>
              <div className={catalogStyles.sectionBody}>
                <div className={catalogStyles.row}>
                  <Input
                    label="Numer konta"
                    value={form.bankAccount}
                    onChange={(e) => setField('bankAccount', e.target.value)}
                  />
                  <Input
                    label="IBAN"
                    value={form.iban}
                    onChange={(e) => setField('iban', e.target.value)}
                  />
                  <Input
                    label="SWIFT"
                    value={form.swift}
                    onChange={(e) => setField('swift', e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className={catalogStyles.sectionCard}>
              <h2 className={catalogStyles.sectionTitle}>Kontakt</h2>
              <p className={catalogStyles.sectionSubtitle}>
                Dane kontaktowe widoczne w komunikacji i dokumentach.
              </p>
              <div className={catalogStyles.sectionBody}>
                <div className={catalogStyles.row}>
                  <Input
                    label="Telefon"
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                  />
                  <Input
                    label="E-mail"
                    type="email"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                  />
                  <Input
                    label="Strona WWW"
                    value={form.website}
                    onChange={(e) => setField('website', e.target.value)}
                  />
                </div>
                <div className={catalogStyles.row}>
                  <Input
                    label="Instagram"
                    value={form.instagram}
                    onChange={(e) => setField('instagram', e.target.value)}
                  />
                  <Input
                    label="Facebook"
                    value={form.facebook}
                    onChange={(e) => setField('facebook', e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className={catalogStyles.sectionCard}>
              <h2 className={catalogStyles.sectionTitle}>Materiały firmowe</h2>
              <p className={catalogStyles.sectionSubtitle}>
                Logo, podpis i pieczęć wykorzystywane przy generowaniu
                dokumentów.
              </p>
              <div className={catalogStyles.sectionBody}>
                <div className={catalogStyles.row}>
                  <label className={catalogStyles.field}>
                    Logo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(e) => void onUpload('logo', e.target.files)}
                    />
                    {form.logoPath ? (
                      <span className={catalogStyles.muted}>{form.logoPath}</span>
                    ) : null}
                  </label>
                  <label className={catalogStyles.field}>
                    Pieczęć
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(e) => void onUpload('stamp', e.target.files)}
                    />
                    {form.stampPath ? (
                      <span className={catalogStyles.muted}>
                        {form.stampPath}
                      </span>
                    ) : null}
                  </label>
                </div>
                <CompanySignatureSection
                  signaturePath={form.signaturePath || null}
                  signatureUpdatedAt={data?.signatureUpdatedAt}
                  onSignaturePathChange={(path) => {
                    // Independent save already persisted — sync form without dirty autosave race.
                    const nextPath = path ?? ''
                    setForm((prev) => {
                      const updated = { ...prev, signaturePath: nextPath }
                      lastSavedRef.current = serializeForm(updated)
                      return updated
                    })
                    dirtyRef.current = false
                    setDirty(false)
                    setSaveStatus('saved')
                    if (userId) {
                      const current = queryClient.getQueryData<CompanyDetails | null>(
                        companyDetailsQueryKey(userId),
                      )
                      if (current) {
                        queryClient.setQueryData(companyDetailsQueryKey(userId), {
                          ...current,
                          signaturePath: path,
                        })
                      }
                    }
                  }}
                />
              </div>
            </section>
          </div>
        )}
      </PageContainer>
    </AppLayout>
  )
}
