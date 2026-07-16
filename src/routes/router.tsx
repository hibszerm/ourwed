import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { DashboardPage } from '@/pages/DashboardPage'
import { WeddingsPage } from '@/pages/WeddingsPage'
import { WeddingDetailPage } from '@/pages/WeddingDetailPage'
import { NewWeddingPage } from '@/pages/NewWeddingPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { FormPage } from '@/pages/FormPage'
import { LoginPage } from '@/pages/LoginPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
/** @deprecated Use Form Engine (`/forms/:token`) instead. Kept for Sprint 04 demos. */
import { PortalLayout } from '@/features/portal/PortalLayout'
import { PortalWelcomePage } from '@/features/portal/PortalWelcomePage'
import { PortalContractDataPage } from '@/features/portal/PortalContractDataPage'
import { PortalStatusPage } from '@/features/portal/PortalStatusPage'
import { PortalSuccessPage } from '@/features/portal/PortalSuccessPage'
import { PortalComingSoonPage } from '@/features/portal/PortalComingSoonPage'
import {
  IconEquipment,
  IconFinances,
  IconSettings,
  IconTasks,
} from '@/components/icons'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/forms/:token',
    element: <FormPage />,
  },
  /**
   * @deprecated Couple Portal v1 — replaced by Form Engine (`/forms/:token`).
   * Public like forms — not behind studio auth.
   */
  {
    path: '/portal/:token',
    element: <PortalLayout />,
    children: [
      { index: true, element: <PortalWelcomePage /> },
      { path: 'dane', element: <PortalContractDataPage /> },
      { path: 'status', element: <PortalStatusPage /> },
      { path: 'sukces', element: <PortalSuccessPage /> },
      { path: 'ankieta', element: <PortalComingSoonPage title="Ankieta ślubna" /> },
      { path: 'umowa', element: <PortalComingSoonPage title="Umowa" /> },
      { path: 'kontakt', element: <PortalComingSoonPage title="Kontakt" /> },
    ],
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
        path: '/zadania',
        element: (
          <PlaceholderPage
            title="Zadania"
            description="Lista zadań"
            icon={<IconTasks width={32} height={32} />}
          />
        ),
      },
      {
        path: '/sprzet',
        element: (
          <PlaceholderPage
            title="Sprzęt"
            description="Zarządzanie sprzętem"
            icon={<IconEquipment width={32} height={32} />}
          />
        ),
      },
      {
        path: '/finanse',
        element: (
          <PlaceholderPage
            title="Finanse"
            description="Przegląd finansów"
            icon={<IconFinances width={32} height={32} />}
          />
        ),
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
