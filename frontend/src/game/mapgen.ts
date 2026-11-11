import { MAPS, type MapType } from './biomes'
import { PLAYER } from './engine'
import { mulberry32 } from './noise'
import type { CastleDef, FactionDef, GameMode, GameRules, MapSize, Scenario, ScenarioDefinition, Team, Troops, FeatureKind, TerrainFeature } from './types'
import { World, distToSegment, holdingRadius } from './world'

/**
 * Procedural maps for Alliance War and Survival. Everything derives from the
 * seed, so the same seed always produces the same world.
 */

const REALMS = [
  'Valoria', 'Thornmere', 'Brightwater', 'Ostmark', 'Kaldheim', 'Ravensholt', 'Duskvale', 'Highmoor', 'Ironwold', 'Greywatch',
  'Ambergate', 'Stormhold', 'Westmarch', 'Eldermoor', 'Sablecrest', 'Wyrmfell', 'Goldhaven', 'Marrowind', 'Coldspire', 'Redfen',
  'Larkspur', 'Northwind', 'Hollowmere', 'Silverholm', 'Blackfen', 'Ashford', 'Kingsreach', 'Mistvale', 'Oakheart', 'Frostgard',
  'Emberfall', 'Wolfsbane', 'Seahaven', 'Dunmere', 'Caer Lys', 'Varnhall', 'Morwen', 'Tirath', 'Galdor', 'Brennoch',
  'Brackenford', 'Dunmarrow', 'Heronsgate', 'Vellmoor', 'Crowmere', 'Elmstead', 'Galewick', 'Saltmarsh', 'Thistledown', 'Wolfhollow',
  'Brindlecombe', 'Morrowgate', 'Pinecrest', 'Rookhaven', 'Starfall', 'Underhill', 'Whitlow']
