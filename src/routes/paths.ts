export const ROUTES = {
  login: '/login',
  dashboard: '/dashboard',
} as const

export interface RedirectState {
  from: string
}
