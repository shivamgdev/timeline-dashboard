import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { AssetOption } from '../../features/dashboard/types'
import { isSameAsset } from '../../features/dashboard/utils/assets'

interface AssetSelectProps {
  id: string
  options: readonly AssetOption[]
  value: AssetOption | null
  placeholder: string
  onChange: (asset: AssetOption) => void
}

const FIELD_WIDTH = 320

export default function AssetSelect({ id, options, value, placeholder, onChange }: AssetSelectProps) {
  if (!value) {
    return <TextField id={id} size="small" placeholder={placeholder} disabled sx={{ width: FIELD_WIDTH }} />
  }

  return (
    <Autocomplete
      id={id}
      size="small"
      sx={{ width: FIELD_WIDTH }}
      options={options}
      value={value}
      onChange={(_, next) => onChange(next)}
      disableClearable
      groupBy={(option) => option.groupLabel}
      getOptionLabel={(option) => option.name}
      getOptionKey={(option) => option.assetId}
      isOptionEqualToValue={isSameAsset}
      renderOption={({ key, ...optionProps }, option) => (
        <Box component="li" key={key} {...optionProps}>
          <Box sx={{ pl: option.depth * 2 }}>
            <Typography variant="body2" fontWeight={option.depth === 0 ? 500 : 400}>
              {option.name}
            </Typography>
            {option.codename && (
              <Typography variant="caption" color="text.secondary">
                {option.codename}
              </Typography>
            )}
          </Box>
        </Box>
      )}
      renderInput={(params) => <TextField {...params} />}
    />
  )
}
