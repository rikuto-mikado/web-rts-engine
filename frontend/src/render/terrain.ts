import * as THREE from 'three'
import { mulberry32, Simplex } from '../game/noise'
import { BRIDGE_DECK, WATER_LEVEL, castleRadius, type BridgeInfo, type World } from '../game/world'
import { box, cone, cyl, merge, part, sphere } from './geo'
import { applyVision } from './vision'

export function buildTerrain(world: World): THREE.Mesh {
  const seg = world.hRes - 1
  const geo = new THREE.PlaneGeometry(world.size, world.size, seg, seg)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const c: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, world.heightAt(x, z))
    world.colorAt(x, z, c)
    colors[i * 3] = c[0]
    colors[i * 3 + 1] = c[1]
    colors[i * 3 + 2] = c[2]
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }), '', true, true)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  mesh.name = 'terrain'
  return mesh
}

/** A wide skirt of hills beyond the playable area so the world has no visible edge. */
export function buildSkirt(world: World): THREE.Mesh {
  const outer = world.size * 3
  const geo = new THREE.PlaneGeometry(outer, outer, 90, 90)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const n = new Simplex(99)
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const edge = Math.max(Math.abs(x), Math.abs(z))
    const inside = edge < world.half + 10
    const h = inside ? -40 : 60 + n.fbm(x * 0.002, z * 0.002, 3) * 70 + Math.min(120, (edge - world.half) * 0.1)
    pos.setY(i, h)
    const g = 0.75 + n.noise(x * 0.003, z * 0.003) * 0.1
    const [gr, gg, gb] = world.biome.grassA
    colors[i * 3] = gr * g
    colors[i * 3 + 1] = gg * g
    colors[i * 3 + 2] = gb * g
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }), '', true)
  return new THREE.Mesh(geo, mat)
}

export function buildWater(world: World): THREE.Mesh {
  // Wider than the map so rivers flow on into the hills beyond the edge.
  const geo = new THREE.PlaneGeometry(world.size * 3, world.size * 3, 1, 1)
  geo.rotateX(-Math.PI / 2)
  const mat = applyVision(
    new THREE.MeshStandardMaterial({
      color: world.biome.water,
      roughness: 0.12,
      metalness: 0.15,
      transparent: true,
      opacity: 0.82,
    }),
    // Gentle animated glints on the surface.
    `{
      float w = sin(vVisWorld.x * 0.11 + uTime * 1.3) * sin(vVisWorld.z * 0.09 - uTime * 1.1)
              + sin((vVisWorld.x + vVisWorld.z) * 0.05 + uTime * 0.7) * 0.6;
      gl_FragColor.rgb += vec3(0.07, 0.09, 0.1) * smoothstep(0.75, 1.5, w);
    }`,
  )
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = WATER_LEVEL
  mesh.receiveShadow = true
  mesh.renderOrder = 2
  return mesh
}

// ---------------------------------------------------------------------------
// Vegetation and rocks
// ---------------------------------------------------------------------------

function pineGeometry() {
  return merge([
    part(cyl(0.5, 0.75, 4, 6), 0x5b4027, { y: 2 }),
    part(cone(4.6, 8, 7), 0x2f5d34, { y: 7 }),
    part(cone(3.6, 6.5, 7), 0x356b3a, { y: 10.5 }),
    part(cone(2.4, 4.5, 7), 0x3c7641, { y: 13.4 }),
  ])
}

function oakGeometry() {
  return merge([
    part(cyl(0.6, 0.9, 5, 6), 0x60442a, { y: 2.5 }),
    part(sphere(4.6, 0), 0x4c7a35, { y: 8, sy: 0.85 }),
    part(sphere(3.2, 0), 0x5a8a3c, { x: 2.4, y: 9.6, z: 1, sy: 0.85 }),
    part(sphere(3, 0), 0x46712f, { x: -2.2, y: 9.2, z: -1.4, sy: 0.85 }),
  ])
}

function rockGeometry() {
  return merge([part(new THREE.DodecahedronGeometry(3, 0), 0x8b867d, { sy: 0.7 })])
}

function bushGeometry() {
  return merge([part(sphere(2, 0), 0x47702f, { y: 1, sy: 0.7 }), part(sphere(1.4, 0), 0x557f36, { x: 1.4, y: 0.9, sy: 0.7 })])
}

