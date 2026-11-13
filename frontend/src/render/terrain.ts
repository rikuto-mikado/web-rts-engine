import * as THREE from 'three'
import { mulberry32, Simplex } from '../game/noise'
import { BRIDGE_DECK, WATER_LEVEL, castleRadius, distToSegment, type BridgeInfo, type World } from '../game/world'
import { box, cone, cyl, merge, part, sphere } from './geo'
import { applyVision } from './vision'
import { inWoods } from './woods'

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
  // Smooth shading (the painted ground breaks steep rock into facets and adds the micro-relief itself).
  const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: false, roughness: 0.95, metalness: 0 }), '', true, true)
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
      roughness: 0.1,
      metalness: 0.15,
      transparent: true,
      opacity: 0.85,
    }),
    // The water reads its depth from the ground map: clear and pale over the shallows and fords,
    // dark in the deeps; ripples drift with the current, glints catch the light, and foam breaks
    // along the banks and over the stones of the fords.
    `{
      vec2 wp = vVisWorld.xz;
      bool inMap = vVisUv.x > 0.0 && vVisUv.x < 1.0 && vVisUv.y > 0.0 && vVisUv.y < 1.0;
      float hW = inMap ? texture2D(uGround, vVisUv).b * 20.0 - 10.0 : -10.0;
      float depth = clamp(-hW / 7.0, 0.0, 1.0);
      float n1 = texture2D(uPaint, wp * 0.012 + vec2(uTime * 0.012, uTime * 0.007)).g;
      float n2 = texture2D(uPaint, wp * 0.023 - vec2(uTime * 0.009, -uTime * 0.013)).g;
      float n3 = texture2D(uPaint, wp * 0.06 + vec2(-uTime * 0.02, uTime * 0.015)).b;
      float rip = n1 + n2 - 1.0;
      vec3 c = gl_FragColor.rgb;
      vec3 shallow = c * vec3(1.15, 1.32, 1.22) + vec3(0.06, 0.09, 0.06);
      vec3 deep = c * vec3(0.62, 0.74, 0.92);
      c = mix(shallow, deep, smoothstep(0.05, 0.75, depth));
      // Ripple bands and sun glints.
      c *= 1.0 + rip * 0.16;
      float glint = smoothstep(0.22, 0.34, rip + (n3 - 0.5) * 0.25);
      c += vec3(0.16, 0.18, 0.19) * glint * (0.55 + 0.45 * sin(uTime * 2.3 + wp.x * 0.21 + wp.y * 0.17));
      // Foam at the banks and over the shallows of the fords, breaking and re-forming.
      float edge = 1.0 - smoothstep(0.0, 0.24, depth);
      float churn = smoothstep(0.42, 0.7, n3 + 0.3 * sin(uTime * 1.6 + depth * 38.0 + n1 * 6.0));
      float foam = edge * churn;
      c = mix(c, vec3(0.93, 0.96, 0.97), foam * 0.8);
      gl_FragColor.rgb = c;
      gl_FragColor.a = mix(0.5, 0.92, smoothstep(0.0, 0.45, depth)) + foam * 0.3;
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

/** A pine: a flared root, a tapering trunk, tiers of drooping boughs set a little askew, a spire. */
function pineGeometry() {
  return merge([
    part(cone(1.4, 1.3, 5), 0x4a3320, { y: 0.55 }),
    part(cyl(0.32, 0.7, 6.5, 5), 0x5b4027, { y: 3.2 }),
    part(cone(4.8, 4.8, 7), 0x2a5530, { y: 5.6, rz: 0.04 }),
    part(cone(4.0, 4.4, 7), 0x2f5d34, { x: 0.25, y: 8.0, rx: -0.05, ry: 0.4 }),
    part(cone(3.1, 4.0, 7), 0x356b3a, { x: -0.2, y: 10.3, z: 0.15, rz: -0.06, ry: 0.9 }),
    part(cone(2.1, 3.6, 6), 0x3c7641, { y: 12.5, rx: 0.05, ry: 1.4 }),
    part(cone(0.6, 2.0, 5), 0x447c45, { y: 14.6 }),
  ])
}

/** A broadleaf: a gnarled trunk on a root flare, two boughs reaching out, an irregular crown of leafy clumps. */
function oakGeometry() {
  return merge([
    part(cone(1.6, 1.5, 6), 0x4e3824, { y: 0.6 }),
    part(cyl(0.6, 1.0, 5.4, 6), 0x60442a, { y: 2.7, rz: 0.06 }),
    part(cyl(0.18, 0.4, 3.8, 4), 0x5a4028, { x: 1.4, y: 5.6, rz: -0.8 }),
    part(cyl(0.16, 0.36, 3.4, 4), 0x5a4028, { x: -1.3, y: 5.9, z: -0.4, rz: 0.75, rx: -0.2 }),
    part(sphere(3.6, 0), 0x46712f, { y: 6.8, sy: 0.7 }),
    part(sphere(3.8, 0), 0x4c7a35, { x: 0.4, y: 9.0, z: 0.3, sy: 0.85 }),
    part(sphere(2.9, 0), 0x5a8a3c, { x: 2.9, y: 8.4, z: 1.0, sy: 0.8 }),
    part(sphere(2.7, 0), 0x46712f, { x: -2.7, y: 8.1, z: -1.2, sy: 0.82 }),
    part(sphere(2.4, 0), 0x5f8f40, { x: -0.6, y: 11.0, z: -0.8, sy: 0.85 }),
    part(sphere(2.1, 0), 0x52823a, { x: 1.4, y: 10.6, z: -1.8, sy: 0.8 }),
  ])
}

/** A rock outcrop: a big block, a smaller one leaning on it, a flat slab like a stratum, a cap of moss. */
function rockGeometry() {
  return merge([
    part(new THREE.DodecahedronGeometry(3, 0), 0x8b867d, { sy: 0.7 }),
    part(new THREE.DodecahedronGeometry(1.9, 0), 0x7d786f, { x: 2.4, y: 0.4, z: 0.8, sy: 0.75, ry: 0.6 }),
    part(cyl(2.6, 2.9, 0.7, 6), 0x9a958b, { x: -0.6, y: 1.6, z: -0.3, rz: 0.12, ry: 0.3 }),
    part(sphere(1.7, 0), 0x5f7a3a, { x: -0.5, y: 2.1, z: -0.2, sy: 0.32 }),
    part(sphere(0.9, 0), 0x6a8a40, { x: 2.2, y: 1.6, z: 0.9, sy: 0.35 }),
  ])
}

/** A bush: a few leafy clumps, a fern frond or two. */
function bushGeometry() {
  return merge([
    part(sphere(2, 0), 0x47702f, { y: 1, sy: 0.7 }),
    part(sphere(1.4, 0), 0x557f36, { x: 1.4, y: 0.9, sy: 0.7 }),
    part(sphere(1.1, 0), 0x3f6a2a, { x: -1.2, y: 0.8, z: 0.8, sy: 0.75 }),
    part(cone(0.4, 2.2, 3), 0x5a8a3a, { x: 0.6, y: 1.6, z: -1.4, rx: -0.7 }),
    part(cone(0.4, 2.0, 3), 0x5a8a3a, { x: -0.9, y: 1.4, z: -1.2, rx: -0.6, rz: 0.5 }),
  ])
}

/** A patch of the meadow: tufts of tall grass, heather and a few flowers on stalks. */
function floraGeometry() {
  const p: THREE.BufferGeometry[] = []
  for (let i = 0; i < 6; i++) {
    const a = i * 1.7
    const r = 0.6 + (i % 3) * 0.7
    p.push(part(cone(0.22, 1.6 + (i % 2) * 0.6, 3), i % 2 ? 0x6a8f3c : 0x5a7f34, { x: Math.cos(a) * r, y: 0.8, z: Math.sin(a) * r, rz: Math.cos(a) * 0.3, rx: Math.sin(a) * 0.3 }))
  }
  const heads = [0xf2d34a, 0xe8e4f0, 0xc86aa8, 0x8a7ad8, 0xe8803a]
  for (let i = 0; i < 5; i++) {
    const a = i * 2.3 + 0.4
    const r = 0.4 + (i % 3) * 0.8
    p.push(part(box(0.08, 1.6, 0.08), 0x557a30, { x: Math.cos(a) * r, y: 0.8, z: Math.sin(a) * r }))
    p.push(part(sphere(0.22, 0), heads[i], { x: Math.cos(a) * r, y: 1.7, z: Math.sin(a) * r }))
  }
  p.push(part(sphere(0.9, 0), 0x6a5a5a, { x: -1.4, y: 0.35, z: 1.0, sy: 0.5 }))
  return merge(p)
}

export function buildVegetation(world: World): THREE.Group {
  const rnd = mulberry32(4242)
  const group = new THREE.Group()
  const pines: THREE.Matrix4[] = []
  const oaks: THREE.Matrix4[] = []
  const rocks: THREE.Matrix4[] = []
  const bushes: THREE.Matrix4[] = []
  const flora: THREE.Matrix4[] = []
  const pineCol: THREE.Color[] = []
  const oakCol: THREE.Color[] = []
  const tmp = new THREE.Object3D()
  const step = 8.5 * Math.max(1, Math.sqrt(world.size / 2400))
  const clearOf = (x: number, z: number) => {
    // (A castle's town, suburbs and farmland are cleared land.)
    for (const c of world.def.castles) if (Math.hypot(x - c.x, z - c.z) < castleRadius(c.tier) * (c.village || !world.walls.has(c.id) ? 1.25 : 2.15)) return false
    if (world.def.walls && world.onWall(x, z, 30)) return false
    const k = world.featureKindAt(x, z)
    // (The great woods grow their own trees: see woods.ts. The ordinary ones only fill their fringe.)
    return !world.bridgeAt(x, z, 30) && !world.fordAt(x, z, 25) && k !== 'stones' && k !== 'crag' && !inWoods(world, x, z)
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
        continue
      }
      // Wildflowers, tall grass and heather across the open meadows (not on roads, banks or rock).
      if (f < 0.2 && h > 5 && h < 70 && slope < 0.35 && r < 0.05 && world.climateAt(px, pz).treeFrost <= 0 && !world.onRoad(px, pz, 4) && clearOf(px, pz)) {
        const s = 1.2 + rnd() * 1.2
        tmp.position.set(px, h - 0.1, pz)
        tmp.rotation.set(0, rnd() * 6, 0)
        tmp.scale.set(s, s * (0.8 + rnd() * 0.4), s)
        tmp.updateMatrix()
        flora.push(tmp.matrix.clone())
      }
    }
  }
  const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), '', true)
  const add = (geo: THREE.BufferGeometry, list: THREE.Matrix4[], cols: THREE.Color[] | null, shadow: boolean) => {
    for (const m of chunkInstances(geo, mat, list, cols, shadow)) group.add(m)
  }
  add(pineGeometry(), pines, pineCol, true)
  add(oakGeometry(), oaks, oakCol, true)
  add(rockGeometry(), rocks, null, true)
  add(bushGeometry(), bushes, null, false)
  add(floraGeometry(), flora, null, false)
  return group
}

/** Side of the squares the trees are drawn in (each its own instanced mesh). */
export const TREE_CHUNK = 700

/**
 * Instances in squares of the map, one mesh each: a square off screen or outside the sun's shadow
 * frustum is culled whole (also from the shadow pass), and `shadowCaster` marks the ones whose
 * shadows `updateTreeShadows` turns on and off by distance.
 */
export function chunkInstances(geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], cols: THREE.Color[] | null, shadow: boolean, side = TREE_CHUNK): THREE.InstancedMesh[] {
  const buckets = new Map<string, number[]>()
  const p = new THREE.Vector3()
  list.forEach((mx, i) => {
    p.setFromMatrixPosition(mx)
    const key = `${Math.floor(p.x / side)},${Math.floor(p.z / side)}`
    const b = buckets.get(key)
    if (b) b.push(i)
    else buckets.set(key, [i])
  })
  const out: THREE.InstancedMesh[] = []
  for (const [key, idx] of buckets) {
    const m = new THREE.InstancedMesh(geo, mat, idx.length)
    idx.forEach((i, j) => {
      m.setMatrixAt(j, list[i])
      if (cols) m.setColorAt(j, cols[i])
    })
    m.castShadow = shadow
    m.receiveShadow = true
    m.computeBoundingSphere()
    const [ix, iz] = key.split(',').map(Number)
    m.userData.chunk = { x: (ix + 0.5) * side, z: (iz + 0.5) * side, shadow }
    out.push(m)
  }
  return out
}

/** Trees cast shadows only within `reach` of the camera's target (the shadow map's own extent). */
export function updateTreeShadows(group: THREE.Object3D, x: number, z: number, reach: number) {
  for (const o of group.children) {
    const c = o.userData.chunk as { x: number; z: number; shadow: boolean } | undefined
    if (!c || !c.shadow) continue
    o.castShadow = Math.abs(c.x - x) < reach + TREE_CHUNK * 0.5 && Math.abs(c.z - z) < reach + TREE_CHUNK * 0.5
  }
}

/**
 * Hide the trees, bushes and rocks that would grow through buildings: villages
 * and other holdings, mines and lumber camps, and outposts (which come and go,
 * so this is re-run when they change; cleared trees grow back when they go).
 */
export function clearVegetation(group: THREE.Group, circles: { x: number; z: number; r: number }[]) {
  for (const o of group.children) {
    const m = o as THREE.InstancedMesh
    if (!m.isInstancedMesh) continue
    const arr = m.instanceMatrix.array as Float32Array
    let orig = m.userData.orig as Float32Array | undefined
    if (!orig) orig = m.userData.orig = Float32Array.from(arr)
    for (let i = 0; i < m.count; i++) {
      const b = i * 16
      const x = orig[b + 12]
      const z = orig[b + 14]
      let hide = false
      for (const c of circles) {
        const dx = x - c.x
        const dz = z - c.z
        if (dx * dx + dz * dz < c.r * c.r) {
          hide = true
          break
        }
      }
      if (hide) for (let k = 0; k < 16; k++) arr[b + k] = k === 15 ? 1 : 0
      else for (let k = 0; k < 16; k++) arr[b + k] = orig[b + k]
    }
    m.instanceMatrix.needsUpdate = true
  }
}

const bridgeMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }))

/**
 * An engineers' timber bridge: a deck of planks (each a little different) on stringers, A-frame
 * trestles braced crosswise standing in the river, a post-and-rail parapet, lanterns at the ends.
 */
export function bridgeMesh(b: BridgeInfo): THREE.Mesh {
  const L = b.length
  const W = b.width
  const p: THREE.BufferGeometry[] = []
  const T = 0x5c4429
  const T2 = 0x6e5234
  // Stringers under the deck, then the planks laid across them.
  for (const z of [-W / 2 + 2, 0, W / 2 - 2]) p.push(part(box(L, 1.0, 1.0), T, { y: -1.0, z }))
  let k = 0
  for (let x = -L / 2 + 1; x < L / 2; x += 2.05, k++) {
    const shade = [0x8a6844, 0x96744c, 0x7e5e3c, 0x8e6c46][k % 4]
    p.push(part(box(1.9, 0.7, W - (k % 3 === 0 ? 0.6 : 0)), shade, { x, y: 0, z: (k % 2) * 0.3 - 0.15, ry: ((k * 7) % 5 - 2) * 0.006 }))
  }
  // A-frame trestles: two raked legs, a cap beam, a cross brace, a sill at the waterline.
  const bays = Math.max(2, Math.round((L - 24) / 18))
  for (let i = 0; i <= bays; i++) {
    const x = -L / 2 + 12 + ((L - 24) * i) / bays
    for (const zz of [-1, 1]) {
      p.push(part(cyl(0.7, 0.9, 15, 6), T, { x, y: -8.2, z: zz * (W / 2 - 1.8), rx: zz * 0.16 }))
      p.push(part(cyl(0.6, 0.8, 14, 6), T, { x: x + 1.6, y: -8, z: zz * (W / 2 - 4.5), rx: zz * 0.06 }))
    }
    p.push(part(box(1.4, 1.2, W + 1.6), T, { x, y: -1.9 }))
    p.push(part(box(0.5, 0.5, W * 1.15), T2, { x, y: -7, rx: 0.62 }))
    p.push(part(box(0.5, 0.5, W * 1.15), T2, { x, y: -7, rx: -0.62 }))
    p.push(part(box(1.2, 1.0, W + 3), 0x4a3820, { x, y: -13.5 }))
  }
  // The parapet: posts with a top rail and a mid rail of rope.
  for (let x = -L / 2 + 1; x <= L / 2 - 1; x += 6)
    for (const zz of [-1, 1]) {
      p.push(part(cyl(0.3, 0.38, 4.2, 5), T, { x, y: 2.1, z: zz * (W / 2 - 0.4) }))
      p.push(part(sphere(0.4, 0), T2, { x, y: 4.3, z: zz * (W / 2 - 0.4) }))
    }
  for (const zz of [-1, 1]) {
    p.push(part(box(L, 0.45, 0.45), T2, { y: 4, z: zz * (W / 2 - 0.4) }))
    p.push(part(box(L, 0.16, 0.16), 0xb8a070, { y: 2.2, z: zz * (W / 2 - 0.4) }))
  }
  // Lantern posts at both ends.
  for (const sx of [-1, 1])
    for (const zz of [-1, 1]) {
      const x = sx * (L / 2 - 0.5)
      const z = zz * (W / 2 - 0.4)
      p.push(part(cyl(0.38, 0.45, 7.5, 5), T, { x, y: 3.75, z }))
      p.push(part(box(1.4, 0.25, 0.25), T, { x: x - sx * 0.6, y: 7.2, z }))
      p.push(part(box(0.75, 1.0, 0.75), 0xf2c060, { x: x - sx * 1.2, y: 6.3, z }))
      p.push(part(cone(0.6, 0.5, 4), 0x2a2622, { x: x - sx * 1.2, y: 7.05, z }))
    }
  const mesh = new THREE.Mesh(merge(p), bridgeMat)
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
    // The crossing marked out: a line of flat stepping stones, tall marker posts with a guide rope
    // at either bank, and reeds in clumps along the edges of the shallows.
    for (let a = -L / 2; a <= L / 2; a += 5.5) parts.push(part(cyl(1.7, 1.9, 1.0, 7), 0xa8a294, { x: a, y: 0.55, z: (rnd() - 0.5) * 1.5, ry: rnd() * 3 }))
    for (const end of [-1, 1])
      for (const side of [-1, 1]) {
        const x = end * (L / 2 + 4)
        const z = side * (f.width / 2 + 2)
        parts.push(part(cyl(0.4, 0.5, 9, 5), 0x5c4429, { x, y: 3.5, z }))
        parts.push(part(box(1.4, 0.9, 0.18), 0xd8c070, { x, y: 7.2, z }))
      }
    for (const side of [-1, 1]) parts.push(part(box(L + 8, 0.14, 0.14), 0xb8a070, { y: 5.4, z: side * (f.width / 2 + 2) }))
    for (let k = 0; k < 16; k++) {
      const along = (rnd() - 0.5) * L * 1.1
      const across = (rnd() < 0.5 ? -1 : 1) * (f.width / 2 + 10 + rnd() * 10)
      for (let j = 0; j < 5; j++) parts.push(part(cyl(0.08, 0.14, 4 + rnd() * 3, 3), j % 2 ? 0x7a8a40 : 0x8a9a48, { x: along + (rnd() - 0.5) * 2, y: 2, z: across + (rnd() - 0.5) * 2, rz: (rnd() - 0.5) * 0.4, rx: (rnd() - 0.5) * 0.4 }))
      parts.push(part(box(0.3, 1.0, 0.3), 0x5a3a20, { x: along, y: 4.4, z: across }))
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
      const light = style === 'arch' ? 0xb0aa9e : style === 'sandstone' ? 0xdcb880 : 0x4a4644
      // The deck: a cobbled roadway between kerbs.
      p.push(part(box(L + 8, 2.6, W), stone, { y: -0.4 }))
      for (let x = -L / 2 - 2; x < L / 2 + 2; x += 3.2)
        for (let z = -W / 2 + 3; z < W / 2 - 2.5; z += 3.2) p.push(part(box(2.8, 0.3, 2.8), ((x * 3 + z * 7) | 0) % 3 === 0 ? light : stone, { x: x + ((z * 5) % 2 ? 1.6 : 0), y: 0.95, z }))
      for (const s of [-1, 1]) p.push(part(box(L + 8, 0.8, 1.4), dark, { y: 1.0, z: s * (W / 2 - 2.3) }))
      // Parapets: a coped wall (crenellated on the stone arch, broken in places on the basalt causeway).
      for (const s of [-1, 1]) {
        const segs = style === 'basalt' ? 7 : 1
        for (let k = 0; k < segs; k++) {
          if (style === 'basalt' && (k === 2 || k === 5)) continue
          const sl = (L + 8) / segs
          const cx = -L / 2 - 4 + sl * (k + 0.5)
          p.push(part(box(sl - (segs > 1 ? 1 : 0), 3, 1.6), dark, { x: cx, y: 2.4, z: s * (W / 2 - 0.8) }))
          p.push(part(box(sl - (segs > 1 ? 1 : 0), 0.5, 2.0), light, { x: cx, y: 4.1, z: s * (W / 2 - 0.8) }))
        }
        if (style === 'arch') for (let x = -L / 2 - 2; x <= L / 2 + 2; x += 5) p.push(part(box(2.4, 1.8, 1.8), dark, { x, y: 5.2, z: s * (W / 2 - 0.8) }))
      }
      // Piers with pointed cutwaters upstream and down, and a string course at their heads.
      for (let k = 1; k < piers; k++) {
        const x = -L / 2 + k * span
        p.push(part(box(6, 16, W + 2), dark, { x, y: -9 }))
        for (const s of [-1, 1]) p.push(part(box(4.4, 16, 4.4), dark, { x, y: -9, z: s * (W / 2 + 1), ry: Math.PI / 4 }))
        for (const s of [-1, 1]) p.push(part(cone(3.2, 3, 4), light, { x, y: -0.4, z: s * (W / 2 + 1), ry: Math.PI / 4 }))
        p.push(part(box(7, 0.8, W + 3), light, { x, y: -1.6 }))
      }
      // The arches: a ring of wedge-shaped voussoirs on each face, alternating light and dark, with
      // a keystone; the spandrels filled in solid above them.
      for (let k = 0; k < piers; k++) {
        const x = -L / 2 + (k + 0.5) * span
        const ar = span * 0.4
        const cy = -1.8 - ar
        for (const sz of [-1, 1]) {
          const n = 13
          for (let i = 0; i <= n; i++) {
            const a = (i / n) * Math.PI
            p.push(part(box(1.5, 2.6, 1.6), i === Math.round(n / 2) ? light : i % 2 ? dark : stone, { x: x + Math.cos(a) * ar, y: cy + Math.sin(a) * ar, z: sz * (W / 2 + 0.25), rz: a - Math.PI / 2 }))
          }
          for (const side of [-1, 1]) p.push(part(box(span * 0.22, ar * 0.7, 1.2), stone, { x: x + side * ar * 0.82, y: -1.8 - ar * 0.32, z: sz * (W / 2) }))
        }
      }
      if (style === 'sandstone') {
        // Gate pillars topped with little domes at both ends.
        for (const sx of [-1, 1])
          for (const sz of [-1, 1]) {
            p.push(part(box(2.6, 9, 2.6), dark, { x: sx * (L / 2 + 2), y: 4, z: sz * (W / 2) }))
            p.push(part(sphere(1.6, 0), light, { x: sx * (L / 2 + 2), y: 9.2, z: sz * (W / 2), sy: 0.8 }))
          }
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
      // Shingle courses along the roof, a ridge beam, and a portal frame at each end.
      for (let i = 1; i <= 3; i++) for (const s of [-1, 1]) p.push(part(box(L + 8.4, 0.3, 0.8), 0x4e3020, { y: 13.6 - i * 1.7, z: s * (i * 2.2), rx: s * 0.75 }))
      p.push(part(box(L + 9, 0.8, 0.8), 0x3e2618, { y: 10.5 + W * 0.31 }))
      for (const sx of [-1, 1]) {
        for (const s of [-1, 1]) p.push(part(box(1.2, 8, 1.2), 0x4a3020, { x: sx * (L / 2 + 3), y: 4, z: s * (W / 2 - 0.5) }))
        p.push(part(box(1.2, 1.2, W), 0x4a3020, { x: sx * (L / 2 + 3), y: 7.8 }))
      }
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
 * windfall thickets and crag overlooks (the great woods are in woods.ts).
 * Built in world space as one merged mesh.
 */
export function buildFeatures(world: World): THREE.Group {
  const group = new THREE.Group()
  const feats = world.def.features ?? []
  if (!feats.length) return group
  const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }), '', true)
  // Fire and embers glow whatever the light (the crag's beacon).
  const glowMat = applyVision(new THREE.MeshBasicMaterial({ vertexColors: true }))
  const parts: THREE.BufferGeometry[] = []
  const glow: THREE.BufferGeometry[] = []
  const rnd = mulberry32(world.def.castles.length * 977 + feats.length)
  const y = (x: number, z: number) => world.heightAt(x, z)
  const STONE = 0x8a8a80
  const MOSS = 0x5f7a3a
  const TIMBER = 0x6a4a2c
  for (const f of feats) {
    switch (f.kind) {
      case 'stones': {
        // An ancient sanctuary on a low mound: a ring of weathered, mossy uprights, three great
        // trilithons with carved lintels, a stone altar at the heart, cairns about the rim.
        const h0 = y(f.x, f.z)
        parts.push(part(cyl(f.r * 0.85, f.r, 3, 20), 0x6f7a4a, { x: f.x, y: h0 + 0.8, z: f.z }))
        parts.push(part(cyl(f.r * 0.5, f.r * 0.55, 0.4, 16), 0x8a8a6a, { x: f.x, y: h0 + 2.4, z: f.z }))
        const n = 12
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2
          const x = f.x + Math.cos(a) * f.r * 0.64
          const z = f.z + Math.sin(a) * f.r * 0.64
          const h = 9 + rnd() * 6
          const ry = -a + Math.PI / 2
          if (i === 4) {
            // A fallen stone, half sunk in the turf.
            parts.push(part(box(4.4, 3, 11), STONE, { x, y: h0 + 3.6, z, ry: a, rz: 0.15 }))
            parts.push(part(box(4.6, 0.6, 6), MOSS, { x, y: h0 + 5.2, z, ry: a }))
            continue
          }
          const w = 4 + rnd() * 1.4
          const tilt = (rnd() - 0.5) * 0.14
          parts.push(part(box(w, h, 3), rnd() < 0.5 ? STONE : 0x7d8274, { x, y: h0 + 2.5 + h / 2, z, ry, rz: tilt }))
          // Weathering: a rounded, mossy top and a lichen-pale patch.
          parts.push(part(box(w * 0.9, 0.9, 2.8), MOSS, { x, y: h0 + 2.5 + h + 0.2, z, ry, rz: tilt }))
          parts.push(part(box(w * 0.5, h * 0.3, 3.1), 0xa8aa90, { x, y: h0 + 2.5 + h * 0.4, z, ry, rz: tilt }))
          // Every fourth pair carries a lintel: a trilithon.
          if (i % 4 === 1) {
            const a2 = ((i + 1) / n) * Math.PI * 2
            const mx = f.x + Math.cos((a + a2) / 2) * f.r * 0.64
            const mz = f.z + Math.sin((a + a2) / 2) * f.r * 0.64
            const span = Math.hypot(Math.cos(a2) - Math.cos(a), Math.sin(a2) - Math.sin(a)) * f.r * 0.64 + 5
            parts.push(part(box(span, 2.4, 3.4), 0x9a9a8e, { x: mx, y: h0 + 2.5 + h + 1.4, z: mz, ry: -(a + a2) / 2 + Math.PI / 2 }))
            parts.push(part(box(span * 0.6, 0.5, 3.5), 0x6e6e64, { x: mx, y: h0 + 2.5 + h + 1.4, z: mz, ry: -(a + a2) / 2 + Math.PI / 2 }))
          }
        }
        // The altar: a slab on two stones, an offering bowl.
        parts.push(part(box(3, 2.4, 3), 0x7d8274, { x: f.x - 3, y: h0 + 3.6, z: f.z }))
        parts.push(part(box(3, 2.4, 3), 0x7d8274, { x: f.x + 3, y: h0 + 3.6, z: f.z }))
        parts.push(part(box(10, 1.4, 5), 0x9a9a8e, { x: f.x, y: h0 + 5.5, z: f.z }))
        parts.push(part(cyl(1.0, 0.6, 0.8, 8), 0x6a5a40, { x: f.x, y: h0 + 6.6, z: f.z }))
        // Cairns of piled stones about the rim.
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + 0.3
          const x = f.x + Math.cos(a) * f.r * 0.9
          const z = f.z + Math.sin(a) * f.r * 0.9
          const g = y(x, z)
          for (let k = 0; k < 4; k++) parts.push(part(new THREE.DodecahedronGeometry(1.6 - k * 0.3, 0), k === 3 ? MOSS : 0x8a8478, { x: x + (rnd() - 0.5), y: g + 1 + k * 1.2, z: z + (rnd() - 0.5), sy: 0.7 }))
        }
        break
      }
      case 'thicket': {
        // Windfall: great trunks blown down every which way, their roots torn up in a disc of earth,
        // splintered stumps, bramble clumps and a hollow log or two.
        for (let i = 0; i < 24; i++) {
          const a = rnd() * Math.PI * 2
          const r = rnd() * f.r * 0.85
          const x = f.x + Math.cos(a) * r
          const z = f.z + Math.sin(a) * r
          const L = 18 + rnd() * 16
          const ry = rnd() * Math.PI
          const g = y(x, z)
          parts.push(part(cyl(1.0, 1.7, L, 6), rnd() < 0.5 ? 0x5a4029 : 0x4a3520, { x, y: g + 1.6, z, rz: Math.PI / 2 - 0.08, ry }))
          // The root plate: a disc of earth standing on edge, roots poking out of it.
          const ex = x + Math.cos(ry) * L * 0.5
          const ez = z - Math.sin(ry) * L * 0.5
          parts.push(part(new THREE.DodecahedronGeometry(3.4, 0), 0x4a3a28, { x: ex, y: g + 2.6, z: ez, sx: 0.7, ry, rz: rnd() }))
          for (let k = 0; k < 4; k++) parts.push(part(cone(0.35, 3, 4), 0x5a4029, { x: ex + Math.cos(ry) * 0.8, y: g + 3 + (k - 1.5) * 1.6, z: ez - Math.sin(ry) * 0.8 + (k % 2 ? 1.2 : -1.2), rz: -Math.PI / 2 + (k - 1.5) * 0.4, ry }))
          // Dead branches along the trunk.
          if (i % 2 === 0) parts.push(part(cyl(0.18, 0.35, 5, 4), 0x5a4029, { x: x - Math.cos(ry) * L * 0.2, y: g + 3.4, z: z + Math.sin(ry) * L * 0.2, rz: 0.6, ry }))
        }
        for (let i = 0; i < 8; i++) {
          // Splintered stumps.
          const a = rnd() * Math.PI * 2
          const r = rnd() * f.r * 0.8
          const x = f.x + Math.cos(a) * r
          const z = f.z + Math.sin(a) * r
          parts.push(part(cyl(1.4, 1.9, 5, 6), 0x5a4029, { x, y: y(x, z) + 2.5, z }))
          for (let k = 0; k < 3; k++) parts.push(part(cone(0.5, 2.2, 3), 0x8a6a48, { x: x + Math.cos(k * 2.1) * 0.7, y: y(x, z) + 5.6, z: z + Math.sin(k * 2.1) * 0.7 }))
        }
        for (let i = 0; i < 14; i++) {
          // Brambles.
          const a = rnd() * Math.PI * 2
          const r = rnd() * f.r * 0.95
          const x = f.x + Math.cos(a) * r
          const z = f.z + Math.sin(a) * r
          parts.push(part(sphere(2.2, 0), i % 2 ? 0x3f5a2a : 0x4a5a2a, { x, y: y(x, z) + 1.2, z, sy: 0.6 }))
          parts.push(part(sphere(0.4, 0), 0x5a1a3a, { x: x + 1, y: y(x, z) + 2, z }))
        }
        for (let i = 0; i < 3; i++) {
          // A hollow log: a ring of bark with a dark mouth.
          const a = rnd() * Math.PI * 2
          const x = f.x + Math.cos(a) * f.r * 0.5
          const z = f.z + Math.sin(a) * f.r * 0.5
          const ry = rnd() * 3
          parts.push(part(new THREE.TorusGeometry(1.8, 0.7, 5, 8), 0x5a4029, { x, y: y(x, z) + 1.9, z, ry }))
          parts.push(part(cyl(1.7, 1.9, 9, 8), 0x4e3824, { x: x + Math.sin(ry) * 4.5, y: y(x, z) + 1.9, z: z + Math.cos(ry) * 4.5, rx: Math.PI / 2, ry }))
          parts.push(part(cyl(1.15, 1.15, 0.3, 8), 0x1a120c, { x, y: y(x, z) + 1.9, z, rx: Math.PI / 2, ry }))
        }
        break
      }
      case 'crag': {
        // A layered rock spire: bands of stone narrowing upward, ledges with moss, a timber stair
        // winding round it on posts, a railed platform at the top with an iron beacon of glowing embers.
        const h0 = y(f.x, f.z)
        const tiers = 6
        for (let i = 0; i < tiers; i++) {
          const r = f.r * (1.05 - i * 0.14)
          const yy = h0 + 6 + i * 11
          parts.push(part(new THREE.DodecahedronGeometry(r, 0), i % 2 ? 0x8a8378 : 0x7a7368, { x: f.x + (rnd() - 0.5) * 4, y: yy, z: f.z + (rnd() - 0.5) * 4, sy: 0.5, ry: rnd() * 3 }))
          // Ledges jutting out at odd angles, the strata showing.
          for (let k = 0; k < 3; k++) {
            const a = rnd() * Math.PI * 2
            parts.push(part(new THREE.DodecahedronGeometry(r * (0.35 + rnd() * 0.2), 0), k % 2 ? 0x9a9286 : 0x6e675e, { x: f.x + Math.cos(a) * r * 0.7, y: yy + (rnd() - 0.3) * r * 0.4, z: f.z + Math.sin(a) * r * 0.7, sy: 0.4, ry: rnd() * 3, rz: (rnd() - 0.5) * 0.4 }))
          }
          if (i % 2 === 0) parts.push(part(sphere(r * 0.45, 0), MOSS, { x: f.x + r * 0.5, y: yy + r * 0.38, z: f.z - r * 0.3, sy: 0.25 }))
        }
        const top = h0 + 6 + (tiers - 1) * 11 + f.r * 0.25
        // The stair: treads on posts, spiralling up, with a hand rail.
        const steps = 22
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2.6
          const t = i / steps
          const r = f.r * (1.15 - t * 0.7)
          const sx = f.x + Math.cos(a) * r
          const sz = f.z + Math.sin(a) * r
          const sy = h0 + 3 + t * (top - h0 - 3)
          parts.push(part(box(5, 0.6, 2.4), 0xa07a50, { x: sx, y: sy, z: sz, ry: -a }))
          parts.push(part(cyl(0.22, 0.26, 3.2, 4), TIMBER, { x: sx + Math.cos(a) * 2.3, y: sy - 1.4, z: sz + Math.sin(a) * 2.3 }))
          if (i % 2 === 0) parts.push(part(cyl(0.12, 0.12, 2.6, 4), TIMBER, { x: sx + Math.cos(a) * 2.4, y: sy + 1.3, z: sz + Math.sin(a) * 2.4 }))
        }
        // The platform and its rail.
        parts.push(part(cyl(6, 6, 0.8, 10), 0x8a6844, { x: f.x, y: top + 0.4, z: f.z }))
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2
          parts.push(part(cyl(0.18, 0.18, 2.6, 4), TIMBER, { x: f.x + Math.cos(a) * 5.7, y: top + 1.7, z: f.z + Math.sin(a) * 5.7 }))
        }
        parts.push(part(new THREE.TorusGeometry(5.7, 0.16, 3, 20), TIMBER, { x: f.x, y: top + 3, z: f.z, rx: Math.PI / 2 }))
        // The beacon: an iron basket on three legs, glowing coals and flames.
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2
          parts.push(part(cyl(0.2, 0.25, 4.4, 4), 0x2a2622, { x: f.x + Math.cos(a) * 1.4, y: top + 2.6, z: f.z + Math.sin(a) * 1.4, rz: Math.cos(a) * -0.25, rx: Math.sin(a) * 0.25 }))
        }
        parts.push(part(cyl(2.2, 1.4, 1.6, 8), 0x2a2622, { x: f.x, y: top + 5, z: f.z }))
        for (let i = 0; i < 8; i++) parts.push(part(box(0.2, 1.8, 0.2), 0x2a2622, { x: f.x + Math.cos(i * 0.785) * 2.1, y: top + 6.2, z: f.z + Math.sin(i * 0.785) * 2.1 }))
        glow.push(part(sphere(1.7, 0), 0xff6a1a, { x: f.x, y: top + 5.9, z: f.z, sy: 0.5 }))
        glow.push(part(cone(1.4, 3.2, 6), 0xffa040, { x: f.x, y: top + 7.6, z: f.z }))
        glow.push(part(cone(0.8, 2.2, 5), 0xffe080, { x: f.x + 0.3, y: top + 7.4, z: f.z - 0.2 }))
        break
      }
    }
  }
  const mesh = new THREE.Mesh(merge(parts), mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  if (glow.length) group.add(new THREE.Mesh(merge(glow), glowMat))
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
  const flames: THREE.BufferGeometry[] = []
  for (const w of walls) {
    const parts: THREE.BufferGeometry[] = []
    const segLen = 26
    // Stations along the wall: (x, z) and the direction the wall runs there. A ring wall goes round
    // its circle; an outline wall follows its corners. None in a gateway.
    const stations: { x: number; z: number; tx: number; tz: number; len: number }[] = []
    if (w.points) {
      const loop = world.wallLoop(w)
      for (let k = 0; k < loop.length - 1; k++) {
        const [ax, az] = loop[k]
        const [bx, bz] = loop[k + 1]
        const L = Math.hypot(bx - ax, bz - az)
        const n = Math.max(1, Math.round(L / segLen))
        for (let i = 0; i < n; i++) {
          const x = ax + ((bx - ax) * (i + 0.5)) / n
          const z = az + ((bz - az) * (i + 0.5)) / n
          if ((w.gatePts ?? []).some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 62)) continue
          stations.push({ x, z, tx: (bx - ax) / L, tz: (bz - az) / L, len: L / n })
        }
      }
    } else {
      const n = Math.round((Math.PI * 2 * w.r) / segLen)
      const gateHalf = 62 / w.r
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        if (w.gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < gateHalf)) continue
        stations.push({ x: w.x + Math.cos(a) * w.r, z: w.z + Math.sin(a) * w.r, tx: -Math.sin(a), tz: Math.cos(a), len: segLen })
      }
    }
    for (let i = 0; i < stations.length; i++) {
      const { x, z, tx, tz, len } = stations[i]
      const base = world.heightAt(x, z) - 2
      const h = w.height
      const ry = -Math.atan2(tz, tx)
      parts.push(part(box(len + 1.5, h + 2, 8), 0xa9a294, { x, y: base + (h + 2) / 2, z, ry }))
      // Crenellations along the top.
      for (const off of [-9, 0, 9]) {
        const ox = tx * off * (len / segLen)
        const oz = tz * off * (len / segLen)
        parts.push(part(box(4, 3, 9), 0x8d877b, { x: x + ox, y: base + h + 3.5, z: z + oz, ry }))
      }
      // A round tower every few segments.
      if (i % 7 === 0) {
        parts.push(part(cyl(7, 8, h + 10, 8), 0xb1aa9c, { x, y: base + (h + 10) / 2, z }))
        parts.push(part(cone(8.5, 8, 8), 0x6b4a35, { x, y: base + h + 14, z }))
      }
      // Braziers burn along the walk between the towers.
      if (i % 7 === 3) {
        parts.push(part(cyl(1.2, 0.8, 1.2, 6), 0x3a3936, { x, y: base + h + 2.6, z }))
        flames.push(part(cone(1.1, 2.4, 6), 0xff8a3a, { x, y: base + h + 4.2, z }))
      }
    }
    const mesh = new THREE.Mesh(merge(parts), mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
  if (flames.length) group.add(new THREE.Mesh(merge(flames), new THREE.MeshBasicMaterial({ color: 0xffa04a })))
  return group
}

/** Siege mode: a dense town of timber-and-plaster houses along radial streets. */
export function buildTown(world: World, mobile = false): THREE.Group {
  const group = new THREE.Group()
  const town = world.def.town
  if (!town) return group
  const rnd = mulberry32(991)
  const roofs = [0x9a4a32, 0x6e4a3a, 0x5f5a55, 0x7a3a2a, 0x4f5560]
  const walls = [0xe8dcc0, 0xd9c9a8, 0xcfc2a6, 0xe3d2b0, 0xbfb29a]
  // Houses of many kinds (merged once, then drawn by the thousand as instances).
  const variants: THREE.BufferGeometry[] = []
  roofs.forEach((roof, i) => {
    const wc = walls[i]
    // Cottage, gabled.
    variants.push(merge([part(box(7, 6, 9), wc, { y: 3 }), part(cyl(5.2, 5.2, 9.6, 3), roof, { y: 7.6, rx: Math.PI / 2, rz: Math.PI / 2 }), part(box(7.2, 0.8, 9.2), 0x5a3d22, { y: 4.2 })]))
    // Square house, pyramid roof.
    variants.push(merge([part(box(8, 9, 8), wc, { y: 4.5 }), part(cone(6.6, 6, 4), roof, { y: 12, ry: Math.PI / 4 }), part(box(8.2, 0.8, 8.2), 0x5a3d22, { y: 5 })]))
    // Tall town house, steep gable, a jettied upper floor.
    variants.push(merge([part(box(6, 7, 8), wc, { y: 3.5 }), part(box(6.8, 6, 8.6), walls[(i + 2) % 5], { y: 10 }), part(cyl(4.6, 4.6, 9, 3), roof, { y: 15, rx: Math.PI / 2, rz: Math.PI / 2, sy: 1.25 }), part(box(1, 4, 1), 0x6a5a4a, { x: 2, y: 18, z: 2.5 })]))
  })
  // A row of three houses under one long roof.
  variants.push(merge([part(box(6, 6, 22), walls[1], { y: 3 }), part(cyl(4.6, 4.6, 22.6, 3), roofs[0], { y: 7.2, rx: Math.PI / 2, rz: Math.PI / 2 }), part(box(6.2, 0.6, 0.6), 0x5a3d22, { y: 6, z: -3.6 }), part(box(6.2, 0.6, 0.6), 0x5a3d22, { y: 6, z: 3.6 })]))
  const houses = variants.length
  // Parish churches and their bell towers, scattered through the city.
  variants.push(
    merge([
      part(box(10, 11, 22), 0xbdb5a5, { y: 5.5 }),
      part(cyl(7.4, 7.4, 22.6, 3), 0x5f6670, { y: 13.8, rx: Math.PI / 2, rz: Math.PI / 2 }),
      part(box(7, 22, 7), 0xa49c8c, { y: 11, z: -13 }),
      part(cone(5.4, 12, 4), 0x565c66, { y: 28, z: -13, ry: Math.PI / 4 }),
      part(box(4, 6, 0.3), 0x23201c, { y: 4, z: -16.6 }),
    ]),
  )
  // A tower house of the old families.
  variants.push(merge([part(box(8, 26, 8), 0xa49c8c, { y: 13 }), part(box(9, 1.2, 9), 0x847c6f, { y: 26.4 }), part(cone(6.8, 8, 4), 0x7a3a2a, { y: 31, ry: Math.PI / 4 })]))
  const church = houses
  const towerHouse = houses + 1
  const mats = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 })
  applyVision(mats, '', true)
  const lists: { m: THREE.Matrix4; c: THREE.Color }[][] = variants.map(() => [])
  const tmp = new THREE.Object3D()
  const near = (x: number, z: number) => {
    for (const c of world.def.castles) if (Math.hypot(x - c.x, z - c.z) < castleRadius(c.tier) * (c.gate ? 0.9 : 1) + 24) return true
    return false
  }
  // Ring roads and the streets from the gates keep their line; small squares here and there.
  const ringRoads = (world.def.walls ?? []).map((w) => w.r).flatMap((r) => [r - 46, r + 46])
  const squares: [number, number][] = []
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2
    const r = town.inner + 60 + rnd() * (town.r - town.inner - 120)
    squares.push([town.x + Math.cos(a) * r, town.z + Math.sin(a) * r])
  }
  const STEP = mobile ? 17 : 13.5
  const place = (x: number, z: number, face: number) => {
    const roll = rnd()
    const v = roll < 0.012 ? church : roll < 0.022 ? towerHouse : Math.floor(rnd() * houses)
    const s = v >= houses ? 1 : 0.82 + rnd() * 0.4
    tmp.position.set(x, world.heightAt(x, z) - 0.3, z)
    tmp.rotation.set(0, -face + (v === church ? 0 : rnd() < 0.7 ? 0 : Math.PI / 2), 0)
    tmp.scale.set(s, v >= houses ? 1 : 0.85 + rnd() * 0.45, s)
    tmp.updateMatrix()
    const shade = 0.82 + rnd() * 0.24
    lists[v].push({ m: tmp.matrix.clone(), c: new THREE.Color(shade, shade * (0.97 + rnd() * 0.05), shade * (0.94 + rnd() * 0.06)) })
  }
  if (town.poly) {
    // A city inside an outline wall: blocks of houses on a slightly skewed grid, streets from the gates
    // to the Citadel left open, a lane inside every wall, small squares here and there.
    const outer = (world.def.walls ?? []).find((w) => w.points && Math.abs(w.r - town.r) < 30) ?? (world.def.walls ?? [])[1]
    const skew = rnd() * Math.PI
    const [cs, sn] = [Math.cos(skew), Math.sin(skew)]
    for (let i = -town.r; i <= town.r; i += STEP)
      for (let j = -town.r; j <= town.r; j += STEP) {
        if (rnd() < 0.07) continue
        const lx = i + (rnd() - 0.5) * 3
        const lz = j + (rnd() - 0.5) * 3
        // Every few rows a cross street.
        if (Math.abs(Math.round(i / STEP)) % 6 === 0 || Math.abs(Math.round(j / STEP)) % 7 === 0) continue
        const x = town.x + lx * cs - lz * sn
        const z = town.z + lx * sn + lz * cs
        if (outer && !world.insideWall(outer, x, z)) continue
        if (Math.hypot(x - town.x, z - town.z) < town.inner) continue
        if ((town.lanes ?? []).some((l) => distToSegment(x, z, l[0][0], l[0][1], l[1][0], l[1][1]) < 16)) continue
        if (squares.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 26)) continue
        if (near(x, z) || world.onWall(x, z, 24)) continue
        place(x, z, skew)
      }
  }
  for (let r = town.inner + 12; !town.poly && r < town.r - 12; r += STEP) {
    if (ringRoads.some((rr) => Math.abs(r - rr) < 9)) continue
    const step = STEP / r
    for (let a = 0; a < Math.PI * 2; a += step) {
      if (rnd() < 0.07) continue // yards and gaps
      const rr = r + (rnd() - 0.5) * 3
      const x = town.x + Math.cos(a) * rr
      const z = town.z + Math.sin(a) * rr
      if (town.streets.some((st) => Math.abs(Math.atan2(Math.sin(a - st), Math.cos(a - st))) * rr < 20)) continue
      if (squares.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 26)) continue
      if (near(x, z) || world.onWall(x, z, 20)) continue
      const roll = rnd()
      const v = roll < 0.012 ? church : roll < 0.022 ? towerHouse : Math.floor(rnd() * houses)
      const s = v >= houses ? 1 : 0.82 + rnd() * 0.4
      tmp.position.set(x, world.heightAt(x, z) - 0.3, z)
      // Houses face the street (their long side along the ring); churches point east-ish.
      tmp.rotation.set(0, -a + (v === church ? 0 : rnd() < 0.7 ? 0 : Math.PI / 2), 0)
      tmp.scale.set(s, v >= houses ? 1 : 0.85 + rnd() * 0.45, s)
      tmp.updateMatrix()
      const shade = 0.82 + rnd() * 0.24
      lists[v].push({ m: tmp.matrix.clone(), c: new THREE.Color(shade, shade * (0.97 + rnd() * 0.05), shade * (0.94 + rnd() * 0.06)) })
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
