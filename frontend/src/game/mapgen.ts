import { MAPS, type MapType } from './biomes'
import { PLAYER } from './engine'
import { clamp, mulberry32 } from './noise'
import type { CastleDef, Difficulty, Escarpment, FactionDef, GameMode, GameRules, MapSize, Rampart, Scenario, ScenarioDefinition, Team, Troops, FeatureKind, TerrainFeature } from './types'
import { ROYAL_SEAT_TIER, World, distToSegment, holdingRadius } from './world'

/**
 * Procedural maps for Alliance War and Survival. Everything derives from the
 * seed, so the same seed always produces the same world.
 */

export const REALMS = [
  'Valoria', 'Thornmere', 'Brightwater', 'Ostmark', 'Kaldheim', 'Ravensholt', 'Duskvale', 'Highmoor', 'Ironwold', 'Greywatch',
  'Ambergate', 'Stormhold', 'Westmarch', 'Eldermoor', 'Sablecrest', 'Wyrmfell', 'Goldhaven', 'Marrowind', 'Coldspire', 'Redfen',
  'Larkspur', 'Northwind', 'Hollowmere', 'Silverholm', 'Blackfen', 'Ashford', 'Kingsreach', 'Mistvale', 'Oakheart', 'Frostgard',
  'Emberfall', 'Wolfsbane', 'Seahaven', 'Dunmere', 'Caer Lys', 'Varnhall', 'Morwen', 'Tirath', 'Galdor', 'Brennoch',
  'Brackenford', 'Dunmarrow', 'Heronsgate', 'Vellmoor', 'Crowmere', 'Elmstead', 'Galewick', 'Saltmarsh', 'Thistledown', 'Wolfhollow',
  'Brindlecombe', 'Morrowgate', 'Pinecrest', 'Rookhaven', 'Starfall', 'Underhill', 'Whitlow']
export const TITLES = ['Kingdom of', 'Duchy of', 'County of', 'March of', 'Principality of', 'Barony of', 'Earldom of']
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
  /** Alliance War: sets how much of the map the player's alliance holds at the start. */
  difficulty?: Difficulty
}

/**
 * Alliance War: the enemy is always strong (the "hard" foe); the difficulty is how much
 * of the map your alliance still holds when the war begins.
 */
