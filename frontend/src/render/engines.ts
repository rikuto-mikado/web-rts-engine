import * as THREE from 'three'
import { PLAYER, type GameEngine } from '../game/engine'
import { bmerge, bpart as part, box, cone, cyl } from './geo'
import { applyVision } from './vision'

const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }), '', false, false, true)
const LOG = 0x6b4a2a
const LOG_D = 0x5a3d22
const LOG_L = 0x84603a
const HIDE = 0x8a6a48
const HIDE_D = 0x6e5236
const IRON = 0x3a3d42
type P = THREE.BufferGeometry[]

/** A heavy spoked wheel facing ±z, with an iron tyre and a hub. */
function wheel(p: P, x: number, z: number, r: number) {
  p.push(part(new THREE.TorusGeometry(r, 0.32, 4, 14), 0x4a3420, { x, y: r, z }))
  p.push(part(new THREE.TorusGeometry(r + 0.1, 0.14, 3, 14), IRON, { x, y: r, z, ao: 0 }))
  for (let i = 0; i < 4; i++) p.push(part(box(0.22, r * 2 - 0.3, 0.24), 0x5a3f22, { x, y: r, z, rz: (i / 4) * Math.PI, ao: 0 }))
  p.push(part(cyl(0.55, 0.55, 1.1, 7), 0x2e2116, { x, y: r, z, rx: Math.PI / 2, ao: 0 }))
}
function wheels(p: P, len: number, width: number, r: number) {
  for (const x of [-len / 2 + r, len / 2 - r]) for (const s of [-1, 1]) wheel(p, x, s * (width / 2 + 0.6), r)
}

/**
 * A siege tower: a timber frame of corner posts and cross braces, three storeys hung with wet
 * rawhide and iron plates, ladders seen through the open back, a crenellated fighting top, and the
 * assault bridge at the top raised on its chains. Local +x faces forward.
 */
function towerGeometry() {
  const p: P = []
  p.push(part(box(14, 2, 12), LOG_D, { y: 3 }))
  wheels(p, 14, 12, 2.6)
  for (let f = 0; f < 3; f++) {
    const y = 4 + f * 10
    const w = 12 - f
    const d = 11 - f
    // Corner posts and the floor beams.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(part(box(1, 10.4, 1), LOG_D, { x: (sx * w) / 2, y: y + 5, z: (sz * d) / 2 }))
    p.push(part(box(w + 0.6, 0.8, d + 0.6), LOG_D, { y: y + 10 }))
    // Hides on the front and sides, overlapping like shingles, iron plates on the front.
    p.push(part(box(0.5, 9.6, d), f % 2 ? HIDE : HIDE_D, { x: w / 2, y: y + 5 }))
    for (const s of [-1, 1]) p.push(part(box(w, 9.6, 0.5), f % 2 ? HIDE_D : HIDE, { y: y + 5, z: (s * d) / 2 }))
    for (let k = 0; k < 3; k++) p.push(part(box(0.6, 0.5, d + 0.4), 0x5a4430, { x: w / 2 + 0.1, y: y + 2 + k * 3, ao: 0 }))
    for (let k = 0; k < 2; k++) p.push(part(box(0.3, 3, 3), IRON, { x: w / 2 + 0.35, y: y + 5, z: (k - 0.5) * 4.5, ao: 0 }))
    for (const s of [-1, 1]) {
      p.push(part(box(0.3, 0.3, Math.hypot(w, 9) - 1), LOG_L, { x: 0, y: y + 5, z: (s * d) / 2 + s * 0.4, rx: 0, ry: Math.PI / 2, rz: s * 0.85 }))
    }
    // A ladder up the open back.
    p.push(part(box(0.3, 10, 0.3), LOG_L, { x: -w / 2 + 0.6, y: y + 5, z: -1.2 }))
    p.push(part(box(0.3, 10, 0.3), LOG_L, { x: -w / 2 + 0.6, y: y + 5, z: 1.2 }))
    for (let k = 0; k < 5; k++) p.push(part(box(0.2, 0.2, 2.4), LOG_L, { x: -w / 2 + 0.6, y: y + 1 + k * 2, ao: 0 }))
  }
  // The fighting top: a parapet with merlons all round.
  const top = 34
  p.push(part(box(10.6, 1.6, 9.6), LOG, { y: top + 0.8 }))
  for (let i = 0; i < 5; i++)
    for (const s of [-1, 1]) {
      p.push(part(box(1.2, 1.8, 0.6), LOG, { x: -4.2 + i * 2.1, y: top + 2.5, z: s * 4.5 }))
      p.push(part(box(0.6, 1.8, 1.2), LOG, { x: s * 5, y: top + 2.5, z: -3.6 + i * 1.8 }))
    }
  // The assault bridge, raised on two chains.
  p.push(part(box(1.0, 10, 8.5), LOG, { x: 6.6, y: 30.5, rz: -0.3 }))
  for (let k = 0; k < 4; k++) p.push(part(box(1.15, 0.4, 8.6), LOG_D, { x: 6.6 - 0.3 * (k - 1.5) * 0.3, y: 27 + k * 2.4, rz: -0.3, ao: 0 }))
  for (const s of [-1, 1]) {
    p.push(part(cyl(0.12, 0.12, 6.5, 4), IRON, { x: 6.2, y: 34, z: s * 3.8, rz: 1.1, ao: 0 }))
    p.push(part(box(0.8, 0.8, 0.8), IRON, { x: 4.8, y: 35, z: s * 3.8, ao: 0 }))
  }
  return bmerge(p)
}

