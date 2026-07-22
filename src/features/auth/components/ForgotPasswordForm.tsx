import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from '@/features/auth/services/authSchemas'
import styles from './AuthForms.module.css'

export function ForgotPasswordForm({
  onSent,
}: {
  onSent: (email: string) => void
}) {
  const { requestPasswordReset } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values: ForgotPasswordFormValues) {
    setFormError(null)
    const result = await requestPasswordReset(values.email)
    if (!result.success) {
      setFormError(result.error)
      return
    }
    onSent(values.email.trim().toLowerCase())
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <Input
        id="forgot-email"
        label="E-mail"
        type="email"
        autoComplete="email"
        disabled={isSubmitting}
        error={errors.email?.message}
        {...register('email')}
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
        {isSubmitting ? 'Wysyłanie…' : 'Wyślij link resetujący'}
      </Button>
    </form>
  )
}
