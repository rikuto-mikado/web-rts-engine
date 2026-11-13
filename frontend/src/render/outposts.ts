import * as THREE from 'three'
import type { GameEngine } from '../game/engine'
import type { Outpost } from '../game/types'
import { Frame, PAL, barrel, brazier, cart, crate, gable, haystack, horse, house, newKit, tent, wheel, woodpile, type Kit } from './buildings'
import { bmerge, box, cone, cyl, groundShade } from './geo'
import { applyVision } from './vision'
import { makeBanner, waveFlag, type StandardFlag } from './standards'

const woodMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), '', false, false, true)

const LOG = 0x6b4a2a
const LOG_D = 0x5a3d22
const ROOFW = 0x4a321c
const EARTH = 0x7a6648
const EARTH_D = 0x5e4e38
const FIRE = 0xff8a3a
const O = new Frame(0, 0, 0)

const done = (k: Kit, scale = 1) => {
  const g = groundShade(bmerge([...k.walls, ...k.roofs, ...k.accents, ...k.glow]), 3, 0.22)
  if (scale !== 1) g.scale(scale, scale * 0.8 + 0.2, scale)
  return g
}
/** A pad of earth under the work, reaching down so it never floats on a slope. */
const pad = (k: Kit, r: number, col = EARTH) => O.put(k.walls, cyl(r, r + 3, 3, 24), col, 0, -1.1, 0, { ao: 0 })
const squarePad = (k: Kit, h: number) => O.put(k.walls, box(h * 2 + 8, 3, h * 2 + 8), EARTH, 0, -1.1, 0, { ao: 0 })

/** A campfire: a ring of stones, crossed logs, flames. */
function campfire(k: Kit, f: Frame, x: number, z: number) {
  for (let i = 0; i < 7; i++) f.put(k.walls, box(0.8, 0.5, 0.8), PAL.stone, x + Math.cos((i / 7) * 6.28) * 1.6, 0.25, z + Math.sin((i / 7) * 6.28) * 1.6, { ry: i })
  for (const r of [0.4, 2]) f.put(k.walls, box(2.6, 0.4, 0.4), LOG_D, x, 0.4, z, { ry: r })
  f.put(k.glow, cone(0.8, 1.6, 6), FIRE, x, 1.2, z)
  f.put(k.glow, cone(0.45, 1.1, 5), 0xffd27a, x + 0.3, 1.0, z - 0.2)
}

/** A weapon rack with spears. */
function rack(k: Kit, f: Frame, x: number, z: number) {
  for (const s of [-1, 1]) f.put(k.walls, box(0.25, 2.2, 0.25), PAL.timber, x + s * 1.6, 1.1, z)
  f.put(k.walls, box(3.6, 0.2, 0.25), PAL.timber, x, 1.9, z)
  for (let i = 0; i < 5; i++) {
    f.put(k.walls, box(0.08, 3.6, 0.08), PAL.timberL, x - 1.2 + i * 0.6, 1.8, z + 0.25, { rx: -0.15, ao: 0 })
    f.put(k.walls, cone(0.14, 0.5, 4), 0x9a9a98, x - 1.2 + i * 0.6, 3.75, z + 0.52, { rx: -0.15, ao: 0 })
  }
}

