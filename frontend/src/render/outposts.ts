import * as THREE from 'three'
import type { GameEngine } from '../game/engine'
import type { Outpost } from '../game/types'
import { box, cone, cyl, merge, part } from './geo'
import { applyVision } from './vision'

const woodMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }))

const LOG = 0x6b4a2a
const LOG_D = 0x5a3d22
const ROOFW = 0x4a321c

/** Palisade Castrum: a square log stockade with corner towers, a gate on each side and tents within. */
function castrumGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const H = 50
  for (let i = -H; i <= H; i += 2.8) {
    for (const [x, z] of [[i, -H], [i, H], [-H, i], [H, i]] as const) {
      if ((Math.abs(x) === H && Math.abs(z) < 8) || (Math.abs(z) === H && Math.abs(x) < 8)) continue
      const h = 8 + ((Math.abs(i * 7) | 0) % 3) * 0.5
      parts.push(part(cyl(1, 1.15, h, 5), (Math.abs(i) * 10) % 2 ? LOG : LOG_D, { x, y: h / 2, z }))
      parts.push(part(cone(1, 1.6, 5), ROOFW, { x, y: h + 0.8, z }))
    }
  }
  parts.push(part(box(H * 2 + 8, 0.8, H * 2 + 8), 0x7a6648, { y: 0.1 }))
  for (const [x, z] of [[H, H], [H, -H], [-H, H], [-H, -H]] as const) {
    for (const [dx, dz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) parts.push(part(cyl(0.6, 0.7, 18, 5), LOG_D, { x: x + dx, y: 9, z: z + dz }))
    parts.push(part(box(8, 1.2, 8), LOG, { x, y: 18, z }))
    parts.push(part(box(8, 2.6, 0.8), LOG, { x, y: 19.8, z: z + 3.6 }))
    parts.push(part(box(8, 2.6, 0.8), LOG, { x, y: 19.8, z: z - 3.6 }))
    parts.push(part(cone(6.4, 5, 4), ROOFW, { x, y: 23.5, z, ry: Math.PI / 4 }))
  }
  return merge(parts)
}

function tentsGeometry(spread: number) {
  const parts: THREE.BufferGeometry[] = []
  const spots: [number, number, number][] = [[14, 12, 0xd8ccb0], [-12, 18, 0xc9b892], [18, -14, 0xd8ccb0], [-4, -22, 0xb9a888], [-24, -4, 0xd8ccb0], [26, 4, 0xc9b892], [-20, 24, 0xb9a888]]
  for (const [x, z, c] of spots) parts.push(part(cone(5, 7, 6), c, { x: x * spread, y: 3.5, z: z * spread }))
  // Command tent and fire.
  parts.push(part(box(12, 5, 9), 0xe2d6b8, { x: 0, y: 2.5, z: 0 }))
  parts.push(part(cyl(0.01, 6.4, 12.6, 3), 0x9a2a22, { x: 0, y: 7.6, z: 0, rz: Math.PI / 2, sx: 0.9 }))
  parts.push(part(cyl(2, 2.2, 0.8, 7), 0x6a645a, { x: 8, y: 0.4, z: 10 }))
  return merge(parts)
}

/** Wagon Laager: war wagons chained nose to tail in a ring. */
function laagerGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const R = 40
  const n = 14
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const x = Math.cos(a) * R
    const z = Math.sin(a) * R
    const ry = -a + Math.PI / 2
    parts.push(part(box(15, 3, 5.6), LOG, { x, y: 3.2, z, ry }))
    parts.push(part(box(15, 4, 0.8), 0x7a5a36, { x: x + Math.cos(a) * 2.6, y: 6, z: z + Math.sin(a) * 2.6, ry }))
    parts.push(part(cyl(2.8, 2.8, 14, 8), 0xd8ccae, { x, y: 7.4, z, ry, rz: Math.PI / 2, sy: 0.7 }))
    for (const s of [-1, 1]) for (const e of [-1, 1]) parts.push(part(cyl(1.6, 1.6, 0.6, 9), 0x3b2a18, { x: x + Math.cos(-ry) * e * 5 + Math.cos(a) * s * 3, y: 1.6, z: z - Math.sin(-ry) * e * 5 + Math.sin(a) * s * 3, rx: Math.PI / 2, ry }))
    parts.push(part(cyl(0.3, 0.3, 4, 4), 0x3a3a3a, { x: Math.cos(a + Math.PI / n) * R, y: 2.5, z: Math.sin(a + Math.PI / n) * R, rz: Math.PI / 2, ry: ry }))
  }
  for (const [x, z] of [[6, 4], [-8, -6]]) parts.push(part(cyl(2, 2.2, 0.8, 7), 0x6a645a, { x, y: 0.4, z }))
  return merge(parts)
}

