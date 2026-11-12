import * as THREE from 'three'
import { box, bpart, cone, cyl, sphere } from './geo'

/**
 * A small kit of medieval architecture for the merged-geometry buildings:
 * houses with stone plinths, timber framing, jettied upper floors, proper
 * roofs (overhangs, ridge beams, bargeboards, dormers), stepped chimneys,
 * recessed doors and shuttered windows; and the yard props around them.
 *
 * Everything is pushed into plain arrays of prepared parts and merged by the
 * caller, so a whole village or castle is still a handful of draw calls.
 */
export interface Kit {
  /** Stone, plaster, timber, props: natural colours. */
  walls: THREE.BufferGeometry[]
  /** Roofs in natural thatch, tile, slate or shingle. */
  roofs: THREE.BufferGeometry[]
  /** Cloth and paint in the owner's colour (banners, awnings, shields, trim). */
  accents: THREE.BufferGeometry[]
  /** Things that glow: forge mouths, braziers, lanterns, windows at dusk. */
  glow: THREE.BufferGeometry[]
}
export const newKit = (): Kit => ({ walls: [], roofs: [], accents: [], glow: [] })

export const PAL = {
  plaster: [0xe3d6b8, 0xd9caa6, 0xcfbf9c, 0xe8dfca, 0xd6c3a0],
  stone: 0xa49c8c,
  stoneD: 0x847c6f,
  stoneL: 0xbdb5a5,
  timber: 0x4b3421,
  timberL: 0x6b4b2e,
  thatch: [0xb48e54, 0xa98549, 0xbf9a5f],
  thatchD: 0x8a6a3c,
  tile: [0x9b5a3a, 0x8e4f35, 0xa8674a],
  slate: [0x5f6670, 0x565c66, 0x6a7079],
  shingle: [0x6f5a42, 0x7a6248],
  shutters: [0x55663f, 0x4f5f6e, 0x7a4a30, 0x6a5a3a],
  dark: 0x23201c,
  door: 0x4a3322,
  iron: 0x3a3936,
  soot: 0x2a2724,
  canvas: 0xe2d6b8,
}
export type RoofKind = 'thatch' | 'tile' | 'slate' | 'shingle'
const pick = <T,>(a: T[], r: number) => a[Math.floor(r * a.length) % a.length]

/** A gable roof: ridge along x, slopes falling to ±z, eaves at y = 0. */
export function gable(span: number, len: number, h: number): THREE.BufferGeometry {
  const L = len / 2
  const S = span / 2
  const v = [
    // front slope (+z)
    -L, 0, S, L, 0, S, L, h, 0, -L, 0, S, L, h, 0, -L, h, 0,
    // back slope (-z)
    L, 0, -S, -L, 0, -S, -L, h, 0, L, 0, -S, -L, h, 0, L, h, 0,
    // gable ends
    L, 0, S, L, 0, -S, L, h, 0, -L, 0, -S, -L, 0, S, -L, h, 0,
    // soffit (underside)
    -L, 0, -S, L, 0, -S, L, 0, S, -L, 0, -S, L, 0, S, -L, 0, S,
  ]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  return g
}

/** A hipped roof: four slopes, a short ridge along x. */
export function hip(span: number, len: number, h: number): THREE.BufferGeometry {
  const L = len / 2
  const S = span / 2
  const r = Math.max(0, L - S * 0.9)
  const v = [
    -L, 0, S, L, 0, S, r, h, 0, -L, 0, S, r, h, 0, -r, h, 0,
    L, 0, -S, -L, 0, -S, -r, h, 0, L, 0, -S, -r, h, 0, r, h, 0,
    L, 0, S, L, 0, -S, r, h, 0,
    -L, 0, -S, -L, 0, S, -r, h, 0,
    -L, 0, -S, L, 0, -S, L, 0, S, -L, 0, -S, L, 0, S, -L, 0, S,
  ]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  return g
}

type PartOpts = { rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number; ao?: number; jitter?: number }

