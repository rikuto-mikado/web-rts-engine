import { mulberry32 } from './noise'
import type { CastleDef, GrangeDef } from './types'
import { castleRadius, holdingRadius, type World } from './world'

/**
 * Food. A castle's garrison eats; its stores hold a few minutes of food for a full garrison. The
 * castle's own fields keep a little coming in (while no enemy stands in them), and its grange (the
 * home farm, a short way off) sends the rest by wagon. A realm's grange feeds all the realm's
 * castles in turn, hungriest first: the more castles, the thinner it is spread, unless more granges
 * are taken (each seat of power has one). No soldiers keep a grange, only a long, low wall round its
 * fields: an army that pulls the wall down takes the grange (and what is in its barn), and its grain
 * goes to the takers' castles from then on. The holders defend it with armies in the field near it.
 * Its barn fills at harvest time, and it feeds the holders' armies camped near it.
 *
 * Empty stores: hunger. The garrison (and any troops stationed inside) wastes away, fights shaken,
 * raises no levies and mends no walls; once it has dwindled to a fraction of what it was, with an
 * enemy at the gates, the castle opens them.
 *
 * Stores are counted in soldier-seconds: one man fed for one second.
 */
export const STORES = {
  /** Minutes of food for a full garrison, by castle tier. */
  minutes: (tier: number) => 2 + tier,
  /** A castle's own fields feed this share of a full garrison, while no enemy stands in them. */
  fields: 0.25,
  /** Enemies this far beyond the walls stand in the fields (and keep the castle's carts at home). */
  fieldsReach: 380,
  /** The enemy force that counts as standing in the fields. */
  fieldsMen: 60,
  /** The castle's income falls to this while its fields are held by the enemy. */
  fieldsIncome: 0.5,
  /** Warn when the stores fall below this share. */
  low: 0.25,
  /** Hunger: the garrison loses this share each second. */
  starve: 0.006,
  /** It opens its gates once it has dwindled to this share of what it had when hunger set in (or this few men), with an enemy this close. */
  surrender: 0.3,
  surrenderMen: 60,
  surrenderReach: 450,
  /** A castle changing hands keeps this much of its stores (the victors bring a little of their own). */
  captured: 0.35,
}

export const GRANGE = {
  /** A wagon of grain sets out this often (while the barn has a wagonload). */
  every: 20,
  /** What it carries: food for 1,000 men for three minutes. */
  cargo: 1000 * 180,
  /**
   * The barn: the harvest comes in through the year, most of it in summer and autumn, none in
   * winter (food for this many men, each second of the season); the wagons and the armies it feeds
   * draw on it. Over a year it feeds about 9,000 men.
   */
  harvest: { Spring: 3600, Summer: 14400, Autumn: 18000, Winter: 0 } as Record<string, number>,
  barnMax: 14_000_000,
  barnStart: 6_000_000,
  /** No soldiers keep a grange, only its long, low wall round the fields. */
  walls: 1800,
  /** The wall mends this fast once nobody has attacked it for a few seconds. */
  mend: 10,
  mendAfter: 6,
  /** Anyone can pull down a field wall: each man adds this much to his army's siege power. */
  perMan: 0.08,
  /** A band this big, this close (from the middle), with none of the holders' troops nearby, attacks the wall. */
  takeMen: 60,
  assaultReach: 125,
  guardReach: 300,
  /** Taken, the wall stands at this share of its strength. */
  takenWalls: 0.25,
  /** The holders' armies this close are fed from the barn: supplied, at half the upkeep. */
  feedReach: 600,
  feedUpkeep: 0.5,
  /** The farmyard in the middle (for clicks), the walled fields round it (for placing it and clearing the land). */
  radius: 46,
  outerX: 92,
  outerZ: 76,
  clear: 128,
}

/** Food for a full garrison of this castle (its stores' ceiling). */
export function storesMax(tier: number, capacity: number): number {
  return capacity * STORES.minutes(tier) * 60
}

