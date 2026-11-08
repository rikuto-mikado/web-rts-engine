/** Commander traits, chosen one at a time when a commander gains a rank. */

export interface TraitDef {
  key: string
  name: string
  description: string
  /** Per-unit damage multipliers. */
  units?: Record<string, number>
  /** All-unit damage multiplier. */
  attack?: number
  /** Multiplier on casualties taken (lower is better). */
  taken?: number
  speed?: number
  siege?: number
  morale?: number
  /** Multiplier on the first seconds of a battle (charges, ambushes). */
  opening?: number
  supply?: number
  ambush?: number
  pursuit?: number
}

export const TRAITS: TraitDef[] = [
  { key: 'night_raider', name: 'Night Raider', description: '+30% damage in the opening clash of every battle.', opening: 1.3 },
  { key: 'siege_breaker', name: 'Siege Breaker', description: '+35% siege power against walls.', siege: 1.35 },
  { key: 'ironclad', name: 'Ironclad', description: '-12% casualties taken.', taken: 0.88 },
  { key: 'swift', name: 'Swift Marcher', description: '+12% march speed.', speed: 1.12 },
  { key: 'quartermaster', name: 'Quartermaster', description: 'Supply range +60%; out-of-supply losses halved.', supply: 1.6 },
  { key: 'inspiring', name: 'Inspiring', description: '+15 maximum morale and steadier under losses.', morale: 15 },
  { key: 'lancer', name: 'Lancer', description: '+18% Cavalry.', units: { cavalry: 1.18 } },
  { key: 'pikemaster', name: 'Pikemaster', description: '+18% Infantry.', units: { infantry: 1.18 } },
  { key: 'bowmaster', name: 'Bowmaster', description: '+20% Archers.', units: { archers: 1.2 } },
  { key: 'master_builder', name: 'Master Builder', description: 'Engineers build outposts twice as fast and batter walls 20% harder.', siege: 1.2 },
  { key: 'woodsman', name: 'Woodsman', description: 'Ambushes from the forest strike 50% harder.', ambush: 1.5 },
  { key: 'butcher', name: 'Butcher', description: 'Routing enemies suffer 60% more losses.', pursuit: 1.6 },
  { key: 'veteran', name: 'Battle-Hardened', description: '+8% damage with every unit.', attack: 1.08 },
]

export const TRAIT_MAP = new Map(TRAITS.map((t) => [t.key, t]))

export interface TraitMods {
  units: Record<string, number>
  attack: number
  taken: number
  speed: number
  siege: number
  morale: number
  opening: number
  supply: number
  ambush: number
  pursuit: number
}

export function combineTraits(keys: string[] | undefined): TraitMods {
  const m: TraitMods = { units: {}, attack: 1, taken: 1, speed: 1, siege: 1, morale: 0, opening: 1, supply: 1, ambush: 1, pursuit: 1 }
  for (const k of keys ?? []) {
    const t = TRAIT_MAP.get(k)
    if (!t) continue
    for (const [u, v] of Object.entries(t.units ?? {})) m.units[u] = (m.units[u] ?? 1) * v
    m.attack *= t.attack ?? 1
    m.taken *= t.taken ?? 1
    m.speed *= t.speed ?? 1
    m.siege *= t.siege ?? 1
    m.morale += t.morale ?? 0
    m.opening *= t.opening ?? 1
    m.supply *= t.supply ?? 1
    m.ambush *= t.ambush ?? 1
    m.pursuit *= t.pursuit ?? 1
  }
  return m
}
