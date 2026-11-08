import { BIOMES, type MapType } from './biomes'
import { PLAYER } from './engine'
import { mulberry32 } from './noise'
import type { CastleDef, Difficulty, FactionDef, GameRules, MapSize, Scenario, ScenarioDefinition, SiegeSide, Troops } from './types'
import { World } from './world'
import type { GeneratedMap } from './mapgen'

/**
 * Great Siege: a walled town around a citadel. Besiegers camp on every side
 * and break in through six outer gates; the town's districts are strongpoints
 * that defenders and attackers fight over street by street; four inner gates
 * guard the citadel.
 */

const TOWN_NAMES = ['Kaer Dunholm', 'Valdris', 'Stonereach', 'Highcrown', 'Ravenhold', 'Thornspire', 'Ironmere', 'Greywall']
const HOST_NAMES = ['The Crimson Host', 'The Iron Legion', 'The Grey Banner', 'The Wolf Host']
const LORDS = ['Baron Edric', 'Count Lothar', 'Lady Brienne', 'Sir Godwin', 'Duke Aldous', 'Margrave Ulf', 'Lady Ysolde', 'Sir Corwin', 'Earl Hadrian', 'Baron Osmund', 'Lady Maude', 'Sir Tristan']
const DISTRICTS = ['Market Square', 'Cathedral Close', 'Guildhall', "Smiths' Row", 'Granary Quarter', 'Old Barracks']
const COMPASS = ['East', 'South-East', 'South-West', 'West', 'North-West', 'North-East']

export const SIEGE_TIME_LIMIT = 20 * 60

/** Siege size presets; medium is the original town. */
export const SIEGE_SIZES: Record<MapSize, { gates: number; inner: number; district: number; outer: number; camps: number; defLords: number; map: number; minutes: number; campDist: number; hostStrength: number }> = {
  small: { gates: 4, inner: 180, district: 360, outer: 560, camps: 3, defLords: 2, map: 2200, minutes: 15, campDist: 920, hostStrength: 1.3 },
  medium: { gates: 6, inner: 210, district: 430, outer: 680, camps: 5, defLords: 3, map: 2600, minutes: 20, campDist: 1080, hostStrength: 1 },
  large: { gates: 8, inner: 240, district: 520, outer: 840, camps: 7, defLords: 4, map: 3200, minutes: 25, campDist: 1300, hostStrength: 1.04 },
}

const g = (inf = 0, cav = 0, arch = 0, eng = 0): Troops => ({ infantry: inf, cavalry: cav, archers: arch, engineers: eng })

