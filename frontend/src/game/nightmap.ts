import { PLAYER } from './engine'
import type { GeneratedMap } from './mapgen'
import { mulberry32 } from './noise'
import type { CastleDef, Difficulty, FactionDef, Scenario, ScenarioDefinition, Troops } from './types'
import { ROYAL_SEAT_TIER, World, castleRadius } from './world'

/**
 * The Long Night: the Sovereign's royal city. A citadel at the heart; an inner wall with three
 * gates round the royal quarter; a great outer wall with five gatehouses round the lower city,
 * thousands of houses between; wards (strongholds) in both rings. The river curls round its
 * southern foot, the mountains guard its back (north-east). Beyond the farmland and the villages,
 * the rifts of the Endless Night open at the edges of the vale.
 *
 * North is -z; an angle a points at (cos a, sin a) in x, z.
 */
export const NIGHT = {
  size: 5600,
  inner: 560,
  outer: 1050,
  /** Minutes until dawn, by difficulty. */
  minutes: { easy: 5, normal: 6, hard: 7, brutal: 8 } as Record<Difficulty, number>,
}

const g = (inf = 0, cav = 0, arch = 0, eng = 0): Troops => ({ infantry: inf, cavalry: cav, archers: arch, engineers: eng })
const CITY = ['Aldmoor', 'Kingsreach', 'Valdris', 'Highcrown', 'Stonegarde', 'Aurelmont']

export function generateNightMap(seed: number, difficulty: Difficulty = 'normal'): GeneratedMap {
  for (let attempt = 0; attempt < 8; attempt++) {
    const out = tryNight(seed + attempt * 7919, difficulty)
    if (out) return out
  }
  throw new Error('Could not lay out the royal city. Try another map.')
}

