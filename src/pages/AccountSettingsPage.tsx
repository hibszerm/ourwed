import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AppLayout } from '@/layouts/AppLayout'
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
import styles from './AccountSettingsPage.module.css'

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

  return (
    <AppLayout
      title="Konto"
      subtitle="Zarządzaj podstawowymi danymi swojego profilu."
    >
      <PageContainer width="narrow">
        <div className={styles.page} data-testid="account-settings">
          <p className={styles.back}>
            <Link to="/ustawienia" className={styles.backLink}>
              ← Ustawienia
            </Link>
          </p>

          <section className={styles.section} aria-labelledby={`${formId}-names`}>
            <h2 id={`${formId}-names`} className={styles.sectionTitle}>
              Dane konta
            </h2>
            <p className={styles.sectionLead}>
              Imię i nazwisko widoczne w panelu OurWed.
            </p>

            {profileQuery.isPending ? (
              <div
                className={styles.skeleton}
                aria-busy="true"
                aria-label="Wczytywanie profilu"
              >
                <div className={styles.skeletonBar} />
                <div className={styles.skeletonBar} />
                <div className={styles.skeletonBar} />
              </div>
            ) : profileQuery.isError ? (
              <p className={styles.status} data-state="error" role="alert">
                {profileQuery.error instanceof Error
                  ? profileQuery.error.message
                  : 'Nie udało się wczytać profilu.'}
              </p>
            ) : (
              <form
                className={styles.form}
                onSubmit={(e) => {
                  void handleSubmit(onSubmit, (fieldErrors) => {
                    if (fieldErrors.firstName) setFocus('firstName')
                    else if (fieldErrors.lastName) setFocus('lastName')
                  })(e)
                }}
                noValidate
              >
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

                <div className={styles.actions}>
                  <Button type="submit" variant="primary" disabled={!canSave}>
                    {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
                  </Button>
                  <p
                    className={styles.status}
                    data-state={flash}
                    role="status"
                    aria-live="polite"
                  >
                    {flash === 'saved'
                      ? 'Dane konta zostały zapisane.'
                      : flash === 'error'
                        ? 'Nie udało się zapisać danych. Spróbuj ponownie.'
                        : null}
                  </p>
                </div>
              </form>
            )}
          </section>

          <section className={styles.section} aria-labelledby={`${formId}-email`}>
            <h2 id={`${formId}-email`} className={styles.sectionTitle}>
              Adres e-mail
            </h2>
            <Input
              id={`${formId}-email-field`}
              label="Adres e-mail"
              autoComplete="email"
              value={sessionEmail}
              readOnly
              disabled
            />
            <p className={styles.emailNote}>
              Zmiana adresu e-mail będzie dostępna osobno.
            </p>
          </section>
        </div>
      </PageContainer>
    </AppLayout>
  )
}
