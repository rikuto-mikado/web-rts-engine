import * as THREE from 'three'
import type { Castle } from '../game/types'
import { GATE_HALF, WATER_LEVEL, castleRadius, wallRAt, type CastleShape, type World } from '../game/world'
import { Frame, PAL, newKit, tent, type Kit, type RoofKind } from './buildings'
import { bpart, box, cone, cyl, merge, part } from './geo'
import { buildCastleTown } from './castletown'
import { citadelHeart } from './keeps'

/**
 * A lord's castle, built to its site, its size and the realm that holds it.
 *
 * The walls follow the outline the world laid out for it: a straight curtain along the bank of a
 * river or lake (with a quay and a water gate below it), a long ward drawn out along a ridge over a
 * battered stone revetment, an irregular polygon on the plain with its towers at the corners. Four
 * gatehouses where the roads come in. How it is built depends on its size:
 *
 *   tier 1   a motte and bailey: an earth mound with a timber tower on it, a palisade of sharpened
 *            logs round the bailey, timber gate towers and wooden fighting platforms;
 *   tier 2+  a stone curtain with towers and a walled town round a raised citadel terrace, the
 *            fortress's heart on it (keeps.ts); tier 3 adds a barbican before the main gate;
 *
 * And its style on who holds it: the King's realm builds pale limestone with tall conical roofs in
 * the lord's colours; the Usurper's the same shapes in black basalt under roofs of her crimson; the
 * Sun Emperor's warm sandstone with domes and gilded finials; free lords weathered grey stone with
 * timber hoardings and shingle. Roofs carry courses of tile, slate or lead in the lord's hue.
 *
 * The town inside and the suburbs and farmland outside are in castletown.ts and farmland.ts.
 */
export type FortStyle = 'crown' | 'thorn' | 'sun' | 'free'

export interface StyleDef {
  stone: number
  stoneD: number
  stoneL: number
  keep: number
  dark: number
  /** How towers are capped. */
  cap: 'cone' | 'dome' | 'hoard'
  /** Town roofs and house walls. */
  roofs: RoofKind[]
  houses: 'timber' | 'stone' | 'plaster'
}
export const STYLES: Record<FortStyle, StyleDef> = {
  crown: { stone: 0xcdc5b2, stoneD: 0x9d9686, stoneL: 0xddd6c4, keep: 0xd6cfbc, dark: 0x2a241e, cap: 'cone', roofs: ['tile', 'slate', 'tile', 'slate'], houses: 'timber' },
  thorn: { stone: 0x5f5954, stoneD: 0x45403c, stoneL: 0x726b64, keep: 0x6a635c, dark: 0x16120f, cap: 'cone', roofs: ['slate', 'slate', 'shingle'], houses: 'stone' },
  sun: { stone: 0xd8bd8c, stoneD: 0xb19566, stoneL: 0xe6d0a4, keep: 0xe2c998, dark: 0x3a2a1a, cap: 'dome', roofs: ['tile', 'tile', 'tile'], houses: 'plaster' },
  free: { stone: 0xa59d8d, stoneD: 0x807a6d, stoneL: 0xb6ae9e, keep: 0xb2aa98, dark: 0x2a241e, cap: 'hoard', roofs: ['thatch', 'shingle', 'thatch', 'tile'], houses: 'timber' },
}
export const WOOD = 0x6b4b2e
export const WOOD_D = 0x4e3622
export const LOG = 0x7a5a38
export const EARTH = 0x8a7656
export const GRASS = 0x6f8a3c
export const IRON = 0x2e2c2a

export interface Fortress {
  /** Natural colours. */
  stone: THREE.BufferGeometry[]
  /** Painted in the lord's colour (roofs, banners, awnings). */
  roof: THREE.BufferGeometry[]
  gold: THREE.BufferGeometry[]
  glow: THREE.BufferGeometry[]
  /** Points along the walls (local), for smoke and fire. */
  ring: [number, number][]
  wallH: number
  /** Top of the keep (where the great banner flies). */
  keepTop: number
  keepAt: [number, number]
  /** Windmill hubs: sails are drawn and turned by the view. */
  mills: { x: number; y: number; z: number; ry: number; r: number }[]
  /** Chimneys and forges that smoke (local x, y, z). */
  smoke: [number, number, number][]
  /** Ground and small parts that cast no shadow (paving, fields, fences, props, fine details). */
  flat: THREE.BufferGeometry[]
  /** Lit by night only: window panes, lanterns. */
  lamps: THREE.BufferGeometry[]
  /** Flames standing alone, burning by night (local x, y, z and size: a torch's is 4). */
  flames: [number, number, number, number][]
  /** Pools of firelight by night (local), besides the one over the whole castle. */
  lights: Lamp[]
}

/** A pool of firelight (local to its holding): where, how far, how bright. */
export interface Lamp {
  x: number
  y: number
  z: number
  r: number
  i: number
}

/** Everything the builders of a castle, its town and its country share. */
export interface Ctx {
  c: Castle
  world: World
  shape: CastleShape
  style: FortStyle
  S0: StyleDef
  tier: number
  ruined: boolean
  timber: boolean
  rnd: () => number
  kit: Kit
  stone: THREE.BufferGeometry[]
  roof: THREE.BufferGeometry[]
  gold: THREE.BufferGeometry[]
  /** Ground and small parts: cast no shadow. */
  flat: THREE.BufferGeometry[]
  /** Fire by night: flames standing alone, and pools of light (local). */
  flames: Fortress['flames']
  lights: Lamp[]
  /** The roads out of the gates (laid by the faubourgs), for what stands along them. */
  roads: { g: number; path: [number, number][]; main: boolean }[]
  smoke: [number, number, number][]
  mills: Fortress['mills']
  /** Ground height relative to the castle's heart. */
  G: (lx: number, lz: number) => number
  S: (geo: THREE.BufferGeometry, col: number, o?: Parameters<typeof bpart>[2]) => void
  /** A small part (no shadow). */
  F: (geo: THREE.BufferGeometry, col: number, o?: Parameters<typeof bpart>[2]) => void
  Rf: (geo: THREE.BufferGeometry, col: number, o?: Parameters<typeof bpart>[2]) => void
  /** The wall at a bearing. */
  rAt: (a: number) => number
  /** A point on the wall at a bearing (plus `extra` outwards). */
  pt: (a: number, extra?: number) => [number, number]
  gates: number[]
  main: number
  /** The gate onto the water, if any (no road leaves it). */
  waterGate: number | null
  /** How far the citadel terrace reaches from the heart (0: none); the town keeps beyond it. */
  innerR: number
  keepAt: [number, number]
  wallH: number
  /** Ground taken by buildings, roads and yards (local): circles, or a building's own rectangle. */
  taken: Taken[]
  free: (x: number, z: number, r: number) => boolean
  /** Is a building's footprint (half sizes, turned by ry as a Frame) clear of everything taken? */
  freeRect: (x: number, z: number, hw: number, hd: number, ry: number) => boolean
  /** Is a point on one of the four streets from the gates to the heart? */
  onStreet: (x: number, z: number, half: number) => boolean
  /** Within the walls (plus `pad`). */
  inWalls: (x: number, z: number, pad: number) => boolean
  /** On firm ground inside the map, not water or a cliff. */
  firm: (x: number, z: number, r?: number) => boolean
  /** Level a footprint into the slope: a plinth from the lowest corner up to the highest; returns the floor height. */
  foot: (x: number, z: number, w: number, d: number, ry: number, col?: number) => number
  /** A conical (or pyramid) roof in the lord's colour with courses and an eaves trim. */
  roofCone: (x: number, y0: number, z: number, r: number, h: number, seg?: number, ry?: number) => void
  /** How far the castle's country reaches. */
  outer: number
  /** Roads, lanes and alleys laid so far (centre lines and half widths). */
  lanes: { pts: [number, number][]; half: number }[]
  /** Clear of every lane but `except` by r? */
  laneClear: (x: number, z: number, r: number, except?: [number, number][]) => boolean
  /** A barbican before the main gate (the gate town starts beyond it)? Defaults by tier. */
  barbican?: boolean
  /** A great city's country: how much farmland round it. */
  country?: { fields: number; mills: number; orchards: number; pastures: number; farms: number }
}

