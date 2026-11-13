import * as THREE from 'three'
import { mulberry32 } from '../game/noise'
import type { TerrainFeature } from '../game/types'
import type { World } from '../game/world'
import { box, cone, cyl, merge, part, sphere } from './geo'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { applyVision, visionUniforms } from './vision'
import { chunkInstances } from './terrain'

/**
 * The great woods. Two kinds of ground, each built as its own forest rather than a scatter of the
 * ordinary trees:
 *
 *   Old-growth forest: a stand of giants. Firs with flared, buttressed trunks of red bark rising
 *   bare to a crown far above, and ancient broadleaves with trunks like towers and limbs as thick as
 *   ordinary trees, hung with moss. Between them the floor is open: ferns, mossy boulders, fallen
 *   giants with shelf fungus, rings of toadstools, saplings in the gaps, and shafts of sunlight
 *   slanting down through the canopy.
 *
 *   The Deepwood: a sea of trees. Dark firs and broadleaves packed trunk to trunk, rising towards
 *   the heart so the whole wood reads as one great dome from afar, dead snags standing grey among
 *   them, a thick hem of undergrowth at the edge, and a low mist drifting slowly through it.
 *
 * Trunks and foliage are separate instanced meshes, so the climate tints only the leaves (autumn
 * colours, frost, charred woods) and never the bark.
 */

type Mats = THREE.Matrix4[]

const BARK_RED = 0x7a4a32
const BARK_RED_D = 0x5e3826
const BARK = 0x5a4430
const BARK_D = 0x45331f
const MOSS = 0x5d7a36
const MOSS_D = 0x46602a
const SNAG = 0x8a8478

/** A cylinder from a to b (bark, limbs, roots). */
function between(a: [number, number, number], b: [number, number, number], r0: number, r1: number, color: number, seg = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const len = d.length()
  const g = new THREE.CylinderGeometry(r1, r0, len, seg)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())
  const e = new THREE.Euler().setFromQuaternion(q)
  return part(g, color, { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2, rx: e.x, ry: e.y, rz: e.z })
}

/** Shade a merged model by height: darker low down and inside the crown, lighter at the top. */
function heightShade(g: THREE.BufferGeometry, y0: number, y1: number, lo: number, hi: number) {
  const pos = g.attributes.position as THREE.BufferAttribute
  const col = g.attributes.color as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, (pos.getY(i) - y0) / (y1 - y0)))
    // A little more light on the outside of the crown than deep inside it.
    const out = Math.min(1, Math.hypot(pos.getX(i), pos.getZ(i)) / 9)
    const k = lo + (hi - lo) * t * (0.75 + out * 0.25)
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k)
  }
  col.needsUpdate = true
  return g
}

// ---------------------------------------------------------------------------
// Old-growth giants
// ---------------------------------------------------------------------------

