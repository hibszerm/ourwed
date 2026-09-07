import { useEffect, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { SettingsLayout } from '@/features/settings/SettingsLayout'
import {
  SettingsAlert,
  SettingsFieldGrid,
  SettingsMuted,
  SettingsReadonlyField,
  SettingsSaveStatus,
  SettingsSection,
  SettingsSectionHeader,
  SettingsWorkspace,
} from '@/features/settings/SettingsWorkspace'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageContainer } from '@/components/ui/PageContainer'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  accountProfileSchema,
  type AccountProfileFormValues,
} from '@/features/account/accountProfileSchema'
import {
  useAccountProfile,
  useUpdateAccountNames,
} from '@/features/account/useAccountProfile'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import { LegalLinksNav } from '@/features/legal/LegalLinks'
import legalLinkStyles from '@/features/legal/LegalLinks.module.css'
import { AccountDeletionDangerZone } from '@/features/account-deletion/AccountDeletionDangerZone'

type SaveFlash = 'idle' | 'saved' | 'error'

export function AccountSettingsPage() {
  const formId = useId()
  const { user } = useAuth()
  const [flash, setFlash] = useState<SaveFlash>('idle')
  const profileQuery = useAccountProfile()
  const updateMutation = useUpdateAccountNames()
  const sessionEmail = user?.email?.trim() ?? profileQuery.data?.email ?? ''

  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isDirty, isSubmitting, isValid },
  } = useForm<AccountProfileFormValues>({
    resolver: zodResolver(accountProfileSchema),
    mode: 'onChange',
    defaultValues: {
      firstName: '',
      lastName: '',
    },
  })

  useEffect(() => {
    if (!profileQuery.data) return
    reset({
      firstName: profileQuery.data.firstName,
      lastName: profileQuery.data.lastName,
    })
  }, [profileQuery.data, reset])

  async function onSubmit(values: AccountProfileFormValues) {
    setFlash('idle')
    try {
      const saved = await updateMutation.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
      })
      reset({
        firstName: saved.firstName,
        lastName: saved.lastName,
      })
      setFlash('saved')
    } catch {
      setFlash('error')
    }
  }

  const saving = isSubmitting || updateMutation.isPending
  const canSave = isDirty && isValid && !saving
  const saveError =
    flash === 'error'
      ? 'Nie udało się zapisać danych. Spróbuj ponownie.'
      : null

  const headerAction = saving ? (
    <SettingsSaveStatus status="saving">Zapisywanie…</SettingsSaveStatus>
  ) : isDirty ? (
    <Button
      type="submit"
      form={formId}
      variant="primary"
      size="md"
      disabled={!canSave}
    >
      Zapisz
    </Button>
  ) : flash === 'saved' ? (
    <SettingsSaveStatus status="saved">Zapisano</SettingsSaveStatus>
  ) : flash === 'error' ? (
    <SettingsSaveStatus status="error">{saveError}</SettingsSaveStatus>
  ) : null

  return (
    <SettingsLayout
      title="Profil"
      subtitle="Zarządzaj podstawowymi danymi swojego profilu."
      action={headerAction}
    >
      <PageContainer width="full">
        <SettingsWorkspace testId="account-settings">
          <SettingsSection labelledBy={`${formId}-names`}>
            <SettingsSectionHeader
              id={`${formId}-names`}
              title="Dane konta"
              description="Imię i nazwisko widoczne w panelu OurWed."
            />

            {profileQuery.isPending ? (
              <SettingsMuted>Ładowanie…</SettingsMuted>
            ) : profileQuery.isError ? (
              <SettingsAlert>
                {profileQuery.error instanceof Error
                  ? getUserFacingErrorMessage(
                      profileQuery.error,
                      'Nie udało się pobrać profilu.',
                    )
                  : 'Nie udało się wczytać profilu.'}
              </SettingsAlert>
            ) : (
              <form
                id={formId}
                onSubmit={(e) => {
                  void handleSubmit(onSubmit, (fieldErrors) => {
                    if (fieldErrors.firstName) setFocus('firstName')
                    else if (fieldErrors.lastName) setFocus('lastName')
                  })(e)
                }}
                noValidate
              >
                <SettingsFieldGrid columns={2}>
                  <Input
                    id={`${formId}-first`}
                    label="Imię"
                    autoComplete="given-name"
                    {...register('firstName')}
                    aria-invalid={errors.firstName ? true : undefined}
                    error={errors.firstName?.message}
                  />
                  <Input
                    id={`${formId}-last`}
                    label="Nazwisko"
                    autoComplete="family-name"
                    {...register('lastName')}
                    aria-invalid={errors.lastName ? true : undefined}
                    error={errors.lastName?.message}
                  />
                </SettingsFieldGrid>
                {saveError ? <SettingsAlert>{saveError}</SettingsAlert> : null}
              </form>
            )}
          </SettingsSection>

          <SettingsSection labelledBy={`${formId}-email`}>
            <SettingsSectionHeader
              id={`${formId}-email`}
              title="Adres e-mail"
            />
            <SettingsReadonlyField
              label="Adres e-mail"
              value={sessionEmail}
              helper="Adres używany do logowania i powiadomień e-mail."
            />
          </SettingsSection>

          <SettingsSection labelledBy={`${formId}-legal`}>
            <SettingsSectionHeader
              id={`${formId}-legal`}
              title="Dokumenty prawne"
              description="Regulamin, polityka prywatności i umowa powierzenia danych."
            />
            <LegalLinksNav className={legalLinkStyles.settingsNav} />
          </SettingsSection>

          <SettingsSection labelledBy={`${formId}-danger`}>
            <SettingsSectionHeader
              id={`${formId}-danger`}
              title="Strefa niebezpieczna"
              description="Trwałe działania dotyczące konta."
            />
            <AccountDeletionDangerZone />
          </SettingsSection>
        </SettingsWorkspace>
      </PageContainer>
    </SettingsLayout>
  )
}
