import * as THREE from 'three'
import { OBSTACLE, PLAYER, type GameEngine } from '../game/engine'
import { bmerge, bpart as part, box, cone, cyl, sphere } from './geo'
import { applyVision } from './vision'

const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88 }), '', false, false, true)
const LOG = 0x6b4a2a
const LOG_D = 0x5a3d22
const LOG_L = 0x8a6a40
const IRON = 0x3a3d42
const ROPE = 0xb8a070
type P = THREE.BufferGeometry[]

/** A sharpened log: a peeled shaft, a fire-hardened point (iron-shod on some), a rope lashing. */
function stake(p: P, x: number, y: number, z: number, len: number, rx: number, rz: number, iron: boolean) {
  const dy = Math.cos(rx) * Math.cos(rz)
  const dx = -Math.sin(rz) * Math.cos(rx)
  const dz = Math.sin(rx)
  p.push(part(cyl(0.32, 0.5, len, 5), LOG_L, { x, y, z, rx, rz }))
  p.push(part(cone(0.33, 1.4, 5), iron ? IRON : 0x3a2a1a, { x: x + dx * (len / 2 + 0.7), y: y + dy * (len / 2 + 0.7), z: z + dz * (len / 2 + 0.7), rx, rz, ao: 0 }))
  p.push(part(cyl(0.53, 0.53, 0.3, 5), ROPE, { x: x - dx * len * 0.2, y: y - dy * len * 0.2, z: z - dz * len * 0.2, rx, rz, ao: 0 }))
}

/** Rings of sharpened stakes leaning outward, lashed to a ground beam, iron-shod in the front ring. */
function stakesGeometry() {
  const p: P = []
  const R = OBSTACLE.stakes.radius * 0.75
  for (let ring = 0; ring < 2; ring++) {
    const r = R - ring * 7
    const n = 28 - ring * 6
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.1
      stake(p, Math.cos(a) * r, 3, Math.sin(a) * r, 7.5, Math.sin(a) * 0.6, -Math.cos(a) * 0.6, ring === 0)
    }
    // The ground beam the stakes are lashed to.
    for (let i = 0; i < n; i += 2) {
      const a = ((i + 1) / n) * Math.PI * 2 + ring * 0.1
      p.push(part(box(((2 * Math.PI * r) / n) * 2.1, 0.6, 0.7), LOG_D, { x: Math.cos(a) * (r - 1.2), y: 0.3, z: Math.sin(a) * (r - 1.2), ry: -a + Math.PI / 2 }))
    }
  }
  return bmerge(p)
}

/** A spiked pitfall in a mire: churned mud and puddles, sharpened stakes in the pit, reeds, caltrops. */
function pitGeometry() {
  const p: P = []
  const R = OBSTACLE.pit.radius * 0.7
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9
    const r = i === 0 ? 0 : R * 0.45
    const s = i === 0 ? R * 0.7 : R * (0.32 + (i % 3) * 0.06)
    p.push(part(cyl(s, s * 1.08, 0.5, 10), i % 2 ? 0x6b5236 : 0x5f4a31, { x: Math.cos(a) * r, y: 0.2 + i * 0.02, z: Math.sin(a) * r }))
  }
  for (let i = 0; i < 7; i++) {
    const a = i * 2.39
    const r = R * (0.2 + ((i * 37) % 10) / 16)
    p.push(part(cyl(3 + (i % 3) * 1.6, 3.6 + (i % 3) * 1.6, 0.3, 9), 0x6d8186, { x: Math.cos(a) * r, y: 0.5, z: Math.sin(a) * r }))
  }
  // The pit itself at the heart: a dark hole bristling with stakes, half-hidden under a broken lattice of branches.
  p.push(part(cyl(R * 0.3, R * 0.26, 0.4, 10), 0x1e160e, { y: 0.55 }))
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7
    const r = R * 0.18 * ((i % 3) / 2)
    p.push(part(cone(0.3, 2.6, 4), LOG_L, { x: Math.cos(a) * r, y: 1.6, z: Math.sin(a) * r, rx: (i % 3 - 1) * 0.2 }))
  }
  for (let i = 0; i < 4; i++) p.push(part(cyl(0.15, 0.2, R * 0.6, 4), 0x5a4029, { y: 0.9, rz: Math.PI / 2, ry: i * 0.8 }))
  // Caltrops: four points each, always one up.
  for (let i = 0; i < 30; i++) {
    const a = i * 0.77
    const r = R * (0.35 + ((i * 53) % 17) / 26)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    p.push(part(cone(0.18, 0.9, 3), 0x8a8a84, { x, y: 0.9, z, ao: 0 }))
    p.push(part(cone(0.18, 0.9, 3), 0x7a7a74, { x, y: 0.6, z, rx: 1.9, ry: i, ao: 0 }))
  }
  // Reeds at the edges.
  for (let i = 0; i < 16; i++) {
    const a = i * 0.39 + 1
    for (let k = 0; k < 3; k++) p.push(part(cyl(0.08, 0.16, 4 + k, 3), k % 2 ? 0x7f8a44 : 0x8a9a4a, { x: Math.cos(a) * R * 0.92 + k * 0.4, y: 2.2, z: Math.sin(a) * R * 0.92, rz: (k - 1) * 0.2 }))
    if (i % 3 === 0) p.push(part(box(0.25, 0.9, 0.25), 0x5a3a20, { x: Math.cos(a) * R * 0.92, y: 4.6, z: Math.sin(a) * R * 0.92 }))
  }
  return bmerge(p)
}

