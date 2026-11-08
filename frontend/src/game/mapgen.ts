import { BIOMES, type MapType } from './biomes'
import { PLAYER } from './engine'
import { mulberry32 } from './noise'
import type { CastleDef, FactionDef, GameMode, GameRules, MapSize, Scenario, ScenarioDefinition, Team, Troops } from './types'
import { World, distToSegment } from './world'

/**
 * Procedural maps for Alliance War and Survival. Everything derives from the
 * seed, so the same seed always produces the same world.
 */

const REALMS = [
  'Valoria', 'Thornmere', 'Brightwater', 'Ostmark', 'Kaldheim', 'Ravensholt', 'Duskvale', 'Highmoor', 'Ironwold', 'Greywatch',
  'Ambergate', 'Stormhold', 'Westmarch', 'Eldermoor', 'Sablecrest', 'Wyrmfell', 'Goldhaven', 'Marrowind', 'Coldspire', 'Redfen',
  'Larkspur', 'Northwind', 'Hollowmere', 'Silverholm', 'Blackfen', 'Ashford', 'Kingsreach', 'Mistvale', 'Oakheart', 'Frostgard',
  'Emberfall', 'Wolfsbane', 'Seahaven', 'Dunmere', 'Caer Lys', 'Varnhall', 'Morwen', 'Tirath', 'Galdor', 'Brennoch',
]
const TITLES = ['Kingdom of', 'Duchy of', 'County of', 'March of', 'Principality of', 'Barony of', 'Earldom of']
const PREFIX = [
  'Ash', 'Black', 'Bright', 'Cold', 'Dun', 'Elder', 'Fair', 'Frost', 'Gold', 'Grey', 'High', 'Iron', 'Kings', 'Long', 'Mist', 'North',
  'Oak', 'Raven', 'Red', 'Rose', 'Silver', 'Stone', 'Storm', 'Thorn', 'West', 'Wolf', 'Wyrm', 'Amber', 'Dragon', 'Hawk', 'Lion',
  'Moon', 'Star', 'Sun', 'Winter', 'Ember', 'Glen', 'Hollow', 'Marsh', 'Pine', 'Crow', 'Elk', 'Bear', 'Swan',
]
const SUFFIX = [
  'hold', 'keep', 'gate', 'ford', 'watch', 'fell', 'moor', 'haven', 'spire', 'crest', 'wall', 'burg', 'mere', 'vale', 'reach',
  'stead', 'wick', 'dale', 'rock', 'tower', 'barrow', 'helm', 'garde', 'bridge',
]
const SUBTITLE = ['Watchtower', 'Keep', 'Fortress', 'Citadel']

export interface GeneratedMap {
  scenario: Scenario
  rules: GameRules
  /** The terrain built while validating the map; reuse it instead of rebuilding. */
  world: World
}

export interface MapOptions {
  factions?: number // total factions in Alliance War, including the player
  mapType?: MapType
  size?: MapSize
}

/** Map-size presets. Medium is the original size; the others are rebalanced around it. */
export const SIZE_PRESETS: Record<MapSize, { conquest: { map: number; castles: number; vassals: number; playerCastles: number; enemyLine: number }; alliance: { map: number; realms: number } }> = {
  small: { conquest: { map: 2100, castles: 10, vassals: 1, playerCastles: 2, enemyLine: 0.52 }, alliance: { map: 3200, realms: 16 } },
  medium: { conquest: { map: 2800, castles: 15, vassals: 2, playerCastles: 2, enemyLine: 0.52 }, alliance: { map: 4000, realms: 24 } },
  large: { conquest: { map: 3700, castles: 24, vassals: 2, playerCastles: 3, enemyLine: 0.6 }, alliance: { map: 4800, realms: 32 } },
}

export function generateMap(mode: Exclude<GameMode, 'campaign'>, seed: number, opts: MapOptions = {}): GeneratedMap {
  // Retry a few seeds if the layout ends up disconnected.
  for (let attempt = 0; attempt < 12; attempt++) {
    const out = tryGenerate(mode, seed + attempt * 7919, opts)
    if (out) return out
  }
  throw new Error('Could not generate a playable map. Try another seed.')
}

