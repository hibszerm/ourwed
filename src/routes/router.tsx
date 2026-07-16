import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { DashboardPage } from '@/pages/DashboardPage'
import { WeddingsPage } from '@/pages/WeddingsPage'
import { WeddingDetailPage } from '@/pages/WeddingDetailPage'
import { NewWeddingPage } from '@/pages/NewWeddingPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { QuestionnairesPage } from '@/pages/QuestionnairesPage'
import { QuestionnaireDetailPage } from '@/pages/QuestionnaireDetailPage'
import { PendingWeddingsPage } from '@/pages/PendingWeddingsPage'
import { PublicFormTokenPage } from '@/pages/PublicFormTokenPage'
import { LoginPage } from '@/pages/LoginPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { IconSettings } from '@/components/icons'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/form/:token',
    element: <PublicFormTokenPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <Navigate to="/dashboard" replace />,
      },
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
        path: '/ustawienia',
        element: (
          <PlaceholderPage
            title="Ustawienia"
            description="Ustawienia aplikacji"
            icon={<IconSettings width={32} height={32} />}
          />
        ),
      },
    ],
  },
])
