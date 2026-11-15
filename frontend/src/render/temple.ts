import * as THREE from 'three'
import type { GameEngine } from '../game/engine'
import { mulberry32 } from '../game/noise'
import { Frame, newKit, shade, type Kit } from './buildings'
import { bmerge, box, bpart, cone, cyl, groundShade, sphere } from './geo'
import { buildMat } from './villages'
import { applyVision } from './vision'

/**
 * The Sanctuary of the High King: a round temple of white marble on three stepped terraces, about
 * 130 units across.
 *
 *   - a paved court with a processional way that sets out towards our court, flanked by two
 *     obelisks and lined with tall white-and-gold pennants;
 *   - three octagonal terraces, a flight of steps on each of the four sides;
 *   - a ring of sixteen columns with their bases, capitals and the entablature they carry;
 *   - the round cella inside, with a gilded band and four bronze doors, under a gilded drum and dome
 *     crowned by a lantern;
 *   - four statues of the Justices on plinths at the corners of the lowest terrace, swords raised;
 *   - the sacred flame on an altar before the steps, burning blue-white, which brightens while the
 *     King prays and blazes once the High King has answered.
 */

const MARBLE = 0xe9e4d8
const MARBLE_D = 0xcdc5b2
const MARBLE_V = 0xd9d2c2
const PAVE = 0xc9c1ad
const BRONZE = 0x3a2e22

