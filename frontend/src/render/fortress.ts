import * as THREE from 'three'
import type { Castle } from '../game/types'
import { GATE_HALF, WATER_LEVEL, castleRadius, profAt, wallRAt, type CastleShape, type World } from '../game/world'
import { Frame, PAL, newKit, tent, type Kit, type RoofKind } from './buildings'
import { bpart, box, cone, cyl, merge, part, sphere } from './geo'
import { buildCastleTown } from './castletown'
import { buildFarmland } from './farmland'

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
 *   tier 2   a stone curtain with towers, a great keep and a little walled town;
 *   tier 3   the same, with an inner ward round the keep and a barbican before the main gate;
 *   tier 4+  concentric: a lower outer wall on its own levelled terrace before the curtain.
 *
 * And its style on who holds it: the King's realm builds pale limestone with tall conical roofs in
 * the lord's colours; the Usurper's black basalt, flat-topped and bristling with iron thorns; the
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
  cap: 'cone' | 'spike' | 'dome' | 'hoard'
  /** Town roofs and house walls. */
  roofs: RoofKind[]
  houses: 'timber' | 'stone' | 'plaster'
}
export const STYLES: Record<FortStyle, StyleDef> = {
  crown: { stone: 0xcdc5b2, stoneD: 0x9d9686, stoneL: 0xddd6c4, keep: 0xd6cfbc, dark: 0x2a241e, cap: 'cone', roofs: ['tile', 'slate', 'tile', 'slate'], houses: 'timber' },
  thorn: { stone: 0x5f5954, stoneD: 0x45403c, stoneL: 0x726b64, keep: 0x6a635c, dark: 0x16120f, cap: 'spike', roofs: ['slate', 'slate', 'shingle'], houses: 'stone' },
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
}

