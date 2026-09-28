import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Typography from '@mui/material/Typography'
import type { ShiftSlot } from '../../features/dashboard/types'
import { filterLabelId } from './filterLabelId'

interface ShiftSelectProps {
  id: string
  slots: readonly ShiftSlot[]
  value: ShiftSlot | null
  placeholder: string
  onChange: (slot: ShiftSlot) => void
}

export default function ShiftSelect({ id, slots, value, placeholder, onChange }: ShiftSelectProps) {
  return (
    <Select
      id={id}
      labelId={filterLabelId(id)}
      size="small"
      sx={{ minWidth: 240 }}
      value={value?.key ?? ''}
      displayEmpty
      disabled={slots.length === 0}
      renderValue={(key) => slots.find((slot) => slot.key === key)?.label ?? placeholder}
      onChange={(event) => {
        const next = slots.find((slot) => slot.key === event.target.value)
        if (next) onChange(next)
      }}
    >
      {slots.map((slot) => (
        <MenuItem key={slot.key} value={slot.key}>
          {slot.label}
          {slot.crossesMidnight && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              +1 day
            </Typography>
          )}
        </MenuItem>
      ))}
    </Select>
  )
}