/** A local frame on the ground: x along a building's front, z out of its door, y up. */
export class Frame {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly ry: number
  private c: number
  private s: number
  constructor(x: number, z: number, ry: number, y = 0) {
    this.x = x
    this.y = y
    this.z = z
    this.ry = ry
    this.c = Math.cos(ry)
    this.s = Math.sin(ry)
  }
  /** Local point to parent space. */
  at(lx: number, lz: number): [number, number] {
    return [this.x + lx * this.c + lz * this.s, this.z - lx * this.s + lz * this.c]
  }
  sub(lx: number, lz: number, ry = 0, ly = 0) {
    const [x, z] = this.at(lx, lz)
    return new Frame(x, z, this.ry + ry, this.y + ly)
  }
  put(out: THREE.BufferGeometry[], geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, lx: number, ly: number, lz: number, o: PartOpts = {}) {
    const [x, z] = this.at(lx, lz)
    out.push(bpart(geo, color, { ...o, x, y: this.y + ly, z, ry: this.ry + (o.ry ?? 0), order: 'YXZ' }))
  }
}

export interface HouseOpts {
  w: number
  d: number
  storeys?: 1 | 2
  roof?: RoofKind
  style?: 'timber' | 'stone' | 'plaster'
  detail?: 'high' | 'mid'
  ruined?: boolean
  /** Lean-to annex on one side (L-shaped plan). */
  annex?: boolean
  /** Hang a cloth in the owner's colour by the door. */
  banner?: boolean
}