const goldMat = applyVision(new THREE.MeshStandardMaterial({ color: 0xe2b850, metalness: 0.65, roughness: 0.32, flatShading: true }))
const flameMat = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
const haloMat = new THREE.MeshBasicMaterial({ color: 0x9cc8ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
const clothMat = applyVision(new THREE.MeshStandardMaterial({ color: 0xf4efe0, side: THREE.DoubleSide, roughness: 0.85 }))

/** The terraces: radius and height of each (octagons, the lowest first). */
const TIERS: [number, number][] = [
  [48, 2.2],
  [41, 2.2],
  [34, 2.2],
]
const TOP = TIERS.reduce((s, t) => s + t[1], 0)
const RING = 28
const COLUMN_H = 14

type Rnd = () => number

function terraces(k: Kit, f: Frame) {
  let y = 0
  for (const [r, h] of TIERS) {
    // (An octagon with flat faces to the four points of the compass.)
    f.put(k.walls, cyl(r, r + 0.6, h, 8), MARBLE, 0, y + h / 2, 0, { ry: Math.PI / 8, ao: 0.08 })
    f.put(k.walls, cyl(r + 0.9, r + 0.9, 0.35, 8), MARBLE_D, 0, y + h - 0.15, 0, { ry: Math.PI / 8, ao: 0 })
    y += h
  }
  // A flight of steps on each side, from the court to the top terrace.
  for (let side = 0; side < 4; side++) {
    const s = f.sub(0, 0, (side * Math.PI) / 2)
    const steps = 12
    for (let i = 0; i < steps; i++) {
      const h = (TOP / steps) * (i + 1)
      const z = TIERS[0][0] + 9 - i * ((TIERS[0][0] + 9 - TIERS[2][0] + 1) / steps)
      s.put(k.walls, box(16, h, 1.6), i % 2 ? MARBLE : MARBLE_V, 0, h / 2, z, { ao: 0.05 })
    }
  }
}

function peristyle(k: Kit, f: Frame, gold: THREE.BufferGeometry[]) {
  const n = 16
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n
    const x = Math.cos(a) * RING
    const z = Math.sin(a) * RING
    f.put(k.walls, box(3.4, 0.8, 3.4), MARBLE_D, x, TOP + 0.4, z, { ry: -a })
    f.put(k.walls, cyl(1.25, 1.45, COLUMN_H, 10), MARBLE, x, TOP + 0.8 + COLUMN_H / 2, z)
    f.put(k.walls, cyl(1.9, 1.3, 0.9, 10), MARBLE_D, x, TOP + 0.8 + COLUMN_H + 0.45, z)
    f.put(k.walls, box(3.6, 0.6, 3.6), MARBLE, x, TOP + 0.8 + COLUMN_H + 1.2, z, { ry: -a })
    // The entablature: one block from this column to the next.
    const b = ((i + 0.5) / n) * Math.PI * 2 + Math.PI / n
    const span = 2 * RING * Math.sin(Math.PI / n) + 1.4
    const ex = Math.cos(b) * RING
    const ez = Math.sin(b) * RING
    f.put(k.walls, box(span, 2.4, 4.2), MARBLE, ex, TOP + 0.8 + COLUMN_H + 2.7, ez, { ry: -b + Math.PI / 2, ao: 0 })
    f.put(gold, box(span, 0.45, 4.4), 0xffffff, ex, TOP + 0.8 + COLUMN_H + 2.0, ez, { ry: -b + Math.PI / 2 })
    f.put(k.walls, box(span + 0.6, 0.6, 5.0), MARBLE_D, ex, TOP + 0.8 + COLUMN_H + 4.2, ez, { ry: -b + Math.PI / 2, ao: 0 })
  }
  // The ceiling of the walk between the columns and the cella.
  f.put(k.walls, cyl(RING + 2.2, RING + 2.2, 0.8, 32), MARBLE_V, 0, TOP + 0.8 + COLUMN_H + 4.9, 0, { ao: 0 })
}

function cella(k: Kit, f: Frame, gold: THREE.BufferGeometry[]) {
  const r = 18
  const h = COLUMN_H + 4
  f.put(k.walls, cyl(r, r + 0.4, h, 24), MARBLE_V, 0, TOP + h / 2, 0, { ao: 0.12 })
  f.put(gold, cyl(r + 0.25, r + 0.25, 0.8, 24), 0xffffff, 0, TOP + h - 3, 0)
  // Four bronze doors under gilded lintels.
  for (let side = 0; side < 4; side++) {
    const s = f.sub(0, 0, (side * Math.PI) / 2)
    s.put(k.walls, box(5.6, 9.5, 1.2), BRONZE, 0, TOP + 4.75, r - 0.2, { ao: 0 })
    s.put(gold, box(7.2, 0.9, 1.4), 0xffffff, 0, TOP + 9.9, r)
    s.put(k.walls, box(0.25, 9.2, 1.3), 0x6b5634, 0, TOP + 4.6, r + 0.05, { ao: 0 })
  }
  // The drum above the roof of the walk, the dome and its lantern.
  const y0 = TOP + 0.8 + COLUMN_H + 5.3
  f.put(k.walls, cyl(r - 0.5, r - 0.5, 5, 24), MARBLE, 0, y0 + 2.5, 0, { ao: 0.06 })
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    f.put(k.walls, box(1.2, 3.4, 0.6), 0x6a6f86, Math.cos(a) * (r - 0.3), y0 + 2.5, Math.sin(a) * (r - 0.3), { ry: -a + Math.PI / 2, ao: 0 })
  }
  f.put(gold, cyl(r + 0.4, r + 0.4, 0.9, 24), 0xffffff, 0, y0 + 5.2, 0)
  const dome = new THREE.SphereGeometry(r - 0.4, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2)
  f.put(gold, dome, 0xffffff, 0, y0 + 5.6, 0)
  const top = y0 + 5.6 + r - 0.4
  f.put(k.walls, cyl(2.4, 2.8, 4.2, 8), MARBLE, 0, top + 1.6, 0, { ao: 0 })
  f.put(gold, cone(3.0, 3.6, 8), 0xffffff, 0, top + 5.4, 0)
  f.put(gold, sphere(0.9, 1), 0xffffff, 0, top + 7.8, 0)
  return top + 8.7
}