/** A giant fir: a buttressed root flare, a bare red column of a trunk, a high spired crown. */
function giantFirWood() {
  const p: THREE.BufferGeometry[] = []
  p.push(part(cone(5.4, 4.5, 10), BARK_RED_D, { y: 2.1 }))
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3
    p.push(between([Math.cos(a) * 1.4, 3.6, Math.sin(a) * 1.4], [Math.cos(a) * 6.2, -0.2, Math.sin(a) * 6.2], 1.3, 0.35, BARK_RED_D, 5))
  }
  p.push(part(cyl(1.45, 2.9, 40, 10), BARK_RED, { y: 20 }))
  // Furrowed bark: darker ribs running up the trunk.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    p.push(between([Math.cos(a) * 2.75, 1, Math.sin(a) * 2.75], [Math.cos(a) * 1.45, 36, Math.sin(a) * 1.45], 0.38, 0.2, BARK_RED_D, 4))
  }
  // Dead stubs of the lower boughs, long shed.
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4
    const y = 14 + i * 2.3
    const r = 2.6 - (y / 40) * 1.3
    p.push(between([Math.cos(a) * r * 0.6, y, Math.sin(a) * r * 0.6], [Math.cos(a) * (r + 2.6), y + 0.8, Math.sin(a) * (r + 2.6)], 0.32, 0.12, BARK_D, 4))
  }
  // Moss up the shady side of the foot.
  p.push(part(sphere(2.2, 0), MOSS, { x: -1.6, y: 3.4, z: 1.2, sx: 0.55, sy: 1.6 }))
  p.push(part(sphere(1.6, 0), MOSS_D, { x: 1.7, y: 2.0, z: -1.5, sx: 0.6, sy: 1.2 }))
  return merge(p)
}
function giantFirLeaves() {
  const p: THREE.BufferGeometry[] = []
  const tiers = 8
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1)
    const r = 9.5 - t * 7
    const y = 25 + i * 3.6
    p.push(part(cone(r, 6 - t * 1.6, 9), i % 2 ? 0x2c5a32 : 0x285230, { x: Math.sin(i * 2.1) * 0.7, y, z: Math.cos(i * 1.7) * 0.7, ry: i * 0.7, rz: Math.sin(i) * 0.05 }))
  }
  // Uneven boughs pushing out of the cone: a ragged, old silhouette.
  for (let i = 0; i < 6; i++) {
    const a = i * 1.9
    p.push(part(sphere(3.2, 0), 0x2f5e35, { x: Math.cos(a) * 6.2, y: 28 + (i % 3) * 4, z: Math.sin(a) * 6.2, sy: 0.55 }))
  }
  p.push(part(cone(1.4, 5, 6), 0x3a6e3e, { y: 55.5 }))
  return heightShade(merge(p), 22, 56, 0.62, 1.12)
}

/** An ancient broadleaf: a tower of a trunk, five great limbs, moss and hanging lichen. */
const OAK_LIMBS: [number, number, number][] = [
  [9.5, 22, 2.5],
  [-8.5, 21, 5],
  [3, 23.5, -10],
  [-4, 25, -7],
  [1, 27, 9],
]
function giantOakWood() {
  const p: THREE.BufferGeometry[] = []
  p.push(part(cone(6.4, 4, 10), BARK_D, { y: 1.8 }))
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    p.push(between([Math.cos(a) * 2, 3.2, Math.sin(a) * 2], [Math.cos(a) * 7.5, -0.3, Math.sin(a) * 7.5], 1.5, 0.4, BARK_D, 5))
  }
  p.push(part(cyl(2.4, 3.6, 15, 10), BARK, { y: 7.5, rz: 0.04 }))
  // Burls and a hollow at the foot.
  p.push(part(sphere(1.5, 0), BARK_D, { x: 2.8, y: 6, z: 1.2 }))
  p.push(part(sphere(1.2, 0), BARK_D, { x: -2.3, y: 10, z: -1.9 }))
  p.push(part(box(1.6, 2.6, 0.6), 0x1e150c, { x: 0.4, y: 3, z: 3.35 }))
  for (const [x, y, z] of OAK_LIMBS) {
    const mid: [number, number, number] = [x * 0.45, 14 + (y - 14) * 0.35, z * 0.45]
    p.push(between([0, 13, 0], mid, 1.7, 1.15, BARK, 6))
    p.push(between(mid, [x, y - 2, z], 1.15, 0.45, BARK, 6))
    // Lichen and moss hanging in beards from the limbs.
    for (let k = 0; k < 3; k++) {
      const t = 0.35 + k * 0.22
      const hx = mid[0] + (x - mid[0]) * t
      const hy = mid[1] + (y - 2 - mid[1]) * t
      const hz = mid[2] + (z - mid[2]) * t
      p.push(part(cone(0.42, 3.2 + k, 4), 0x7a8a5a, { x: hx, y: hy - 2.2 - k * 0.5, z: hz, rx: Math.PI }))
    }
  }
  p.push(part(sphere(2.6, 0), MOSS, { x: -2.3, y: 4.5, z: 2.0, sx: 0.5, sy: 1.5 }))
  p.push(part(sphere(2.0, 0), MOSS_D, { x: 2.5, y: 12.5, z: -1.2, sx: 0.5, sy: 0.9 }))
  return merge(p)
}
function giantOakLeaves() {
  const p: THREE.BufferGeometry[] = []
  for (const [x, y, z] of OAK_LIMBS) {
    p.push(part(sphere(6.4, 1), 0x4a7632, { x, y, z, sy: 0.62 }))
    p.push(part(sphere(4.4, 1), 0x56843a, { x: x * 0.8, y: y + 3.6, z: z * 0.8 + 1, sy: 0.7 }))
    p.push(part(sphere(3.6, 0), 0x3f6a2c, { x: x * 1.15, y: y - 2.2, z: z * 1.15, sy: 0.55 }))
  }
  p.push(part(sphere(7.5, 1), 0x4e7c35, { y: 29, sy: 0.6 }))
  p.push(part(sphere(5.2, 1), 0x5c8c3e, { x: -1.5, y: 33, z: 1, sy: 0.65 }))
  return heightShade(merge(p), 16, 35, 0.6, 1.12)
}

