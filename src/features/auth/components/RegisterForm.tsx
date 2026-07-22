import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  registerSchema,
  type RegisterFormValues,
} from '@/features/auth/services/authSchemas'
import { PROFESSIONS } from '@/features/auth/services/professions'
import styles from './AuthForms.module.css'

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

export function RegisterForm() {
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

    navigate('/check-email', {
      replace: true,
      state: { email: result.data.email },
    })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
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
        label="E-mail"
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
        <div style={{ marginTop: 8 }}>
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
        {PROFESSIONS.map((item) => (
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
          Akceptuję regulamin i politykę prywatności OurWed.
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
        className={styles.submit}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Tworzenie konta…' : 'Utwórz konto'}
      </Button>
    </form>
  )
}
