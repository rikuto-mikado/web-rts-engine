import * as THREE from 'three'
import type { World } from '../game/world'
import { box, cone, cyl, merge, part } from './geo'
import { applyVision } from './vision'

/**
 * The rifts of the Endless Night: a scorched, cracked ring of ground, a crown of black standing
 * shards leaning outwards, and a cold violet light welling up through the cleft at the centre.
 */
export function buildRifts(world: World, rifts: { x: number; z: number }[]): THREE.Group {
  const group = new THREE.Group()
  const stone = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }))
  const light = new THREE.MeshBasicMaterial({ color: 0xa070ff, transparent: true, opacity: 0.85, depthWrite: false })
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (const r of rifts) {
    const y = world.heightAt(r.x, r.z)
    const parts: THREE.BufferGeometry[] = []
    const glow: THREE.BufferGeometry[] = []
    // Scorched ground.
    parts.push(part(cyl(58, 66, 1.2, 18), 0x1c1820, { y: 0.2 }))
    parts.push(part(cyl(30, 34, 1.4, 14), 0x110d16, { y: 0.4 }))
    // A crown of black shards, leaning out.
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2 + rnd() * 0.2
      const rr = 34 + rnd() * 16
      const h = 14 + rnd() * 22
      parts.push(part(cone(2.6 + rnd() * 2, h, 4), i % 3 ? 0x24202a : 0x2f2938, { x: Math.cos(a) * rr, y: h / 2, z: Math.sin(a) * rr, rx: Math.sin(a) * 0.35, rz: -Math.cos(a) * 0.35, ry: rnd() * 3 }))
    }
    // Rubble and the cleft.
    for (let i = 0; i < 18; i++) {
      const a = rnd() * Math.PI * 2
      const rr = 8 + rnd() * 46
      const s = 1.5 + rnd() * 3
      parts.push(part(box(s, s * 0.6, s * 1.3), 0x2a2530, { x: Math.cos(a) * rr, y: s * 0.25, z: Math.sin(a) * rr, ry: rnd() * 3 }))
    }
    // The light welling up: a tall pale column and the glowing crack.
    glow.push(part(box(26, 0.6, 4), 0xffffff, { y: 1.3, ry: rnd() * 3 }))
    glow.push(part(cone(5, 70, 6), 0xffffff, { y: 35 }))
    // A lone Great Rift is drawn vast: the land torn open, shards like a crown of black teeth.
    const scale = rifts.length === 1 ? 2.6 : 1
    const holder = new THREE.Group()
    holder.position.set(r.x, y, r.z)
    holder.scale.setScalar(scale)
    const m = new THREE.Mesh(merge(parts), stone)
    m.receiveShadow = true
    m.castShadow = true
    holder.add(m)
    const g = new THREE.Mesh(merge(glow), light)
    g.renderOrder = 5
    holder.add(g)
    group.add(holder)
  }
  return group
}
