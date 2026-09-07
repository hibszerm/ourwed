import { LegalDocumentPage } from '@/features/legal/LegalDocumentPage'
import {
  POWIERZENIE_SECTIONS,
  POWIERZENIE_TITLE,
} from '@/features/legal/content/powierzenieDanych'

export function PowierzenieDanychPage() {
  return (
    <LegalDocumentPage
      title={POWIERZENIE_TITLE}
      description="Umowa powierzenia przetwarzania danych osobowych OurWed — zasady art. 28 RODO dla danych klientów przetwarzanych w CRM."
      sections={POWIERZENIE_SECTIONS}
    />
  )
}
