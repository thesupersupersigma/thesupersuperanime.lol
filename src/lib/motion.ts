/** True when the user wants less motion: their setting on <html data-motion>, else the OS preference. */
export function prefersReducedMotion() {
  const m = document.documentElement.dataset.motion
  if (m === 'reduce') return true
  if (m === 'full') return false
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}
