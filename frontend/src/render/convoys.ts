import * as THREE from 'three'
import type { GameEngine } from '../game/engine'
import type { Convoy } from '../game/types'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { box, cyl, merge, part } from './geo'
import { applyVision } from './vision'

const wagonMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }))

/** A supply wagon with its draught horse, facing +x. */
function wagonGeometry() {
  const parts: THREE.BufferGeometry[] = []
  parts.push(part(box(8, 2.2, 4.2), 0x6b4a2a, { y: 2.4 }))
  parts.push(part(cyl(2.3, 2.3, 7.6, 8), 0xe8dfc6, { y: 4, rz: Math.PI / 2, sy: 0.8 }))
  for (const sx of [-2.6, 2.6]) for (const sz of [-2.3, 2.3]) parts.push(part(cyl(1.3, 1.3, 0.6, 8), 0x3b2a18, { x: sx, y: 1.3, z: sz, rx: Math.PI / 2 }))
  // Horse.
  parts.push(part(box(4.6, 2.2, 1.8), 0x5a3a22, { x: 7.4, y: 3.3 }))
  parts.push(part(box(1.4, 2.4, 1.2), 0x5a3a22, { x: 9.6, y: 4.6, rz: -0.5 }))
  for (const lx of [5.8, 8.8]) for (const lz of [-0.6, 0.6]) parts.push(part(box(0.5, 2.4, 0.5), 0x3e2716, { x: lx, y: 1.2, z: lz }))
  parts.push(part(box(3, 0.3, 0.3), 0x3b2a18, { x: 4.8, y: 2.6 }))
  return merge(parts)
}

interface Wagon {
  group: THREE.Group
  flag: THREE.Mesh
  x: number
  z: number
}

/**
 * Supply lines: a dashed road line from the source castle to each depot that
 * has wagons on the way, and the wagon trains themselves (three wagons in a row).
 */
export class ConvoyRenderer {
  readonly group = new THREE.Group()
  private geo = wagonGeometry()
  private wagons = new Map<string, Wagon>()
  private lines = new Map<string, THREE.Mesh>()
  private engine: GameEngine
  constructor(engine: GameEngine) {
    this.engine = engine
  }

  private lineColor(c: Convoy): number {
    const rel = this.engine.relation(c.faction)
    return rel === 'self' ? 0x8fb4ff : rel === 'ally' ? 0x6fd6c8 : 0xff7a5c
  }

  update(time: number) {
    const world = this.engine.world
    const convoys = this.engine.state.convoys ?? []
    const seen = new Set<string>()
    for (const c of convoys) {
      seen.add(c.id)
      let w = this.wagons.get(c.id)
      if (!w) {
        const group = new THREE.Group()
        for (let i = 0; i < 3; i++) {
          const m = new THREE.Mesh(this.geo, wagonMat)
          m.castShadow = true
          m.position.set(-i * 12, 0, 0)
          group.add(m)
        }
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.4), applyVision(new THREE.MeshStandardMaterial({ color: this.engine.factionColor(c.faction), side: THREE.DoubleSide })))
        flag.position.set(0, 9.5, 0)
        const pole = new THREE.Mesh(merge([part(cyl(0.18, 0.18, 6, 4), 0x3b2f25, { y: 3 })]), wagonMat)
        pole.position.set(-1.6, 4.2, 0)
        group.add(flag, pole)
        group.scale.setScalar(1.1)
        this.group.add(group)
        w = { group, flag, x: c.x, z: c.z }
        this.wagons.set(c.id, w)

        // The supply line: a dashed band laid along the road the wagons follow.
        const line = this.buildRoadLine(c)
        if (line) {
          this.group.add(line)
          this.lines.set(c.id, line)
        }
      }
      // Smooth movement; face the road.
      w.x += (c.x - w.x) * 0.25
      w.z += (c.z - w.z) * 0.25
      w.group.position.set(w.x, world.surfaceAt(w.x, w.z), w.z)
      w.group.rotation.y = -c.heading
      w.flag.rotation.y = Math.sin(time * 3 + c.x) * 0.3
      const line = this.lines.get(c.id)
      if (line) (line.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(time * 2) * 0.15
    }
    for (const [id, w] of this.wagons) {
      if (seen.has(id)) continue
      this.group.remove(w.group)
      ;(w.flag.material as THREE.Material).dispose()
      w.flag.geometry.dispose()
      this.wagons.delete(id)
      const line = this.lines.get(id)
      if (line) {
        this.group.remove(line)
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
        this.lines.delete(id)
      }
    }
  }

  private buildRoadLine(c: Convoy): THREE.Mesh | null {
    const world = this.engine.world
    const pts = c.route
    if (pts.length < 2) return null
    const dashes: THREE.BufferGeometry[] = []
    const DASH = 12
    const GAP = 9
    const P = DASH + GAP
    let travelled = 0
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1]
      const [bx, bz] = pts[i]
      const len = Math.hypot(bx - ax, bz - az)
      if (len < 1) continue
      const ux = (bx - ax) / len
      const uz = (bz - az) / len
      // First dash start on this segment, keeping one even rhythm along the whole road.
      for (let d = (P - (travelled % P)) % P; d < len; d += P) {
        const l = Math.min(DASH, len - d)
        const mx = ax + ux * (d + l / 2)
        const mz = az + uz * (d + l / 2)
        const g = new THREE.PlaneGeometry(l, 3.2)
        g.rotateX(-Math.PI / 2)
        g.rotateY(-Math.atan2(uz, ux))
        g.translate(mx, world.surfaceAt(mx, mz) + 1.2, mz)
        dashes.push(g)
      }
      travelled += len
    }
    if (dashes.length === 0) return null
    const geo = mergeGeometries(dashes, false)
    for (const d of dashes) d.dispose()
    if (!geo) return null
    const mat = new THREE.MeshBasicMaterial({ color: this.lineColor(c), transparent: true, opacity: 0.6, depthWrite: false })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = 2
    return mesh
  }

  /** Screen picking helper: convoy nearest a ground point. */
  nearest(x: number, z: number, within: number): Convoy | undefined {
    let best: Convoy | undefined
    let bd = within
    for (const c of this.engine.state.convoys ?? []) {
      const d = Math.hypot(c.x - x, c.z - z)
      if (d < bd) {
        bd = d
        best = c
      }
    }
    return best
  }
}