/** Mangonel Redoubt: an earthen ring and ditch with a ballista and a mangonel on timber platforms. */
function redoubtGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const R = 44
  parts.push(part(new THREE.TorusGeometry(R, 5, 5, 28), 0x7a6648, { y: 1.2, rx: Math.PI / 2, sz: 0.45 }))
  parts.push(part(new THREE.TorusGeometry(R + 9, 2.4, 4, 28), 0x4a3c2c, { y: 0.2, rx: Math.PI / 2, sz: 0.2 }))
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    if (Math.abs(Math.sin(a)) < 0.1 && Math.cos(a) > 0) continue
    parts.push(part(cyl(0.7, 0.9, 6, 5), LOG_D, { x: Math.cos(a) * R, y: 5, z: Math.sin(a) * R, rx: Math.sin(a) * 0.4, rz: -Math.cos(a) * 0.4 }))
  }
  // Mangonel: platform, frame and throwing arm.
  parts.push(part(box(16, 2, 14), LOG, { x: -10, y: 1.5, z: 0 }))
  for (const s of [-1, 1]) parts.push(part(box(1.4, 12, 1.4), LOG_D, { x: -10, y: 8, z: s * 4.6 }))
  parts.push(part(box(1.2, 1.2, 10.4), LOG_D, { x: -10, y: 13, z: 0 }))
  parts.push(part(box(24, 1.2, 1.2), LOG, { x: -6, y: 13.5, z: 0, rz: 0.5 }))
  parts.push(part(box(4, 4, 4), 0x6a645a, { x: -17, y: 9, z: 0 }))
  // Ballista: a giant crossbow on a post.
  parts.push(part(box(10, 2, 10), LOG, { x: 14, y: 1.5, z: 8 }))
  parts.push(part(cyl(0.8, 1, 6, 6), LOG_D, { x: 14, y: 5, z: 8 }))
  parts.push(part(box(12, 1, 1.4), LOG, { x: 14, y: 8.4, z: 8 }))
  parts.push(part(box(1.2, 1, 14), LOG_D, { x: 14, y: 8.4, z: 8 }))
  // Piles of shot.
  for (let i = 0; i < 8; i++) parts.push(part(new THREE.DodecahedronGeometry(1.4, 0), 0x8a8378, { x: 2 + (i % 4) * 2.4, y: 1.4 + Math.floor(i / 4) * 1.8, z: -14 }))
  return merge(parts)
}

/** Outrider Pavilion: low, camouflaged tents and muffled stables behind brush screens. */
function pavilionGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (const [x, z, r] of [[-14, -8, 0.3], [10, -12, -0.4], [2, 14, 1.2], [-20, 14, 0.8], [20, 10, -1]] as const) {
    parts.push(part(cone(7, 6, 5), r > 0 ? 0x5a6a3a : 0x6a5a3a, { x, y: 3, z, ry: r }))
  }
  // Stables: long low roofs.
  parts.push(part(box(22, 3, 8), 0x4f4030, { x: 0, y: 1.5, z: -26 }))
  parts.push(part(cyl(0.01, 5, 22.6, 3), 0x4a5a32, { x: 0, y: 4.6, z: -26, rz: Math.PI / 2, sx: 0.9 }))
  // Brush screens and camouflage netting on poles.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2
    parts.push(part(new THREE.SphereGeometry(3.6, 6, 4), i % 2 ? 0x4c6a32 : 0x5f7a3a, { x: Math.cos(a) * 38, y: 2.4, z: Math.sin(a) * 38, sy: 0.75 }))
  }
  for (const [x, z] of [[-6, 0], [6, 2]]) {
    parts.push(part(cyl(0.3, 0.3, 7, 4), LOG_D, { x, y: 3.5, z }))
  }
  parts.push(part(box(18, 0.3, 12), 0x55693a, { x: 0, y: 7, z: 1 }))
  return merge(parts)
}