/** Everything the builders of a castle, its town and its country share. */
export interface Ctx {
  c: Castle
  world: World
  shape: CastleShape
  style: FortStyle
  S0: StyleDef
  tier: number
  grand: number
  ruined: boolean
  timber: boolean
  rnd: () => number
  kit: Kit
  stone: THREE.BufferGeometry[]
  roof: THREE.BufferGeometry[]
  gold: THREE.BufferGeometry[]
  /** Ground and small parts: cast no shadow. */
  flat: THREE.BufferGeometry[]
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
  /** Radius of the keep's square, and of the inner ward (0: none). */
  sq: number
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
  /** On the ring of the outer wall (tier 4 up)? */
  nearOuterWall: (x: number, z: number, r: number) => boolean
  /** A barbican before the main gate (the gate town starts beyond it)? Defaults by tier. */
  barbican?: boolean
  /** How far outside the walls the lane round them runs (defaults by tier). */
  ringOff?: number
  /** No lane round the walls (a great city's walls are too long for it). */
  noRing?: boolean
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

export function buildFortress(c: Castle, world: World, shape: CastleShape, style: FortStyle, grand: number, rnd: () => number): Fortress {
  const S0 = STYLES[style]
  const tier = c.tier
  const ruined = !!c.ruined
  const timber = tier <= 1
  const kit = newKit()
  const stone = kit.walls
  const flat: THREE.BufferGeometry[] = []
  kit.flat = flat
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
  /** A conical or pyramid roof: the lord's hue mottled like tile, darker courses, a timber eaves trim. */
  const roofCone = (x: number, y0: number, z: number, r: number, h: number, seg = 12, ry = 0) => {
    const g = bpart(new THREE.ConeGeometry(r, h, seg, 4), 0xffffff, { x, y: y0 + h / 2, z, ry, ao: 0.32 })
    roof.push(mottle(g, 0.06))
    for (const t of [0.22, 0.46, 0.7]) {
      const rb = r * (1 - t + 0.025) * 1.03
      const rt = r * (1 - t - 0.025) * 1.03
      roof.push(bpart(new THREE.CylinderGeometry(rt, rb, h * 0.05, seg, 1, true), 0xb4b4b4, { x, y: y0 + h * t, z, ry, ao: 0 }))
    }
    S(new THREE.CylinderGeometry(r * 1.0, r * 1.05, 0.5, seg, 1, true), WOOD_D, { x, y: y0 + 0.2, z, ry, ao: 0 })
  }
  /** A dome in the lord's hue, ribbed, on a drum: the Sun Emperor's way. */
  const roofDome = (x: number, y0: number, z: number, r: number, stretch: number) => {
    const g = bpart(new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, { x, y: y0, z, sy: stretch, ao: 0.3 })
    roof.push(mottle(g, 0.05))
    for (let k = 0; k < 4; k++) gold.push(bpart(new THREE.TorusGeometry(r * 1.01, Math.max(0.08, r * 0.025), 3, 12, Math.PI), 0xffffff, { x, y: y0, z, ry: (k * Math.PI) / 4, sy: stretch, ao: 0 }))
  }

  const sq = 22 + tier * 4
  const innerR = tier >= 3 && !timber ? sq + 8 : 0
  const keepAt: [number, number] = timber ? [-Math.cos(main) * rAt(main + Math.PI) * 0.4, -Math.sin(main) * rAt(main + Math.PI) * 0.4] : [0, 0]
  const cr = castleRadius(tier)
  const outer = cr * (timber ? 1.75 : 2.05)

  // ---------------------------------------------------------------------------------------------
  // Ground: the bailey levelled inside the walls, cobbled streets, the square before the keep.
  // ---------------------------------------------------------------------------------------------
  const outline = (extra: number, n = 96) => Array.from({ length: n }, (_, i) => pt((i / n) * Math.PI * 2, extra))
  {
    const shp = new THREE.Shape(outline(6).map(([x, z]) => new THREE.Vector2(x, -z)))
    const g = new THREE.ExtrudeGeometry(shp, { depth: 6, bevelEnabled: false, curveSegments: 1 })
    g.rotateX(-Math.PI / 2)
    F(g, ruined ? 0x5a5040 : timber ? 0x8a7a58 : 0x8f7c5c, { y: -5.2, ao: 0 })
  }
  if (!timber) {
    for (const g of gates) {
      const len = rAt(g) + 10
      F(box(len, 0.5, 14), ruined ? 0x6a6050 : 0xa8987a, { x: (Math.cos(g) * len) / 2, y: 0.85, z: (Math.sin(g) * len) / 2, ry: -g, ao: 0 })
      // Setts: a grain of paler and darker stones down the street, kerbs to the sides.
      for (let d = sq; d < len - 4; d += 3.2) for (const u of [-4.5, 0, 4.5]) F(box(2.6, 0.12, 2.6), (Math.round(d + u) % 3) ? 0xb4a486 : 0x9c8e72, { x: Math.cos(g) * d - Math.sin(g) * u, y: 1.13, z: Math.sin(g) * d + Math.cos(g) * u, ry: -g + 0.05 * Math.sin(d), ao: 0 })
      for (const s of [-1, 1]) F(box(len, 0.35, 0.9), 0x8a7c62, { x: (Math.cos(g) * len) / 2 - Math.sin(g) * s * 7, y: 1.05, z: (Math.sin(g) * len) / 2 + Math.cos(g) * s * 7, ry: -g, ao: 0 })
    }
    F(cyl(sq, sq, 0.6, 32), ruined ? 0x6a6050 : 0xb3a588, { y: 0.9, ao: 0 })
    F(cyl(sq + 1, sq + 1, 0.35, 32), 0x8f7f62, { y: 0.7, ao: 0 })
    // Rings of setts round the square.
    for (const rr of [sq * 0.55, sq * 0.8]) F(new THREE.TorusGeometry(rr, 0.35, 3, 40), 0x968a70, { y: 1.22, rx: Math.PI / 2, ao: 0 })
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
  const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
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
    for (let t = -len / 2 + 1.8; t < len / 2 - 1.2; t += 3.6) {
      const ox = cx + tx * t + nx * 3.4
      const oz = cz + tz * t + nz * 3.4
      if (style === 'thorn') {
        S(cone(1.2, 3.2, 4), S0.stone, { x: ox, y: h + 3.6, z: oz, ry: ang + Math.PI / 4 })
        if (Math.round(t / 3.6) % 2 === 0) S(cone(0.18, 2.2, 4), IRON, { x: ox, y: h + 6, z: oz, ao: 0 })
      } else if (style === 'sun') {
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
  const tower = (x: number, z: number, r: number, h: number, capH: number, crown = 0) => {
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
    const n = style === 'thorn' ? 4 : 12
    const rot = style === 'thorn' ? Math.atan2(z, x) + Math.PI / 4 : 0
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
      if (style === 'thorn') S(cone(0.9, 2.6, 4), S0.stone, { x: x + Math.cos(a) * (r + 0.6), y: h + 3.8, z: z + Math.sin(a) * (r + 0.6) })
      else S(box(1.6, 1.6, 0.9), S0.stone, { x: x + Math.cos(a) * (r + 0.7), y: h + 3.3, z: z + Math.sin(a) * (r + 0.7), ry: -a + Math.PI / 2 })
    }
    if (S0.cap === 'cone') {
      S(cyl(r * 0.8, r * 0.8, 2.6, n), S0.stone, { x, y: h + 3.4, z })
      roofCone(x, h + 4.6, z, r + 0.6, capH, n)
      if (crown >= 1) gold.push(bpart(cone(0.6, 2.6, 6), 0xffffff, { x, y: h + 4.6 + capH + 1.2, z, ao: 0 }))
      if (crown >= 2) gold.push(bpart(cyl(r + 0.85, r + 0.85, 0.6, n), 0xffffff, { x, y: h + 4.8, z, ao: 0 }))
      // A weathervane on every tower, a pennant on the grander ones.
      S(cyl(0.08, 0.08, 2.2, 4), IRON, { x, y: h + 4.6 + capH + 1, z, ao: 0 })
    } else if (S0.cap === 'spike') {
      roofCone(x, h + 3.2, z, r * 0.9, capH * 0.35, 4, rot)
      S(cone(0.45, capH * 0.9, 4), IRON, { x, y: h + 3.2 + capH * 0.35 + capH * 0.45, z, ao: 0 })
      for (let i = 0; i < 4; i++) {
        const a = rot + (i / 4) * Math.PI * 2
        S(cone(0.25, 2.6, 4), IRON, { x: x + Math.cos(a) * (r + 1.3), y: h + 1.4, z: z + Math.sin(a) * (r + 1.3), rz: Math.cos(a) * -1.1, rx: Math.sin(a) * 1.1, ao: 0 })
      }
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
      if (crown >= 1) Rf(box(0.2, 2.6, 4.4), 0xffffff, { x, y: h + 4.6 + capH * 0.9 + 1.4, z: z + 2.3, ao: 0 })
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
    for (const st of run) if (st.tower) tower(st.x, st.z, st.corner ? tr + 1.5 : tr, st.corner ? th + 3 : th, 8 + tier, grand)
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
      tower(x, z, 7, crumble(gh + 6), 9, gi === 0 ? grand : 0)
      if (!ruined) Rf(box(0.3, 9, 4), 0xffffff, { x: x + cx * 7.3, y: gh - 2, z: z + cz * 7.3, ry: -g, ao: 0 })
    }
    if (ruined) return
    S(box(10, 6, GH * 2 + 4), S0.stone, { x: ox, y: gh - 2, z: oz, ry: -g })
    S(box(11, 1.4, GH * 2 + 6), S0.stoneD, { x: ox, y: gh + 1.6, z: oz, ry: -g })
    for (let u = -GH - 2; u <= GH + 2; u += 3.4) {
      const [x, z] = lat(u, 4.6)
      if (style === 'thorn') S(cone(1.0, 2.8, 4), S0.stone, { x, y: gh + 3.6, z })
      else S(box(1.4, 1.8, 1.8), S0.stone, { x, y: gh + 3.2, z, ry: -g })
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
    if (grand >= 4)
      for (const s of [-1, 1]) {
        const [x, z] = lat(s * (GH + 2), 4.2)
        Rf(box(0.3, 8, 4.4), 0xffffff, { x, y: gh - 4, z, ry: -g, ao: 0 })
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
  } else if (style === 'sun') {
    const k = 13 + tier * 3
    const kh = crumble((22 + tier * 7) * (grand >= 2 ? 1.12 : 1))
    S(cyl(k + 3, k + 4, 5, 8), S0.stoneD, { y: 1.5, ry: Math.PI / 8, ao: 0.1 })
    stone.push(mottle(bpart(new THREE.CylinderGeometry(k, k, kh, 8, 5), S0.keep, { y: kh / 2, ry: Math.PI / 8 }), 0.04))
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      S(box(4, 6, 0.6), S0.dark, { x: Math.cos(a) * (k - 0.1), y: 4.2, z: Math.sin(a) * (k - 0.1), ry: -a + Math.PI / 2, ao: 0 })
      S(new THREE.TorusGeometry(2, 0.5, 4, 10, Math.PI), S0.stoneL, { x: Math.cos(a) * (k + 0.2), y: 7.2, z: Math.sin(a) * (k + 0.2), ry: -a + Math.PI / 2, ao: 0 })
      for (const y of [kh * 0.5, kh * 0.75]) S(box(1.4, 3.2, 0.3), S0.dark, { x: Math.cos(a) * (k + 0.05), y, z: Math.sin(a) * (k + 0.05), ry: -a + Math.PI / 2, ao: 0 })
    }
    if (!ruined) {
      S(cyl(k + 1.4, k + 1.4, 1.4, 8), S0.stoneD, { y: kh + 0.7, ry: Math.PI / 8 })
      S(cyl(k * 0.72, k * 0.72, 5, 16), S0.stoneL, { y: kh + 3.5 })
      roofDome(0, kh + 6, 0, k * 0.74, 1.15)
      gold.push(bpart(cyl(k * 0.75, k * 0.75, 0.8, 16), 0xffffff, { y: kh + 6.2, ao: 0 }))
      gold.push(bpart(cone(0.9, 6, 8), 0xffffff, { y: kh + 6 + k * 0.85 + 3, ao: 0 }))
      gold.push(bpart(sphere(1.2, 1), 0xffffff, { y: kh + 6 + k * 0.85 + 0.6, ao: 0 }))
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        const x = Math.cos(a) * (k + 2.5)
        const z = Math.sin(a) * (k + 2.5)
        S(cyl(1.8, 2.1, kh + 12, 10), S0.stoneL, { x, y: (kh + 12) / 2, z })
        S(cyl(2.6, 1.8, 1.4, 10), S0.stoneD, { x, y: kh + 12.2, z })
        roofDome(x, kh + 12.9, z, 2.2, 1.5)
        gold.push(bpart(cone(0.3, 2.4, 5), 0xffffff, { x, y: kh + 17.3, z, ao: 0 }))
      }
    }
    keepTop = kh + 6 + k * 0.85 + 6
  } else {
    const k = 16 + tier * 4
    const kh = crumble((20 + tier * 7) * (grand >= 2 ? 1.18 : 1) * (grand >= 5 ? 1.12 : 1) * (style === 'thorn' ? 1.15 : 1))
    const kf = new Frame(0, 0, Math.PI / 4 + main)
    kf.put(stone, box(k + 5, 5, k + 5), S0.stoneD, 0, 1.5, 0, { ao: 0.1 })
    stone.push(mottle(bpart(new THREE.BoxGeometry(k, kh, k, 3, 5, 3), S0.keep, { y: kh / 2, ry: Math.PI / 4 + main, order: 'YXZ' }), 0.045))
    for (let side = 0; side < 4; side++) {
      const f = kf.sub(0, 0, (side * Math.PI) / 2)
      for (const u of [-k * 0.25, k * 0.25]) f.put(stone, box(1.6, kh - 2, 1.2), S0.keep, u, kh / 2, k / 2 + 0.5)
      for (const y of [kh * 0.33, kh * 0.66]) f.put(stone, box(k + 0.4, 0.5, 0.5), S0.stoneD, 0, y, k / 2 + 0.2, { ao: 0 })
      for (let i = 0; i < 2; i++) for (const u of [-k * 0.38, 0, k * 0.38]) f.put(stone, box(1.4, 2.8, 0.3), S0.dark, u, kh * (0.5 + i * 0.22), k / 2 + 0.05, { ao: 0 })
      if (ruined) continue
      f.put(stone, box(k, 1.4, 1.6), S0.stoneD, 0, kh - 0.4, k / 2 + 0.6, { ao: 0.3 })
      f.put(stone, box(k + 2.4, 1.6, 1.2), S0.keep, 0, kh + 0.8, k / 2 + 0.7)
      for (let u = -k / 2 + 0.6; u <= k / 2; u += 2.4) {
        if (style === 'thorn') f.put(stone, cone(0.9, 2.8, 4), S0.keep, u, kh + 3, k / 2 + 0.8)
        else f.put(stone, box(1.3, 1.6, 1.0), S0.keep, u, kh + 2.4, k / 2 + 0.8)
      }
      if (style === 'free') {
        f.put(stone, box(k + 3, 2.8, 2.4), WOOD, 0, kh + 2.6, k / 2 + 2)
        for (let u = -k / 2; u <= k / 2; u += 3) f.put(stone, box(0.3, 2.4, 0.3), WOOD_D, u, kh + 0.4, k / 2 + 3, { ao: 0 })
      }
    }
    if (!ruined) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + main
        const x = Math.cos(a) * k * 0.72
        const z = Math.sin(a) * k * 0.72
        const n = style === 'thorn' ? 4 : 12
        S(cyl(3, 3.2, kh + 7, n), S0.keep, { x, y: (kh + 7) / 2, z, ry: main })
        S(cyl(3.6, 3, 1.2, n), S0.stoneD, { x, y: kh + 7.4, z, ry: main, ao: 0.1 })
        if (style === 'thorn') {
          S(cone(0.5, 9, 4), IRON, { x, y: kh + 12.5, z, ao: 0 })
          for (let j = 0; j < 4; j++) S(cone(0.7, 2.4, 4), S0.keep, { x: x + Math.cos(j * 1.57 + main) * 2.8, y: kh + 9.2, z: z + Math.sin(j * 1.57 + main) * 2.8 })
        } else {
          for (let j = 0; j < 6; j++) {
            const b = (j / 6) * Math.PI * 2
            S(box(1, 1.2, 0.8), S0.keep, { x: x + Math.cos(b) * 3.3, y: kh + 8.6, z: z + Math.sin(b) * 3.3, ry: -b + Math.PI / 2 })
          }
          if (style === 'free') stone.push(mottle(bpart(new THREE.ConeGeometry(4.2, 7, 8, 3), 0x6f5a42, { x, y: kh + 12.2, z, ao: 0.3 }), 0.08))
          else roofCone(x, kh + 8.7, z, 3.6, 7, 12)
        }
      }
      const fb = kf.sub(0, k / 2 + 3, 0)
      fb.put(stone, box(7, kh * 0.38, 6), S0.keep, 0, kh * 0.19, 0)
      fb.put(stone, box(2.4, 3.6, 0.3), S0.dark, 0, kh * 0.38 - 2.4, 3.05, { ao: 0 })
      for (let i = 0; i < 7; i++) fb.put(stone, box(3.4, 0.6, 1.6), S0.stoneD, 4.8, 0.4 + (i * (kh * 0.33)) / 7, 2.6 - i * 0.8, { ao: 0.05 })
      if (style === 'thorn') {
        roofCone(0, kh, 0, k * 0.55, 8, 4, Math.PI / 4 + main)
        S(cone(1.1, 16, 4), IRON, { y: kh + 16, ao: 0 })
        keepTop = kh + 12
      } else if (style === 'free') {
        stone.push(mottle(bpart(new THREE.ConeGeometry(k * 0.78, 13 + tier, 4, 4), 0x6f5a42, { y: kh + 3 + (13 + tier) / 2, ry: Math.PI / 4 + main, ao: 0.3 }), 0.08))
        keepTop = kh + 14 + tier
      } else {
        roofCone(0, kh + 1.8, 0, k * 0.72, 13 + tier, 4, Math.PI / 4 + main)
        keepTop = kh + 14 + tier
      }
      if (grand >= 3) {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4 + main
          const x = Math.cos(a) * (k * 0.95)
          const z = Math.sin(a) * (k * 0.95)
          S(cyl(2.2, 2.4, kh * 0.6, 10), S0.keep, { x, y: kh * 0.3, z })
          roofCone(x, kh * 0.6, z, 3, 6, 10)
        }
        gold.push(bpart(box(k + 2.5, 0.9, k + 2.5), 0xffffff, { y: kh + 2, ry: Math.PI / 4 + main, ao: 0 }))
      }
      if (grand >= 5) {
        gold.push(bpart(cone(2.6, 18, 8), 0xffffff, { y: kh + 1.8 + (13 + tier) + 9, ao: 0 }))
        gold.push(bpart(sphere(1.6, 1), 0xffffff, { y: kh + 1.8 + (13 + tier) + 19, ao: 0 }))
      }
    } else {
      keepTop = kh
      for (let i = 0; i < 8; i++) S(new THREE.DodecahedronGeometry(2 + rnd() * 2.5, 0), S0.stoneD, { x: (rnd() - 0.5) * k * 1.6, y: 1.2, z: (rnd() - 0.5) * k * 1.6, ry: rnd() * 3 })
    }
  }
  taken.push({ x: kx, z: kz, r: timber ? 28 : sq })