/** A sapling growing up in a gap where a giant fell. */
function saplingGeometry() {
  return merge([part(cyl(0.12, 0.22, 4, 4), BARK, { y: 2 }), part(cone(1.6, 3.4, 6), 0x5a8a3c, { y: 4.4 }), part(cone(1.1, 2.6, 6), 0x67983f, { y: 6 })])
}

/** A fern: a fan of long, flat fronds arching out from the crown, curled fiddleheads in the middle. */
function fernGeometry() {
  const p: THREE.BufferGeometry[] = []
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.25
    const len = 2.4 + (i % 3) * 0.4
    // Each frond: a flat, tapering blade, rising from the crown and drooping at the tip.
    for (let k = 0; k < 3; k++) {
      const t = (k + 0.5) / 3
      const r = 0.4 + t * len * 1.6
      const y = 0.25 + Math.sin(t * Math.PI * 0.9) * 1.1
      p.push(part(sphere(1, 0), k === 2 ? 0x5f9440 : i % 2 ? 0x4f7d34 : 0x588a38, { x: Math.cos(a) * r, y, z: Math.sin(a) * r, sx: len * 0.62, sy: 0.08, sz: 0.62 - t * 0.3, ry: -a, rz: 0.5 - t * 1.1, order: 'YXZ' }))
    }
  }
  for (let i = 0; i < 3; i++) p.push(part(new THREE.TorusGeometry(0.22, 0.07, 3, 6, Math.PI * 1.5), 0x6a9a42, { x: Math.cos(i * 2.1) * 0.25, y: 0.75, z: Math.sin(i * 2.1) * 0.25, ry: i * 2.1 }))
  return merge(p)
}

// ---------------------------------------------------------------------------
// The Deepwood
// ---------------------------------------------------------------------------