/**
 * Place the granges: one near each realm's seat of power. Each stands on dry, even, open ground beyond its castle's suburbs and fields, clear of
 * the other castles, the terrain features and the roads, facing its castle.
 */
export function placeGranges(world: World, castles: CastleDef[], seed: number, taken: { x: number; z: number; r: number }[]): GrangeDef[] {
  const rnd = mulberry32((seed * 2246822519 + 7) >>> 0)
  const out: GrangeDef[] = []
  const features = world.def.features ?? []
  const R = GRANGE.clear
  const flat = (x: number, z: number, r: number, slope: number) => {
    const h0 = world.heightAt(x, z)
    if (h0 < 4) return false
    for (let k = 0; k < 10; k++) {
      const px = x + Math.cos((k / 10) * Math.PI * 2) * r
      const pz = z + Math.sin((k / 10) * Math.PI * 2) * r
      const h = world.heightAt(px, pz)
      if (h < 3 || !world.isPassable(px, pz) || Math.abs(h - h0) > r * slope) return false
    }
    return true
  }
  for (const c of castles) {
    // One for each realm's seat of power (there are no free castles; the Crossroads lives off its own fields).
    if (c.village || !c.capital) continue
    // Beyond the castle's own country: its suburbs and fields, or a royal city's walls and farmland.
    const town = world.towns.find((t) => Math.hypot(t.x - c.x, t.z - c.z) < t.r)
    const near = town ? Math.hypot(town.x - c.x, town.z - c.z) + town.r + 300 : castleRadius(c.tier) * 2.15 + R + 20
    let best: { x: number; z: number; score: number } | null = null
    // Three tries, each less fussy: even ground near the castle; rougher ground further off; and at
    // last any open, dry ground within reach (every seat of power must have its grange).
    for (let pass = 0; pass < 3 && !best; pass++) {
      const slope = pass === 0 ? 0.26 : pass === 1 ? 0.4 : 0.6
      for (let k = 0; k < (pass === 2 ? 220 : 90); k++) {
        const a = rnd() * Math.PI * 2
        const d = near + rnd() * (pass === 0 ? 300 : pass === 1 ? 520 : 900)
        const x = (town ? town.x : c.x) + Math.cos(a) * d
        const z = (town ? town.z : c.z) + Math.sin(a) * d
        if (Math.abs(x) > world.half - 160 || Math.abs(z) > world.half - 160) continue
        if (!world.isPassable(x, z) || world.forestAt(x, z) > (pass === 2 ? 0.9 : 0.55) || world.bridgeAt(x, z, 160)) continue
        if (!flat(x, z, R * 0.82, slope) || !flat(x, z, GRANGE.outerZ, slope * 0.9) || !flat(x, z, GRANGE.radius, slope * 0.9)) continue
        if (castles.some((o) => o !== c && Math.hypot(o.x - x, o.z - z) < holdingRadius(o) * 1.5 + R + 120)) continue
        if (world.towns.some((t) => t !== town && Math.hypot(t.x - x, t.z - z) < t.r + R + 200)) continue
        if (town && Math.hypot(town.x - x, town.z - z) < town.r + R + 220) continue
        if (features.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + R + 20)) continue
        if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + R)) continue
        if (world.roadDist(x, z).d < (pass === 2 ? R * 0.5 : R * 0.75)) continue
        // Closer to its castle is better; a forest edge is worse.
        const score = d + world.forestAt(x, z) * 200
        if (!best || score < best.score) best = { x, z, score }
      }
    }
    if (!best) continue
    const g: GrangeDef = { id: `g-${c.id}`, name: `${c.name} Grange`, castleId: c.id, x: Math.round(best.x), z: Math.round(best.z), heading: Math.atan2(c.x - best.x, c.z - best.z) }
    out.push(g)
    taken.push({ x: g.x, z: g.z, r: R + 60 })
  }
  return out
}