/** One house. Returns the height of its ridge. */
export function house(k: Kit, f: Frame, o: HouseOpts, rnd: () => number): number {
  const { w, d } = o
  const two = o.storeys === 2
  const high = o.detail !== 'mid'
  const style = o.style ?? 'timber'
  const P = 0.9 // plinth top
  const H1 = 3.4
  const H2 = 3.0
  const wall = style === 'stone' ? (rnd() < 0.5 ? PAL.stoneL : 0xb3aa98) : pick(PAL.plaster, rnd())
  const timber = rnd() < 0.5 ? PAL.timber : 0x5a3e27
  // A stone plinth, sunk into the ground so slopes never show daylight beneath.
  f.put(k.walls, box(w + 0.5, high ? 2.6 : 1.2, d + 0.5), PAL.stoneD, 0, high ? P - 1.3 : P - 0.6, 0, { ao: 0.1 })

  if (o.ruined) {
    // Burned: scorched stumps of wall, fallen beams, a chimney left standing.
    f.put(k.walls, box(w, 1.6 + rnd() * 1.4, 0.5), 0x3a3430, 0, P + 1, -d / 2 + 0.25)
    f.put(k.walls, box(0.5, 1.2 + rnd(), d), 0x332e2a, -w / 2 + 0.25, P + 0.8, 0)
    for (let i = 0; i < 3; i++) f.put(k.walls, box(w * 0.8, 0.35, 0.35), 0x1c1916, (rnd() - 0.5) * w * 0.4, P + 0.4 + i * 0.3, (rnd() - 0.5) * d * 0.6, { ry: rnd() * 3, rz: (rnd() - 0.5) * 0.6 })
    f.put(k.walls, box(1.2, 4 + rnd() * 2, 1.2), 0x2c2825, w / 2 - 0.8, P + 2.5, -d / 4)
    return P + 3
  }

  // Ground floor.
  f.put(k.walls, box(w, H1, d), wall, 0, P + H1 / 2, 0)
  let top = P + H1
  let fw = w
  let fd = d
  let fz = 0
  const frame = (y0: number, hh: number, ww: number, dd: number, zz: number) => {
    if (style === 'timber' && !high) {
      // Town houses (seen from afar): the top rail and a brace across the front.
      f.put(k.walls, box(ww + 0.12, 0.36, 0.3), timber, 0, y0 + hh - 0.18, zz + dd / 2 + 0.06)
      f.put(k.walls, box(0.26, hh * 0.95, 0.22), timber, ww * 0.3, y0 + hh / 2, zz + dd / 2 + 0.08, { rz: 0.55 })
    } else if (style === 'timber') {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.put(k.walls, box(0.38, hh, 0.38), timber, (sx * ww) / 2, y0 + hh / 2, zz + (sz * dd) / 2, { ao: 0.12 })
      for (const sz of [-1, 1]) {
        f.put(k.walls, box(ww + 0.12, 0.34, 0.3), timber, 0, y0 + hh - 0.17, zz + (sz * dd) / 2 + sz * 0.06)
        if (high) f.put(k.walls, box(ww + 0.1, 0.3, 0.28), timber, 0, y0 + 0.15, zz + (sz * dd) / 2 + sz * 0.06)
      }
      if (high) {
        // Front: a middle post and a pair of braces.
        f.put(k.walls, box(0.3, hh, 0.26), timber, ww * 0.02, y0 + hh / 2, zz + dd / 2 + 0.07)
        for (const s of [-1, 1]) f.put(k.walls, box(0.24, hh * 0.95, 0.22), timber, s * ww * 0.3, y0 + hh / 2, zz + dd / 2 + 0.08, { rz: s * 0.55 })
        // Sides: a rail and a brace.
        for (const s of [-1, 1]) {
          f.put(k.walls, box(0.26, 0.26, dd + 0.1), timber, (s * ww) / 2 + s * 0.06, y0 + hh * 0.5, zz)
          f.put(k.walls, box(0.22, hh * 0.9, 0.22), timber, (s * ww) / 2 + s * 0.07, y0 + hh / 2, zz, { rx: 0.6 })
        }
      }
    } else if (high) {
      // Dressed quoins at the corners.
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
        for (let q = 0; q < hh / 0.9 - 0.5; q++) f.put(k.walls, box(q % 2 ? 0.7 : 0.95, 0.42, q % 2 ? 0.95 : 0.7), PAL.stoneL, (sx * ww) / 2, y0 + 0.3 + q * 0.9, zz + (sz * dd) / 2, { ao: 0.05 })
      f.put(k.walls, box(ww + 0.3, 0.3, dd + 0.3), PAL.stoneD, 0, y0 + hh, zz)
    }
  }
  frame(P, H1, w, d, 0)
  if (two) {
    // A jettied upper floor: it overhangs the street on the ends of the floor joists.
    const jz = 0.45
    if (high) for (let x = -w / 2 + 0.4; x <= w / 2 - 0.3; x += 0.85) f.put(k.walls, box(0.28, 0.3, 0.7), timber, x, top + 0.15, d / 2 + 0.2)
    f.put(k.walls, box(w + 0.5, 0.36, d + jz + 0.3), timber, 0, top + 0.18, jz / 2)
    fw = w + 0.4
    fd = d + jz
    fz = jz / 2
    f.put(k.walls, box(fw, H2, fd), pick(PAL.plaster, rnd()), 0, top + 0.36 + H2 / 2, fz)
    frame(top + 0.36, H2, fw, fd, fz)
    top += 0.36 + H2
  }

  // Doorway: a recessed door in a timber frame, a step, and on some houses a little porch roof.
  const dx = (rnd() - 0.5) * w * 0.35
  if (high) f.put(k.walls, box(1.3, 2.3, 0.4), PAL.dark, dx, P + 1.15, d / 2 - 0.12, { ao: 0 })
  f.put(k.walls, box(1.1, 2.1, 0.12), PAL.door, dx, P + 1.05, d / 2 + 0.02, { ao: 0.1 })
  if (high) {
    for (const s of [-1, 1]) f.put(k.walls, box(0.22, 2.5, 0.3), timber, dx + s * 0.75, P + 1.25, d / 2 + 0.08)
    f.put(k.walls, box(1.9, 0.3, 0.34), timber, dx, P + 2.5, d / 2 + 0.08)
    f.put(k.walls, box(1.8, 0.3, 0.9), PAL.stone, dx, P - 0.1, d / 2 + 0.5)
    if (rnd() < 0.45) {
      f.put(k.roofs, box(2.3, 0.16, 1.3), roofColor(o.roof ?? 'shingle', rnd), dx, P + 2.95, d / 2 + 0.75, { rx: 0.3 })
      for (const s of [-1, 1]) f.put(k.walls, box(0.18, 2.9, 0.18), timber, dx + s * 1.0, P + 1.45, d / 2 + 1.25)
    }
  }
  // Windows with sills and open shutters.
  const shutter = pick(PAL.shutters, rnd())
  const windows: [number, number, number][] = []
  for (const lx of [-w * 0.32, w * 0.32]) if (Math.abs(lx - dx) > 1.5) windows.push([lx, P + H1 * 0.62, d / 2])
  if (two) for (const lx of [-fw * 0.27, fw * 0.27]) windows.push([lx, P + H1 + 0.36 + H2 * 0.55, fz + fd / 2])
  for (const [lx, ly, lz] of windows) {
    f.put(k.walls, box(0.95, 1.05, 0.14), PAL.dark, lx, ly, lz + 0.02, { ao: 0 })
    if (!high) continue
    f.put(k.walls, box(1.25, 0.14, 0.32), timber, lx, ly - 0.6, lz + 0.12)
    for (const s of [-1, 1]) f.put(k.walls, box(0.5, 1.05, 0.08), shutter, lx + s * 0.78, ly, lz + 0.12, { ry: s * 0.35 })
  }

  // The roof: a good overhang, a ridge beam, bargeboards on the gables.
  const roof = o.roof ?? 'thatch'
  const rc = roofColor(roof, rnd)
  const span = fd + (roof === 'thatch' ? 1.9 : 1.4)
  const len = fw + (roof === 'thatch' ? 1.2 : 1.0)
  const rh = span * (roof === 'thatch' ? 0.62 : roof === 'slate' ? 0.6 : 0.5)
  const hipped = roof === 'thatch' && rnd() < 0.45
  const ry0 = top - 0.12
  if (roof === 'thatch') {
    // Thick, rounded thatch: a darker underlayer shows at the eaves.
    f.put(k.roofs, hipped ? hip(span + 0.5, len + 0.5, rh + 0.3) : gable(span + 0.5, len + 0.3, rh + 0.3), PAL.thatchD, 0, ry0 - 0.45, fz, { ao: 0.25 })
    f.put(k.roofs, hipped ? hip(span, len, rh) : gable(span, len, rh), rc, 0, ry0, fz, { ao: 0.18 })
    f.put(k.roofs, box(len * (hipped ? 0.5 : 1) + 0.2, 0.55, 0.9), PAL.thatchD, 0, ry0 + rh - 0.1, fz, { ao: 0.05 })
  } else {
    f.put(k.roofs, gable(span, len, rh), rc, 0, ry0, fz, { ao: 0.15 })
    f.put(k.roofs, box(len + 0.3, 0.32, 0.5), roof === 'tile' ? 0x7a4028 : PAL.timber, 0, ry0 + rh + 0.02, fz)
    if (high) {
      const slope = Math.atan2(rh, span / 2)
      const sl = Math.hypot(rh, span / 2)
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) f.put(k.walls, box(0.22, 0.4, sl + 0.2), timber, (sx * len) / 2 + sx * 0.05, ry0 + rh / 2, fz + (sz * span) / 4, { rx: sz * slope })
      // Tile and slate courses: thin ribs across the slopes.
      for (let t = 0.25; t < 0.95; t += 0.25)
        for (const sz of [-1, 1]) f.put(k.roofs, box(len + 0.05, 0.1, 0.18), shade(rc, -0.12), 0, ry0 + rh * t + 0.05, fz + sz * (span / 2) * (1 - t), { rx: sz * slope })
    }
  }
  // A dormer on bigger two-storey houses.
  if (high && two && roof !== 'thatch' && rnd() < 0.5) {
    const dzz = fz + span * 0.2
    f.put(k.walls, box(1.6, 1.4, 1.6), pick(PAL.plaster, rnd()), 0, ry0 + rh * 0.38 + 0.4, dzz)
    f.put(k.walls, box(0.8, 0.8, 0.1), PAL.dark, 0, ry0 + rh * 0.38 + 0.45, dzz + 0.82)
    f.put(k.roofs, gable(1.9, 2.1, 0.9), rc, 0, ry0 + rh * 0.38 + 1.1, dzz + 0.1, { ry: Math.PI / 2 })
  }
  // A stepped stone chimney through the roof.
  if (rnd() < 0.85) {
    const cx = (rnd() < 0.5 ? -1 : 1) * (len / 2 - 1.3)
    const ch = rh + 1.4
    f.put(k.walls, box(1.4, ch, 1.3), PAL.stone, cx, ry0 + ch / 2 - 0.4, fz - span * 0.12)
    if (high) {
      f.put(k.walls, box(1.65, 0.3, 1.55), PAL.stoneL, cx, ry0 + ch - 0.45, fz - span * 0.12)
      f.put(k.walls, box(1.0, 0.8, 0.95), PAL.stone, cx, ry0 + ch - 0.0, fz - span * 0.12)
      f.put(k.walls, box(0.6, 0.12, 0.55), PAL.soot, cx, ry0 + ch + 0.45, fz - span * 0.12, { ao: 0 })
    }
  }
  // A lean-to annex on the side: the plan turns into an L.
  if (high && o.annex) {
    const s = rnd() < 0.5 ? -1 : 1
    const aw = 2.8
    const ah = H1 * 0.78
    const ad = d * 0.75
    f.put(k.walls, box(aw, ah, ad), style === 'stone' ? PAL.stoneL : pick(PAL.plaster, rnd()), s * (w / 2 + aw / 2), P + ah / 2, -d * 0.1)
    for (const sz of [-1, 1]) f.put(k.walls, box(0.3, ah, 0.3), timber, s * (w / 2 + aw), P + ah / 2, -d * 0.1 + (sz * ad) / 2)
    f.put(k.roofs, box(aw + 0.9, 0.22, ad + 0.8), rc, s * (w / 2 + aw / 2 + 0.2), P + ah + 0.5, -d * 0.1, { rz: -s * 0.35 })
    f.put(k.walls, box(0.9, 1.7, 0.1), PAL.door, s * (w / 2 + aw / 2), P + 0.85, -d * 0.1 + ad / 2 + 0.03)
  }
  if (o.banner) {
    f.put(k.walls, box(0.12, 0.12, 1.4), PAL.iron, dx + 1.2, P + 2.9, d / 2 + 0.7)
    f.put(k.accents, box(0.9, 1.5, 0.06), 0xffffff, dx + 1.2, P + 2.1, d / 2 + 1.35)
  }
  // Odds and ends by the door.
  if (high && rnd() < 0.5) barrel(k, f, dx + (rnd() < 0.5 ? -1.7 : 1.7), d / 2 + 0.8)
  if (high && rnd() < 0.35) woodpile(k, f.sub(-w / 2 - 0.8, -d * 0.15, Math.PI / 2))
  return ry0 + rh
}

