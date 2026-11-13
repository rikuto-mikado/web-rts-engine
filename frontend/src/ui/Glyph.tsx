import { memo } from 'react'
import { glyphPaths, type GlyphName } from '../render/glyphs'

/** One of WARBOX's own engraved glyphs (see render/glyphs.ts). */
export const Glyph = memo(function Glyph({ name, size = 14, className = '', strokeWidth = 1.9 }: { name: GlyphName; size?: number; className?: string; strokeWidth?: number }) {
  // An unknown name (a stale hot reload, an old save) draws nothing rather than taking the screen down.
  const g = glyphPaths(name) ?? {}
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={`inline-block shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {g.s && <path d={g.s} />}
      {g.f && <path d={g.f} fill="currentColor" stroke="none" />}
    </svg>
  )
})
