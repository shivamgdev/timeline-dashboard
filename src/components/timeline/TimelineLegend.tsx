import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import type { SegmentKind } from '../../features/dashboard/timeline/types'
import { SEGMENT_KIND_LABELS, segmentColor } from './segmentStyles'

const ALWAYS_SHOWN_KINDS: readonly SegmentKind[] = [
  'runtime',
  'unplanned-production',
  'planned-downtime',
  'unknown-downtime',
  'stoppage',
]

function Swatch({
  color,
  label,
  shape = 'square',
}: {
  color: string
  label: string
  shape?: 'square' | 'dot' | 'cross'
}) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      {shape === 'cross' ? (
        <Box component="span" sx={{ color, fontWeight: 700, lineHeight: 1, fontSize: 14 }} aria-hidden>
          ×
        </Box>
      ) : (
        <Box
          component="span"
          aria-hidden
          sx={{ width: 10, height: 10, bgcolor: color, borderRadius: shape === 'dot' ? '50%' : 0.5 }}
        />
      )}
      <Typography variant="caption" fontWeight={500}>
        {label}
      </Typography>
    </Stack>
  )
}

export default function TimelineLegend({ kinds }: { kinds: ReadonlySet<SegmentKind> }) {
  const palette = useTheme().palette.timeline
  const shownKinds = kinds.has('unclassified') ? [...ALWAYS_SHOWN_KINDS, 'unclassified' as const] : ALWAYS_SHOWN_KINDS

  return (
    <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center">
      {shownKinds.map((kind) => (
        <Swatch key={kind} color={segmentColor(kind, palette)} label={SEGMENT_KIND_LABELS[kind]} />
      ))}
      <Swatch color={palette.pass} label="PASS" shape="dot" />
      <Swatch color={palette.fail} label="FAIL" shape="cross" />
    </Stack>
  )
}
