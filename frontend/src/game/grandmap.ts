import { PLAYER } from './engine'
import type { GeneratedMap } from './mapgen'
import { PREFIX, REALMS, SUFFIX, TITLES, garrisonFor, hslHex, placeFeatures } from './mapgen'
import { layRoyalCity } from './nightmap'
import { mulberry32 } from './noise'
import type { CastleDef, CityWall, FactionDef, Rampart, Scenario, ScenarioDefinition, Team, TownDef, WarTeam } from './types'
import { World, distToSegment, holdingRadius } from './world'

/**
 * The War of the Three Crowns: a continent with three walled royal cities in a great triangle (the
 * King's in the west, the Usurper Queen's in the north, the Sun Emperor's in the east), each ringed
 * by the castles of its vassal lords, and between them the contested heartland: three rivers running
 * out from the heart along the borders, mountain ranges beside them broken by passes, free towns,
 * and at the very centre the ruined crossroads fortress of the old empire inside its broken walls.
 *
 * North is -z; an angle a points at (cos a, sin a) in x, z.
 */
export const GRAND = {
  size: 7200,
  /** The royal cities: their walls (smaller than the Long Night's single great city). */
  inner: 500,
  outer: 880,
  /** How far from the heart of the map the cities stand (share of the half-size). */
  ring: 0.56,
  /** Vassal lords per realm. */
  vassals: 3,
}

/** Where each crown sits (the direction from the heart of the map), and who holds it. */
export const CROWNS: Record<WarTeam, { angle: number; id: string; keep: string; prefix: string }> = {
  A: { angle: (5 * Math.PI) / 6, id: PLAYER, keep: 'keep', prefix: '' },
  B: { angle: -Math.PI / 2, id: 'B0', keep: 'keepB', prefix: 'b-' },
  C: { angle: Math.PI / 6, id: 'C0', keep: 'keepC', prefix: 'c-' },
}

const CITY_NAMES: Record<WarTeam, string[]> = {
  A: ['Aldmoor', 'Kingsreach', 'Valdris', 'Highcrown', 'Stonegarde', 'Aurelmont'],
  B: ['Thornholt', 'Morwenhal', 'Ravenspire', 'Blackthorn', 'Wintermere', 'Gravenor'],
  C: ['Solaris', 'Aurumgard', 'Helion', 'Dawnspire', 'Ambercrest', 'Sunhallow'],
}

export function generateGrandMap(seed: number): GeneratedMap {
  for (let attempt = 0; attempt < 10; attempt++) {
    const out = tryGrand(seed + attempt * 7919)
    if (out) return out
  }
  throw new Error('Could not lay out the continent. Try another map.')
}

