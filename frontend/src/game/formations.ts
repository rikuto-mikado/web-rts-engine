import type { FormationKey, Troops, UnitType } from './types'

export interface FormationDef {
  key: FormationKey
  name: string
  short: string
  description: string
  /** Melee damage dealt. */
  attack: number
  /** Ranged damage dealt by own archers. */
  rangedAttack: number
  /** Multiplier on casualties taken (lower is better). */
  taken: number
  /** Extra multiplier on casualties from enemy arrows. */
  rangedTaken: number
  /** Extra multiplier on casualties from enemy cavalry. */
  cavalryTaken: number
  /** Multiplier on the charge bonus in the opening clash. */
  charge: number
  /** True if enemy charges against this formation are blunted. */
  bracesCharge: boolean
  speed: number
}

export const FORMATIONS: Record<FormationKey, FormationDef> = {
  line: {
    key: 'line',
    name: 'Battle Line',
    short: 'Line',
    description: 'A broad, balanced line. No strengths, no weaknesses.',
    attack: 1,
    rangedAttack: 1,
    taken: 1,
    rangedTaken: 1,
    cavalryTaken: 1,
    charge: 1,
    bracesCharge: false,
    speed: 1,
  },
  wedge: {
    key: 'wedge',
    name: 'Wedge',
    short: 'Wedge',
    description: 'A spearhead built to break lines: much stronger charge and +12% melee, but 15% more casualties.',
    attack: 1.12,
    rangedAttack: 0.9,
    taken: 1.15,
    rangedTaken: 1.1,
    cavalryTaken: 1,
    charge: 1.7,
    bracesCharge: false,
    speed: 1,
  },
  square: {
    key: 'square',
    name: 'Schiltron',
    short: 'Square',
    description: 'A ring of braced spears: enemy charges fail and cavalry deal 45% less. Slow, and a fat target for archers.',
    attack: 0.88,
    rangedAttack: 0.9,
    taken: 0.9,
    rangedTaken: 1.25,
    cavalryTaken: 0.55,
    charge: 0.5,
    bracesCharge: true,
    speed: 0.75,
  },
  loose: {
    key: 'loose',
    name: 'Skirmish Order',
    short: 'Loose',
    description: 'Spread out: enemy arrows do 45% less and your archers shoot 20% better, but weaker in melee and vs cavalry.',
    attack: 0.88,
    rangedAttack: 1.2,
    taken: 1,
    rangedTaken: 0.55,
    cavalryTaken: 1.3,
    charge: 0.8,
    bracesCharge: false,
    speed: 1.1,
  },
}

export const FORMATION_ORDER: FormationKey[] = ['line', 'wedge', 'square', 'loose']

/** Bonuses while marching in column, and the penalty if attacked before re-forming. */
export const COLUMN = { speed: 1.3, reformSeconds: 7, taken: 1.45, attack: 0.7 }

/** Sensible default for an army's composition (used by the AI). */
export function suggestFormation(t: Troops, units: Map<string, UnitType>): FormationKey {
  let n = 0
  const cat: Record<string, number> = {}
  for (const k in t) {
    const u = units.get(k)
    if (!u || t[k] <= 0) continue
    n += t[k]
    cat[u.category] = (cat[u.category] ?? 0) + t[k]
    if (k === 'infantry') cat.spear = (cat.spear ?? 0) + t[k]
  }
  if (n === 0) return 'line'
  if ((cat.cavalry ?? 0) / n > 0.45) return 'wedge'
  if ((cat.ranged ?? 0) / n > 0.4) return 'loose'
  if ((cat.spear ?? 0) / n > 0.72) return 'square'
  return 'line'
}
