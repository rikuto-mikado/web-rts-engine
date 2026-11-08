import * as THREE from 'three'
import type { GameEngine } from '../game/engine'
import type { Outpost } from '../game/types'
import { box, cone, cyl, merge, part } from './geo'
import { applyVision } from './vision'

const woodMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }))

function palisadeGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const R = 30
  const n = 30
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    if (Math.abs(Math.sin(a)) < 0.12 && Math.cos(a) > 0) continue // gate gap
    const h = 7 + ((i * 37) % 5) * 0.4
    parts.push(part(cyl(0.9, 1.1, h, 5), i % 2 ? 0x6b4a2a : 0x5a3d22, { x: Math.cos(a) * R, y: h / 2, z: Math.sin(a) * R }))
    parts.push(part(cone(0.9, 1.6, 5), 0x4a321c, { x: Math.cos(a) * R, y: h + 0.8, z: Math.sin(a) * R }))
  }
  // Earthen ring under the stakes.
  parts.push(part(new THREE.TorusGeometry(R, 2.4, 4, 24), 0x6e5a3e, { y: 0.3, rx: Math.PI / 2, sz: 0.35 }))
  return merge(parts)
}

function campGeometry() {
  const parts: THREE.BufferGeometry[] = []
  // Watchtower.
  for (const [x, z] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) parts.push(part(cyl(0.5, 0.6, 16, 5), 0x5a3d22, { x: x - 8, y: 8, z: z - 6 }))
  parts.push(part(box(8, 1.2, 8), 0x6b4a2a, { x: -8, y: 16, z: -6 }))
  parts.push(part(cone(6.5, 5, 4), 0x4a321c, { x: -8, y: 19.5, z: -6, ry: Math.PI / 4 }))
  // Tents.
  for (const [x, z, c] of [[8, 6, 0xd8ccb0], [-6, 10, 0xc9b892], [10, -8, 0xd8ccb0], [0, -14, 0xb9a888]] as const) parts.push(part(cone(5, 7, 6), c, { x, y: 3.5, z }))
  // Campfire stones.
  parts.push(part(cyl(2, 2.2, 0.8, 7), 0x6a645a, { x: 2, y: 0.4, z: 2 }))
  return merge(parts)
}

function watchtowerGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) parts.push(part(cyl(0.7, 0.9, 30, 5), 0x5a3d22, { x, y: 15, z }))
  for (let y = 6; y < 30; y += 8) parts.push(part(box(7, 0.6, 0.6), 0x4a321c, { y, z: 3 }), part(box(7, 0.6, 0.6), 0x4a321c, { y, z: -3 }))
  parts.push(part(box(10, 1.4, 10), 0x6b4a2a, { y: 30 }))
  for (const [x, z] of [[-4.5, 0], [4.5, 0], [0, -4.5], [0, 4.5]]) parts.push(part(box(x ? 1 : 10, 2.4, z ? 1 : 10), 0x6b4a2a, { x, y: 32, z }))
  parts.push(part(cone(8, 6, 4), 0x4a321c, { y: 37, ry: Math.PI / 4 }))
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2
    parts.push(part(cyl(0.6, 0.7, 4.5, 5), 0x5a3d22, { x: Math.cos(a) * 15, y: 2.2, z: Math.sin(a) * 15 }))
  }
  return merge(parts)
}

function lodgeGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (const [x, z, r] of [[-9, -4, 0.3], [8, -6, -0.4], [0, 10, 1.2]] as const) {
    parts.push(part(box(10, 5, 7), 0x5a3a20, { x, y: 2.5, z, ry: r }))
    parts.push(part(cyl(5.2, 5.2, 11, 3), 0x3d5a2a, { x, y: 6.4, z, rx: Math.PI / 2, ry: r, rz: Math.PI / 2, sy: 1 }))
  }
  parts.push(part(cyl(1.6, 1.8, 0.8, 7), 0x6a645a, { x: 0, y: 0.4, z: -1 }))
  return merge(parts)
}

function bridgefortGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const R = 28
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    if (i === 0) continue // gate
    parts.push(part(box(11.5, 10, 4), 0xa39d90, { x: Math.cos(a) * R, y: 5, z: Math.sin(a) * R, ry: -a + Math.PI / 2 }))
    parts.push(part(box(3, 2, 4.6), 0x8d877b, { x: Math.cos(a) * R, y: 11, z: Math.sin(a) * R, ry: -a + Math.PI / 2 }))
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    parts.push(part(cyl(5, 5.5, 16, 8), 0xb1aa9c, { x: Math.cos(a) * R, y: 8, z: Math.sin(a) * R }))
    parts.push(part(cone(6, 6, 8), 0x6b4a35, { x: Math.cos(a) * R, y: 19, z: Math.sin(a) * R }))
  }
  return merge(parts)
}

function depotGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (const [x, z] of [[-10, -6], [9, 8], [-4, 12]]) parts.push(part(cone(5, 7, 6), 0xd8ccb0, { x, y: 3.5, z }))
  for (let i = 0; i < 9; i++) parts.push(part(box(3, 3, 3), i % 2 ? 0x8a6a40 : 0x75572f, { x: 4 + (i % 3) * 3.2, y: 1.5 + Math.floor(i / 6) * 3, z: -8 + Math.floor((i % 6) / 3) * 3.2 }))
  for (const [x, z, r] of [[-12, 8, 0.4], [13, -4, -0.8]] as const) {
    parts.push(part(box(4, 2.5, 8), 0x6b4a2a, { x, y: 3, z, ry: r }))
    parts.push(part(cyl(3.8, 3.8, 8, 6), 0xe0d6bd, { x, y: 4.6, z, rx: Math.PI / 2, ry: r, rz: Math.PI / 2, sy: 0.6 }))
    for (const s of [-1, 1]) parts.push(part(cyl(1.4, 1.4, 0.6, 8), 0x4a3520, { x: x + Math.cos(-r) * s * 2.4, y: 1.4, z: z + Math.sin(-r) * s * 2.4, rz: Math.PI / 2, ry: r }))
  }
  return merge(parts)
}

class OutpostView {
  readonly group = new THREE.Group()
  private palisade: THREE.Mesh
  private camp: THREE.Mesh
  private flag: THREE.Mesh
  private color: string
  constructor(o: Outpost, engine: GameEngine, geos: Record<string, [THREE.BufferGeometry, THREE.BufferGeometry]>) {
    this.color = engine.factionColor(o.faction)
    const [mainGeo, extraGeo] = geos[o.kind] ?? geos.camp
    this.palisade = new THREE.Mesh(mainGeo, woodMat)
    this.camp = new THREE.Mesh(extraGeo, woodMat)
    for (const m of [this.palisade, this.camp]) {
      m.castShadow = true
      m.receiveShadow = true
    }
    const pole = new THREE.Mesh(merge([part(cyl(0.3, 0.3, 14, 5), 0x3b2f25, { y: 7 })]), woodMat)
    pole.position.set(-8, 20, -6)
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.5), applyVision(new THREE.MeshStandardMaterial({ color: this.color, side: THREE.DoubleSide })))
    this.flag.position.set(-4.5, 31, -6)
    if (o.kind === 'watchtower') {
      pole.position.set(0, 38, 0)
      this.flag.position.set(3.5, 49, 0)
    }
    this.group.add(this.palisade, this.camp, pole, this.flag)
    this.group.position.set(o.x, engine.world.heightAt(o.x, o.z) - 0.5, o.z)
    this.group.rotation.y = (o.x * 13 + o.z * 7) % 6.28
  }
  update(o: Outpost, time: number) {
    // The palisade rises as it is built; the camp appears halfway.
    const p = Math.max(0.08, o.progress)
    this.palisade.scale.set(1, p, 1)
    this.camp.visible = o.progress > 0.5
    this.flag.visible = o.progress >= 1
    this.flag.rotation.y = Math.sin(time * 2 + o.x) * 0.3
    // Burning: sink and darken a little.
    this.group.scale.setScalar(1 - o.raze * 0.25)
  }
}

export class OutpostRenderer {
  readonly group = new THREE.Group()
  private views = new Map<string, OutpostView>()
  private geos: Record<string, [THREE.BufferGeometry, THREE.BufferGeometry]> = (() => {
    const empty = new THREE.BufferGeometry()
    const camp = campGeometry()
    return {
      camp: [palisadeGeometry(), camp],
      watchtower: [watchtowerGeometry(), empty],
      lodge: [lodgeGeometry(), empty],
      bridgefort: [bridgefortGeometry(), camp],
      depot: [depotGeometry(), empty],
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
