import { z } from 'zod'
import type { SessionType } from '@/types/session'
import { SESSION_TYPES } from '@/features/sessions/presentation/sessionType'

const personSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
})

const locationSchema = z
  .object({
    name: z.string().optional(),
    address: z.string().optional(),
    formattedAddress: z.string().optional(),
    placeId: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    source: z.string().optional(),
    verificationStatus: z.string().optional(),
  })
  .optional()

export const sessionFormSchema = z
  .object({
    customName: z.string().optional(),
    primaryPerson: personSchema.default({}),
    secondaryPerson: personSchema.default({}),
    sessionType: z.enum(SESSION_TYPES as [SessionType, ...SessionType[]]),
    customSessionType: z.string().optional(),
    date: z.string().min(1, 'Wybierz datę sesji'),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    location: locationSchema,
    totalPrice: z.number().min(0, 'Cena nie może być ujemna'),
    depositAmount: z.number().min(0, 'Zaliczka nie może być ujemna'),
    notes: z.string().optional(),
    linkedWeddingId: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const hasName = Boolean(data.customName?.trim())
    const hasPerson = [
      data.primaryPerson?.firstName,
      data.primaryPerson?.lastName,
      data.secondaryPerson?.firstName,
      data.secondaryPerson?.lastName,
    ].some((v) => Boolean(v?.trim()))

    if (!hasName && !hasPerson) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customName'],
        message:
          'Podaj nazwę sesji lub imię / nazwisko przynajmniej jednej osoby',
      })
    }

    if (data.sessionType === 'other' && !data.customSessionType?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customSessionType'],
        message: 'Wpisz rodzaj sesji',
      })
    }

    if (data.depositAmount > data.totalPrice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['depositAmount'],
        message: 'Zaliczka nie może przekraczać ceny',
      })
    }

    const start = data.startTime?.trim()
    const end = data.endTime?.trim()
    if (start && end && end < start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message:
          'Godzina zakończenia nie może być wcześniejsza niż rozpoczęcia',
      })
    }
  })

export type SessionFormValues = z.infer<typeof sessionFormSchema>