/** A palisade of sharpened logs along local x, with binding rails and a fighting walk on the inside (-z). */
function palisadeRun(k: Kit, f: Frame, len: number, h = 8, walk = true, gap = 0) {
  for (let x = -len / 2; x <= len / 2 + 0.01; x += 2.3) {
    if (gap && Math.abs(x) < gap) continue
    const hh = h + ((Math.abs(x * 7) | 0) % 3) * 0.5
    f.put(k.walls, cyl(0.95, 1.1, hh, 6), (Math.abs(x) * 10) % 2 < 1 ? LOG : LOG_D, x, hh / 2 - 0.5, 0, { jitter: 0.1 })
    f.put(k.walls, cone(0.95, 1.6, 6), ROOFW, x, hh + 0.3, 0, { ao: 0 })
  }
  const runs = gap ? [[-len / 2, -gap], [gap, len / 2]] : [[-len / 2, len / 2]]
  for (const [a, b] of runs) {
    const l = b - a
    const c = (a + b) / 2
    for (const y of [2.5, h - 2]) f.put(k.walls, box(l, 0.4, 0.4), LOG_D, c, y, -1.1, { ao: 0 })
    if (!walk) continue
    f.put(k.walls, box(l, 0.35, 2.4), 0x8a6a40, c, h - 2.9, -2.2, { ao: 0.1 })
    for (let x = a + 1; x < b; x += 5) f.put(k.walls, box(0.4, h - 2.9, 0.4), LOG_D, x, (h - 2.9) / 2, -3.2)
  }
}

/** A timber watchtower: four legs, braces, a railed platform, a pyramid roof, a ladder. */
function watchtower(k: Kit, f: Frame, x: number, z: number, h = 18, w = 7) {
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.put(k.walls, cyl(0.45, 0.6, h, 6), LOG_D, x + (dx * w) / 2.6, h / 2, z + (dz * w) / 2.6)
  for (const s of [-1, 1]) {
    f.put(k.walls, box(0.3, h * 0.7, 0.3), LOG, x, h * 0.4, z + (s * w) / 2.6, { rz: 0.5 })
    f.put(k.walls, box(0.3, h * 0.7, 0.3), LOG, x + (s * w) / 2.6, h * 0.4, z, { rx: 0.5 })
  }
  f.put(k.walls, box(w + 1, 1, w + 1), LOG, x, h, z)
  for (const [dx, dz, ry] of [[0, 1, 0], [0, -1, 0], [1, 0, Math.PI / 2], [-1, 0, Math.PI / 2]] as const) f.put(k.walls, box(w + 1, 2.2, 0.5), 0x7a5a36, x + (dx * (w + 0.6)) / 2, h + 1.6, z + (dz * (w + 0.6)) / 2, { ry })
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.put(k.walls, box(0.35, 4.4, 0.35), LOG_D, x + (dx * w) / 2, h + 2.7, z + (dz * w) / 2)
  f.put(k.roofs, cone(w * 0.85, 4.6, 4), ROOFW, x, h + 7.2, z, { ry: Math.PI / 4 })
  for (const s of [-1, 1]) f.put(k.walls, box(0.2, h, 0.2), PAL.timberL, x + s * 0.6, h / 2, z + w / 2 + 0.8, { rx: -0.08 })
  for (let y = 1; y < h; y += 1.4) f.put(k.walls, box(1.3, 0.14, 0.14), PAL.timberL, x, y, z + w / 2 + 0.8 - y * 0.08, { ao: 0 })
}

/** Palisade Castrum: a square log stockade on an earth bank, fighting walks, corner towers, a gatehouse on each side. */
function castrumGeometry() {
  const k = newKit()
  const H = 50
  squarePad(k, H)
  for (let q = 0; q < 4; q++) {
    const a = (q * Math.PI) / 2
    // Each side faces out along +z of its frame; the walk is on its inner side.
    const f = new Frame(Math.sin(a) * H, Math.cos(a) * H, a)
    f.put(k.walls, box(H * 2 + 6, 1.6, 8), EARTH, 0, 0.3, 0.5, { ao: 0.1 })
    f.put(k.walls, box(H * 2 + 14, 0.5, 5), EARTH_D, 0, -0.1, 6.5, { ao: 0 })
    palisadeRun(k, f, H * 2, 8.5, true, 6)
    // The gate: open leaves, a fighting platform over the gap, towers either side.
    for (const s of [-1, 1]) f.put(k.walls, box(5.2, 7, 0.6), LOG, s * 5.5, 3.5, -2.8, { ry: s * 1.2 })
    f.put(k.walls, box(14, 0.8, 3.4), LOG, 0, 9.2, -1)
    for (const s of [-1, 1]) for (const dz of [-2.4, 0.6]) f.put(k.walls, cyl(0.55, 0.6, 12, 6), LOG_D, s * 6.6, 5.6, dz)
    f.put(k.walls, box(14, 2, 0.4), 0x7a5a36, 0, 10.8, 0.7)
    f.put(k.roofs, gable(5, 15, 2.4), ROOFW, 0, 12.2, -0.9)
  }
  for (const [x, z] of [[H, H], [H, -H], [-H, H], [-H, -H]] as const) watchtower(k, O, x, z, 18, 7)
  return done(k)
}

