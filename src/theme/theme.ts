import { createTheme } from '@mui/material/styles'

export interface TimelinePalette {
  runtime: string
  unplannedProduction: string
  plannedDowntime: string
  unknownDowntime: string
  stoppage: string
  unclassified: string
  pass: string
  fail: string
}

declare module '@mui/material/styles' {
  interface Palette {
    timeline: TimelinePalette
  }
  interface PaletteOptions {
    timeline?: TimelinePalette
  }
}

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1d4ed8', dark: '#1e2a78', light: '#e8eefc' },
    background: { default: '#f3f4f6', paper: '#ffffff' },
    text: { primary: '#1f2937', secondary: '#6b7280' },
    divider: '#e5e7eb',
    timeline: {
      runtime: '#26a69a',
      unplannedProduction: '#c6d93b',
      plannedDowntime: '#6aa312',
      unknownDowntime: '#f7845e',
      stoppage: '#6a5acd',
      unclassified: '#9e9e9e',
      pass: '#1d4ed8',
      fail: '#dc2626',
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: 'Roboto, "Helvetica Neue", Arial, sans-serif',
    overline: { fontWeight: 600, letterSpacing: '0.08em', lineHeight: 1.6 },
    button: { textTransform: 'none', fontWeight: 500 },
  },
  components: {
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(16, 24, 40, 0.06), 0 1px 2px rgba(16, 24, 40, 0.04)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 600 },
      },
    },
  },
})
