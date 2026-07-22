import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  loginSchema,
  type LoginFormValues,
} from '@/features/auth/services/authSchemas'
import styles from './AuthForms.module.css'

export function LoginForm() {
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
    navigate('/dashboard', { replace: true })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <Input
        id="login-email"
        label="E-mail"
        type="email"
        autoComplete="email"
        disabled={isSubmitting}
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        id="login-password"
        label="Hasło"
        type="password"
        autoComplete="current-password"
        disabled={isSubmitting}
        error={errors.password?.message}
        {...register('password')}
      />

      <div className={styles.metaRow}>
        <label className={styles.checkbox}>
          <input type="checkbox" disabled={isSubmitting} {...register('rememberMe')} />
          Zapamiętaj mnie
        </label>
        <Link to="/forgot-password" className={styles.link}>
          Nie pamiętam hasła
        </Link>
      </div>

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
        {isSubmitting ? 'Logowanie…' : 'Zaloguj się'}
      </Button>
    </form>
  )
}
