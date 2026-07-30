import { createBrowserRouter, Navigate, useParams } from 'react-router-dom'
import { AuthCallbackGate } from '@/features/auth/callback/AuthCallbackGate'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { DashboardPage } from '@/pages/DashboardPage'
import { DashboardV2Page } from '@/pages/DashboardV2Page'
import { WeddingsPage } from '@/pages/WeddingsPage'
import { WeddingDetailPage } from '@/pages/WeddingDetailPage'
import { WeddingContractGenerationPage } from '@/pages/WeddingContractGenerationPage'
import { WeddingContractPreviewPage } from '@/pages/WeddingContractPreviewPage'
import { NewWeddingPage } from '@/pages/NewWeddingPage'
import { WeddingImportPage } from '@/pages/WeddingImportPage'
import { WeddingContractRecoveryPage } from '@/pages/WeddingContractRecoveryPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { SessionsPage } from '@/pages/SessionsPage'
import { NewSessionPage } from '@/pages/NewSessionPage'
import { SessionDetailPage } from '@/pages/SessionDetailPage'
import { EditSessionPage } from '@/pages/EditSessionPage'
import { ContractQuestionnaireEditorPage } from '@/pages/ContractQuestionnaireEditorPage'
import { QuestionnaireDetailPage } from '@/pages/QuestionnaireDetailPage'
import { PendingWeddingsPage } from '@/pages/PendingWeddingsPage'
import { PackagesPage } from '@/pages/PackagesPage'
import { ExtraServicesPage } from '@/pages/ExtraServicesPage'
import { TravelSettingsPage } from '@/pages/TravelSettingsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AppearanceSettingsPage } from '@/pages/AppearanceSettingsPage'
import { CalendarIntegrationsPage } from '@/pages/CalendarIntegrationsPage'
import { CompanyDetailsPage } from '@/pages/CompanyDetailsPage'
import { DocumentTemplateDetailPage } from '@/pages/DocumentTemplateDetailPage'
import { DocumentTemplateMappingPage } from '@/pages/DocumentTemplateMappingPage'
import { DocumentTemplateConfigPage } from '@/pages/DocumentTemplateConfigPage'
import { DocumentTemplateFieldConfigPage } from '@/pages/DocumentTemplateFieldConfigPage'
import { PublicFormTokenPage } from '@/pages/PublicFormTokenPage'
import { PublicPreWeddingQuestionnairePage } from '@/pages/PublicPreWeddingQuestionnairePage'
import { QuestionnaireLibraryPage } from '@/pages/QuestionnaireLibraryPage'
import { PreWeddingTemplateEditorRoute } from '@/pages/PreWeddingTemplateEditorRoute'
import { LandingPage } from '@/pages/LandingPage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { CheckEmailPage } from '@/pages/CheckEmailPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { isAiContractLabEnabled } from '@/features/ai-contract-lab/aiContractLabFlags'

/** Redirect legacy `/umowy/szablony/:id…` URLs while preserving the id param. */
function RedirectTemplateDeepLink({
  toSuffix = '',
}: {
  toSuffix?: string
}) {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/studio/pakiety" replace />
  return (
    <Navigate
      to={`/ustawienia/dokumenty/szablony/${id}${toSuffix}`}
      replace
    />
  )
}

const aiContractLabRoutes = isAiContractLabEnabled()
  ? [
      {
        path: '/laboratorium-umow-ai',
        lazy: async () => {
          const mod = await import(
            '@/features/ai-contract-experiment/AiContractExperimentPage'
          )
          return { Component: mod.AiContractExperimentPage }
        },
      },
      {
        path: '/laboratorium-umow-ai/semantic',
        lazy: async () => {
          const mod = await import(
            '@/features/ai-contract-lab/AiContractLabPage'
          )
          return { Component: mod.AiContractLabPage }
        },
      },
      {
        path: '/eksperymenty/umowy-ai-transform',
        lazy: async () => {
          const mod = await import(
            '@/features/ai-contract-transform/TransformComparisonPage'
          )
          return { Component: mod.TransformComparisonPage }
        },
      },
      {
        path: '/laboratorium-umow-ai/porownanie',
        lazy: async () => {
          const mod = await import(
            '@/features/ai-contract-transform/TransformComparisonPage'
          )
          return { Component: mod.TransformComparisonPage }
        },
      },
    ]
  : []

const devRoutes = import.meta.env.DEV
  ? [
      {
        path: '/dev/contract-analysis-eval',
        lazy: async () => {
          const mod = await import(
            '@/features/documents/ai/evaluation/ContractAnalysisEvalPage'
          )
          return { Component: mod.ContractAnalysisEvalPage }
        },
      },
    ]
  : []

