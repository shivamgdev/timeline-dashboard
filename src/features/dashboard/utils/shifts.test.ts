import { describe, expect, it } from 'vitest'
import type { ShiftDefinition } from '../types'
import { buildShiftCatalog, buildShiftSlots, buildShiftWindow } from './shifts'

function definition(shift_timings: string[], overrides: Partial<ShiftDefinition> = {}): ShiftDefinition {
  return { id: 'shift-id', code: 'main', name: 'main', shift_timings, is_active: true, ...overrides }
}

function slotsOf(timings: string[]) {
  const result = buildShiftSlots(definition(timings))
  if (!result.ok) throw new Error(result.error)
  return result.slots
}

describe('buildShiftSlots', () => {
  it('interprets shift_timings as start times, the last wrapping to the first', () => {
    const slots = slotsOf(['00:30', '12:30'])
    expect(slots.map((slot) => [slot.startTime, slot.endTime, slot.crossesMidnight])).toEqual([
      ['00:30', '12:30', false],
      ['12:30', '00:30', true],
    ])
    expect(slots.map((slot) => slot.label)).toEqual(['main — 00:30–12:30', 'main — 12:30–00:30'])
  })

  it('supports three shifts', () => {
    expect(slotsOf(['06:00', '14:00', '22:00']).map((slot) => `${slot.startTime}-${slot.endTime}`)).toEqual([
      '06:00-14:00',
      '14:00-22:00',
      '22:00-06:00',
    ])
  })

  it('supports an arbitrary number of shifts', () => {
    const slots = slotsOf(['00:00', '06:00', '12:00', '18:00'])
    expect(slots).toHaveLength(4)
    expect(slots.at(-1)).toMatchObject({ startTime: '18:00', endTime: '00:00', crossesMidnight: true })
    expect(slots.filter((slot) => slot.crossesMidnight)).toHaveLength(1)
  })

  it('treats a single start time as a 24-hour shift', () => {
    expect(slotsOf(['07:00'])).toMatchObject([{ startTime: '07:00', endTime: '07:00', crossesMidnight: true }])
  })

  it('orders shifts chronologically regardless of backend order', () => {
    expect(slotsOf(['22:00', '06:00', '14:00']).map((slot) => slot.startTime)).toEqual(['06:00', '14:00', '22:00'])
  })

  it('ends a shift starting at 12:00 at 00:00 of the next day', () => {
    expect(slotsOf(['00:00', '12:00'])[1]).toMatchObject({
      startTime: '12:00',
      endTime: '00:00',
      crossesMidnight: true,
    })
  })

  it('builds stable keys from the shift id and start time', () => {
    expect(slotsOf(['00:30', '12:30']).map((slot) => slot.key)).toEqual(['shift-id@00:30', 'shift-id@12:30'])
  })

  it.each([
    [[], 'has no shift timings'],
    [['25:00'], 'invalid start time "25:00"'],
    [['6:00', '18:00'], 'invalid start time "6:00"'],
    [['06:00', '06:00'], 'duplicate start times'],
  ])('rejects %j', (timings, message) => {
    const result = buildShiftSlots(definition(timings))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(message)
  })

  it('rejects non-array or non-string timings from an untyped payload', () => {
    const payloads: ShiftDefinition[] = JSON.parse(
      '[{"id":"a","code":"a","name":"a","shift_timings":null,"is_active":true},' +
        '{"id":"b","code":"b","name":"b","shift_timings":[600],"is_active":true}]',
    )
    expect(payloads.map((payload) => buildShiftSlots(payload).ok)).toEqual([false, false])
  })
})

describe('buildShiftCatalog', () => {
  it('uses active definitions only and reports malformed ones', () => {
    const catalog = buildShiftCatalog([
      definition(['06:00', '14:00', '22:00'], { id: 'inactive', is_active: false }),
      definition(['07:00', '19:00'], { id: 'summer', name: 'summer-shift' }),
      definition(['99:00'], { id: 'broken', name: 'broken' }),
    ])
    expect(catalog.slots.map((slot) => slot.key)).toEqual(['summer@07:00', 'summer@19:00'])
    expect(catalog.errors).toEqual(['Shift "broken" has an invalid start time "99:00" (expected HH:MM).'])
  })

  it('returns no slots when nothing is active', () => {
    expect(buildShiftCatalog([definition(['06:00'], { is_active: false })])).toEqual({ slots: [], errors: [] })
  })
})

describe('buildShiftWindow', () => {
  it('A: same-day shift 00:30 → 12:30', () => {
    const [slot] = slotsOf(['00:30', '12:30'])
    expect(buildShiftWindow('2026-06-23', slot!)).toMatchObject({
      startLocal: '2026-06-23T00:30:00+05:30',
      endLocal: '2026-06-23T12:30:00+05:30',
      fromTs: '2026-06-22T19:00:00Z',
      toTs: '2026-06-23T07:00:00Z',
    })
  })

  it('B: overnight shift 12:30 → 00:30 ends on the next calendar day', () => {
    const [, slot] = slotsOf(['00:30', '12:30'])
    expect(buildShiftWindow('2026-06-23', slot!)).toMatchObject({
      startLocal: '2026-06-23T12:30:00+05:30',
      endLocal: '2026-06-24T00:30:00+05:30',
      fromTs: '2026-06-23T07:00:00Z',
      toTs: '2026-06-23T19:00:00Z',
    })
  })

  it('C: three-shift definition, last shift wraps to 06:00 next day', () => {
    const windows = slotsOf(['06:00', '14:00', '22:00']).map((slot) => buildShiftWindow('2026-06-23', slot))
    expect(windows.map(({ startLocal, endLocal }) => [startLocal, endLocal])).toEqual([
      ['2026-06-23T06:00:00+05:30', '2026-06-23T14:00:00+05:30'],
      ['2026-06-23T14:00:00+05:30', '2026-06-23T22:00:00+05:30'],
      ['2026-06-23T22:00:00+05:30', '2026-06-24T06:00:00+05:30'],
    ])
    expect(windows.map(({ fromTs, toTs }) => [fromTs, toTs])).toEqual([
      ['2026-06-23T00:30:00Z', '2026-06-23T08:30:00Z'],
      ['2026-06-23T08:30:00Z', '2026-06-23T16:30:00Z'],
      ['2026-06-23T16:30:00Z', '2026-06-24T00:30:00Z'],
    ])
  })

  it('rolls an overnight shift over a month boundary', () => {
    const [, , slot] = slotsOf(['06:00', '14:00', '22:00'])
    expect(buildShiftWindow('2026-06-30', slot!)).toMatchObject({
      endLocal: '2026-07-01T06:00:00+05:30',
      toTs: '2026-07-01T00:30:00Z',
    })
  })

  it('exposes epoch bounds consistent with the UTC timestamps', () => {
    const [slot] = slotsOf(['07:00', '19:00'])
    const window = buildShiftWindow('2026-06-23', slot!)
    expect(window.startMs).toBe(Date.parse(window.fromTs))
    expect(window.endMs - window.startMs).toBe(12 * 60 * 60 * 1000)
  })
})
