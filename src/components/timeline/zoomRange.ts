import { MIN_ZOOM_SPAN_MS } from './timelineOption'

export function readBrushRange(event: unknown): [number, number] | null {
  if (typeof event !== 'object' || event === null || !('areas' in event) || !Array.isArray(event.areas)) return null
  const area: unknown = event.areas[0]
  if (typeof area !== 'object' || area === null || !('coordRange' in area) || !Array.isArray(area.coordRange)) {
    return null
  }
  const [from, to] = area.coordRange
  return typeof from === 'number' && typeof to === 'number' ? [Math.min(from, to), Math.max(from, to)] : null
}

export function clampZoomRange(
  [from, to]: [number, number],
  windowStartMs: number,
  windowEndMs: number,
): [number, number] {
  const start = Math.max(windowStartMs, from)
  const end = Math.min(windowEndMs, to)
  if (end - start >= MIN_ZOOM_SPAN_MS) return [start, end]
  const center = (start + end) / 2
  const clampedStart = Math.max(windowStartMs, Math.min(center - MIN_ZOOM_SPAN_MS / 2, windowEndMs - MIN_ZOOM_SPAN_MS))
  return [clampedStart, Math.min(windowEndMs, clampedStart + MIN_ZOOM_SPAN_MS)]
}
