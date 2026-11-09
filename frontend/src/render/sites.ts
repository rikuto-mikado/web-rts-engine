import * as THREE from 'three'
import type { GameEngine } from '../game/engine'
import { box, cone, cyl, merge, part } from './geo'
import { applyVision } from './vision'

const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }))

/** A mine: a timbered adit in a rock face, spoil heaps, an ore cart on rails. */
function mineGeometry() {
  const parts: THREE.BufferGeometry[] = []
  parts.push(part(cone(16, 14, 7), 0x8b8478, { x: -6, y: 6, z: -4 }))
  parts.push(part(cone(10, 9, 6), 0x7a7368, { x: 6, y: 4, z: -8 }))
  parts.push(part(box(7, 7, 2), 0x1d1a17, { x: -3, y: 3.5, z: 4 }))
  for (const sx of [-6.8, 0.8]) parts.push(part(box(1, 8, 1), 0x6b4a2a, { x: sx, y: 4, z: 5 }))
  parts.push(part(box(9.4, 1, 1.2), 0x6b4a2a, { x: -3, y: 8, z: 5 }))
  for (let i = 0; i < 6; i++) parts.push(part(box(0.5, 0.3, 14), 0x4a3520, { x: -4.6 + (i % 2) * 3.2, y: 0.2, z: 12 }))
  parts.push(part(box(3.6, 2.2, 4.4), 0x5e4126, { x: -3, y: 1.6, z: 15 }))
  parts.push(part(cone(2, 1.4, 6), 0x5b5f66, { x: -3, y: 3.2, z: 15 }))
  parts.push(part(cone(5, 3, 6), 0x6f6a62, { x: 10, y: 1.5, z: 8 }))
  parts.push(part(cone(3.5, 2.4, 6), 0x9a7b3c, { x: 14, y: 1.2, z: 2 }))
  return merge(parts)
}

/** A lumber camp: stumps, stacked logs, a sawpit and a woodcutter's hut. */
function lumberGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9
    parts.push(part(cyl(1.3, 1.5, 1.2, 7), 0x7a5532, { x: Math.cos(a) * (10 + i), y: 0.6, z: Math.sin(a) * (10 + i) }))
  }
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 4 - row; k++) parts.push(part(cyl(1.1, 1.1, 12, 7), 0x8a6238, { x: 4 + k * 2.2 + row * 1.1, y: 1.1 + row * 1.9, z: -4, rx: Math.PI / 2 }))
  }
  parts.push(part(box(8, 4, 6), 0x6b4a2a, { x: -8, y: 2, z: -6 }))
  parts.push(part(cyl(0.01, 4.6, 8.6, 3), 0x4a6a32, { x: -8, y: 5.6, z: -6, rz: Math.PI / 2, sx: 0.85 }))
  parts.push(part(box(6, 1.2, 1.6), 0x5a3d22, { x: 2, y: 2.5, z: 7 }))
  for (const sx of [-0.6, 4.6]) parts.push(part(box(0.6, 2.4, 1.6), 0x5a3d22, { x: sx, y: 1.2, z: 7 }))
  parts.push(part(cone(3, 3.6, 5), 0x2f5d34, { x: -14, y: 1.8, z: 8 }))
  return merge(parts)
}

/** Mines and lumber camps, with a little flag in the colours of whoever works them. */
export class SiteRenderer {
  readonly group = new THREE.Group()
  private views = new Map<string, { group: THREE.Group; flag: THREE.Mesh }>()
  private geos = { mine: mineGeometry(), lumber: lumberGeometry() }
  private engine: GameEngine
  constructor(engine: GameEngine) {
    this.engine = engine
  }
  update(time: number) {
    const world = this.engine.world
    for (const s of this.engine.state.sites ?? []) {
      let v = this.views.get(s.id)
      if (!v) {
        const group = new THREE.Group()
        const m = new THREE.Mesh(this.geos[s.kind], mat)
        m.castShadow = true
        m.receiveShadow = true
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), applyVision(new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide })))
        flag.position.set(8, 11, 4)
        const pole = new THREE.Mesh(merge([part(cyl(0.2, 0.2, 9, 4), 0x3b2f25, { x: 6, y: 4.5, z: 4 })]), mat)
        group.add(m, flag, pole)
        group.position.set(s.x, world.heightAt(s.x, s.z) - 0.3, s.z)
        group.rotation.y = (s.x * 3 + s.z * 7) % 6.28
        this.group.add(group)
        v = { group, flag }
        this.views.set(s.id, v)
      }
      const w = this.engine.army(s.workerId)
      v.flag.visible = !!w
      if (w) (v.flag.material as THREE.MeshStandardMaterial).color.set(this.engine.factionColor(w.faction))
      v.flag.rotation.y = Math.sin(time * 2 + s.x) * 0.3
    }
  }
}
