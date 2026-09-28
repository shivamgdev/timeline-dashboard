import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { configureApiClient } from '../../api/client'
import { getErrorMessage, isApiError } from '../../api/errors'
import { authApi } from './auth.api'
import { AuthContext, type AuthContextValue } from './AuthContext'
import { tokenStorage } from './tokenStorage'
import type { AuthUser, LoginCredentials } from './types'

type AuthState =
  | { status: 'initializing' }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'unauthenticated'; sessionExpired: boolean }
  | { status: 'error'; message: string }

const SIGNED_OUT: AuthState = { status: 'unauthenticated', sessionExpired: false }

function getInitialState(): AuthState {
  return tokenStorage.get() ? { status: 'initializing' } : SIGNED_OUT
}

async function resolveSession(): Promise<AuthState> {
  try {
    return { status: 'authenticated', user: await authApi.getCurrentUser() }
  } catch (error) {
    if (isApiError(error) && error.isUnauthorized) {
      tokenStorage.clear()
      return { status: 'unauthenticated', sessionExpired: true }
    }
    return { status: 'error', message: getErrorMessage(error, 'We could not verify your session.') }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(getInitialState)
  const restoreStarted = useRef(false)

  const expireSession = useCallback(() => {
    tokenStorage.clear()
    setState((current) =>
      current.status === 'unauthenticated' ? current : { status: 'unauthenticated', sessionExpired: true },
    )
  }, [])

  useEffect(() => {
    configureApiClient({ getAccessToken: tokenStorage.get, onUnauthorized: expireSession })
  }, [expireSession])

  useEffect(() => {
    if (restoreStarted.current) return
    restoreStarted.current = true
    if (tokenStorage.get()) void resolveSession().then(setState)
  }, [])

  const restoreSession = useCallback(async () => {
    if (!tokenStorage.get()) {
      setState(SIGNED_OUT)
      return
    }
    setState({ status: 'initializing' })
    setState(await resolveSession())
  }, [])

  const login = useCallback(async (credentials: LoginCredentials) => {
    const { access_token } = await authApi.login(credentials)
    tokenStorage.set(access_token)
    try {
      const user = await authApi.getCurrentUser()
      setState({ status: 'authenticated', user })
    } catch (error) {
      tokenStorage.clear()
      throw error
    }
  }, [])

  const logout = useCallback(async () => {
    const token = tokenStorage.get()
    tokenStorage.clear()
    setState(SIGNED_OUT)
    if (token) await authApi.logout(token).catch(() => undefined)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.status === 'authenticated' ? state.user : null,
      sessionExpired: state.status === 'unauthenticated' && state.sessionExpired,
      initializationError: state.status === 'error' ? state.message : null,
      login,
      logout,
      restoreSession,
    }),
    [state, login, logout, restoreSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
