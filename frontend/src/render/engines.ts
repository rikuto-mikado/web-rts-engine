import * as THREE from 'three'
import { PLAYER, type GameEngine } from '../game/engine'
import { box, cone, cyl, merge, part } from './geo'
import { applyVision } from './vision'

const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }))
const LOG = 0x6b4a2a
const LOG_D = 0x5a3d22
const HIDE = 0x8a6a48

function wheels(parts: THREE.BufferGeometry[], len: number, width: number, r: number) {
  for (const x of [-len / 2 + r, len / 2 - r]) for (const s of [-1, 1]) parts.push(part(cyl(r, r, 1, 10), 0x3b2a18, { x, y: r, z: s * (width / 2 + 0.5), rx: Math.PI / 2 }))
}

/** A siege tower: three storeys of timber under wet hides, a drawbridge at the top. Local +x faces forward. */
function towerGeometry() {
  const parts: THREE.BufferGeometry[] = []
  parts.push(part(box(14, 2, 12), LOG_D, { y: 3 }))
  wheels(parts, 14, 12, 2.4)
  for (let f = 0; f < 3; f++) {
    const y = 4 + f * 10
    parts.push(part(box(12 - f, 10, 11 - f), f % 2 ? HIDE : 0x7a5a3c, { y: y + 5 }))
    parts.push(part(box(12.6 - f, 0.8, 11.6 - f), LOG_D, { y: y + 10 }))
  }
  parts.push(part(box(2, 9, 9), LOG, { x: 8, y: 30, rz: -0.35 }))
  for (const s of [-1, 1]) parts.push(part(box(0.8, 0.8, 0.8), 0x3a3a3a, { x: 7, y: 34, z: s * 4 }))
  return merge(parts)
}

/** A tortoise ram: a long roofed shed on wheels with the iron-capped beam poking out. */
function ramGeometry() {
  const parts: THREE.BufferGeometry[] = []
  parts.push(part(box(16, 1.2, 8), LOG_D, { y: 2.6 }))
  wheels(parts, 16, 8, 1.8)
  parts.push(part(cyl(0.01, 6, 16, 3), HIDE, { y: 6.6, rz: Math.PI / 2, sx: 0.9 }))
  parts.push(part(cyl(0.9, 1, 20, 8), LOG, { x: 3, y: 4.6, rz: Math.PI / 2 }))
  parts.push(part(cone(1.4, 2.4, 8), 0x4a4a4a, { x: 14, y: 4.6, rz: -Math.PI / 2 }))
  return merge(parts)
}

/** Mantlets: a line of wheeled timber shields. */
function mantletGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (let i = -2; i <= 2; i++) {
    parts.push(part(box(1.2, 7, 8), i % 2 ? LOG : 0x7a5a36, { x: 0, y: 4, z: i * 9, rz: -0.12 }))
    parts.push(part(cyl(1, 1, 0.6, 8), 0x3b2a18, { x: -1, y: 1, z: i * 9 - 3, rx: Math.PI / 2 }))
    parts.push(part(cyl(1, 1, 0.6, 8), 0x3b2a18, { x: -1, y: 1, z: i * 9 + 3, rx: Math.PI / 2 }))
  }
  return merge(parts)
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
