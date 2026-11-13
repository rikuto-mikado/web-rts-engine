import { CLIMATES, biomeOf, mapOf, zoneWeights, type Biome, type Climate, type ClimateRules, type MapDef } from './biomes'
import { Simplex, clamp, lerp, mulberry32, smoothstep } from './noise'
import type { CityWall, Escarpment, FeatureKind, Scenario, ScenarioDefinition, TerrainFeature, TownDef } from './types'

export const NAV_CELL = 20
/** A great wall's gates and breaches are this wide (radius). */
export const RAMPART_GATE = 75
export const WATER_LEVEL = 0
export const BRIDGE_DECK = 7
/**
 * Deep Freeze: in the depth of winter stretches of the rivers, and some lakes, ice over and can be
 * walked across anywhere. Each river is cut into lengths; which of them (and which lakes) freeze is
 * fixed per map (colder ground freezes more often, warm volcanic ground never, the sea never). The
 * ice is slow and treacherous underfoot.
 */
export const ICE = {
  /** Length of river that freezes (or not) as one. */
  stretch: 420,
  /** Chance a stretch freezes, by the winter where it lies. */
  chance: { normal: 0.55, harsh: 0.8, immune: 0 } as Record<string, number>,
  /** How far out from the river's middle the ice reaches, beyond half its width (covers the banks). */
  margin: 14,
  /** Lakes freeze whole (the shore too); bigger waters than this (the sea) never do. */
  lakeMax: 700,
  lakeShore: 70,
  /** Movement on the ice. */
  speed: 0.6,
  /** Path cost of an ice cell (dearer than open ground: armies cross it when it saves them a march). */
  cost: 1.8,
}
/** Wading a ford: slow, and no charging or squares in the water. */
export const FORD_SPEED = 0.6

/** Castles are walled compounds about 3.5x the old footprint, with a gate on each side. */
export const CASTLE_SCALE = 1.9
/** Half-width of a gate passage through the walls. */
export const GATE_HALF = 18

/**
 * A royal seat: the castle where a crowned head (the King, or the Usurper Queen) keeps court
 * in this far-off land. Far from their home citadels, but grander than any lord's castle.
 */
export const ROYAL_SEAT_TIER = 5

/** A royal city's ward by its id: the kind of landmark and life round it. */
export type WardKind = 'close' | 'garrison' | 'market' | 'smiths' | 'granary'
export function wardKind(id: string): WardKind {
  return id.includes('cathedral') ? 'close' : id.includes('barracks') ? 'garrison' : id.includes('market') ? 'market' : id.includes('smiths') ? 'smiths' : 'granary'
}
/** Radius of the ring of town houses round a ward's plaza (0: the cathedral's close has its own canons' houses). */
export const WARD_RING: Record<WardKind, number> = { close: 0, garrison: 56, market: 60, smiths: 50, granary: 50 }
/** How far a ward's ground reaches from its centre (landmark, plaza, houses): nothing else may come nearer. */
export function wardReach(id: string): number {
  const ring = WARD_RING[wardKind(id)]
  return ring ? ring + 7 : 62
}

export function castleRadius(tier: number): number {
  // A royal seat covers about 1.75x the ground of a lord's greatest castle.
  if (tier >= ROYAL_SEAT_TIER) return (34 + 4 * 12) * CASTLE_SCALE * 1.32
  return (34 + tier * 12) * CASTLE_SCALE
}
/** Radius of the curtain wall (armies pass it only through the four gates). */
export function wallRadius(tier: number): number {
  return castleRadius(tier) * 0.78
}
/** Villages and other small holdings: open compounds about 40-50% of a tier-1 castle's area. */
export function villageRadius(tier: number): number {
  return 56 + (tier - 1) * 10
}
/** Footprint of any holding. */
export function holdingRadius(c: { tier: number; village?: boolean }): number {
  return c.village ? villageRadius(c.tier) : castleRadius(c.tier)
}

/**
 * A castle's curtain wall as it stands on the ground: not a circle but an outline that follows the
 * site (the brow of a hill, the bank of a river or lake, an uneven plain), given as the wall's
 * distance from the castle's heart at PROF_N evenly spaced bearings, as multiples of the nominal
 * wall radius `r`. Four gates, a quarter turn apart, the first facing `rot`.
 */
export type CastleSite = 'plain' | 'hill' | 'river' | 'lake'
export interface CastleShape {
  x: number
  z: number
  /** Nominal wall radius (wallRadius(tier)); grows with the castle. */
  r: number
  /** Bearing of the main gate (the others a quarter turn apart). */
  rot: number
  gates: number[]
  prof: Float32Array
  site: CastleSite
  /** Height of the castle's plateau. */
  level: number
  /** Bearings of the outline's corners (towers stand there). */
  corners: number[]
  /** A castle on the water: the bearing of the bank wall. */
  water?: number
  /** A hill castle: the bearing of the ridge it is drawn out along. */
  axis?: number
}
export const PROF_N = 64
/** Distance from the origin to a polygon's edge along a bearing. */
function rayPoly(v: [number, number][], ang: number): number {
  const dx = Math.cos(ang)
  const dz = Math.sin(ang)
  let best = Infinity
  for (let k = 0; k < v.length; k++) {
    const [ax, az] = v[k]
    const [bx, bz] = v[(k + 1) % v.length]
    const ex = bx - ax
    const ez = bz - az
    const den = dx * ez - dz * ex
    if (Math.abs(den) < 1e-9) continue
    const t = (ax * ez - az * ex) / den
    const u = (ax * dz - az * dx) / den
    if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t)
  }
  return best === Infinity ? 1 : best
}
function profOf(prof: Float32Array, ang: number): number {
  let t = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  t = (t / (Math.PI * 2)) * PROF_N
  const i = Math.floor(t) % PROF_N
  const f = t - Math.floor(t)
  return prof[i] * (1 - f) + prof[(i + 1) % PROF_N] * f
}
/** The wall's distance from the heart at this bearing, as a multiple of the nominal radius. */
export function profAt(s: CastleShape, ang: number): number {
  return profOf(s.prof, ang)
}
/** Where the curtain wall stands at this bearing (world distance from the castle's heart). */
export function wallRAt(s: CastleShape, ang: number): number {
  return s.r * profAt(s, ang)
}

export interface BridgeInfo {
  x: number
  z: number
  dirX: number // unit vector along the deck (across the river)
  dirZ: number
  length: number
  width: number
}

/**
 * Deterministic terrain shared by the simulation (pathfinding, speed, vision)
 * and the renderer (meshes, minimap). Generated once from the scenario seed.
 */
export class World {
  readonly size: number
  readonly half: number
  readonly def: ScenarioDefinition
  /** Bridges engineers have thrown across rivers during the game (indices are stable; demolished ones stay as `broken`). */
  readonly bridges: BridgeInfo[] = []
  /** Shallow fords where the map's rivers can be waded (slowly). They cannot be destroyed. */
  readonly fords: BridgeInfo[]
  /** The map's own bridges: built to last in the style of the land, and never burned. */
  readonly stoneBridges: BridgeInfo[]
  readonly biome: Biome
  /** The map's layout: three climate zones (see biomes.ts). */
  readonly map: MapDef
  private readonly climates: [Climate, Climate, Climate]
  /** Zone weights per height cell (3 per cell, summing to 1). */
  readonly zones: Float32Array
  private zoneNoise: Simplex

  private noise: Simplex
  private detail: Simplex
  private forestNoise: Simplex

  /** Height-field cell size; coarser on large maps to keep meshes light. */
  readonly cell: number
  readonly hRes: number
  readonly heights: Float32Array
  readonly forest: Float32Array // same layout as heights, 0..1

  readonly navRes: number
  readonly navCost: Float32Array // 0 = blocked

  /** The map's walled towns: the Long Night's royal city, the three of the Three Crowns, or none. */
  get towns(): TownDef[] {
    // (Read for every height sample, so worked out once.)
    return (this.townList ??= this.def.towns ?? (this.def.town ? [this.def.town] : []))
  }
  private townList?: TownDef[]
  /** The walled royal city this point lies in (within its outer wall), if any. */
  townAt(x: number, z: number): TownDef | undefined {
    return this.towns.find((t) => Math.hypot(t.x - x, t.z - z) < t.r)
  }
  /** A royal city's two walls (inner, outer). */
  townWalls(t: TownDef): [CityWall | undefined, CityWall | undefined] {
    const w = this.def.walls ?? []
    if (t.walls) return [w[t.walls[0]], w[t.walls[1]]]
    return [w[0], w[1]]
  }

