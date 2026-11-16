import { describe, expect, it } from 'vitest'
import { isArmed, pullDistance } from './pullToRefresh'

describe('pullDistance', () => {
  it('follows the finger at half speed', () => {
    expect(pullDistance(100)).toBe(50)
  })

  it('is capped', () => {
    expect(pullDistance(1000)).toBe(120)
  })

  it('is zero for an upward drag', () => {
    expect(pullDistance(-40)).toBe(0)
  })
})

describe('isArmed', () => {
  it('is true at and past the threshold', () => {
    expect(isArmed(69)).toBe(false)
    expect(isArmed(70)).toBe(true)
  })
})
