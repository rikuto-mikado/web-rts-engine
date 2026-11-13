import type { FormationKey, Troops } from './types'

/**
 * Each commander musters a host of their own kind: the mix of troops (without engineers) and
 * the formation it takes the field in. Engineers are a separate choice (on or off) because an
 * army either needs them (outposts, siege engines, mines, field works) or does not.
 */
export interface Doctrine {
  name: string
  blurb: string
  /** Shares of the fighting troops (they need not add to 100). */
  mix: { infantry?: number; cavalry?: number; archers?: number }
  formation: FormationKey
  /** Engineers on by default (a siege commander brings them as a matter of course). */
  engineers: boolean
  /** Share of the army that is engineers when they are on. */
  engineerShare: number
}

/** Captains (no commander) and anything not listed: a combined-arms host. */
export const CAPTAIN_DOCTRINE: Doctrine = {
  name: 'Combined arms',
  blurb: 'Spears, horse and bows in balance: ready for anything, best at nothing.',
  mix: { infantry: 52, cavalry: 21, archers: 27 },
  formation: 'line',
  engineers: false,
  engineerShare: 0.12,
}

export const DOCTRINES: Record<string, Doctrine> = {
  godfrey: { name: 'Siege train', blurb: 'Heavy foot and bows round a corps of engineers: breaks walls and fortifies the ground it takes.', mix: { infantry: 73, archers: 27 }, formation: 'line', engineers: true, engineerShare: 0.25 },
  elowen: { name: 'Raiding horse', blurb: 'Fast riders with mounted bows: hunts archers, siege crews and wagons, and outruns what it cannot beat.', mix: { cavalry: 70, archers: 30 }, formation: 'wedge', engineers: false, engineerShare: 0.1 },
  varian: { name: 'Pike wall', blurb: 'A wall of spears with bows behind it: cavalry break on it, but it is slow to go anywhere.', mix: { infantry: 70, archers: 30 }, formation: 'square', engineers: false, engineerShare: 0.12 },
  isolde: { name: 'Archer host', blurb: 'Massed bows behind a screen of spears: bleeds infantry from afar; keep horse off it.', mix: { infantry: 45, archers: 55 }, formation: 'loose', engineers: false, engineerShare: 0.12 },
  bran: { name: 'Knightly charge', blurb: 'Knights and a few spears to hold what they win: a crushing charge, little staying power.', mix: { infantry: 20, cavalry: 80 }, formation: 'wedge', engineers: false, engineerShare: 0.1 },
}

export function doctrineOf(commanderKey: string | null | undefined): Doctrine {
  return (commanderKey && DOCTRINES[commanderKey]) || CAPTAIN_DOCTRINE
}

/** The whole mix (shares adding to 1), engineers included or not. */
export function doctrineMix(d: Doctrine, engineers: boolean): Record<string, number> {
  const sum = Object.values(d.mix).reduce((a, b) => a + (b ?? 0), 0) || 1
  const fight = engineers ? 1 - d.engineerShare : 1
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(d.mix)) out[k] = ((v ?? 0) / sum) * fight
  if (engineers) out.engineers = d.engineerShare
  return out
}

/** Engineers enough for the work they are wanted for: at least this many whenever they are on. */
export const MIN_ENGINEER_PARTY = 20

/** How many of each troop an army of `size` wants under this doctrine. */
export function doctrineWants(d: Doctrine, engineers: boolean, size: number): Troops {
  const mix = doctrineMix(d, engineers)
  const out: Troops = {}
  let eng = engineers ? Math.min(size, Math.max(MIN_ENGINEER_PARTY, Math.round(size * (mix.engineers ?? 0)))) : 0
  const rest = size - eng
  const fight = Object.entries(mix).filter(([k]) => k !== 'engineers')
  const fsum = fight.reduce((a, [, v]) => a + v, 0) || 1
  let given = 0
  fight.forEach(([k, v], i) => {
    const n = i === fight.length - 1 ? rest - given : Math.round((rest * v) / fsum)
    out[k] = Math.max(0, n)
    given += out[k]
  })
  if (eng > 0) out.engineers = eng
  else eng = 0
  return out
}
