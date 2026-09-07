import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { blurActiveElement, settleAfterBlur } from '@/components/ui/iosFocus'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  loginSchema,
  type LoginFormValues,
} from '@/features/auth/services/authSchemas'
import styles from './AuthForms.module.css'

interface LoginFormProps {
  /** When set, called after successful login instead of navigating. */
  onSuccess?: () => void
  /** When set, used instead of linking to /forgot-password. */
  onForgotPassword?: () => void
}

export function LoginForm({ onSuccess, onForgotPassword }: LoginFormProps = {}) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: true,
    },
  })

  async function onSubmit(values: LoginFormValues) {
    setFormError(null)
    const result = await login(values.email, values.password, {
      rememberMe: values.rememberMe ?? true,
    })
    if (!result.success) {
      setFormError(result.error)
      return
    }
    // iOS: dismiss keyboard / auto-zoom before mounting the app shell.
    blurActiveElement()
    await settleAfterBlur()
    if (onSuccess) {
      onSuccess()
      return
    }
    navigate('/dashboard', { replace: true })
  }

  return (
    <form
      className={`${styles.form} ${styles.authFields}`}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      data-auth-form="login"
    >
      <Input
        id="login-email"
        label="Adres e-mail"
        type="email"
        autoComplete="email"
        disabled={isSubmitting}
        error={errors.email?.message}
        {...register('email')}
      />

      <div className={styles.passwordBlock}>
        <div className={styles.passwordLabelRow}>
          <label className={styles.passwordLabel} htmlFor="login-password">
            Hasło
          </label>
          {onForgotPassword ? (
            <button
              type="button"
              className={styles.linkButton}
              onClick={onForgotPassword}
            >
              Nie pamiętasz hasła?
            </button>
          ) : (
            <Link to="/forgot-password" className={styles.link}>
              Nie pamiętasz hasła?
            </Link>
          )}
        </div>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          disabled={isSubmitting}
          error={errors.password?.message}
          aria-label="Hasło"
          {...register('password')}
        />
      </div>

      <div className={styles.metaRow}>
        <label className={styles.checkbox}>
          <input type="checkbox" disabled={isSubmitting} {...register('rememberMe')} />
          Zapamiętaj mnie na tym urządzeniu
        </label>
      </div>

      {formError ? (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        className={`${styles.submit} ${styles.submitPrimary}`}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Logowanie…' : 'Zaloguj się'}
      </Button>
    </form>
  )
}
