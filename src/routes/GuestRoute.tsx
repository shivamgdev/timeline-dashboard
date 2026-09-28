import { Navigate, Outlet, useLocation } from 'react-router'
import PageLoader from '../components/common/PageLoader'
import { useAuth } from '../features/auth/useAuth'
import { ROUTES } from './paths'

function getRedirectPath(state: unknown): string {
  if (
    typeof state === 'object' &&
    state !== null &&
    'from' in state &&
    typeof state.from === 'string' &&
    !state.from.startsWith(ROUTES.login)
  ) {
    return state.from
  }
  return ROUTES.dashboard
}

export default function GuestRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'initializing') return <PageLoader />
  if (status === 'authenticated') return <Navigate to={getRedirectPath(location.state)} replace />
  return <Outlet />
}
