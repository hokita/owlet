import { act } from '@testing-library/react'

let installed: FakeResizeObserver[] | null = null
let formHeight = 0

class FakeResizeObserver {
  readonly targets = new Set<Element>()
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    installed?.push(this)
  }

  observe(target: Element) {
    this.targets.add(target)
  }

  unobserve(target: Element) {
    this.targets.delete(target)
  }

  disconnect() {
    this.targets.clear()
  }

  fire() {
    if (this.targets.size === 0) return
    const entries = [...this.targets].map((target) => ({ target }) as ResizeObserverEntry)
    this.callback(entries, this as unknown as ResizeObserver)
  }
}

export function installFakeResizeObserver() {
  installed = []
  formHeight = 0
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
  Object.defineProperty(HTMLFormElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => formHeight,
  })
}

export function uninstallFakeResizeObserver() {
  if (!installed) return
  installed = null
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  delete (HTMLFormElement.prototype as { offsetHeight?: unknown }).offsetHeight
}

export function setFormHeight(height: number) {
  formHeight = height
}

export function observedElements(): Element[] {
  return (installed ?? []).flatMap((o) => [...o.targets])
}

export function triggerResize() {
  act(() => (installed ?? []).forEach((o) => o.fire()))
}
