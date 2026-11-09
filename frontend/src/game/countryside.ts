import { mulberry32 } from './noise'
import { PREFIX, SUFFIX } from './mapgen'
import type { CastleDef, ResourceSite, Troops } from './types'
import { castleRadius, type World } from './world'

/**
 * The countryside between the castles: free villages (to win over or plunder)
 * and resource sites (forests to fell, mines to dig) worked by engineers.
 * Deterministic from the scenario seed, so every player sees the same land.
 */
export function generateCountryside(world: World, castles: CastleDef[], seed: number): { villages: CastleDef[]; sites: ResourceSite[] } {
  const rnd = mulberry32((seed * 2654435761) >>> 0)
  const half = world.half
  const area = (world.size * world.size) / (3920 * 3920)
  const villageCount = Math.max(4, Math.round(10 * area))
  const siteCount = Math.max(4, Math.round(12 * area))
  const taken: { x: number; z: number; r: number }[] = castles.map((c) => ({ x: c.x, z: c.z, r: castleRadius(c.tier) + 260 }))
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

  const sites: ResourceSite[] = []
  for (let tries = 0; tries < 1400 && sites.length < siteCount; tries++) {
    const x = (rnd() * 2 - 1) * (half - 220)
    const z = (rnd() * 2 - 1) * (half - 220)
    if (!world.isPassable(x, z) || world.bridgeAt(x, z, 60)) continue
    const forest = world.forestAt(x, z)
    const high = world.heightAt(x, z) > 38 || world.slopeAt(x, z) > 0.3
    // Alternate kinds so both appear; mines on high ground, lumber camps in forest.
    const want = sites.length % 2 === 0 ? 'mine' : 'lumber'
    if (want === 'mine' && !high) continue
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
