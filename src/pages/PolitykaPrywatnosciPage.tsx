import { LegalDocumentPage } from '@/features/legal/LegalDocumentPage'
import {
  POLITYKA_SECTIONS,
  POLITYKA_TITLE,
} from '@/features/legal/content/politykaPrywatnosci'

export function PolitykaPrywatnosciPage() {
  return (
    <LegalDocumentPage
      title={POLITYKA_TITLE}
      description="Polityka prywatności OurWed — informacje o przetwarzaniu danych konta, danych klientów studiów, dostawcach i prawach RODO."
      sections={POLITYKA_SECTIONS}
    />
  )
}
