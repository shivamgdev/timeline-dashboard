import { Navigate, Outlet, useLocation } from 'react-router'
import PageLoader from '../components/common/PageLoader'
import SessionRestoreError from '../features/auth/components/SessionRestoreError'
import { useAuth } from '../features/auth/useAuth'
import { ROUTES, type RedirectState } from './paths'

export default function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'initializing') return <PageLoader />
  if (status === 'error') return <SessionRestoreError />
  if (status === 'unauthenticated') {
    const state: RedirectState = { from: `${location.pathname}${location.search}` }
    return <Navigate to={ROUTES.login} replace state={state} />
  }
  return <Outlet />
}
