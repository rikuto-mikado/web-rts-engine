import { RotateCw } from 'lucide-react'
import { useViewport } from './viewport'

/**
 * WARBOX is played in landscape. On a phone or tablet held upright, cover the
 * screen with a prompt to turn it (the game keeps running underneath, so
 * nothing is lost). Where the browser allows it, a tap goes fullscreen and
 * locks the screen to landscape.
 */
export function RotateHint() {
  const vp = useViewport()
  if (!vp.touch || vp.w >= vp.h) return null
  const lock = async () => {
    try {
      await document.documentElement.requestFullscreen?.()
      // Not in the standard typings everywhere, and unsupported on iOS: best effort only.
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')
    } catch {
      // The browser refused; turning the device by hand works everywhere.
    }
  }
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#0d0b09]/96 p-8 text-center" onClick={lock}>
      <div className="max-w-xs">
        <RotateCw size={56} className="mx-auto mb-5 animate-[spin_3s_ease-in-out_infinite] text-gold-300" />
        <div className="font-display text-xl font-bold tracking-wider text-gold-200">Turn your device</div>
        <p className="mt-3 text-sm leading-relaxed text-ink-300">WARBOX is played in landscape. Hold your phone or tablet sideways to take the field.</p>
        <p className="mt-4 text-[12px] text-ink-500">Tap to go fullscreen</p>
      </div>
    </div>
  )
}
