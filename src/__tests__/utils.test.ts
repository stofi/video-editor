import { describe, it, expect } from 'vitest'
import { buildAtempo } from '../utils.js'

describe('buildAtempo', () => {
  it('returns a single value for speed 1', () => {
    expect(buildAtempo(1)).toEqual([1])
  })

  it('returns a single value for speed 2 (upper bound)', () => {
    expect(buildAtempo(2)).toEqual([2])
  })

  it('returns a single value for speed 0.5 (lower bound)', () => {
    expect(buildAtempo(0.5)).toEqual([0.5])
  })

  it('chains two 2x filters for speed 4', () => {
    expect(buildAtempo(4)).toEqual([2, 2])
  })

  it('chains three 2x filters for speed 8', () => {
    expect(buildAtempo(8)).toEqual([2, 2, 2])
  })

  it('chains two 0.5x filters for speed 0.25', () => {
    expect(buildAtempo(0.25)).toEqual([0.5, 0.5])
  })

  it('chains two 0.5x filters for speed 0.125', () => {
    // 0.125 → push 0.5, remaining 0.25 → push 0.5, remaining 0.5 → done
    expect(buildAtempo(0.125)).toEqual([0.5, 0.5, 0.5])
  })

  it('handles mid-range speed 1.5', () => {
    expect(buildAtempo(1.5)).toEqual([1.5])
  })

  it('splits speed 3 into [2, 1.5]', () => {
    // 3 > 2 → push 2, remaining 1.5 → done
    expect(buildAtempo(3)).toEqual([2, 1.5])
  })

  it('all values are within [0.5, 2]', () => {
    for (const speed of [0.25, 0.5, 1, 1.5, 2, 3, 4, 8]) {
      const chain = buildAtempo(speed)
      for (const v of chain) {
        expect(v).toBeGreaterThanOrEqual(0.5)
        expect(v).toBeLessThanOrEqual(2)
      }
    }
  })

  it('product of chain values approximates original speed', () => {
    for (const speed of [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]) {
      const chain = buildAtempo(speed)
      const product = chain.reduce((acc, v) => acc * v, 1)
      expect(product).toBeCloseTo(speed, 3)
    }
  })
})
