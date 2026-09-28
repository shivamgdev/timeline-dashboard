import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'

export default function PageLoader() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <CircularProgress />
    </Box>
  )
}