/**
 * A conical or pyramid roof in a natural colour (slate, lead, tile): a mottled cone, three darker
 * courses round it and a timber eaves trim. For buildings that are not painted in a lord's hue.
 */
export function coursedCone(out: THREE.BufferGeometry[], x: number, y0: number, z: number, r: number, h: number, color: number, seg = 12, ry = 0) {
  out.push(mottle(bpart(new THREE.ConeGeometry(r, h, seg, 4), color, { x, y: y0 + h / 2, z, ry, ao: 0.3 }), 0.07))
  const dark = new THREE.Color(color).multiplyScalar(0.72).getHex()
  for (const t of [0.22, 0.46, 0.7]) {
    const rb = r * (1 - t + 0.025) * 1.03
    const rt = r * (1 - t - 0.025) * 1.03
    out.push(bpart(new THREE.CylinderGeometry(rt, rb, h * 0.05, seg, 1, true), dark, { x, y: y0 + h * t, z, ry, ao: 0 }))
  }
  out.push(bpart(new THREE.CylinderGeometry(r, r * 1.05, 0.6, seg, 1, true), WOOD_D, { x, y: y0 + 0.25, z, ry, ao: 0 }))
}

/** Ground something stands on: a circle, or (for a building) its turned rectangle as well. */
export interface Taken {
  x: number
  z: number
  r: number
  hw?: number
  hd?: number
  ry?: number
}
/** A rectangle's axes as a Frame turns them: local x and local z in the world. */
function axes(ry: number): [number, number, number, number] {
  return [Math.cos(ry), -Math.sin(ry), Math.sin(ry), Math.cos(ry)]
}
export function circleHitsRect(px: number, pz: number, r: number, t: Taken): boolean {
  const [ax, az, bx, bz] = axes(t.ry ?? 0)
  const dx = px - t.x
  const dz = pz - t.z
  const lx = Math.max(-t.hw!, Math.min(t.hw!, dx * ax + dz * az))
  const lz = Math.max(-t.hd!, Math.min(t.hd!, dx * bx + dz * bz))
  return Math.hypot(dx - lx * ax - lz * bx, dz - lx * az - lz * bz) < r
}
export function rectsOverlap(p: Taken, q: Taken): boolean {
  const pa = axes(p.ry ?? 0)
  const qa = axes(q.ry ?? 0)
  const dx = q.x - p.x
  const dz = q.z - p.z
  for (const [ux, uz] of [[pa[0], pa[1]], [pa[2], pa[3]], [qa[0], qa[1]], [qa[2], qa[3]]]) {
    const rp = p.hw! * Math.abs(pa[0] * ux + pa[1] * uz) + p.hd! * Math.abs(pa[2] * ux + pa[3] * uz)
    const rq = q.hw! * Math.abs(qa[0] * ux + qa[1] * uz) + q.hd! * Math.abs(qa[2] * ux + qa[3] * uz)
    if (Math.abs(dx * ux + dz * uz) > rp + rq) return false
  }
  return true
}

/** The bearing a building's front takes (a Frame's ry: its door looks along (sin ry, cos ry)). */
export const facing = (vx: number, vz: number) => Math.atan2(vx, vz)

/** Vertex-colour grain on a part: a stable mottling by position (stone, tile, thatch). */
export function mottle(g: THREE.BufferGeometry, amount: number) {
  const pos = g.attributes.position as THREE.BufferAttribute
  const col = g.attributes.color as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const h = Math.abs(Math.sin(pos.getX(i) * 12.9898 + pos.getY(i) * 4.1414 + pos.getZ(i) * 78.233) * 43758.5453) % 1
    const k = 1 + (h - 0.5) * amount * 2
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k)
  }
  return g
}

/** A conical or pyramid roof: the lord's hue mottled like tile, darker courses, a timber eaves trim (into `trim`). */
export function lordCone(roof: THREE.BufferGeometry[], trim: THREE.BufferGeometry[], x: number, y0: number, z: number, r: number, h: number, seg = 12, ry = 0) {
  roof.push(mottle(bpart(new THREE.ConeGeometry(r, h, seg, 4), 0xffffff, { x, y: y0 + h / 2, z, ry, ao: 0.32 }), 0.06))
  for (const t of [0.22, 0.46, 0.7]) {
    const rb = r * (1 - t + 0.025) * 1.03
    const rt = r * (1 - t - 0.025) * 1.03
    roof.push(bpart(new THREE.CylinderGeometry(rt, rb, h * 0.05, seg, 1, true), 0xb4b4b4, { x, y: y0 + h * t, z, ry, ao: 0 }))
  }
  trim.push(bpart(new THREE.CylinderGeometry(r * 1.0, r * 1.05, 0.5, seg, 1, true), WOOD_D, { x, y: y0 + 0.2, z, ry, ao: 0 }))
}

/** A dome in the lord's hue, ribbed in gold, on a drum: the Sun Emperor's way. */
export function lordDome(roof: THREE.BufferGeometry[], gold: THREE.BufferGeometry[], x: number, y0: number, z: number, r: number, stretch: number) {
  roof.push(mottle(bpart(new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, { x, y: y0, z, sy: stretch, ao: 0.3 }), 0.05))
  for (let k = 0; k < 4; k++) gold.push(bpart(new THREE.TorusGeometry(r * 1.01, Math.max(0.08, r * 0.025), 3, 12, Math.PI), 0xffffff, { x, y: y0, z, ry: (k * Math.PI) / 4, sy: stretch, ao: 0 }))
}

