import { z } from 'zod'

/** Account profile name fields — Polish characters, spaces, hyphens, apostrophes allowed. */
export const accountProfileSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'Podaj imię')
    .max(60, 'Imię może mieć maksymalnie 60 znaków'),
  lastName: z
    .string()
    .trim()
    .min(1, 'Podaj nazwisko')
    .max(80, 'Nazwisko może mieć maksymalnie 80 znaków'),
})

export type AccountProfileFormValues = z.infer<typeof accountProfileSchema>