function tryGrand(seed: number): GeneratedMap | null {
  const rnd = mulberry32(seed)
  const R = (a: number, b: number) => a + rnd() * (b - a)
  const size = GRAND.size
  const half = size / 2
  const margin = 360
  const inside = (x: number, z: number, m = margin) => Math.abs(x) < half - m && Math.abs(z) < half - m
  const at = (r: number, a: number, ox = 0, oz = 0): [number, number] => [Math.round(ox + Math.cos(a) * r), Math.round(oz + Math.sin(a) * r)]

  const castles: CastleDef[] = []
  const walls: CityWall[] = []
  const towns: TownDef[] = []
  const mountains: ScenarioDefinition['mountains'] = []
  const rivers: ScenarioDefinition['rivers'] = []
  const lakes: ScenarioDefinition['lakes'] = []
  const roads: { width: number; points: [number, number][] }[] = []
  const bridges: { x: number; z: number; ford?: boolean }[] = []
  const ramparts: Rampart[] = []
  const factions: FactionDef[] = []
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
  const realmPool = [...REALMS].sort(() => rnd() - 0.5)
  const realmName = () => `${TITLES[Math.floor(rnd() * TITLES.length)]} ${realmPool.pop() ?? 'Nowhere'}`
  const personality = (): FactionDef['personality'] => (['aggressive', 'balanced', 'defensive'] as const)[Math.floor(rnd() * 3)]

  // --- The three royal cities --------------------------------------------------------------------
  const centres: Record<WarTeam, [number, number]> = { A: [0, 0], B: [0, 0], C: [0, 0] }
  const cityNames: Record<WarTeam, string> = { A: '', B: '', C: '' }
  for (const team of ['A', 'B', 'C'] as const) {
    const cr = CROWNS[team]
    const [cx, cz] = at(half * GRAND.ring, cr.angle + R(-0.04, 0.04))
    centres[team] = [cx, cz]
    const city = CITY_NAMES[team][Math.floor(rnd() * CITY_NAMES[team].length)]
    cityNames[team] = city
    const lay = layRoyalCity({
      rnd,
      cx,
      cz,
      back: cr.angle,
      faction: cr.id,
      idPrefix: cr.prefix,
      city,
      keepId: cr.keep,
      keepSubtitle: team === 'A' ? "The King's Citadel" : team === 'B' ? "The Usurper's Citadel" : "The Sun Emperor's Citadel",
      inner: GRAND.inner,
      outer: GRAND.outer,
      wallIndex: walls.length,
      garrison: team === 'A' ? 0.8 : 0.85,
    })
    for (const c of lay.castles) names.add(c.name)
    castles.push(...lay.castles)
    walls.push(...lay.walls)
    towns.push(lay.town)
    // Mountains at its back, close under the outer wall.
    for (let k = -3; k <= 3; k++) {
      const a = cr.angle + k * 0.26
      const [x, z] = at(lay.rOuter(a) + 300 + R(-20, 60), a, cx, cz)
      if (inside(x, z, 120)) mountains.push({ x, z, r: R(220, 300), h: R(160, 230) })
    }
  }

  // --- The heartland: the old empire's crossroads fortress in its broken walls ----------------
  castles.push({ id: 'heart', name: 'Imperial Crossroads', subtitle: 'Ruin of the Old Empire', faction: 'neutral', tier: 4, x: 0, z: 0, garrison: { infantry: 520, archers: 260, cavalry: 80, engineers: 0 } })
  names.add('Imperial Crossroads')
  {
    // The old imperial wall: a ring round the heart, a gate facing each realm, breaches between.
    const rr = 720
    const pts: [number, number][] = []
    for (let k = 0; k <= 48; k++) {
      const a = (k / 48) * Math.PI * 2
      pts.push(at(rr + Math.sin(a * 3 + 0.7) * 30, a))
    }
    const gates: Rampart['gates'] = []
    for (const team of ['A', 'B', 'C'] as const) {
      const [x, z] = at(rr + Math.sin(CROWNS[team].angle * 3 + 0.7) * 30, CROWNS[team].angle)
      gates.push({ x, z })
      const [bx, bz] = at(rr + Math.sin((CROWNS[team].angle + Math.PI / 3) * 3 + 0.7) * 30, CROWNS[team].angle + Math.PI / 3)
      gates.push({ x: bx, z: bz, breach: true })
    }
    ramparts.push({ points: pts, width: 14, height: 18, gates })
  }

  // --- Three rivers from the heart along the borders between the realms -------------------------
  const borders = [CROWNS.A.angle + Math.PI / 3, CROWNS.B.angle + Math.PI / 3, CROWNS.C.angle + Math.PI / 3].map((a) => Math.atan2(Math.sin(a), Math.cos(a)))
  for (const ba of borders) {
    const pts: [number, number][] = []
    let drift = 0
    for (let k = 0; k <= 16; k++) {
      const r = 900 + (k / 16) * (half * 1.5 - 900)
      drift = drift * 0.8 + R(-0.06, 0.06)
      pts.push(at(r, ba + drift + Math.sin(k * 0.7) * 0.05))
    }
    rivers.push({ width: R(46, 54), points: pts })
    // Crossings: a bridge, a ford, a bridge, a ford along it.
    const lens = pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]))
    const total = lens.reduce((a, b) => a + b, 0)
    for (const [t, ford] of [[0.08, false], [0.24, true], [0.4, false], [0.58, true], [0.74, false]] as [number, boolean][]) {
      let d = t * total
      for (let k = 0; k < lens.length; k++) {
        if (d > lens[k]) {
          d -= lens[k]
          continue
        }
        const x = pts[k][0] + ((pts[k + 1][0] - pts[k][0]) * d) / lens[k]
        const z = pts[k][1] + ((pts[k + 1][1] - pts[k][1]) * d) / lens[k]
        if (inside(x, z, 160)) bridges.push(ford ? { x, z, ford: true } : { x, z })
        break
      }
    }
    // Mountain ranges along the river (both banks), broken by passes at the crossings.
    for (let r = 1100; r < half * 1.35; r += 230) {
      for (const side of [-1, 1]) {
        const a = ba + side * (430 / r) + R(-0.02, 0.02)
        const [x, z] = at(r + R(-60, 60), a)
        if (!inside(x, z, 140)) continue
        if (bridges.some((b) => Math.hypot(b.x - x, b.z - z) < 480)) continue
        if (rnd() < 0.35) continue
        mountains.push({ x, z, r: R(170, 260), h: R(120, 200) })
      }
    }
  }

  const riverDist = (x: number, z: number) => {
    let best = Infinity
    for (const r of rivers) for (let k = 0; k < r.points.length - 1; k++) best = Math.min(best, distToSegment(x, z, r.points[k][0], r.points[k][1], r.points[k + 1][0], r.points[k + 1][1]) - r.width / 2)
    return best
  }
  const clear = (x: number, z: number, r: number) =>
    inside(x, z) &&
    riverDist(x, z) > r + 120 &&
    !mountains.some((m) => Math.hypot(x - m.x, z - m.z) < m.r * 1.1 + r) &&
    !lakes.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + r + 100) &&
    !towns.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r + 260) &&
    Math.hypot(x, z) > 720 + r + 80 &&
    castles.every((c) => Math.hypot(c.x - x, c.z - z) > holdingRadius(c) + r + 340)

  // --- The realms: the crown and its vassal lords ---------------------------------------------
  const realmColor: Record<WarTeam, string> = { A: '#2f63c4', B: '#8f1d1d', C: '#c8901a' }
  const vassalHue: Record<WarTeam, number[]> = { A: [195, 165, 215], B: [340, 290, 15], C: [40, 25, 55] }
  const crownName: Record<WarTeam, string> = { A: `Kingdom of ${cityNames.A}`, B: `Dominion of ${cityNames.B}`, C: `Sun Empire of ${cityNames.C}` }
  for (const team of ['A', 'B', 'C'] as const) {
    const cr = CROWNS[team]
    factions.push({ id: cr.id, name: crownName[team], color: realmColor[team], team: team as Team, leader: team !== 'A', musters: team !== 'A', personality: team === 'C' ? 'balanced' : 'aggressive' })
    const [cx, cz] = centres[team]
    const front = cr.angle + Math.PI
    // The vassals' seats round the city, toward the heart and the flanks (never behind, at the edge).
    const offsets = [-0.95, 0, 0.95, -1.7, 1.7]
    let made = 0
    for (const off of offsets) {
      if (made >= GRAND.vassals) break
      let seat: [number, number] | null = null
      for (let tries = 0; tries < 30 && !seat; tries++) {
        const [x, z] = at(R(1350, 1750), front + off + R(-0.18, 0.18), cx, cz)
        if (clear(x, z, 80)) seat = [x, z]
      }
      if (!seat) continue
      const vid = `${team}${made + 1}`
      const hue = vassalHue[team][made % 3] + R(-8, 8)
      factions.push({ id: vid, name: realmName(), color: hslHex(hue, R(0.45, 0.62), R(0.34, 0.46)), team: team as Team, personality: personality(), musters: false })
      castles.push({ id: `${vid}-seat`, name: castleName(), subtitle: 'Seat of the Realm', faction: vid, tier: 3, x: seat[0], z: seat[1], capital: true, garrison: garrisonFor(3, true, 'balanced', false, rnd, false) })
      // A lesser castle beside the seat, a little further out toward the heart or the flank.
      for (let tries = 0; tries < 30; tries++) {
        const [x, z] = at(R(520, 760), Math.atan2(seat[1] - cz, seat[0] - cx) + R(-1.2, 1.2), seat[0], seat[1])
        if (!clear(x, z, 60)) continue
        const tier = rnd() < 0.4 ? 2 : 1
        castles.push({ id: `${vid}-c`, name: castleName(), subtitle: tier === 2 ? 'Keep' : 'Watchtower', faction: vid, tier, x, z, garrison: garrisonFor(tier, false, 'balanced', false, rnd, false) })
        break
      }
      made++
    }
    if (made < 2) return null
    // The crown's own march castle toward the heart.
    for (let tries = 0; tries < 30; tries++) {
      const [x, z] = at(R(1150, 1350), front + R(-0.35, 0.35), cx, cz)
      if (!clear(x, z, 70)) continue
      castles.push({ id: `${cr.id}-march`, name: castleName(), subtitle: 'March Fortress', faction: cr.id, tier: 3, x, z, staging: team !== 'A', garrison: garrisonFor(3, false, 'aggressive', false, rnd, false) })
      break
    }
    // Roads: from the city's front to the heart of the map.
    const [gx, gz] = at(GRAND.outer + 60, front, cx, cz)
    const [hx, hz] = at(760, cr.angle)
    roads.push({ width: 22, points: [[gx, gz], [Math.round((gx + hx) / 2 + R(-80, 80)), Math.round((gz + hz) / 2 + R(-80, 80))], [hx, hz]] })
  }
  factions.push({ id: 'neutral', name: 'Free Towns', color: '#a08a56', team: 'N' })

  // A few lakes in the heartland and the borderlands: only on open ground, well clear of the
  // royal cities, every castle, the rivers and the old imperial walls (never lapping at a wall).
  for (let tries = 0, made = 0; tries < 400 && made < 3; tries++) {
    const lr = R(110, 170)
    const [x, z] = at(R(1000, half * 0.85), R(0, Math.PI * 2))
    if (!inside(x, z, lr + 200)) continue
    if (Math.hypot(x, z) < 720 + lr + 160) continue
    if (towns.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + lr + 320)) continue
    if (castles.some((c) => Math.hypot(c.x - x, c.z - z) < holdingRadius(c) + lr + 260)) continue
    if (riverDist(x, z) < lr + 160) continue
    if (mountains.some((m) => Math.hypot(m.x - x, m.z - z) < m.r + lr + 60)) continue
    lakes.push({ x, z, r: lr })
    made++
  }

  // --- Free towns in the heartland and along the borders ----------------------------------------
  let free = 0
  for (let tries = 0; tries < 900 && free < 9; tries++) {
    const a = R(0, Math.PI * 2)
    const r = R(950, half * 0.95)
    const [x, z] = at(r, a)
    if (!clear(x, z, 60)) continue
    // Toward the borders, between the realms.
    const nearBorder = borders.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.45)
    if (!nearBorder && r > 1500) continue
    const tier = rnd() < 0.35 ? 2 : 1
    castles.push({ id: `n${free}`, name: castleName(), subtitle: tier === 2 ? 'Free Town' : 'Free Hold', faction: 'neutral', tier, x, z, garrison: garrisonFor(tier, false, 'balanced', true, rnd, false) })
    free++
  }

  // Bridges where the roads cross the rivers.
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

  const definition: ScenarioDefinition = {
    start: { gold: 1400, enemy_gold: 400 },
    victory: { capture: CROWNS.B.keep },
    defeat: { lose: 'keep' },
    factions,
    castles,
    rivers,
    bridges,
    mountains,
    lakes,
    forest_density: 0.5,
    walls,
    towns,
    ramparts,
    roads,
    biome: 'continent',
  }
  const scenario: Scenario = {
    key: `grand-${seed}`,
    name: `War of the Three Crowns · ${cityNames.A}`,
    description: `${cityNames.A}, ${cityNames.B} and ${cityNames.C}: three crowns, one continent.`,
    seed,
    map_size: size,
    definition,
  }
  const world = new World(scenario)
  // Every castle must be reachable by land from the King's Citadel.
  const home = castles.find((c) => c.id === 'keep')!
  if (!castles.every((c) => world.connected(home.x, home.z, c.x, c.z))) return null
  definition.features = placeFeatures(world, castles, rnd)
  return {
    scenario,
    world,
    rules: { mode: 'grand', victoryCastles: [], defeatCastles: ['keep'], defeatOnEliminated: true, size: 'large' },
  }
}