function roofColor(roof: RoofKind, rnd: () => number): number {
  return roof === 'thatch' ? pick(PAL.thatch, rnd()) : roof === 'tile' ? pick(PAL.tile, rnd()) : roof === 'slate' ? pick(PAL.slate, rnd()) : pick(PAL.shingle, rnd())
}

export function shade(hex: number, f: number): number {
  const c = new THREE.Color(hex)
  if (f < 0) c.multiplyScalar(1 + f)
  else c.lerp(new THREE.Color(1, 1, 1), f)
  return c.getHex()
}

// --- Props ---------------------------------------------------------------------------

export function barrel(k: Kit, f: Frame, lx: number, lz: number, s = 1) {
  f.put(k.walls, cyl(0.62 * s, 0.62 * s, 1.5 * s, 10), 0x6e5032, lx, 0.75 * s, lz)
  f.put(k.walls, cyl(0.7 * s, 0.7 * s, 0.6 * s, 10), 0x7a5a38, lx, 0.75 * s, lz, { ao: 0 })
  for (const y of [0.2, 1.3]) f.put(k.walls, cyl(0.66 * s, 0.66 * s, 0.1 * s, 10), PAL.iron, lx, y * s, lz, { ao: 0 })
}

export function crate(k: Kit, f: Frame, lx: number, ly: number, lz: number, s = 1.5) {
  f.put(k.walls, box(s, s, s), 0x8a6a40, lx, ly + s / 2, lz)
  f.put(k.walls, box(s + 0.06, 0.16, s + 0.06), 0x5e4628, lx, ly + s - 0.1, lz, { ao: 0 })
  f.put(k.walls, box(0.14, s + 0.04, s + 0.04), 0x5e4628, lx, ly + s / 2, lz, { ao: 0 })
}

