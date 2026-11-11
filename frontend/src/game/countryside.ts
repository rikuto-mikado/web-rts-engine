import { mulberry32 } from './noise'
import { PREFIX, SUFFIX } from './mapgen'
import type { CastleDef, ResourceSite, Troops, HoldingKind } from './types'
import { holdingRadius, type World } from './world'

/**
 * The countryside between the castles: free villages (to win over or plunder)
 * and resource sites (forests to fell, mines to dig) worked by engineers.
 * Deterministic from the scenario seed, so every player sees the same land.
 */
/** Militia make-up of each kind of holding (kept here so map generation needs no engine import). */
const HOLDINGS_MIX: Record<HoldingKind, { infantry: number; cavalry: number; archers: number }> = {
  village: { infantry: 0.65, cavalry: 0, archers: 0.35 },
  caravanserai: { infantry: 0.5, cavalry: 0.2, archers: 0.3 },
  abbey: { infantry: 0.6, cavalry: 0, archers: 0.4 },
  keep: { infantry: 0.4, cavalry: 0.4, archers: 0.2 },
  guildhall: { infantry: 0.6, cavalry: 0, archers: 0.4 },
}

export function generateCountryside(world: World, castles: CastleDef[], seed: number): { villages: CastleDef[]; sites: ResourceSite[] } {
  const rnd = mulberry32((seed * 2654435761) >>> 0)
  const half = world.half
  const area = (world.size * world.size) / (3920 * 3920)
  const villageCount = Math.max(4, Math.round(10 * area))
  const siteCount = Math.max(4, Math.round(12 * area))
  const taken: { x: number; z: number; r: number }[] = castles.map((c) => ({ x: c.x, z: c.z, r: holdingRadius(c) + 260 }))
  const free = (x: number, z: number, r: number) => taken.every((t) => Math.hypot(t.x - x, t.z - z) > t.r + r)
  const names = new Set(castles.map((c) => c.name))
  const name = () => {
    for (let k = 0; k < 50; k++) {
      const n = PREFIX[Math.floor(rnd() * PREFIX.length)] + SUFFIX[Math.floor(rnd() * SUFFIX.length)]
      const cap = n.charAt(0).toUpperCase() + n.slice(1)
      if (!names.has(cap)) {
        names.add(cap)
        return cap
      }
    }
    return `Hamlet ${names.size}`
  }

  const villages: CastleDef[] = []
  for (let tries = 0; tries < 900 && villages.length < villageCount; tries++) {
    const x = (rnd() * 2 - 1) * (half - 260)
    const z = (rnd() * 2 - 1) * (half - 260)
    if (!world.isPassable(x, z) || world.forestAt(x, z) > 0.45 || world.slopeAt(x, z) > 0.35 || world.bridgeAt(x, z, 60)) continue
    if (!free(x, z, 120)) continue
    // Rich climates (coast, river jungle, golden plains) are thick with villages; deserts and mesas are not.
    if (rnd() > Math.min(1, world.rulesAt(x, z).villages / 1.8)) continue
    const militia = 90 + Math.floor(rnd() * 120)
    const garrison: Troops = { infantry: Math.round(militia * 0.65), archers: Math.round(militia * 0.35), cavalry: 0, engineers: 0 }
    villages.push({
      id: `v${villages.length}`,
      name: name(),
      subtitle: 'Village',
      faction: 'neutral',
      tier: 1,
      x: Math.round(x),
      z: Math.round(z),
      village: true,
      garrison,
    })
    taken.push({ x, z, r: 200 })
  }

  // Larger holdings between the villages: caravanserais on the trade roads, abbeys in quiet country,
  // wardens' keeps on the marches and guildhalls near timber and ore.
  const special: { kind: HoldingKind; count: number; likes: string[]; title: string; militia: [number, number] }[] = [
    { kind: 'caravanserai', count: 1.4, likes: ['desert', 'coast', 'oasis', 'grain', 'highland', 'temperate', 'mesa'], title: 'Caravanserai', militia: [100, 180] },
    { kind: 'abbey', count: 1.4, likes: ['temperate', 'lakeland', 'taiga', 'alpine', 'autumn', 'grain', 'coast', 'steam'], title: 'Abbey', militia: [80, 150] },
    { kind: 'keep', count: 1.8, likes: [], title: "Wardens' keep", militia: [160, 260] },
    { kind: 'guildhall', count: 1.2, likes: ['mesa', 'alpine', 'taiga', 'volcanic', 'wasteland', 'autumn', 'icefield', 'temperate'], title: 'Guildhall', militia: [90, 160] },
  ]
  let hid = 0
  for (const sp of special) {
    const want = Math.max(1, Math.round(sp.count * Math.sqrt(area)))
    for (let placed = 0, tries = 0; placed < want && tries < 1200; tries++) {
      const x = (rnd() * 2 - 1) * (half - 280)
      const z = (rnd() * 2 - 1) * (half - 280)
      if (!world.isPassable(x, z) || world.forestAt(x, z) > 0.4 || world.slopeAt(x, z) > 0.3 || world.bridgeAt(x, z, 80) || world.featureKindAt(x, z)) continue
      if (sp.likes.length && !sp.likes.includes(world.climateAt(x, z).key)) continue
      if (!free(x, z, 140)) continue
      const m = HOLDINGS_MIX[sp.kind]
      const militia = sp.militia[0] + Math.floor(rnd() * (sp.militia[1] - sp.militia[0]))
      villages.push({
        id: `h${hid++}`,
        name: name(),
        subtitle: sp.title,
        faction: 'neutral',
        tier: 1,
        x: Math.round(x),
        z: Math.round(z),
        village: true,
        holding: sp.kind,
        garrison: { infantry: Math.round(militia * m.infantry), cavalry: Math.round(militia * m.cavalry), archers: Math.round(militia * m.archers), engineers: 0 },
      })
      taken.push({ x, z, r: 220 })
      placed++
    }
  }

  const sites: ResourceSite[] = []
  for (let tries = 0; tries < 1400 && sites.length < siteCount; tries++) {
    const x = (rnd() * 2 - 1) * (half - 220)
    const z = (rnd() * 2 - 1) * (half - 220)
    if (!world.isPassable(x, z) || world.bridgeAt(x, z, 60)) continue
    const forest = world.forestAt(x, z)
    const high = world.heightAt(x, z) > 38 || world.slopeAt(x, z) > 0.3
    // Alternate kinds so both appear; mines on high ground, lumber camps in forest.
    const want = sites.length % 2 === 0 ? 'mine' : 'lumber'
    const mines = world.rulesAt(x, z).mines
    if (want === 'mine' && !high && mines < 1.5) continue
    if (want === 'mine' && rnd() > Math.min(1, mines / 2.2)) continue
    if (want === 'lumber' && forest < 0.5) continue
    if (!free(x, z, 90)) continue
    sites.push({ id: `r${sites.length}`, kind: want, x: Math.round(x), z: Math.round(z), stock: RESOURCE_STOCK, workerId: null, carry: 0, nextWagonAt: 0 })
    taken.push({ x, z, r: 160 })
  }
  return { villages, sites }
}

/** Gold a site holds before it is worked out (it slowly recovers while idle). */
export const RESOURCE_STOCK = 2600

export const RESOURCE = {
  /** Minimum engineers to work a site; more engineers work it faster (a castle's tier-1 income is 6/s). */
  minEngineers: 10,
  rate: (engineers: number, kind: 'mine' | 'lumber') => (kind === 'mine' ? 1.3 : 1) * (0.55 + 0.065 * Math.min(engineers, 80)),
  regen: 1.2,
  /** Gold leaves the site by wagon once this much has piled up, at most this often. */
  wagonLoad: 60,
  wagonEvery: 40,
}