export function buildFortress(c: Castle, world: World, shape: CastleShape, style: FortStyle, rnd: () => number): Fortress {
  const S0 = STYLES[style]
  const tier = c.tier
  const ruined = !!c.ruined
  const timber = tier <= 1
  const kit = newKit()
  const stone = kit.walls
  const flat: THREE.BufferGeometry[] = []
  kit.flat = flat
  const lamps: THREE.BufferGeometry[] = []
  kit.lamps = lamps
  const flames: Fortress['flames'] = []
  const lights: Lamp[] = []
  const roof: THREE.BufferGeometry[] = []
  const gold: THREE.BufferGeometry[] = []
  const ring: [number, number][] = []
  const smoke: [number, number, number][] = []
  const mills: Fortress['mills'] = []
  const base = world.heightAt(c.x, c.z)
  const G = (lx: number, lz: number) => world.heightAt(c.x + lx, c.z + lz) - base
  const S = (geo: THREE.BufferGeometry, col: number, o: Parameters<typeof bpart>[2] = {}) => {
    stone.push(bpart(geo, col, o))
  }
  const F = (geo: THREE.BufferGeometry, col: number, o: Parameters<typeof bpart>[2] = {}) => {
    flat.push(bpart(geo, col, o))
  }
  const Rf = (geo: THREE.BufferGeometry, col: number, o: Parameters<typeof bpart>[2] = {}) => {
    roof.push(bpart(geo, col, { ao: 0.12, ...o }))
  }
  const rAt = (a: number) => wallRAt(shape, a)
  const pt = (a: number, extra = 0): [number, number] => [Math.cos(a) * (rAt(a) + extra), Math.sin(a) * (rAt(a) + extra)]
  const GH = GATE_HALF + 2
  const gates = shape.gates
  const main = gates[0]
  const wallH = timber ? 9 : 11 + tier * 2.5
  const crumble = (h: number) => (ruined ? h * (0.35 + rnd() * 0.45) : h)
  const onStreet = (x: number, z: number, half: number) => gates.some((g) => x * Math.cos(g) + z * Math.sin(g) > -4 && Math.abs(-x * Math.sin(g) + z * Math.cos(g)) < half)
  // The gate onto the water: the one that faces the bank.
  let waterGate: number | null = null
  if (shape.water !== undefined) {
    for (const g of gates) {
      if (Math.abs(Math.atan2(Math.sin(g - shape.water), Math.cos(g - shape.water))) > 0.8) continue
      // Only where the water really comes up to the wall.
      const d = wallRAt(shape, g) + 30
      if (world.heightAt(c.x + Math.cos(g) * d, c.z + Math.sin(g) * d) < 3) waterGate = g
    }
  }
  const taken: Taken[] = []
  const free = (x: number, z: number, r: number) => taken.every((t) => (t.hw !== undefined ? !circleHitsRect(x, z, r, t) : Math.hypot(t.x - x, t.z - z) > t.r + r))
  const freeRect = (x: number, z: number, hw: number, hd: number, ry: number) => {
    const me: Taken = { x, z, r: Math.hypot(hw, hd), hw, hd, ry }
    return taken.every((t) => (Math.hypot(t.x - x, t.z - z) > t.r + me.r ? true : t.hw !== undefined ? !rectsOverlap(me, t) : !circleHitsRect(t.x, t.z, t.r, me)))
  }
  const inWalls = (x: number, z: number, pad: number) => Math.hypot(x, z) < rAt(Math.atan2(z, x)) + pad
  const firm = (x: number, z: number, r = 4) => {
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const wx = c.x + x + dx
      const wz = c.z + z + dz
      if (Math.abs(wx) > world.half - 170 || Math.abs(wz) > world.half - 170) return false
      if (world.heightAt(wx, wz) < 3.2 || !world.isPassable(wx, wz) || world.slopeAt(wx, wz) > 0.95) return false
    }
    return true
  }
  const foot = (x: number, z: number, w: number, d: number, ry: number, col = 0x8a8274) => {
    const cs = Math.cos(ry)
    const sn = Math.sin(ry)
    let lo = Infinity
    let hi = -Infinity
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, 0]]) {
      const h = G(x + lx * cs + lz * sn, z - lx * sn + lz * cs)
      lo = Math.min(lo, h)
      hi = Math.max(hi, h)
    }
    // A footing of rubble stone stepped down into the slope.
    if (hi - lo > 0.35) S(box(w + 0.9, hi - lo + 1.4, d + 0.9), col, { x, y: (hi + lo) / 2 - 0.4, z, ry, ao: 0.2, jitter: 0.1 })
    return hi
  }
  const roofCone = (x: number, y0: number, z: number, r: number, h: number, seg = 12, ry = 0) => lordCone(roof, stone, x, y0, z, r, h, seg, ry)
  const roofDome = (x: number, y0: number, z: number, r: number, stretch: number) => lordDome(roof, gold, x, y0, z, r, stretch)

  // The heart of a stone castle: the citadel terrace and the fortress on it (keeps.ts). The town
  // keeps clear of the terrace.
  let heart = { keepTop: 0, radius: 0 }
  if (!timber) {
    let minWall = Infinity
    for (let i = 0; i < 64; i++) minWall = Math.min(minWall, rAt((i / 64) * Math.PI * 2))
    heart = citadelHeart({ style, tier, ruined, rnd, stone, roof, gold, flat, glow: kit.glow, flames }, main, gates, minWall)
  }
  const innerR = heart.radius
  const keepAt: [number, number] = timber ? [-Math.cos(main) * rAt(main + Math.PI) * 0.4, -Math.sin(main) * rAt(main + Math.PI) * 0.4] : [0, 0]
  const cr = castleRadius(tier)
  const outer = cr * (timber ? 1.75 : 2.05)

  // ---------------------------------------------------------------------------------------------
  // Ground: the bailey levelled inside the walls, cobbled streets.
  // ---------------------------------------------------------------------------------------------
  const outline = (extra: number, n = 96) => Array.from({ length: n }, (_, i) => pt((i / n) * Math.PI * 2, extra))
  {
    const shp = new THREE.Shape(outline(6).map(([x, z]) => new THREE.Vector2(x, -z)))
    const g = new THREE.ExtrudeGeometry(shp, { depth: 6, bevelEnabled: false, curveSegments: 1 })
    g.rotateX(-Math.PI / 2)
    F(g, ruined ? 0x5a5040 : timber ? 0x8a7a58 : 0x8f7c5c, { y: -5.2, ao: 0 })
  }
  if (!timber) {
    // The whole town within the walls is cobbled, from the foot of the citadel terrace to the back
    // of the curtain: setts in three tones laid in rings, the buildings standing on them.
    const tones = [0xa89a80, 0x9c8e74, 0xb3a68c]
    const cells: number[][][] = [[], [], []]
    const cell = 3.4
    let maxR = 0
    for (let i = 0; i < 64; i++) maxR = Math.max(maxR, rAt((i / 64) * Math.PI * 2))
    const n = Math.max(48, Math.round((Math.PI * 2 * maxR) / cell))
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2
      const a1 = ((i + 1) / n) * Math.PI * 2
      const r1max = Math.min(rAt(a0), rAt(a1)) - 2.5
      for (let r0 = Math.max(4, innerR - 2), j = 0; r0 < r1max; r0 += cell, j++) {
        const r1 = Math.min(r1max, r0 + cell)
        const q = (a: number, r: number) => [Math.cos(a) * r, 0.84, Math.sin(a) * r]
        const t = Math.abs(Math.round(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453)) % 3
        cells[t].push([...q(a0, r0), ...q(a0, r1), ...q(a1, r1), ...q(a1, r0)])
      }
    }
    cells.forEach((c, t) => c.length && flat.push(drape(c, ruined ? 0x5a5448 : tones[t], 0.05)))
    for (const g of gates) {
      const len = rAt(g) + 10
      F(box(len, 0.5, 14), ruined ? 0x6a6050 : 0xa8987a, { x: (Math.cos(g) * len) / 2, y: 0.85, z: (Math.sin(g) * len) / 2, ry: -g, ao: 0 })
      // Setts: a grain of paler and darker stones down the street, kerbs to the sides.
      for (let d = innerR; d < len - 4; d += 3.2) for (const u of [-4.5, 0, 4.5]) F(box(2.6, 0.12, 2.6), (Math.round(d + u) % 3) ? 0xb4a486 : 0x9c8e72, { x: Math.cos(g) * d - Math.sin(g) * u, y: 1.13, z: Math.sin(g) * d + Math.cos(g) * u, ry: -g + 0.05 * Math.sin(d), ao: 0 })
      for (const s of [-1, 1]) F(box(len, 0.35, 0.9), 0x8a7c62, { x: (Math.cos(g) * len) / 2 - Math.sin(g) * s * 7, y: 1.05, z: (Math.sin(g) * len) / 2 + Math.cos(g) * s * 7, ry: -g, ao: 0 })
    }
  } else {
    for (const g of [main, gates[2]]) {
      const len = rAt(g) + 8
      F(box(len, 0.35, 9), 0x7a6a4c, { x: (Math.cos(g) * len) / 2, y: 0.75, z: (Math.sin(g) * len) / 2, ry: -g, ao: 0 })
    }
  }

  // ---------------------------------------------------------------------------------------------
  // The walls: straight curtains between towers round the outline, towers at its corners, broken
  // by the four gateways.
  // ---------------------------------------------------------------------------------------------
  const spacing = timber ? 30 : 34 + tier * 3
  const flank = GH + (timber ? 4 : 6)
  type Station = { x: number; z: number; tower: boolean; corner: boolean }
  const runs: Station[][] = []
  for (let i = 0; i < 4; i++) {
    const g0 = gates[i]
    const g1 = gates[(i + 1) % 4] + (i === 3 ? Math.PI * 2 : 0)
    const a0 = g0 + flank / rAt(g0)
    const a1 = g1 - flank / rAt(g1)
    // The corners of the outline that fall in this run, then even spacing between them.
    const keys = [a0]
    for (const k of shape.corners) {
      let a = k
      while (a < a0) a += Math.PI * 2
      while (a > a0 + Math.PI * 2) a -= Math.PI * 2
      if (a > a0 + 0.08 && a < a1 - 0.08) keys.push(a)
    }
    keys.push(a1)
    keys.sort((p, q) => p - q)
    const run: Station[] = []
    for (let j = 0; j < keys.length - 1; j++) {
      const k0 = keys[j]
      const k1 = keys[j + 1]
      const arc = ((k1 - k0) * (rAt(k0) + rAt(k1))) / 2
      const n = Math.max(1, Math.round(arc / spacing))
      for (let k = j === 0 ? 0 : 1; k <= n; k++) {
        const a = k0 + ((k1 - k0) * k) / n
        const [x, z] = pt(a)
        const last = j === keys.length - 2 && k === n
        run.push({ x, z, tower: !(j === 0 && k === 0) && !last, corner: k === n && !last })
      }
    }
    runs.push(run)
  }
  /** Is the ground just outside this point water (a bank wall)? */
  const onBank = (x: number, z: number) => {
    if (shape.water === undefined) return false
    const d = Math.hypot(x, z) || 1
    return world.heightAt(c.x + (x / d) * (d + 22), c.z + (z / d) * (d + 22)) < 3
  }
  const quay: [number, number, number, number][] = []
  const stoneWall = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az)
    if (len < 1) return
    const cx = (ax + bx) / 2
    const cz = (az + bz) / 2
    const ang = -Math.atan2(bz - az, bx - ax)
    let nx = -(bz - az) / len
    let nz = (bx - ax) / len
    if (nx * cx + nz * cz < 0) {
      nx = -nx
      nz = -nz
    }
    const tx = (bx - ax) / len
    const tz = (bz - az) / len
    // Below the wall: a battered revetment down the hillside, or a quay along the water.
    const outY = G(cx + nx * 10, cz + nz * 10)
    if (onBank(cx, cz)) quay.push([ax, az, bx, bz])
    else if (outY < -2.5) {
      const drop = -outY + 2
      S(box(len + 1, drop, 6), S0.stoneD, { x: cx + nx * 5.5, y: -drop / 2 + 0.5, z: cz + nz * 5.5, ry: ang, rx: 0, ao: 0.25, jitter: 0.1 })
      S(box(len + 2, drop * 0.55, 6), S0.stoneD, { x: cx + nx * 9.5, y: outY + (drop * 0.55) / 2 - 0.6, z: cz + nz * 9.5, ry: ang, ao: 0.3, jitter: 0.12 })
      for (let t = -len / 2 + 3; t < len / 2; t += 7) S(new THREE.DodecahedronGeometry(1.6 + rnd() * 1.6, 0), 0x8a8274, { x: cx + tx * t + nx * (12 + rnd() * 4), y: G(cx + tx * t + nx * 14, cz + tz * t + nz * 14) + 0.6, z: cz + tz * t + nz * (12 + rnd() * 4), ry: rnd() * 3 })
    }
    const h = crumble(wallH)
    if (ruined && rnd() < 0.25) {
      for (let i = 0; i < 4; i++) S(new THREE.DodecahedronGeometry(2.2 + rnd() * 2, 0), S0.stoneD, { x: cx + nx * (rnd() * 8 - 2) + (rnd() - 0.5) * len * 0.6, y: 1.5, z: cz + nz * (rnd() * 8 - 2) + (rnd() - 0.5) * len * 0.6, ry: rnd() * 3 })
      return
    }
    S(box(len + 0.6, 5, 10), S0.stoneD, { x: cx + nx * 0.6, y: -0.2, z: cz + nz * 0.6, ry: ang, ao: 0.1 })
    stone.push(mottle(bpart(new THREE.BoxGeometry(len + 0.4, h, 6, Math.max(1, Math.round(len / 6)), 3, 1), S0.stone, { x: cx, y: h / 2, z: cz, ry: ang }), 0.05))
    S(box(len, 0.6, 6.5), S0.stoneD, { x: cx, y: h * 0.52, z: cz, ry: ang, ao: 0 })
    if (ruined) return
    S(box(len, 1.2, 7.2), S0.stoneD, { x: cx - nx * 0.6, y: h + 0.6, z: cz - nz * 0.6, ry: ang })
    S(box(len, 1.4, 1.4), S0.stoneD, { x: cx + nx * 3.4, y: h - 0.6, z: cz + nz * 3.4, ry: ang, ao: 0.3 })
    S(box(len, 2.2, 1.4), S0.stone, { x: cx + nx * 3.4, y: h + 1.1, z: cz + nz * 3.4, ry: ang })
    // A torch in its bracket on the inside of the parapet, for the watch on the wall-walk.
    if (len > 18) {
      const tx = cx - nx * 0.4
      const tz = cz - nz * 0.4
      F(box(0.25, 0.25, 1.2), IRON, { x: tx, y: h + 2.4, z: tz, ry: ang + Math.PI / 2, ao: 0 })
      F(cyl(0.12, 0.1, 1.6, 5), WOOD_D, { x: tx - nx * 0.6, y: h + 3, z: tz - nz * 0.6, rz: 0.2, ao: 0 })
      kit.glow.push(bpart(cyl(0.22, 0.16, 0.4, 6), 0xff8a3a, { x: tx - nx * 0.7, y: h + 3.9, z: tz - nz * 0.7 }))
      flames.push([tx - nx * 0.7, h + 4.4, tz - nz * 0.7, 3.4])
    }
    for (let t = -len / 2 + 1.8; t < len / 2 - 1.2; t += 3.6) {
      const ox = cx + tx * t + nx * 3.4
      const oz = cz + tz * t + nz * 3.4
      if (style === 'sun') {
        S(box(2.1, 1.6, 1.4), S0.stone, { x: ox, y: h + 2.9, z: oz, ry: ang })
        S(box(1.2, 1.0, 1.4), S0.stone, { x: ox, y: h + 4.2, z: oz, ry: ang })
      } else S(box(2, 2.2, 1.4), S0.stone, { x: ox, y: h + 3.2, z: oz, ry: ang })
    }
    for (let t = -len / 2 + 3; t < len / 2 - 2; t += 7) S(box(0.5, 2.4, 0.2), S0.dark, { x: cx + tx * t + nx * 3.05, y: h * 0.32, z: cz + tz * t + nz * 3.05, ry: ang, ao: 0 })
    if (style === 'free') {
      S(box(len, 2.4, 2.6), WOOD, { x: cx + nx * 4.4, y: h + 2.4, z: cz + nz * 4.4, ry: ang })
      S(box(len + 0.4, 0.3, 3.6), 0x6f5a42, { x: cx + nx * 4.2, y: h + 4.0, z: cz + nz * 4.2, ry: ang })
      for (let t = -len / 2 + 1; t < len / 2; t += 3) S(box(0.3, 2, 0.3), WOOD_D, { x: cx + tx * t + nx * 5.6, y: h + 0.4, z: cz + tz * t + nz * 5.6, ry: ang, ao: 0 })
    }
    // Inside: a stair up to the wall-walk on the long runs, buttresses outside.
    if (len > 26) {
      for (const t of [-len * 0.25, len * 0.25]) S(box(3, h * 0.7, 3.2), S0.stoneD, { x: cx + tx * t + nx * 4, y: h * 0.35, z: cz + tz * t + nz * 4, ry: ang })
      for (let i = 0; i < 6; i++) S(box(2.4, 0.5, 2.2), S0.stoneD, { x: cx - tx * (len * 0.18 - i * 2.2) - nx * 4.2, y: 0.8 + i * (h / 6), z: cz - tz * (len * 0.18 - i * 2.2) - nz * 4.2, ry: ang, ao: 0.1 })
    }
  }
  const palisade = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az)
    const tx = (bx - ax) / len
    const tz = (bz - az) / len
    const ang = -Math.atan2(bz - az, bx - ax)
    let nx = -tz
    let nz = tx
    if (nx * (ax + bx) + nz * (az + bz) < 0) {
      nx = -nx
      nz = -nz
    }
    S(box(len + 1, 3, 9), EARTH, { x: (ax + bx) / 2, y: 0.4, z: (az + bz) / 2, ry: ang, ao: 0.1 })
    S(box(len + 1, 1.2, 5), 0x5e5038, { x: (ax + bx) / 2 + nx * 8, y: -0.4, z: (az + bz) / 2 + nz * 8, ry: ang, ao: 0 })
    for (let t = 0; t < len; t += 1.3) {
      if (ruined && rnd() < 0.45) continue
      const h = ruined ? 3 + rnd() * 4 : 8.5 + rnd() * 1.4
      const x = ax + tx * t
      const z = az + tz * t
      S(cyl(0.62, 0.68, h, 5), rnd() < 0.5 ? LOG : 0x6e5032, { x, y: 1.5 + h / 2, z, ao: 0.15 })
      if (!ruined) S(cone(0.62, 1.4, 5), 0x8a6a48, { x, y: 1.5 + h + 0.7, z, ao: 0 })
    }
    if (!ruined) {
      S(box(len, 0.35, 2.4), WOOD, { x: (ax + bx) / 2 - nx * 1.8, y: 6.4, z: (az + bz) / 2 - nz * 1.8, ry: ang })
      for (let t = 2; t < len; t += 4) S(box(0.35, 6.4, 0.35), WOOD_D, { x: ax + tx * t - nx * 2.8, y: 3.2, z: az + tz * t - nz * 2.8, ao: 0.1 })
    }
  }

  // Towers, in the style of the realm.
  const tr = timber ? 4 : 5 + tier
  const th = wallH + 8 + tier
  const tower = (x: number, z: number, r: number, h: number, capH: number) => {
    if (timber) {
      const hh = ruined ? h * 0.4 : h
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) S(box(0.8, hh, 0.8), WOOD_D, { x: x + px * r * 0.7, y: hh / 2 + 1, z: z + pz * r * 0.7 })
      if (ruined) return
      S(box(r * 1.9, 3.2, r * 1.9), WOOD, { x, y: hh - 1, z })
      S(box(r * 2.2, 0.4, r * 2.2), 0x5a4026, { x, y: hh - 2.8, z })
      for (const [px, pz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) S(box(px ? 0.3 : r * 1.9, 4, pz ? 0.3 : r * 1.9), WOOD_D, { x: x + px * r * 0.7, y: hh * 0.5, z: z + pz * r * 0.7, rz: px * 0.5, rx: -pz * 0.5, ao: 0 })
      roofCone(x, hh + 0.6, z, r * 1.75, capH * 0.6, 4, Math.PI / 4)
      return
    }
    const n = 12
    const rot = 0
    const hh = crumble(h)
    S(cyl(r + 1.4, r + 2.4, 5, n), S0.stoneD, { x, y: 1.5, z, ry: rot, ao: 0.1 })
    stone.push(mottle(bpart(new THREE.CylinderGeometry(r, r + 0.4, hh, n, 4), S0.stone, { x, y: hh / 2, z, ry: rot }), 0.05))
    S(cyl(r + 0.3, r + 0.3, 0.5, n), S0.stoneD, { x, y: hh * 0.55, z, ry: rot, ao: 0 })
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      S(box(0.5, 2.2, 0.3), S0.dark, { x: x + Math.cos(a) * (r + 0.15), y: hh * 0.6, z: z + Math.sin(a) * (r + 0.15), ry: -a + Math.PI / 2, ao: 0 })
    }
    if (ruined) return
    S(cyl(r + 1.1, r + 0.2, 1.6, n), S0.stoneD, { x, y: h + 0.4, z, ry: rot, ao: 0.15 })
    S(cyl(r + 1.1, r + 1.1, 1.4, n), S0.stone, { x, y: h + 1.9, z, ry: rot })
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rot
      S(box(1.6, 1.6, 0.9), S0.stone, { x: x + Math.cos(a) * (r + 0.7), y: h + 3.3, z: z + Math.sin(a) * (r + 0.7), ry: -a + Math.PI / 2 })
    }
    if (S0.cap === 'cone') {
      S(cyl(r * 0.8, r * 0.8, 2.6, n), S0.stone, { x, y: h + 3.4, z })
      roofCone(x, h + 4.6, z, r + 0.6, capH, n)
      // A weathervane on every tower, a pennant on the grander ones.
      S(cyl(0.08, 0.08, 2.2, 4), IRON, { x, y: h + 4.6 + capH + 1, z, ao: 0 })
    } else if (S0.cap === 'dome') {
      S(cyl(r * 0.85, r * 0.85, 2.8, 12), S0.stoneL, { x, y: h + 3.4, z })
      const st = capH / (r * 1.4)
      roofDome(x, h + 4.8, z, r * 0.95, st)
      gold.push(bpart(cyl(r * 0.97, r * 0.97, 0.5, 12), 0xffffff, { x, y: h + 4.9, z, ao: 0 }))
      gold.push(bpart(cone(0.4, 2.4, 6), 0xffffff, { x, y: h + 5 + st * r * 0.95 + 1, z, ao: 0 }))
      gold.push(bpart(cyl(0.8, 0.8, 0.18, 10), 0xffffff, { x, y: h + 5 + st * r * 0.95 + 2.6, z, rx: Math.PI / 2, ao: 0 }))
    } else {
      S(cyl(r + 1.8, r + 1.8, 2.8, n), WOOD, { x, y: h + 3.2, z })
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2
        S(box(0.3, 2.2, 0.3), WOOD_D, { x: x + Math.cos(a) * (r + 1.9), y: h + 1.2, z: z + Math.sin(a) * (r + 1.9), ao: 0 })
      }
      stone.push(mottle(bpart(new THREE.ConeGeometry(r + 2.4, capH * 0.9, n, 3), 0x6f5a42, { x, y: h + 4.6 + capH * 0.45, z, ao: 0.3 }), 0.08))
    }
  }

  for (const run of runs) {
    for (let k = 0; k < run.length - 1; k++) {
      const a = run[k]
      const b = run[k + 1]
      if (timber) palisade(a.x, a.z, b.x, b.z)
      else stoneWall(a.x, a.z, b.x, b.z)
      for (let t = 0.15; t < 1; t += 0.25) ring.push([a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t])
    }
    for (const st of run) if (st.tower) tower(st.x, st.z, st.corner ? tr + 1.5 : tr, st.corner ? th + 3 : th, 8 + tier)
  }
  // A quay along the bank walls: a stone landing at the water, mooring posts, a boat or two.
  if (quay.length && !timber) {
    const wy = WATER_LEVEL - base
    for (const [ax, az, bx, bz] of quay) {
      const len = Math.hypot(bx - ax, bz - az)
      const cx = (ax + bx) / 2
      const cz = (az + bz) / 2
      const d = Math.hypot(cx, cz) || 1
      const nx = cx / d
      const nz = cz / d
      const ang = -Math.atan2(bz - az, bx - ax)
      F(box(len + 1, -wy + 3.2, 9), S0.stoneD, { x: cx + nx * 7, y: (wy - 1.6) / 2 + 0.2, z: cz + nz * 7, ry: ang, ao: 0.2 })
      F(box(len + 1, 0.4, 9.4), S0.stone, { x: cx + nx * 7, y: 0.9, z: cz + nz * 7, ry: ang, ao: 0 })
      for (let t = -len / 2 + 3; t < len / 2; t += 8) F(cyl(0.35, 0.4, 2.6, 5), WOOD_D, { x: cx + nx * 11 + Math.cos(-ang) * t, y: 1.6, z: cz + nz * 11 + Math.sin(-ang) * t })
      if (!ruined && rnd() < 0.7) {
        // A boat moored alongside.
        const bx2 = cx + nx * 15
        const bz2 = cz + nz * 15
        F(box(3.2, 1.4, 11), 0x5a4026, { x: bx2, y: wy + 0.4, z: bz2, ry: ang + Math.PI / 2, ao: 0.2 })
        F(box(2.4, 0.3, 9.6), 0x7a5a38, { x: bx2, y: wy + 1.2, z: bz2, ry: ang + Math.PI / 2, ao: 0 })
        F(cone(1.6, 2.6, 4), 0x5a4026, { x: bx2 + Math.cos(-ang) * 6.6, y: wy + 0.6, z: bz2 + Math.sin(-ang) * 6.6, rz: Math.PI / 2, ry: ang, ao: 0.2 })
        F(box(1.8, 0.5, 1.2), 0xcdbf98, { x: bx2, y: wy + 1.6, z: bz2, ry: ang, ao: 0 })
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Gatehouses (and the water gate on the bank).
  // ---------------------------------------------------------------------------------------------
  const gh = wallH + 7
  gates.forEach((g, gi) => {
    const cx = Math.cos(g)
    const cz = Math.sin(g)
    const rg = rAt(g)
    const ox = cx * rg
    const oz = cz * rg
    const lat = (u: number, out = 0): [number, number] => [ox - cz * u + cx * out, oz + cx * u + cz * out]
    if (timber) {
      if (gi !== 0 && gi !== 2) {
        for (const s of [-1, 1]) {
          const [x, z] = lat(s * (GH + 0.5))
          palisade(...lat(s * GH), ...lat(s * (GH + 6)))
          S(box(1, 9, 1), WOOD_D, { x, y: 5, z })
        }
        return
      }
      for (const s of [-1, 1]) {
        const [x, z] = lat(s * (GH + 4))
        tower(x, z, 4.5, 12, 6)
      }
      if (!ruined) {
        S(box(6, 3, GH * 2 + 6), WOOD, { x: ox, y: 10, z: oz, ry: -g })
        for (let u = -GH - 2; u <= GH + 2; u += 1.4) {
          const [x, z] = lat(u, 2.6)
          S(cyl(0.4, 0.45, 2.4, 5), LOG, { x, y: 12.6, z })
        }
        for (const s of [-1, 1]) {
          const [x, z] = lat(s * (GH - 4.5), -3)
          S(box(9, 8, 0.8), WOOD_D, { x, y: 4.5, z, ry: -g + Math.PI / 2 + s * 0.9 })
        }
      }
      return
    }
    if (g === waterGate) {
      // A water gate: a low arched portal in the curtain, steps down to the quay, a moored barge.
      for (const s of [-1, 1]) {
        const [x, z] = lat(s * (GH + 6))
        tower(x, z, 6, crumble(wallH + 4), 7)
      }
      if (ruined) return
      S(box(8, wallH, GH * 2 + 2), S0.stone, { x: ox, y: wallH / 2, z: oz, ry: -g })
      S(box(8.6, 6, 10), S0.dark, { x: ox, y: 3, z: oz, ry: -g, ao: 0 })
      S(new THREE.TorusGeometry(5, 0.8, 4, 12, Math.PI), S0.stoneD, { x: ox + cx * 4.3, y: 6, z: oz + cz * 4.3, ry: -g + Math.PI / 2, ao: 0 })
      const wy = WATER_LEVEL - base
      for (let i = 0; i < 6; i++) F(box(3, 0.6, 12), S0.stoneD, { x: ox + cx * (6 + i * 2.6), y: 0.8 - i * ((0.8 - wy) / 6), z: oz + cz * (6 + i * 2.6), ry: -g, ao: 0.1 })
      return
    }
    for (const s of [-1, 1]) {
      const [x, z] = lat(s * (GH + 6))
      tower(x, z, 7, crumble(gh + 6), 9)
      if (!ruined) Rf(box(0.3, 9, 4), 0xffffff, { x: x + cx * 7.3, y: gh - 2, z: z + cz * 7.3, ry: -g, ao: 0 })
    }
    if (ruined) return
    // Torches in iron brackets either side of the gateway, and the light they throw on the road.
    for (const s of [-1, 1]) {
      const [x, z] = lat(s * (GH + 0.6), 5.6)
      F(box(0.3, 0.3, 1.4), IRON, { x, y: gh - 9, z, ry: -g, ao: 0 })
      const [fx, fz] = lat(s * (GH + 0.6), 6.4)
      F(cyl(0.13, 0.1, 1.7, 5), WOOD_D, { x: fx, y: gh - 8.4, z: fz, ao: 0 })
      kit.glow.push(bpart(cyl(0.24, 0.17, 0.42, 6), 0xff8a3a, { x: fx, y: gh - 7.4, z: fz }))
      flames.push([fx, gh - 6.9, fz, 3.8])
    }
    lights.push({ x: ox + cx * 12, y: 5, z: oz + cz * 12, r: 34, i: 0.5 })
    S(box(10, 6, GH * 2 + 4), S0.stone, { x: ox, y: gh - 2, z: oz, ry: -g })
    S(box(11, 1.4, GH * 2 + 6), S0.stoneD, { x: ox, y: gh + 1.6, z: oz, ry: -g })
    for (let u = -GH - 2; u <= GH + 2; u += 3.4) {
      const [x, z] = lat(u, 4.6)
      S(box(1.4, 1.8, 1.8), S0.stone, { x, y: gh + 3.2, z, ry: -g })
    }
    if (style === 'sun') {
      S(new THREE.TorusGeometry(GH - 0.5, 1.3, 4, 18, Math.PI * 1.25), S0.stoneL, { x: ox + cx * 5.2, y: gh - 6.2, z: oz + cz * 5.2, ry: -g + Math.PI / 2, rz: -Math.PI * 0.125, sy: 4 / (GH - 0.5), ao: 0 })
      gold.push(bpart(cyl(2.2, 2.2, 0.4, 14), 0xffffff, { x: ox + cx * 5.4, y: gh + 0.4, z: oz + cz * 5.4, rx: Math.PI / 2, ry: -g + Math.PI / 2, order: 'YXZ', ao: 0 }))
    } else S(new THREE.TorusGeometry(GH - 0.5, 0.9, 4, 16, Math.PI), S0.stoneD, { x: ox + cx * 5.1, y: gh - 5.2, z: oz + cz * 5.1, ry: -g + Math.PI / 2, sy: 3.6 / (GH - 0.5), ao: 0 })
    for (let u = -GH + 1.5; u <= GH - 1.5; u += 1.6) {
      const [x, z] = lat(u)
      S(box(0.35, 3.2, 0.35), PAL.iron, { x, y: gh - 6.4, z, ao: 0 })
    }
    for (const y of [gh - 7.6, gh - 5.4]) S(box(0.35, 0.35, GH * 2 - 2), PAL.iron, { x: ox, y, z: oz, ry: -g, ao: 0 })
    for (const s of [-1, 1]) {
      const [x, z] = lat(s * (GH - 2), -5)
      S(box(10, 9, 1), WOOD, { x, y: 4.5, z, ry: -g })
      for (const y of [2, 7]) S(box(10.2, 0.5, 1.2), PAL.iron, { x, y, z, ry: -g, ao: 0 })
    }
    // The main gate of a greater castle gets a barbican: walls running out to a forward gate.
    if (gi === 0 && tier >= 3) {
      for (const s of [-1, 1]) {
        const [x, z] = lat(s * (GH + 3), 16)
        S(box(22, wallH * 0.6, 4), S0.stone, { x, y: wallH * 0.3, z, ry: -g })
        tower(...lat(s * (GH + 3), 28), 4, wallH * 0.75, 6)
      }
      S(box(6, 4, GH * 2 + 6), S0.stone, { x: ox + cx * 28, y: wallH * 0.75 - 1, z: oz + cz * 28, ry: -g })
    }
  })

  // ---------------------------------------------------------------------------------------------
  // The keep.
  // ---------------------------------------------------------------------------------------------
  let keepTop = 0
  const [kx, kz] = keepAt
  if (timber) {
    const mh = 12
    const mr = 22
    S(cyl(mr * 0.45, mr, mh, 16), EARTH, { x: kx, y: mh / 2 - 0.5, z: kz, ao: 0.2 })
    S(cyl(mr * 0.46, mr * 0.46, 0.6, 16), ruined ? 0x5a5040 : GRASS, { x: kx, y: mh - 0.3, z: kz, ao: 0 })
    S(new THREE.TorusGeometry(mr + 3, 2, 4, 20), 0x5e5038, { x: kx, y: 0.2, z: kz, rx: Math.PI / 2, ao: 0 })
    for (let i = 0; i < 26; i++) {
      if (ruined && rnd() < 0.5) continue
      const a = (i / 26) * Math.PI * 2
      S(cyl(0.5, 0.55, 5, 5), LOG, { x: kx + Math.cos(a) * mr * 0.44, y: mh + 2.5, z: kz + Math.sin(a) * mr * 0.44 })
    }
    const kh = ruined ? 6 : 16
    S(box(10, kh, 10), WOOD, { x: kx, y: mh + kh / 2, z: kz, ry: main })
    if (!ruined) {
      S(box(12.4, 3, 12.4), 0x5a4026, { x: kx, y: mh + kh + 0.5, z: kz, ry: main })
      for (const s of [-1, 1]) S(box(10.4, 0.5, 0.5), WOOD_D, { x: kx, y: mh + kh * (0.3 + (s + 1) * 0.2), z: kz, ry: main, ao: 0 })
      roofCone(kx, mh + kh + 2, kz, 9.5, 9, 4, main + Math.PI / 4)
      const bx = kx + Math.cos(main) * mr * 0.95
      const bz = kz + Math.sin(main) * mr * 0.95
      S(box(mr * 0.95, 0.6, 3), WOOD, { x: (kx + bx) / 2, y: mh * 0.55, z: (kz + bz) / 2, ry: -main, rz: 0.42 })
      for (let i = 1; i <= 3; i++) S(box(0.6, (mh * 0.55 * i) / 3, 0.6), WOOD_D, { x: bx + (kx - bx) * (i / 4.5), y: (mh * 0.55 * i) / 6, z: bz + (kz - bz) * (i / 4.5) })
    }
    keepTop = mh + kh + 2
  } else keepTop = heart.keepTop
  // The ground the keep stands on: the motte, or the citadel terrace.
  taken.push(timber ? { x: kx, z: kz, r: 28 } : { x: 0, z: 0, r: innerR + 0.5 })

  const lanes: Ctx['lanes'] = []
  const laneClear = (x: number, z: number, r: number, except?: [number, number][]) => {
    for (const l of lanes) {
      if (l.pts === except) continue
      for (let i = 0; i < l.pts.length - 1; i++) {
        const [ax, az] = l.pts[i]
        const [bx, bz] = l.pts[i + 1]
        const ex = bx - ax
        const ez = bz - az
        const L2 = ex * ex + ez * ez || 1
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2))
        if (Math.hypot(x - ax - ex * t, z - az - ez * t) < r + l.half) return false
      }
    }
    return true
  }
  const ctx: Ctx = {
    c, world, shape, style, S0, tier, ruined, timber, rnd, kit, stone, roof, gold, flat, smoke, mills, G, S, F, Rf, rAt, pt, gates, main, waterGate, innerR, keepAt, wallH, taken, free, freeRect, onStreet, inWalls, firm, foot, roofCone, outer, lanes, laneClear, flames, lights, roads: [],
  }
  buildCastleTown(ctx)

  // Staging grounds: a tent city outside the walls.
  if (c.staging) {
    for (let i = 0; i < 22; i++) {
      const a = gates[2] + (rnd() - 0.5) * 1.6
      const r = rAt(a) + 40 + rnd() * 50
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      tent(kit, new Frame(x, z, rnd() * 6, G(x, z)), 0, 0, 3.6 + rnd() * 1.5, rnd() < 0.3 ? 'accent' : 'canvas')
    }
  }
  roof.push(...kit.accents)
  stone.push(...kit.roofs)
  return { stone, roof, gold, glow: kit.glow, ring, wallH, keepTop, keepAt, mills, smoke, flat, lamps, flames, lights }
}