function deepFirWood() {
  return merge([part(cone(1.3, 1.6, 6), BARK_D, { y: 0.6 }), part(cyl(0.34, 0.75, 12, 5), BARK, { y: 6 })])
}
function deepFirLeaves() {
  const p: THREE.BufferGeometry[] = []
  for (let i = 0; i < 6; i++) {
    const t = i / 5
    p.push(part(cone(4.6 - t * 3.2, 5 - t, 7), i % 2 ? 0x24502c : 0x204828, { x: Math.sin(i * 2.3) * 0.3, y: 7 + i * 2.7, z: Math.cos(i * 1.9) * 0.3, ry: i * 0.8 }))
  }
  p.push(part(cone(0.7, 2.6, 5), 0x2c5a32, { y: 23.5 }))
  return heightShade(merge(p), 5, 24, 0.55, 1.08)
}
function deepOakWood() {
  return merge([
    part(cone(1.6, 1.6, 6), BARK_D, { y: 0.6 }),
    part(cyl(0.55, 0.95, 9, 6), BARK, { y: 4.5 }),
    part(cyl(0.2, 0.42, 5, 4), BARK, { x: 1.6, y: 9, rz: -0.75 }),
    part(cyl(0.18, 0.38, 4.5, 4), BARK, { x: -1.5, y: 9.4, z: -0.4, rz: 0.7 }),
  ])
}
function deepOakLeaves() {
  return heightShade(
    merge([
      part(sphere(4.2, 0), 0x355e2a, { y: 11, sy: 0.75 }),
      part(sphere(4.0, 0), 0x3a662e, { x: 0.5, y: 14, z: 0.3, sy: 0.85 }),
      part(sphere(3.2, 0), 0x40702f, { x: 3.2, y: 12.6, z: 1.1, sy: 0.8 }),
      part(sphere(3.0, 0), 0x325a28, { x: -3, y: 12.2, z: -1.3, sy: 0.8 }),
      part(sphere(2.6, 0), 0x447432, { x: -0.6, y: 16.8, z: -0.9, sy: 0.85 }),
    ]),
    8,
    18,
    0.58,
    1.1,
  )
}
/** A dead snag: a grey trunk, its top snapped off, a few bare broken limbs. */
function snagGeometry() {
  return merge([
    part(cone(1.2, 1.4, 6), 0x6a645a, { y: 0.5 }),
    part(cyl(0.45, 0.8, 17, 6), SNAG, { y: 8.5 }),
    part(cone(0.5, 1.6, 4), 0x9a9488, { y: 17.6, rz: 0.3 }),
    between([0, 9, 0], [2.8, 12.5, 0.5], 0.28, 0.08, SNAG, 4),
    between([0, 11.5, 0], [-2.4, 14.8, -0.9], 0.24, 0.07, SNAG, 4),
    between([0, 13.5, 0], [0.6, 15.6, 2.2], 0.2, 0.06, SNAG, 4),
    part(sphere(0.9, 0), MOSS_D, { x: 0.6, y: 2.8, z: 0.4, sx: 0.5, sy: 1.4 }),
  ])
}
/** Undergrowth at the hem of the Deepwood: holly and bramble. */
function hemGeometry() {
  return merge([
    part(sphere(2.4, 0), 0x2f5226, { y: 1.3, sy: 0.75 }),
    part(sphere(1.8, 0), 0x38602a, { x: 1.8, y: 1.1, z: 0.4, sy: 0.75 }),
    part(sphere(1.5, 0), 0x2a4a22, { x: -1.6, y: 1, z: 0.9, sy: 0.8 }),
    part(sphere(0.32, 0), 0xa02020, { x: 0.8, y: 2.6, z: 1.6 }),
    part(sphere(0.3, 0), 0xa02020, { x: -1.2, y: 2.1, z: 1.9 }),
  ])
}

/**
 * A soft disc lying flat: bright (or opaque) at the centre, fading to nothing at the rim, slightly
 * irregular. Colour and alpha per vertex (RGBA), for light on the ground and banks of mist.
 */
function softDisc(x: number, y: number, z: number, r: number, squash: number, rgb: [number, number, number], strength: number) {
  const seg = 18
  const pos: number[] = []
  const col: number[] = []
  const rot = (Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) * Math.PI
  const ring = Array.from({ length: seg }, (_, i) => {
    const a = (i / seg) * Math.PI * 2
    const w = r * (0.82 + 0.18 * Math.sin(a * 3 + rot * 5))
    const lx = Math.cos(a) * w
    const lz = Math.sin(a) * w * squash
    return [x + lx * Math.cos(rot) - lz * Math.sin(rot), z + lx * Math.sin(rot) + lz * Math.cos(rot)]
  })
  const mid = ring.map(([px, pz]) => [x + (px - x) * 0.5, z + (pz - z) * 0.5])
  const v = (px: number, pz: number, a: number) => {
    pos.push(px, y, pz)
    col.push(rgb[0], rgb[1], rgb[2], a * strength)
  }
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg
    // Centre fan (full), then the outer band fading out.
    v(x, z, 1)
    v(mid[j][0], mid[j][1], 0.7)
    v(mid[i][0], mid[i][1], 0.7)
    v(mid[i][0], mid[i][1], 0.7)
    v(mid[j][0], mid[j][1], 0.7)
    v(ring[i][0], ring[i][1], 0)
    v(ring[i][0], ring[i][1], 0)
    v(mid[j][0], mid[j][1], 0.7)
    v(ring[j][0], ring[j][1], 0)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4))
  return g
}
function mergeSoft(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts, false)
  if (!g) throw new Error('mergeGeometries failed')
  g.computeBoundingSphere()
  return g
}

// ---------------------------------------------------------------------------
// Building the woods
// ---------------------------------------------------------------------------

function inside(f: TerrainFeature, x: number, z: number, k = 1) {
  return Math.hypot(x - f.x, z - f.z) < f.r * k
}