/** Inside a camp: tents, a command pavilion with its pennant, fire, racks, a cart and a woodpile. */
function campGeometry(spread: number) {
  const k = newKit()
  const spots: [number, number][] = [[14, 12], [-12, 18], [18, -14], [-4, -22], [-24, -4], [26, 4], [-20, 24], [8, 24]]
  spots.forEach(([x, z], i) => tent(k, O, x * spread, z * spread, 3.2 + (i % 3) * 0.5))
  // Command pavilion: a long ridge tent in red canvas with scalloped valance.
  const c = new Frame(0, 0, 0.2)
  c.put(k.walls, box(12, 3.4, 8), 0xe2d6b8, 0, 1.7, 0)
  c.put(k.roofs, gable(8.8, 12.8, 4.6), 0x9a2a22, 0, 3.4, 0)
  for (let x = -6; x <= 6; x += 1.2) for (const s of [-1, 1]) c.put(k.roofs, cone(0.5, 0.8, 4), 0x9a2a22, x, 3.1, s * 4.4, { rx: Math.PI })
  for (const s of [-1, 1]) c.put(k.walls, cyl(0.15, 0.15, 10.5, 5), PAL.timber, s * 6.4, 5.2, 0, { ao: 0 })
  c.put(k.walls, box(1.8, 2.6, 0.1), PAL.dark, 0, 1.3, 4.02, { ao: 0 })
  c.put(k.walls, box(2.4, 1.4, 0.12), 0xd9b24a, 0, 9.8, 0.1, { ao: 0 })
  campfire(k, O, 9 * spread, 10 * spread)
  campfire(k, O, -10 * spread, -8 * spread)
  rack(k, O, -6 * spread, 8 * spread)
  rack(k, new Frame(6 * spread, -8 * spread, 1.2), 0, 0)
  cart(k, new Frame(-16 * spread, -14 * spread, 0.7), 'barrels', () => 0.5)
  woodpile(k, new Frame(16 * spread, -4 * spread, 1.6))
  for (let i = 0; i < 4; i++) crate(k, O, 4 + (i % 2) * 1.6, Math.floor(i / 2) * 1.4, -8, 1.4)
  return done(k)
}

