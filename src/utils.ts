/**
 * Build an atempo filter chain for FFmpeg.
 * Each atempo value must be in [0.5, 2], so speeds outside that range
 * require chaining multiple filters.
 */
export function buildAtempo(speed: number): number[] {
  const result: number[] = []
  let remaining = speed
  while (remaining > 2) { result.push(2); remaining /= 2 }
  while (remaining < 0.5) { result.push(0.5); remaining /= 0.5 }
  result.push(parseFloat(remaining.toFixed(4)))
  return result
}
