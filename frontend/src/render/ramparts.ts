import * as THREE from 'three'
import { RAMPART_GATE, type World } from '../game/world'
import { bmerge, bpart, box, cone, cyl } from './geo'
import { applyVision } from './vision'

const STONE = 0x9c968a
const STONE_D = 0x7d776c
const WALK = 0x6f6a60
const ROOF = 0x5a3a2a
const BANNER = 0x8a2a22

/**
 * The great walls (Frostfire's Long Wall): a curtain of dressed stone with a crenellated
 * walk, square watchtowers every couple of hundred paces, a pair of great gate towers at each
 * gate, and broken ends and tumbled rubble at the breach.
 */
export function buildRamparts(world: World): THREE.Group {
  const group = new THREE.Group()
  const ramparts = world.def.ramparts ?? []
  if (ramparts.length === 0) return group
  const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.93 }))
  const SEG = 22
  for (const rp of ramparts) {
    const parts: THREE.BufferGeometry[] = []
    const W = rp.width
    const H = rp.height
    const gateNear = (x: number, z: number, r: number) => rp.gates.find((g) => Math.hypot(g.x - x, g.z - z) < r)
    let n = 0
    for (let k = 0; k < rp.points.length - 1; k++) {
      const [ax, az] = rp.points[k]
      const [bx, bz] = rp.points[k + 1]
      const len = Math.hypot(bx - ax, bz - az)
      if (len < 1) continue
      const ux = (bx - ax) / len
      const uz = (bz - az) / len
      const ry = -Math.atan2(uz, ux)
      const steps = Math.max(1, Math.round(len / SEG))
      const sl = len / steps
      for (let s = 0; s < steps; s++, n++) {
        const x0 = ax + ux * sl * s
        const z0 = az + uz * sl * s
        const x1 = x0 + ux * sl
        const z1 = z0 + uz * sl
        const mx = (x0 + x1) / 2
        const mz = (z0 + z1) / 2
        if (Math.abs(mx) > world.half - 10 || Math.abs(mz) > world.half - 10) continue
        const g = gateNear(mx, mz, RAMPART_GATE)
        if (g) continue
        const h0 = world.heightAt(x0, z0)
        const h1 = world.heightAt(x1, z1)
        // Close to a breach the wall stands ragged and lower.
        const nearBreach = gateNear(mx, mz, RAMPART_GATE + 60)
        const ragged = nearBreach?.breach ? 0.45 + 0.4 * Math.abs(Math.sin(n * 2.3)) : 1
        const base = Math.min(h0, h1) - 3
        const top = Math.max(h0, h1) + H * ragged
        parts.push(bpart(box(sl + 1.2, top - base, W), n % 3 === 0 ? STONE_D : STONE, { x: mx, y: (base + top) / 2, z: mz, ry, ao: 0.25 }))
        // The walk along the top, and merlons on both parapets.
        parts.push(bpart(box(sl + 1.2, 0.6, W - 3), WALK, { x: mx, y: top + 0.3, z: mz, ry, ao: 0 }))
        if (ragged === 1) {
          for (const side of [-1, 1]) {
            const ox = -uz * (W / 2 - 0.9) * side
            const oz = ux * (W / 2 - 0.9) * side
            for (const t of [-0.33, 0, 0.33]) {
              parts.push(bpart(box(3.2, 2.6, 1.8), STONE_D, { x: mx + ux * sl * t + ox, y: top + 1.3, z: mz + uz * sl * t + oz, ry, ao: 0 }))
            }
          }
        }
        // A square watchtower every eight lengths of wall.
        if (n % 8 === 4 && ragged === 1) {
          const tw = W + 9
          const th = H + 11
          const tb = Math.min(h0, h1) - 3
          parts.push(bpart(box(tw, th + (top - H - tb), tw), STONE, { x: mx, y: tb + (th + (top - H - tb)) / 2, z: mz, ry, ao: 0.3 }))
          parts.push(bpart(cone(tw * 0.78, 9, 4), ROOF, { x: mx, y: top - H + th + 4.5, z: mz, ry: ry + Math.PI / 4, ao: 0 }))
        }
      }
    }
    // Gates: two great towers with banners either side of the road; breaches: rubble and broken stone.
    for (const g of rp.gates) {
      const [ux, uz] = world.polyDir(rp.points, g.x, g.z)
      const ry = -Math.atan2(uz, ux)
      for (const side of [-1, 1]) {
        const tx = g.x + ux * (RAMPART_GATE - 4) * side
        const tz = g.z + uz * (RAMPART_GATE - 4) * side
        const hb = world.heightAt(tx, tz) - 3
        if (g.breach) {
          // Tumbled blocks spilling into the gap.
          for (let i = 0; i < 7; i++) {
            const t = (i / 7) * 34
            const jx = tx - ux * t * side + -uz * Math.sin(i * 1.7) * W * 0.7
            const jz = tz - uz * t * side + ux * Math.sin(i * 1.7) * W * 0.7
            const s = 3 + (i % 3) * 1.6
            parts.push(bpart(box(s, s * 0.7, s * 1.2), i % 2 ? STONE_D : STONE, { x: jx, y: world.heightAt(jx, jz) + s * 0.25, z: jz, ry: ry + i * 0.7, rx: 0.2 * (i % 2), ao: 0.15 }))
          }
          continue
        }
        const tw = W + 14
        const th = rp.height + 18
        parts.push(bpart(box(tw, th, tw), STONE, { x: tx, y: hb + th / 2, z: tz, ry, ao: 0.3 }))
        for (const c of [-1, 1]) for (const d of [-1, 1]) parts.push(bpart(box(3.4, 3, 3.4), STONE_D, { x: tx + (-uz * c + ux * d) * (tw / 2 - 1.6), y: hb + th + 1.5, z: tz + (ux * c + uz * d) * (tw / 2 - 1.6), ry, ao: 0 }))
        parts.push(bpart(cyl(0.35, 0.35, 12, 5), 0x3b2f25, { x: tx, y: hb + th + 6, z: tz, ao: 0 }))
        parts.push(bpart(box(0.3, 5, 7), BANNER, { x: tx + ux * 3.6 * -side, y: hb + th + 9, z: tz + uz * 3.6 * -side, ry: ry + Math.PI / 2, ao: 0 }))
      }
    }
    if (parts.length === 0) continue
    const mesh = new THREE.Mesh(bmerge(parts), mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
  return group
}
