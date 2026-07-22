import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from '@/features/auth/services/authSchemas'
import styles from './AuthForms.module.css'

export function ResetPasswordForm() {
  const { updatePassword, logout } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  })

  async function onSubmit(values: ResetPasswordFormValues) {
    setFormError(null)
    const result = await updatePassword(values.password)
    if (!result.success) {
      setFormError(result.error)
      return
    }
    await logout()
    navigate('/login', { replace: true, state: { passwordReset: true } })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <Input
        id="reset-password"
        label="Nowe hasło"
        type="password"
        autoComplete="new-password"
        disabled={isSubmitting}
        error={errors.password?.message}
        {...register('password')}
      />
      <Input
        id="reset-confirm-password"
        label="Powtórz nowe hasło"
        type="password"
        autoComplete="new-password"
        disabled={isSubmitting}
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

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
        {isSubmitting ? 'Zapisywanie…' : 'Ustaw nowe hasło'}
      </Button>
    </form>
  )
}
