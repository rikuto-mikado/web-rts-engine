import * as THREE from 'three'
import { ICE, WATER_LEVEL, type World } from '../game/world'
import { applyVision } from './vision'

/**
 * Deep Freeze: the ice on the frozen stretches of the rivers. A pale sheet laid just over the water
 * along each stretch, as wide as the river and its banks (the banks hide its edges, so the ice meets
 * the shore where the water did), white where the snow lies on it and blue-grey where it is clear,
 * with a faint net of cracks. It fades in when the rivers freeze and out when they thaw.
 */
export function buildIce(world: World): { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial } | null {
  if (!world.canFreeze) return null
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const snow = new THREE.Color(0xf6f9fb)
  const clear = new THREE.Color(0xc4d8e6)
  const c = new THREE.Color()
  const y = WATER_LEVEL + 0.5
  const shade = (x: number, z: number) => {
    const n = 0.5 + 0.5 * Math.sin(x * 0.021 + Math.sin(z * 0.017) * 1.7) * Math.sin(z * 0.019 - x * 0.006)
    return c.copy(clear).lerp(snow, 0.35 + 0.6 * n)
  }
  for (const s of world.iceSegs) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az)
    if (len < 0.5) continue
    // A little past each end, so neighbouring pieces overlap at the bends.
    const ux = (s.bx - s.ax) / len
    const uz = (s.bz - s.az) / len
    const nx = -uz
    const nz = ux
    const half = s.width / 2 + ICE.margin
    const ext = Math.min(half, 12)
    const ends: [number, number][] = [
      [s.ax - ux * ext, s.az - uz * ext],
      [s.bx + ux * ext, s.bz + uz * ext],
    ]
    const base = pos.length / 3
    for (const [px, pz] of ends) {
      for (const side of [-1, 1]) {
        const x = px + nx * half * side
        const z = pz + nz * half * side
        pos.push(x, y, z)
        const k = shade(x, z)
        col.push(k.r, k.g, k.b)
      }
    }
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
  }
  // Frozen lakes: a disc out to the shore (the shore hides its rim).
  for (const l of world.iceLakes) {
    const R = l.r + ICE.lakeShore
    const n = 48
    const centre = pos.length / 3
    pos.push(l.x, y, l.z)
    const k0 = shade(l.x, l.z)
    col.push(k0.r, k0.g, k0.b)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const x = l.x + Math.cos(a) * R
      const z = l.z + Math.sin(a) * R
      pos.push(x, y, z)
      const k = shade(x, z)
      col.push(k.r, k.g, k.b)
    }
    for (let i = 0; i < n; i++) idx.push(centre, centre + 1 + ((i + 1) % n), centre + 1 + i)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const mat = applyVision(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.08, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    // A faint net of cracks, and a cold sheen.
    `{
      float a = abs(sin(vVisWorld.x * 0.071 + sin(vVisWorld.z * 0.043) * 2.3));
      float b = abs(sin(vVisWorld.z * 0.063 - sin(vVisWorld.x * 0.037) * 2.1));
      float crack = 1.0 - smoothstep(0.0, 0.05, min(a, b));
      gl_FragColor.rgb *= 1.0 - 0.18 * crack;
    }`,
  )
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  // Over the water (drawn at renderOrder 2), or the water would tint it blue.
  mesh.renderOrder = 3
  mesh.visible = false
  return { mesh, mat }
}