export function woodpile(k: Kit, f: Frame) {
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) f.put(k.walls, cyl(0.38, 0.38, 3, 6), i % 2 ? 0x7a5a36 : 0x8a6a40, -1.1 + i * 0.75 + r * 0.37, 0.4 + r * 0.66, 0, { rx: Math.PI / 2 })
  // Pale cut ends.
  f.put(k.walls, box(3.1, 1.9, 0.08), 0xc8a874, 0, 1.0, 1.52, { ao: 0.3, sy: 0.9 })
  f.put(k.roofs, box(3.6, 0.15, 3.6), 0x5a4630, 0, 2.6, 0, { rx: 0.25 })
}

export function haystack(k: Kit, f: Frame, lx: number, lz: number, s = 1) {
  f.put(k.walls, cyl(2.2 * s, 2.4 * s, 1.6 * s, 10), 0xc6a85a, lx, 0.8 * s, lz)
  f.put(k.walls, cone(2.3 * s, 2.6 * s, 10), 0xd4b866, lx, 2.9 * s, lz)
  f.put(k.walls, cyl(0.1, 0.1, 5 * s, 4), PAL.timber, lx, 2.5 * s, lz, { ao: 0 })
}

/** Spoked wheel standing in the local yz-plane (axle along x). */
export function wheel(k: Kit, f: Frame, lx: number, ly: number, lz: number, r = 1.2) {
  f.put(k.walls, new THREE.TorusGeometry(r, 0.14, 4, 14), 0x3b2a18, lx, ly, lz, { ry: Math.PI / 2, ao: 0 })
  f.put(k.walls, cyl(0.3, 0.3, 0.5, 8), 0x2e2116, lx, ly, lz, { rz: Math.PI / 2, ao: 0 })
  for (let i = 0; i < 3; i++) f.put(k.walls, box(0.1, r * 2, 0.12), 0x4a3420, lx, ly, lz, { rx: (i / 3) * Math.PI, ao: 0 })
}

