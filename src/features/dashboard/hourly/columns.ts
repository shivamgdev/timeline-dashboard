import { HOURLY_BUCKET_MS } from '../timeline/chartModel'
import { startOfAppTimeZoneHour } from '../../../utils/timezone'

export function buildHourlyBoundaries(windowStartMs: number, windowEndMs: number, anchorMs: number): number[] {
  if (!(windowEndMs > windowStartMs)) throw new RangeError('The window end must be after its start')
  const offset = (((windowStartMs - anchorMs) % HOURLY_BUCKET_MS) + HOURLY_BUCKET_MS) % HOURLY_BUCKET_MS
  const boundaries = [windowStartMs]
  for (let next = windowStartMs + HOURLY_BUCKET_MS - offset; next < windowEndMs; next += HOURLY_BUCKET_MS) {
    boundaries.push(next)
  }
  boundaries.push(windowEndMs)
  return boundaries
}

export function buildClockHourBoundaries(windowStartMs: number, windowEndMs: number): number[] {
  return buildHourlyBoundaries(windowStartMs, windowEndMs, startOfAppTimeZoneHour(windowStartMs))
}
