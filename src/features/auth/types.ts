export interface LoginCredentials {
  username: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
}

export interface AuthUser {
  id: string
  hid: number
  username: string
  name: string
  email: string
  customer_id: string
  customer_name: string
  designation_id: string
  designation_name: string
  department_id: string
  department_name: string
  status: string
  roles: string[]
}