/**
 * A barricade across the road: chevaux-de-frise (beams bristling with crossed stakes), an
 * overturned cart, barrels and wicker gabions filled with earth.
 */
function barricadeGeometry() {
  const p: P = []
  // Two chevaux-de-frise end to end.
  for (const cx of [-9, 4]) {
    p.push(part(cyl(0.8, 0.8, 12, 6), LOG, { x: cx, y: 2.2, rz: Math.PI / 2 }))
    for (let i = 0; i < 5; i++) {
      const x = cx - 5 + i * 2.5
      for (const a of [0.75, -0.75]) {
        p.push(part(cyl(0.25, 0.3, 7, 4), LOG_L, { x, y: 2.2, rx: a }))
        for (const s of [-1, 1]) p.push(part(cone(0.26, 1, 4), 0x3a2a1a, { x, y: 2.2 + Math.cos(a) * 3.9 * s, z: Math.sin(a) * 3.9 * -s, rx: s > 0 ? a : a + Math.PI, ao: 0 }))
      }
    }
  }
  // The overturned cart: bed on its side, wheels in the air, one cocked.
  p.push(part(box(10, 4, 1.0), 0x7a5a36, { x: 16, y: 3.5, z: 0.5, rz: 0.1 }))
  p.push(part(box(10, 1.2, 4.5), 0x6a4a2a, { x: 16, y: 1.0, z: -1.8 }))
  for (const x of [13, 19]) {
    p.push(part(new THREE.TorusGeometry(2.3, 0.28, 4, 12), 0x4a3420, { x, y: 6.4, z: 1.8, rx: Math.PI / 2 - 0.2 }))
    for (let i = 0; i < 3; i++) p.push(part(box(0.2, 4.4, 0.2), 0x5a3f22, { x, y: 6.4, z: 1.8, rx: Math.PI / 2 - 0.2, ry: (i / 3) * Math.PI, ao: 0 }))
  }
  // Barrels, upright and rolled.
  for (const [x, z, lie] of [[-17, 1.5, 0], [-15.3, -1.4, 0], [-18.6, -1.6, 1]] as [number, number, number][]) {
    p.push(part(cyl(1.15, 1.3, 2.6, 8), 0x6e4e2e, { x, y: lie ? 1.25 : 1.3, z, rz: lie ? Math.PI / 2 : 0 }))
    for (const t of [-0.8, 0.8]) p.push(part(cyl(1.3, 1.3, 0.2, 8), IRON, { x: x + (lie ? t : 0), y: lie ? 1.25 : 1.3 + t, z, rz: lie ? Math.PI / 2 : 0, ao: 0 }))
  }
  // Wicker gabions of earth along the back.
  for (let i = 0; i < 5; i++) {
    const x = -12 + i * 5.5
    p.push(part(cyl(1.5, 1.5, 3.2, 8), 0x9a7a4a, { x, y: 1.6, z: 3.4 }))
    p.push(part(cyl(1.35, 1.35, 0.4, 8), 0x5a4428, { x, y: 3.25, z: 3.4, ao: 0 }))
    for (const y of [0.8, 2.4]) p.push(part(cyl(1.55, 1.55, 0.18, 8), 0x7a5a32, { x, y, z: 3.4, ao: 0 }))
  }
  // Sharpened stakes along the front.
  for (let x = -14; x <= 10; x += 3) stake(p, x, 2.4, -4.6, 5, -0.6, 0, false)
  return bmerge(p)
}