function tryNight(seed: number, difficulty: Difficulty): GeneratedMap | null {
  const rnd = mulberry32(seed)
  const R = (a: number, b: number) => a + rnd() * (b - a)
  const size = NIGHT.size
  const half = size / 2
  const city = CITY[Math.floor(rnd() * CITY.length)]
  // The city stands off to one side of the vale (north-east, south-west or south-east), its back to the
  // mountains in that corner, its face to the open land where the rifts are.
  const corner = ([[1, -1], [-1, 1], [1, 1]] as const)[Math.floor(rnd() * 3)]
  const cx = Math.round(corner[0] * half * 0.33)
  const cz = Math.round(corner[1] * half * 0.33)
  const back = Math.atan2(corner[1], corner[0])
  const front = back + Math.PI
  const at = (r: number, a: number, ox = cx, oz = cz): [number, number] => [Math.round(ox + Math.cos(a) * r), Math.round(oz + Math.sin(a) * r)]
  const angDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))

  // The walls follow the lie of the land: pulled in where the ground climbs to the mountains at
  // the back, bulging out over the lower ground in front, wandering in between.
  const outline = (base: number, wob: number) => {
    const p1 = R(0, 6.28)
    const p2 = R(0, 6.28)
    return (a: number) => base * (1 + wob * (0.55 * Math.sin(2 * a + p1) + 0.35 * Math.sin(3 * a + p2)) - 0.12 * Math.cos(a - back) * (wob / 0.18))
  }
  const rOuter = outline(NIGHT.outer, 0.18)
  const rInner = outline(NIGHT.inner, 0.12)
  const loop = (rf: (a: number) => number, n: number) => Array.from({ length: n }, (_, k) => at(rf((k / n) * Math.PI * 2), (k / n) * Math.PI * 2))
  const outerPts = loop(rOuter, 44)
  const innerPts = loop(rInner, 30)
  const maxOuter = Math.max(...outerPts.map(([x, z]) => Math.hypot(x - cx, z - cz)))
  const maxInner = Math.max(...innerPts.map(([x, z]) => Math.hypot(x - cx, z - cz)))
  // Gates face the open land; the inner ones sit between the outer.
  const outerGates = [0, 1, 2, 3, 4].map((k) => front - Math.PI * 0.45 + (k / 4) * Math.PI * 0.9 + R(-0.05, 0.05))
  const innerGates = [0, 1, 2].map((k) => front - Math.PI * 0.3 + (k / 2) * Math.PI * 0.6)
  // Gates sit on the wall's line (between two corners of the outline, on the chord).
  const onLoop = (pts: [number, number][], a: number): [number, number] => {
    const n = pts.length
    const t = ((((a / (Math.PI * 2)) % 1) + 1) % 1) * n
    const k = Math.floor(t) % n
    const f = t - Math.floor(t)
    const [x0, z0] = pts[k]
    const [x1, z1] = pts[(k + 1) % n]
    return [Math.round(x0 + (x1 - x0) * f), Math.round(z0 + (z1 - z0) * f)]
  }
  const castles: CastleDef[] = []
  castles.push({ id: 'keep', name: `${city} Citadel`, subtitle: "The Sovereign's Citadel", faction: PLAYER, tier: ROYAL_SEAT_TIER, x: cx, z: cz, capital: true, garrison: g(700, 180, 380, 60) })
  const COMPASS = (a: number) => {
    const names = ['East', 'South-East', 'South', 'South-West', 'West', 'North-West', 'North', 'North-East']
    return names[(Math.round((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8)]
  }
  const used = new Map<string, number>()
  const outerGatePts = outerGates.map((a, k) => {
    const [x, z] = onLoop(outerPts, a)
    // (Two gates on the same side: the second is the Lesser.)
    const base = COMPASS(a)
    used.set(base, (used.get(base) ?? 0) + 1)
    const nm = used.get(base)! > 1 ? `${base} Lesser` : base
    castles.push({ id: `og${k}`, name: `${nm} Gate`, subtitle: 'Gatehouse of the Outer Wall', faction: PLAYER, tier: 2, x, z, gate: true, garrison: g(130, 0, 120, 0) })
    return [x, z] as [number, number]
  })
  const innerGatePts = innerGates.map((a, k) => {
    const [x, z] = onLoop(innerPts, a)
    castles.push({ id: `ig${k}`, name: `${['Lion', 'Crown', 'Bell'][k]} Gate`, subtitle: 'Gatehouse of the Inner Wall', faction: PLAYER, tier: 2, x, z, gate: true, garrison: g(150, 0, 130, 0) })
    return [x, z] as [number, number]
  })
  // Wards: strongholds of the city that pay their way and raise men while they hold.
  const lower = [
    { id: 'w-market', name: 'Market Ward', subtitle: 'Merchants and their gold' },
    { id: 'w-smiths', name: "Smiths' Ward", subtitle: 'Forges and armouries' },
    { id: 'w-granary', name: 'Granary Ward', subtitle: 'The city’s stores' },
  ]
  lower.forEach((w, k) => {
    const a = (outerGates[k + 1] + outerGates[k + 2]) / 2 + R(-0.08, 0.08)
    const [x, z] = at((rInner(a) + rOuter(a)) / 2 + R(-20, 20), a)
    castles.push({ ...w, faction: PLAYER, tier: 2, x, z, district: true, garrison: g(120, 20, 70, 10) })
  })
  const upper = [
    { id: 'w-cathedral', name: 'Cathedral Close', subtitle: 'The great cathedral' },
    { id: 'w-barracks', name: 'Royal Barracks', subtitle: 'The Royal Guard’s halls' },
  ]
  upper.forEach((w, k) => {
    const a = front + (k === 0 ? -1.15 : 1.15)
    const [x, z] = at(rInner(a) * 0.64, a)
    castles.push({ ...w, faction: PLAYER, tier: 2, x, z, district: true, garrison: g(140, 30, 90, 10) })
  })

  // The river runs across the open land before the city, bridged twice and fordable once.
  const riverDist = maxOuter + 300
  const pts: [number, number][] = []
  const span = Math.PI * 0.62
  for (let k = -1; k <= 17; k++) {
    const a = front - span + (k / 16) * span * 2
    pts.push(at(riverDist + Math.sin(k * 0.8) * 50 + (k < 0 || k > 16 ? 900 : 0), a))
  }
  const crossings = [0.28, 0.52, 0.76].map((t, i) => {
    const a = front - span + t * span * 2
    const [x, z] = at(riverDist + Math.sin(t * 16 * 0.8) * 50, a)
    return i === 1 ? { x, z, ford: true } : { x, z }
  })
  // The mountains at its back, close under the wall, and up into the corner; a few hills before it.
  const mountains: ScenarioDefinition['mountains'] = []
  for (let k = -4; k <= 4; k++) {
    const a = back + k * 0.22
    const [x, z] = at(rOuter(a) + 330 + R(-30, 60), a)
    mountains.push({ x, z, r: R(240, 330), h: R(170, 240) })
  }
  for (let k = 0; k < 6; k++) {
    const a = front + R(-1.2, 1.2)
    const [x, z] = at(R(maxOuter + 800, maxOuter + 1500), a)
    if (Math.abs(x) < half - 250 && Math.abs(z) < half - 250) mountains.push({ x, z, r: R(140, 220), h: R(60, 110) })
  }
  // The Great Rift: one vast wound in the earth out on the open land before the city, a long
  // bowshot and more from its walls (the dead are at the gates within the first minute).
  const rd = Math.min(rOuter(front) + 950, Math.hypot(half, half))
  let rx = Math.round(cx + Math.cos(front) * rd)
  let rz = Math.round(cz + Math.sin(front) * rd)
  rx = Math.max(-(half - 380), Math.min(half - 380, rx))
  rz = Math.max(-(half - 380), Math.min(half - 380, rz))
  const rifts = [{ x: rx, z: rz, name: 'The Great Rift' }]
  void angDiff

  const factions: FactionDef[] = [
    { id: PLAYER, name: `Kingdom of ${city}`, color: '#2f63c4', team: 'A' },
    { id: 'night', name: 'The Endless Night', color: '#5b3a8a', team: 'B', leader: true, undying: true },
  ]
  const R0 = castleRadius(ROYAL_SEAT_TIER)
  // Streets: from each outer gate in to the nearest inner gate, and from the inner gates to the Citadel.
  const lanes: [number, number][][] = outerGatePts.map((p) => {
    const ig = innerGatePts.reduce((b, q) => (Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(b[0] - p[0], b[1] - p[1]) ? q : b), innerGatePts[0])
    return [p, ig]
  })
  for (const q of innerGatePts) lanes.push([q, [cx, cz]])
  const definition: ScenarioDefinition = {
    start: { gold: 1100, enemy_gold: 0 },
    victory: { capture: '' },
    defeat: { lose: 'keep' },
    factions,
    castles,
    rivers: [{ width: 54, points: pts }],
    bridges: crossings,
    mountains,
    lakes: [],
    forest_density: 0.4,
    walls: [
      { x: cx, z: cz, r: maxInner, gates: innerGates, height: 24, points: innerPts, gatePts: innerGatePts },
      { x: cx, z: cz, r: maxOuter, gates: outerGates, height: 21, points: outerPts, gatePts: outerGatePts },
    ],
    town: { x: cx, z: cz, r: maxOuter + 10, inner: R0 * 1.12, streets: [], poly: outerPts, lanes },
    biome: 'kingsvale',
  }
  const scenario: Scenario = {
    key: `nightfall-${seed}`,
    name: `The Long Night · ${city}`,
    description: `Hold ${city} until dawn.`,
    seed,
    map_size: size,
    definition,
  }
  const world = new World(scenario)
  // The dead must be able to reach the citadel from every rift (through the gates).
  for (const r of rifts) if (!world.connected(r.x, r.z, cx, cz)) return null
  return {
    scenario,
    world,
    rules: { mode: 'nightfall', victoryCastles: [], defeatCastles: ['keep'], defeatOnEliminated: false, timeLimit: NIGHT.minutes[difficulty] * 60, timeoutWinner: 'A', size: 'medium', night: { rifts } },
  }
}
