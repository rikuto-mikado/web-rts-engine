/**
 * Field fortifications engineers raise where the army stands. None needs any
 * particular ground any more (only not in water, on a bridge or a cliff): each
 * has its own use instead.
 */

export type OutpostKind = 'castrum' | 'laager' | 'redoubt' | 'pavilion' | 'depot'

export interface OutpostKindDef {
  key: OutpostKind
  name: string
  cost: number
  /** What it is for, in a few words (shown under the name). */
  terrain: string
  description: string
  /** Defenders' casualty divisor. */
  defense: number
  /** Breaks enemy charges against defenders. */
  braces: boolean
  /** Slow hostile armies within this radius (0 = none). */
  zoc: number
  zocSlow: number
  /** Supply radius. */
  supply: number
  /** Bombardment range while troops man it (0 = none). */
  bombard: number
  /** Armies inside are always hidden. */
  hides: boolean
  /** Build time multiplier. */
  buildFactor: number
  /** Archers fighting from inside shoot this much harder. */
  archers: number
  /** Share of the cost returned when it is struck (0 = cannot be packed up). */
  refund: number
  /** Troops riding out of it get a burst of speed and a hard first blow. */
  sortie: boolean
}

export const OUTPOST_KINDS: Record<OutpostKind, OutpostKindDef> = {
  castrum: {
    key: 'castrum',
    name: 'Palisade Castrum',
    cost: 350,
    terrain: 'The strongest field fort',
    description: 'A log stockade with corner towers. Defenders take far fewer losses and cannot be charged; enemies within 200m are slowed to 0.45x. The shield to hold a crossing, a pass or the ground before an enemy castle.',
    defense: 1.75,
    braces: true,
    zoc: 200,
    zocSlow: 0.45,
    supply: 460,
    bombard: 0,
    hides: false,
    buildFactor: 1,
    archers: 1,
    refund: 0,
    sortie: false,
  },
  laager: {
    key: 'laager',
    name: 'Wagon Laager',
    cost: 280,
    terrain: 'Fast to raise, packs up again',
    description: 'War wagons chained in a ring. Built in half the time; no charge gets through; archers inside shoot 1.45x harder. Strike it to get 70% of the cost back and march on.',
    defense: 1.4,
    braces: true,
    zoc: 0,
    zocSlow: 1,
    supply: 420,
    bombard: 0,
    hides: false,
    buildFactor: 0.5,
    archers: 1.45,
    refund: 0.7,
    sortie: false,
  },
  redoubt: {
    key: 'redoubt',
    name: 'Mangonel Redoubt',
    cost: 420,
    terrain: 'Heavy engines, manned',
    description: 'Earthworks with a ballista and a mangonel. While troops of yours man it, it bombards enemy armies and walls within 380m (farther from high ground), wearing them down and slowing them. Empty, it falls silent.',
    defense: 1.3,
    braces: false,
    zoc: 0,
    zocSlow: 1,
    supply: 420,
    bombard: 380,
    hides: false,
    buildFactor: 1.1,
    archers: 1,
    refund: 0,
    sortie: false,
  },
  pavilion: {
    key: 'pavilion',
    name: 'Outrider Pavilion',
    cost: 300,
    terrain: 'Hidden camp, anywhere',
    description: 'Camouflaged tents and muffled stables. Troops inside are hidden from the enemy wherever it stands; riding out, they get 20 seconds of 1.25x speed and a 1.6x first blow.',
    defense: 1.3,
    braces: false,
    zoc: 0,
    zocSlow: 1,
    supply: 420,
    bombard: 0,
    hides: true,
    buildFactor: 0.9,
    archers: 1,
    refund: 0,
    sortie: true,
  },
  depot: {
    key: 'depot',
    name: 'Supply Depot',
    cost: 250,
    terrain: 'Supply and quarters',
    description: 'Wagons and stores: supplies every friendly army within 950m, quarters up to 900 troops and can muster armies of its own. Barely defended.',
    defense: 1.1,
    braces: false,
    zoc: 0,
    zocSlow: 1,
    supply: 950,
    bombard: 0,
    hides: false,
    buildFactor: 1,
    archers: 1,
    refund: 0,
    sortie: false,
  },
}

export const OUTPOST_ORDER: OutpostKind[] = ['castrum', 'laager', 'redoubt', 'pavilion', 'depot']

/** Engineers needed in an army to build, and how fast they work. */
export const MIN_ENGINEERS = 15
export function buildSeconds(engineers: number, kind?: OutpostKind) {
  const f = kind ? OUTPOST_KINDS[kind].buildFactor : 1
  return Math.max(12 * f, (45 - engineers * 0.3) * f)
}