/** Wagon Laager: war wagons chained in a ring, pavises along their sides, a camp within. */
function laagerGeometry() {
  const k = newKit()
  const R = 40
  const n = 14
  pad(k, 46)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    // Each wagon runs along the ring; its outer side faces +z.
    const f = new Frame(Math.cos(a) * R, Math.sin(a) * R, Math.atan2(Math.cos(a), Math.sin(a)))
    f.put(k.walls, box(14, 0.6, 5), LOG, 0, 2.6, 0)
    for (const s of [-1, 1]) f.put(k.walls, box(14, 2.2, 0.35), 0x7a5a36, 0, 3.9, s * 2.4)
    for (const x of [-4.5, 4.5]) for (const s of [-1, 1]) wheel(k, f.sub(x, s * 2.9, Math.PI / 2), 0, 1.8, 0, 1.8)
    // Canvas tilt on hoops, and painted pavises hung along the outer side.
    f.put(k.walls, new THREE.CylinderGeometry(2.6, 2.6, 12, 10, 1, true, -Math.PI / 2, Math.PI), 0xd8ccae, 0, 5.0, 0, { rz: Math.PI / 2 })
    for (let x = -4; x <= 4; x += 4) f.put(k.walls, new THREE.TorusGeometry(2.65, 0.12, 3, 10, Math.PI), PAL.timber, x, 5.0, 0, { ry: Math.PI / 2, ao: 0 })
    for (let x = -5.5; x <= 5.6; x += 2.75) {
      f.put(k.walls, box(2.2, 3.4, 0.3), (Math.round(x) & 2) === 0 ? 0x8a3a2a : 0xd8c9a0, x, 4.4, 2.75)
      f.put(k.walls, box(0.6, 3.2, 0.32), 0x3a3936, x, 4.4, 2.8, { ao: 0 })
    }
    // A chain to the next wagon, and the tongue.
    f.put(k.walls, box(5, 0.2, 0.2), PAL.iron, 8.5, 2, 0, { ao: 0 })
    f.put(k.walls, box(0.3, 0.3, 4), PAL.timber, -8, 1.8, -1, { rx: 0.2 })
  }
  return done(k)
}

