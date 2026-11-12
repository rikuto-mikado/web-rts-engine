import { useSyncExternalStore } from 'react'

export interface Viewport {
  w: number
  h: number
  /** Phones and small tablets: drawers and bottom sheets instead of side panels. */
  compact: boolean
  /** Phones (played in landscape: a short screen). */
  phone: boolean
  /** Primary input is a finger. */
  touch: boolean
}

let cached: Viewport | null = null
function read(): Viewport {
  const w = window.innerWidth
  const h = window.innerHeight
  const touch = window.matchMedia('(pointer: coarse)').matches
  if (cached && cached.w === w && cached.h === h && cached.touch === touch) return cached
  cached = { w, h, touch, compact: w < 900 || h < 560, phone: w < 560 || h < 480 }
  return cached
}
function subscribe(fn: () => void) {
  window.addEventListener('resize', fn)
  window.addEventListener('orientationchange', fn)
  return () => {
    window.removeEventListener('resize', fn)
    window.removeEventListener('orientationchange', fn)
  }
}

export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, read)
}

export function isTouchDevice() {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

/** Width of the selection panel on phones and small tablets (played in landscape). */
export function compactPanelWidth(screenW: number) {
  return Math.round(Math.min(400, Math.max(300, screenW * 0.44)))
}