  // ---------------------------------------------------------------------------------------------
  // An inner ward round the keep (tier 3 up).
  // ---------------------------------------------------------------------------------------------
  if (innerR) {
    const ih = wallH * 0.62
    const n = 28
    const at = (a: number): [number, number] => {
      const k = 0.92 + (profAt(shape, a) - 1) * 0.6
      return [Math.cos(a) * innerR * k, Math.sin(a) * innerR * k]
    }
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2
      const a1 = ((i + 1) / n) * Math.PI * 2
      const [ax, az] = at(a0)
      const [bx, bz] = at(a1)
      const mx = (ax + bx) / 2
      const mz = (az + bz) / 2
      if (onStreet(mx, mz, 12)) continue
      if (ruined && rnd() < 0.3) continue
      const len = Math.hypot(bx - ax, bz - az) + 0.6
      const ang = -Math.atan2(bz - az, bx - ax)
      const h = crumble(ih)
      S(box(len, h, 4), S0.stone, { x: mx, y: h / 2, z: mz, ry: ang })
      if (!ruined) {
        S(box(len, 1, 5), S0.stoneD, { x: mx, y: h + 0.5, z: mz, ry: ang, ao: 0 })
        const mm = Math.hypot(mx, mz) || 1
        S(box(1.6, 1.6, 1.2), S0.stone, { x: mx + (mx / mm) * 1.8, y: h + 1.6, z: mz + (mz / mm) * 1.8, ry: ang })
        if (i % 3 === 0) Rf(box(0.3, h * 0.7, 3.4), 0xffffff, { x: mx + (mx / mm) * 2.2, y: h * 0.55, z: mz + (mz / mm) * 2.2, ry: ang + Math.PI / 2, ao: 0 })
      }
    }
    for (let i = 0; i < 4; i++) tower(...at(main + Math.PI / 4 + (i * Math.PI) / 2), 4.6, ih + 6, 7, grand)
    for (const g of gates) for (const s of [-1, 1]) tower(...(at(g).map((v, j) => v + (j === 0 ? -Math.sin(g) : Math.cos(g)) * s * 12) as [number, number]), 3.6, ih + 4, 5.5)
  }

  // ---------------------------------------------------------------------------------------------
  // A lower outer wall (tier 4 up) on its own levelled terrace, with gate turrets at the roads.
  // ---------------------------------------------------------------------------------------------
  const outerWall = !timber && (tier >= 4 || grand >= 4)
  if (outerWall) {
    const out = 24
    const n2 = 72
    const pts = Array.from({ length: n2 }, (_, i) => pt((i / n2) * Math.PI * 2, out))
    // The terrace: the ground under the wall, smoothed round the ring so the wall runs level.
    const raw = pts.map(([x, z]) => G(x, z))
    const lvl = raw.map((_, i) => {
      let s = 0
      for (let k = -5; k <= 5; k++) s += raw[(i + k + n2) % n2]
      return s / 11
    })
    const gap = (a: number) => gates.some((g) => g !== waterGate && Math.abs(angDiff(a, g)) * (rAt(a) + out) < GH + 12)
    for (let i = 0; i < n2; i++) {
      const j = (i + 1) % n2
      const mid = ((i + 0.5) / n2) * Math.PI * 2
      if (gap(mid)) continue
      if (onBank(...pts[i])) continue
      if (ruined && rnd() < 0.4) continue
      const [ax, az] = pts[i]
      const [bx, bz] = pts[j]
      const mx = (ax + bx) / 2
      const mz = (az + bz) / 2
      const len = Math.hypot(bx - ax, bz - az) + 0.5
      const ang = -Math.atan2(bz - az, bx - ax)
      const y0 = (lvl[i] + lvl[j]) / 2
      const lo = Math.min(raw[i], raw[j], y0) - 1.2
      const h = crumble(7)
      // The plinth down to the ground, then the wall on the level terrace.
      S(box(len, y0 - lo + 0.8, 5.5), S0.stoneD, { x: mx, y: (y0 + lo) / 2, z: mz, ry: ang, ao: 0.2 })
      S(box(len, h, 3.5), S0.stone, { x: mx, y: y0 + h / 2, z: mz, ry: ang })
      if (!ruined) for (let t = -len / 2 + 1; t < len / 2; t += 2.6) S(box(1.4, 1.3, 3.5), S0.stone, { x: mx + Math.cos(-ang) * t, y: y0 + h + 0.6, z: mz + Math.sin(-ang) * t, ry: ang })
      if (i % 5 === 0 && !ruined && !gap((i / n2) * Math.PI * 2)) {
        S(cyl(3, 3.4, 10 + (y0 - lo), 12), S0.stone, { x: ax, y: (y0 + lo + 10) / 2, z: az })
        roofCone(ax, y0 + 10, az, 4, 5, 12)
      }
    }
    // Gate turrets where the roads pass the outer wall: two drum towers and a low arch between.
    for (const g of gates) {
      if (g === waterGate) continue
      const r = rAt(g) + out
      const cx = Math.cos(g)
      const cz = Math.sin(g)
      const y0 = G(cx * r, cz * r)
      for (const s of [-1, 1]) {
        const x = cx * r - cz * s * (GH + 9)
        const z = cz * r + cx * s * (GH + 9)
        const yb = G(x, z)
        S(cyl(4, 4.6, 13 + Math.max(0, y0 - yb), 12), S0.stone, { x, y: yb + (13 + Math.max(0, y0 - yb)) / 2 - 1, z })
        if (!ruined) {
          S(cyl(4.8, 4.8, 1.2, 12), S0.stoneD, { x, y: yb + 12.6, z })
          roofCone(x, yb + 13.2, z, 5, 6, 12)
        }
      }
      if (!ruined) S(box(6, 3, GH * 2 + 14), S0.stone, { x: cx * r, y: y0 + 11, z: cz * r, ry: -g })
    }
  }

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
  const nearOuterWall = (x: number, z: number, r: number) => outerWall && Math.abs(Math.hypot(x, z) - (rAt(Math.atan2(z, x)) + 24)) < r + 5
  const ctx: Ctx = {
    c, world, shape, style, S0, tier, grand, ruined, timber, rnd, kit, stone, roof, gold, flat, smoke, mills, G, S, F, Rf, rAt, pt, gates, main, waterGate, sq, innerR, keepAt, wallH, taken, free, freeRect, onStreet, inWalls, firm, foot, roofCone, outer, lanes, laneClear, nearOuterWall,
  }
  buildCastleTown(ctx)
  buildFarmland(ctx)

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
  return { stone, roof, gold, glow: kit.glow, ring, wallH, keepTop, keepAt, mills, smoke, flat }
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
