import { useSyncExternalStore } from 'react'

/**
 * Whether the phone selection panel is folded away to a tab at the screen edge
 * (so both hands can work the map: the stick on the left, the camera on the right).
 */
let collapsed = false
const subs = new Set<() => void>()

export const panelFold = {
  get: () => collapsed,
  set(v: boolean) {
    if (v === collapsed) return
    collapsed = v
    subs.forEach((f) => f())
  },
  subscribe(f: () => void) {
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  },
}

export function usePanelFolded(): boolean {
  return useSyncExternalStore(panelFold.subscribe, panelFold.get)
}
