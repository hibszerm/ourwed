/**
 * Client personCount → local grammatical agreement helpers.
 */

export type ClientAgreementGender = 'female' | 'male' | 'unknown'

/** Expected apposition forms near "dalej Parą Młodą" / "Zleceniodawcą". */
export function expectedClientAgreementForm(input: {
  personCount: 1 | 2
  gender?: ClientAgreementGender
}): string {
  if (input.personCount === 2) return 'zwani'
  if (input.gender === 'male') return 'zwanym'
  return 'zwaną'
}

const AGREEMENT_FORMS = new Set([
  'zwaną',
  'zwanym',
  'zwani',
  'zwane',
  'nazywaną',
  'nazywanym',
  'nazywani',
])

export function isClientAgreementToken(token: string): boolean {
  const t = token
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[.,;:]+$/g, '')
  const folded = token.toLowerCase().replace(/[.,;:]+$/g, '')
  return (
    AGREEMENT_FORMS.has(folded) ||
    t === 'zwana' ||
    t === 'zwanym' ||
    t === 'zwani' ||
    t === 'zwane'
  )
}

/** True when source→replacement is only a personCount agreement swap. */
export function isPersonCountAgreementEdit(
  sourceText: string,
  replacementText: string,
): boolean {
  const src = sourceText.trim().toLowerCase().replace(/[.,;:]+$/g, '')
  const rep = replacementText.trim().toLowerCase().replace(/[.,;:]+$/g, '')
  if (!isClientAgreementToken(src) || !isClientAgreementToken(rep)) return false
  return src !== rep
}
