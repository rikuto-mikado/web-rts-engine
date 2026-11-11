import * as THREE from 'three'
import { OBSTACLE, PLAYER, type GameEngine } from '../game/engine'
import { box, cone, cyl, merge, part } from './geo'
import { applyVision } from './vision'

const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }))

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

/** Churned mud with puddles, reeds and a scatter of caltrops. */
function pitGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const R = OBSTACLE.pit.radius * 0.7
  // Several overlapping low blobs, so the edge is ragged rather than a disc.
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9
    const r = i === 0 ? 0 : R * 0.45
    const s = i === 0 ? R * 0.7 : R * (0.32 + (i % 3) * 0.06)
    parts.push(part(cyl(s, s * 1.08, 0.5, 9), i % 2 ? 0x6b5236 : 0x5f4a31, { x: Math.cos(a) * r, y: 0.2 + i * 0.02, z: Math.sin(a) * r }))
  }
  for (let i = 0; i < 7; i++) {
    const a = i * 2.39
    const r = R * (0.2 + ((i * 37) % 10) / 16)
    parts.push(part(cyl(3 + (i % 3) * 1.6, 3.6 + (i % 3) * 1.6, 0.3, 8), 0x7d8f93, { x: Math.cos(a) * r, y: 0.5, z: Math.sin(a) * r }))
  }
  for (let i = 0; i < 36; i++) {
    const a = i * 0.77
    const r = R * (0.15 + ((i * 53) % 17) / 22)
    parts.push(part(cone(0.35, 1.6, 3), 0x8a8a84, { x: Math.cos(a) * r, y: 1, z: Math.sin(a) * r, rx: (i % 5) * 0.4, rz: (i % 3) * 0.5 }))
  }
  for (let i = 0; i < 12; i++) {
    const a = i * 0.52 + 1
    parts.push(part(cyl(0.12, 0.2, 5, 3), 0x7f8a44, { x: Math.cos(a) * R * 0.9, y: 2.5, z: Math.sin(a) * R * 0.9, rz: 0.15 }))
  }
  return merge(parts)
}

/** Logs and an upturned cart across the road. */
function barricadeGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 4; i++) parts.push(part(cyl(1.4, 1.5, 34, 6), i % 2 ? 0x6b4a2a : 0x5a3d22, { y: 1.4 + (i > 1 ? 2.4 : 0), z: (i % 2) * 2.6 - 1.3, rz: Math.PI / 2, ry: (i - 1.5) * 0.06 }))
  // Upturned cart on one end.
  parts.push(part(box(10, 4, 7), 0x7a5a36, { x: 12, y: 5.5, z: 0, rz: 0.35 }))
  for (const zz of [-4, 4]) parts.push(part(cyl(3, 3, 0.8, 10), 0x4a3420, { x: 15, y: 8, z: zz, rx: Math.PI / 2 }))
  // Sharpened stakes along the front.
  for (let x = -14; x <= 8; x += 3.5) parts.push(part(cyl(0.2, 0.5, 6, 4), 0x8a6a40, { x, y: 2.6, z: -4.2, rx: -0.6 }))
  return merge(parts)
}

/** Half-buried pitch barrels under a scatter of straw. */
function pitchGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9
    const r = i === 0 ? 0 : 7 + (i % 3) * 2
    parts.push(part(cyl(2, 2.2, 3.2, 8), 0x2e2318, { x: Math.cos(a) * r, y: 0.8, z: Math.sin(a) * r }))
    parts.push(part(cyl(2.05, 2.05, 0.4, 8), 0x4a4a48, { x: Math.cos(a) * r, y: 1.6, z: Math.sin(a) * r }))
  }
  parts.push(part(cyl(13, 14, 0.3, 12), 0xb39a5c, { y: 0.1 }))
  return merge(parts)
}

/** A field trebuchet: a tall timber frame, the long arm cocked, a box of counterweight. */
function trebuchetGeometry() {
  const parts: THREE.BufferGeometry[] = []
  parts.push(part(box(18, 1.6, 12), 0x6b4a2a, { y: 0.8 }))
  for (const s of [-1, 1]) {
    parts.push(part(box(1.6, 20, 1.6), 0x5a3d22, { x: -3, y: 10, z: s * 4, rz: 0.18 }))
    parts.push(part(box(1.6, 20, 1.6), 0x5a3d22, { x: 3, y: 10, z: s * 4, rz: -0.18 }))
  }
  parts.push(part(box(1.4, 1.4, 10), 0x4a321c, { y: 19 }))
  parts.push(part(box(30, 1.2, 1.2), 0x6b4a2a, { x: 4, y: 22, rz: -0.55 }))
  parts.push(part(box(5, 6, 5), 0x6a645a, { x: -8, y: 13, rz: -0.55 }))
  for (let i = 0; i < 6; i++) parts.push(part(new THREE.DodecahedronGeometry(1.5, 0), 0x8a8378, { x: 8 + (i % 3) * 2.6, y: 1.6 + Math.floor(i / 3) * 1.8, z: 7 }))
  return merge(parts)
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