/** Pitch barrels half-buried under straw, more straw in bundles, and a tarred fuse line snaking out. */
function pitchGeometry() {
  const p: P = []
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9
    const r = i === 0 ? 0 : 7 + (i % 3) * 2
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    p.push(part(cyl(2, 2.2, 3.2, 8), 0x2e2318, { x, y: 0.8, z }))
    p.push(part(cyl(2.05, 2.05, 0.4, 8), 0x4a4a48, { x, y: 1.6, z, ao: 0 }))
    p.push(part(cyl(2.25, 2.25, 0.3, 8), 0x4a4a48, { x, y: 0.0, z, ao: 0 }))
    p.push(part(cyl(1.6, 1.6, 0.12, 8), 0x0e0a06, { x, y: 2.42, z, ao: 0 }))
  }
  p.push(part(cyl(13, 14, 0.3, 14), 0xb39a5c, { y: 0.1 }))
  // Straw bundles bound with twine.
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + 0.4
    const x = Math.cos(a) * 11
    const z = Math.sin(a) * 11
    p.push(part(cyl(1.0, 1.0, 3.6, 6), 0xd8bc70, { x, y: 1.0, z, rz: Math.PI / 2, ry: a }))
    p.push(part(cyl(1.05, 1.05, 0.2, 6), 0x8a6a3a, { x, y: 1.0, z, rz: Math.PI / 2, ry: a, ao: 0 }))
  }
  // The fuse line, out to a little stake.
  let fx = 0
  let fz = 0
  for (let k = 0; k < 8; k++) {
    const nx = 2 + k * 2.4
    const nz = Math.sin(k * 0.9) * 1.6 + 3
    p.push(part(box(Math.hypot(nx - fx, nz - fz), 0.18, 0.18), 0x1a140c, { x: (fx + nx) / 2, y: 0.35, z: (fz + nz) / 2, ry: -Math.atan2(nz - fz, nx - fx), ao: 0 }))
    fx = nx
    fz = nz
  }
  p.push(part(cyl(0.15, 0.2, 2.2, 4), LOG_L, { x: fx, y: 1.1, z: fz }))
  return bmerge(p)
}

/**
 * A field trebuchet: a braced A-frame trestle on a sill, the long throwing arm on its axle, a
 * counterweight box of stones hung from the short end, the sling lying in its trough, a winch with
 * a spoked wheel to draw it down, and a pile of shot.
 */
