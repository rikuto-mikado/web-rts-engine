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
