import { memo } from 'react'
import { shieldSvg, type ShieldCharge, type ShieldRank } from '../render/heraldry'

/** A castle's shield (see render/heraldry.ts) for the UI. */
export const Shield = memo(function Shield({ rank, color, size = 18, charge = 'fleur', className = '' }: { rank: ShieldRank; color: string; size?: number; charge?: ShieldCharge; className?: string }) {
  // The markup is built from our own constants and a faction colour, never from user input.
  return <span className={`inline-block shrink-0 leading-none ${className}`} dangerouslySetInnerHTML={{ __html: shieldSvg(rank, color, size, charge, 'block') }} />
})
