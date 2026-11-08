import * as THREE from 'three'
import { mulberry32, Simplex } from '../game/noise'
import { BRIDGE_DECK, WATER_LEVEL, castleRadius, type World } from '../game/world'
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
  const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }), '', true)
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
    return !world.bridgeAt(x, z, 25)
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
        const B = world.biome
        const pine = rnd() < B.pines || (h > 55 && rnd() < 0.8)
        const tint = new THREE.Color().setHSL(B.treeHue + (rnd() - 0.5) * 0.06, 0.5, B.treeLight + rnd() * 0.18)
        const tc = new THREE.Color(1, 1, 1).lerp(tint, 0.35)
        if (B.treeFrost > 0) tc.lerp(new THREE.Color(1.6, 1.65, 1.75), B.treeFrost * (0.6 + rnd() * 0.4))
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

export function buildBridges(world: World): THREE.Group {
  const group = new THREE.Group()
  const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }))
  for (const b of world.bridges) {
    const L = b.length
    const W = b.width
    const parts: THREE.BufferGeometry[] = [
      part(box(L, 1.6, W), 0x8a6844, { y: 0 }),
      part(box(L, 2.2, 1), 0x6e5234, { y: 1.6, z: W / 2 - 0.5 }),
      part(box(L, 2.2, 1), 0x6e5234, { y: 1.6, z: -W / 2 + 0.5 }),
    ]
    // Plank seams.
    for (let x = -L / 2 + 4; x < L / 2; x += 6) parts.push(part(box(0.5, 1.7, W - 2), 0x6f5335, { x, y: 0.05 }))
    // Stone piers.
    for (let x = -L / 2 + 10; x <= L / 2 - 10; x += (L - 20) / 3) {
      parts.push(part(box(5, 14, W + 2), 0x8f8a80, { x, y: -7.5 }))
    }
    // Abutments.
    parts.push(part(box(10, 10, W + 4), 0x8f8a80, { x: L / 2, y: -4.5 }))
    parts.push(part(box(10, 10, W + 4), 0x8f8a80, { x: -L / 2, y: -4.5 }))
    for (const s of [-1, 1]) {
      for (const zz of [-1, 1]) parts.push(part(cyl(0.6, 0.6, 5, 6), 0x5c4429, { x: s * (L / 2 - 2), y: 2.5, z: zz * (W / 2 - 0.5) }))
    }
    const mesh = new THREE.Mesh(merge(parts), mat)
    mesh.position.set(b.x, BRIDGE_DECK - 0.8, b.z)
    mesh.rotation.y = -Math.atan2(b.dirZ, b.dirX)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
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
