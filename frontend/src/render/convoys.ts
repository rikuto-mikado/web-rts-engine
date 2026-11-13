import * as THREE from 'three'
import type { GameEngine } from '../game/engine'
import type { Convoy } from '../game/types'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { bmerge, bpart as part, box, cone, cyl, sphere } from './geo'
import { draughtHorseGeometry } from './figures'
import { makeBanner, waveFlag, type StandardFlag } from './standards'
import { applyVision } from './vision'

const wagonMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }))

type WagonKind = 'supply' | 'gold' | 'hospital'
const OAK = 0x6b4a2a
const OAK_D = 0x4e3520
const IRON = 0x3a3d42

/** A spoked wheel on the x-z side of a wagon (facing ±z): felloe, spokes, hub and an iron tyre. */
function wheel(p: THREE.BufferGeometry[], x: number, z: number, r: number) {
  p.push(part(new THREE.TorusGeometry(r, 0.22, 4, 14), 0x4a3420, { x, y: r, z }))
  p.push(part(new THREE.TorusGeometry(r + 0.06, 0.1, 3, 14), IRON, { x, y: r, z, ao: 0 }))
  for (let i = 0; i < 4; i++) p.push(part(box(0.14, r * 2 - 0.2, 0.16), 0x5a3f22, { x, y: r, z, rz: (i / 4) * Math.PI, ao: 0 }))
  p.push(part(cyl(0.38, 0.38, 0.7, 6), 0x2e2116, { x, y: r, z, rx: Math.PI / 2, ao: 0 }))
}

/**
 * A wagon and its team, facing +x: a timber bed with side boards on four spoked wheels, the
 * shafts, a driver on his seat, a lantern swinging from a hook, and the load of its kind:
 *   supply: a canvas tilt on hoops over grain sacks and ration barrels;
 *   gold: iron-bound treasure chests and gleaming ingots, a timber guard rail, two horses;
 *   hospital: an abbey's wagon, a white tilt with a red cross, apothecary chests.
 */
