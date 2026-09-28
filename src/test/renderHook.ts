import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

export function renderHook<Props, Result>(hook: (props: Props) => Result, initialProps: Props) {
  let current: { value: Result } | null = null
  const probe = ({ hookProps }: { hookProps: Props }) => {
    current = { value: hook(hookProps) }
    return null
  }
  const root = createRoot(document.createElement('div'))
  const render = (props: Props) => act(() => root.render(createElement(probe, { hookProps: props })))

  render(initialProps)

  return {
    get result(): Result {
      if (!current) throw new Error('Hook has not rendered')
      return current.value
    },
    rerender: render,
    unmount: () => act(() => root.unmount()),
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}