export function buildVegetation(world: World): THREE.Group {
  const rnd = mulberry32(4242)
  const group = new THREE.Group()
  const pines: THREE.Matrix4[] = []
  const oaks: THREE.Matrix4[] = []
  const rocks: THREE.Matrix4[] = []
  const bushes: THREE.Matrix4[] = []
  const pineCol: THREE.Color[] = []
  const oakCol: THREE.Color[] = []
  const tmp = new THREE.Object3D()
  const step = 8.5 * Math.max(1, Math.sqrt(world.size / 2400))
  const clearOf = (x: number, z: number) => {
    for (const c of world.def.castles) if (Math.hypot(x - c.x, z - c.z) < castleRadius(c.tier) * 1.25) return false
    if (world.def.walls && world.onWall(x, z, 30)) return false
    const k = world.featureKindAt(x, z)
    return !world.bridgeAt(x, z, 30) && !world.fordAt(x, z, 25) && k !== 'stones' && k !== 'wadi' && k !== 'crag'
  }
  for (let z = -world.half + 20; z < world.half - 20; z += step) {
    for (let x = -world.half + 20; x < world.half - 20; x += step) {
      const px = x + (rnd() - 0.5) * step * 0.9
      const pz = z + (rnd() - 0.5) * step * 0.9
      const h = world.heightAt(px, pz)
      if (h < 3.5) continue
      const f = world.forestAt(px, pz)
      const slope = world.slopeAt(px, pz)
      const r = rnd()
      const lone = f < 0.05 && r < 0.006 && slope < 0.5
      if ((f > 0.05 && r < f * 0.82) || lone) {
        if (!clearOf(px, pz)) continue
        const s = 0.75 + rnd() * 0.6
        tmp.position.set(px, h - 0.4, pz)
        tmp.rotation.set((rnd() - 0.5) * 0.08, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.08)
        tmp.scale.set(s, s * (0.9 + rnd() * 0.25), s)
        tmp.updateMatrix()
        // Each tree takes the look of the climate it grows in.
        const B = world.climateAt(px, pz)
        const pine = rnd() < B.pines || (h > 55 && rnd() < 0.8)
        const tint = new THREE.Color().setHSL(B.treeHue + (rnd() - 0.5) * 0.06, 0.5, B.treeLight + rnd() * 0.18)
        const tc = new THREE.Color(1, 1, 1).lerp(tint, 0.35)
        if (B.treeFrost > 0) tc.lerp(new THREE.Color(1.6, 1.65, 1.75), B.treeFrost * (0.6 + rnd() * 0.4))
        // Canopy override: autumn colours broadleaves only, scorched woods char every tree.
        if (B.canopy && (!pine || B.deadPines)) {
          const m = B.canopy[Math.floor(rnd() * B.canopy.length)]
          tc.setRGB(m[0], m[1], m[2])
        }
        if (pine) {
          pines.push(tmp.matrix.clone())
          pineCol.push(tc)
        } else {
          oaks.push(tmp.matrix.clone())
          oakCol.push(tc)
        }
        continue
      }
      if ((slope > 0.45 || h > 85) && r < 0.06 + slope * 0.05) {
        const s = 0.6 + rnd() * 1.6
        tmp.position.set(px, h - 0.5, pz)
        tmp.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3)
        tmp.scale.set(s, s, s)
        tmp.updateMatrix()
        rocks.push(tmp.matrix.clone())
        continue
      }
      if (f < 0.05 && h < 60 && r < 0.02 && clearOf(px, pz)) {
        const s = 0.6 + rnd() * 0.8
        tmp.position.set(px, h - 0.2, pz)
        tmp.rotation.set(0, rnd() * 6, 0)
        tmp.scale.set(s, s, s)
        tmp.updateMatrix()
        bushes.push(tmp.matrix.clone())
      }
    }
  }
  const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), '', true)
  const add = (geo: THREE.BufferGeometry, list: THREE.Matrix4[], cols: THREE.Color[] | null, shadow: boolean) => {
    if (list.length === 0) return
    const m = new THREE.InstancedMesh(geo, mat, list.length)
    list.forEach((mx, i) => {
      m.setMatrixAt(i, mx)
      if (cols) m.setColorAt(i, cols[i])
    })
    m.castShadow = shadow
    m.receiveShadow = true
    m.computeBoundingSphere()
    group.add(m)
  }
  add(pineGeometry(), pines, pineCol, true)
  add(oakGeometry(), oaks, oakCol, true)
  add(rockGeometry(), rocks, null, true)
  add(bushGeometry(), bushes, null, false)
  return group
}

const bridgeMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }))

/** An engineers' timber bridge: plank deck on trestles, rope rails. */
export function bridgeMesh(b: BridgeInfo): THREE.Mesh {
  const L = b.length
  const W = b.width
  const parts: THREE.BufferGeometry[] = [
    part(box(L, 1.6, W), 0x8a6844, { y: 0 }),
    part(box(L, 0.6, 0.6), 0x6e5234, { y: 3.4, z: W / 2 - 0.5 }),
    part(box(L, 0.6, 0.6), 0x6e5234, { y: 3.4, z: -W / 2 + 0.5 }),
  ]
  // Plank seams.
  for (let x = -L / 2 + 4; x < L / 2; x += 6) parts.push(part(box(0.5, 1.7, W - 2), 0x6f5335, { x, y: 0.05 }))
  // Timber trestles in the river and rail posts.
  for (let x = -L / 2 + 12; x <= L / 2 - 12; x += Math.max(18, (L - 24) / 4)) {
    for (const zz of [-1, 1]) parts.push(part(cyl(0.9, 1.1, 16, 6), 0x5c4429, { x, y: -7.5, z: zz * (W / 2 - 3), rx: zz * 0.12 }))
    parts.push(part(box(1.2, 1.2, W), 0x5c4429, { x, y: -1.4 }))
  }
  for (let x = -L / 2 + 2; x <= L / 2 - 2; x += 10) for (const zz of [-1, 1]) parts.push(part(cyl(0.35, 0.4, 4, 5), 0x5c4429, { x, y: 2, z: zz * (W / 2 - 0.5) }))
  const mesh = new THREE.Mesh(merge(parts), bridgeMat)
  mesh.position.set(b.x, BRIDGE_DECK - 0.8, b.z)
  mesh.rotation.y = -Math.atan2(b.dirZ, b.dirX)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Fords: stepping stones and pale broken water across the shallows. */
export function buildFords(world: World): THREE.Group {
  const group = new THREE.Group()
  const stone = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }))
  const foam = new THREE.MeshBasicMaterial({ color: 0xe8f0f2, transparent: true, opacity: 0.28, depthWrite: false })
  let seed = 1
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (const f of world.fords) {
    seed = Math.abs(Math.round(f.x * 13 + f.z * 7)) + 1
    const parts: THREE.BufferGeometry[] = []
    const L = f.length * 0.82
    // A broad band of pebbles and stepping stones breaking the surface.
    for (let k = 0; k < 110; k++) {
      const along = (rnd() - 0.5) * L
      const across = (rnd() - 0.5) * (f.width + 34)
      const s = 1.2 + rnd() * 2.6
      parts.push(part(cyl(s, s * 1.2, 1.2, 6), rnd() < 0.5 ? 0x9a958a : 0x80796e, { x: along, y: 0.1 + rnd() * 0.3, z: across, ry: rnd() * 3 }))
    }
    const mesh = new THREE.Mesh(merge(parts), stone)
    mesh.position.set(f.x, WATER_LEVEL, f.z)
    mesh.rotation.y = -Math.atan2(f.dirZ, f.dirX)
    mesh.receiveShadow = true
    group.add(mesh)
    // Small soft ripples where the water breaks over the stones.
    const rip: THREE.BufferGeometry[] = []
    for (let k = 0; k < 34; k++) {
      const along = (rnd() - 0.5) * L
      const across = (rnd() - 0.5) * (f.width + 20)
      rip.push(part(new THREE.CircleGeometry(2.5 + rnd() * 3, 10), 0xffffff, { x: along, z: across, rx: -Math.PI / 2, sx: 1.8 }))
    }
    const ripples = new THREE.Mesh(merge(rip), foam)
    ripples.position.set(f.x, WATER_LEVEL + 0.3, f.z)
    ripples.rotation.y = -Math.atan2(f.dirZ, f.dirX)
    ripples.renderOrder = 3
    group.add(ripples)
  }
  return group
}