export const ALLIANCE_SHARE: Record<Difficulty, number> = { easy: 0.5, normal: 0.4, hard: 0.3, brutal: 0.2 }
/** Last Stand: hold out until the relief fleet lands, at the start of the second spring. */
export const RELIEF_AT = 120 * 30

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
  const ramparts: Rampart[] = []
  const escarpments: Escarpment[] = []
  const roads: { width: number; points: [number, number][] }[] = []
  /** Castles every map of this kind has in the same place (the island fortress, the battlefield citadel): always free towns. */
  const fixedSites: { x: number; z: number; name: string; subtitle: string }[] = []
  /** Rivers whose crossings are laid down by the map (fractions along the river), not every ~450 units. */
  const fixedCross = new Map<number, { t: number; ford?: boolean }[]>()
  /**
   * The way the land faces: the two sides start on either side of the map's great obstacle,
   * along this direction (u, v) from one to the other.
   */
  let axis: [number, number] = [0, -1]
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
    return rivers.length - 1
  }
  /** A gently wavering line across the map from (u0, v0) to (u1, v1), in world units. */
  const wavyLine = (u0: number, v0: number, u1: number, v1: number, step: number, wobble: number): [number, number][] => {
    const pts: [number, number][] = []
    const n = Math.max(2, Math.round(Math.hypot(u1 - u0, v1 - v0) / step))
    const nu = -(v1 - v0)
    const nv = u1 - u0
    const l = Math.hypot(nu, nv) || 1
    const ph = R(0, 6.28)
    for (let k = 0; k <= n; k++) {
      const t = k / n
      const w = Math.sin(t * Math.PI * 2.2 + ph) * wobble * Math.sin(Math.PI * t * 0.98 + 0.02)
      pts.push(at(u0 + (u1 - u0) * t + (nu / l) * w, v0 + (v1 - v0) * t + (nv / l) * w))
    }
    return pts
  }
  /** The point of a polyline nearest (u, v). */
  const onLine = (pts: [number, number][], u: number, v: number): [number, number] => {
    const [x, z] = at(u, v)
    let best = pts[0]
    for (const p of pts) if (Math.hypot(p[0] - x, p[1] - z) < Math.hypot(best[0] - x, best[1] - z)) best = p
    return best
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
      // The snowbound spine, broken by three passes. North against south.
      axis = [0, -1]
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
      // The Great River: west bank against east. North of the delta it can be crossed only at a
      // northern ford and the Great Bridge; at its mouth it splits into three channels through the
      // mud flats, fordable anywhere along them but slow going, where no charge can be made.
      axis = [1, 0]
      const su = R(-0.06, 0.06)
      const sv = R(0.36, 0.44)
      const main = river(R(-0.1, 0.1), -1.1, su, sv, 84, 0.03)
      fixedCross.set(main, [{ t: 0.17, ford: true }, { t: 0.56 }])
      for (const du of [-0.42, 0, 0.42]) {
        const b = river(su, sv, su + du + R(-0.05, 0.05), 1.12, 36, 0.015)
        fixedCross.set(b, [{ t: 0.3, ford: true }, { t: 0.55, ford: true }, { t: 0.8, ford: true }])
      }
      // Sand-sea buttes out on the flanks, far from the water.
      scatter(count(6), (u) => Math.abs(u) > 0.55, [140, 240], [60, 110])
      break
    }
    case 'frostfire': {
      // The Long Wall: an ancient wall along the whole border between ice (north-east) and ash
      // (south-west), corner to corner. Two gates and one breach are the only ways across.
      axis = [Math.SQRT1_2, -Math.SQRT1_2]
      const pts = wavyLine(-1.12, -1.12, 1.12, 1.12, 0.07, 0.05)
      const ts = [R(-0.62, -0.48), R(-0.08, 0.08), R(0.48, 0.62)]
      const breach = Math.floor(R(0, 3))
      const gates = ts.map((t, k) => {
        const [x, z] = onLine(pts, t, t)
        return { x, z, ...(k === breach ? { breach: true } : {}) }
      })
      ramparts.push({ points: pts, width: 14, height: 20, gates })
      // Fire peaks and ice crags, kept well back from the wall.
      scatter(count(6), (u, v) => u - v < -0.5, [150, 240], [150, 220])
      scatter(count(3), (u, v) => u - v > 0.55, [140, 220], [110, 170])
      // A river through the ash lands, running along the wall; meltwater lakes on the ice.
      river(-1.1, -0.42, 0.42, 1.1, R(42, 50), 0.03)
      scatterLakes(count(4), (u, v) => u - v > 0.5, [70, 130])
      break
    }
    case 'coast': {
      // The Red Escarpment: the mesa country (north) ends in a sheer wall of cliffs across the land,
      // passable only up three narrow canyons. Below it, the open coast.
      axis = [0, -1]
      for (let u = -1.4; u <= 1.4; u += 0.35) lake(u + R(-0.08, 0.08), R(1.42, 1.55), half * R(0.66, 0.74))
      const ev = R(-0.24, -0.14)
      const edge = wavyLine(-1.12, ev, 1.12, ev, 0.08, 0.06)
      const passes = [R(-0.68, -0.52), R(-0.06, 0.06), R(0.52, 0.68)].map((u) => {
        const [x, z] = onLine(edge, u, ev)
        return { x, z, w: alliance ? 62 : 52 }
      })
      escarpments.push({ points: edge, height: 115, cliff: 74, ramp: alliance ? 600 : 520, passes })
      // Tall mesas in the hinterland behind it.
      scatter(count(8), (_u, v) => v < ev - 0.3, [110, 200], [90, 140])
      // Two rivers falling from the cliffs to the sea.
      river(R(-0.82, -0.32), ev + 0.16, R(-0.75, -0.3), 0.96, R(38, 46))
      river(R(0.28, 0.8), ev + 0.16, R(0.25, 0.75), 0.96, R(38, 46))
      break
    }
    case 'basin': {
      // The Mere Isle: a ring of lakes round the island fortress at the heart of the basin. The narrow
      // necks between the lakes are the short way across; the autumn forest ring is the ambusher's
      // road; the steppe rim the long way round for riders.
      axis = [1, 0]
      const ring = 0.3
      const n = 6
      const gap = Math.max(190, half * 0.055)
      const lr = ((2 * Math.PI * ring * half) / n - gap) / 2
      const ph = R(0, Math.PI / n) + Math.PI / n / 2
      for (let k = 0; k < n; k++) lake(Math.cos(ph + (k / n) * Math.PI * 2) * ring, Math.sin(ph + (k / n) * Math.PI * 2) * ring, lr)
      fixedSites.push({ x: 0, z: 0, name: 'Heartmere', subtitle: 'The Isle Fortress' })
      for (let a = 0; a < Math.PI * 2; a += Math.PI / (alliance ? 7 : 5)) {
        const rr = R(0.84, 0.93)
        peak(Math.cos(a) * rr, Math.sin(a) * rr, [170, 280], [120, 190])
      }
      break
    }
    case 'divide': {
      // The Two Rivers: snowmelt rivers run the length of the land, west realm against east, the old
      // battlefield between them with its citadel. Each river has only three crossings: a cold
      // northern ford, a bridge at the battlefield, and one in the golden south.
      axis = [1, 0]
      for (const u0 of [R(-0.42, -0.34), R(0.34, 0.42)]) {
        const r = river(u0, -1.1, u0 + R(-0.06, 0.06), 1.1, R(46, 54), 0.03)
        fixedCross.set(r, [{ t: 0.14, ford: true }, { t: 0.5 }, { t: 0.84 }])
      }
      fixedSites.push({ x: 0, z: Math.round(R(-0.08, 0.08) * half), name: 'Gravewatch', subtitle: 'Citadel of the Old Battlefield' })
      scatter(count(6), (_u, v) => v < -0.5, [160, 260], [190, 260])
      // Barrow hills on the old battlefield, clear of the citadel.
      scatter(count(3), (u, v) => Math.abs(u) < 0.2 && Math.abs(v) > 0.3 && Math.abs(v) < 0.7, [110, 170], [55, 90])
      scatterLakes(count(2), (u, v) => v > 0.45 && Math.abs(u) > 0.55, [70, 130])
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
  // Distance from a point to a polyline (for the walls and cliffs).
  const lineDist = (pts: [number, number][], x: number, z: number) => {
    let best = Infinity
    for (let k = 0; k < pts.length - 1; k++) best = Math.min(best, distToSegment(x, z, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]))
    return best
  }
  const sites: { x: number; z: number }[] = fixedSites.map((f) => ({ x: f.x, z: f.z }))
  const margin = 320
  for (let tries = 0; tries < 20000 && sites.length < targetCastles; tries++) {
    const x = R(-half + margin, half - margin)
    const z = R(-half + margin, half - margin)
    // No castle on (or crowding) a great wall, nor on the cliffs or up a canyon.
    if (ramparts.some((r) => lineDist(r.points, x, z) < r.width / 2 + 260)) continue
    // (Clear of the cliff edge, which wanders up to ~110 off its line, and of the ravines.)
    if (escarpments.some((e) => lineDist(e.points, x, z) < 300 || e.passes.some((p) => Math.hypot(p.x - x, p.z - z) < e.ramp + 160))) continue
    if (mountains.some((m) => Math.hypot(x - m.x, z - m.z) < m.r * 1.1 + 120)) continue
    if (lakes.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + 230)) continue
    if (riverDist(x, z) < 230) continue
    if (sites.some((s) => Math.hypot(x - s.x, z - s.z) < dmin)) continue
    sites.push({ x, z })
  }
  if (sites.length < (alliance ? factionCount + 2 : Math.max(8, targetCastles - 3))) return null

  // Bridges every ~450 units along each river.
  const bridges: { x: number; z: number; ford?: boolean }[] = []
  rivers.forEach((r, ri) => {
    const fixed = fixedCross.get(ri)
    if (!fixed) return
    // Crossings the map lays down itself, at fractions along the river's length.
    const lens = r.points.slice(1).map((p, k) => Math.hypot(p[0] - r.points[k][0], p[1] - r.points[k][1]))
    const total = lens.reduce((a, b) => a + b, 0)
    for (const c of fixed) {
      let t = c.t * total
      for (let k = 0; k < lens.length; k++) {
        if (t > lens[k]) {
          t -= lens[k]
          continue
        }
        const [ax, az] = r.points[k]
        const [bx, bz] = r.points[k + 1]
        const x = ax + ((bx - ax) * t) / lens[k]
        const z = az + ((bz - az) * t) / lens[k]
        if (Math.abs(x) < half - 150 && Math.abs(z) < half - 150) bridges.push(c.ford ? { x, z, ford: true } : { x, z })
        break
      }
    }
  })
  // Where a road meets a river there is always a bridge.
  for (const road of roads)
    for (const r of rivers)
      for (let a = 0; a < road.points.length - 1; a++)
        for (let k = 0; k < r.points.length - 1; k++) {
          const [p1, p2] = [road.points[a], road.points[a + 1]]
          const [q1, q2] = [r.points[k], r.points[k + 1]]
          const d = (p2[0] - p1[0]) * (q2[1] - q1[1]) - (p2[1] - p1[1]) * (q2[0] - q1[0])
          if (Math.abs(d) < 1e-6) continue
          const t = ((q1[0] - p1[0]) * (q2[1] - q1[1]) - (q1[1] - p1[1]) * (q2[0] - q1[0])) / d
          const u = ((q1[0] - p1[0]) * (p2[1] - p1[1]) - (q1[1] - p1[1]) * (p2[0] - p1[0])) / d
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) bridges.push({ x: p1[0] + (p2[0] - p1[0]) * t, z: p1[1] + (p2[1] - p1[1]) * t })
        }
  rivers.forEach((r, ri) => {
    if (fixedCross.has(ri)) return
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
  })

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
    // Survival: the player starts on one side of the map's great obstacle, the coalition holds the far side.
    const flip = rnd() < 0.5 ? 1 : -1
    const [au, av] = [axis[0] * flip, axis[1] * flip]
    const along = R(-0.35, 0.35)
    const corner = [(-au * 0.82 - av * along) * half, (-av * 0.82 + au * along) * half]
    const free = (i: number) => !fixedSites.some((f) => f.x === sites[i].x && f.z === sites[i].z)
    const pIdx = sites.reduce((best, s, i) => (free(i) && Math.hypot(s.x - corner[0], s.z - corner[1]) < Math.hypot(sites[best].x - corner[0], sites[best].z - corner[1]) ? i : best), sites.findIndex((_, i) => free(i)))
    const p = sites[pIdx]
    // The enemy seat: furthest across, along the axis.
    const across = (s: { x: number; z: number }) => (s.x - p.x) * au + (s.z - p.z) * av
    const eIdx = sites.reduce((best, s, i) => (free(i) && across(s) > across(sites[best]) ? i : best), pIdx)
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

    assign[pIdx] = { faction: PLAYER, tier: ROYAL_SEAT_TIER, capital: true }
    const extra = sites.map((_, i) => i).filter((i) => i !== pIdx).sort((a, b) => ratio[a] - ratio[b]).slice(0, preset.conquest.playerCastles - 1)
    for (const i of extra) assign[i] = { faction: PLAYER, tier: 2, capital: false }
    assign[eIdx] = { faction: 'ashen', tier: ROYAL_SEAT_TIER, capital: true, staging: false }
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
    // The front runs across the map's great obstacle (which side is which changes from war to war).
    const theta = Math.atan2(axis[1], axis[0]) + R(-0.12, 0.12) + (rnd() < 0.5 ? Math.PI : 0)
    const dx = Math.cos(theta)
    const dz = Math.sin(theta)
    const proj = sites.map((s) => s.x * dx + s.z * dz + Math.sin((s.x * -dz + s.z * dx) / (size * 0.18)) * size * 0.06)
    const order = sites.map((_, i) => i).sort((a, b) => proj[a] - proj[b])
    const neutralCount = Math.max(2, Math.round(sites.length * 0.08))
    const mid = Math.round(order.length * ALLIANCE_SHARE[opts.difficulty ?? 'easy'])
    const neutralSet = new Set(order.slice(Math.floor(mid - neutralCount / 2), Math.floor(mid - neutralCount / 2) + neutralCount))
    const teamOf = (i: number): Team => (neutralSet.has(i) ? 'N' : order.indexOf(i) < mid ? 'A' : 'B')
    const perTeam = Math.floor(factionCount / 2)
    const hueA = [195, 165, 140, 210, 180, 150, 225, 175]
    const hueB = [5, 25, 340, 285, 15, 355, 300, 35]
    for (const team of ['A', 'B'] as const) {
      // (The map's own fortresses stay free towns, whichever side of the front they fall.)
      const members = sites.map((_, i) => i).filter((i) => teamOf(i) === team && !fixedSites.some((f) => f.x === sites[i].x && f.z === sites[i].z))
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
        // The King's court and the Usurper's are royal seats; the other lords keep lesser castles.
        assign[s] = { faction: id, tier: id === PLAYER || (leader && team === 'B') ? ROYAL_SEAT_TIER : leader ? 4 : 3, capital: true }
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
    // Last Stand: hold out until the relief fleet lands (or slay the Usurper first).
    if (opts.difficulty === 'brutal') Object.assign(rules, { timeLimit: RELIEF_AT, timeoutWinner: 'A' as const })
  }

  sites.forEach((s, i) => {
    // The map's own fortresses stay free towns, strong ones (unless one became a realm's seat).
    const fixed = fixedSites.find((f) => f.x === s.x && f.z === s.z)
    if (fixed && !assign[i].capital) assign[i] = { faction: 'neutral', tier: 3, capital: false }
    const a = assign[i]
    const f = factions.find((x) => x.id === a.faction)
    castles.push({
      id: `c${i}`,
      name: fixed && !a.capital ? fixed.name : castleName(),
      subtitle: fixed && !a.capital ? fixed.subtitle : a.capital ? (a.faction === PLAYER ? "The King's Court" : a.tier >= ROYAL_SEAT_TIER ? "The Usurper's Court" : f?.leader ? 'High Seat' : 'Seat of the Realm') : a.staging ? 'War Camp' : SUBTITLE[a.tier - 1],
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
    ...(ramparts.length ? { ramparts } : {}),
    ...(escarpments.length ? { escarpments } : {}),
    ...(roads.length ? { roads } : {}),
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
  thicket: ['taiga', 'autumn', 'steam', 'wasteland', 'temperate', 'icefield', 'oasis'],
  crag: ['highland', 'desert', 'mesa', 'temperate', 'grain', 'volcanic', 'icefield', 'wasteland', 'coast', 'alpine'],
  // The great woods grow wherever the climate is well wooded (see placeWoods).
  oldwood: [],
  deepwood: [],
}

/**
 * Is the ground for a feature of radius r at (x, z) fit for it? Clear of the mountains (and their
 * foothills), and on low, gentle, dry ground throughout: no feature sits on a mountainside, a cliff,
 * a river or a lake shore. `wetOk` is the share of the samples that may be water or impassable.
 */
function groundFits(world: World, x: number, z: number, r: number, wetOk = 0): boolean {
  for (const m of world.def.mountains) if (Math.hypot(m.x - x, m.z - z) < m.r * 1.25 + r) return false
  let wet = 0
  let n = 0
  for (let ring = 0; ring <= 1.0001; ring += 0.2) {
    for (let k = 0; k < 16; k++) {
      const px = x + Math.cos((k / 16) * Math.PI * 2 + ring) * r * ring
      const pz = z + Math.sin((k / 16) * Math.PI * 2 + ring) * r * ring
      n++
      const h = world.heightAt(px, pz)
      if (h > 70 || world.slopeAt(px, pz) > 0.75) return false
      if (h < 4 || !world.isPassable(px, pz)) wet++
      if (ring === 0) break
    }
  }
  return wet <= n * wetOk
}

/**
 * The great woods: stands of old-growth forest (giant trees, open floor) and the Deepwood (a sea of
 * trees where a host is lost from sight). They grow out of the existing woods where they can, on
 * dry ground in a well-wooded climate, clear of castles, crossings, roads and walls.
 */
function placeWoods(world: World, castles: CastleDef[], rnd: () => number, out: TerrainFeature[]) {
  const half = world.half
  const area = (world.size * world.size) / (5540 * 5540)
  const scale = clamp(Math.sqrt(area), 0.85, 1.35)
  const plan: [FeatureKind, number][] = [
    ['deepwood', Math.max(1, Math.round(1.2 * Math.sqrt(area)))],
    ['oldwood', Math.max(2, Math.round(2.2 * Math.sqrt(area)))],
  ]
  for (const [kind, want] of plan) {
    for (let placed = 0, tries = 0; placed < want && tries < 900; tries++) {
      const r = Math.round(kind === 'deepwood' ? (250 + rnd() * 70) * scale : 140 + rnd() * 50)
      const x = (rnd() * 2 - 1) * (half - r - 220)
      const z = (rnd() * 2 - 1) * (half - r - 220)
      const clim = world.climateAt(x, z)
      if (clim.forest < 0.5 || clim.rules.mired) continue
      // Grow out of the woods already there for the first tries; anywhere wooded enough after.
      if (tries < 450 && world.forestAt(x, z) < 0.2) continue
      if (castles.some((c) => Math.hypot(c.x - x, c.z - z) < holdingRadius(c) + r + 220)) continue
      if (world.crossings().some((c) => Math.hypot(c.x - x, c.z - z) < r + 140)) continue
      if (out.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + r + 220)) continue
      // Low, gentle, dry ground clear of the mountains; no road or wall running through it.
      if (!groundFits(world, x, z, r, 0.04)) continue
      let crossed = false
      for (let ring = 0.25; ring <= 1.0001 && !crossed; ring += 0.25) {
        for (let k = 0; k < 12; k++) {
          const px = x + Math.cos((k / 12) * Math.PI * 2 + ring) * r * ring
          const pz = z + Math.sin((k / 12) * Math.PI * 2 + ring) * r * ring
          if (world.onRoad(px, pz, 10) || world.onWall(px, pz, 20) || world.onRampart(px, pz, 30)) crossed = true
        }
      }
      if (crossed) continue
      out.push({ kind, x: Math.round(x), z: Math.round(z), r })
      placed++
    }
  }
}

/** Scatter the great woods, standing stones, windfall and crags over the land. */
export function placeFeatures(world: World, castles: CastleDef[], rnd: () => number): TerrainFeature[] {
  const out: TerrainFeature[] = []
  const half = world.half
  const area = (world.size * world.size) / (5540 * 5540)
  const each = Math.max(2, Math.round(3 * Math.sqrt(area)))
  // The great woods first: they need the most room.
  placeWoods(world, castles, rnd, out)
  const kinds: FeatureKind[] = ['stones', 'thicket', 'crag']
  const clear = (x: number, z: number, r: number) =>
    Math.abs(x) < half - 260 &&
    Math.abs(z) < half - 260 &&
    castles.every((c) => Math.hypot(c.x - x, c.z - z) > holdingRadius(c) + r + 160) &&
    world.crossings().every((b) => Math.hypot(b.x - x, b.z - z) > r + 160) &&
    out.every((f) => Math.hypot(f.x - x, f.z - z) > f.r + r + 200)
  for (const kind of kinds) {
    for (let placed = 0, tries = 0; placed < each && tries < 600; tries++) {
      const x = (rnd() * 2 - 1) * (half - 300)
      const z = (rnd() * 2 - 1) * (half - 300)
      const h = world.heightAt(x, z)
      if (h < 4 || !world.isPassable(x, z)) continue
      if (!FEATURE_CLIMATES[kind].includes(world.climateAt(x, z).key)) continue
      const slope = world.slopeAt(x, z)
      const forest = world.forestAt(x, z)
      const r = kind === 'crag' ? 34 : kind === 'stones' ? 70 : 100
      // Features sit wholly on dry land.
      let dry = true
      for (let k = 0; k < 8; k++) {
        const px = x + Math.cos((k / 8) * Math.PI * 2) * r
        const pz = z + Math.sin((k / 8) * Math.PI * 2) * r
        if (world.heightAt(px, pz) < 4 || !world.isPassable(px, pz)) dry = false
      }
      if (!dry) continue
      if (kind === 'thicket' && forest < 0.25) continue
      if ((kind === 'stones' || kind === 'crag') && (forest > 0.35 || slope > 0.4)) continue
      if (!clear(x, z, r) || !groundFits(world, x, z, r)) continue
      out.push({ kind, x: Math.round(x), z: Math.round(z), r })
      placed++
    }
  }
  return out
}

export function garrisonFor(tier: number, capital: boolean, personality: string, neutral: boolean, rnd: () => number, survivalEnemy: boolean): Troops {
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

export function hslHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}
