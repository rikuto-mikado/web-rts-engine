import { PLAYER } from './engine'
import type { GeneratedMap } from './mapgen'
import { mulberry32 } from './noise'
import type { CastleDef, ConvoyRules, Difficulty, FactionDef, Scenario, ScenarioDefinition, TerrainFeature } from './types'
import { World, castleRadius } from './world'

/**
 * Convoy Raid: the Greenwood Road. One road winds north from a caravanserai on open
 * fields, through deep forest, over a river (one bridge, fords up- and downstream) and
 * along a mountain's flank to a castle. The gold train runs it; raiders lie in the woods.
 *
 * North is -z, so the caravanserai sits at the bottom of the map and the castle at the top.
 */
export const CONVOY = {
  size: 3600,
  wagons: 5,
  every: 75,
  needed: 3,
  speed: 17,
  roadWidth: 30,
}

/** The escort's raiders' foe colours and names, by the side the player takes. */
const SIDES = {
  escort: {
    player: { name: "The Crown's Gold Train", color: '#2f63c4' },
    foe: { id: 'raiders', name: 'The Grey Hoods', color: '#9a3a2a' },
  },
  raid: {
    player: { name: "Ashe's Whisperers", color: '#2f8a5a' },
    foe: { id: 'train', name: "The Usurper's Gold Train", color: '#a3271d' },
  },
}

export interface ConvoyOptions {
  side: 'escort' | 'raid'
  commander: string
  difficulty?: Difficulty
}

export function generateConvoyMap(seed: number, opts: ConvoyOptions): GeneratedMap {
  for (let attempt = 0; attempt < 10; attempt++) {
    const out = tryConvoy(seed + attempt * 7919, opts)
    if (out) return out
  }
  throw new Error('Could not lay out the forest road. Try another map.')
}

/** Catmull-Rom through the control points, sampled about every `step` units. */
function smoothLine(ctrl: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)]
    const p1 = ctrl[i]
    const p2 = ctrl[i + 1]
    const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)]
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step))
    for (let k = 0; k < n; k++) {
      const t = k / n
      const t2 = t * t
      const t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  out.push(ctrl[ctrl.length - 1])
  return out
}