/** A Justice in white marble, robed, a sword of gold held up before him. */
function statue(k: Kit, f: Frame, gold: THREE.BufferGeometry[], lx: number, lz: number, face: number) {
  const s = f.sub(lx, lz, face)
  s.put(k.walls, box(5.2, 3.4, 5.2), MARBLE_D, 0, 1.7, 0, { ao: 0.08 })
  s.put(k.walls, box(5.8, 0.5, 5.8), MARBLE, 0, 3.6, 0, { ao: 0 })
  s.put(k.walls, cone(1.9, 6.6, 10), MARBLE, 0, 3.85 + 3.3, 0)
  s.put(k.walls, cyl(0.85, 1.25, 2.4, 8), MARBLE, 0, 3.85 + 6.2, 0)
  s.put(k.walls, sphere(0.85, 1), MARBLE, 0, 3.85 + 8.0, 0)
  s.put(k.walls, box(3.6, 0.7, 0.9), MARBLE_V, 0, 3.85 + 6.9, 0.2)
  s.put(gold, box(0.35, 5.2, 0.2), 0xffffff, 0, 3.85 + 9.2, 0.95)
  s.put(gold, box(1.9, 0.3, 0.35), 0xffffff, 0, 3.85 + 6.8, 0.95)
}

function court(k: Kit, f: Frame, gold: THREE.BufferGeometry[], rnd: Rnd) {
  // The paved court, its kerb, and the processional way out towards our court.
  f.put(k.flat!, cyl(62, 62.5, 0.5, 40), PAVE, 0, 0.25, 0)
  f.put(k.flat!, cyl(63.2, 63.6, 0.7, 40), MARBLE_D, 0, 0.12, 0)
  for (let i = 0; i < 7; i++) {
    const z = 64 + i * 7
    f.put(k.flat!, box(12, 0.45, 6.6), shade(PAVE, (rnd() - 0.5) * 0.08), 0, 0.22, z)
    for (const sx of [-1, 1]) f.put(k.flat!, box(0.9, 0.6, 6.8), MARBLE_D, sx * 6.4, 0.3, z)
  }
  // Two obelisks where the way enters the court.
  for (const sx of [-1, 1]) {
    const o = f.sub(sx * 11, 66, 0)
    o.put(k.walls, box(4.4, 2.2, 4.4), MARBLE_D, 0, 1.1, 0, { ao: 0.06 })
    o.put(k.walls, cyl(1.2, 1.9, 17, 4), MARBLE, 0, 2.2 + 8.5, 0, { ry: Math.PI / 4 })
    o.put(gold, cone(1.25, 2.4, 4), 0xffffff, 0, 2.2 + 17 + 1.2, 0, { ry: Math.PI / 4 })
  }
}

interface Built {
  group: THREE.Group
  flame: THREE.Group
  halo: THREE.Mesh
  pennants: { mesh: THREE.Mesh; base: Float32Array }[]
}

