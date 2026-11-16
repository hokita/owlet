// How far the indicator moves per pixel of finger travel.
export const RESISTANCE = 0.5
// The indicator never moves further than this (px).
export const MAX_PULL = 120
// Releasing at or past this distance (px) starts a refresh.
export const THRESHOLD = 70

export function pullDistance(dy: number): number {
  return Math.min(Math.max(dy, 0) * RESISTANCE, MAX_PULL)
}

export function isArmed(distance: number): boolean {
  return distance >= THRESHOLD
}
