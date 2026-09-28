import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from '../api/errors'

export type ResourceLoader<T> = (signal: AbortSignal) => Promise<T>

type SettledState<T> = { status: 'success'; data: T } | { status: 'error'; error: string }

export type AsyncResourceState<T> = { status: 'idle' } | { status: 'loading' } | SettledState<T>

export interface AsyncResource<T> {
  state: AsyncResourceState<T>
  settledAtMs: number | null
  retry: () => void
}

interface SettledResult<T> {
  load: ResourceLoader<T>
  attempt: number
  state: SettledState<T>
  settledAtMs: number
}

const IDLE = { status: 'idle' } as const
const LOADING = { status: 'loading' } as const

export function useAsyncResource<T>(load: ResourceLoader<T> | null): AsyncResource<T> {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<SettledResult<T> | null>(null)

  useEffect(() => {
    if (!load) return
    const controller = new AbortController()
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setSettled({ load, attempt, state: { status: 'success', data }, settledAtMs: Date.now() })
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setSettled({
            load,
            attempt,
            state: { status: 'error', error: getErrorMessage(error) },
            settledAtMs: Date.now(),
          })
        }
      },
    )
    return () => controller.abort()
  }, [load, attempt])

  const retry = useCallback(() => setAttempt((current) => current + 1), [])

  const current = load && settled && settled.load === load && settled.attempt === attempt ? settled : null
  const state: AsyncResourceState<T> = !load ? IDLE : current ? current.state : LOADING

  return { state, settledAtMs: current?.settledAtMs ?? null, retry }
}
