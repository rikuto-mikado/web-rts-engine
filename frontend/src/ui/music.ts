import { useSyncExternalStore } from 'react'

/**
 * The music of the war: "Crown of Morning", played on a loop while a war is fought (faded in when it
 * begins, out when the player leaves it). The player can turn it off and on from the header; the
 * choice is remembered in this browser.
 */
const SRC = '/audio/crown-of-morning.mp3'
const KEY = 'warbox.music'
const VOLUME = 0.42

let audio: HTMLAudioElement | null = null
let wanted = false
let fade = 0
const listeners = new Set<() => void>()

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}
let enabled = stored()

function notify() {
  for (const l of listeners) l()
}

/** Ease the volume to `to` over `ms`, then (at 0) pause. */
function ramp(to: number, ms: number) {
  if (!audio) return
  window.clearInterval(fade)
  const a = audio
  const from = a.volume
  const t0 = performance.now()
  fade = window.setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms)
    a.volume = from + (to - from) * k * k * (3 - 2 * k)
    if (k >= 1) {
      window.clearInterval(fade)
      if (to === 0) a.pause()
    }
  }, 40)
}

function play() {
  if (!enabled || !wanted) return
  audio ??= Object.assign(new Audio(SRC), { loop: true, preload: 'auto', volume: 0 })
  const a = audio
  a.play().then(
    () => ramp(VOLUME, 2600),
    () => {
      // The browser wants a gesture first: start on the next one.
      const go = () => {
        window.removeEventListener('pointerdown', go)
        window.removeEventListener('keydown', go)
        if (enabled && wanted) a.play().then(() => ramp(VOLUME, 2600), () => {})
      }
      window.addEventListener('pointerdown', go)
      window.addEventListener('keydown', go)
    },
  )
}

/** A war begins: the music fades in (if it is on). */
export function startMusic() {
  wanted = true
  play()
}

/** The war is left: the music fades out. */
export function stopMusic() {
  wanted = false
  ramp(0, 900)
}

/** Turn the music off or on (remembered). */
export function toggleMusic() {
  enabled = !enabled
  try {
    localStorage.setItem(KEY, enabled ? 'on' : 'off')
  } catch {
    // (Private browsing: remembered for this visit only.)
  }
  if (enabled) play()
  else ramp(0, 600)
  notify()
}

/** Whether the music is on, for the header's button. */
export function useMusicOn(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => enabled,
  )
}
