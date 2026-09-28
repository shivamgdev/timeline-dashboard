// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/errors'
import { deferred, flush } from '../../test/renderHook'
import { authApi } from './auth.api'
import type { AuthContextValue } from './AuthContext'
import { AuthProvider } from './AuthProvider'
import { tokenStorage } from './tokenStorage'
import type { AuthUser } from './types'
import { useAuth } from './useAuth'

vi.mock('./auth.api', () => ({
  authApi: { login: vi.fn(), getCurrentUser: vi.fn(), logout: vi.fn() },
}))

const user: AuthUser = {
  id: 'u',
  hid: 1,
  username: 'user',
  name: 'User',
  email: 'user@mail.com',
  customer_id: 'c',
  customer_name: 'C',
  designation_id: 'd',
  designation_name: 'D',
  department_id: 'dep',
  department_name: 'Dep',
  status: 'active',
  roles: [],
}

async function renderSignedIn() {
  tokenStorage.set('old-token')
  vi.mocked(authApi.getCurrentUser).mockResolvedValue(user)
  let auth: AuthContextValue | null = null
  const AuthProbe = () => {
    auth = useAuth()
    return null
  }
  const root = createRoot(document.createElement('div'))
  act(() => root.render(createElement(AuthProvider, null, createElement(AuthProbe))))
  await flush()
  return { current: () => auth!, root }
}

beforeEach(() => {
  vi.mocked(authApi.getCurrentUser).mockReset()
  vi.mocked(authApi.logout).mockReset()
  tokenStorage.clear()
})

describe('AuthProvider logout', () => {
  it('signs out locally before the server logout request completes', async () => {
    const serverLogout = deferred<unknown>()
    vi.mocked(authApi.logout).mockReturnValue(serverLogout.promise)
    const { current } = await renderSignedIn()
    expect(current().status).toBe('authenticated')

    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = current().logout()
    })
    expect(current().status).toBe('unauthenticated')
    expect(current().user).toBeNull()
    expect(tokenStorage.get()).toBeNull()
    expect(authApi.logout).toHaveBeenCalledWith('old-token')

    serverLogout.resolve(null)
    await act(() => pending)
    expect(current().status).toBe('unauthenticated')
  })

  it('stays signed out without errors or an expiry banner when the server logout fails', async () => {
    vi.mocked(authApi.logout).mockRejectedValue(new ApiError('Invalid token', 401))
    const { current } = await renderSignedIn()

    await act(() => current().logout())
    expect(current()).toMatchObject({ status: 'unauthenticated', sessionExpired: false, user: null })
    expect(tokenStorage.get()).toBeNull()
  })
})
