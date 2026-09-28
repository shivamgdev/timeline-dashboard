import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import { useMemo } from 'react'
import type { AssetOption, ShiftWindow } from '../../features/dashboard/types'
import { formatInAppTimeZone } from '../../utils/timezone'

interface ShiftWindowSummaryProps {
  asset: AssetOption | null
  shiftWindow: ShiftWindow | null
}

const RANGE_FORMAT = 'dd MMM, HH:mm'

export default function ShiftWindowSummary({ asset, shiftWindow }: ShiftWindowSummaryProps) {
  const range = useMemo(
    () =>
      shiftWindow && {
        start: formatInAppTimeZone(shiftWindow.startMs, RANGE_FORMAT),
        end: formatInAppTimeZone(shiftWindow.endMs, RANGE_FORMAT),
      },
    [shiftWindow],
  )

  if (!asset && !range) return null

  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      {asset && <Chip size="small" label={asset.name} sx={{ bgcolor: 'primary.light', color: 'primary.main' }} />}
      {shiftWindow && range && (
        <Chip
          size="small"
          label={
            <>
              <time dateTime={shiftWindow.fromTs}>{range.start}</time> –{' '}
              <time dateTime={shiftWindow.toTs}>{range.end}</time> IST
            </>
          }
        />
      )}
    </Stack>
  )
}