export const router = createBrowserRouter([
  {
    element: <AuthCallbackGate />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/check-email', element: <CheckEmailPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
      { path: '/form/:token', element: <PublicFormTokenPage /> },
      { path: '/ankieta/:token', element: <PublicPreWeddingQuestionnairePage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/dashboard-v2', element: <DashboardV2Page /> },
          { path: '/sluby', element: <WeddingsPage /> },
          { path: '/sluby/nowy', element: <NewWeddingPage /> },
          { path: '/sluby/import', element: <WeddingImportPage /> },
          {
            path: '/sluby/:weddingId/uzupelnij-z-umowy',
            element: <WeddingContractRecoveryPage />,
          },
          {
            path: '/sluby/:weddingId/umowy/nowa',
            element: <WeddingContractGenerationPage />,
          },
          {
            path: '/sluby/:weddingId/umowy/:contractId',
            element: <WeddingContractPreviewPage />,
          },
          { path: '/sluby/:id', element: <WeddingDetailPage /> },
          { path: '/sesje', element: <SessionsPage /> },
          { path: '/sesje/nowa', element: <NewSessionPage /> },
          { path: '/sesje/:sessionId/edytuj', element: <EditSessionPage /> },
          { path: '/sesje/:sessionId', element: <SessionDetailPage /> },
          { path: '/kalendarz', element: <CalendarPage /> },
      {
        path: '/ankiety',
        element: <QuestionnaireLibraryPage />,
      },
      {
        path: '/ankiety/dane-do-umowy',
        element: <ContractQuestionnaireEditorPage />,
      },
      {
        path: '/ankiety/przedslubne/:templateId',
        element: <PreWeddingTemplateEditorRoute />,
      },
      {
        path: '/ankiety/szablony',
        element: <Navigate to="/ankiety" replace />,
      },
      {
        path: '/ustawienia/szablony-ankiet',
        element: <Navigate to="/ankiety" replace />,
      },
      { path: '/ankiety/instancje/:id', element: <QuestionnaireDetailPage /> },
      { path: '/ankiety/:id', element: <QuestionnaireDetailPage /> },
      { path: '/oczekujace', element: <PendingWeddingsPage /> },
      // Deprecated standalone Contracts hub — templates live on Packages,
      // generated contracts live on Weddings. Keep deep links for Podgląd.
      {
        path: '/dokumenty',
        element: <Navigate to="/studio/pakiety" replace />,
      },
      {
        path: '/umowy',
        element: <Navigate to="/studio/pakiety" replace />,
      },
      {
        path: '/umowy/nowy',
        element: <Navigate to="/studio/pakiety" replace />,
      },
      {
        path: '/umowy/szablony/:id',
        element: <RedirectTemplateDeepLink />,
      },
      {
        path: '/umowy/szablony/:id/analiza',
        element: <RedirectTemplateDeepLink toSuffix="/analiza" />,
      },
      {
        path: '/umowy/szablony/:id/konfiguracja',
        element: <RedirectTemplateDeepLink toSuffix="/konfiguracja-pol" />,
      },
      {
        path: '/umowy/szablony/:id/pola-techniczne',
        element: <RedirectTemplateDeepLink toSuffix="/konfiguracja" />,
      },
      { path: '/studio/pakiety', element: <PackagesPage /> },
      { path: '/studio/uslugi', element: <ExtraServicesPage /> },
      {
        path: '/studio/podroz',
        element: <Navigate to="/ustawienia/podroz" replace />,
      },
      {
        path: '/ustawienia/ankiety-przedslubne',
        element: <Navigate to="/ankiety" replace />,
      },
      { path: '/ustawienia', element: <SettingsPage /> },
      { path: '/ustawienia/wyglad', element: <AppearanceSettingsPage /> },
      { path: '/ustawienia/integracje', element: <CalendarIntegrationsPage /> },
      { path: '/ustawienia/firma', element: <CompanyDetailsPage /> },
      {
        path: '/ustawienia/studio',
        element: <Navigate to="/ustawienia/firma" replace />,
      },
      { path: '/ustawienia/podroz', element: <TravelSettingsPage /> },
      {
        path: '/ustawienia/dokumenty',
        element: <Navigate to="/studio/pakiety" replace />,
      },
      {
        path: '/ustawienia/dokumenty/szablony',
        element: <Navigate to="/studio/pakiety" replace />,
      },
      {
        path: '/ustawienia/dokumenty/szablony/nowy',
        element: <Navigate to="/studio/pakiety" replace />,
      },
      {
        path: '/ustawienia/dokumenty/szablony/:id',
        element: <DocumentTemplateDetailPage />,
      },
      {
        path: '/ustawienia/dokumenty/szablony/:id/analiza',
        element: <DocumentTemplateMappingPage />,
      },
      {
        path: '/ustawienia/dokumenty/szablony/:id/konfiguracja',
        element: <DocumentTemplateConfigPage />,
      },
      {
        path: '/ustawienia/dokumenty/szablony/:id/konfiguracja-pol',
        element: <DocumentTemplateFieldConfigPage />,
      },
      ...aiContractLabRoutes,
      ...devRoutes,
        ],
      },
    ],
  },
])
