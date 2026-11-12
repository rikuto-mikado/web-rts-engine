import { isTouchDevice } from './viewport'

/** Camera view preference, remembered per browser. Defaults to overhead on touch screens. */
const KEY = 'warbox.view'

export function loadOverhead(): boolean {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'overhead') return true
    if (v === 'tilted') return false
  } catch {
    /* storage unavailable */
  }
  return isTouchDevice()
}

export function saveOverhead(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'overhead' : 'tilted')
  } catch {
    /* storage unavailable */
  }
}

/** Night mode (a darker screen for playing late), remembered per browser. */
const NIGHT_KEY = 'warbox.night'
export function loadNight(): boolean {
  try {
    return localStorage.getItem(NIGHT_KEY) === '1'
  } catch {
    return false
  }
}
export function saveNight(on: boolean) {
  try {
    localStorage.setItem(NIGHT_KEY, on ? '1' : '0')
  } catch {
    /* storage unavailable */
  }
}