type BridgeStyle = 'arch' | 'covered' | 'megalith' | 'sandstone' | 'basalt'
/** The map's own bridges take the style of the land they stand in. */
function bridgeStyle(key: string): BridgeStyle {
  if (key === 'taiga' || key === 'autumn') return 'covered'
  if (key === 'alpine' || key === 'icefield') return 'megalith'
  if (key === 'desert' || key === 'mesa') return 'sandstone'
  if (key === 'volcanic' || key === 'wasteland' || key === 'steam' || key === 'marsh') return 'basalt'
  return 'arch'
}

/** Permanent bridges: stone arches, covered timber, granite, sandstone or basalt, by climate. */
export function buildStoneBridges(world: World): THREE.Group {
  const group = new THREE.Group()
  const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), '', true)
  for (const b of world.stoneBridges) {
    const style = bridgeStyle(world.climateAt(b.x, b.z).key)
    const L = b.length
    const W = b.width + 4
    const p: THREE.BufferGeometry[] = []
    const piers = Math.max(2, Math.round(L / 34))
    const span = L / piers
    if (style === 'arch' || style === 'sandstone' || style === 'basalt') {
      const stone = style === 'arch' ? 0x9a948a : style === 'sandstone' ? 0xc8a06a : 0x3a3634
      const dark = style === 'arch' ? 0x7f796f : style === 'sandstone' ? 0xa47a4a : 0x26232a
      // Deck and parapets.
      p.push(part(box(L + 8, 2.6, W), stone, { y: -0.4 }))
      for (const s of [-1, 1]) {
        const segs = style === 'basalt' ? 7 : 1
        for (let k = 0; k < segs; k++) {
          // The basalt causeway's parapet is broken in places, old war damage.
          if (style === 'basalt' && (k === 2 || k === 5)) continue
          const sl = (L + 8) / segs
          p.push(part(box(sl - (segs > 1 ? 1 : 0), 3, 1.6), dark, { x: -L / 2 - 4 + sl * (k + 0.5), y: 2.4, z: s * (W / 2 - 0.8) }))
        }
      }
      // Piers with cutwaters, and the arches between them.
      for (let k = 1; k < piers; k++) {
        const x = -L / 2 + k * span
        p.push(part(box(6, 16, W + 2), dark, { x, y: -9 }))
        p.push(part(cyl(0.1, W / 2 + 2, 6, 4), dark, { x, y: -9, z: 0, rx: Math.PI / 2, ry: Math.PI / 4, sy: 1 }))
      }
      for (let k = 0; k < piers; k++) {
        const x = -L / 2 + (k + 0.5) * span
        // Arch rings on both faces, springing from the piers up to the deck.
        const ar = span * 0.4
        for (const sz of [-1, 1]) p.push(part(new THREE.TorusGeometry(ar, 1.8, 5, 12, Math.PI), dark, { x, y: -1.8 - ar, z: sz * (W / 2 + 0.2) }))
      }
      if (style === 'sandstone') {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(part(box(2.6, 9, 2.6), dark, { x: sx * (L / 2 + 2), y: 4, z: sz * (W / 2) }))
      }
    } else if (style === 'covered') {
      // Timber trestles, a plank deck, walls with windows and a gable roof.
      p.push(part(box(L + 6, 1.8, W), 0x7a5a38, { y: 0 }))
      for (let k = 1; k < piers; k++) for (const s of [-1, 1]) p.push(part(cyl(1, 1.2, 16, 6), 0x5a3f24, { x: -L / 2 + k * span, y: -8, z: s * (W / 2 - 3) }))
      for (const s of [-1, 1]) {
        for (let x = -L / 2; x < L / 2; x += 12) p.push(part(box(8, 5, 1), 0x6e5032, { x: x + 4, y: 3.4, z: s * (W / 2 - 0.5) }))
        p.push(part(box(L + 6, 1, 1), 0x5a3f24, { y: 7, z: s * (W / 2 - 0.5) }))
      }
      p.push(part(cyl(W * 0.62, W * 0.62, L + 8, 3), 0x5e3b2a, { y: 10.5, rz: Math.PI / 2, rx: Math.PI / 2, sy: 1 }))
    } else {
      // Megalith: great rough granite blocks, snow on the parapets.
      p.push(part(box(L + 10, 3.2, W + 2), 0x8a8f96, { y: -0.6 }))
      for (let x = -L / 2; x < L / 2; x += 9) {
        for (const s of [-1, 1]) {
          p.push(part(box(8, 4 + ((x * 7) % 3), 2.6), 0x7a7f86, { x: x + 4, y: 2.6, z: s * (W / 2 + 0.2), ry: ((x * 13) % 5) * 0.03 }))
          p.push(part(box(8.4, 0.8, 3), 0xeef2f6, { x: x + 4, y: 5, z: s * (W / 2 + 0.2) }))
        }
      }
      for (let k = 1; k < piers; k++) p.push(part(box(10, 18, W + 6), 0x6e737a, { x: -L / 2 + k * span, y: -10 }))
    }
    const mesh = new THREE.Mesh(merge(p), mat)
    mesh.position.set(b.x, BRIDGE_DECK - 0.8, b.z)
    mesh.rotation.y = -Math.atan2(b.dirZ, b.dirX)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
  return group
}

