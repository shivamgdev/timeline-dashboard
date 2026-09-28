import type { SegmentKind } from '../../features/dashboard/timeline/types'
import type { TimelinePalette } from '../../theme/theme'

export const SEGMENT_KIND_LABELS: Readonly<Record<SegmentKind, string>> = {
  runtime: 'Runtime',
  'unplanned-production': 'Unplanned production',
  'planned-downtime': 'Planned downtime',
  'unknown-downtime': 'Unknown downtime',
  stoppage: 'Stoppage',
  unclassified: 'Unclassified',
}

export function segmentColor(kind: SegmentKind, palette: TimelinePalette): string {
  switch (kind) {
    case 'runtime':
      return palette.runtime
    case 'unplanned-production':
      return palette.unplannedProduction
    case 'planned-downtime':
      return palette.plannedDowntime
    case 'unknown-downtime':
      return palette.unknownDowntime
    case 'stoppage':
      return palette.stoppage
    case 'unclassified':
      return palette.unclassified
  }
}