function tryConvoy(seed: number, opts: ConvoyOptions): GeneratedMap | null {
  const rnd = mulberry32(seed)
  const size = CONVOY.size
  const half = size / 2
  const south = half - 230
  const north = -(half - 230)

  // --- The road: a gentle S through the forest. ---
  const amp = 300 + rnd() * 140
  const phase = rnd() * Math.PI * 2
  const ctrl: [number, number][] = []
  const N = 10
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const z = south + (north - south) * t
    // Straight out of the caravanserai and into the castle; winding between.
    const k = Math.sin(Math.PI * t)
    const x = Math.sin(phase + t * Math.PI * 2.2) * amp * k + (rnd() - 0.5) * 110 * k
    ctrl.push([x, z])
  }
  const road = smoothLine(ctrl, 30)
  const xAt = (z: number) => {
    let best = road[0]
    for (const p of road) if (Math.abs(p[1] - z) < Math.abs(best[1] - z)) best = p
    return best[0]
  }

  // --- The river, a little south of the middle. ---
  const riverZ = 150 + rnd() * 180
  const rPhase = rnd() * 6.28
  const riverPts: [number, number][] = []
  for (let x = -half - 40; x <= half + 40; x += 120) riverPts.push([x, riverZ + Math.sin(x * 0.0021 + rPhase) * 80 + Math.sin(x * 0.006) * 20])
  const riverAt = (x: number) => {
    for (let i = 0; i < riverPts.length - 1; i++) {
      const [ax, az] = riverPts[i]
      const [bx, bz] = riverPts[i + 1]
      if (x >= ax && x <= bx) return az + ((bz - az) * (x - ax)) / (bx - ax)
    }
    return riverZ
  }
  // Where the road meets the river: the bridge.
  let cross = 0
  for (let i = 1; i < road.length; i++) {
    const s0 = road[i - 1][1] - riverAt(road[i - 1][0])
    const s1 = road[i][1] - riverAt(road[i][0])
    if (s0 > 0 && s1 <= 0) {
      cross = i
      break
    }
  }
  if (!cross) return null
  const bridge: [number, number] = [(road[cross - 1][0] + road[cross][0]) / 2, riverAt((road[cross - 1][0] + road[cross][0]) / 2)]
  // Rejoin the road about 150 past the river.
  let rejoin = cross
  while (rejoin < road.length - 1 && Math.hypot(road[rejoin][0] - bridge[0], road[rejoin][1] - bridge[1]) < 150) rejoin++
  // Fords up- and downstream: the long way round for wagons when the bridge is down.
  const fordSide = rnd() < 0.5 ? -1 : 1
  const fords: [number, number][] = []
  for (const [dx, s] of [[520 + rnd() * 160, fordSide], [900 + rnd() * 200, -fordSide]] as const) {
    const fx = bridge[0] + dx * s
    if (Math.abs(fx) < half - 220) fords.push([fx, riverAt(fx)])
  }

  // --- A mountain on one flank of the road in the north. ---
  const mz = -520 - rnd() * 260
  const mSide = rnd() < 0.5 ? -1 : 1
  const mr = 240 + rnd() * 60
  const mountains = [{ x: xAt(mz) + mSide * (mr * 1.18 + 40), z: mz, r: mr, h: 85 + rnd() * 25 }]
  // A lower hill across the road, further south in the forest.
  const hz = 600 + rnd() * 200
  mountains.push({ x: xAt(hz) - mSide * (190 * 1.25 + 60), z: hz, r: 190, h: 45 })

  // --- Castles: the caravanserai (south) and the castle (north). ---
  const sides = SIDES[opts.side]
  const escortId = opts.side === 'escort' ? PLAYER : sides.foe.id
  const castles: CastleDef[] = [
    { id: 'c0', name: 'Highwold', subtitle: 'The Road\'s End', faction: escortId, tier: 3, x: road[road.length - 1][0], z: north - castleRadius(3) * 0.2, capital: true, garrison: { infantry: 260, archers: 140 } },
    { id: 'c1', name: 'Saffron Caravanserai', subtitle: 'Where the gold sets out', faction: escortId, tier: 2, x: road[0][0], z: south + 60, village: true, holding: 'caravanserai', garrison: { infantry: 40 } },
  ]
  // The road runs right up to the castle gate and out of the caravanserai.
  road[road.length - 1] = [castles[0].x, castles[0].z]

  // --- The raiders' hidden camps: deep in the trees, off the road. ---
  const camps: [number, number][] = []
  const at = [0.3, 0.5, 0.7]
  at.forEach((t, k) => {
    const i = Math.floor(road.length * t)
    const [x, z] = road[i]
    const [nx, nz] = road[Math.min(road.length - 1, i + 1)]
    const len = Math.hypot(nx - x, nz - z) || 1
    const side = k % 2 === 0 ? -1 : 1
    const off = 380 + rnd() * 160
    camps.push([x + (-(nz - z) / len) * off * side, z + ((nx - x) / len) * off * side])
  })

  // Thickets beside the road (not on it: wagons can hardly get through windfall).
  const features: TerrainFeature[] = []
  for (let k = 0; k < 9; k++) {
    const i = Math.floor(road.length * (0.18 + rnd() * 0.66))
    const [x, z] = road[i]
    const s = rnd() < 0.5 ? -1 : 1
    const d = 110 + rnd() * 160
    features.push({ kind: 'thicket', x: x + s * d, z: z + (rnd() - 0.5) * 80, r: 40 + rnd() * 30 })
  }
  for (let k = 0; k < 4; k++) {
    const m = mountains[0]
    const a = rnd() * 6.28
    features.push({ kind: 'crag', x: m.x + Math.cos(a) * m.r * 1.15, z: m.z + Math.sin(a) * m.r * 1.15, r: 30 + rnd() * 20 })
  }

  const factions: FactionDef[] = [
    { id: PLAYER, name: sides.player.name, color: sides.player.color, team: 'A' },
    { id: sides.foe.id, name: sides.foe.name, color: sides.foe.color, team: 'B', leader: true },
  ]
  const definition: ScenarioDefinition = {
    start: { gold: opts.side === 'escort' ? 900 : 700, enemy_gold: opts.side === 'escort' ? 700 : 900 },
    victory: { capture: '' },
    defeat: { lose: '' },
    factions,
    castles,
    rivers: [{ width: 46, points: riverPts }],
    bridges: fords.map(([x, z]) => ({ x, z, ford: true })),
    mountains,
    lakes: [],
    forest_density: 0.92,
    features: features.filter((f) => !road.some(([x, z]) => Math.hypot(x - f.x, z - f.z) < f.r + 40)),
    biome: 'greenwood',
    roads: [{ width: CONVOY.roadWidth, points: road }],
    clearings: [
      { x: castles[1].x, z: castles[1].z, r: 420 },
      { x: bridge[0], z: bridge[1], r: 130 },
      ...camps.map(([x, z]) => ({ x, z, r: 46 })),
    ],
  }
  const scenario: Scenario = {
    key: `convoy-${seed}`,
    name: 'The Greenwood Road',
    description: 'Convoy Raid',
    seed,
    map_size: size,
    definition,
  }
  const world = new World(scenario)
  // The road must be passable all the way (bar the river, where the bridge goes).
  for (let i = 0; i < road.length; i += 2) {
    const [x, z] = road[i]
    if (Math.abs(i - cross) < 4) continue
    if (castles.some((c) => Math.hypot(c.x - x, c.z - z) < castleRadius(c.tier) * 1.4)) continue
    if (!world.isPassable(x, z)) return null
  }
  for (const [x, z] of camps) if (!world.isPassable(x, z) || Math.abs(x) > half - 150) return null
  const convoy: ConvoyRules = {
    side: opts.side,
    commander: opts.commander,
    wagons: CONVOY.wagons,
    every: CONVOY.every,
    needed: CONVOY.needed,
    speed: CONVOY.speed,
    fromId: 'c1',
    toId: 'c0',
    road,
    bridge,
    rejoin,
    camps,
  }
  return { scenario, world, rules: { mode: 'convoy', victoryCastles: [], defeatCastles: [], defeatOnEliminated: false, size: 'medium', convoy } }
}