/** Mangonel Redoubt: an earthen ring with a ditch, gabions and fascines; a counterweight mangonel and a ballista on plank platforms. */
function redoubtGeometry() {
  const k = newKit()
  const R = 44
  pad(k, 50)
  O.put(k.walls, new THREE.TorusGeometry(R, 5, 6, 40), EARTH, 0, 1.2, 0, { rx: Math.PI / 2, sz: 0.45, ao: 0.1 })
  O.put(k.walls, new THREE.TorusGeometry(R + 9, 2.4, 4, 40), EARTH_D, 0, 0.2, 0, { rx: Math.PI / 2, sz: 0.2, ao: 0 })
  // Gabions (wicker baskets of earth) along the crest, a fascine bundle between each.
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2
    if (Math.abs(Math.sin(a)) < 0.12 && Math.cos(a) > 0) continue
    O.put(k.walls, cyl(1.5, 1.5, 3.2, 8), 0x8a7048, Math.cos(a) * R, 4.1, Math.sin(a) * R, { jitter: 0.12 })
    O.put(k.walls, cyl(1.55, 1.55, 0.3, 8), 0x6a5434, Math.cos(a) * R, 5.7, Math.sin(a) * R, { ao: 0 })
    const b = a + Math.PI / 30
    O.put(k.walls, cyl(0.6, 0.6, 3.6, 6), 0x7a6440, Math.cos(b) * R, 3, Math.sin(b) * R, { rx: Math.PI / 2, ry: -b, ao: 0.1 })
  }
  // The mangonel: a framed base on a plank platform, A-frame uprights, an axle, the arm with its sling, a counterweight box of stones, a winch.
  const m = new Frame(-10, 0, 0)
  m.put(k.walls, box(18, 0.6, 16), 0x8a6a40, 0, 0.6, 0)
  for (let x = -8; x <= 8; x += 1.6) m.put(k.walls, box(1.4, 0.15, 16), 0x9a7a4c, x, 0.98, 0, { ao: 0 })
  for (const s of [-1, 1]) {
    m.put(k.walls, box(14, 1.2, 1.2), LOG_D, 0, 1.6, s * 4.6)
    m.put(k.walls, box(1.2, 13, 1.2), LOG, -2.5, 8, s * 4.6, { rz: 0.28 })
    m.put(k.walls, box(1.2, 13, 1.2), LOG, 2.5, 8, s * 4.6, { rz: -0.28 })
  }
  for (const x of [-6, 6]) m.put(k.walls, box(1, 1, 10.4), LOG_D, x, 1.6, 0)
  m.put(k.walls, cyl(0.6, 0.6, 11, 8), PAL.iron, 0, 14, 0, { rx: Math.PI / 2 })
  m.put(k.walls, box(26, 1.1, 1.1), LOG, 3, 15.6, 0, { rz: 0.42 })
  m.put(k.walls, box(4.4, 4, 4.4), 0x6b4a2a, -9.6, 8.6, 0)
  for (let i = 0; i < 5; i++) m.put(k.walls, new THREE.DodecahedronGeometry(0.9, 0), 0x8a8378, -10.6 + (i % 3), 11, -0.8 + Math.floor(i / 3) * 1.4)
  m.put(k.walls, box(0.1, 4.5, 0.1), 0xb8ab8a, 14.6, 19.4, 0, { ao: 0 })
  m.put(k.walls, box(1.2, 0.8, 1.2), 0x6b5a3e, 14.6, 17, 0)
  for (const s of [-1, 1]) wheel(k, m.sub(6, s * 5.6, Math.PI / 2), 0, 2.4, 0, 1.6)
  m.put(k.walls, cyl(0.45, 0.45, 9.6, 8), LOG_D, 6, 2.4, 0, { rx: Math.PI / 2 })
  // The ballista: a great crossbow on a pivot post.
  const b = new Frame(14, 8, -0.6)
  b.put(k.walls, box(10, 0.6, 10), 0x8a6a40, 0, 0.6, 0)
  for (let i = 0; i < 3; i++) b.put(k.walls, box(0.6, 5, 0.6), LOG_D, Math.cos((i / 3) * 6.28) * 1.6, 3, Math.sin((i / 3) * 6.28) * 1.6, { rx: Math.sin((i / 3) * 6.28) * 0.3, rz: -Math.cos((i / 3) * 6.28) * 0.3 })
  b.put(k.walls, cyl(0.7, 0.9, 1.4, 8), PAL.iron, 0, 5.6, 0)
  b.put(k.walls, box(1.2, 0.9, 10), LOG, 0, 6.6, 0.8)
  for (const s of [-1, 1]) b.put(k.walls, box(6, 0.7, 0.7), LOG, s * 3, 6.8, 4.6, { ry: s * 0.35 })
  for (const s of [-1, 1]) b.put(k.walls, box(0.06, 0.06, 6.2), 0xb8ab8a, s * 2.6, 6.9, 2.2, { ry: -s * 0.9, ao: 0 })
  b.put(k.walls, box(0.25, 0.25, 7), PAL.timberL, 0, 7.2, 2.6, { ao: 0 })
  b.put(k.walls, cone(0.3, 0.9, 4), 0x9a9a98, 0, 7.2, 6.5, { rx: Math.PI / 2, ao: 0 })
  // Piles of shot and a rack of bolts; the crew's tent.
  for (let i = 0; i < 12; i++) O.put(k.walls, new THREE.DodecahedronGeometry(1.4, 0), 0x8a8378, 2 + (i % 4) * 2.4, 1.4 + Math.floor(i / 8) * 1.8, -14 + (Math.floor(i / 4) % 2) * 2.2, { ry: i })
  for (let i = 0; i < 6; i++) O.put(k.walls, box(0.2, 0.2, 6), PAL.timberL, 18 + i * 0.3, 0.4 + (i % 2) * 0.3, -8, { ao: 0 })
  tent(k, O, -18, 24, 3.6)
  barrel(k, O, -12, 22)
  return done(k)
}

