import { describe, expect, it } from 'vitest'
import type { ApiEnvelope } from '../../../api/types'
import machineIntervalsFixture from '../api/__fixtures__/sample-machine-intervals.json'
import type { MachineIntervalsResponse } from '../api/analytics.types'
import { normalizeMachineIntervals } from './machineIntervals'

const fixture: ApiEnvelope<MachineIntervalsResponse> = machineIntervalsFixture

describe('normalizeMachineIntervals', () => {
  it('keeps every field of the sample payload and the original array instances', () => {
    const normalized = normalizeMachineIntervals(fixture.data)
    expect(normalized).toEqual({ ...fixture.data, metrics: null })
    expect(normalized.runtimes).toBe(fixture.data.runtimes)
    expect(normalized.produces).toBe(fixture.data.produces)
  })

  it('turns the null collections returned for an asset without data into empty arrays', () => {
    const normalized = normalizeMachineIntervals({
      machine_ids: [],
      runtimes: [],
      stoppages: [],
      downtimes: [],
      produce_counts: null,
      produces: null,
      metrics: null,
    })
    expect(normalized.produce_counts).toEqual([])
    expect(normalized.produces).toBeNull()
    expect([normalized.runtimes, normalized.downtimes, normalized.stoppages, normalized.produce_counts]).toEqual([
      [],
      [],
      [],
      [],
    ])
  })

  it('distinguishes produces not requested (null) from requested', () => {
    const withoutProduces: MachineIntervalsResponse = { ...fixture.data }
    delete withoutProduces.produces
    expect(normalizeMachineIntervals(withoutProduces).produces).toBeNull()
  })
})

describe('normalizeMachineIntervals — values outside the documented array shape', () => {
  it('turns non-array collections into empty arrays instead of failing', () => {
    const malformed: MachineIntervalsResponse = JSON.parse(
      '{"machine_ids":null,"runtimes":{},"downtimes":"none","stoppages":{"start_at":"x"},"produce_counts":5,"produces":{}}',
    )
    expect(normalizeMachineIntervals(malformed)).toEqual({
      machine_ids: [],
      runtimes: [],
      downtimes: [],
      stoppages: [],
      produce_counts: [],
      produces: null,
      metrics: null,
    })
  })
})
