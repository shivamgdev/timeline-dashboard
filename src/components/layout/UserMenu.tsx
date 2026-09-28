import LogoutIcon from '@mui/icons-material/Logout'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import { useState, type MouseEvent } from 'react'
import { useAuth } from '../../features/auth/useAuth'

export default function UserMenu() {
  const { user, logout } = useAuth()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  if (!user) return null

  const handleLogout = async () => {
    setIsLoggingOut(true)
    await logout()
  }

  return (
    <>
      <Button
        color="inherit"
        onClick={(event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget)}
        startIcon={
          <Avatar sx={{ width: 28, height: 28, fontSize: 14, bgcolor: 'primary.main' }}>
            {user.name.charAt(0).toUpperCase()}
          </Avatar>
        }
        aria-haspopup="menu"
        aria-controls={anchorEl ? 'user-menu' : undefined}
        aria-expanded={Boolean(anchorEl)}
      >
        {user.name}
      </Button>
      <Menu
        id="user-menu"
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">{user.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {user.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem onClick={() => void handleLogout()} disabled={isLoggingOut}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          {isLoggingOut ? 'Signing out…' : 'Sign out'}
        </MenuItem>
      </Menu>
    </>
  )
}