/** Outrider Pavilion: low camouflaged tents under netting, a horse line, brush screens all round. */
function pavilionGeometry() {
  const k = newKit()
  pad(k, 40, 0x6a6a42)
  const greens = [0x4c6a32, 0x5f7a3a, 0x56703a, 0x6a7a42]
  for (const [x, z, r] of [[-14, -8, 0.3], [10, -12, -0.4], [2, 14, 1.2], [-20, 14, 0.8], [20, 10, -1]] as const) {
    const f = new Frame(x, z, r)
    f.put(k.walls, box(9, 2.4, 7), 0x5a6a3a, 0, 1.2, 0)
    f.put(k.roofs, gable(7.6, 9.6, 3.4), r > 0 ? 0x5a6a3a : 0x6a5a3a, 0, 2.4, 0)
    // Cut branches laid over the canvas.
    for (let i = 0; i < 5; i++) f.put(k.walls, box(2.4, 0.4, 1.2), greens[i % 4], -3.6 + i * 1.8, 3.6 + (i % 2) * 0.5, (i % 2 ? 1.6 : -1.4), { rx: i % 2 ? 0.5 : -0.5, ry: i * 0.4, jitter: 0.15 })
  }
  // Horse line: a rope between posts, horses tethered, hay.
  const hl = new Frame(0, -26, 0)
  for (const x of [-11, 11]) hl.put(k.walls, box(0.4, 3, 0.4), PAL.timber, x, 1.5, 0)
  hl.put(k.walls, box(22, 0.08, 0.08), 0xb8ab8a, 0, 2.6, 0, { ao: 0 })
  ;[-7, -2.5, 2, 6.5].forEach((x, i) => horse(k, hl.sub(x, -1.5, Math.PI), [0x5a3e2a, 0x7a5a3a, 0x3a2a20, 0x6a4a30][i]))
  haystack(k, hl, 14, -3, 0.8)
  // Brush screens and camouflage netting on poles.
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2
    O.put(k.walls, new THREE.SphereGeometry(3.6, 6, 4), greens[i % 4], Math.cos(a) * 38, 2.2, Math.sin(a) * 38, { sy: 0.7, ry: i, jitter: 0.15 })
    O.put(k.walls, cone(1.4, 4, 5), greens[(i + 1) % 4], Math.cos(a + 0.12) * 37, 2.4, Math.sin(a + 0.12) * 37, { jitter: 0.15 })
  }
  for (const [x, z] of [[-6, 0], [6, 2], [-6, 6], [6, -4]]) O.put(k.walls, cyl(0.3, 0.3, 7, 4), LOG_D, x, 3.5, z)
  O.put(k.walls, box(18, 0.3, 12), 0x55693a, 0, 7, 1, { jitter: 0.12 })
  for (let i = 0; i < 8; i++) O.put(k.walls, box(2, 0.3, 2), greens[i % 4], -7 + (i % 4) * 4.6, 7.3, -3 + Math.floor(i / 4) * 8, { ry: i, jitter: 0.15 })
  campfire(k, O, 0, 2)
  return done(k)
}

