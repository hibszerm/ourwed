import { z } from 'zod'
import { PROFESSION_VALUES } from '@/features/auth/services/professions'

const passwordSchema = z
  .string()
  .min(8, 'Hasło musi mieć co najmniej 8 znaków')
  .regex(/[a-z]/, 'Hasło musi zawierać małą literę')
  .regex(/[A-Z]/, 'Hasło musi zawierać wielką literę')
  .regex(/[0-9]/, 'Hasło musi zawierać cyfrę')

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Podaj adres e-mail')
    .email('Niepoprawny adres e-mail'),
  password: z.string().min(1, 'Podaj hasło'),
  rememberMe: z.boolean().optional(),
})

export type LoginFormValues = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Podaj imię'),
    lastName: z.string().trim().min(1, 'Podaj nazwisko'),
    email: z
      .string()
      .trim()
      .min(1, 'Podaj adres e-mail')
      .email('Niepoprawny adres e-mail'),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Powtórz hasło'),
    profession: z.string().min(1, 'Wybierz zawód'),
    acceptTerms: z.boolean().refine((v) => v === true, {
      message: 'Zaakceptuj regulamin, aby kontynuować',
    }),
  })
  .superRefine((data, ctx) => {
    if (
      !(PROFESSION_VALUES as readonly string[]).includes(data.profession)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Wybierz zawód',
        path: ['profession'],
      })
    }
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        message: 'Hasła muszą być takie same',
        path: ['confirmPassword'],
      })
    }
  })

export type RegisterFormValues = z.input<typeof registerSchema>

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Podaj adres e-mail')
    .email('Niepoprawny adres e-mail'),
})

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Powtórz hasło'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Hasła muszą być takie same',
    path: ['confirmPassword'],
  })

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>
