import { createBrowserRouter, Navigate } from 'react-router'
import PageLoader from '../components/common/PageLoader'
import AppLayout from '../components/layout/AppLayout'
import GuestRoute from './GuestRoute'
import { ROUTES } from './paths'
import ProtectedRoute from './ProtectedRoute'

export const router = createBrowserRouter([
  {
    HydrateFallback: PageLoader,
    children: [
      {
        element: <GuestRoute />,
        children: [
          {
            path: ROUTES.login,
            lazy: async () => ({ Component: (await import('../pages/LoginPage')).default }),
          },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              {
                path: ROUTES.dashboard,
                lazy: async () => ({ Component: (await import('../pages/DashboardPage')).default }),
              },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to={ROUTES.dashboard} replace /> },
    ],
  },
])