function build(heading: number, seed: number): Built {
  const rnd = mulberry32(seed)
  const k = newKit()
  k.flat = []
  const gold: THREE.BufferGeometry[] = []
  const f = new Frame(0, 0, heading)
  court(k, f, gold, rnd)
  terraces(k, f)
  peristyle(k, f, gold)
  cella(k, f, gold)
  for (const [lx, lz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) statue(k, f, gold, lx * 36, lz * 36, Math.atan2(lx, lz))
  // The altar of the sacred flame before the steps, on the way in.
  const altar = f.sub(0, 56, 0)
  altar.put(k.walls, cyl(4.8, 5.4, 1.2, 8), MARBLE_D, 0, 0.6, 0, { ry: Math.PI / 8 })
  altar.put(k.walls, cyl(2.2, 3.0, 4.6, 8), MARBLE, 0, 1.2 + 2.3, 0, { ry: Math.PI / 8 })
  altar.put(gold, cyl(3.6, 2.0, 1.6, 12), 0xffffff, 0, 5.8 + 0.8, 0)

  const group = new THREE.Group()
  const solid = new THREE.Mesh(groundShade(bmerge(k.walls), 3, 0.2), buildMat)
  solid.castShadow = true
  solid.receiveShadow = true
  group.add(solid)
  const flat = new THREE.Mesh(groundShade(bmerge(k.flat), 2, 0.12), buildMat)
  flat.receiveShadow = true
  group.add(flat)
  const g = new THREE.Mesh(bmerge(gold), goldMat)
  g.castShadow = true
  group.add(g)

  // The flame: an outer tongue, a white core, and a halo that shows only while it burns high.
  const flame = new THREE.Group()
  const [fx, fz] = altar.at(0, 0)
  flame.position.set(fx, 7.4, fz)
  const outer = new THREE.Mesh(cone(1.9, 6.5, 10), flameMat)
  outer.position.y = 3.25
  const core = new THREE.Mesh(cone(0.9, 3.8, 8), coreMat)
  core.position.y = 1.9
  flame.add(outer, core)
  group.add(flame)
  const halo = new THREE.Mesh(new THREE.RingGeometry(3, 11, 32), haloMat)
  halo.rotation.x = -Math.PI / 2
  halo.position.set(fx, 0.6, fz)
  group.add(halo)

  // Pennants round the court: tall white poles, white cloth hemmed in gold.
  const pennants: Built['pennants'] = []
  const poles: THREE.BufferGeometry[] = []
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.35) continue
    const [px, pz] = f.at(Math.cos(a) * 58, Math.sin(a) * 58)
    poles.push(bpart(box(0.5, 20, 0.5), 0xffffff, { x: px, y: 10, z: pz }))
    const geo = new THREE.PlaneGeometry(2.6, 9, 2, 6)
    geo.translate(1.3, -4.5, 0)
    const mesh = new THREE.Mesh(geo, clothMat)
    mesh.position.set(px, 19.6, pz)
    mesh.rotation.y = rnd() * Math.PI
    mesh.castShadow = true
    group.add(mesh)
    pennants.push({ mesh, base: Float32Array.from(geo.attributes.position.array as Float32Array) })
  }
  const poleMesh = new THREE.Mesh(bmerge(poles), goldMat)
  group.add(poleMesh)
  return { group, flame, halo, pennants }
}

/** Draws the Sanctuary, and its flame by the state of the King's prayer. */
export class TempleRenderer {
  readonly group = new THREE.Group()
  private built: Built
  private engine: GameEngine

  constructor(engine: GameEngine) {
    this.engine = engine
    const sa = engine.state.sanctuary!
    const court = engine.castle(engine.state.rules.defeatCastles[0])
    const heading = court ? Math.atan2(court.x - sa.x, court.z - sa.z) : 0
    this.built = build(heading, Math.round(sa.x * 7 + sa.z))
    this.group.position.set(sa.x, engine.world.heightAt(sa.x, sa.z), sa.z)
    this.group.add(this.built.group)
  }

  /** Where the flame burns, in world space (for its light). */
  flameAt(): [number, number, number] {
    const p = this.built.flame.getWorldPosition(new THREE.Vector3())
    return [p.x, p.y + 3, p.z]
  }

  update(time: number) {
    const sa = this.engine.state.sanctuary
    if (!sa) return
    // Low while it waits; brighter as the King prays; a blaze once answered.
    const heat = sa.blessed ? 1 : sa.praying ? 0.45 + 0.4 * (sa.progress / 30) : 0.35
    const flick = 1 + Math.sin(time * 9.1) * 0.06 + Math.sin(time * 15.7) * 0.04
    const fl = this.built.flame
    fl.scale.set(0.7 + heat * 0.6, (0.5 + heat * 1.1) * flick, 0.7 + heat * 0.6)
    fl.rotation.y = time * 0.7
    flameMat.opacity = 0.55 + heat * 0.35
    haloMat.opacity = (sa.praying || sa.blessed ? 0.18 + heat * 0.22 : 0) * (0.85 + Math.sin(time * 2.2) * 0.15)
    this.built.halo.rotation.z = time * 0.25
    for (const { mesh, base } of this.built.pennants) {
      const pos = mesh.geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3]
        pos.setZ(i, Math.sin(time * 2.6 + x * 1.3 + mesh.position.x * 0.05) * x * 0.22)
      }
      pos.needsUpdate = true
    }
  }
}