function wagonGeometry(kind: WagonKind) {
  const p: THREE.BufferGeometry[] = []
  // Bed, side boards and their uprights.
  p.push(part(box(8, 0.7, 4.2), OAK, { y: 2.9 }))
  for (const s of [-1, 1]) {
    p.push(part(box(8, 1.2, 0.25), 0x7a5634, { y: 3.8, z: s * 2.05 }))
    for (const x of [-3.6, -1.2, 1.2, 3.6]) p.push(part(box(0.3, 1.5, 0.35), OAK_D, { x, y: 3.8, z: s * 2.1, ao: 0 }))
  }
  p.push(part(box(0.25, 1.2, 4.2), 0x7a5634, { x: -3.95, y: 3.8 }))
  for (const x of [-2.6, 2.6]) {
    p.push(part(cyl(0.18, 0.18, 5.4, 5), OAK_D, { x, y: 1.6, rx: Math.PI / 2, ao: 0 }))
    for (const z of [-2.55, 2.55]) wheel(p, x, z, 1.6)
  }
  // The shafts out to the team, the driver's seat and footboard.
  for (const z of [-1, 1]) p.push(part(box(6.5, 0.28, 0.28), OAK_D, { x: 7, y: 3.3, z, rz: -0.06 }))
  p.push(part(box(1.3, 0.35, 3.6), OAK, { x: 3.4, y: 4.7 }))
  p.push(part(box(0.9, 0.25, 3.6), OAK_D, { x: 4.4, y: 3.5, rz: 0.3 }))
  // The driver: a hunched carter in a hood with the reins.
  p.push(part(cyl(0.7, 0.9, 1.9, 6), 0x6a5a40, { x: 3.4, y: 5.85, sz: 0.7 }))
  p.push(part(sphere(0.5, 0), 0xd9a77e, { x: 3.55, y: 7.15 }))
  p.push(part(sphere(0.62, 0), kind === 'hospital' ? 0x5a5a62 : 0x4e4436, { x: 3.4, y: 7.3, sy: 0.9 }))
  for (const z of [-0.5, 0.5]) p.push(part(box(1.4, 0.3, 0.3), 0x6a5a40, { x: 4.0, y: 5.6, z, rz: -0.4 }))
  // A lantern on a hooked pole at the front corner.
  p.push(part(cyl(0.12, 0.12, 3.6, 4), OAK_D, { x: 3.9, y: 5.2, z: 1.9, ao: 0 }))
  p.push(part(box(0.8, 0.12, 0.12), OAK_D, { x: 4.25, y: 6.9, z: 1.9, ao: 0 }))
  p.push(part(box(0.55, 0.7, 0.55), 0xf2c060, { x: 4.6, y: 6.35, z: 1.9, ao: 0 }))
  p.push(part(cone(0.45, 0.35, 4), 0x2a2622, { x: 4.6, y: 6.85, z: 1.9, ao: 0 }))
  if (kind === 'supply' || kind === 'hospital') {
    // A canvas tilt over iron-strapped hoops.
    const canvas = kind === 'hospital' ? 0xf2efe6 : 0xe8dfc6
    p.push(part(cyl(2.25, 2.25, 6.4, 10), canvas, { x: -0.6, y: 4.5, rz: Math.PI / 2, sz: 0.95 }))
    for (const x of [-3.4, -1.4, 0.6, 2.4]) p.push(part(new THREE.TorusGeometry(2.3, 0.1, 3, 10, Math.PI), OAK_D, { x, y: 4.5, ry: Math.PI / 2, ao: 0 }))
    if (kind === 'hospital') {
      // The red cross of the abbey's infirmary on both sides, apothecary chests at the tail.
      for (const z of [-2.18, 2.18]) {
        p.push(part(box(2.4, 0.6, 0.1), 0xb3202c, { x: -0.6, y: 5.6, z, ao: 0 }))
        p.push(part(box(0.6, 2.2, 0.1), 0xb3202c, { x: -0.6, y: 5.6, z, ao: 0 }))
      }
      for (const z of [-1, 1]) {
        p.push(part(box(1.2, 1.0, 1.4), 0x7a5a3a, { x: -4.6, y: 3.6, z }))
        p.push(part(box(1.25, 0.15, 1.45), 0xb8a070, { x: -4.6, y: 4.0, z, ao: 0 }))
      }
    } else {
      // Grain sacks and ration barrels showing at the tail.
      for (const z of [-1.1, 0, 1.1]) p.push(part(sphere(0.85, 0), 0xc8b088, { x: -4.3, y: 3.8, z, sy: 0.8 }))
      for (const z of [-0.9, 0.9]) {
        p.push(part(cyl(0.7, 0.78, 1.6, 8), 0x7a5634, { x: -4.9, y: 3.9, z, rz: Math.PI / 2 }))
        p.push(part(cyl(0.8, 0.8, 0.15, 8), IRON, { x: -4.4, y: 3.9, z, rz: Math.PI / 2, ao: 0 }))
      }
    }
  } else {
    // The gold: iron-bound chests, a pile of ingots, a timber guard rail round the bed.
    for (const [x, z] of [[-2.4, -0.9], [-2.4, 0.9], [0.4, 0]] as [number, number][]) {
      p.push(part(box(2.2, 1.5, 1.6), 0x5a3a20, { x, y: 4.1, z }))
      p.push(part(cyl(0.8, 0.8, 2.2, 6), 0x5a3a20, { x, y: 4.8, z, rz: Math.PI / 2, sz: 1.0, sy: 0.6 }))
      for (const dx of [-0.75, 0.75]) p.push(part(box(0.18, 1.9, 1.7), IRON, { x: x + dx, y: 4.4, z, ao: 0 }))
      p.push(part(box(0.3, 0.4, 0.2), 0xd9b04a, { x, y: 4.6, z: z + 0.85, ao: 0 }))
    }
    for (let i = 0; i < 6; i++) p.push(part(box(0.9, 0.35, 0.45), 0xf0c850, { x: 2.0 + (i % 3) * 0.2, y: 3.45 + Math.floor(i / 3) * 0.36, z: -1.2 + (i % 3) * 0.5, ry: (i % 2) * 0.2, ao: 0 }))
    for (const s of [-1, 1]) {
      p.push(part(box(8, 0.3, 0.3), OAK_D, { y: 5.6, z: s * 2.05 }))
      for (const x of [-3.6, 0, 3.6]) p.push(part(box(0.3, 1.8, 0.3), OAK_D, { x, y: 4.9, z: s * 2.05 }))
    }
  }
  // The team: one horse (two for the heavy gold), harnessed between the shafts.
  const horse = draughtHorseGeometry(kind === 'gold' ? 0x5a3a22 : kind === 'hospital' ? 0x8a8478 : 0x6a4a2a, { blaze: kind !== 'hospital', mule: kind === 'hospital' })
  horse.rotateY(Math.PI / 2)
  const team: THREE.BufferGeometry[] = []
  if (kind === 'gold') {
    for (const z of [-1.5, 1.5]) team.push(horse.clone().translate(9.2, 0, z))
  } else team.push(horse.clone().translate(9.2, 0, 0))
  return bmerge([bmerge(p), ...team])
}

interface Wagon {
  group: THREE.Group
  flag: StandardFlag
  x: number
  z: number
}

/**
 * Supply lines: a dashed road line from the source castle to each depot that
 * has wagons on the way, and the wagon trains themselves (three wagons in a row).
 */
export class ConvoyRenderer {
  readonly group = new THREE.Group()
  private geos: Record<WagonKind, THREE.BufferGeometry> = { supply: wagonGeometry('supply'), gold: wagonGeometry('gold'), hospital: wagonGeometry('hospital') }
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
        const kind: WagonKind = c.manpower ? 'hospital' : c.kind === 'gold' || c.race ? 'gold' : 'supply'
        for (let i = 0; i < 3; i++) {
          const m = new THREE.Mesh(this.geos[kind], wagonMat)
          m.castShadow = true
          m.position.set(-i * 15, 0, 0)
          group.add(m)
        }
        // The train's pennant: a small swallowtail in the owner's colours, on a pole at the lead wagon.
        const { group: pennant, flag } = makeBanner({ color: this.engine.factionColor(c.faction), pattern: kind === 'hospital' ? 'pale' : 'plain', scale: 0.36, seed: c.id.length })
        pennant.position.set(-3.2, 3.4, -1.6)
        pennant.rotation.y = Math.PI / 2
        group.add(pennant)
        group.scale.setScalar(1.1)
        this.group.add(group)
        w = { group, flag, x: c.x, z: c.z }
        this.wagons.set(c.id, w)

        // The supply line: a dashed band laid along the road the wagons follow (the gold train keeps to its road).
        const line = c.race ? null : this.buildRoadLine(c)
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
      waveFlag(w.flag, time, 1.3)
      const line = this.lines.get(c.id)
      if (line) (line.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(time * 2) * 0.15
    }
    for (const [id, w] of this.wagons) {
      if (seen.has(id)) continue
      this.group.remove(w.group)
      w.flag.mesh.geometry.dispose()
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
