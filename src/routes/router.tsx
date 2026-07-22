import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { DashboardPage } from '@/pages/DashboardPage'
import { WeddingsPage } from '@/pages/WeddingsPage'
import { WeddingDetailPage } from '@/pages/WeddingDetailPage'
import { NewWeddingPage } from '@/pages/NewWeddingPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { QuestionnairesPage } from '@/pages/QuestionnairesPage'
import { QuestionnaireDetailPage } from '@/pages/QuestionnaireDetailPage'
import { PendingWeddingsPage } from '@/pages/PendingWeddingsPage'
import { PackagesPage } from '@/pages/PackagesPage'
import { ExtraServicesPage } from '@/pages/ExtraServicesPage'
import { TravelSettingsPage } from '@/pages/TravelSettingsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { DocumentsHubPage } from '@/pages/DocumentsHubPage'
import { DocumentTemplatesPage } from '@/pages/DocumentTemplatesPage'
import { DocumentTemplateDetailPage } from '@/pages/DocumentTemplateDetailPage'
import { DocumentTemplateMappingPage } from '@/pages/DocumentTemplateMappingPage'
import { PublicFormTokenPage } from '@/pages/PublicFormTokenPage'
import { LandingPage } from '@/pages/LandingPage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { CheckEmailPage } from '@/pages/CheckEmailPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/check-email',
    element: <CheckEmailPage />,
  },
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },
  {
    path: '/form/:token',
    element: <PublicFormTokenPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/dashboard',
        element: <DashboardPage />,
      },
      {
        path: '/sluby',
        element: <WeddingsPage />,
      },
      {
        path: '/sluby/nowy',
        element: <NewWeddingPage />,
      },
      {
        path: '/sluby/:id',
        element: <WeddingDetailPage />,
      },
      {
        path: '/kalendarz',
        element: <CalendarPage />,
      },
      {
        path: '/ankiety',
        element: <QuestionnairesPage />,
      },
      {
        path: '/ankiety/:id',
        element: <QuestionnaireDetailPage />,
      },
      {
        path: '/oczekujace',
        element: <PendingWeddingsPage />,
      },
      {
        path: '/studio/pakiety',
        element: <PackagesPage />,
      },
      {
        path: '/studio/uslugi',
        element: <ExtraServicesPage />,
      },
      {
        path: '/studio/podroz',
        element: <TravelSettingsPage />,
      },
      {
        path: '/ustawienia',
        element: <SettingsPage />,
      },
      {
        path: '/ustawienia/dokumenty',
        element: <DocumentsHubPage />,
      },
      {
        path: '/ustawienia/dokumenty/szablony',
        element: <DocumentTemplatesPage />,
      },
      {
        path: '/ustawienia/dokumenty/szablony/:id',
        element: <DocumentTemplateDetailPage />,
      },
      {
        path: '/ustawienia/dokumenty/szablony/:id/konfiguracja',
        element: <DocumentTemplateMappingPage />,
      },
    ],
  },
])
