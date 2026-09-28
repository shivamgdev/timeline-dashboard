import { createContext } from 'react'
import type { AuthUser, LoginCredentials } from './types'

export type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated' | 'error'

export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  sessionExpired: boolean
  initializationError: string | null
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => Promise<void>
  restoreSession: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
