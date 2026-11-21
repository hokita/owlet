export const RESISTANCE = 0.5
export const MAX_PULL = 120
export const THRESHOLD = 70

export function pullDistance(dy: number): number {
  return Math.min(Math.max(dy, 0) * RESISTANCE, MAX_PULL)
}

export function isArmed(distance: number): boolean {
  return distance >= THRESHOLD
}
