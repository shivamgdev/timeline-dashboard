import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { Outlet } from 'react-router'
import UserMenu from './UserMenu'

export default function AppLayout() {
  return (
    <>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar>
          <Typography variant="h6" component="span" sx={{ flexGrow: 1, fontWeight: 600 }}>
            Timeline Dashboard
          </Typography>
          <UserMenu />
        </Toolbar>
      </AppBar>
      <main>
        <Outlet />
      </main>
    </>
  )
}
