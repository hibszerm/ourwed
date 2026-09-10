import { useEffect } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { PrzewodnikPageContent } from '@/features/onboarding/guide/PrzewodnikPageContent'
import { useGuideIntegrationPreference } from '@/features/onboarding/guide/useGuideIntegrationPreference'

function MarkGuideDiscoveredOnVisit() {
  const { preference, markDiscovered } = useGuideIntegrationPreference()

  useEffect(() => {
    if (!preference.discovered) markDiscovered()
  }, [preference.discovered, markDiscovered])

  return null
}

export function PrzewodnikPage() {
  return (
    <AppLayout>
      <MarkGuideDiscoveredOnVisit />
      <PageContainer width="wide">
        <PrzewodnikPageContent />
      </PageContainer>
    </AppLayout>
  )
}
