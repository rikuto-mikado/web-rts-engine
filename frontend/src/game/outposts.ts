/** Field fortifications that engineers can raise, each suited to a kind of ground. */

export type OutpostKind = 'camp' | 'watchtower' | 'lodge' | 'bridgefort' | 'depot'

export interface OutpostKindDef {
  key: OutpostKind
  name: string
  cost: number
  /** Where it can be built. */
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
  /** Archer fire at enemies in range (0 = none). */
  fireRange: number
  /** Armies inside are always hidden. */
  hides: boolean
}

export const OUTPOST_KINDS: Record<OutpostKind, OutpostKindDef> = {
  camp: {
    key: 'camp',
    name: 'Field Camp',
    cost: 350,
    terrain: 'Anywhere in the open field',
    description: 'A palisaded camp: defenders take far fewer losses and cannot be charged; enemies nearby are slowed.',
    defense: 1.6,
    braces: true,
    zoc: 180,
    zocSlow: 0.55,
    supply: 460,
    fireRange: 0,
    hides: false,
  },
  watchtower: {
    key: 'watchtower',
    name: 'Watchtower',
    cost: 300,
    terrain: 'High ground or hills',
    description: 'A tall tower whose archers shoot at any enemy within 260m. Light defences.',
    defense: 1.2,
    braces: false,
    zoc: 0,
    zocSlow: 1,
    supply: 420,
    fireRange: 260,
    hides: false,
  },
  lodge: {
    key: 'lodge',
    name: 'Forest Lodge',
    cost: 300,
    terrain: 'Inside a forest',
    description: 'Hidden log cabins: armies stationed here are always concealed and spring ambushes on anyone who comes near.',
    defense: 1.3,
    braces: false,
    zoc: 0,
    zocSlow: 1,
    supply: 420,
    fireRange: 0,
    hides: true,
  },
  bridgefort: {
    key: 'bridgefort',
    name: 'Bridge Fort',
    cost: 500,
    terrain: 'Beside a bridge or river crossing',
    description: 'Stone walls over a crossing: the strongest field defence, and enemies trying to cross are badly slowed.',
    defense: 1.85,
    braces: true,
    zoc: 220,
    zocSlow: 0.4,
    supply: 460,
    fireRange: 0,
    hides: false,
  },
  depot: {
    key: 'depot',
    name: 'Supply Depot',
    cost: 250,
    terrain: 'Anywhere in the open field',
    description: 'Wagons and stores: supplies every friendly army within 950m. Barely defended.',
    defense: 1.1,
    braces: false,
    zoc: 0,
    zocSlow: 1,
    supply: 950,
    fireRange: 0,
    hides: false,
  },
}

export const OUTPOST_ORDER: OutpostKind[] = ['camp', 'watchtower', 'lodge', 'bridgefort', 'depot']

/** Engineers needed in an army to build, and how fast they work. */
export const MIN_ENGINEERS = 15
export function buildSeconds(engineers: number) {
  return Math.max(12, 45 - engineers * 0.3)
}