  constructor(scenario: Scenario) {
    this.size = scenario.map_size
    this.half = this.size / 2
    this.def = scenario.definition
    this.biome = biomeOf(scenario.definition.biome)
    this.map = mapOf(scenario.definition.biome)
    this.climates = this.map.zones.map((k) => CLIMATES[k]) as [Climate, Climate, Climate]
    this.zoneNoise = new Simplex(scenario.seed + 303)
    this.noise = new Simplex(scenario.seed)
    this.detail = new Simplex(scenario.seed + 17)
    this.forestNoise = new Simplex(scenario.seed + 101)
    this.fords = this.def.bridges.filter((b) => b.ford).map((b) => this.spanAt(b.x, b.z))
    this.stoneBridges = this.def.bridges.filter((b) => !b.ford).map((b) => this.spanAt(b.x, b.z))

    // Each castle's walls follow its site: read from the land before the castles are levelled into it.
    for (const c of this.def.castles) if (!c.village && !c.gate && !c.district) this.walls.set(c.id, this.planCastle(c))

    // Keep the terrain mesh under ~600 x 600 vertices on the biggest maps.
    this.cell = this.size <= 2600 ? 10 : Math.max(14, Math.ceil(this.size / 600))
    this.hRes = Math.round(this.size / this.cell) + 1
    this.heights = new Float32Array(this.hRes * this.hRes)
    this.forest = new Float32Array(this.hRes * this.hRes)
    this.zones = new Float32Array(this.hRes * this.hRes * 3)
    for (let j = 0; j < this.hRes; j++) {
      for (let i = 0; i < this.hRes; i++) {
        const x = -this.half + i * this.cell
        const z = -this.half + j * this.cell
        const h = this.computeHeight(x, z)
        this.heights[j * this.hRes + i] = h
      }
    }
    for (let j = 0; j < this.hRes; j++) {
      for (let i = 0; i < this.hRes; i++) {
        const x = -this.half + i * this.cell
        const z = -this.half + j * this.cell
        const n = this.zoneNoise.fbm(x * 0.0011, z * 0.0011, 3) * 1.6
        const w = zoneWeights(this.map.key, x / this.half, z / this.half, n)
        const sum = w[0] + w[1] + w[2] || 1
        const k = (j * this.hRes + i) * 3
        this.zones[k] = w[0] / sum
        this.zones[k + 1] = w[1] / sum
        this.zones[k + 2] = w[2] / sum
      }
    }
    for (let j = 0; j < this.hRes; j++) {
      for (let i = 0; i < this.hRes; i++) {
        const x = -this.half + i * this.cell
        const z = -this.half + j * this.cell
        const h = this.heights[j * this.hRes + i]
        this.forest[j * this.hRes + i] = this.woodsAt(x, z, h, this.computeForest(x, z, h))
      }
    }

    this.navRes = Math.round(this.size / NAV_CELL)
    this.navCost = new Float32Array(this.navRes * this.navRes)
    this.buildIce(scenario.seed)
    this.buildNav()
  }

  // -------------------------------------------------------------------------
  // Deep Freeze
  // -------------------------------------------------------------------------

