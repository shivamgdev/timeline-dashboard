import { describe, expect, it } from 'vitest'
import { MIN_ZOOM_SPAN_MS } from './timelineOption'
import { clampZoomRange, readBrushRange } from './zoomRange'

const start = Date.parse('2026-06-23T01:30:00Z')
const end = Date.parse('2026-06-23T13:30:00Z')

describe('readBrushRange', () => {
  it('reads an ordered range from an ECharts brushEnd event', () => {
    expect(readBrushRange({ areas: [{ coordRange: [start + 5000, start + 1000] }] })).toEqual([
      start + 1000,
      start + 5000,
    ])
  })

  it('ignores events without a usable range', () => {
    expect(readBrushRange({ areas: [] })).toBeNull()
    expect(readBrushRange({ areas: [{ coordRange: ['a', 'b'] }] })).toBeNull()
    expect(readBrushRange(null)).toBeNull()
  })
})

describe('clampZoomRange', () => {
  it('keeps a range that is inside the window and at least 60 s long', () => {
    expect(clampZoomRange([start + 3_600_000, start + 7_200_000], start, end)).toEqual([
      start + 3_600_000,
      start + 7_200_000,
    ])
  })

  it('expands a range shorter than 60 s around its centre', () => {
    const [from, to] = clampZoomRange([start + 100_000, start + 110_000], start, end)
    expect(to - from).toBe(MIN_ZOOM_SPAN_MS)
    expect((from + to) / 2).toBe(start + 105_000)
  })

  it('keeps an expanded range inside the window at either edge', () => {
    expect(clampZoomRange([start, start + 5_000], start, end)).toEqual([start, start + MIN_ZOOM_SPAN_MS])
    expect(clampZoomRange([end - 5_000, end], start, end)).toEqual([end - MIN_ZOOM_SPAN_MS, end])
  })

  it('clamps a range that extends beyond the shift window', () => {
    expect(clampZoomRange([start - 60_000_000, end + 60_000_000], start, end)).toEqual([start, end])
  })
})
