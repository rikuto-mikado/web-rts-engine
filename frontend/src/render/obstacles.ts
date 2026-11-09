import * as THREE from 'three'
import { OBSTACLE, type GameEngine } from '../game/engine'
import { box, cone, cyl, merge, part } from './geo'
import { applyVision } from './vision'

const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }))

/** Felled trees laid in a ring, branches pointing outward. */
function abatisGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const R = OBSTACLE.abatis.radius * 0.8
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const x = Math.cos(a) * R
    const z = Math.sin(a) * R
    parts.push(part(cyl(0.9, 1.3, 16, 5), 0x5a3d22, { x, y: 1.2, z, rz: Math.PI / 2, ry: -a + Math.PI / 2 }))
    for (let k = -1; k <= 1; k += 2) {
      parts.push(part(cone(0.5, 7, 4), 0x4a321c, { x: x + Math.cos(a) * 3, y: 3, z: z + Math.sin(a) * 3, rz: -0.9 * k, ry: -a }))
    }
    parts.push(part(cone(2.6, 4, 5), 0x3c5a2a, { x: x + Math.cos(a) * 4, y: 2.4, z: z + Math.sin(a) * 4 }))
  }
  return merge(parts)
}

/** Rows of sharpened stakes leaning outward. */
function stakesGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const R = OBSTACLE.stakes.radius * 0.75
  for (let ring = 0; ring < 2; ring++) {
    const r = R - ring * 7
    const n = 28 - ring * 6
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.1
      parts.push(part(cyl(0.25, 0.55, 8, 4), i % 2 ? 0x8a6a40 : 0x75572f, { x: Math.cos(a) * r, y: 3, z: Math.sin(a) * r, rx: Math.sin(a) * 0.6, rz: -Math.cos(a) * 0.6 }))
    }
  }
  parts.push(part(box(2, 0.1, 2), 0x5a3d22, { y: 0.05 }))
  return merge(parts)
}

/** Abatis and spike stakes, plus burned bridges (hidden, with fire when they go). */
export class ObstacleRenderer {
  readonly group = new THREE.Group()
  private geos = { abatis: abatisGeometry(), stakes: stakesGeometry() }
  private meshes = new Map<string, THREE.Mesh>()
  private engine: GameEngine
  constructor(engine: GameEngine) {
    this.engine = engine
  }
  update() {
    const world = this.engine.world
    const seen = new Set<string>()
    for (const o of this.engine.state.obstacles ?? []) {
      seen.add(o.id)
      let m = this.meshes.get(o.id)
      if (!m) {
        m = new THREE.Mesh(this.geos[o.kind], mat)
        m.castShadow = true
        m.position.set(o.x, world.heightAt(o.x, o.z), o.z)
        m.rotation.y = (o.x * 7 + o.z * 3) % 6.28
        this.group.add(m)
        this.meshes.set(o.id, m)
      }
      // Fades into the ground over its last 30 seconds.
      const left = o.until - this.engine.state.time
      m.scale.set(1, Math.max(0.15, Math.min(1, left / 30)), 1)
    }
    for (const [id, m] of this.meshes) {
      if (seen.has(id)) continue
      this.group.remove(m)
      this.meshes.delete(id)
    }
  }
}