function tryGenerate(mode: Exclude<GameMode, 'campaign'>, seed: number, opts: MapOptions): GeneratedMap | null {
  const rnd = mulberry32(seed)
  const R = (a: number, b: number) => a + rnd() * (b - a)
  const alliance = mode === 'alliance'
  const preset = SIZE_PRESETS[opts.size ?? 'medium']
  const factionCount = Math.max(6, Math.min(32, opts.factions ?? preset.alliance.realms))
  const size = alliance ? preset.alliance.map : preset.conquest.map
  const half = size / 2
  // Terrain features scale with map area relative to the medium preset.
  const areaScale = (size * size) / ((alliance ? 4000 : 2800) ** 2)
  const mapType: MapType = opts.mapType ?? 'vales'
  const gen = BIOMES[mapType].gen

  // --- Terrain features -----------------------------------------------------
  const mountains: ScenarioDefinition['mountains'] = []
  for (let i = 0; i < Math.round((alliance ? gen.mountains[1] : gen.mountains[0]) * areaScale); i++) {
    mountains.push({ x: R(-half + 150, half - 150), z: R(-half + 150, half - 150), r: R(gen.mountainSize[0], gen.mountainSize[1]), h: R(gen.mountainHeight[0], gen.mountainHeight[1]) })
  }
  const rivers: ScenarioDefinition['rivers'] = []
  const nRivers = Math.round(R(gen.rivers[0], gen.rivers[1] + 0.99) - 0.49) + (alliance && gen.rivers[1] > 1 ? 1 : 0)
  for (let i = 0; i < nRivers; i++) {
    const horizontal = rnd() < 0.5
    const a = R(-half * 0.6, half * 0.6)
    const b = R(-half * 0.6, half * 0.6)
    const pts: [number, number][] = []
    const steps = 12
    let drift = 0
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      const main = -half - 100 + t * (size + 200)
      drift += R(-1, 1) * size * 0.04
      drift *= 0.85
      const cross = a + (b - a) * t + drift + Math.sin(t * Math.PI * R(1, 3)) * size * 0.05
      pts.push(horizontal ? [main, cross] : [cross, main])
    }
    rivers.push({ width: R(40, 54), points: pts })
  }
  const lakes: ScenarioDefinition['lakes'] = []
  const nLakes = Math.round((alliance ? gen.lakes[1] : gen.lakes[0]) * areaScale)
  for (let i = 0; i < nLakes; i++) lakes.push({ x: R(-half + 300, half - 300), z: R(-half + 300, half - 300), r: R(gen.lakeSize[0], gen.lakeSize[1]) })

  const riverDist = (x: number, z: number) => {
    let best = Infinity
    for (const r of rivers) {
      for (let k = 0; k < r.points.length - 1; k++) {
        best = Math.min(best, distToSegment(x, z, r.points[k][0], r.points[k][1], r.points[k + 1][0], r.points[k + 1][1]) - r.width / 2)
      }
    }
    return best
  }

  // --- Castle sites (Poisson-like rejection sampling) -----------------------
  const targetCastles = alliance ? Math.round(factionCount * 1.65 + 4) : preset.conquest.castles
  const dmin = alliance ? (size * 0.62) / Math.sqrt(targetCastles) : Math.min(400, (size * 0.6) / Math.sqrt(targetCastles))
  const sites: { x: number; z: number }[] = []
  const margin = 240
  for (let tries = 0; tries < 20000 && sites.length < targetCastles; tries++) {
    const x = R(-half + margin, half - margin)
    const z = R(-half + margin, half - margin)
    if (mountains.some((m) => Math.hypot(x - m.x, z - m.z) < m.r * 1.1)) continue
    if (lakes.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + 130)) continue
    if (riverDist(x, z) < 120) continue
    if (sites.some((s) => Math.hypot(x - s.x, z - s.z) < dmin)) continue
    sites.push({ x, z })
  }
  if (sites.length < (alliance ? factionCount + 2 : Math.max(8, targetCastles - 3))) return null

  // Bridges every ~450 units along each river.
  const bridges: { x: number; z: number }[] = []
  for (const r of rivers) {
    let acc = R(150, 300)
    for (let k = 0; k < r.points.length - 1; k++) {
      const [ax, az] = r.points[k]
      const [bx, bz] = r.points[k + 1]
      const len = Math.hypot(bx - ax, bz - az)
      let t = acc
      while (t < len) {
        const x = ax + ((bx - ax) * t) / len
        const z = az + ((bz - az) * t) / len
        const inside = Math.abs(x) < half - 200 && Math.abs(z) < half - 200
        const clear = !mountains.some((m) => Math.hypot(x - m.x, z - m.z) < m.r * 1.2) && !bridges.some((b) => Math.hypot(b.x - x, b.z - z) < 250)
        if (inside && clear) bridges.push({ x, z })
        t += R(380, 520)
      }
      acc = t - len
    }
  }

  // --- Political map --------------------------------------------------------
  const castles: CastleDef[] = []
  const names = new Set<string>()
  const castleName = () => {
    for (;;) {
      const n = PREFIX[Math.floor(rnd() * PREFIX.length)] + SUFFIX[Math.floor(rnd() * SUFFIX.length)]
      if (!names.has(n)) {
        names.add(n)
        return n.charAt(0).toUpperCase() + n.slice(1)
      }
    }
  }
  const factions: FactionDef[] = []
  const realmPool = [...REALMS].sort(() => rnd() - 0.5)
  const realmName = () => `${TITLES[Math.floor(rnd() * TITLES.length)]} ${realmPool.pop() ?? 'Nowhere'}`
  const personality = (): FactionDef['personality'] => (['aggressive', 'balanced', 'defensive'] as const)[Math.floor(rnd() * 3)]

  const assign: { faction: string; tier: number; capital: boolean; staging?: boolean }[] = sites.map(() => ({ faction: 'neutral', tier: 1, capital: false }))
  let rules: GameRules

  if (!alliance) {
    // Survival: the player starts in one corner, a coalition holds the far side.
    const corner = [R(-1, -0.6) * half, R(0.6, 1) * half]
    const pIdx = nearestIndex(sites, corner[0], corner[1])
    const p = sites[pIdx]
    const eIdx = sites.reduce((best, s, i) => (Math.hypot(s.x - p.x, s.z - p.z) > Math.hypot(sites[best].x - p.x, sites[best].z - p.z) ? i : best), 0)
    const e = sites[eIdx]
    const ratio = sites.map((s) => {
      const dp = Math.hypot(s.x - p.x, s.z - p.z)
      const de = Math.hypot(s.x - e.x, s.z - e.z)
      return dp / (dp + de)
    })
    factions.push({ id: PLAYER, name: 'Kingdom of Aethelgard', color: '#2f63c4', team: 'A' })
    factions.push({ id: 'ashen', name: 'Ashen Dominion', color: '#a3271d', team: 'B', leader: true, musters: true, personality: 'aggressive' })
    const vassals = Math.max(1, preset.conquest.vassals - (preset.conquest.vassals === 2 && rnd() < 0.4 ? 1 : 0))
    const vassalColors = ['#7c2d92', '#b45309', '#3f6212']
    for (let v = 0; v < vassals; v++) factions.push({ id: `v${v}`, name: realmName(), color: vassalColors[v], team: 'B', personality: personality(), musters: v === 0 && rnd() < 0.5 })
    factions.push({ id: 'neutral', name: 'Free Towns', color: '#a08a56', team: 'N' })

    assign[pIdx] = { faction: PLAYER, tier: 4, capital: true }
    const extra = sites.map((_, i) => i).filter((i) => i !== pIdx).sort((a, b) => ratio[a] - ratio[b]).slice(0, preset.conquest.playerCastles - 1)
    for (const i of extra) assign[i] = { faction: PLAYER, tier: 2, capital: false }
    assign[eIdx] = { faction: 'ashen', tier: 4, capital: true, staging: false }
    // Enemy territory: everything past the midline. Vassals take the flanks.
    const enemyIdx = sites.map((_, i) => i).filter((i) => i !== eIdx && assign[i].faction === 'neutral' && ratio[i] > preset.conquest.enemyLine)
    const vassalSeeds: number[] = []
    for (let v = 0; v < vassals; v++) {
      const pool = enemyIdx.filter((i) => !vassalSeeds.includes(i))
      if (pool.length === 0) break
      const far = pool.reduce((best, i) => {
        const d = Math.min(Math.hypot(sites[i].x - e.x, sites[i].z - e.z), ...vassalSeeds.map((s) => Math.hypot(sites[i].x - sites[s].x, sites[i].z - sites[s].z)))
        const db = Math.min(Math.hypot(sites[best].x - e.x, sites[best].z - e.z), ...vassalSeeds.map((s) => Math.hypot(sites[best].x - sites[s].x, sites[best].z - sites[s].z)))
        return d > db ? i : best
      }, pool[0])
      vassalSeeds.push(far)
      assign[far] = { faction: `v${v}`, tier: 3, capital: true }
    }
    let staged = false
    for (const i of enemyIdx) {
      if (assign[i].capital) continue
      const seeds = [eIdx, ...vassalSeeds]
      const owner = seeds.reduce((best, s) => (Math.hypot(sites[i].x - sites[s].x, sites[i].z - sites[s].z) < Math.hypot(sites[i].x - sites[best].x, sites[i].z - sites[best].z) ? s : best), seeds[0])
      const isStaging = !staged && owner === eIdx && ratio[i] < 0.7
      if (isStaging) staged = true
      assign[i] = { faction: assign[owner].faction, tier: isStaging ? 2 : rnd() < 0.35 ? 2 : 1, capital: false, staging: isStaging }
    }
    // A few more player-side neutral towns stay neutral; the rest of the middle too.
    sites.forEach((_, i) => {
      if (assign[i].faction === 'neutral') assign[i].tier = rnd() < 0.3 ? 2 : 1
    })
    const enemyCapitals = sites.map((_, i) => i).filter((i) => assign[i].capital && assign[i].faction !== PLAYER)
    rules = { mode: 'survival', victoryCastles: enemyCapitals.map((i) => `c${i}`), defeatCastles: [`c${pIdx}`], defeatOnEliminated: true, size: opts.size ?? 'medium' }
  } else {
    // Alliance War: a wavering front splits the map; each half is carved into realms.
    const theta = rnd() * Math.PI * 2
    const dx = Math.cos(theta)
    const dz = Math.sin(theta)
    const proj = sites.map((s) => s.x * dx + s.z * dz + Math.sin((s.x * -dz + s.z * dx) / (size * 0.18)) * size * 0.06)
    const order = sites.map((_, i) => i).sort((a, b) => proj[a] - proj[b])
    const neutralCount = Math.max(2, Math.round(sites.length * 0.08))
    const mid = order.length / 2
    const neutralSet = new Set(order.slice(Math.floor(mid - neutralCount / 2), Math.floor(mid - neutralCount / 2) + neutralCount))
    const teamOf = (i: number): Team => (neutralSet.has(i) ? 'N' : order.indexOf(i) < mid ? 'A' : 'B')
    const perTeam = Math.floor(factionCount / 2)
    const hueA = [195, 165, 140, 210, 180, 150, 225, 175]
    const hueB = [5, 25, 340, 285, 15, 355, 300, 35]
    for (const team of ['A', 'B'] as const) {
      const members = sites.map((_, i) => i).filter((i) => teamOf(i) === team)
      // The castle deepest behind the front becomes the alliance's High Seat.
      const depth = (i: number) => (team === 'A' ? -proj[i] : proj[i])
      const seeds: number[] = [members.reduce((b, i) => (depth(i) > depth(b) ? i : b), members[0])]
      while (seeds.length < Math.min(perTeam, members.length)) {
        const next = members
          .filter((i) => !seeds.includes(i))
          .reduce(
            (best, i) => {
              const d = Math.min(...seeds.map((s) => Math.hypot(sites[i].x - sites[s].x, sites[i].z - sites[s].z)))
              return d > best.d ? { i, d } : best
            },
            { i: -1, d: -1 },
          ).i
        if (next < 0) break
        seeds.push(next)
      }
      // Pick the player's realm on team A: not the leader, not on the very front.
      let playerSeed = -1
      if (team === 'A') {
        const candidates = seeds.slice(1).sort((a, b) => depth(b) - depth(a))
        playerSeed = candidates[Math.floor(candidates.length * 0.4)] ?? seeds[0]
      }
      seeds.forEach((s, k) => {
        const leader = k === 0
        const id = s === playerSeed ? PLAYER : `${team}${k}`
        const hues = team === 'A' ? hueA : hueB
        const hue = hues[k % hues.length] + R(-8, 8)
        const color = id === PLAYER ? '#2f63c4' : hslHex(hue, R(0.45, 0.65), R(0.32, 0.46))
        factions.push({
          id,
          name: id === PLAYER ? `Kingdom of ${realmPool.pop() ?? 'Aethelgard'}` : realmName(),
          color: leader ? (team === 'A' ? '#1f8a8a' : '#8f1d1d') : color,
          team,
          leader,
          musters: leader,
          personality: leader ? 'aggressive' : personality(),
        })
        assign[s] = { faction: id, tier: leader ? 4 : 3, capital: true }
      })
      for (const i of members) {
        if (seeds.includes(i)) continue
        const owner = seeds.reduce((b, s) => (Math.hypot(sites[i].x - sites[s].x, sites[i].z - sites[s].z) < Math.hypot(sites[i].x - sites[b].x, sites[i].z - sites[b].z) ? s : b), seeds[0])
        assign[i] = { faction: assign[owner].faction, tier: rnd() < 0.35 ? 2 : 1, capital: false }
      }
    }
    factions.push({ id: 'neutral', name: 'Free Towns', color: '#a08a56', team: 'N' })
    for (const i of neutralSet) assign[i] = { faction: 'neutral', tier: rnd() < 0.4 ? 2 : 1, capital: false }
    const seatOf = (team: Team) => sites.findIndex((_, i) => assign[i].capital && factions.find((f) => f.id === assign[i].faction)?.leader && factions.find((f) => f.id === assign[i].faction)?.team === team)
    rules = { mode: 'alliance', victoryCastles: [`c${seatOf('B')}`], defeatCastles: [`c${seatOf('A')}`], defeatOnEliminated: true, size: opts.size ?? 'medium' }
  }

  sites.forEach((s, i) => {
    const a = assign[i]
    const f = factions.find((x) => x.id === a.faction)
    castles.push({
      id: `c${i}`,
      name: castleName(),
      subtitle: a.capital ? (f?.leader ? 'High Seat' : a.faction === PLAYER ? 'Royal Seat' : 'Seat of the Realm') : a.staging ? 'War Camp' : SUBTITLE[a.tier - 1],
      faction: a.faction,
      tier: a.tier,
      x: Math.round(s.x),
      z: Math.round(s.z),
      capital: a.capital,
      staging: !!a.staging,
      garrison: garrisonFor(a.tier, a.capital, f?.personality ?? 'balanced', a.faction === 'neutral', rnd, !alliance && f?.team === 'B'),
    })
  })

  const definition: ScenarioDefinition = {
    start: { gold: alliance ? 1000 : 1200, enemy_gold: 300 },
    victory: { capture: rules.victoryCastles[0] },
    defeat: { lose: rules.defeatCastles[0] },
    factions,
    castles,
    rivers,
    bridges,
    mountains,
    lakes,
    forest_density: R(gen.forest[0], gen.forest[1]),
    biome: mapType,
  }
  const scenario: Scenario = {
    key: `${mode}-${mapType}-${opts.size ?? 'medium'}-${seed}`,
    name: `${alliance ? 'Alliance War' : 'Survival'} · ${BIOMES[mapType].name}`,
    description: alliance
      ? `${factions.length - 1} realms in two great alliances. Take the enemy High Seat.`
      : 'A random frontier. Break the coalition by taking every enemy capital.',
    seed,
    map_size: size,
    definition,
  }

  // Every castle must be reachable from the player's capital by land.
  const world = new World(scenario)
  const home = castles.find((c) => c.faction === PLAYER && c.capital)!
  if (!castles.every((c) => world.connected(home.x, home.z, c.x, c.z))) return null
  return { scenario, rules, world }
}

function nearestIndex(pts: { x: number; z: number }[], x: number, z: number) {
  let bi = 0
  let bd = Infinity
  pts.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.z - z)
    if (d < bd) {
      bd = d
      bi = i
    }
  })
  return bi
}

function garrisonFor(tier: number, capital: boolean, personality: string, neutral: boolean, rnd: () => number, survivalEnemy: boolean): Troops {
  let n = tier * (120 + rnd() * 70) * (capital ? 1.35 : 1) * (survivalEnemy ? 1.15 : 1)
  if (neutral) n = tier * (100 + rnd() * 60)
  const mix =
    neutral
      ? { infantry: 0.7, archers: 0.25, cavalry: 0.05 }
      : personality === 'aggressive'
        ? { infantry: 0.45, cavalry: 0.25, archers: 0.22, engineers: 0.08 }
        : personality === 'defensive'
          ? { infantry: 0.55, cavalry: 0.1, archers: 0.32, engineers: 0.03 }
          : { infantry: 0.5, cavalry: 0.19, archers: 0.25, engineers: 0.06 }
  const out: Troops = {}
  for (const [k, w] of Object.entries(mix)) out[k] = Math.round(n * w)
  return out
}

function hslHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}
