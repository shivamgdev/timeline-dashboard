import { describe, expect, it } from 'vitest'
import { formatInAppTimeZone } from '../../../utils/timezone'
import { buildClockHourBoundaries, buildHourlyBoundaries } from './columns'

const ms = (iso: string) => Date.parse(iso)
const ist = (boundaries: number[]) => boundaries.map((value) => formatInAppTimeZone(value, 'HH:mm'))

const liveDayShift = { start: ms('2026-06-23T01:30:00Z'), end: ms('2026-06-23T13:30:00Z') }

describe('buildHourlyBoundaries', () => {
  it('builds hourly columns aligned to the window start when anchored there', () => {
    const boundaries = buildHourlyBoundaries(liveDayShift.start, liveDayShift.end, liveDayShift.start)
    expect(ist(boundaries)).toEqual([
      '07:00',
      '08:00',
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
      '18:00',
      '19:00',
    ])
  })

  it('builds columns aligned to UTC-hour buckets when anchored on a bucket start, with partial edge columns', () => {
    const boundaries = buildHourlyBoundaries(liveDayShift.start, liveDayShift.end, ms('2026-06-23T03:00:00Z'))
    expect(ist(boundaries)).toEqual([
      '07:00',
      '07:30',
      '08:30',
      '09:30',
      '10:30',
      '11:30',
      '12:30',
      '13:30',
      '14:30',
      '15:30',
      '16:30',
      '17:30',
      '18:30',
      '19:00',
    ])
  })

  it('gives the same columns under either anchor for the sample-payload shift (12:30–00:30 IST)', () => {
    const start = ms('2026-06-23T07:00:00Z')
    const end = ms('2026-06-23T19:00:00Z')
    const byWindow = buildHourlyBoundaries(start, end, start)
    expect(buildHourlyBoundaries(start, end, ms('2026-06-23T07:00:00Z'))).toEqual(byWindow)
    expect(byWindow).toHaveLength(13)
    expect(ist(byWindow).at(-1)).toBe('00:30')
  })

  it('handles an overnight window crossing IST midnight', () => {
    const boundaries = buildHourlyBoundaries(
      ms('2026-06-23T13:30:00Z'),
      ms('2026-06-24T01:30:00Z'),
      ms('2026-06-23T13:30:00Z'),
    )
    expect(ist(boundaries).slice(4, 7)).toEqual(['23:00', '00:00', '01:00'])
    expect(boundaries).toHaveLength(13)
  })

  it('accepts anchors before or after the window', () => {
    const early = buildHourlyBoundaries(liveDayShift.start, liveDayShift.end, ms('2020-01-01T00:00:00Z'))
    const late = buildHourlyBoundaries(liveDayShift.start, liveDayShift.end, ms('2030-01-01T00:00:00Z'))
    expect(early).toEqual(late)
  })

  it('rejects an empty or reversed window', () => {
    expect(() => buildHourlyBoundaries(liveDayShift.end, liveDayShift.start, liveDayShift.start)).toThrow(RangeError)
    expect(() => buildHourlyBoundaries(liveDayShift.start, liveDayShift.start, liveDayShift.start)).toThrow(RangeError)
  })
})

describe('buildClockHourBoundaries (ASG 2.4: one column per IST clock hour)', () => {
  it('uses whole IST hours for the live 07:00–19:00 shift', () => {
    expect(ist(buildClockHourBoundaries(liveDayShift.start, liveDayShift.end))).toEqual([
      '07:00',
      '08:00',
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
      '18:00',
      '19:00',
    ])
  })

  it('cuts at IST clock hours with partial edge columns for a :30 shift (sample 12:30–00:30)', () => {
    const boundaries = buildClockHourBoundaries(ms('2026-06-23T07:00:00Z'), ms('2026-06-23T19:00:00Z'))
    expect(ist(boundaries).slice(0, 3)).toEqual(['12:30', '13:00', '14:00'])
    expect(ist(boundaries).slice(-3)).toEqual(['23:00', '00:00', '00:30'])
    expect(boundaries).toHaveLength(14)
  })
})