/** A walled supply depot: square stockade with a gate, a timber storehouse, a stable and wagons. */
function depotGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const H = 26
  // Square stockade, gap for the gate on the +x side.
  for (let i = -H; i <= H; i += 2.6) {
    for (const [x, z] of [[i, -H], [i, H], [-H, i], [H, i]] as const) {
      if (x === H && Math.abs(z) < 6) continue
      const h = 6.5 + ((Math.abs(i * 7) | 0) % 3) * 0.4
      parts.push(part(cyl(0.9, 1.05, h, 5), (i * 10) % 2 ? 0x6b4a2a : 0x5a3d22, { x, y: h / 2, z }))
      parts.push(part(cone(0.9, 1.4, 5), 0x4a321c, { x, y: h + 0.7, z }))
    }
  }
  // Gate towers.
  for (const s of [-1, 1]) {
    parts.push(part(box(4, 11, 4), 0x5a3d22, { x: H, y: 5.5, z: s * 8 }))
    parts.push(part(cone(3.6, 3.5, 4), 0x3e2a18, { x: H, y: 12.6, z: s * 8, ry: Math.PI / 4 }))
  }
  // Storehouse: long timber hall on stone footing with a steep roof.
  parts.push(part(box(24, 2, 13), 0x8f887a, { x: -8, y: 1, z: -9 }))
  parts.push(part(box(22, 8, 11), 0x7a5532, { x: -8, y: 6, z: -9 }))
  parts.push(part(cyl(0.01, 9.5, 8, 4), 0x5b3f26, { x: -8, y: 14, z: -9, ry: Math.PI / 4, sx: 1.7, sz: 0.85 }))
  parts.push(part(box(4, 5, 0.6), 0x2a1d14, { x: -8, y: 4.5, z: -3.2 }))
  // Stable and hay.
  parts.push(part(box(10, 5, 8), 0x6b4a2a, { x: -13, y: 2.5, z: 13 }))
  parts.push(part(box(11, 0.8, 9), 0x4a321c, { x: -13, y: 5.4, z: 13 }))
  for (const [x, z] of [[-4, 15], [-1.5, 17]]) parts.push(part(cyl(2, 2, 2.6, 8), 0xd4b25a, { x, y: 1.3, z, rz: Math.PI / 2 }))
  // Wagons by the gate.
  for (const [x, z, r] of [[14, -14, 0.3], [16, 12, -0.4]] as const) {
    parts.push(part(box(8, 2.4, 4), 0x6b4a2a, { x, y: 2.6, z, ry: r }))
    parts.push(part(cyl(2.4, 2.4, 7.4, 8), 0xe8dfc6, { x, y: 4.2, z, ry: r, rz: Math.PI / 2, sy: 0.75 }))
    for (const s of [-1, 1]) parts.push(part(cyl(1.3, 1.3, 0.6, 8), 0x3b2a18, { x: x - Math.sin(r) * s * 2.3, y: 1.3, z: z + Math.cos(r) * s * 2.3, rx: Math.PI / 2, ry: r }))
  }
  // Outposts are larger now: the whole depot is built half as large again.
  const g = merge(parts)
  g.scale(1.6, 1.25, 1.6)
  return g
}

/** Crates, sacks and barrels: the stores on hand. Scaled by the depot's stock. */
function storesGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 12; i++) {
    const x = 4 + (i % 4) * 3.3
    const z = -2 + Math.floor(i / 4) * 3.3
    parts.push(part(box(3, 3, 3), i % 3 ? 0x8a6a40 : 0x75572f, { x, y: 1.5, z }))
  }
  for (let i = 0; i < 6; i++) parts.push(part(box(3, 3, 3), 0x9a7a4c, { x: 5.6 + (i % 3) * 3.3, y: 4.5, z: -0.4 + Math.floor(i / 3) * 3.3 }))
  for (let i = 0; i < 5; i++) parts.push(part(cyl(1.3, 1.3, 2.8, 8), 0x5e4126, { x: -2 - (i % 3) * 2.8, y: 1.4, z: 4 + Math.floor(i / 3) * 2.8 }))
  for (let i = 0; i < 4; i++) parts.push(part(new THREE.SphereGeometry(1.5, 6, 4), 0xcdbf98, { x: 6 + i * 2.6, y: 1, z: 9, sy: 0.7 }))
  const g = merge(parts)
  g.scale(1.6, 1.25, 1.6)
  return g
}

class OutpostView {
  readonly group = new THREE.Group()
  private palisade: THREE.Mesh
  private camp: THREE.Mesh
  private flag: THREE.Mesh
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
    const pole = new THREE.Mesh(merge([part(cyl(0.3, 0.3, 14, 5), 0x3b2f25, { y: 7 })]), woodMat)
    pole.position.set(-8, 20, -6)
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.5), applyVision(new THREE.MeshStandardMaterial({ color: this.color, side: THREE.DoubleSide })))
    this.flag.position.set(-4.5, 31, -6)
    // The banner stands on a corner tower, the mangonel, the command tent or the storehouse.
    const at: Record<string, [number, number, number]> = { castrum: [50, 24, 50], laager: [0, 6, 0], redoubt: [-10, 14, 0], pavilion: [0, 7, 1], depot: [-13, 20, -14] }
    const [px, py, pz] = at[o.kind] ?? [0, 6, 0]
    pole.position.set(px, py, pz)
    this.flag.position.set(px + 3.5, py + 11, pz)
    this.group.add(this.palisade, this.camp, pole, this.flag)
    this.group.position.set(o.x, engine.world.heightAt(o.x, o.z) - 0.5, o.z)
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
    return {
      castrum: [castrumGeometry(), tentsGeometry(1.2)],
      laager: [laagerGeometry(), tentsGeometry(0.7)],
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