/**
 * Terrain features: rings of standing stones,
 * terraced slopes, windfall thickets, dry wadis and crag overlooks.
 * Built in world space as one merged mesh.
 */
export function buildFeatures(world: World): THREE.Group {
  const group = new THREE.Group()
  const feats = world.def.features ?? []
  if (!feats.length) return group
  const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }), '', true)
  const parts: THREE.BufferGeometry[] = []
  const rnd = mulberry32(world.def.castles.length * 977 + feats.length)
  const y = (x: number, z: number) => world.heightAt(x, z)
  for (const f of feats) {
    const ca = Math.cos(f.angle ?? 0)
    const sa = Math.sin(f.angle ?? 0)
    switch (f.kind) {
      case 'stones': {
        // A low mound crowned with a ring of tall mossy stones.
        const h0 = y(f.x, f.z)
        parts.push(part(cyl(f.r * 0.85, f.r, 3, 18), 0x6f7a4a, { x: f.x, y: h0 + 0.8, z: f.z }))
        const n = 11
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2
          const x = f.x + Math.cos(a) * f.r * 0.62
          const z = f.z + Math.sin(a) * f.r * 0.62
          const h = 9 + rnd() * 7
          if (i === 4) parts.push(part(box(4, 3, 10), 0x8a8a80, { x, y: h0 + 4, z, ry: a }))
          else parts.push(part(box(4 + rnd() * 1.5, h, 3), rnd() < 0.5 ? 0x8a8a80 : 0x7d8274, { x, y: h0 + 2.5 + h / 2, z, ry: -a + Math.PI / 2, rz: (rnd() - 0.5) * 0.12 }))
        }
        parts.push(part(box(10, 2.5, 6), 0x8a8a80, { x: f.x, y: h0 + 3.6, z: f.z, ry: rnd() * 3 }))
        break
      }
      case 'terraces': {
        // Rows of dry-stone walls across the slope, vines between them.
        const e = 6
        const gx = world.heightAt(f.x + e, f.z) - world.heightAt(f.x - e, f.z)
        const gz = world.heightAt(f.x, f.z + e) - world.heightAt(f.x, f.z - e)
        const g = Math.hypot(gx, gz) || 1
        const ux = gx / g
        const uz = gz / g
        for (let row = -3; row <= 3; row++) {
          const along = row * 26
          const cx = f.x + ux * along
          const cz = f.z + uz * along
          const span = f.r * 1.6 * Math.sqrt(1 - (row / 4) ** 2)
          for (let t = -span / 2; t < span / 2; t += 10) {
            const x = cx - uz * t
            const z = cz + ux * t
            parts.push(part(box(10.5, 3.2, 2.4), 0xa49a84, { x, y: y(x, z) + 1.2, z, ry: -Math.atan2(ux, -uz) }))
            if ((Math.round(t / 10) + row) % 2 === 0) {
              const vx = x + ux * 9
              const vz = z + uz * 9
              parts.push(part(sphere(2.2), 0x5f7d33, { x: vx, y: y(vx, vz) + 2.4, z: vz, sy: 0.8 }))
            }
          }
        }
        break
      }
      case 'thicket': {
        // Great trunks blown down every which way, roots in the air.
        for (let i = 0; i < 26; i++) {
          const a = rnd() * Math.PI * 2
          const r = rnd() * f.r * 0.85
          const x = f.x + Math.cos(a) * r
          const z = f.z + Math.sin(a) * r
          const L = 18 + rnd() * 16
          const ry = rnd() * Math.PI
          parts.push(part(cyl(1.3, 1.8, L, 6), rnd() < 0.5 ? 0x5a4029 : 0x4a3520, { x, y: y(x, z) + 1.8, z, rz: Math.PI / 2 - 0.1, ry }))
          parts.push(part(sphere(3.2), 0x4a3a28, { x: x + Math.cos(ry) * L * 0.5, y: y(x, z) + 3, z: z - Math.sin(ry) * L * 0.5, sy: 1.2 }))
        }
        for (let i = 0; i < 8; i++) {
          const a = rnd() * Math.PI * 2
          const r = rnd() * f.r * 0.8
          const x = f.x + Math.cos(a) * r
          const z = f.z + Math.sin(a) * r
          parts.push(part(cyl(1.4, 1.8, 6, 6), 0x5a4029, { x, y: y(x, z) + 3, z }))
        }
        break
      }
      case 'wadi': {
        // A pale dry streambed with darker cut banks and boulders.
        const L = f.len ?? 400
        for (let t = -L / 2; t < L / 2; t += 16) {
          const w = f.r * (1.4 + Math.sin(t * 0.03) * 0.25)
          const x = f.x + ca * t + -sa * Math.sin(t * 0.02) * 10
          const z = f.z + sa * t + ca * Math.sin(t * 0.02) * 10
          parts.push(part(box(17, 0.7, w), 0xc9b78e, { x, y: y(x, z) + 0.25, z, ry: -(f.angle ?? 0) }))
          for (const s of [-1, 1]) {
            const bx = x - sa * s * (w / 2 + 2)
            const bz = z + ca * s * (w / 2 + 2)
            parts.push(part(box(17, 4, 4), 0x8c6a48, { x: bx, y: y(bx, bz) + 1.4, z: bz, ry: -(f.angle ?? 0), rx: s * 0.4 }))
          }
          if (rnd() < 0.4) parts.push(part(new THREE.DodecahedronGeometry(2 + rnd() * 2, 0), 0x9a8a72, { x, y: y(x, z) + 1.5, z }))
        }
        break
      }
      case 'crag': {
        // A lone rock pinnacle with a winding path and a beacon brazier on top.
        const h0 = y(f.x, f.z)
        const tiers = 5
        for (let i = 0; i < tiers; i++) {
          const r = f.r * (1 - i * 0.16)
          parts.push(part(new THREE.DodecahedronGeometry(r, 0), i % 2 ? 0x8a8378 : 0x7a7368, { x: f.x + (rnd() - 0.5) * 4, y: h0 + 8 + i * 13, z: f.z + (rnd() - 0.5) * 4, sy: 0.55, ry: rnd() * 3 }))
        }
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2.4
          const r = f.r * (1.05 - i * 0.06)
          parts.push(part(box(5, 1, 3), 0xa89878, { x: f.x + Math.cos(a) * r, y: h0 + 4 + i * 6, z: f.z + Math.sin(a) * r, ry: -a }))
        }
        parts.push(part(cyl(2.2, 1.6, 3, 8), 0x3a3027, { x: f.x, y: h0 + 8 + tiers * 13, z: f.z }))
        parts.push(part(cone(1.6, 3, 6), 0xffa040, { x: f.x, y: h0 + 11 + tiers * 13, z: f.z }))
        break
      }
    }
  }
  const mesh = new THREE.Mesh(merge(parts), mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  return group
}