function trebuchetGeometry() {
  const p: P = []
  // Sills and the trough.
  for (const s of [-1, 1]) p.push(part(box(20, 1.4, 1.6), LOG_D, { y: 0.7, z: s * 5 }))
  for (const x of [-8, 0, 8]) p.push(part(box(1.4, 1.2, 11.6), LOG_D, { x, y: 0.9 }))
  p.push(part(box(16, 0.6, 2.6), LOG, { x: 6, y: 1.6 }))
  // The A-frames with their braces.
  for (const s of [-1, 1]) {
    p.push(part(box(1.5, 20, 1.5), LOG_D, { x: -3, y: 10, z: s * 4, rz: 0.2 }))
    p.push(part(box(1.5, 20, 1.5), LOG_D, { x: 3, y: 10, z: s * 4, rz: -0.2 }))
    p.push(part(box(8, 0.8, 0.8), LOG, { y: 8, z: s * 4 }))
    p.push(part(box(0.7, 12, 0.7), LOG, { x: 0, y: 7, z: s * 4, rz: 0.75 }))
  }
  p.push(part(cyl(0.7, 0.7, 10.6, 6), IRON, { y: 19.4, rx: Math.PI / 2 }))
  // The arm (cocked), the counterweight box hanging from its short end.
  p.push(part(box(30, 1.2, 1.2), LOG, { x: 4, y: 22, rz: -0.55 }))
  for (const t of [-10, -2, 6, 13]) p.push(part(box(1.4, 1.4, 1.4), IRON, { x: 4 + Math.cos(-0.55) * t, y: 22 + Math.sin(-0.55) * t, rz: -0.55, ao: 0 }))
  const hx = 4 + Math.cos(-0.55) * -13
  const hy = 22 + Math.sin(-0.55) * -13
  for (const s of [-1, 1]) p.push(part(box(0.3, 3, 0.3), IRON, { x: hx, y: hy - 1.5, z: s * 1.6, ao: 0 }))
  p.push(part(box(5, 5, 5), 0x6a4a2a, { x: hx, y: hy - 5.4 }))
  for (const y of [-1.8, 1.8]) p.push(part(box(5.2, 0.4, 5.2), IRON, { x: hx, y: hy - 5.4 + y, ao: 0 }))
  for (let i = 0; i < 4; i++) p.push(part(new THREE.DodecahedronGeometry(1.1, 0), 0x8a8378, { x: hx + (i % 2) * 1.6 - 0.8, y: hy - 2.6, z: Math.floor(i / 2) * 1.6 - 0.8 }))
  // The sling: ropes from the long end down to a leather pouch in the trough.
  const tx = 4 + Math.cos(-0.55) * 15
  const ty = 22 + Math.sin(-0.55) * 15
  p.push(part(box(0.15, ty - 2, 0.15), ROPE, { x: tx, y: (ty + 2) / 2, ao: 0 }))
  p.push(part(sphere(1.0, 0), 0x5a3d26, { x: tx, y: 2.2, sy: 0.5 }))
  // The winch: a drum between two posts, a spoked wheel at each end.
  for (const s of [-1, 1]) p.push(part(box(0.9, 4, 0.9), LOG_D, { x: -8, y: 2.6, z: s * 3.8 }))
  p.push(part(cyl(0.8, 0.8, 7, 7), LOG, { x: -8, y: 4, rx: Math.PI / 2 }))
  for (const s of [-1, 1]) {
    p.push(part(new THREE.TorusGeometry(2.2, 0.2, 3, 12), LOG_D, { x: -8, y: 4, z: s * 4.4 }))
    for (let i = 0; i < 3; i++) p.push(part(box(0.18, 4.4, 0.18), LOG, { x: -8, y: 4, z: s * 4.4, rz: (i / 3) * Math.PI, ao: 0 }))
  }
  p.push(part(box(0.14, 0.14, 12), ROPE, { x: -2, y: 5.5, rz: 0.2, ry: Math.PI / 2, ao: 0 }))
  // A pile of shot.
  for (let i = 0; i < 9; i++) p.push(part(new THREE.DodecahedronGeometry(1.4, 0), i % 2 ? 0x8a8378 : 0x9a948a, { x: 9 + (i % 3) * 2.4, y: 1.4 + Math.floor(i / 6) * 1.8, z: 8 + Math.floor((i % 6) / 3) * 2.2 }))
  return bmerge(p)
}

/** Field works: stakes, traps and barricades. Hidden enemy traps stay invisible until found or sprung. */
export class ObstacleRenderer {
  readonly group = new THREE.Group()
  private geos = { stakes: stakesGeometry(), pit: pitGeometry(), barricade: barricadeGeometry(), pitch: pitchGeometry(), trebuchet: trebuchetGeometry() }
  private meshes = new Map<string, THREE.Mesh>()
  private engine: GameEngine
  constructor(engine: GameEngine) {
    this.engine = engine
  }
  update() {
    const world = this.engine.world
    const engine = this.engine
    const team = engine.team(PLAYER)
    const seen = new Set<string>()
    for (const o of engine.state.obstacles ?? []) {
      seen.add(o.id)
      let m = this.meshes.get(o.id)
      if (!m) {
        m = new THREE.Mesh(this.geos[o.kind], mat)
        m.castShadow = o.kind !== 'pit'
        if (o.kind === 'trebuchet') m.scale.setScalar(1)
        m.receiveShadow = true
        m.position.set(o.x, world.heightAt(o.x, o.z), o.z)
        m.rotation.y = (o.x * 7 + o.z * 3) % 6.28
        this.group.add(m)
        this.meshes.set(o.id, m)
      }
      m.visible = engine.obstacleSeenBy(o, team)
      // Fades into the ground over its last 30 seconds.
      if (o.kind === 'trebuchet') continue
      const left = o.until - engine.state.time
      const hp = o.kind === 'barricade' ? Math.max(0.35, (o.hp ?? OBSTACLE.barricade.hp) / OBSTACLE.barricade.hp) : 1
      m.scale.set(1, Math.max(0.15, Math.min(1, left / 30)) * hp, 1)
    }
    for (const [id, m] of this.meshes) {
      if (seen.has(id)) continue
      this.group.remove(m)
      this.meshes.delete(id)
    }
  }
}
