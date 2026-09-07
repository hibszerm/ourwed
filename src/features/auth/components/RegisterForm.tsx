import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  registerSchema,
  type RegisterFormValues,
} from '@/features/auth/services/authSchemas'
import { REGISTRATION_PROFESSIONS } from '@/features/auth/services/professions'
import { LEGAL_ROUTES } from '@/features/legal/legalMeta'
import legalLinkStyles from '@/features/legal/LegalLinks.module.css'
import styles from './AuthForms.module.css'

/**
 * Temporary pre-launch registration UI lock.
 * Flip to `true` to restore account creation from /register.
 * Does not remove signup logic — presentation-only gate.
 */
const REGISTRATION_ENABLED = false

function PasswordHints({ password }: { password: string }) {
  const checks = useMemo(
    () => [
      { ok: password.length >= 8, label: 'Minimum 8 znaków' },
      { ok: /[a-z]/.test(password), label: 'Mała litera' },
      { ok: /[A-Z]/.test(password), label: 'Wielka litera' },
      { ok: /[0-9]/.test(password), label: 'Cyfra' },
    ],
    [password],
  )

  return (
    <ul className={styles.hintList} aria-live="polite">
      {checks.map((item) => (
        <li key={item.label} data-ok={item.ok}>
          {item.ok ? '✓' : '○'} {item.label}
        </li>
      ))}
    </ul>
  )
}

export function RegisterForm({
  onRegistered,
}: {
  /** Called with email after successful signup (skips navigation when set). */
  onRegistered?: (email: string) => void
} = {}) {
  const { register: registerAccount } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      profession: '',
      acceptTerms: false,
    },
  })

  const password = useWatch({ control, name: 'password' }) ?? ''

  async function onSubmit(values: RegisterFormValues) {
    // Belt-and-suspenders: disabled submit must never reach Supabase signup.
    if (!REGISTRATION_ENABLED) return

    setFormError(null)
    const result = await registerAccount({
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      password: values.password,
      profession: values.profession,
    })

    if (!result.success) {
      setFormError(result.error)
      return
    }

    if (onRegistered) {
      onRegistered(result.data.email)
      return
    }

    navigate('/check-email', {
      replace: true,
      state: { email: result.data.email },
    })
  }

  return (
    <form
      className={`${styles.form} ${styles.authFields}`}
      onSubmit={
        REGISTRATION_ENABLED
          ? handleSubmit(onSubmit)
          : (event) => {
              event.preventDefault()
            }
      }
      noValidate
      data-auth-form="register"
      data-registration-enabled={REGISTRATION_ENABLED ? 'true' : 'false'}
    >
      <div className={styles.row}>
        <Input
          id="register-first-name"
          label="Imię"
          autoComplete="given-name"
          disabled={isSubmitting}
          error={errors.firstName?.message}
          {...register('firstName')}
        />
        <Input
          id="register-last-name"
          label="Nazwisko"
          autoComplete="family-name"
          disabled={isSubmitting}
          error={errors.lastName?.message}
          {...register('lastName')}
        />
      </div>

      <Input
        id="register-email"
        label="Adres e-mail"
        type="email"
        autoComplete="email"
        disabled={isSubmitting}
        error={errors.email?.message}
        {...register('email')}
      />

      <div>
        <Input
          id="register-password"
          label="Hasło"
          type="password"
          autoComplete="new-password"
          disabled={isSubmitting}
          error={errors.password?.message}
          {...register('password')}
        />
        <div className={styles.hintWrap}>
          <PasswordHints password={password} />
        </div>
      </div>

      <Input
        id="register-confirm-password"
        label="Powtórz hasło"
        type="password"
        autoComplete="new-password"
        disabled={isSubmitting}
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

      <Select
        id="register-profession"
        label="Zawód"
        disabled={isSubmitting}
        error={errors.profession?.message}
        defaultValue=""
        {...register('profession')}
      >
        <option value="" disabled>
          Wybierz zawód
        </option>
        {REGISTRATION_PROFESSIONS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>

      <label
        className={`${styles.checkbox} ${errors.acceptTerms ? styles.checkboxError : ''}`.trim()}
      >
        <input type="checkbox" disabled={isSubmitting} {...register('acceptTerms')} />
        <span>
          Akceptuję{' '}
          <Link
            to={LEGAL_ROUTES.terms}
            className={legalLinkStyles.inlineLink}
            onClick={(event) => event.stopPropagation()}
          >
            regulamin
          </Link>{' '}
          i{' '}
          <Link
            to={LEGAL_ROUTES.privacy}
            className={legalLinkStyles.inlineLink}
            onClick={(event) => event.stopPropagation()}
          >
            politykę prywatności
          </Link>{' '}
          OurWed.
        </span>
      </label>
      {errors.acceptTerms?.message ? (
        <p className={styles.formError} role="alert">
          {errors.acceptTerms.message}
        </p>
      ) : null}

      {formError ? (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        className={`${styles.submit} ${styles.submitPrimary}`}
        disabled={!REGISTRATION_ENABLED || isSubmitting}
        aria-disabled={!REGISTRATION_ENABLED || isSubmitting}
      >
        {isSubmitting ? 'Tworzenie konta…' : 'Utwórz konto'}
      </Button>
    </form>
  )
}