/** Engineers' bridges standing at load time (more are added as they are built). */
export function buildBridges(world: World): THREE.Group {
  const group = new THREE.Group()
  for (const b of world.bridges) group.add(bridgeMesh(b))
  return group
}


/** Siege mode: concentric curtain walls with crenellations, leaving openings for the gatehouses. */
export function buildWalls(world: World): THREE.Group {
  const group = new THREE.Group()
  const walls = world.def.walls ?? []
  if (walls.length === 0) return group
  const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }))
  for (const w of walls) {
    const parts: THREE.BufferGeometry[] = []
    const circumference = Math.PI * 2 * w.r
    const segLen = 26
    const n = Math.round(circumference / segLen)
    const gateHalf = 62 / w.r
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      if (w.gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < gateHalf)) continue
      const x = w.x + Math.cos(a) * w.r
      const z = w.z + Math.sin(a) * w.r
      const base = world.heightAt(x, z) - 2
      const h = w.height
      const ry = -a + Math.PI / 2
      parts.push(part(box(segLen + 1, h + 2, 8), 0xa9a294, { x, y: base + (h + 2) / 2, z, ry }))
      // Crenellations along the top.
      for (const off of [-9, 0, 9]) {
        const ox = -Math.sin(a) * off
        const oz = Math.cos(a) * off
        parts.push(part(box(4, 3, 9), 0x8d877b, { x: x + ox, y: base + h + 3.5, z: z + oz, ry }))
      }
      // A round tower every few segments.
      if (i % 7 === 0) {
        parts.push(part(cyl(7, 8, h + 10, 8), 0xb1aa9c, { x, y: base + (h + 10) / 2, z }))
        parts.push(part(cone(8.5, 8, 8), 0x6b4a35, { x, y: base + h + 14, z }))
      }
    }
    const mesh = new THREE.Mesh(merge(parts), mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
  return group
}