/**
 * A windmill's four common sails round their hub (in the hub's frame, turning about z): a stock out
 * from the hub, a lattice of bars along one side of it, the canvas spread over most of the lattice.
 */
export function sailsGeometry(r: number): THREE.BufferGeometry {
  const sails: THREE.BufferGeometry[] = [part(cyl(0.8, 0.8, 1.8, 8), 0x3b3027, { rx: Math.PI / 2 }), part(cone(0.8, 0.9, 8), 0x3b3027, { z: 1.3, rx: Math.PI / 2 })]
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2
    const along = (t: number, side: number): [number, number] => [Math.cos(a) * t - Math.sin(a) * side, Math.sin(a) * t + Math.cos(a) * side]
    const [wx, wy] = along(r * 0.5, 0)
    sails.push(part(box(0.4, r, 0.35), 0x5a4026, { x: wx, y: wy, z: 0.8, rz: a - Math.PI / 2 }))
    for (const side of [0.35, 2.4]) {
      const [sx, sy] = along(r * 0.58, side)
      sails.push(part(box(0.16, r * 0.82, 0.16), 0x6b4b2e, { x: sx, y: sy, z: 0.95, rz: a - Math.PI / 2 }))
    }
    for (let t = r * 0.18; t <= r * 0.98; t += r * 0.08) {
      const [bx, by] = along(t, 1.35)
      sails.push(part(box(2.3, 0.12, 0.12), 0x6b4b2e, { x: bx, y: by, z: 0.95, rz: a, order: 'XYZ' }))
    }
    const [cx, cy] = along(r * 0.62, 1.35)
    sails.push(part(box(1.9, r * 0.66, 0.06), 0xe8dcc0, { x: cx, y: cy, z: 1.05, rz: a - Math.PI / 2 }))
  }
  return merge(sails)
}

/** Ground-hugging quads (fields, roads, plazas): indexed, coloured, ready to merge with building parts. */
export function drape(quads: number[][], color: number, vary = 0.04): THREE.BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const c = new THREE.Color(color)
  for (const q of quads) {
    const b = pos.length / 3
    for (let k = 0; k < 4; k++) {
      pos.push(q[k * 3], q[k * 3 + 1], q[k * 3 + 2])
      const t = 1 + Math.sin(q[k * 3] * 0.37 + q[k * 3 + 2] * 0.21) * 0.5 * vary * 2
      col.push(c.r * t, c.g * t, c.b * t)
    }
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  return g
}
