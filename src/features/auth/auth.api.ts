import { apiClient, DEFAULT_RETRIES } from '../../api/client'
import type { AuthUser, LoginCredentials, LoginResponse } from './types'

export const authApi = {
  login: (credentials: LoginCredentials) =>
    apiClient.post<LoginResponse>('/auth/login', credentials, { authenticated: false }),
  getCurrentUser: () => apiClient.get<AuthUser>('/auth/me', { retries: DEFAULT_RETRIES }),
  logout: (accessToken: string) => apiClient.post<unknown>('/auth/logout', undefined, { accessToken }),
}
