import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import LoginForm from '../features/auth/components/LoginForm'
import { useAuth } from '../features/auth/useAuth'

export default function LoginPage() {
  const { sessionExpired } = useAuth()

  return (
    <Box component="main" sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh', px: 2, py: 4 }}>
      <Card sx={{ width: '100%', maxWidth: 400 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack spacing={0.5} sx={{ mb: 3 }}>
            <Typography variant="h5" component="h1" fontWeight={600}>
              Timeline Dashboard
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sign in to continue
            </Typography>
          </Stack>
          {sessionExpired && (
            <Alert severity="info" sx={{ mb: 2.5 }}>
              Your session has expired. Please sign in again.
            </Alert>
          )}
          <LoginForm />
        </CardContent>
      </Card>
    </Box>
  )
}
