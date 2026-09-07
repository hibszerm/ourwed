import { LegalDocumentPage } from '@/features/legal/LegalDocumentPage'
import {
  REGULAMIN_SECTIONS,
  REGULAMIN_TITLE,
} from '@/features/legal/content/regulamin'

export function RegulaminPage() {
  return (
    <LegalDocumentPage
      title={REGULAMIN_TITLE}
      description="Regulamin korzystania z platformy OurWed — zasady konta, okresu próbnego, planów płatnych, treści użytkownika i odpowiedzialności."
      sections={REGULAMIN_SECTIONS}
    />
  )
}