export function cart(k: Kit, f: Frame, load: 'hay' | 'barrels' | 'sacks' | 'empty' = 'empty', rnd: () => number = Math.random) {
  f.put(k.walls, box(2.4, 0.3, 4.2), 0x7a5a36, 0, 1.6, 0)
  for (const s of [-1, 1]) f.put(k.walls, box(0.15, 0.7, 4.2), 0x6b4b2e, s * 1.15, 2.05, 0)
  for (const s of [-1, 1]) f.put(k.walls, box(0.15, 0.15, 3.4), 0x6b4b2e, s * 0.6, 1.35, 3.6, { rx: -0.25 })
  for (const s of [-1, 1]) wheel(k, f, s * 1.35, 1.2, -0.4)
  if (load === 'hay') f.put(k.walls, box(2.2, 1.4, 3.8), 0xd4b866, 0, 2.6, 0, { jitter: 0.12 })
  if (load === 'barrels') for (let i = 0; i < 3; i++) barrel(k, f.sub(0, -1.2 + i * 1.2, 0, 1.75), (rnd() - 0.5) * 0.4, 0, 0.7)
  if (load === 'sacks') for (let i = 0; i < 4; i++) f.put(k.walls, sphere(0.65, 0), 0xcdbf98, -0.5 + (i % 2), 2.2 + Math.floor(i / 2) * 0.5, -1 + i * 0.6, { sy: 0.7 })
}

export function well(k: Kit, f: Frame) {
  f.put(k.walls, cyl(1.9, 2.0, 1.4, 14), PAL.stone, 0, 0.7, 0)
  f.put(k.walls, cyl(1.4, 1.4, 1.42, 12), 0x1a2228, 0, 0.72, 0, { ao: 0 })
  f.put(k.walls, cyl(2.05, 2.05, 0.25, 14), PAL.stoneL, 0, 1.45, 0)
  for (const s of [-1, 1]) f.put(k.walls, box(0.3, 3.4, 0.3), PAL.timber, s * 1.7, 2.6, 0)
  f.put(k.walls, cyl(0.25, 0.25, 3.6, 6), 0x5a3e27, 0, 3.4, 0, { rz: Math.PI / 2 })
  f.put(k.walls, cyl(0.35, 0.3, 0.5, 8), 0x6e5032, 0.3, 2.4, 0)
  f.put(k.roofs, gable(3.2, 4.2, 1.4), pick(PAL.shingle, 0.3), 0, 4.2, 0)
}

export function fence(k: Kit, f: Frame, len: number) {
  for (let x = -len / 2; x <= len / 2 + 0.01; x += 2.4) f.put(k.walls, box(0.22, 1.4, 0.22), 0x5a3e27, x, 0.7, 0, { ao: 0.1 })
  for (const y of [0.55, 1.1]) f.put(k.walls, box(len, 0.14, 0.12), 0x6b4b2e, 0, y, 0, { ao: 0 })
}