/** Supply depot: a stockade with a gatehouse, a timber storehouse on a stone footing with a hoist, a stable, wagons. */
function depotGeometry() {
  const k = newKit()
  const H = 26
  squarePad(k, H)
  for (let q = 0; q < 4; q++) {
    const a = (q * Math.PI) / 2
    const f = new Frame(Math.sin(a) * H, Math.cos(a) * H, a)
    palisadeRun(k, f, H * 2, 6.8, q !== 1, q === 1 ? 6 : 0)
  }
  // Gate towers on the +x side.
  for (const s of [-1, 1]) {
    for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) O.put(k.walls, cyl(0.35, 0.45, 11, 5), LOG_D, H + dx, 5.5, s * 8 + dz)
    O.put(k.walls, box(4.4, 0.8, 4.4), LOG, H, 10.6, s * 8)
    for (const o of [-2, 2]) O.put(k.walls, box(4.4, 1.6, 0.3), 0x7a5a36, H, 11.6, s * 8 + o)
    O.put(k.roofs, cone(3.6, 3.5, 4), ROOFW, H, 14, s * 8, { ry: Math.PI / 4 })
  }
  // Storehouse: stone footing, timber frame, a loading door in the gable with a hoist beam and pulley.
  house(k, new Frame(-8, -9, 0), { w: 22, d: 11, storeys: 2, roof: 'shingle', style: 'timber', detail: 'high' }, () => 0.42)
  O.put(k.walls, box(0.6, 0.6, 3.4), LOG, -19.6, 10.4, -9, { ao: 0 })
  O.put(k.walls, cyl(0.5, 0.5, 0.4, 8), PAL.iron, -21, 10, -9, { rz: Math.PI / 2, ao: 0 })
  O.put(k.walls, box(0.06, 6, 0.06), 0xb8ab8a, -21.2, 6.8, -9, { ao: 0 })
  O.put(k.walls, box(1.4, 2.2, 0.12), PAL.dark, -19.2, 9.4, -9, { ry: Math.PI / 2, ao: 0 })
  // Stable with hay.
  const st = new Frame(-13, 13, 0)
  st.put(k.walls, box(10, 4.4, 7), LOG, 0, 2.2, 0)
  st.put(k.roofs, gable(8.6, 11, 3), ROOFW, 0, 4.3, 0)
  st.put(k.walls, box(3, 3, 0.1), PAL.dark, 2, 1.5, 3.52, { ao: 0 })
  haystack(k, O, -3, 16, 0.8)
  // Wagons by the gate.
  cart(k, new Frame(14, -14, 0.3 + Math.PI / 2), 'sacks', () => 0.5)
  cart(k, new Frame(16, 12, -0.4 + Math.PI / 2), 'barrels', () => 0.3)
  brazier(k, O, H - 4, 0, -4)
  brazier(k, O, H - 4, 0, 4)
  return done(k, 1.6)
}

/** Crates, sacks and barrels: the stores on hand. Scaled by the depot's stock. */
function storesGeometry() {
  const k = newKit()
  for (let i = 0; i < 12; i++) crate(k, O, 4 + (i % 4) * 3.3, 0, -2 + Math.floor(i / 4) * 3.3, 3)
  for (let i = 0; i < 6; i++) crate(k, O, 5.6 + (i % 3) * 3.3, 3, -0.4 + Math.floor(i / 3) * 3.3, 3)
  for (let i = 0; i < 6; i++) barrel(k, O, -2 - (i % 3) * 2.8, 4 + Math.floor(i / 3) * 2.8, 1.8)
  for (let i = 0; i < 6; i++) O.put(k.walls, new THREE.SphereGeometry(1.5, 6, 4), 0xcdbf98, 6 + (i % 3) * 2.6, 1 + Math.floor(i / 3) * 1.2, 9 + (i % 2) * 0.4, { sy: 0.7, jitter: 0.12 })
  return done(k, 1.6)
}

/** How far each kind of works reaches from its centre (for fitting it to the ground). */
const FOOTPRINT: Record<string, number> = { castrum: 70, laager: 46, redoubt: 54, pavilion: 40, depot: 56 }
const moundMat = applyVision(new THREE.MeshStandardMaterial({ color: 0x7a6648, roughness: 0.95, flatShading: true }), '', false, false, true)

