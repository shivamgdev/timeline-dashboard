import { describe, expect, it } from 'vitest'
import {
  addDaysToIsoDate,
  appZonedDateTimeToUtc,
  formatClockTime,
  formatInAppTimeZone,
  isIsoDate,
  parseClockTime,
  startOfAppTimeZoneHour,
  toAppZonedIsoString,
  toUtcIsoString,
  tryParseUtcTimestamp,
} from './timezone'

describe('test environment', () => {
  it('runs in a host timezone other than IST', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York')
    expect(new Date('2026-06-23T00:00:00Z').getTimezoneOffset()).not.toBe(-330)
  })
})

describe('parseClockTime', () => {
  it.each([
    ['00:00', 0],
    ['00:30', 30],
    ['12:30', 750],
    ['23:59', 1439],
  ])('parses %s', (value, minutes) => {
    expect(parseClockTime(value)).toBe(minutes)
  })

  it.each(['24:00', '7:00', '12:60', '', '12:30:00', ' 12:30', '12-30', 'ab:cd'])('rejects %j', (value) => {
    expect(parseClockTime(value)).toBeNull()
  })
})

describe('formatClockTime', () => {
  it('zero-pads hours and minutes', () => {
    expect(formatClockTime(0)).toBe('00:00')
    expect(formatClockTime(390)).toBe('06:30')
    expect(formatClockTime(1439)).toBe('23:59')
  })
})

describe('calendar dates', () => {
  it('validates real calendar dates only', () => {
    expect(isIsoDate('2026-06-23')).toBe(true)
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2026-06-31')).toBe(false)
    expect(isIsoDate('2026-6-23')).toBe(false)
    expect(isIsoDate('')).toBe(false)
  })

  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDaysToIsoDate('2026-06-23', 1)).toBe('2026-06-24')
    expect(addDaysToIsoDate('2026-06-30', 1)).toBe('2026-07-01')
    expect(addDaysToIsoDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToIsoDate('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDaysToIsoDate('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('rejects invalid dates', () => {
    expect(() => addDaysToIsoDate('2026-02-30', 1)).toThrow(RangeError)
  })
})

describe('IST → UTC', () => {
  it('converts an IST wall-clock time to the UTC instant', () => {
    expect(toUtcIsoString(appZonedDateTimeToUtc('2026-06-23', 12 * 60 + 30))).toBe('2026-06-23T07:00:00Z')
    expect(toUtcIsoString(appZonedDateTimeToUtc('2026-06-23', 30))).toBe('2026-06-22T19:00:00Z')
    expect(toUtcIsoString(appZonedDateTimeToUtc('2026-06-24', 0))).toBe('2026-06-23T18:30:00Z')
  })

  it('is unaffected by the host DST transition', () => {
    expect(toUtcIsoString(appZonedDateTimeToUtc('2026-03-08', 12 * 60))).toBe('2026-03-08T06:30:00Z')
    expect(toUtcIsoString(appZonedDateTimeToUtc('2026-11-01', 12 * 60))).toBe('2026-11-01T06:30:00Z')
  })

  it('rejects invalid dates', () => {
    expect(() => appZonedDateTimeToUtc('2026-13-01', 0)).toThrow(RangeError)
  })

  it('serialises without milliseconds and with a Z suffix', () => {
    expect(toUtcIsoString(new Date(Date.UTC(2026, 5, 23, 7)))).toBe('2026-06-23T07:00:00Z')
  })
})

describe('UTC → IST', () => {
  it('formats UTC timestamps as IST wall-clock time', () => {
    expect(formatInAppTimeZone('2026-06-23T07:03:56Z', 'yyyy-MM-dd HH:mm:ss')).toBe('2026-06-23 12:33:56')
    expect(formatInAppTimeZone('2026-06-23T19:00:00Z', 'yyyy-MM-dd HH:mm')).toBe('2026-06-24 00:30')
    expect(formatInAppTimeZone('2026-06-22T18:29:59Z', 'yyyy-MM-dd HH:mm:ss')).toBe('2026-06-22 23:59:59')
  })

  it('produces an ISO string with the +05:30 offset', () => {
    expect(toAppZonedIsoString(Date.parse('2026-06-23T07:00:00Z'))).toBe('2026-06-23T12:30:00+05:30')
  })
})

describe('tryParseUtcTimestamp', () => {
  it('parses timestamps with an explicit offset', () => {
    expect(tryParseUtcTimestamp('2026-06-23T07:00:00Z')).toBe(Date.UTC(2026, 5, 23, 7))
    expect(tryParseUtcTimestamp('2026-06-23T12:30:00+05:30')).toBe(Date.UTC(2026, 5, 23, 7))
  })

  it('refuses naive, invalid or non-string timestamps instead of reading them in the host timezone', () => {
    expect(tryParseUtcTimestamp('2026-06-23T07:00:00')).toBeNull()
    expect(tryParseUtcTimestamp('not a date Z')).toBeNull()
    expect(tryParseUtcTimestamp(null)).toBeNull()
    expect(tryParseUtcTimestamp(1750662000000)).toBeNull()
  })
})

describe('startOfAppTimeZoneHour', () => {
  it('floors an instant to the start of its IST clock hour', () => {
    expect(toUtcIsoString(new Date(startOfAppTimeZoneHour(Date.parse('2026-06-23T01:30:00Z'))))).toBe(
      '2026-06-23T01:30:00Z',
    )
    expect(toUtcIsoString(new Date(startOfAppTimeZoneHour(Date.parse('2026-06-23T07:00:00Z'))))).toBe(
      '2026-06-23T06:30:00Z',
    )
    expect(toUtcIsoString(new Date(startOfAppTimeZoneHour(Date.parse('2026-06-23T18:45:10Z'))))).toBe(
      '2026-06-23T18:30:00Z',
    )
  })
})
