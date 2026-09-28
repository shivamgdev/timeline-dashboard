import {
  addDaysToIsoDate,
  appZonedDateTimeToUtc,
  formatClockTime,
  parseClockTime,
  toAppZonedIsoString,
  toUtcIsoString,
  type IsoDate,
} from '../../../utils/timezone'
import type { ShiftDefinition, ShiftSlot, ShiftWindow } from '../types'

export type ShiftSlotsResult = { ok: true; slots: ShiftSlot[] } | { ok: false; error: string }

export interface ShiftCatalog {
  slots: ShiftSlot[]
  errors: string[]
}

export function buildShiftSlots(definition: ShiftDefinition): ShiftSlotsResult {
  const fail = (reason: string): ShiftSlotsResult => ({ ok: false, error: `Shift "${definition.name}" ${reason}.` })
  const timings: unknown = definition.shift_timings

  if (!Array.isArray(timings) || timings.length === 0) return fail('has no shift timings')

  const startMinutes: number[] = []
  for (const timing of timings) {
    const minutes = typeof timing === 'string' ? parseClockTime(timing) : null
    if (minutes === null) return fail(`has an invalid start time "${String(timing)}" (expected HH:MM)`)
    startMinutes.push(minutes)
  }

  const ordered = [...startMinutes].sort((a, b) => a - b)
  if (new Set(ordered).size !== ordered.length) return fail('has duplicate start times')

  const slots = ordered.map((start, index): ShiftSlot => {
    const end = ordered[(index + 1) % ordered.length] ?? start
    const startTime = formatClockTime(start)
    const endTime = formatClockTime(end)
    return {
      key: `${definition.id}@${startTime}`,
      shiftId: definition.id,
      shiftCode: definition.code,
      shiftName: definition.name,
      startTime,
      endTime,
      startMinutes: start,
      endMinutes: end,
      crossesMidnight: end <= start,
      label: `${definition.name} — ${startTime}–${endTime}`,
    }
  })

  return { ok: true, slots }
}

export function buildShiftCatalog(definitions: readonly ShiftDefinition[]): ShiftCatalog {
  const catalog: ShiftCatalog = { slots: [], errors: [] }
  for (const definition of definitions) {
    if (!definition.is_active) continue
    const result = buildShiftSlots(definition)
    if (result.ok) catalog.slots.push(...result.slots)
    else catalog.errors.push(result.error)
  }
  return catalog
}

export function buildShiftWindow(date: IsoDate, slot: ShiftSlot): ShiftWindow {
  const endDate = slot.crossesMidnight ? addDaysToIsoDate(date, 1) : date
  const start = appZonedDateTimeToUtc(date, slot.startMinutes)
  const end = appZonedDateTimeToUtc(endDate, slot.endMinutes)
  return {
    date,
    startLocal: toAppZonedIsoString(start),
    endLocal: toAppZonedIsoString(end),
    fromTs: toUtcIsoString(start),
    toTs: toUtcIsoString(end),
    startMs: start.getTime(),
    endMs: end.getTime(),
  }
}