class OutpostView {
  readonly group = new THREE.Group()
  private palisade: THREE.Mesh
  private camp: THREE.Mesh
  private standard: THREE.Group
  private flag: StandardFlag
  private color: string
  constructor(o: Outpost, engine: GameEngine, geos: Record<string, [THREE.BufferGeometry, THREE.BufferGeometry]>) {
    this.color = engine.factionColor(o.faction)
    const [mainGeo, extraGeo] = geos[o.kind] ?? geos.castrum
    this.palisade = new THREE.Mesh(mainGeo, woodMat)
    this.camp = new THREE.Mesh(extraGeo, woodMat)
    for (const m of [this.palisade, this.camp]) {
      m.castShadow = true
      m.receiveShadow = true
    }
    // The banner (a swallowtail in the owner's colours on a crossbar standard) stands on a corner
    // tower, the mangonel, the command tent or the storehouse.
    const at: Record<string, [number, number, number]> = { castrum: [50, 24, 50], laager: [0, 6, 0], redoubt: [-10, 14, 0], pavilion: [0, 7, 1], depot: [-13, 20, -14] }
    const [px, py, pz] = at[o.kind] ?? [0, 6, 0]
    const banner = makeBanner({ color: this.color, pattern: o.kind === 'castrum' ? 'quarterly' : o.kind === 'depot' ? 'fess' : 'pale', finial: 'spear', scale: 0.72, seed: o.id.length })
    banner.group.position.set(px, py, pz)
    this.standard = banner.group
    this.flag = banner.flag
    this.group.add(this.palisade, this.camp, this.standard)
    // Stand on the highest ground under the works and raise an earth platform beneath, so on a
    // slope nothing sinks into the hillside and nothing hangs in the air.
    const world = engine.world
    const R = FOOTPRINT[o.kind] ?? 50
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < 16; i++) {
      for (const r of [R * 0.5, R]) {
        const h = world.heightAt(o.x + Math.cos((i / 16) * Math.PI * 2) * r, o.z + Math.sin((i / 16) * Math.PI * 2) * r)
        lo = Math.min(lo, h)
        hi = Math.max(hi, h)
      }
    }
    hi = Math.max(hi, world.heightAt(o.x, o.z))
    const drop = hi - lo
    if (drop > 0.8) {
      const square = o.kind === 'castrum' || o.kind === 'depot'
      const half = o.kind === 'castrum' ? 54 : o.kind === 'depot' ? 26 * 1.6 + 4 : R
      const g = square ? new THREE.BoxGeometry(half * 2, drop + 2, half * 2) : new THREE.CylinderGeometry(R, R + drop * 0.8, drop + 2, 28)
      g.translate(0, -(drop + 2) / 2 + 0.4, 0)
      const mound = new THREE.Mesh(g, moundMat)
      mound.receiveShadow = true
      this.group.add(mound)
    }
    this.group.position.set(o.x, hi - 0.3, o.z)
    this.group.rotation.y = (o.x * 13 + o.z * 7) % 6.28
  }
  update(o: Outpost, time: number) {
    // The palisade rises as it is built; the camp appears halfway.
    const p = Math.max(0.08, o.progress)
    this.palisade.scale.set(1, p, 1)
    this.camp.visible = o.progress > 0.5
    if (o.kind === 'depot') {
      // The stores pile up and run down with the depot's stock.
      const stock = (o.stock ?? 100) / 100
      this.camp.visible = o.progress >= 1 && stock > 0.02
      this.camp.scale.set(1, Math.max(0.15, stock), 1)
    }
    this.flag.mesh.visible = o.progress >= 1
    if (o.progress >= 1) waveFlag(this.flag, time, 0.9)
    // Burning: sink and darken a little.
    this.group.scale.setScalar(1 - o.raze * 0.25)
  }
}

export class OutpostRenderer {
  readonly group = new THREE.Group()
  private views = new Map<string, OutpostView>()
  private geos: Record<string, [THREE.BufferGeometry, THREE.BufferGeometry]> = (() => {
    const empty = new THREE.BufferGeometry()
    return {
      castrum: [castrumGeometry(), campGeometry(1.2)],
      laager: [laagerGeometry(), campGeometry(0.7)],
      redoubt: [redoubtGeometry(), empty],
      pavilion: [pavilionGeometry(), empty],
      depot: [depotGeometry(), storesGeometry()],
    }
  })()
  private engine: GameEngine
  constructor(engine: GameEngine) {
    this.engine = engine
  }
  update(time: number) {
    const seen = new Set<string>()
    for (const o of this.engine.state.outposts) {
      seen.add(o.id)
      let v = this.views.get(o.id)
      if (!v) {
        v = new OutpostView(o, this.engine, this.geos)
        this.views.set(o.id, v)
        this.group.add(v.group)
      }
      v.update(o, time)
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue
      this.group.remove(v.group)
      this.views.delete(id)
    }
  }
}
