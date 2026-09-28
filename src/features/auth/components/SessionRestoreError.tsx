import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAuth } from '../useAuth'

export default function SessionRestoreError() {
  const { initializationError, restoreSession, logout } = useAuth()

  return (
    <Box component="main" sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh', px: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 440 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack spacing={2.5}>
            <Typography variant="h6" component="h1">
              Unable to restore your session
            </Typography>
            <Alert severity="error">{initializationError}</Alert>
            <Stack direction="row" spacing={1.5} justifyContent="flex-end">
              <Button onClick={() => void logout()}>Sign in again</Button>
              <Button variant="contained" onClick={() => void restoreSession()}>
                Retry
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
