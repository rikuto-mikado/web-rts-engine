import { CLIMATES, biomeOf, mapOf, zoneWeights, type Biome, type Climate, type ClimateRules, type MapDef } from './biomes'
import { Simplex, clamp, lerp, smoothstep } from './noise'
import type { Scenario, ScenarioDefinition } from './types'

export const NAV_CELL = 20
export const WATER_LEVEL = 0
export const BRIDGE_DECK = 7
/** Wading a ford: slow, and no charging or squares in the water. */
export const FORD_SPEED = 0.6

/** Castles are walled compounds about 3.5x the old footprint, with a gate on each side. */
export const CASTLE_SCALE = 1.9
/** Half-width of a gate passage through the walls. */
export const GATE_HALF = 18

export function castleRadius(tier: number): number {
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
        this.forest[j * this.hRes + i] = this.computeForest(x, z, this.heights[j * this.hRes + i])
      }
    }

    for (const c of this.def.castles) if (!c.village) this.walls.set(c.id, { x: c.x, z: c.z, r: wallRadius(c.tier) })
    this.navRes = Math.round(this.size / NAV_CELL)
    this.navCost = new Float32Array(this.navRes * this.navRes)
    this.buildNav()
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
    const town = this.def.town
    if (town) {
      const d = Math.hypot(x - town.x, z - town.z)
      const level = 14
      h = lerp(level + this.detail.noise(x * 0.01, z * 0.01) * 1.2, h, smoothstep(town.r + 40, town.r + 260, d))
    }

    // Castles sit on flattened plateaus.
    for (const c of this.def.castles) {
      const r = castleRadius(Math.min(4, c.tier + 1))
      const d = Math.hypot(x - c.x, z - c.z)
      if (d < r * 1.7) {
        const plateau = Math.max(10, 16 + n.fbm(c.x * 0.0014, c.z * 0.0014, 4) * 22) + 2
        h = lerp(plateau, h, smoothstep(r * 1.05, r * 1.7, d))
      }
    }

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

  private computeForest(x: number, z: number, h: number): number {
    if (h < 4 || h > 115) return 0
    // No woods inside a fortress.
    for (const w of this.def.walls ?? []) if (Math.hypot(x - w.x, z - w.z) < w.r + 90) return 0
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
      const R = castleRadius(Math.min(4, c.tier + 1))
      f *= smoothstep(R * 1.4, R * 2.3, d)
    }
    for (const b of [...this.fords, ...this.stoneBridges]) {
      f *= smoothstep(60, 140, Math.hypot(x - b.x, z - b.z))
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
  setBridgeBroken(index: number, broken: boolean) {
    const b = this.bridges[index]
    if (!b) return
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
    const f = this.forestAt(x, z)
    const s = this.slopeAt(x, z)
    return clamp(1 - f * 0.35 - s * 0.6, 0.45, 1.1) * this.rulesAt(x, z).speed
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
    r = lerp(r, 0.93, snow)
    g = lerp(g, 0.94, snow)
    b = lerp(b, 0.97, snow)
    // Town ground: packed earth and cobbled streets.
    const town = this.def.town
    if (town) {
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

  /** Castle curtain walls (by castle id): impassable except at the four gates (N, E, S, W). */
  readonly walls = new Map<string, { x: number; z: number; r: number }>()

  /** On a castle's wall band, outside the gate passages? */
  onCastleWall(x: number, z: number): boolean {
    for (const w of this.walls.values()) {
      const dx = x - w.x
      const dz = z - w.z
      if (Math.abs(dx) > w.r + 14 || Math.abs(dz) > w.r + 14) continue
      const d = Math.hypot(dx, dz)
      if (Math.abs(d - w.r) > 13) continue
      if (Math.abs(dx) < GATE_HALF || Math.abs(dz) < GATE_HALF) continue // a gate passage
      return true
    }
    return false
  }

  /** The gate of a castle nearest to a point (where armies come and go). */
  gateOf(castleId: string, towardX: number, towardZ: number): [number, number] | null {
    const w = this.walls.get(castleId)
    if (!w) return null
    const dx = towardX - w.x
    const dz = towardZ - w.z
    const r = w.r + 26
    return Math.abs(dx) > Math.abs(dz) ? [w.x + Math.sign(dx || 1) * r, w.z] : [w.x, w.z + Math.sign(dz || 1) * r]
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
  onWall(x: number, z: number, pad = 0): boolean {
    for (const w of this.def.walls ?? []) {
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
    if (this.bridgeAt(x, z, 6)) return 1
    if (this.fordAt(x, z, 4)) return 2.2
    const h = this.heightAt(x, z)
    if (h < 2.5) return 0
    if (h > 125) return 0
    const slope = this.slopeAt(x, z)
    if (slope > 1.25) return 0
    return 1 + this.forestAt(x, z) * 0.6 + slope * 1.5
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
