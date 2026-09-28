import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { getErrorMessage } from '../../../api/errors'
import type { LoginCredentials } from '../types'
import { useAuth } from '../useAuth'

type FieldErrors = Partial<Record<keyof LoginCredentials, string>>

function validate({ username, password }: LoginCredentials): FieldErrors {
  const errors: FieldErrors = {}
  if (!username.trim()) errors.username = 'Username is required'
  if (!password) errors.password = 'Password is required'
  return errors
}

export default function LoginForm() {
  const { login } = useAuth()
  const [values, setValues] = useState<LoginCredentials>({ username: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (field: keyof LoginCredentials) => (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target
    setValues((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return

    const errors = validate(values)
    setFieldErrors(errors)
    if (Object.values(errors).some(Boolean)) return

    setSubmitError(null)
    setIsSubmitting(true)
    try {
      await login({ username: values.username.trim(), password: values.password })
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Unable to sign in. Please try again.'))
      setIsSubmitting(false)
    }
  }

  return (
    <Stack component="form" spacing={2.5} noValidate onSubmit={(event) => void handleSubmit(event)}>
      <TextField
        label="Username"
        name="username"
        autoComplete="username"
        autoFocus
        fullWidth
        value={values.username}
        onChange={handleChange('username')}
        error={Boolean(fieldErrors.username)}
        helperText={fieldErrors.username}
        disabled={isSubmitting}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        fullWidth
        value={values.password}
        onChange={handleChange('password')}
        error={Boolean(fieldErrors.password)}
        helperText={fieldErrors.password}
        disabled={isSubmitting}
      />
      {submitError && (
        <Alert severity="error" role="alert">
          {submitError}
        </Alert>
      )}
      <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting} aria-busy={isSubmitting}>
        {isSubmitting ? <CircularProgress size={24} color="inherit" aria-label="Signing in" /> : 'Sign in'}
      </Button>
    </Stack>
  )
}
