import { createBrowserRouter, Navigate, useParams } from 'react-router-dom'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { DashboardPage } from '@/pages/DashboardPage'
import { DashboardV2Page } from '@/pages/DashboardV2Page'
import { WeddingsPage } from '@/pages/WeddingsPage'
import { WeddingDetailPage } from '@/pages/WeddingDetailPage'
import { NewWeddingPage } from '@/pages/NewWeddingPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { QuestionnairesPage } from '@/pages/QuestionnairesPage'
import { QuestionnaireDetailPage } from '@/pages/QuestionnaireDetailPage'
import { QuestionnaireTemplatesPage } from '@/pages/QuestionnaireTemplatesPage'
import { PendingWeddingsPage } from '@/pages/PendingWeddingsPage'
import { PackagesPage } from '@/pages/PackagesPage'
import { ExtraServicesPage } from '@/pages/ExtraServicesPage'
import { TravelSettingsPage } from '@/pages/TravelSettingsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { CompanyDetailsPage } from '@/pages/CompanyDetailsPage'
import { DocumentsHubPage } from '@/pages/DocumentsHubPage'
import { DocumentTemplatesPage } from '@/pages/DocumentTemplatesPage'
import { DocumentTemplateNewPage } from '@/pages/DocumentTemplateNewPage'
import { DocumentTemplateDetailPage } from '@/pages/DocumentTemplateDetailPage'
import { DocumentTemplateMappingPage } from '@/pages/DocumentTemplateMappingPage'
import { PublicFormTokenPage } from '@/pages/PublicFormTokenPage'
import { LandingPage } from '@/pages/LandingPage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { CheckEmailPage } from '@/pages/CheckEmailPage'

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

function RedirectTemplateAnaliza() {
  const { id } = useParams<{ id: string }>()
  return (
    <Navigate to={`/ustawienia/dokumenty/szablony/${id}/analiza`} replace />
  )
}
export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/check-email', element: <CheckEmailPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/form/:token', element: <PublicFormTokenPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/dashboard-v2', element: <DashboardV2Page /> },
      { path: '/sluby', element: <WeddingsPage /> },
      { path: '/sluby/nowy', element: <NewWeddingPage /> },
      { path: '/sluby/:id', element: <WeddingDetailPage /> },
      { path: '/kalendarz', element: <CalendarPage /> },
      { path: '/ankiety', element: <QuestionnairesPage /> },
      {
        path: '/ankiety/szablony',
        element: <QuestionnaireTemplatesPage />,
      },
      {
        path: '/ustawienia/szablony-ankiet',
        element: <Navigate to="/ankiety/szablony" replace />,
      },
      { path: '/ankiety/:id', element: <QuestionnaireDetailPage /> },
      { path: '/oczekujace', element: <PendingWeddingsPage /> },
      {
        path: '/dokumenty',
        element: <Navigate to="/ustawienia/dokumenty/szablony" replace />,
      },
      { path: '/studio/pakiety', element: <PackagesPage /> },
      { path: '/studio/uslugi', element: <ExtraServicesPage /> },
      {
        path: '/studio/podroz',
        element: <Navigate to="/ustawienia/podroz" replace />,
      },
      { path: '/ustawienia', element: <SettingsPage /> },
      { path: '/ustawienia/firma', element: <CompanyDetailsPage /> },
      {
        path: '/ustawienia/studio',
        element: <Navigate to="/ustawienia/firma" replace />,
      },
      { path: '/ustawienia/podroz', element: <TravelSettingsPage /> },
      { path: '/ustawienia/dokumenty', element: <DocumentsHubPage /> },
      {
        path: '/ustawienia/dokumenty/szablony',
        element: <DocumentTemplatesPage />,
      },
      {
        path: '/ustawienia/dokumenty/szablony/nowy',
        element: <DocumentTemplateNewPage />,
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
        element: <RedirectTemplateAnaliza />,
      },
      ...devRoutes,
    ],
  },
])