export function buildWoods(world: World): THREE.Group {
  const group = new THREE.Group()
  group.name = 'woods'
  const woods = (world.def.features ?? []).filter((f) => f.kind === 'oldwood' || f.kind === 'deepwood')
  if (!woods.length) return group
  const rnd = mulberry32(woods.length * 7919 + Math.round(woods[0].x))
  const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), '', true)
  const lists = {
    firWood: [] as Mats,
    firLeaf: [] as Mats,
    oakWood: [] as Mats,
    oakLeaf: [] as Mats,
    sapling: [] as Mats,
    fern: [] as Mats,
    deepFirWood: [] as Mats,
    deepFirLeaf: [] as Mats,
    deepOakWood: [] as Mats,
    deepOakLeaf: [] as Mats,
    snag: [] as Mats,
    hem: [] as Mats,
  }
  const cols: Record<string, THREE.Color[]> = {}
  const tmp = new THREE.Object3D()
  const put = (key: keyof typeof lists, x: number, y: number, z: number, s: number, sy = s, color?: THREE.Color, tilt = 0.04) => {
    tmp.position.set(x, y, z)
    tmp.rotation.set((rnd() - 0.5) * tilt, rnd() * Math.PI * 2, (rnd() - 0.5) * tilt)
    tmp.scale.set(s, sy, s)
    tmp.updateMatrix()
    lists[key].push(tmp.matrix.clone())
    ;(cols[key] ??= []).push(color ?? new THREE.Color(1, 1, 1))
    return tmp.matrix.clone()
  }
  /** The leaves take the climate's look (autumn, frost, charred), a little darker in the Deepwood. */
  const leafTint = (x: number, z: number, dark: number, pine: boolean) => {
    const B = world.climateAt(x, z)
    const tint = new THREE.Color().setHSL(B.treeHue + (rnd() - 0.5) * 0.05, 0.5, B.treeLight + rnd() * 0.14)
    const tc = new THREE.Color(1, 1, 1).lerp(tint, 0.3)
    if (B.canopy && (!pine || B.deadPines)) {
      const m = B.canopy[Math.floor(rnd() * B.canopy.length)]
      tc.setRGB(m[0], m[1], m[2])
    }
    if (B.treeFrost > 0) tc.lerp(new THREE.Color(1.55, 1.6, 1.7), B.treeFrost * (0.55 + rnd() * 0.4))
    return tc.multiplyScalar(dark)
  }
  const barkTint = () => {
    const k = 0.88 + rnd() * 0.24
    return new THREE.Color(k, k * (0.97 + rnd() * 0.05), k * 0.96)
  }
  const ground = (x: number, z: number) => world.heightAt(x, z)
  const ok = (x: number, z: number) => world.heightAt(x, z) > 3.5 && world.isPassable(x, z) && world.slopeAt(x, z) < 0.9
  // The odd pieces: fallen giants, boulders, toadstools (merged, a few per wood).
  const props: THREE.BufferGeometry[] = []
  // Sunlight through the canopy, and the Deepwood's mist.
  const shafts: THREE.BufferGeometry[] = []
  const mists: { f: TerrainFeature; geo: THREE.BufferGeometry }[] = []

  for (const f of woods) {
    const pinesShare = world.climateAt(f.x, f.z).pines
    if (f.kind === 'oldwood') {
      // The giants: loosely spaced, never touching, firs or broadleaves as the climate grows them.
      const giants: [number, number, number][] = []
      for (let tries = 0; tries < 900 && giants.length < Math.round((f.r * f.r) / 720); tries++) {
        const a = rnd() * Math.PI * 2
        const r = Math.sqrt(rnd()) * f.r * 0.9
        const x = f.x + Math.cos(a) * r
        const z = f.z + Math.sin(a) * r
        if (!ok(x, z)) continue
        const s = 1.2 + rnd() * 0.45
        if (giants.some(([gx, gz, gs]) => Math.hypot(gx - x, gz - z) < (gs + s) * 8.2)) continue
        giants.push([x, z, s])
        const fir = rnd() < Math.max(0.25, Math.min(0.85, pinesShare + 0.15))
        const y = ground(x, z) - 0.6
        const sy = s * (0.92 + rnd() * 0.18)
        put(fir ? 'firWood' : 'oakWood', x, y, z, s, sy, barkTint(), 0.02)
        // The same placement for the crown (same matrix: put() reuses the rotation it just drew).
        lists[fir ? 'firLeaf' : 'oakLeaf'].push(lists[fir ? 'firWood' : 'oakWood'][lists[fir ? 'firWood' : 'oakWood'].length - 1].clone())
        ;(cols[fir ? 'firLeaf' : 'oakLeaf'] ??= []).push(leafTint(x, z, 0.95, fir))
      }
      // Saplings in the gaps, and a carpet of ferns on the open floor.
      for (let i = 0; i < f.r * 0.35; i++) {
        const a = rnd() * Math.PI * 2
        const r = Math.sqrt(rnd()) * f.r * 0.95
        const x = f.x + Math.cos(a) * r
        const z = f.z + Math.sin(a) * r
        if (!ok(x, z) || giants.some(([gx, gz, gs]) => Math.hypot(gx - x, gz - z) < gs * 7)) continue
        put('sapling', x, ground(x, z) - 0.2, z, 0.8 + rnd() * 0.7, undefined, leafTint(x, z, 1, false), 0.1)
      }
      for (let i = 0; i < f.r * 2.6; i++) {
        const a = rnd() * Math.PI * 2
        const r = Math.sqrt(rnd()) * f.r
        const x = f.x + Math.cos(a) * r
        const z = f.z + Math.sin(a) * r
        if (!ok(x, z) || giants.some(([gx, gz, gs]) => Math.hypot(gx - x, gz - z) < gs * 4.5)) continue
        const g = 0.8 + rnd() * 0.35
        const B = world.climateAt(x, z)
        const c = new THREE.Color(g, g * (1.02 + rnd() * 0.06), g * 0.9)
        if (B.canopy) c.lerp(new THREE.Color(B.canopy[0][0], B.canopy[0][1], B.canopy[0][2]), 0.35)
        if (B.treeFrost > 0) c.lerp(new THREE.Color(1.3, 1.35, 1.4), B.treeFrost * 0.5)
        put('fern', x, ground(x, z) - 0.1, z, 0.8 + rnd() * 0.8, undefined, c, 0.15)
      }
      // Fallen giants: a log the length of a house, a root plate reared up at one end, moss along
      // the top, shelf fungus on the side, a broken stump where it stood.
      for (let i = 0; i < 4; i++) {
        const a = rnd() * Math.PI * 2
        const r = Math.sqrt(rnd()) * f.r * 0.75
        const x = f.x + Math.cos(a) * r
        const z = f.z + Math.sin(a) * r
        if (!ok(x, z) || giants.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 16)) continue
        const ry = rnd() * Math.PI
        const L = 24 + rnd() * 10
        const g = ground(x, z)
        const dx = Math.cos(ry)
        const dz = -Math.sin(ry)
        props.push(part(cyl(1.7, 2.2, L, 9), BARK, { x, y: g + 1.5, z, rz: Math.PI / 2, ry }))
        props.push(part(box(L * 0.8, 0.7, 2.2), MOSS, { x, y: g + 3.3, z, ry }))
        for (let k = 0; k < 3; k++) props.push(part(cyl(1.0, 1.1, 0.25, 7), 0xc8a060, { x: x + dx * (k - 1) * 5 - dz * 2.1, y: g + 1.9 + k * 0.2, z: z + dz * (k - 1) * 5 + dx * 2.1, sz: 0.6, ry }))
        const ex = x + dx * L * 0.5
        const ez = z + dz * L * 0.5
        props.push(part(new THREE.DodecahedronGeometry(4.4, 0), 0x4a3a28, { x: ex, y: g + 3.4, z: ez, sx: 0.55, ry, rz: 0.2 }))
        for (let k = 0; k < 5; k++) props.push(part(cone(0.5, 4, 4), BARK_D, { x: ex + dx * 1.2, y: g + 3.4 + (k - 2) * 1.6, z: ez + dz * 1.2 + (k % 2 ? 1.6 : -1.6), rz: -Math.PI / 2 + (k - 2) * 0.35, ry }))
        const sx = x - dx * L * 0.62
        const sz = z - dz * L * 0.62
        props.push(part(cyl(2.2, 2.9, 4.5, 9), BARK, { x: sx, y: ground(sx, sz) + 2.2, z: sz }))
        for (let k = 0; k < 4; k++) props.push(part(cone(0.7, 2.6, 3), 0x9a7450, { x: sx + Math.cos(k * 1.6) * 1.3, y: ground(sx, sz) + 5.3, z: sz + Math.sin(k * 1.6) * 1.3 }))
      }
      // Mossy boulders and rings of toadstools.
      for (let i = 0; i < 7; i++) {
        const a = rnd() * Math.PI * 2
        const r = Math.sqrt(rnd()) * f.r * 0.85
        const x = f.x + Math.cos(a) * r
        const z = f.z + Math.sin(a) * r
        if (!ok(x, z)) continue
        const g = ground(x, z)
        const s = 1.6 + rnd() * 2
        props.push(part(new THREE.DodecahedronGeometry(s, 0), 0x7d786c, { x, y: g + s * 0.35, z, sy: 0.7, ry: rnd() * 3 }))
        props.push(part(sphere(s * 0.85, 0), MOSS, { x, y: g + s * 0.75, z, sy: 0.35 }))
        if (i % 2 === 0) {
          for (let k = 0; k < 7; k++) {
            const b = (k / 7) * Math.PI * 2
            const mx = x + Math.cos(b) * (s + 3)
            const mz = z + Math.sin(b) * (s + 3)
            const mg = ground(mx, mz)
            props.push(part(cyl(0.12, 0.16, 0.9, 4), 0xe8e0c8, { x: mx, y: mg + 0.45, z: mz }))
            props.push(part(sphere(0.45, 0), k % 3 ? 0xb8302a : 0xd8b070, { x: mx, y: mg + 1, z: mz, sy: 0.5 }))
          }
        }
      }
      // Sunlight dappling the floor where the canopy opens.
      for (let i = 0; i < Math.round(f.r / 7); i++) {
        const a = rnd() * Math.PI * 2
        const r = Math.sqrt(rnd()) * f.r * 0.85
        const x = f.x + Math.cos(a) * r
        const z = f.z + Math.sin(a) * r
        if (!ok(x, z)) continue
        shafts.push(softDisc(x, ground(x, z) + 0.6, z, 5 + rnd() * 9, 0.45 + rnd() * 0.35, [1, 0.93, 0.72], 0.5 + rnd() * 0.5))
      }
    } else {
      // The Deepwood: trees packed close, taller towards the heart, a ring of undergrowth at the hem.
      const step = 10.5
      for (let gz = -f.r; gz <= f.r; gz += step) {
        for (let gx = -f.r; gx <= f.r; gx += step) {
          const x = f.x + gx + (rnd() - 0.5) * step * 0.85
          const z = f.z + gz + (rnd() - 0.5) * step * 0.85
          const d = Math.hypot(x - f.x, z - f.z) / f.r
          if (d > 0.97 || !ok(x, z)) continue
          // Thinner at the edge so the hem reads as a fringe, not a wall.
          if (d > 0.82 && rnd() < (d - 0.82) * 4) continue
          const heart = Math.pow(1 - d, 0.6)
          const s = 0.85 + heart * 0.75 + rnd() * 0.25
          const y = ground(x, z) - 0.5
          const roll = rnd()
          if (roll < 0.035) {
            put('snag', x, y, z, s * 0.9, s * (0.9 + rnd() * 0.3), barkTint(), 0.12)
            continue
          }
          const fir = roll < 0.035 + (1 - 0.035) * Math.max(0.3, Math.min(0.9, pinesShare + 0.25))
          const sy = s * (0.9 + rnd() * 0.25)
          const wood = fir ? 'deepFirWood' : 'deepOakWood'
          const leaf = fir ? 'deepFirLeaf' : 'deepOakLeaf'
          put(wood, x, y, z, s, sy, barkTint(), 0.06)
          lists[leaf].push(lists[wood][lists[wood].length - 1].clone())
          ;(cols[leaf] ??= []).push(leafTint(x, z, 0.72 + rnd() * 0.12, fir))
        }
      }
      for (let i = 0; i < f.r * 0.9; i++) {
        const a = rnd() * Math.PI * 2
        const r = f.r * (0.84 + rnd() * 0.2)
        const x = f.x + Math.cos(a) * r
        const z = f.z + Math.sin(a) * r
        if (!ok(x, z)) continue
        put('hem', x, ground(x, z) - 0.3, z, 0.8 + rnd() * 0.8, undefined, leafTint(x, z, 0.9, false), 0.1)
      }
      // The mist: low, wide, soft banks hanging between the trunks, drifting slowly round the heart.
      const puffs: THREE.BufferGeometry[] = []
      for (let i = 0; i < Math.round(f.r / 6); i++) {
        const a = rnd() * Math.PI * 2
        const r = Math.sqrt(rnd()) * f.r * 0.62
        const x = Math.cos(a) * r
        const z = Math.sin(a) * r
        const g = ground(f.x + x, f.z + z) - ground(f.x, f.z)
        const w = 18 + rnd() * 22
        for (let k = 0; k < 2; k++) puffs.push(softDisc(x + (rnd() - 0.5) * 8, g + 3 + k * 4 + rnd() * 3, z + (rnd() - 0.5) * 8, w * (1 - k * 0.3), 0.6 + rnd() * 0.5, [0.72, 0.78, 0.76], 1))
      }
      if (puffs.length) mists.push({ f, geo: mergeSoft(puffs) })
    }
  }

  const add = (geo: THREE.BufferGeometry, key: keyof typeof lists, shadow: boolean) => {
    const list = lists[key]
    if (!list.length) return
    for (const m of chunkInstances(geo, mat, list, cols[key], shadow, 420)) {
      m.name = `woods:${key}`
      group.add(m)
    }
  }
  add(giantFirWood(), 'firWood', true)
  add(giantFirLeaves(), 'firLeaf', true)
  add(giantOakWood(), 'oakWood', true)
  add(giantOakLeaves(), 'oakLeaf', true)
  add(saplingGeometry(), 'sapling', false)
  add(fernGeometry(), 'fern', false)
  add(deepFirWood(), 'deepFirWood', false)
  add(deepFirLeaves(), 'deepFirLeaf', true)
  add(deepOakWood(), 'deepOakWood', false)
  add(deepOakLeaves(), 'deepOakLeaf', true)
  add(snagGeometry(), 'snag', true)
  add(hemGeometry(), 'hem', false)

  if (props.length) {
    const m = new THREE.Mesh(merge(props), mat)
    m.castShadow = true
    m.receiveShadow = true
    group.add(m)
  }
  if (shafts.length) {
    // Light, not matter: added over the ground beneath, soft at the edges, stirring as leaves move above.
    const dapMat = applyVision(
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }),
      `gl_FragColor.rgb *= 0.75 + 0.25 * sin(uTime * 0.6 + vVisWorld.x * 0.07 + vVisWorld.z * 0.05);`,
    )
    const m = new THREE.Mesh(mergeSoft(shafts), dapMat)
    m.renderOrder = 6
    group.add(m)
  }
  if (mists.length) {
    const mistMat = applyVision(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }), `gl_FragColor.a *= 0.8 + 0.2 * sin(uTime * 0.25 + vVisWorld.x * 0.02);`)
    for (const { f, geo } of mists) {
      const pivot = new THREE.Group()
      pivot.position.set(f.x, world.heightAt(f.x, f.z), f.z)
      const m = new THREE.Mesh(geo, mistMat)
      m.renderOrder = 7
      // Drift: the whole bank turns slowly about the heart of the wood.
      m.onBeforeRender = () => {
        pivot.rotation.y = visionUniforms.uTime.value * 0.006
      }
      pivot.add(m)
      group.add(pivot)
    }
  }
  return group
}

/** Is this point inside one of the great woods (where they grow their own trees)? */
export function inWoods(world: World, x: number, z: number, k = 0.92): boolean {
  for (const f of world.def.features ?? []) if ((f.kind === 'oldwood' || f.kind === 'deepwood') && inside(f, x, z, k)) return true
  return false
}
