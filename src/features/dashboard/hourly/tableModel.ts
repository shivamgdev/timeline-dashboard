import { formatInAppTimeZone } from '../../../utils/timezone'
import { checkHourlySanity, type HourlySanityResult } from './sanity'
import type { HourlySummary, HourlySummaryColumn, ColumnState } from './types'

export interface HourlyTableColumn {
  key: string
  label: string
  state: ColumnState
}

export interface HourlyTableRow {
  id: string
  label: string
  unit: string | null
  cells: string[]
}

export interface HourlyTableModel {
  columns: HourlyTableColumn[]
  rows: HourlyTableRow[]
  sanity: HourlySanityResult
  notices: string[]
}

type CellValue = (column: HourlySummaryColumn) => number | null | undefined

const MS_PER_MINUTE = 60_000

const countFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const decimalFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 })

const ROWS: readonly { id: string; label: string; unit: string | null; value: CellValue; format: Intl.NumberFormat }[] =
  [
    { id: 'total', label: 'Total', unit: null, value: (column) => column.production?.total, format: countFormatter },
    { id: 'pass', label: 'Pass', unit: null, value: (column) => column.production?.okCount, format: countFormatter },
    { id: 'fail', label: 'Fail', unit: null, value: (column) => column.production?.ngCount, format: countFormatter },
    {
      id: 'runtime',
      label: 'Runtime',
      unit: 'min',
      value: (column) => toMinutes(column.durationsMs?.runtime),
      format: decimalFormatter,
    },
    {
      id: 'unplanned-production',
      label: 'Unplanned Production',
      unit: 'min',
      value: (column) => toMinutes(column.durationsMs?.['unplanned-production']),
      format: decimalFormatter,
    },
    {
      id: 'stoppage',
      label: 'Stoppage',
      unit: 'min',
      value: (column) => toMinutes(column.durationsMs?.stoppage),
      format: decimalFormatter,
    },
    {
      id: 'unknown-downtime',
      label: 'Unknown Downtime',
      unit: 'min',
      value: (column) => toMinutes(column.durationsMs?.['unknown-downtime']),
      format: decimalFormatter,
    },
    {
      id: 'ideal-cycle-time',
      label: 'Ideal Cycle Time',
      unit: 's',
      value: (column) => column.cycleTime?.idealSeconds,
      format: decimalFormatter,
    },
    {
      id: 'actual-cycle-time',
      label: 'Actual Cycle Time',
      unit: 's',
      value: (column) => column.cycleTime?.actualSeconds,
      format: decimalFormatter,
    },
  ]

function toMinutes(durationMs: number | undefined): number | undefined {
  return durationMs === undefined ? undefined : durationMs / MS_PER_MINUTE
}

function formatCell(value: number | null | undefined, format: Intl.NumberFormat): string {
  return value === null || value === undefined ? '' : format.format(value)
}

function columnLabel(column: HourlySummaryColumn): string {
  return `${formatInAppTimeZone(column.startMs, 'HH:mm')} – ${formatInAppTimeZone(column.endMs, 'HH:mm')}`
}

function totalMinutes(summary: HourlySummary, kind: 'planned-downtime' | 'unclassified'): number {
  return summary.columns.reduce((total, column) => total + (column.durationsMs?.[kind] ?? 0), 0) / MS_PER_MINUTE
}

function sumMinutes(
  sanity: HourlySanityResult,
  indices: number[],
  pick: (hour: HourlySanityResult['checked'][number]) => number,
) {
  return (
    sanity.checked.filter((hour) => indices.includes(hour.columnIndex)).reduce((t, hour) => t + pick(hour), 0) /
    MS_PER_MINUTE
  )
}

function buildNotices(summary: HourlySummary, sanity: HourlySanityResult): string[] {
  const notices: string[] = []
  const shortHours = sanity.explainedByOtherKinds.length
  const shortSuffix =
    shortHours > 0
      ? ` ${shortHours} elapsed hour(s) therefore add up to less than 60 min in the sanity check (runtime + unplanned production + stoppage + unknown downtime).`
      : ''
  const plannedMinutes = totalMinutes(summary, 'planned-downtime')
  if (plannedMinutes > 0) {
    notices.push(
      `Planned downtime (${decimalFormatter.format(plannedMinutes)} min in this shift) is not one of the rows specified for this table.${shortSuffix}`,
    )
  }
  const unclassifiedMinutes = totalMinutes(summary, 'unclassified')
  if (unclassifiedMinutes > 0) {
    notices.push(
      `Segments with an unrecognised type (${decimalFormatter.format(unclassifiedMinutes)} min) are not included in any row.${plannedMinutes > 0 ? '' : shortSuffix}`,
    )
  }
  if (sanity.uncovered.length > 0) {
    const minutes = sumMinutes(sanity, sanity.uncovered, (hour) => hour.uncoveredMs)
    notices.push(
      `${sanity.uncovered.length} elapsed hour(s) have ${decimalFormatter.format(minutes)} min not covered by any segment, so they add up to less than the hour.`,
    )
  }
  if (sanity.overlapping.length > 0) {
    const minutes = sumMinutes(sanity, sanity.overlapping, (hour) => -hour.uncoveredMs)
    notices.push(
      `${sanity.overlapping.length} elapsed hour(s) contain overlapping segments (${decimalFormatter.format(minutes)} min more than the hour).`,
    )
  }
  const unassigned = summary.unassignedProduction.length + summary.unassignedCycleTimes.length
  if (unassigned > 0) {
    notices.push(`${unassigned} hourly bucket(s) fall outside the shift's columns and are not shown.`)
  }
  if (summary.columnsWithMultipleCycleTimes.length > 0) {
    notices.push(
      `Cycle time is left blank for ${summary.columnsWithMultipleCycleTimes.length} hour(s) that received more than one cycle-time bucket.`,
    )
  }
  if (summary.invalidCycleTimes > 0) {
    notices.push(`${summary.invalidCycleTimes} cycle-time row(s) with an invalid timestamp were skipped.`)
  }
  return notices
}

export function buildHourlyTableModel(summary: HourlySummary): HourlyTableModel {
  const sanity = checkHourlySanity(summary)
  return {
    columns: summary.columns.map((column) => ({
      key: String(column.startMs),
      label: columnLabel(column),
      state: column.state,
    })),
    rows: ROWS.map((row) => ({
      id: row.id,
      label: row.label,
      unit: row.unit,
      cells: summary.columns.map((column) => formatCell(row.value(column), row.format)),
    })),
    sanity,
    notices: buildNotices(summary, sanity),
  }
}

export function isHourlySummaryEmpty(summary: HourlySummary): boolean {
  return summary.columns.every(
    (column) =>
      (column.production?.total ?? 0) === 0 &&
      Object.values(column.durationsMs ?? {}).every((value) => value === 0) &&
      column.cycleTime?.idealSeconds == null &&
      column.cycleTime?.actualSeconds == null,
  )
}