export function tree(k: Kit, f: Frame, lx: number, lz: number, rnd: () => number, s = 1, burnt = false) {
  if (burnt) {
    f.put(k.walls, cyl(0.3 * s, 0.5 * s, 4 * s, 5), 0x1a1715, lx, 2 * s, lz)
    f.put(k.walls, box(0.15, 1.6 * s, 0.15), 0x1a1715, lx + 0.4, 3.4 * s, lz, { rz: 0.7 })
    return
  }
  f.put(k.walls, cyl(0.32 * s, 0.5 * s, 3.4 * s, 6), 0x5b4027, lx, 1.7 * s, lz)
  const greens = [0x4f7a32, 0x5f8a3a, 0x46702e, 0x6a8f40]
  // A crown of three leafy clumps (low-poly: there are many trees).
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2
    const r = i === 0 ? 0 : 1.3 * s
    f.put(k.walls, sphere((i === 0 ? 2.4 : 1.7) * s, 0), greens[i % greens.length], lx + Math.cos(a) * r, (4.6 + (i === 0 ? 0.7 : rnd() * 0.8)) * s, lz + Math.sin(a) * r, { ao: 0.3, jitter: 0.1, ry: rnd() * 3 })
  }
}

/** A bell tent: canvas, a pole, guy ropes, the door flap tied back. */
export function tent(k: Kit, f: Frame, lx: number, lz: number, r = 3.6, cloth: 'canvas' | 'accent' = 'canvas') {
  const out = cloth === 'accent' ? k.accents : k.walls
  f.put(k.walls, cyl(r, r, 1.3, 10), PAL.canvas, lx, 0.65, lz, { ao: 0.25 })
  f.put(out, cone(r + 0.2, r * 1.15, 10), cloth === 'accent' ? 0xffffff : 0xd8ccb0, lx, 1.3 + (r * 1.15) / 2, lz)
  f.put(k.walls, cyl(0.1, 0.1, 1.2, 4), PAL.timber, lx, 1.3 + r * 1.15 + 0.3, lz, { ao: 0 })
  f.put(k.walls, box(1.1, 1.3, 0.1), PAL.dark, lx, 0.65, lz + r - 0.02, { ao: 0 })
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    f.put(k.walls, box(0.05, 0.05, r * 0.9), 0xb8ab8a, lx + Math.cos(a) * (r + 0.6), 0.9, lz + Math.sin(a) * (r + 0.6), { ry: -a + Math.PI / 2, rx: 0.6, ao: 0 })
  }
}

/** A flagpole with a hanging banner in the owner's colour. */
export function bannerPole(k: Kit, f: Frame, lx: number, lz: number, h = 7) {
  f.put(k.walls, cyl(0.14, 0.18, h, 5), PAL.timber, lx, h / 2, lz, { ao: 0.05 })
  f.put(k.walls, box(1.6, 0.12, 0.12), PAL.timber, lx + 0.7, h - 0.3, lz, { ao: 0 })
  f.put(k.accents, box(1.4, 2.2, 0.06), 0xffffff, lx + 0.75, h - 1.5, lz)
}

/** A brazier: an iron basket on legs with coals that glow. */
export function brazier(k: Kit, f: Frame, lx: number, ly: number, lz: number) {
  for (let i = 0; i < 3; i++) f.put(k.walls, box(0.1, 1.2, 0.1), PAL.iron, lx + Math.cos((i / 3) * 6.28) * 0.4, ly + 0.6, lz + Math.sin((i / 3) * 6.28) * 0.4, { ao: 0 })
  f.put(k.walls, cyl(0.7, 0.45, 0.5, 8), PAL.iron, lx, ly + 1.4, lz, { ao: 0 })
  f.put(k.glow, cone(0.5, 0.9, 6), 0xff8a3a, lx, ly + 2.0, lz)
}

/** A horse standing in a stall or on a tether line (head towards +z). */
export function horse(k: Kit, f: Frame, col: number) {
  f.put(k.walls, box(1.1, 1.3, 2.8), col, 0, 2.2, 0)
  f.put(k.walls, box(0.6, 1.4, 0.7), col, 0, 3.0, 1.5, { rx: -0.6 })
  f.put(k.walls, box(0.45, 0.5, 1.1), col, 0, 3.5, 2.1)
  for (const [x, z] of [[-0.4, 1.1], [0.4, 1.1], [-0.4, -1.1], [0.4, -1.1]]) f.put(k.walls, box(0.25, 1.6, 0.25), shade(col, -0.2), x, 0.8, z)
  f.put(k.walls, box(0.15, 1.0, 0.25), 0x1a1410, 0, 2.1, -1.5, { rx: 0.4 })
}