  /** The river stretches that ice over in deep winter (fixed per map). */
  readonly iceSegs: { ax: number; az: number; bx: number; bz: number; width: number }[] = []
  /** The lakes that ice over in deep winter. */
  readonly iceLakes: { x: number; z: number; r: number }[] = []
  /** Anything on this map freezes. */
  get canFreeze(): boolean {
    return this.iceSegs.length > 0 || this.iceLakes.length > 0
  }
  /** The rivers are frozen now. */
  frozen = false
  /** Navigation cells the ice covers (their cost changes when it freezes or thaws). */
  private iceCells: number[] = []
  private buildIce(seed: number) {
    const rnd = mulberry32((seed ?? 1) * 7 + 9001)
    this.def.rivers.forEach((river) => {
      const pts = river.points
      const segs: { ax: number; az: number; bx: number; bz: number; width: number; chunk: number }[] = []
      let run = 0
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, az] = pts[k]
        const [bx, bz] = pts[k + 1]
        segs.push({ ax, az, bx, bz, width: river.width, chunk: Math.floor(run / ICE.stretch) })
        run += Math.hypot(bx - ax, bz - az)
      }
      const chunks = new Map<number, boolean>()
      for (const sg of segs) {
        if (chunks.has(sg.chunk)) continue
        const winter = this.rulesAt((sg.ax + sg.bx) / 2, (sg.az + sg.bz) / 2).winter
        chunks.set(sg.chunk, rnd() < (ICE.chance[winter] ?? 0.5))
      }
      // Every river that can freeze at all freezes somewhere: the middle stretch, if nothing else.
      if (![...chunks.values()].some(Boolean) && segs.length) {
        const mid = segs[Math.floor(segs.length / 2)]
        if (this.rulesAt(mid.ax, mid.az).winter !== 'immune') chunks.set(mid.chunk, true)
      }
      for (const sg of segs) if (chunks.get(sg.chunk)) this.iceSegs.push({ ax: sg.ax, az: sg.az, bx: sg.bx, bz: sg.bz, width: sg.width })
    })
    // Lakes (not the sea): each freezes whole, or not at all.
    const lakes = this.def.lakes.filter((l) => l.r <= ICE.lakeMax && this.rulesAt(l.x, l.z).winter !== 'immune')
    // (At most half of them: a ring or chain of lakes the map is built round keeps its shape.)
    const most = Math.max(1, Math.floor(lakes.length / 2))
    for (const l of lakes) if (this.iceLakes.length < most && rnd() < (ICE.chance[this.rulesAt(l.x, l.z).winter] ?? 0.5)) this.iceLakes.push({ x: l.x, z: l.z, r: l.r })
    // Something freezes on every map that has cold water at all.
    if (!this.iceSegs.length && !this.iceLakes.length && lakes.length) this.iceLakes.push({ ...lakes[Math.floor(rnd() * lakes.length)] })
    if (!this.canFreeze) return
    const R = this.navRes
    for (let j = 0; j < R; j++) {
      for (let i = 0; i < R; i++) {
        if (this.iceZone(-this.half + (i + 0.5) * NAV_CELL, -this.half + (j + 0.5) * NAV_CELL)) this.iceCells.push(j * R + i)
      }
    }
  }
  /** On a stretch of river that freezes (frozen or not). */
  iceZone(x: number, z: number): boolean {
    for (const l of this.iceLakes) if (Math.abs(x - l.x) < l.r + ICE.lakeShore && Math.abs(z - l.z) < l.r + ICE.lakeShore && Math.hypot(x - l.x, z - l.z) < l.r + ICE.lakeShore) return true
    for (const s of this.iceSegs) {
      const r = s.width / 2 + ICE.margin
      if (x < Math.min(s.ax, s.bx) - r || x > Math.max(s.ax, s.bx) + r || z < Math.min(s.az, s.bz) - r || z > Math.max(s.az, s.bz) + r) continue
      if (distToSegment(x, z, s.ax, s.az, s.bx, s.bz) < r) return true
    }
    return false
  }
  /** Standing on the ice now (only while the rivers are frozen; not on a bridge). */
  iceAt(x: number, z: number): boolean {
    return this.frozen && this.heightAt(x, z) < 2.5 && this.iceZone(x, z) && !this.bridgeAt(x, z, 4)
  }
  /** Freeze or thaw the rivers: the ice cells open to marching, or close again. */
  setFrozen(on: boolean) {
    if (this.frozen === on) return
    this.frozen = on
    const R = this.navRes
    for (const k of this.iceCells) {
      const i = k % R
      const j = Math.floor(k / R)
      this.navCost[k] = this.cellCost(-this.half + (i + 0.5) * NAV_CELL, -this.half + (j + 0.5) * NAV_CELL)
    }
    this.components = null
    this.bridgeVersion++
  }

  // -------------------------------------------------------------------------
  // Height field
  // -------------------------------------------------------------------------

  private distToRiver(x: number, z: number): { d: number; width: number } {
    let best = Infinity
    let width = 0
    for (const river of this.def.rivers) {
      const pts = river.points
      for (let k = 0; k < pts.length - 1; k++) {
        const d = distToSegment(x, z, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1])
        if (d < best) {
          best = d
          width = river.width
        }
      }
    }
    // Meander the banks a little so rivers do not look ruler-straight.
    return { d: best + this.detail.noise(x * 0.01, z * 0.01) * 8, width }
  }

  private computeHeight(x: number, z: number): number {
    return this.terrainHeight(x, z, false)
  }
  /** The lie of the land; `natural` leaves out the castles' plateaus (to read the site they stand on). */
  private terrainHeight(x: number, z: number, natural: boolean): number {
    const n = this.noise
    let h = 16 + n.fbm(x * 0.0014, z * 0.0014, 4) * 22 + this.detail.noise(x * 0.012, z * 0.012) * 2.2
    h = Math.max(h, 5)

    for (const m of this.def.mountains) {
      const dx = x - m.x
      const dz = z - m.z
      const d = Math.sqrt(dx * dx + dz * dz) / m.r
      if (d < 1.6) {
        const ridge = 1 - Math.abs(n.noise(x * 0.006 + m.x, z * 0.006 + m.z))
        const fall = Math.pow(clamp(1 - d / 1.6, 0, 1), 1.7)
        h += m.h * fall * (0.55 + 0.6 * ridge)
      }
    }

    // A walled town sits on a level plain.
    for (const town of this.towns) {
      const d = Math.hypot(x - town.x, z - town.z)
      if (d > town.r + 270) continue
      const level = 14
      h = lerp(level + this.detail.noise(x * 0.01, z * 0.01) * 1.2, h, smoothstep(town.r + 40, town.r + 260, d))
    }

    // Castles sit on flattened plateaus, shaped like their walls (a hill castle on its hilltop).
    for (const c of natural ? [] : this.def.castles) {
      const r = castleRadius(Math.max(c.tier, Math.min(4, c.tier + 1)))
      const d = Math.hypot(x - c.x, z - c.z)
      if (d < r * 2.4) {
        const shape = this.walls.get(c.id)
        const k = shape ? 0.3 + 0.7 * profAt(shape, Math.atan2(z - c.z, x - c.x)) : 1
        const plateau = shape ? shape.level : Math.max(10, 16 + n.fbm(c.x * 0.0014, c.z * 0.0014, 4) * 22) + 2
        if (!shape) h = lerp(plateau, h, smoothstep(r * 1.05, r * 1.7, d))
        else if (shape.site === 'hill') h = lerp(plateau, h, Math.pow(smoothstep(r * 1.02 * k, r * 2.1, d), 1.25))
        // A broad, gentle apron round the walls where the castle's suburbs and fields lie.
        else h = lerp(plateau, h, Math.pow(smoothstep(r * 1.02 * k, r * 2.35, d), 2))
      }
    }

    // A royal city rises in tiers: the lower city on a terrace under its outer wall, the royal quarter
    // higher behind the inner wall (which holds the ground up like a dam), the Citadel on its own
    // rocky mount at the heart.
    const town = this.towns.find((t) => t.poly && Math.hypot(x - t.x, z - t.z) < t.r + 80)
    const [innerW, outerW] = town ? this.townWalls(town) : [undefined, undefined]
    if (town && innerW?.points && outerW?.points) {
      const signed = (w: CityWall) => (this.insideWall(w, x, z) ? 1 : -1) * this.polyDist(this.wallLoop(w), x, z)
      const sO = signed(outerW)
      if (sO > -70) {
        const sI = signed(innerW)
        const dk = Math.hypot(x - town.x, z - town.z)
        const mount = castleRadius(ROYAL_SEAT_TIER)
        // (The Citadel's summit is dead level: no ripple at all under its paving.)
        let t = 14 + this.detail.noise(x * 0.008, z * 0.008) * 0.9 * smoothstep(mount * 1.05, mount * 1.35, dk)
        t += 7 * smoothstep(-34, 12, sO)
        t += 22 * smoothstep(-14, 30, sI)
        // The mount: a level summit, a short steep face all round (the Citadel's stone revetment
        // covers it), and along the four roads to its gates (on the map's axes) a long even ramp.
        const ang = Math.atan2(z - town.z, x - town.x)
        const ramp = 1 - smoothstep(14, 18, Math.min(dk * Math.abs(Math.sin(ang)), dk * Math.abs(Math.cos(ang))))
        // (A straight face 20m wide: the revetment lies along it.)
        const face = 1 - clamp((dk - mount * 0.995) / 20, 0, 1)
        const slope = 1 - smoothstep(mount * 0.995, mount * 1.5, dk)
        t += 30 * (face * (1 - ramp) + slope * ramp) + 4 * (1 - smoothstep(mount * 1.12, mount * 1.6, dk)) * (1 - ramp * 0.6 * smoothstep(mount * 0.995, mount * 1.1, dk))
        h = lerp(h, t, smoothstep(-66, -22, sO))
      }
    }

    // Escarpments: the tableland to the north stands higher, its edge a cliff; ravines climb it.
    for (const e of this.def.escarpments ?? []) h += this.escarpRise(e, x, z)

    const { d: dr, width } = this.distToRiver(x, z)
    const half = width * 0.5
    if (dr < half + 60) {
      const bed = -7
      h = lerp(bed, h, smoothstep(half * 0.55, half + 60, dr))
    }

    for (const lake of this.def.lakes) {
      const d = Math.hypot(x - lake.x, z - lake.z) + this.detail.noise(x * 0.012, z * 0.012) * 14
      if (d < lake.r + 70) {
        // Big waters (the sea) get a short, sharp shore instead of a shallow fade across half their size.
        h = lerp(-8, h, smoothstep(Math.max(lake.r * 0.6, lake.r - 220), lake.r + 70, d))
      }
    }

    // Fords: a shallow, stony bed just under the surface.
    for (const f of this.fords) {
      const dx = x - f.x
      const dz = z - f.z
      const along = dx * f.dirX + dz * f.dirZ
      const across = -dx * f.dirZ + dz * f.dirX
      const t = Math.max(Math.abs(along) / (f.length / 2 + 10), Math.abs(across) / (f.width / 2 + 34))
      if (t < 1) h = Math.max(h, lerp(-1.2, h, smoothstep(0.55, 1, t)))
    }

    // Raise the map edge into hills so the world feels bounded.
    const edge = Math.max(Math.abs(x), Math.abs(z))
    if (edge > this.half - 140) h += smoothstep(this.half - 140, this.half, edge) * 70

    return h
  }

  /** How far north of an escarpment's edge a point lies (negative: south, on the plain). */
  escarpSide(e: Escarpment, x: number, z: number): number {
    const p = e.points
    let ez = p[0][1]
    for (let k = 0; k < p.length - 1; k++) {
      if (x >= p[k][0] && x <= p[k + 1][0]) {
        ez = p[k][1] + ((p[k + 1][1] - p[k][1]) * (x - p[k][0])) / (p[k + 1][0] - p[k][0] || 1)
        break
      }
      if (x > p[k + 1][0]) ez = p[k + 1][1]
    }
    // Bays and spurs: the edge wanders at two scales, as a real cliff line does.
    ez += this.detail.noise(x * 0.0032, 7.3) * 85 + this.detail.noise(x * 0.011, 3.1) * 26
    return ez - z
  }
  /** Ravine factor at x (1 inside a pass, 0 clear of it). */
  private ravine(e: Escarpment, x: number, z: number): number {
    let r = 0
    for (const p of e.passes) {
      if (Math.abs(z - p.z) > e.ramp + 300) continue
      r = Math.max(r, 1 - smoothstep(p.w, p.w + 34, Math.abs(x - p.x)))
    }
    return r
  }
  /** The height an escarpment adds here. */
  private escarpRise(e: Escarpment, x: number, z: number): number {
    const s = this.escarpSide(e, x, z)
    if (s < -e.ramp) return 0
    const cliff = smoothstep(-e.cliff / 2, e.cliff / 2, s)
    const r = this.ravine(e, x, z)
    const ramp = smoothstep(-e.ramp * 0.12, e.ramp, s)
    const k = cliff + (ramp - cliff) * r
    // The cliff is not the same height all along.
    return e.height * (0.78 + 0.22 * this.detail.noise(x * 0.0021, 11.7)) * k
  }
  /** On an escarpment's cliff face (not in one of its ravines): impassable. */
  onCliff(x: number, z: number): boolean {
    for (const e of this.def.escarpments ?? []) {
      const s = this.escarpSide(e, x, z)
      if (Math.abs(s) < e.cliff / 2 + NAV_CELL * 0.8 && this.ravine(e, x, z) < 0.5) return true
    }
    return false
  }

  /** Distance from a point to a polyline. */
  polyDist(pts: [number, number][], x: number, z: number): number {
    let best = Infinity
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k]
      const [bx, bz] = pts[k + 1]
      if (x < Math.min(ax, bx) - 400 || x > Math.max(ax, bx) + 400 || z < Math.min(az, bz) - 400 || z > Math.max(az, bz) + 400) continue
      best = Math.min(best, distToSegment(x, z, ax, az, bx, bz))
    }
    return best
  }
  /** The unit direction of a polyline at its point nearest (x, z). */
  polyDir(pts: [number, number][], x: number, z: number): [number, number] {
    let best = Infinity
    let dir: [number, number] = [1, 0]
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k]
      const [bx, bz] = pts[k + 1]
      const d = distToSegment(x, z, ax, az, bx, bz)
      if (d < best) {
        best = d
        const l = Math.hypot(bx - ax, bz - az) || 1
        dir = [(bx - ax) / l, (bz - az) / l]
      }
    }
    return dir
  }
  /** On a great wall (not at one of its gates): impassable. */
  onRampart(x: number, z: number, pad = 0): boolean {
    for (const r of this.def.ramparts ?? []) {
      if (this.polyDist(r.points, x, z) > r.width / 2 + pad) continue
      if (r.gates.some((g) => Math.hypot(g.x - x, g.z - z) < RAMPART_GATE)) continue
      return true
    }
    return false
  }

  /** Distance to the nearest road, and that road's width (Infinity off any road). */
  roadDist(x: number, z: number): { d: number; width: number } {
    let best = Infinity
    let width = 0
    for (const road of this.def.roads ?? []) {
      const pts = road.points
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, az] = pts[k]
        const [bx, bz] = pts[k + 1]
        // Cheap reject: far from this segment's box.
        if (x < Math.min(ax, bx) - 120 || x > Math.max(ax, bx) + 120 || z < Math.min(az, bz) - 120 || z > Math.max(az, bz) + 120) continue
        const d = distToSegment(x, z, ax, az, bx, bz)
        if (d < best) {
          best = d
          width = road.width
        }
      }
    }
    return { d: best, width }
  }
  /** On a road (within its width, plus a margin). */
  onRoad(x: number, z: number, margin = 0): boolean {
    if (!this.def.roads?.length) return false
    const r = this.roadDist(x, z)
    return r.d < r.width / 2 + margin
  }

  /**
   * The great woods (old-growth forest, the Deepwood) fill their ground with trees whatever the
   * forest noise says, thinning out over a short fringe at the edge.
   */
  private woodsAt(x: number, z: number, h: number, f: number): number {
    if (h < 4 || h > 115) return f
    for (const w of this.def.features ?? []) {
      if (w.kind !== 'oldwood' && w.kind !== 'deepwood') continue
      const d = Math.hypot(x - w.x, z - w.z)
      if (d > w.r * 1.15) continue
      const full = w.kind === 'deepwood' ? 0.97 : 0.8
      f = Math.max(f, full * (1 - smoothstep(w.r * 0.8, w.r * 1.15, d)))
    }
    return f
  }
  private computeForest(x: number, z: number, h: number): number {
    if (h < 4 || h > 115) return 0
    // No woods inside a fortress.
    for (const w of this.def.walls ?? []) {
      if (!w.points) {
        if (Math.hypot(x - w.x, z - w.z) < w.r + 90) return 0
      } else if (Math.hypot(x - w.x, z - w.z) < w.r + 90 && (this.insideWall(w, x, z) || this.polyDist(this.wallLoop(w), x, z) < 90)) return 0
    }
    let f = this.forestNoise.fbm(x * 0.0035, z * 0.0035, 3)
    // Each climate is more or less wooded than the map as a whole.
    const zi = this.zoneIndex(x, z)
    const wood = this.zones[zi] * this.climates[0].forest + this.zones[zi + 1] * this.climates[1].forest + this.zones[zi + 2] * this.climates[2].forest
    if (wood < 0.02) return 0
    const density = clamp(this.def.forest_density * wood, 0, 0.98)
    f = smoothstep(0.62 - density * 0.55, 0.75 - density * 0.5, f)
    if (f <= 0) return 0
    for (const c of this.def.castles) {
      const d = Math.hypot(x - c.x, z - c.z)
      const R = castleRadius(Math.max(c.tier, Math.min(4, c.tier + 1)))
      // (A castle's country, its suburbs and fields, is cleared land.)
      f *= c.village ? smoothstep(R * 1.4, R * 2.3, d) : smoothstep(R * 1.65, R * 2.45, d)
    }
    for (const b of [...this.fords, ...this.stoneBridges]) {
      f *= smoothstep(60, 140, Math.hypot(x - b.x, z - b.z))
    }
    if (this.def.roads?.length) {
      // The road is cut through the trees, with a narrow verge either side.
      const r = this.roadDist(x, z)
      if (r.d < 200) f *= smoothstep(r.width / 2 + 8, r.width / 2 + 46, r.d)
    }
    for (const c of this.def.clearings ?? []) {
      const d = Math.hypot(x - c.x, z - c.z)
      if (d < c.r) f *= smoothstep(c.r * 0.6, c.r, d)
    }
    // A cleared strip along the great walls (and wide aprons at their gates).
    for (const r of this.def.ramparts ?? []) {
      const d = this.polyDist(r.points, x, z)
      if (d < r.width / 2 + 70) f *= smoothstep(r.width / 2 + 10, r.width / 2 + 70, d)
      for (const g of r.gates) {
        const dg = Math.hypot(g.x - x, g.z - z)
        if (dg < 220) f *= smoothstep(110, 220, dg)
      }
    }
    f *= smoothstep(4, 10, h)
    return f
  }

  /** The span across the nearest river at a point (a ford strip or a bridge deck). */
  spanAt(bx: number, bz: number): BridgeInfo {
    // Find river direction at the nearest segment; the deck spans perpendicular to it.
    let best = Infinity
    let dir = [1, 0]
    let width = 40
    let px = bx
    let pz = bz
    for (const river of this.def.rivers) {
      const pts = river.points
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, az] = pts[k]
        const [cx, cz] = pts[k + 1]
        const d = distToSegment(bx, bz, ax, az, cx, cz)
        if (d < best) {
          best = d
          const len = Math.hypot(cx - ax, cz - az)
          dir = [(cx - ax) / len, (cz - az) / len]
          width = river.width
          const t = clamp(((bx - ax) * (cx - ax) + (bz - az) * (cz - az)) / (len * len), 0, 1)
          px = ax + (cx - ax) * t
          pz = az + (cz - az) * t
        }
      }
    }
    return { x: px, z: pz, dirX: -dir[1], dirZ: dir[0], length: width + 110, width: 26 }
  }

  /**
   * Level a patch of ground for a village or other holding (generated after the
   * height field): a gentle terrace at the average height, easing back into the
   * land around it, so the compound and its fields sit on the ground instead of
   * floating over one side of a slope and burying the other.
   */
  levelGround(x: number, z: number, r: number) {
    let sum = this.heightAt(x, z)
    let n = 1
    for (let k = 0; k < 12; k++) {
      sum += this.heightAt(x + Math.cos((k / 12) * Math.PI * 2) * r * 0.6, z + Math.sin((k / 12) * Math.PI * 2) * r * 0.6)
      n++
    }
    const level = Math.max(4, sum / n)
    const R = r * 1.6
    const i0 = Math.max(0, Math.floor((x - R + this.half) / this.cell))
    const i1 = Math.min(this.hRes - 1, Math.ceil((x + R + this.half) / this.cell))
    const j0 = Math.max(0, Math.floor((z - R + this.half) / this.cell))
    const j1 = Math.min(this.hRes - 1, Math.ceil((z + R + this.half) / this.cell))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-this.half + i * this.cell - x, -this.half + j * this.cell - z)
        if (d >= R) continue
        const k = j * this.hRes + i
        const h = this.heights[k]
        // Never raise the bed of a river or lake: only the dry land is levelled.
        if (h < 2) continue
        this.heights[k] = lerp(level, h, smoothstep(r, R, d))
      }
    }
  }

  /** Bilinear sample of the precomputed height field (terrain surface, ignoring bridges). */
  heightAt(x: number, z: number): number {
    const fx = clamp((x + this.half) / this.cell, 0, this.hRes - 1.001)
    const fz = clamp((z + this.half) / this.cell, 0, this.hRes - 1.001)
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    const tx = fx - i
    const tz = fz - j
    const r = this.hRes
    const h00 = this.heights[j * r + i]
    const h10 = this.heights[j * r + i + 1]
    const h01 = this.heights[(j + 1) * r + i]
    const h11 = this.heights[(j + 1) * r + i + 1]
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz)
  }

  forestAt(x: number, z: number): number {
    const i = clamp(Math.round((x + this.half) / this.cell), 0, this.hRes - 1)
    const j = clamp(Math.round((z + this.half) / this.cell), 0, this.hRes - 1)
    return this.forest[j * this.hRes + i]
  }

  /** Bridges that have been burned (indices into `bridges`). Units cannot cross them. */
  readonly broken = new Set<number>()

  /** Burn or rebuild a bridge: updates the navigation grid around it. */
  /** Bumped whenever a bridge goes up or comes down (wagons re-plan their road). */
  bridgeVersion = 0
  setBridgeBroken(index: number, broken: boolean) {
    const b = this.bridges[index]
    if (!b) return
    this.bridgeVersion++
    if (broken) this.broken.add(index)
    else this.broken.delete(index)
    const R = this.navRes
    const reach = b.length / 2 + 30
    const [i0, j0] = this.navIndex(b.x - reach, b.z - reach)
    const [i1, j1] = this.navIndex(b.x + reach, b.z + reach)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = -this.half + (i + 0.5) * NAV_CELL
        const z = -this.half + (j + 0.5) * NAV_CELL
        this.navCost[j * R + i] = this.cellCost(x, z)
      }
    }
    this.components = null
  }

  /** Throw a new bridge across the river at this point; returns its index. */
  addBridge(x: number, z: number): number {
    this.bridges.push(this.spanAt(x, z))
    const index = this.bridges.length - 1
    this.setBridgeBroken(index, false)
    return index
  }

  fordAt(x: number, z: number, margin = 0): BridgeInfo | null {
    for (const f of this.fords) {
      const dx = x - f.x
      const dz = z - f.z
      const along = dx * f.dirX + dz * f.dirZ
      const across = -dx * f.dirZ + dz * f.dirX
      if (Math.abs(along) < f.length / 2 + margin && Math.abs(across) < f.width / 2 + 20 + margin) return f
    }
    return null
  }

  /** The terrain feature at a point, if any. */
  featureAt(x: number, z: number): TerrainFeature | null {
    for (const f of this.def.features ?? []) {
      if (Math.abs(x - f.x) > f.r || Math.abs(z - f.z) > f.r) continue
      if (Math.hypot(x - f.x, z - f.z) < f.r) return f
    }
    return null
  }
  /** What hides a band of men here, if anything: woods, a thicket, a river valley or a mountain's flank. */
  coverAt(x: number, z: number): 'woods' | 'thicket' | 'valley' | 'mountain' | null {
    if (this.forestAt(x, z) > 0.3) return 'woods'
    const f = this.featureKindAt(x, z)
    if (f === 'thicket') return 'thicket'
    if (f === 'oldwood' || f === 'deepwood') return 'woods'
    if (f === 'crag') return 'mountain'
    for (const m of this.def.mountains) if (Math.hypot(x - m.x, z - m.z) < m.r * 1.3) return 'mountain'
    const { d, width } = this.distToRiver(x, z)
    if (d < width * 0.5 + 150) return 'valley'
    return null
  }
  featureKindAt(x: number, z: number): FeatureKind | null {
    return this.featureAt(x, z)?.kind ?? null
  }

  /** Every place an army can cross a river: fords and standing bridges. */
  crossings(): BridgeInfo[] {
    return [...this.fords, ...this.stoneBridges, ...this.bridges.filter((_, i) => !this.broken.has(i))]
  }

  bridgeAt(x: number, z: number, margin = 0): BridgeInfo | null {
    for (const b of this.stoneBridges) {
      const dx = x - b.x
      const dz = z - b.z
      const along = dx * b.dirX + dz * b.dirZ
      const across = -dx * b.dirZ + dz * b.dirX
      if (Math.abs(along) < b.length / 2 + margin && Math.abs(across) < b.width / 2 + margin) return b
    }
    for (let k = 0; k < this.bridges.length; k++) {
      if (this.broken.has(k)) continue
      const b = this.bridges[k]
      const dx = x - b.x
      const dz = z - b.z
      const along = dx * b.dirX + dz * b.dirZ
      const across = -dx * b.dirZ + dz * b.dirX
      if (Math.abs(along) < b.length / 2 + margin && Math.abs(across) < b.width / 2 + margin) return b
    }
    return null
  }

  /** Height a unit stands at: on the bridge deck if crossing, otherwise the ground. */
  surfaceAt(x: number, z: number): number {
    const h = this.heightAt(x, z)
    if (h < BRIDGE_DECK + 1 && this.bridgeAt(x, z, 4)) return Math.max(h, BRIDGE_DECK)
    return Math.max(h, WATER_LEVEL)
  }

  slopeAt(x: number, z: number): number {
    const e = this.cell
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z)
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e)
    return Math.sqrt(dx * dx + dz * dz) / (2 * e)
  }

  /** Movement speed multiplier at a point. */
  speedAt(x: number, z: number): number {
    if (this.bridgeAt(x, z)) return 1
    if (this.fordAt(x, z)) return FORD_SPEED
    if (this.frozen && this.heightAt(x, z) < 2.5 && this.iceZone(x, z)) return ICE.speed
    const f = this.forestAt(x, z)
    const s = this.slopeAt(x, z)
    const base = clamp(1 - f * 0.35 - s * 0.6, 0.45, 1.1) * this.rulesAt(x, z).speed
    // Terrain features: stones and the old woods slow the step.
    const k = this.def.features?.length ? this.featureKindAt(x, z) : null
    if (k === 'stones') return base * 0.85
    if (k === 'oldwood') return base * 0.9
    return base
  }

  /** Defensive multiplier for troops standing here (forests and hills help). */
  defenseAt(x: number, z: number): number {
    return 1 + this.forestAt(x, z) * 0.15 + clamp((this.heightAt(x, z) - 30) / 200, 0, 0.15)
  }

  // -------------------------------------------------------------------------
  // Colours (used by terrain mesh and minimap)
  // -------------------------------------------------------------------------

  /** Index of the zone weights for the height cell nearest a point. */
  private zoneIndex(x: number, z: number): number {
    const i = clamp(Math.round((x + this.half) / this.cell), 0, this.hRes - 1)
    const j = clamp(Math.round((z + this.half) / this.cell), 0, this.hRes - 1)
    return (j * this.hRes + i) * 3
  }
  /** Weights of the map's three climates at a point. */
  zoneWeightsAt(x: number, z: number): [number, number, number] {
    const k = this.zoneIndex(x, z)
    return [this.zones[k], this.zones[k + 1], this.zones[k + 2]]
  }
  /** The climate that holds sway at a point. */
  climateAt(x: number, z: number): Climate {
    const k = this.zoneIndex(x, z)
    const a = this.zones[k]
    const b = this.zones[k + 1]
    const c = this.zones[k + 2]
    return a >= b && a >= c ? this.climates[0] : b >= c ? this.climates[1] : this.climates[2]
  }
  /** The local rules of the ground (supply, speed, mud, winter). */
  rulesAt(x: number, z: number): ClimateRules {
    return this.climateAt(x, z).rules
  }
  private pal = { grassA: [0, 0, 0], grassB: [0, 0, 0], forestFloor: [0, 0, 0], sand: [0, 0, 0], rock: [0, 0, 0], earth: [0, 0, 0], snowLine: 0, snowCover: 0 }
  /** The three climates' palettes blended by their weights here. */
  private paletteAt(x: number, z: number) {
    const k = this.zoneIndex(x, z)
    const w = [this.zones[k], this.zones[k + 1], this.zones[k + 2]]
    const P = this.pal
    for (const key of ['grassA', 'grassB', 'forestFloor', 'sand', 'rock', 'earth'] as const) {
      const o = P[key]
      o[0] = o[1] = o[2] = 0
      for (let z2 = 0; z2 < 3; z2++) {
        const src = this.climates[z2][key]
        o[0] += src[0] * w[z2]
        o[1] += src[1] * w[z2]
        o[2] += src[2] * w[z2]
      }
    }
    P.snowLine = 0
    P.snowCover = 0
    for (let z2 = 0; z2 < 3; z2++) {
      P.snowLine += Math.min(400, this.climates[z2].snowLine) * w[z2]
      P.snowCover += this.climates[z2].snowCover * w[z2]
    }
    return P
  }

  colorAt(x: number, z: number, out: [number, number, number]): [number, number, number] {
    const B = this.paletteAt(x, z)
    const h = this.heightAt(x, z)
    const slope = this.slopeAt(x, z)
    const n = this.detail.noise(x * 0.004, z * 0.004)
    const n2 = this.detail.noise(x * 0.03 + 50, z * 0.03)
    // Base ground, blending the biome's two grass tones.
    const t0 = smoothstep(-0.4, 0.8, n)
    let r = lerp(B.grassA[0], B.grassB[0], t0) + n2 * 0.025
    let g = lerp(B.grassA[1], B.grassB[1], t0) + n2 * 0.03
    let b = lerp(B.grassA[2], B.grassB[2], t0) + n2 * 0.02
    // Forest floor.
    const f = this.forestAt(x, z)
    r = lerp(r, B.forestFloor[0], f * 0.75)
    g = lerp(g, B.forestFloor[1], f * 0.75)
    b = lerp(b, B.forestFloor[2], f * 0.75)
    // The great woods: a deep, mossy floor under the old giants; dark loam and needles in the Deepwood.
    for (const w of this.def.features ?? []) {
      if (w.kind !== 'oldwood' && w.kind !== 'deepwood') continue
      const d = Math.hypot(x - w.x, z - w.z)
      if (d > w.r * 1.1) continue
      const t = 1 - smoothstep(w.r * 0.75, w.r * 1.1, d)
      if (w.kind === 'oldwood') {
        r = lerp(r, 0.26 + n2 * 0.03, t * 0.45)
        g = lerp(g, 0.34 + n2 * 0.04, t * 0.45)
        b = lerp(b, 0.15, t * 0.45)
      } else {
        r = lerp(r, r * 0.62, t)
        g = lerp(g, g * 0.66, t)
        b = lerp(b, b * 0.7, t)
      }
    }
    // Banks.
    const sand = 1 - smoothstep(2, 7, h)
    r = lerp(r, B.sand[0], sand)
    g = lerp(g, B.sand[1], sand)
    b = lerp(b, B.sand[2], sand)
    if (h < 0) {
      const t = smoothstep(0, -6, h)
      r = lerp(B.sand[0] * 0.8, B.sand[0] * 0.45, t)
      g = lerp(B.sand[1] * 0.8, B.sand[1] * 0.55, t)
      b = lerp(B.sand[2] * 0.8, B.sand[2] * 0.65, t)
    }
    // Rock on steep or high ground, snow on peaks.
    const rock = Math.max(smoothstep(0.55, 1.1, slope), smoothstep(90, 140, h))
    r = lerp(r, B.rock[0] + n2 * 0.04, rock)
    g = lerp(g, B.rock[1] + n2 * 0.04, rock)
    b = lerp(b, B.rock[2] + n2 * 0.04, rock)
    const snow = Math.max(smoothstep(B.snowLine, B.snowLine + 35, h + n * 18), B.snowCover * smoothstep(0.1, 0.5, n * 0.5 + 0.5 + n2 * 0.3) * (1 - sand)) * (1 - smoothstep(1.2, 2, slope))
    // (A royal city stands raised on its terraces, but the snowline does not reach inside its walls.)
    let walled = 0
    for (const t of this.towns) walled = Math.max(walled, 1 - smoothstep(t.r - 20, t.r + 60, Math.hypot(x - t.x, z - t.z)))
    // (Little snow lies under the canopy of the great woods.)
    let woods = 0
    for (const w of this.def.features ?? []) if (w.kind === 'oldwood' || w.kind === 'deepwood') woods = Math.max(woods, 1 - smoothstep(w.r * 0.7, w.r * 1.05, Math.hypot(x - w.x, z - w.z)))
    const snowK = snow * (1 - walled) * (1 - woods * 0.75)
    r = lerp(r, 0.93, snowK)
    g = lerp(g, 0.94, snowK)
    b = lerp(b, 0.97, snowK)
    // Town ground: packed earth and cobbled streets.
    for (const town of this.towns) {
      const d = Math.hypot(x - town.x, z - town.z)
      if (d < town.r + 30) {
        const ang = Math.atan2(z - town.z, x - town.x)
        let street = Math.abs(d - (town.inner + town.r) / 2) < 14 ? 1 : 0
        for (const s of town.streets) if (Math.abs(Math.atan2(Math.sin(ang - s), Math.cos(ang - s))) * d < 16) street = 1
        const t = 1 - smoothstep(town.r - 10, town.r + 30, d)
        const c = street ? 0.5 : 0.42
        r = lerp(r, street ? 0.56 : B.earth[0] * 0.95, t)
        g = lerp(g, street ? 0.53 : B.earth[1] * 0.95, t)
        b = lerp(b, street ? 0.48 : B.earth[2] * 0.95 + (c - 0.42) * 0.1, t)
      }
    }
    // The great walls: grey stone (so they read on every map), tumbled rubble at the breaches.
    if (this.def.ramparts?.length) {
      for (const rp of this.def.ramparts) {
        const d = this.polyDist(rp.points, x, z)
        if (d > rp.width / 2 + 8) continue
        const gate = rp.gates.find((gt) => Math.hypot(gt.x - x, gt.z - z) < RAMPART_GATE)
        const t = 1 - smoothstep(rp.width / 2, rp.width / 2 + 8, d)
        const [cr, cg, cb] = gate ? (gate.breach ? [0.5, 0.47, 0.42] : [0.46, 0.4, 0.31]) : [0.36, 0.35, 0.36]
        r = lerp(r, cr, t)
        g = lerp(g, cg, t)
        b = lerp(b, cb, t)
      }
    }
    // Roads: packed earth with paler wheel ruts.
    if (this.def.roads?.length) {
      const rd = this.roadDist(x, z)
      const t = 1 - smoothstep(rd.width / 2 - 4, rd.width / 2 + 6, rd.d)
      if (t > 0 && h > 1) {
        const rut = Math.abs(rd.d - rd.width * 0.22) < 2.2 ? 0.05 : 0
        r = lerp(r, B.earth[0] * 0.82 + rut, t * 0.92)
        g = lerp(g, B.earth[1] * 0.78 + rut, t * 0.92)
        b = lerp(b, B.earth[2] * 0.72 + rut * 0.8, t * 0.92)
      }
    }
    // Plateaus around castles get trampled earth.
    for (const c of this.def.castles) {
      const d = Math.hypot(x - c.x, z - c.z)
      const R = castleRadius(c.tier)
      const t = (1 - smoothstep(R * 0.9, R * 1.45, d)) * 0.65
      if (t > 0) {
        r = lerp(r, B.earth[0], t)
        g = lerp(g, B.earth[1], t)
        b = lerp(b, B.earth[2], t)
      }
    }
    out[0] = r
    out[1] = g
    out[2] = b
    return out
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  private buildNav() {
    const R = this.navRes
    for (let j = 0; j < R; j++) {
      for (let i = 0; i < R; i++) {
        const x = -this.half + (i + 0.5) * NAV_CELL
        const z = -this.half + (j + 0.5) * NAV_CELL
        this.navCost[j * R + i] = this.cellCost(x, z)
      }
    }
  }

  /**
   * Castle curtain walls (by castle id), (a city's gatehouses and wards stand in the city's own
   * walls: no curtain of their own). Impassable except at the four gates.
   */
  readonly walls = new Map<string, CastleShape>()

  /**
   * Read a castle's site and lay out its walls so the site shows in them:
   *   river / lake: a straight curtain along the bank on the water side (with a water gate), the
   *                 landward side bulging out;
   *   hill:         drawn out along the ridge and hugging the brow of the hill;
   *   plain:        an irregular polygon, its corners at the towers.
   * The main gate faces the heart of the map (on the water, the landward side).
   */
  private planCastle(c: { id: string; x: number; z: number; tier: number; capital?: boolean }): CastleShape {
    const R0 = wallRadius(c.tier)
    // A royal city's Citadel is built to its own round design, its gates to the four quarters.
    if (c.capital && c.tier >= ROYAL_SEAT_TIER && this.towns.some((t) => t.poly && Math.hypot(t.x - c.x, t.z - c.z) < t.r)) {
      const level = Math.max(10, 16 + this.noise.fbm(c.x * 0.0014, c.z * 0.0014, 4) * 22) + 2
      return { x: c.x, z: c.z, r: R0, rot: 0, gates: [0, Math.PI / 2, Math.PI, -Math.PI / 2], prof: new Float32Array(PROF_N).fill(1), site: 'plain', level, corners: [] }
    }
    let seed = 7
    for (const ch of c.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
    const rnd = mulberry32(seed ^ Math.round(c.x * 13 + c.z * 7))
    const R = R0
    const cr = castleRadius(c.tier)
    const nat = (x: number, z: number) => this.terrainHeight(x, z, true)
    const h0 = nat(c.x, c.z)
    const ringH: number[] = []
    let wetX = 0
    let wetZ = 0
    let wet = 0
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2
      ringH.push(nat(c.x + Math.cos(a) * cr * 1.35, c.z + Math.sin(a) * cr * 1.35))
      for (const rr of [0.95, 1.2, 1.45, 1.7, 1.95])
        if (nat(c.x + Math.cos(a) * cr * rr, c.z + Math.sin(a) * cr * rr) < 3) {
          wet++
          wetX += Math.cos(a)
          wetZ += Math.sin(a)
        }
    }
    const ring = ringH.reduce((a, b) => a + b, 0) / ringH.length
    const site: CastleSite = wet > 0 ? (this.distToRiver(c.x, c.z).d < cr * 2.2 ? 'river' : 'lake') : h0 - ring > 4 ? 'hill' : 'plain'
    const prof = new Float32Array(PROF_N)
    const angOf = (i: number) => (i / PROF_N) * Math.PI * 2
    let corners: number[] = []
    let water: number | undefined
    let axis: number | undefined
    let rot = Math.atan2(-c.z, -c.x) + (rnd() - 0.5) * 0.5
    const swell = (a: number, amp: number, ph: number[]) => 1 + amp * Math.sin(2 * a + ph[0]) + amp * 0.6 * Math.sin(3 * a + ph[1])
    const ph = [rnd() * 6.28, rnd() * 6.28]
    if (site === 'plain') {
      // An irregular polygon: five to seven corners, each pushed in or out, one or two salients.
      const n = 5 + Math.floor(rnd() * 3)
      const base = rnd() * Math.PI * 2
      const verts: [number, number][] = []
      for (let k = 0; k < n; k++) {
        const a = base + ((k + (rnd() - 0.5) * 0.5) / n) * Math.PI * 2
        const r = (k % 3 === 0 ? 1.08 : 0.9) + rnd() * 0.16
        verts.push([Math.cos(a) * r, Math.sin(a) * r])
        corners.push(a)
      }
      for (let i = 0; i < PROF_N; i++) prof[i] = rayPoly(verts, angOf(i))
    } else if (site === 'hill') {
      // Along the ridge: the bearing where the ground stays highest on both sides.
      let best = 0
      let bv = -Infinity
      for (let k = 0; k < 12; k++) {
        const v = ringH[k] + ringH[k + 12]
        if (v > bv) {
          bv = v
          best = (k / 24) * Math.PI * 2
        }
      }
      axis = best
      const A = 1.2
      const B = 0.82
      for (let i = 0; i < PROF_N; i++) {
        const a = angOf(i)
        const da = a - axis
        let k = 1 / Math.sqrt((Math.cos(da) / A) ** 2 + (Math.sin(da) / B) ** 2)
        // And hug the brow: where the ground starts to fall away most steeply.
        let brow = k
        let drop = -Infinity
        for (let q = k - 0.14; q <= k + 0.1; q += 0.02) {
          const d = R * q
          const dd = nat(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d) - nat(c.x + Math.cos(a) * (d + 24), c.z + Math.sin(a) * (d + 24))
          if (dd > drop) {
            drop = dd
            brow = q
          }
        }
        k = k * 0.5 + brow * 0.5
        prof[i] = k * (1 + 0.04 * Math.sin(3 * a + ph[0]))
      }
      // The ends of the ridge get the gates' main road; the main gate down the gentler end.
      rot = ringH[Math.round((axis / (Math.PI * 2)) * 24) % 24] < ringH[(Math.round((axis / (Math.PI * 2)) * 24) + 12) % 24] ? axis : axis + Math.PI
    } else {
      // On the water: a straight curtain along the bank, the landward side bulging out.
      water = Math.atan2(wetZ, wetX)
      // Where the water begins on that side: the wall runs out to stand on the bank itself (a quay
      // below it) when the water is near enough, else it squares off facing it.
      let edge = Infinity
      for (let q = 0.6; q <= 1.6; q += 0.02) {
        if (nat(c.x + Math.cos(water) * R * q, c.z + Math.sin(water) * R * q) < 3.2) {
          edge = q
          break
        }
      }
      const bank = edge < 1.42 ? clamp(edge - 16 / R, 0.72, 1.2) : 1
      for (let i = 0; i < PROF_N; i++) {
        const a = angOf(i)
        const da = Math.atan2(Math.sin(a - water), Math.cos(a - water))
        const land = swell(a, 0.05, ph) * (1.04 + 0.1 * (1 - Math.cos(da)) * 0.5)
        const line = Math.cos(da) > 0.05 ? bank / Math.cos(da) : Infinity
        prof[i] = Math.min(land, line)
      }
      // Where the bank wall meets the landward ring: corner towers.
      for (let i = 0; i < PROF_N; i++) {
        const a = angOf(i)
        const da = Math.atan2(Math.sin(a - water), Math.cos(a - water))
        const land = swell(a, 0.05, ph) * (1.04 + 0.1 * (1 - Math.cos(da)) * 0.5)
        const prev = angOf((i + PROF_N - 1) % PROF_N)
        const dp = Math.atan2(Math.sin(prev - water), Math.cos(prev - water))
        const landP = swell(prev, 0.05, ph) * (1.04 + 0.1 * (1 - Math.cos(dp)) * 0.5)
        const onLine = (x: number, l: number) => x < l - 0.005
        if (onLine(prof[i], land) !== onLine(prof[(i + PROF_N - 1) % PROF_N], landP)) corners.push(a)
      }
      rot = water + Math.PI + (rnd() - 0.5) * 0.4
      // Anywhere else the water comes close, keep the wall back from it (on the bank: just clear of it).
      for (let i = 0; i < PROF_N; i++) {
        const a = angOf(i)
        for (let q = prof[i]; q >= 0.72; q -= 0.02) {
          if (nat(c.x + Math.cos(a) * (R * q + 10), c.z + Math.sin(a) * (R * q + 10)) >= 3.5) {
            prof[i] = Math.min(prof[i], q)
            break
          }
          if (q <= 0.73) prof[i] = 0.72
        }
      }
    }
    if (site !== 'plain') {
      const o = Float32Array.from(prof)
      for (let i = 0; i < PROF_N; i++) prof[i] = (o[(i + PROF_N - 1) % PROF_N] + 2 * o[i] + o[(i + 1) % PROF_N]) / 4
    }
    const gates = [0, 1, 2, 3].map((g) => rot + (g * Math.PI) / 2)
    // A gateway passes straight through: the wall runs evenly just across it.
    for (const g of gates) {
      const at = profOf(prof, g)
      for (let i = 0; i < PROF_N; i++) {
        const off = Math.abs(Math.atan2(Math.sin(angOf(i) - g), Math.cos(angOf(i) - g)))
        const w = 1 - smoothstep(0.05, 0.16, off)
        prof[i] = prof[i] * (1 - w) + at * w
      }
    }
    for (let i = 0; i < PROF_N; i++) prof[i] = clamp(prof[i], 0.72, 1.22)
    // (No corner tower in a gateway.)
    corners = corners.filter((a) => gates.every((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) > 0.3))
    const plain = Math.max(10, 16 + this.noise.fbm(c.x * 0.0014, c.z * 0.0014, 4) * 22) + 2
    // A hill castle crowns its hill; anywhere else the plateau is levelled at the land's own height.
    const level = site === 'hill' ? Math.max(plain, h0 + 2) : plain
    return { x: c.x, z: c.z, r: R, rot, gates, prof, site, level, corners, water, axis }
  }

  /** On a castle's wall band, outside the gate passages? */
  onCastleWall(x: number, z: number): boolean {
    for (const w of this.walls.values()) {
      const dx = x - w.x
      const dz = z - w.z
      const reach = w.r * 1.25 + 14
      if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue
      const d = Math.hypot(dx, dz)
      if (Math.abs(d - wallRAt(w, Math.atan2(dz, dx))) > 13) continue
      // A gate passage: within GATE_HALF of the line out through a gate.
      if (w.gates.some((g) => dx * Math.cos(g) + dz * Math.sin(g) > 0 && Math.abs(-dx * Math.sin(g) + dz * Math.cos(g)) < GATE_HALF)) continue
      return true
    }
    return false
  }

  /** The gate of a castle nearest to a point (where armies come and go). */
  gateOf(castleId: string, towardX: number, towardZ: number): [number, number] | null {
    const w = this.walls.get(castleId)
    if (!w) return null
    const toward = Math.atan2(towardZ - w.z, towardX - w.x)
    let g = w.gates[0]
    let best = Infinity
    for (const a of w.gates) {
      const off = Math.abs(Math.atan2(Math.sin(toward - a), Math.cos(toward - a)))
      if (off < best) {
        best = off
        g = a
      }
    }
    const r = wallRAt(w, g) + 26
    return [w.x + Math.cos(g) * r, w.z + Math.sin(g) * r]
  }

  /** A castle grew (or a save restored its tier): move its walls and replan the cells around. */
  setCastleTier(castleId: string, tier: number) {
    const w = this.walls.get(castleId)
    if (!w) return
    const before = w.r
    w.r = wallRadius(tier)
    if (before === w.r || !this.navCost.length) return
    const reach = Math.max(before, w.r) + 30
    const [i0, j0] = this.navIndex(w.x - reach, w.z - reach)
    const [i1, j1] = this.navIndex(w.x + reach, w.z + reach)
    const R = this.navRes
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        this.navCost[j * R + i] = this.cellCost(-this.half + (i + 0.5) * NAV_CELL, -this.half + (j + 0.5) * NAV_CELL)
      }
    }
    this.components = null
  }

  /** True if the point lies on a curtain wall (outside its gate openings). */
  /** A city wall's outline as a closed loop (for outline walls). */
  wallLoop(w: CityWall): [number, number][] {
    const p = w.points!
    return [...p, p[0]]
  }
  /** Is (x, z) inside a city wall? */
  insideWall(w: CityWall, x: number, z: number): boolean {
    if (!w.points) return Math.hypot(x - w.x, z - w.z) < w.r
    const p = w.points
    let inside = false
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, zi] = p[i]
      const [xj, zj] = p[j]
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
    }
    return inside
  }
  onWall(x: number, z: number, pad = 0): boolean {
    for (const w of this.def.walls ?? []) {
      if (w.points) {
        if (Math.abs(x - w.x) > w.r + 40 || Math.abs(z - w.z) > w.r + 40) continue
        if (this.polyDist(this.wallLoop(w), x, z) > 16 + pad) continue
        if (!(w.gatePts ?? []).some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 62)) return true
        continue
      }
      const d = Math.hypot(x - w.x, z - w.z)
      if (Math.abs(d - w.r) > 16 + pad) continue
      const ang = Math.atan2(z - w.z, x - w.x)
      const gateHalf = 62 / w.r
      const inGate = w.gates.some((g) => Math.abs(Math.atan2(Math.sin(ang - g), Math.cos(ang - g))) < gateHalf)
      if (!inGate) return true
    }
    return false
  }

  private cellCost(x: number, z: number): number {
    const edge = Math.max(Math.abs(x), Math.abs(z))
    if (edge > this.half - 60) return 0
    if (this.onWall(x, z, 4)) return 0
    if (this.onCastleWall(x, z)) return 0
    // (A broad band of blocked cells: a thin diagonal line of them would let paths slip between corners.)
    if (this.def.ramparts?.length && this.onRampart(x, z, NAV_CELL * 0.8)) return 0
    if (this.def.escarpments?.length && this.onCliff(x, z)) return 0
    if (this.bridgeAt(x, z, 6)) return 1
    if (this.fordAt(x, z, 4)) return 2.2
    // Deep Freeze: the river (and its steep banks) can be crossed anywhere on the ice.
    if (this.frozen && this.iceZone(x, z) && this.heightAt(x, z) <= 125) return ICE.cost
    const h = this.heightAt(x, z)
    if (h < 2.5) return 0
    if (h > 125) return 0
    const slope = this.slopeAt(x, z)
    if (slope > 1.25) return 0
    // Roads are the quick way through.
    if (this.def.roads?.length && this.onRoad(x, z, 6)) return 0.7 + slope
    // The Deepwood is slow going: a host goes round unless the way through is much shorter.
    const k = this.def.features?.length ? this.featureKindAt(x, z) : null
    return 1 + this.forestAt(x, z) * 0.6 + slope * 1.5 + (k === 'deepwood' ? 1.4 : k === 'oldwood' ? 0.3 : 0)
  }

  private navIndex(x: number, z: number): [number, number] {
    const R = this.navRes
    return [
      clamp(Math.floor((x + this.half) / NAV_CELL), 0, R - 1),
      clamp(Math.floor((z + this.half) / NAV_CELL), 0, R - 1),
    ]
  }

  isPassable(x: number, z: number): boolean {
    const [i, j] = this.navIndex(x, z)
    return this.navCost[j * this.navRes + i] > 0
  }

  nearestPassable(x: number, z: number): [number, number] {
    if (this.isPassable(x, z)) return [x, z]
    for (let r = NAV_CELL; r < 600; r += NAV_CELL) {
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos((a / 16) * Math.PI * 2) * r
        const pz = z + Math.sin((a / 16) * Math.PI * 2) * r
        if (this.isPassable(px, pz)) return [px, pz]
      }
    }
    return [x, z]
  }

  private lineClear(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az)
    const steps = Math.ceil(d / (NAV_CELL * 0.4))
    for (let s = 1; s < steps; s++) {
      const t = s / steps
      const x = ax + (bx - ax) * t
      const z = az + (bz - az) * t
      if (!this.isPassable(x, z)) return false
      // Avoid shortcuts straight through forests: only skip when cost is low.
      const [i, j] = this.navIndex(x, z)
      if (this.navCost[j * this.navRes + i] > 1.5) return false
    }
    return true
  }

  private components: Int32Array | null = null
  private pf: { g: Float32Array; came: Int32Array; seen: Uint32Array; shut: Uint32Array; gen: number } | null = null

  /** True if a land route exists between the two points (flood-fill labels, computed once). */
  connected(ax: number, az: number, bx: number, bz: number): boolean {
    const R = this.navRes
    if (!this.components) {
      const comp = new Int32Array(R * R).fill(-1)
      let label = 0
      const stack: number[] = []
      for (let s = 0; s < R * R; s++) {
        if (comp[s] !== -1 || this.navCost[s] <= 0) continue
        comp[s] = label
        stack.push(s)
        while (stack.length) {
          const c = stack.pop()!
          const ci = c % R
          const cj = (c - ci) / R
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ni = ci + di
            const nj = cj + dj
            if (ni < 0 || nj < 0 || ni >= R || nj >= R) continue
            const n = nj * R + ni
            if (comp[n] !== -1 || this.navCost[n] <= 0) continue
            comp[n] = label
            stack.push(n)
          }
        }
        label++
      }
      this.components = comp
    }
    const [ai, aj] = this.navIndex(...this.nearestPassable(ax, az))
    const [bi, bj] = this.navIndex(...this.nearestPassable(bx, bz))
    const ca = this.components[aj * R + ai]
    return ca >= 0 && ca === this.components[bj * R + bi]
  }

  /** A* over the navigation grid, with string-pulling. Returns waypoints (excluding the start). */
  findPath(sx: number, sz: number, tx: number, tz: number): [number, number][] {
    const [ex, ez] = this.nearestPassable(tx, tz)
    if (this.lineClear(sx, sz, ex, ez)) return [[ex, ez]]
    // Unreachable (another island, a burned bridge): don't flood the whole map.
    if (!this.connected(sx, sz, ex, ez)) return [[ex, ez]]
    const R = this.navRes
    const [si, sj] = this.navIndex(...this.nearestPassable(sx, sz))
    const [gi, gj] = this.navIndex(ex, ez)
    const start = sj * R + si
    const goal = gj * R + gi
    const N = R * R
    // Scratch buffers are reused between searches; a generation stamp marks which entries are live.
    if (!this.pf || this.pf.g.length !== N) this.pf = { g: new Float32Array(N), came: new Int32Array(N), seen: new Uint32Array(N), shut: new Uint32Array(N), gen: 0 }
    const pf = this.pf
    const gen = ++pf.gen
    const gScore = pf.g
    const came = pf.came
    const seen = pf.seen
    const shut = pf.shut
    const heap = new MinHeap()
    gScore[start] = 0
    came[start] = -1
    seen[start] = gen
    heap.push(start, 0)
    const SQ2 = Math.SQRT2
    let found = false
    while (heap.size > 0) {
      const cur = heap.pop()
      if (cur === goal) {
        found = true
        break
      }
      if (shut[cur] === gen) continue
      shut[cur] = gen
      const ci = cur % R
      const cj = (cur - ci) / R
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue
          const ni = ci + di
          const nj = cj + dj
          if (ni < 0 || nj < 0 || ni >= R || nj >= R) continue
          const nIdx = nj * R + ni
          const c = this.navCost[nIdx]
          if (c <= 0 || shut[nIdx] === gen) continue
          if (di && dj && (this.navCost[cj * R + ni] <= 0 || this.navCost[nj * R + ci] <= 0)) continue
          const g = gScore[cur] + c * (di && dj ? SQ2 : 1)
          if (seen[nIdx] !== gen || g < gScore[nIdx]) {
            seen[nIdx] = gen
            gScore[nIdx] = g
            came[nIdx] = cur
            const hx = Math.abs(ni - gi)
            const hz = Math.abs(nj - gj)
            heap.push(nIdx, g + (hx + hz + (SQ2 - 2) * Math.min(hx, hz)))
          }
        }
      }
    }
    if (!found) return [[ex, ez]]
    const cells: [number, number][] = []
    for (let c = goal; c !== -1 && c !== start; c = came[c]) {
      const i = c % R
      const j = (c - i) / R
      cells.push([-this.half + (i + 0.5) * NAV_CELL, -this.half + (j + 0.5) * NAV_CELL])
    }
    cells.reverse()
    cells[cells.length - 1] = [ex, ez]
    // String pulling.
    const out: [number, number][] = []
    let ax = sx
    let az = sz
    let k = 0
    while (k < cells.length) {
      let far = k
      // Look a limited way ahead: long roads are smoothed in stretches, not all at once.
      for (let m = Math.min(cells.length - 1, k + 48); m > k; m--) {
        if (this.lineClear(ax, az, cells[m][0], cells[m][1])) {
          far = m
          break
        }
      }
      out.push(cells[far])
      ax = cells[far][0]
      az = cells[far][1]
      k = far + 1
    }
    return out
  }
}