const TITLES = ['Kingdom of', 'Duchy of', 'County of', 'March of', 'Principality of', 'Barony of', 'Earldom of']
export const PREFIX = [
  'Ash', 'Black', 'Bright', 'Cold', 'Dun', 'Elder', 'Fair', 'Frost', 'Gold', 'Grey', 'High', 'Iron', 'Kings', 'Long', 'Mist', 'North',
  'Oak', 'Raven', 'Red', 'Rose', 'Silver', 'Stone', 'Storm', 'Thorn', 'West', 'Wolf', 'Wyrm', 'Amber', 'Dragon', 'Hawk', 'Lion',
  'Moon', 'Star', 'Sun', 'Winter', 'Ember', 'Glen', 'Hollow', 'Marsh', 'Pine', 'Crow', 'Elk', 'Bear', 'Swan',
]
export const SUFFIX = [
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
  // Twice the area of the previous layouts, for castles 3-4x their old footprint and the countryside between them.
  // Alliance War: 8 v 8, 16 v 16 (the standard) and 24 v 24.
  small: { conquest: { map: 4160, castles: 10, vassals: 1, playerCastles: 2, enemyLine: 0.52 }, alliance: { map: 6000, realms: 16 } },
  medium: { conquest: { map: 5540, castles: 15, vassals: 2, playerCastles: 2, enemyLine: 0.52 }, alliance: { map: 8000, realms: 32 } },
  large: { conquest: { map: 7320, castles: 24, vassals: 2, playerCastles: 3, enemyLine: 0.6 }, alliance: { map: 10000, realms: 48 } },
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
  const factionCount = Math.max(6, Math.min(48, opts.factions ?? preset.alliance.realms))
  const size = alliance ? preset.alliance.map : preset.conquest.map
  const half = size / 2
  // Terrain features scale with map area relative to the medium preset.
  const areaScale = (size * size) / ((alliance ? 4000 : 2800) ** 2)
  const mapType: MapType = opts.mapType ?? 'crown'
  const mapDef = MAPS[mapType]

  // --- Terrain features, laid out for this map --------------------------------
  // u, v run from -1 (west, north) to 1 (east, south).
  const at = (u: number, v: number): [number, number] => [u * half, v * half]
  const mountains: ScenarioDefinition['mountains'] = []
  const rivers: ScenarioDefinition['rivers'] = []
  const lakes: ScenarioDefinition['lakes'] = []
  const count = (n: number) => Math.max(1, Math.round(n * Math.sqrt(areaScale)))
  const peak = (u: number, v: number, r: [number, number], h: [number, number]) => {
    const [x, z] = at(u, v)
    mountains.push({ x, z, r: R(r[0], r[1]), h: R(h[0], h[1]) })
  }
  const scatter = (n: number, inside: (u: number, v: number) => boolean, r: [number, number], h: [number, number]) => {
    for (let i = 0, tries = 0; i < n && tries < n * 40; tries++) {
      const u = R(-0.92, 0.92)
      const v = R(-0.92, 0.92)
      if (!inside(u, v)) continue
      peak(u, v, r, h)
      i++
    }
  }
  /** A river from one point to another (in u, v), meandering. */
  const river = (u0: number, v0: number, u1: number, v1: number, width: number, wander = 0.05) => {
    const pts: [number, number][] = []
    const steps = 14
    let drift = 0
    const [ax, az] = at(u0, v0)
    const [bx, bz] = at(u1, v1)
    const len = Math.hypot(bx - ax, bz - az) || 1
    const nx = -(bz - az) / len
    const nz = (bx - ax) / len
    const waves = R(1, 3)
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      drift += R(-1, 1) * size * wander * 0.6
      drift *= 0.85
      const off = drift + Math.sin(t * Math.PI * waves) * size * wander
      pts.push([ax + (bx - ax) * t + nx * off, az + (bz - az) * t + nz * off])
    }
    rivers.push({ width, points: pts })
  }
  const lake = (u: number, v: number, r: number) => {
    const [x, z] = at(u, v)
    lakes.push({ x, z, r })
  }
  const scatterLakes = (n: number, inside: (u: number, v: number) => boolean, r: [number, number]) => {
    for (let i = 0, tries = 0; i < n && tries < n * 40; tries++) {
      const u = R(-0.85, 0.85)
      const v = R(-0.85, 0.85)
      if (!inside(u, v)) continue
      lake(u, v, R(r[0], r[1]))
      i++
    }
  }
  switch (mapType) {
    case 'crown': {
      // The snowbound spine, broken by three passes.
      for (let u = -1.05; u <= 1.05; u += 0.1) {
        if ([-0.5, 0, 0.5].some((p) => Math.abs(u - p) < 0.1)) continue
        peak(u + R(-0.03, 0.03), R(-0.06, 0.06), [half * 0.09, half * 0.13], [210, 280])
      }
      scatter(count(3), (_u, v) => v < -0.4, [150, 260], [110, 170])
      scatter(count(2), (_u, v) => v > 0.45, [140, 220], [80, 120])
      river(-1.1, R(0.45, 0.7), 1.1, R(0.45, 0.7), R(44, 54))
      river(-1.1, R(-0.75, -0.5), 1.1, R(-0.75, -0.5), R(38, 46))
      scatterLakes(count(2), (_u, v) => Math.abs(v) > 0.4, [70, 130])
      break
    }
    case 'delta': {
      river(R(-0.12, 0.12), -1.1, R(-0.12, 0.12), 1.1, 74, 0.035)
      scatterLakes(count(7), (u, v) => v > 0.55 && Math.abs(u) < 0.42, [55, 115])
      scatter(count(6), (u) => Math.abs(u) > 0.5, [140, 240], [60, 110])
      if (alliance) river(-1.1, R(-0.6, -0.3), R(-0.15, -0.05), R(-0.2, 0.1), 40, 0.03)
      break
    }
    case 'frostfire': {
      scatter(count(7), (u, v) => u - v < -0.35, [160, 260], [160, 240])
      scatter(count(3), (u, v) => u - v > 0.45, [150, 240], [110, 170])
      river(-1.1, -0.95, 1.1, 1.0, R(42, 50), 0.04)
      scatterLakes(count(4), (u, v) => u - v > 0.3, [70, 140])
      break
    }
    case 'coast': {
      // The sea: great overlapping bowls beyond the southern shore.
      for (let u = -1.4; u <= 1.4; u += 0.35) lake(u + R(-0.08, 0.08), R(1.42, 1.55), half * R(0.66, 0.74))
      scatter(count(11), (_u, v) => v < -0.15, [110, 200], [90, 140])
      river(R(-0.7, -0.4), -1.1, R(-0.6, -0.3), 0.9, R(40, 48))
      river(R(0.3, 0.7), -1.1, R(0.3, 0.6), 0.9, R(40, 48))
      break
    }
    case 'basin': {
      scatterLakes(count(7), (u, v) => Math.hypot(u, v) < 0.34, [100, 210])
      for (let a = 0; a < Math.PI * 2; a += Math.PI / (alliance ? 7 : 5)) {
        const rr = R(0.82, 0.92)
        peak(Math.cos(a) * rr, Math.sin(a) * rr, [180, 300], [120, 190])
      }
      river(R(-0.2, 0.2), -1.1, R(-0.05, 0.05), -0.05, R(38, 46))
      break
    }
    case 'divide': {
      river(R(-0.45, -0.3), -1.1, R(-0.45, -0.25), 1.1, R(42, 50))
      river(R(0.25, 0.45), -1.1, R(0.25, 0.45), 1.1, R(42, 50))
      scatter(count(6), (_u, v) => v < -0.45, [160, 260], [190, 260])
      scatter(count(4), (_u, v) => Math.abs(v) < 0.25, [120, 200], [70, 120])
      scatterLakes(count(2), (_u, v) => v > 0.45, [70, 130])
      break
    }
  }

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
  const dmin = alliance ? (size * 0.62) / Math.sqrt(targetCastles) : Math.min(800, (size * 0.6) / Math.sqrt(targetCastles))
  const sites: { x: number; z: number }[] = []
  const margin = 320
  for (let tries = 0; tries < 20000 && sites.length < targetCastles; tries++) {
    const x = R(-half + margin, half - margin)
    const z = R(-half + margin, half - margin)
    if (mountains.some((m) => Math.hypot(x - m.x, z - m.z) < m.r * 1.1 + 120)) continue
    if (lakes.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + 230)) continue
    if (riverDist(x, z) < 230) continue
    if (sites.some((s) => Math.hypot(x - s.x, z - s.z) < dmin)) continue
    sites.push({ x, z })
  }
  if (sites.length < (alliance ? factionCount + 2 : Math.max(8, targetCastles - 3))) return null

  // Bridges every ~450 units along each river.
  const bridges: { x: number; z: number; ford?: boolean }[] = []
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
        // Two crossings in three are proper bridges; the rest are shallow fords.
        if (inside && clear) bridges.push(bridges.length % 3 === 2 ? { x, z, ford: true } : { x, z })
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
    forest_density: mapDef.gen.forest,
    biome: mapType,
  }
  const scenario: Scenario = {
    key: `${mode}-${mapType}-${opts.size ?? 'medium'}-${seed}`,
    name: `${alliance ? 'Alliance War' : 'Survival'} · ${mapDef.name}`,
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
  definition.features = placeFeatures(world, castles, rnd)
  return { scenario, rules, world }
}