/** Siege mode: a dense town of timber-and-plaster houses along radial streets. */
export function buildTown(world: World): THREE.Group {
  const group = new THREE.Group()
  const town = world.def.town
  if (!town) return group
  const rnd = mulberry32(991)
  const roofs = [0x9a4a32, 0x6e4a3a, 0x5f5a55]
  const variants: THREE.BufferGeometry[] = []
  for (const roof of roofs) {
    variants.push(merge([part(box(7, 6, 9), 0xe8dcc0, { y: 3 }), part(cyl(5.2, 5.2, 9.6, 3), roof, { y: 7.6, rx: Math.PI / 2, rz: Math.PI / 2 }), part(box(7.2, 0.8, 9.2), 0x5a3d22, { y: 4.2 })]))
    variants.push(merge([part(box(8, 9, 8), 0xd9c9a8, { y: 4.5 }), part(cone(6.6, 6, 4), roof, { y: 12, ry: Math.PI / 4 }), part(box(8.2, 0.8, 8.2), 0x5a3d22, { y: 5 })]))
    variants.push(merge([part(box(6, 5, 12), 0xcfc2a6, { y: 2.5 }), part(cyl(4.6, 4.6, 12.6, 3), roof, { y: 6.4, rx: Math.PI / 2, rz: Math.PI / 2 })]))
  }
  const mats = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 })
  applyVision(mats, '', true)
  const lists: { m: THREE.Matrix4; c: THREE.Color }[][] = variants.map(() => [])
  const tmp = new THREE.Object3D()
  const near = (x: number, z: number) => {
    for (const c of world.def.castles) if (Math.hypot(x - c.x, z - c.z) < castleRadius(c.tier) + 22) return true
    return false
  }
  for (let r = town.inner + 16; r < town.r - 14; r += 15) {
    const ring = Math.abs(r - (town.inner + town.r) / 2) < 20
    if (ring) continue
    const step = 15 / r
    for (let a = 0; a < Math.PI * 2; a += step) {
      if (rnd() < 0.12) continue // small yards and gaps
      const rr = r + (rnd() - 0.5) * 4
      const x = town.x + Math.cos(a) * rr
      const z = town.z + Math.sin(a) * rr
      if (town.streets.some((s) => Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s))) * rr < 22)) continue
      if (near(x, z) || world.onWall(x, z, 18)) continue
      const v = Math.floor(rnd() * variants.length)
      const s = 0.8 + rnd() * 0.45
      tmp.position.set(x, world.heightAt(x, z) - 0.3, z)
      tmp.rotation.set(0, -a + (rnd() < 0.5 ? 0 : Math.PI / 2), 0)
      tmp.scale.set(s, 0.85 + rnd() * 0.5, s)
      tmp.updateMatrix()
      const shade = 0.85 + rnd() * 0.2
      lists[v].push({ m: tmp.matrix.clone(), c: new THREE.Color(shade, shade, shade) })
    }
  }
  variants.forEach((geo, i) => {
    const list = lists[i]
    if (!list.length) return
    const mesh = new THREE.InstancedMesh(geo, mats, list.length)
    list.forEach((h, k) => {
      mesh.setMatrixAt(k, h.m)
      mesh.setColorAt(k, h.c)
    })
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.computeBoundingSphere()
    group.add(mesh)
  })
  return group
}