export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax
  const vz = bz - az
  const len2 = vx * vx + vz * vz
  const t = len2 > 0 ? clamp(((px - ax) * vx + (pz - az) * vz) / len2, 0, 1) : 0
  const dx = px - (ax + vx * t)
  const dz = pz - (az + vz * t)
  return Math.sqrt(dx * dx + dz * dz)
}

class MinHeap {
  private ids: number[] = []
  private pri: number[] = []
  get size() {
    return this.ids.length
  }
  push(id: number, p: number) {
    const ids = this.ids
    const pri = this.pri
    ids.push(id)
    pri.push(p)
    let i = ids.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (pri[parent] <= pri[i]) break
      ;[ids[i], ids[parent]] = [ids[parent], ids[i]]
      ;[pri[i], pri[parent]] = [pri[parent], pri[i]]
      i = parent
    }
  }
  pop(): number {
    const ids = this.ids
    const pri = this.pri
    const top = ids[0]
    const lastId = ids.pop()!
    const lastP = pri.pop()!
    if (ids.length > 0) {
      ids[0] = lastId
      pri[0] = lastP
      let i = 0
      const n = ids.length
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < n && pri[l] < pri[m]) m = l
        if (r < n && pri[r] < pri[m]) m = r
        if (m === i) break
        ;[ids[i], ids[m]] = [ids[m], ids[i]]
        ;[pri[i], pri[m]] = [pri[m], pri[i]]
        i = m
      }
    }
    return top
  }
}
