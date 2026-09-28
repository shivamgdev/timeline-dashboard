import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export const APP_TIME_ZONE = 'Asia/Kolkata'

export type IsoDate = string

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const EXPLICIT_OFFSET_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/i
const MINUTES_PER_HOUR = 60

export function parseClockTime(value: string): number | null {
  const match = CLOCK_TIME_PATTERN.exec(value)
  if (!match) return null
  return Number(match[1]) * MINUTES_PER_HOUR + Number(match[2])
}

export function formatClockTime(minutesOfDay: number): string {
  const hours = Math.floor(minutesOfDay / MINUTES_PER_HOUR)
  const minutes = minutesOfDay % MINUTES_PER_HOUR
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function parseIsoDateParts(value: string): [number, number, number] | null {
  const match = ISO_DATE_PATTERN.exec(value)
  if (!match) return null
  const parts: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const [year, month, day] = parts
  const date = new Date(Date.UTC(year, month - 1, day))
  const isRealDate = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return isRealDate ? parts : null
}

export function isIsoDate(value: string): value is IsoDate {
  return parseIsoDateParts(value) !== null
}

export function addDaysToIsoDate(date: IsoDate, days: number): IsoDate {
  const parts = parseIsoDateParts(date)
  if (!parts) throw new RangeError(`Invalid calendar date "${date}"`)
  const [year, month, day] = parts
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export function appZonedDateTimeToUtc(date: IsoDate, minutesOfDay: number): Date {
  if (!isIsoDate(date)) throw new RangeError(`Invalid calendar date "${date}"`)
  return fromZonedTime(`${date}T${formatClockTime(minutesOfDay)}:00`, APP_TIME_ZONE)
}

export function toUtcIsoString(date: Date): string {
  return date.toISOString().replace('.000Z', 'Z')
}

export function tryParseUtcTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !EXPLICIT_OFFSET_PATTERN.test(value)) return null
  const epochMs = Date.parse(value)
  return Number.isNaN(epochMs) ? null : epochMs
}

export function formatInAppTimeZone(date: Date | number | string, pattern: string): string {
  return formatInTimeZone(date, APP_TIME_ZONE, pattern)
}

export function toAppZonedIsoString(date: Date | number): string {
  return formatInAppTimeZone(date, "yyyy-MM-dd'T'HH:mm:ssXXX")
}

export function startOfAppTimeZoneHour(epochMs: number): number {
  const date = formatInAppTimeZone(epochMs, 'yyyy-MM-dd')
  const hour = Number(formatInAppTimeZone(epochMs, 'H'))
  return appZonedDateTimeToUtc(date, hour * 60).getTime()
}
