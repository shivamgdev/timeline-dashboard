import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { filterLabelId } from './filterLabelId'

interface FilterFieldProps {
  id: string
  label: string
  children: ReactNode
}

export default function FilterField({ id, label, children }: FilterFieldProps) {
  return (
    <Stack spacing={0.5}>
      <Typography
        component="label"
        id={filterLabelId(id)}
        htmlFor={id}
        variant="overline"
        color="text.secondary"
        sx={{ lineHeight: 1.5 }}
      >
        {label}
      </Typography>
      {children}
    </Stack>
  )
}