export function generateSiege(side: SiegeSide, seed: number, mapType: MapType, difficulty: Difficulty, mapSize: MapSize = 'medium'): GeneratedMap {
  const rnd = mulberry32(seed)
  const R = (a: number, b: number) => a + rnd() * (b - a)
  const P = SIEGE_SIZES[mapSize]
  const TOWN = { inner: P.inner, district: P.district, outer: P.outer }
  const N = P.gates
  const size = P.map
  const rot = rnd() * Math.PI * 2
  const at = (r: number, ang: number): [number, number] => [Math.round(Math.cos(ang) * r), Math.round(Math.sin(ang) * r)]
  const townName = TOWN_NAMES[Math.floor(rnd() * TOWN_NAMES.length)]
  const hostName = HOST_NAMES[Math.floor(rnd() * HOST_NAMES.length)]
  const lords = [...LORDS].sort(() => rnd() - 0.5)

  const defTeam = side === 'defend' ? 'A' : 'B'
  const atkTeam = side === 'defend' ? 'B' : 'A'
  const opp = difficulty === 'easy' ? 0.8 : difficulty === 'hard' ? 1.3 : 1
  const defMult = side === "defend" ? 0.9 : opp * 1.05 * (mapSize === "large" ? 1.12 : 1)
  const atkMult = (side === 'attack' ? 1 : opp) * P.hostStrength

  // NPC leaders run the siege on both sides; the player is one lord among many.
  const defLeader = 'town'
  const atkLeader = 'host'
  const factions: FactionDef[] = [
    { id: defLeader, name: `Lord of ${townName}`, color: side === 'defend' ? '#1f8a8a' : '#8f1d1d', team: defTeam, leader: true, personality: 'defensive' },
    { id: atkLeader, name: hostName, color: side === 'attack' ? '#1f8a8a' : '#8f1d1d', team: atkTeam, leader: true, personality: 'aggressive' },
  ]
  const defColors = side === 'defend' ? ['#2f63c4', '#2a9d6f', '#3a7ca5', '#5a8f3a'] : ['#a3271d', '#9a3412', '#7c2d92', '#b45309']
  const atkColors = side === 'attack' ? ['#2f63c4', '#2a9d6f', '#3a7ca5', '#5a8f3a', '#4f7fa8', '#6a9a4a', '#2f7f6f'] : ['#a3271d', '#9a3412', '#7c2d92', '#b45309', '#8a3a5a', '#a35a1d', '#6e2a2a']
  const defLords = Array.from({ length: P.defLords }, (_, i) => i).map((i) => ({ id: side === 'defend' && i === 0 ? PLAYER : `d${i}`, name: side === 'defend' && i === 0 ? 'Your household' : `${lords.pop()} of ${townName}`, color: defColors[i] }))
  const atkLords = Array.from({ length: P.camps - 1 }, (_, i) => i).map((i) => ({ id: side === 'attack' && i === 0 ? PLAYER : `h${i}`, name: side === 'attack' && i === 0 ? 'Your household' : lords.pop()!, color: atkColors[i] }))
  for (const l of defLords) factions.push({ id: l.id, name: l.name, color: l.color, team: defTeam, personality: 'balanced' })
  for (const l of atkLords) factions.push({ id: l.id, name: l.name, color: l.color, team: atkTeam, personality: 'aggressive' })

  const castles: CastleDef[] = []
  const scale = (t: Troops, m: number): Troops => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v * m)]))
  const outerGates = Array.from({ length: N }, (_, k) => rot + (k / N) * Math.PI * 2)
  const innerGates = [0, 1, 2, 3].map((k) => rot + Math.PI / 6 + (k / 4) * Math.PI * 2)
  // Sector owner for each sixth of the town.
  const sectorOwner = (k: number) => defLords[k % defLords.length].id

  castles.push({ id: 'keep', name: `Citadel of ${townName}`, subtitle: 'The Citadel', faction: defLeader, tier: 4, x: 0, z: 0, capital: true, garrison: scale(g(700, 100, 300, 0), defMult) })
  innerGates.forEach((a, k) => {
    const [x, z] = at(TOWN.inner, a)
    castles.push({ id: `igate${k}`, name: `${['Lion', 'Bell', 'Iron', 'Queen'][k]} Gate`, subtitle: 'Citadel Gate', faction: defLeader, tier: 2, x, z, gate: true, garrison: scale(g(170, 0, 120, 0), defMult) })
  })
  outerGates.forEach((a, k) => {
    const [x, z] = at(TOWN.outer, a)
    const half = Math.PI / N
    castles.push({ id: `gate${k}`, name: `${COMPASS[k % COMPASS.length]}${k >= COMPASS.length ? ' Lesser' : ''} Gate`, subtitle: 'Town Gate', faction: sectorOwner(k), tier: 2, x, z, gate: true, garrison: scale(g(150, 0, 130, 0), defMult) })
    const [tx, tz] = at(TOWN.outer, a + half)
    castles.push({ id: `tower${k}`, name: `${COMPASS[k % COMPASS.length]}${k >= COMPASS.length ? ' Lesser' : ''} Tower`, subtitle: 'Wall Tower', faction: sectorOwner(k), tier: 1, x: tx, z: tz, tower: true, garrison: scale(g(40, 0, 100, 0), defMult) })
    const [dx, dz] = at(TOWN.district, a + half)
    castles.push({ id: `district${k}`, name: DISTRICTS[k % DISTRICTS.length] + (k >= DISTRICTS.length ? ' East' : ''), subtitle: 'Town District', faction: sectorOwner(k), tier: 1, x: dx, z: dz, district: true, garrison: scale(g(190, 40, 90, 0), defMult) })
  })

  // Besiegers camp on every side.
  const campOwners = [atkLeader, ...atkLords.map((l) => l.id)]
  campOwners.forEach((owner, i) => {
    const ang = rot + Math.PI / N + (i / campOwners.length) * Math.PI * 2 + R(-0.15, 0.15)
    const [x, z] = at(P.campDist, ang)
    const big = i === 0
    castles.push({
      id: `camp${i}`,
      name: big ? 'Grand Camp' : `Camp of ${factions.find((f) => f.id === owner)!.name.split(' ').pop()}`,
      subtitle: 'Siege Camp',
      faction: owner,
      tier: 2,
      x,
      z,
      staging: true,
      capital: big,
      garrison: scale(big ? g(1900, 600, 700, 110) : g(1150, 350, 440, 55), atkMult),
    })
  })

  const B = BIOMES[mapType]
  const mountains: ScenarioDefinition['mountains'] = []
  for (let i = 0; i < 6; i++) {
    const ang = rnd() * Math.PI * 2
    mountains.push({ x: Math.round(Math.cos(ang) * R(P.campDist + 80, P.campDist + 170)), z: Math.round(Math.sin(ang) * R(P.campDist + 80, P.campDist + 170)), r: R(120, 200), h: R(B.gen.mountainHeight[0] * 0.7, B.gen.mountainHeight[1] * 0.8) })
  }
  const definition: ScenarioDefinition = {
    start: { gold: 900, enemy_gold: 600 },
    victory: { capture: 'keep' },
    defeat: { lose: 'keep' },
    factions: [...factions, { id: 'neutral', name: 'None', color: '#a08a56', team: 'N' }],
    castles,
    rivers: [],
    bridges: [],
    mountains,
    lakes: [],
    forest_density: Math.min(0.4, B.gen.forest[0]),
    walls: [
      { x: 0, z: 0, r: TOWN.inner, gates: innerGates, height: 20 },
      { x: 0, z: 0, r: TOWN.outer, gates: outerGates, height: 17 },
    ],
    town: { x: 0, z: 0, r: TOWN.outer - 25, inner: TOWN.inner + 30, streets: [...outerGates, ...innerGates] },
    biome: mapType,
  }
  const camps = castles.filter((c) => c.id.startsWith('camp')).map((c) => c.id)
  const rules: GameRules =
    side === 'defend'
      ? { mode: 'siege', victoryCastles: camps, defeatCastles: ['keep'], defeatOnEliminated: false, timeLimit: P.minutes * 60, timeoutWinner: 'A', siegeSide: side, deployPending: true, size: mapSize }
      : { mode: 'siege', victoryCastles: ['keep'], defeatCastles: [], defeatOnEliminated: false, timeLimit: P.minutes * 60, timeoutWinner: 'B', siegeSide: side, deployPending: true, size: mapSize }
  const scenario: Scenario = {
    key: `siege-${side}-${mapType}-${mapSize}-${seed}`,
    name: `Siege of ${townName}`,
    description:
      side === 'defend'
        ? `${hostName} surrounds ${townName} from every side. You are one of the town's lords: hold your quarter, help where the line breaks, and keep the citadel standing for ${P.minutes} minutes.`
        : `${hostName} has come to take ${townName}. You are one of its lords with your own camp: break in where you see a chance and help the host take the citadel within ${P.minutes} minutes.`,
    seed,
    map_size: size,
    definition,
  }
  const world = new World(scenario)
  return { scenario, rules, world }
}
