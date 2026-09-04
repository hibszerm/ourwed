import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SettingsLayout } from '@/features/settings/SettingsLayout'
import {
  SettingsAlert,
  SettingsCallout,
  SettingsHelper,
  SettingsMuted,
  SettingsSaveStatus,
  SettingsSection,
  SettingsSectionHeader,
  SettingsWorkspace,
} from '@/features/settings/SettingsWorkspace'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageContainer } from '@/components/ui/PageContainer'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import {
  companyDetailsQueryKey,
  companyDetailsService,
} from '@/lib/api/companyDetailsService'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import type { CompanyDetails, UpsertCompanyDetailsInput } from '@/types/company'

interface FormState {
  companyName: string
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const emptyForm: FormState = {
  companyName: '',
}

const AUTOSAVE_MS = 1000

function toForm(data: CompanyDetails | null | undefined): FormState {
  return {
    companyName: data?.companyName ?? '',
  }
}

function serializeForm(form: FormState): string {
  return JSON.stringify(form)
}

/**
 * V1 Studio Profile writes only the visible identity field.
 * Hidden studio_details columns stay omitted so autosave cannot null them.
 */
function formToUpsertInput(form: FormState): UpsertCompanyDetailsInput {
  return {
    companyName: form.companyName,
  }
}

function persistStatusLabel(status: SaveStatus): string {
  if (status === 'saving') return 'Zapisywanie…'
  if (status === 'saved') return 'Zapisano'
  if (status === 'error') return 'Nie udało się zapisać'
  return ''
}

export function CompanyDetailsPage() {
  const userId = useStudioAuthId()
  const { requirePro, isReadOnly } = useProAccessGate()
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
    if (!requirePro()) return
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
        setSaveError(getUserFacingErrorMessage(err, 'Nie udało się zapisać'))
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
    if (isReadOnly) return
    dirtyRef.current = true
    setDirty(true)
    setSaveStatus('idle')
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const headerAction =
    saveStatus === 'error' ? (
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={() => void persistRef.current('retry')}
      >
        Spróbuj ponownie
      </Button>
    ) : saveStatus !== 'idle' ? (
      <SettingsSaveStatus status={saveStatus}>
        {persistStatusLabel(saveStatus)}
      </SettingsSaveStatus>
    ) : null

  return (
    <SettingsLayout
      title="Profil studia"
      subtitle="Podstawowe informacje o Twoim studio używane w OurWed i na wybranych ekranach dla klientów."
      action={headerAction}
    >
      <PageContainer width="full">
        {isLoading ? (
          <SettingsMuted>Ładowanie…</SettingsMuted>
        ) : isError ? (
          <SettingsAlert>
            {getUserFacingErrorMessage(error, 'Nie udało się wczytać profilu studia.')}
          </SettingsAlert>
        ) : (
          <SettingsWorkspace testId="studio-profile">
            <SettingsCallout>
              Te informacje identyfikują Twoje studio w OurWed i na wybranych
              ekranach dla klientów.
            </SettingsCallout>

            {saveError ? <SettingsAlert>{saveError}</SettingsAlert> : null}

            <SettingsSection labelledBy="studio-profile-name">
              <SettingsSectionHeader
                id="studio-profile-name"
                title="Nazwa studia"
                description="Widoczna dla par na publicznych ankietach przedślubnych."
              />
              <Input
                label="Nazwa studia"
                value={form.companyName}
                onChange={(event) => setField('companyName', event.target.value)}
                autoComplete="organization"
                disabled={isReadOnly}
              />
              <SettingsHelper>
                Używana jako nazwa studia na wybranych ekranach dla klientów.
              </SettingsHelper>
            </SettingsSection>
          </SettingsWorkspace>
        )}
      </PageContainer>
    </SettingsLayout>
  )
}