/**
 * A tortoise ram: a long frame on six spoked wheels, a pitched roof of planks under rawhide with
 * iron plates along the eaves, and inside the beam hung on chains, bound with iron bands, its
 * iron ram's head out front.
 */
function ramGeometry() {
  const p: P = []
  p.push(part(box(16, 1.2, 8), LOG_D, { y: 2.6 }))
  for (const x of [-6, 0, 6]) for (const s of [-1, 1]) wheel(p, x, s * 4.6, 1.8)
  for (const x of [-7, -2.3, 2.3, 7]) for (const s of [-1, 1]) p.push(part(box(0.6, 5, 0.6), LOG, { x, y: 5.4, z: s * 3.6 }))
  p.push(part(cyl(0.01, 6, 16, 3), HIDE, { y: 6.9, rz: Math.PI / 2, sx: 0.9 }))
  p.push(part(box(16.4, 0.5, 0.5), LOG_D, { y: 10.3 }))
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) p.push(part(box(2.6, 0.2, 2.2), IRON, { x: -6 + i * 3, y: 6.6, z: s * 3.4, rx: s * -0.9, ao: 0 }))
  // The beam on its chains.
  p.push(part(cyl(0.9, 1, 20, 8), LOG, { x: 3, y: 4.8, rz: Math.PI / 2 }))
  for (const x of [-4, 0, 4, 8]) p.push(part(cyl(1.05, 1.05, 0.4, 8), IRON, { x, y: 4.8, rz: Math.PI / 2, ao: 0 }))
  for (const x of [-2, 5]) p.push(part(cyl(0.12, 0.12, 4.8, 4), IRON, { x, y: 7.6, ao: 0 }))
  p.push(part(cyl(1.6, 1.0, 1.4, 8), IRON, { x: 13.4, y: 4.8, rz: Math.PI / 2, ao: 0 }))
  p.push(part(cone(1.5, 2.6, 8), 0x4a4a4a, { x: 15.4, y: 4.8, rz: -Math.PI / 2, ao: 0 }))
  for (const s of [-1, 1]) p.push(part(cone(0.4, 1.4, 4), 0x4a4a4a, { x: 14.6, y: 4.8 + s * 1.2, rz: -Math.PI / 2 - s * 0.5, ao: 0 }))
  return bmerge(p)
}

/** Mantlets: a line of wheeled pavises, planked and bound with iron, propped on a strut, with loopholes. */
function mantletGeometry() {
  const p: P = []
  for (let i = -2; i <= 2; i++) {
    const z = i * 9
    for (let k = 0; k < 4; k++) p.push(part(box(1.0, 7.2, 1.9), k % 2 ? LOG : LOG_L, { x: 0, y: 4.2, z: z - 2.85 + k * 1.9, rz: -0.12 }))
    for (const y of [1.8, 6.2]) p.push(part(box(1.15, 0.45, 8), IRON, { x: 0.1, y, z, rz: -0.12, ao: 0 }))
    p.push(part(box(1.2, 0.5, 1.2), 0x141210, { x: 0.25, y: 5.2, z, ao: 0 }))
    p.push(part(box(0.4, 7, 0.4), LOG_D, { x: -2.2, y: 3.6, z, rz: 0.6 }))
    for (const s of [-1, 1]) p.push(part(new THREE.TorusGeometry(0.9, 0.2, 4, 10), 0x3b2a18, { x: -1, y: 1, z: z + s * 3, ao: 0 }))
  }
  return bmerge(p)
}

type Kind = 'tower' | 'ram' | 'mantlet'
/** Siege engines pushed along at the head of the armies that built them. */
export class EngineRenderer {
  readonly group = new THREE.Group()
  private geos: Record<Kind, THREE.BufferGeometry> = { tower: towerGeometry(), ram: ramGeometry(), mantlet: mantletGeometry() }
  private meshes = new Map<string, THREE.Mesh>()
  private engine: GameEngine
  constructor(engine: GameEngine) {
    this.engine = engine
  }
  update() {
    const engine = this.engine
    const world = engine.world
    const team = engine.team(PLAYER)
    const seen = new Set<string>()
    for (const a of engine.state.armies) {
      if (!a.engines) continue
      const visible = engine.canSee(team, a) && !engine.insideWalls(a)
      const ahead: Record<Kind, number> = { mantlet: 26, ram: 20, tower: 14 }
      const side: Record<Kind, number> = { mantlet: 0, ram: -16, tower: 16 }
      for (const k of ['tower', 'ram', 'mantlet'] as const) {
        if (!a.engines[k]) continue
        const id = `${a.id}:${k}`
        seen.add(id)
        let m = this.meshes.get(id)
        if (!m) {
          m = new THREE.Mesh(this.geos[k], mat)
          m.castShadow = true
          this.group.add(m)
          this.meshes.set(id, m)
        }
        const ca = Math.cos(a.heading)
        const sa = Math.sin(a.heading)
        const x = a.x + ca * ahead[k] - sa * side[k]
        const z = a.z + sa * ahead[k] + ca * side[k]
        m.position.set(x, world.surfaceAt(x, z), z)
        m.rotation.y = -a.heading
        m.visible = visible
      }
    }
    for (const [id, m] of this.meshes) {
      if (seen.has(id)) continue
      this.group.remove(m)
      this.meshes.delete(id)
    }
  }
}