/** Where each terrain feature likes to be found, by climate. */
const FEATURE_CLIMATES: Record<FeatureKind, string[]> = {
  stones: ['highland', 'taiga', 'temperate', 'grain', 'wasteland', 'alpine', 'lakeland', 'icefield', 'volcanic', 'desert', 'coast'],
  terraces: ['grain', 'coast', 'autumn', 'temperate', 'mesa', 'oasis', 'volcanic'],
  thicket: ['taiga', 'autumn', 'steam', 'wasteland', 'temperate', 'icefield', 'oasis'],
  wadi: ['desert', 'mesa', 'highland', 'wasteland', 'volcanic', 'grain'],
  crag: ['highland', 'desert', 'mesa', 'temperate', 'grain', 'volcanic', 'icefield', 'wasteland', 'coast', 'alpine'],
}

/** Scatter standing stones, terraces, windfall, wadis and crags over the land. */
function placeFeatures(world: World, castles: CastleDef[], rnd: () => number): TerrainFeature[] {
  const out: TerrainFeature[] = []
  const half = world.half
  const area = (world.size * world.size) / (5540 * 5540)
  const each = Math.max(2, Math.round(3 * Math.sqrt(area)))
  const kinds: FeatureKind[] = ['stones', 'terraces', 'thicket', 'wadi', 'crag']
  const clear = (x: number, z: number, r: number) =>
    Math.abs(x) < half - 260 &&
    Math.abs(z) < half - 260 &&
    castles.every((c) => Math.hypot(c.x - x, c.z - z) > holdingRadius(c) + r + 160) &&
    world.crossings().every((b) => Math.hypot(b.x - x, b.z - z) > r + 160) &&
    out.every((f) => Math.hypot(f.x - x, f.z - z) > f.r + (f.len ?? 0) / 2 + r + 200)
  for (const kind of kinds) {
    for (let placed = 0, tries = 0; placed < each && tries < 600; tries++) {
      const x = (rnd() * 2 - 1) * (half - 300)
      const z = (rnd() * 2 - 1) * (half - 300)
      const h = world.heightAt(x, z)
      if (h < 4 || !world.isPassable(x, z)) continue
      if (!FEATURE_CLIMATES[kind].includes(world.climateAt(x, z).key)) continue
      const slope = world.slopeAt(x, z)
      const forest = world.forestAt(x, z)
      const r = kind === 'wadi' ? 26 : kind === 'crag' ? 34 : kind === 'stones' ? 70 : kind === 'terraces' ? 110 : 100
      if (kind === 'terraces' && (slope < 0.12 || slope > 0.6)) continue
      // Round features sit wholly on dry land.
      if (kind !== 'wadi') {
        let dry = true
        for (let k = 0; k < 8; k++) {
          const px = x + Math.cos((k / 8) * Math.PI * 2) * r
          const pz = z + Math.sin((k / 8) * Math.PI * 2) * r
          if (world.heightAt(px, pz) < 4 || !world.isPassable(px, pz)) dry = false
        }
        if (!dry) continue
      }
      if (kind === 'thicket' && forest < 0.25) continue
      if ((kind === 'stones' || kind === 'crag' || kind === 'wadi') && (forest > 0.35 || slope > 0.4)) continue
      const len = kind === 'wadi' ? 380 + rnd() * 240 : 0
      const angle = rnd() * Math.PI
      if (!clear(x, z, r + len / 2)) continue
      // A strip must lie on dry, passable ground along its length.
      if (len) {
        let ok = true
        for (let t = -0.5; t <= 0.5; t += 0.125) {
          const px = x + Math.cos(angle) * len * t
          const pz = z + Math.sin(angle) * len * t
          if (!world.isPassable(px, pz) || world.heightAt(px, pz) < 4) ok = false
        }
        if (!ok) continue
      }
      out.push(len ? { kind, x: Math.round(x), z: Math.round(z), r, angle, len: Math.round(len) } : { kind, x: Math.round(x), z: Math.round(z), r })
      placed++
    }
  }
  return out
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
