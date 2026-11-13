import * as THREE from 'three'
import { mulberry32 } from '../game/noise'
import type { CityWall, TownDef } from '../game/types'
import { ROYAL_SEAT_TIER, castleRadius, distToSegment, holdingRadius, wardReach, type World } from '../game/world'
import { Frame, PAL, barrel, crate, gable, house, newKit, tree, type HouseOpts, type Kit } from './buildings'
import { bmerge, bpart, box, cone, cyl, groundShade, sphere } from './geo'
import { chapel, buildMat } from './villages'
import { applyVision, visionUniforms } from './vision'
import { buildCityCountry, type CityCountry } from './citycountry'
import { chunkInstances } from './terrain'
import { coursedCone, mottle, sailsGeometry, type FortStyle } from './fortress'

/**
 * The royal city (The Long Night): its great double curtain walls, and the city inside them,
 * its avenues, rings and lanes paved in stone, plazas with fountains and statues, lamps along
 * the avenues, and thousands of houses (from the building kit, drawn as instances) fronting the
 * streets with courtyards and trees behind.
 */

const glowMat = new THREE.MeshBasicMaterial({ color: 0xffa04a })
const lampMat = new THREE.MeshBasicMaterial({ color: 0xffc46a })
const ROYAL_BLUE = 0x2f4f9a

// ---------------------------------------------------------------------------
// The walls
// ---------------------------------------------------------------------------

/** The city's curtain walls: battered plinth, buttresses, loops, corbelled parapets and many-staged towers. */
export function buildCityWalls(world: World): THREE.Group {
  const group = new THREE.Group()
  const walls = world.def.walls ?? []
  if (!walls.length) return group
  const k = newKit()
  const banners: THREE.BufferGeometry[] = []
  walls.forEach((w, wi) => buildWall(world, w, w.outer ?? wi === walls.length - 1, k, banners))
  const mesh = new THREE.Mesh(groundShade(bmerge([...k.walls, ...k.roofs]), 5, 0.3), buildMat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  if (banners.length) {
    const b = new THREE.Mesh(bmerge(banners), buildMat)
    b.castShadow = true
    group.add(b)
  }
  if (k.glow.length) group.add(new THREE.Mesh(bmerge(k.glow), glowMat))
  return group
}

function buildWall(world: World, w: CityWall, outer: boolean, k: Kit, banners: THREE.BufferGeometry[]) {
  const SEG = 24
  const T = outer ? 10 : 11
  const H = w.height
  const stations: { x: number; z: number; tx: number; tz: number; len: number }[] = []
  const gates = w.gatePts ?? w.gates.map((g): [number, number] => [w.x + Math.cos(g) * w.r, w.z + Math.sin(g) * w.r])
  if (w.points) {
    const loop = world.wallLoop(w)
    for (let i = 0; i < loop.length - 1; i++) {
      const [ax, az] = loop[i]
      const [bx, bz] = loop[i + 1]
      const L = Math.hypot(bx - ax, bz - az)
      const n = Math.max(1, Math.round(L / SEG))
      for (let j = 0; j < n; j++) {
        const x = ax + ((bx - ax) * (j + 0.5)) / n
        const z = az + ((bz - az) * (j + 0.5)) / n
        if (gates.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 62)) continue
        stations.push({ x, z, tx: (bx - ax) / L, tz: (bz - az) / L, len: L / n })
      }
    }
  } else {
    const n = Math.round((Math.PI * 2 * w.r) / SEG)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const x = w.x + Math.cos(a) * w.r
      const z = w.z + Math.sin(a) * w.r
      if (gates.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 62)) continue
      stations.push({ x, z, tx: -Math.sin(a), tz: Math.cos(a), len: SEG })
    }
  }
  stations.forEach((st, i) => {
    const { x, z, tx, tz, len } = st
    const hA = world.heightAt(x - tx * len * 0.5, z - tz * len * 0.5)
    const hB = world.heightAt(x + tx * len * 0.5, z + tz * len * 0.5)
    // Which side is outside: away from the city's heart.
    const nx = -tz
    const nz = tx
    const o = nx * (x - w.x) + nz * (z - w.z) >= 0 ? 1 : -1
    const base = Math.min(hA, hB, world.heightAt(x + nx * o * 9, z + nz * o * 9), world.heightAt(x - nx * o * 9, z - nz * o * 9)) - 1.5
    // The wall's top runs level with the higher ground it holds up.
    const f = new Frame(x, z, -Math.atan2(tz, tx), base)
    const L = len + 0.8
    const top = Math.max(hA, hB) - base + H
    const stone = i % 4 === 0 ? 0xa59d8d : i % 4 === 2 ? 0x9a9282 : PAL.stone
    // A battered plinth, stepping out at the foot.
    f.put(k.walls, box(L, 9, T + 7), PAL.stoneD, 0, -2.5, o * 1.5, { ao: 0.15 })
    f.put(k.walls, box(L, 4, T + 4), 0x8f877a, 0, 3.5, o * 0.8, { ao: 0.1 })
    // The curtain, a string course across it.
    f.put(k.walls, box(L, top, T), stone, 0, top / 2, 0, { ao: 0.22, jitter: 0.04 })
    f.put(k.walls, box(L, 0.7, T + 0.8), PAL.stoneL, 0, top * 0.55, 0, { ao: 0 })
    // Arrow loops on the outer face; blind arches on the inner.
    for (const lx of [-L / 4, L / 4]) f.put(k.walls, box(0.6, 3.4, 0.25), PAL.dark, lx, top * 0.62, o * (T / 2 + 0.05), { ao: 0 })
    f.put(k.walls, box(L * 0.62, top * 0.42, 0.5), 0x7d766a, 0, top * 0.24, -o * (T / 2), { ao: 0 })
    f.put(k.walls, cyl(L * 0.31, L * 0.31, 0.6, 10, ), 0x7d766a, 0, top * 0.45, -o * (T / 2), { rx: Math.PI / 2, sy: 1, ao: 0 })
    // Buttresses on the outside, every other length.
    if (i % 2 === 0) {
      f.put(k.walls, box(3.2, top * 0.72, 4.5), PAL.stone, L / 2 - 1, top * 0.36, o * (T / 2 + 2.2), { ao: 0.15 })
      f.put(k.walls, box(3.2, 2.4, 3), PAL.stoneD, L / 2 - 1, top * 0.74, o * (T / 2 + 1.4), { rx: -o * 0.6, ao: 0 })
    }
    // Machicolations: corbels carrying an overhanging parapet.
    for (let t = -L / 2 + 1.2; t < L / 2; t += 2.6) f.put(k.walls, box(0.9, 1.8, 2), PAL.stoneD, t, top - 0.9, o * (T / 2 + 1), { ao: 0 })
    f.put(k.walls, box(L, 1.1, 2.6), PAL.stoneL, 0, top + 0.2, o * (T / 2 + 1.3), { ao: 0 })
    // The wall-walk, the outer parapet and its merlons, a low parapet on the inside.
    f.put(k.walls, box(L, 0.5, T - 1), 0x6f6a60, 0, top + 0.25, 0, { ao: 0 })
    f.put(k.walls, box(L, 2.2, 1.5), stone, 0, top + 1.6, o * (T / 2 + 2), { ao: 0 })
    for (let t = -L / 2 + 1.5; t < L / 2; t += 3.2) f.put(k.walls, box(1.9, 2.2, 1.5), PAL.stoneL, t, top + 3.8, o * (T / 2 + 2), { ao: 0 })
    f.put(k.walls, box(L, 1.3, 1), stone, 0, top + 1.1, -o * (T / 2 - 0.5), { ao: 0 })
    // A great bastion tower every few lengths: square base, corbelled gallery, a round upper
    // stage, a slate spire with a gilded finial, the King's banner and a brazier.
    if (i % 6 === 3) {
      const B = outer ? 22 : 18
      const tb = top + 7
      f.put(k.walls, box(B + 4, 10, B + 4), PAL.stoneD, 0, -2, o * 5, { ao: 0.15 })
      f.put(k.walls, box(B, tb, B), PAL.stone, 0, tb / 2, o * 5, { ao: 0.25, jitter: 0.04 })
      for (const y of [tb * 0.35, tb * 0.7]) for (const s of [-1, 1]) f.put(k.walls, box(0.6, 3, 0.3), PAL.dark, s * B * 0.25, y, o * (5 + B / 2 + 0.05), { ao: 0 })
      for (let a = 0; a < 4; a++) {
        const ang = (a * Math.PI) / 2
        for (let t = -B / 2; t <= B / 2; t += 2.8) {
          const lx = Math.cos(ang) * (B / 2 + 0.8) + -Math.sin(ang) * t
          const lz = o * 5 + Math.sin(ang) * (B / 2 + 0.8) + Math.cos(ang) * t
          f.put(k.walls, box(1.2, 1.6, 1.2), PAL.stoneD, lx, tb - 0.6, lz, { ao: 0 })
          f.put(k.walls, box(1.6, 2.2, 1.6), PAL.stoneL, Math.cos(ang) * (B / 2 + 1.2) + -Math.sin(ang) * t, tb + 2.2, o * 5 + Math.sin(ang) * (B / 2 + 1.2) + Math.cos(ang) * t, { ao: 0 })
        }
      }
      f.put(k.walls, box(B + 3, 1, B + 3), PAL.stoneL, 0, tb + 0.6, o * 5, { ao: 0 })
      f.put(k.walls, cyl(B * 0.36, B * 0.4, 12, 10), 0xb1aa9c, 0, tb + 7, o * 5, { ao: 0.15 })
      for (let a = 0; a < 6; a++) f.put(k.walls, box(0.5, 2.6, 0.3), PAL.dark, Math.cos(a) * B * 0.37, tb + 8, o * 5 + Math.sin(a) * B * 0.37, { ry: -a, ao: 0 })
      f.put(k.roofs, cone(B * 0.46, 16, 10), PAL.slate[i % 3], 0, tb + 21, o * 5, { ao: 0 })
      f.put(k.walls, sphere(0.9, 0), 0xd9b04a, 0, tb + 29.6, o * 5, { ao: 0 })
      f.put(k.walls, cyl(0.15, 0.15, 6, 4), PAL.iron, 0, tb + 32, o * 5, { ao: 0 })
      // The King's banner down the outer face.
      f.put(banners, box(5, 11, 0.3), ROYAL_BLUE, 0, tb - 7, o * (5 + B / 2 + 0.6), { ao: 0 })
      f.put(banners, box(5.2, 0.8, 0.5), 0xd9b04a, 0, tb - 1.4, o * (5 + B / 2 + 0.6), { ao: 0 })
      // Braziers burning at the gallery's corners.
      for (const [sx, sz] of [[-1, -1], [1, 1]]) {
        f.put(k.walls, cyl(0.9, 0.6, 1, 6), PAL.iron, sx * (B / 2 - 1.5), tb + 1.4, o * 5 + sz * (B / 2 - 1.5), { ao: 0 })
        f.put(k.glow, cone(0.9, 2.4, 6), 0xff8a3a, sx * (B / 2 - 1.5), tb + 3, o * 5 + sz * (B / 2 - 1.5))
      }
    } else if (i % 3 === 1) {
      // A brazier on the walk between the towers.
      f.put(k.walls, cyl(0.8, 0.5, 0.9, 6), PAL.iron, 0, top + 1, 0, { ao: 0 })
      f.put(k.glow, cone(0.8, 2.1, 6), 0xff8a3a, 0, top + 2.4, 0)
    }
  })
}

// ---------------------------------------------------------------------------
// The city
// ---------------------------------------------------------------------------

interface Street {
  pts: [number, number][]
  w: number
  kind: 'avenue' | 'ring' | 'lane'
}

/** Distance from the centre to an outline along a bearing (the outline round (cx, cz)). */
export function radiusAt(poly: [number, number][], cx: number, cz: number, a: number): number {
  const dx = Math.cos(a)
  const dz = Math.sin(a)
  let best = 0
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i]
    const [bx, bz] = poly[(i + 1) % poly.length]
    const ex = bx - ax
    const ez = bz - az
    const den = dx * ez - dz * ex
    if (Math.abs(den) < 1e-9) continue
    const t = ((ax - cx) * ez - (az - cz) * ex) / den
    const u = ((ax - cx) * dz - (az - cz) * dx) / den
    if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t)
  }
  return best
}

/**
 * Every walled royal city on the map: the Long Night's one, or the Three Crowns' three, each with
 * its gate towns and farmland outside the walls (in the style of the realm that holds it).
 * `userData.cleared` lists the ground the countryside took (world circles, for clearing the wild
 * trees) and `userData.smoke` its chimneys.
 */
export function buildCity(world: World, mobile = false, styles: FortStyle[] = [], avoid: { x: number; z: number; r: number }[] = []): THREE.Group {
  const group = new THREE.Group()
  const cleared: { x: number; z: number; r: number }[] = []
  const smoke: [number, number, number][] = []
  world.towns.forEach((town, i) => {
    const [innerW, outerW] = world.townWalls(town)
    if (!town.poly || !innerW?.points || !outerW?.points) return
    group.add(buildOneCity(world, town, innerW, outerW, mobile, 4711 + i * 977))
    // Outside the walls: the gate towns and the farmland, clear of the other holdings, the other
    // cities, the terrain features and whatever else must stay open.
    const keep = new Set(world.def.castles.filter((c) => Math.hypot(c.x - town.x, c.z - town.z) < town.r + 20).map((c) => c.id))
    const away = [
      ...avoid,
      ...world.def.castles.filter((c) => !keep.has(c.id)).map((c) => ({ x: c.x, z: c.z, r: holdingRadius(c) * 1.5 + 20 })),
      ...world.towns.filter((t) => t !== town).map((t) => ({ x: t.x, z: t.z, r: t.r + 60 })),
      ...(world.def.features ?? []).map((f) => ({ x: f.x, z: f.z, r: f.r + 25 })),
    ]
    const style = styles[i] ?? 'crown'
    const cc = buildCityCountry(world, town, outerW, (a) => radiusAt(outerW.points!, town.x, town.z, a), style, mulberry32(9137 + i * 131), away, mobile)
    group.add(countryMesh(cc, town.x, town.z, style))
    for (const c of cc.cleared) cleared.push({ x: town.x + c.x, z: town.z + c.z, r: c.r })
    for (const [x, y, z] of cc.smoke) smoke.push([town.x + x, cc.base + y, town.z + z])
  })
  group.userData.cleared = cleared
  group.userData.smoke = smoke
  return group
}

const goldMat = applyVision(new THREE.MeshStandardMaterial({ color: 0xd9b24a, metalness: 0.75, roughness: 0.32, flatShading: true, vertexColors: true }))
const HUE: Record<FortStyle, number> = { crown: ROYAL_BLUE, thorn: 0x8a1e2a, sun: 0xc8902a, free: 0x6a6a72 }

/** The meshes of a city's countryside, placed at its centre; the windmills' sails turn. */
function countryMesh(cc: CityCountry, cx: number, cz: number, style: FortStyle): THREE.Group {
  const g = new THREE.Group()
  g.position.set(cx, cc.base, cz)
  const stone = new THREE.Mesh(groundShade(bmerge(cc.stone), 4, 0.22), buildMat)
  stone.castShadow = true
  stone.receiveShadow = true
  g.add(stone)
  if (cc.flat.length) {
    const fm = new THREE.Mesh(groundShade(bmerge(cc.flat), 2, 0.15), buildMat)
    fm.castShadow = false
    fm.receiveShadow = true
    g.add(fm)
  }
  if (cc.roof.length) {
    const m = new THREE.Mesh(bmerge(cc.roof), applyVision(new THREE.MeshStandardMaterial({ color: HUE[style], flatShading: true, roughness: 0.75, vertexColors: true })))
    m.castShadow = true
    g.add(m)
  }
  if (cc.gold.length) g.add(new THREE.Mesh(bmerge(cc.gold), goldMat))
  if (cc.glow.length) g.add(new THREE.Mesh(bmerge(cc.glow), glowMat))
  for (const m of cc.mills) {
    const hub = new THREE.Group()
    hub.position.set(m.x, m.y, m.z)
    hub.rotation.y = m.ry
    const sail = new THREE.Mesh(sailsGeometry(m.r), buildMat)
    sail.castShadow = true
    sail.onBeforeRender = () => {
      sail.rotation.z = -visionUniforms.uTime.value * 0.6
    }
    hub.add(sail)
    g.add(hub)
  }
  return g
}

function buildOneCity(world: World, town: TownDef, innerW: CityWall, outerW: CityWall, mobile: boolean, seed: number): THREE.Group {
  const group = new THREE.Group()
  const rnd = mulberry32(seed)
  const cx = town.x
  const cz = town.z
  const rIn = (a: number) => radiusAt(innerW.points!, cx, cz, a)
  const rOut = (a: number) => radiusAt(outerW.points!, cx, cz, a)
  const mount = castleRadius(ROYAL_SEAT_TIER)
  const at = (r: number, a: number): [number, number] => [cx + Math.cos(a) * r, cz + Math.sin(a) * r]

  // --- Streets: the avenues from the gates, rings round the city, lanes between. ---
  const streets: Street[] = []
  for (const l of town.lanes ?? []) {
    // The avenues to the heart stop at the ring road round the foot of the Citadel's mount (the
    // revetment and the ramps take it from there).
    let [a0, a1] = [l[0], l[1]]
    const foot = mount * 1.32
    if (Math.hypot(a1[0] - cx, a1[1] - cz) < foot) {
      const d = Math.hypot(a0[0] - cx, a0[1] - cz) || 1
      a1 = [cx + ((a0[0] - cx) / d) * foot, cz + ((a0[1] - cz) / d) * foot]
    }
    streets.push({ pts: [a0, a1], w: 20, kind: 'avenue' })
  }
  const ring = (rf: (a: number) => number, w: number) => {
    const pts: [number, number][] = []
    for (let i = 0; i <= 96; i++) pts.push(at(rf((i / 96) * Math.PI * 2), (i / 96) * Math.PI * 2))
    streets.push({ pts, w, kind: 'ring' })
  }
  ring((a) => rOut(a) - 46, 12)
  ring((a) => (rIn(a) + rOut(a)) / 2 + 8, 14)
  ring((a) => rIn(a) + 42, 12)
  ring((a) => rIn(a) - 40, 12)
  ring(() => mount * 1.32, 16)
  const avenueAngles = (town.lanes ?? []).map((l) => Math.atan2(l[0][1] - cz, l[0][0] - cx))
  const nearAvenue = (a: number) => avenueAngles.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.12)
  for (let a = 0; a < Math.PI * 2; a += 0.27) {
    if (nearAvenue(a)) continue
    const a2 = a + (rnd() - 0.5) * 0.08
    // Lower city lanes wander a little.
    const r0 = rIn(a2) + 42
    const r1 = rOut(a2) - 46
    if (r1 - r0 > 60) streets.push({ pts: [at(r0, a2), at((r0 + r1) / 2, a2 + (rnd() - 0.5) * 0.06), at(r1, a2)], w: 10, kind: 'lane' })
  }
  for (let a = 0.3; a < Math.PI * 2; a += 0.62) {
    if (nearAvenue(a)) continue
    const r0 = mount * 1.32
    const r1 = rIn(a) - 40
    if (r1 - r0 > 50) streets.push({ pts: [at(r0, a), at(r1, a)], w: 10, kind: 'lane' })
  }

  // --- Occupancy grid: streets, plazas and buildings keep their ground. ---
  const CELL = 2
  const ext = town.r + 40
  const N = Math.ceil((ext * 2) / CELL)
  const occ = new Uint8Array(N * N)
  const cell = (x: number, z: number) => {
    const i = Math.floor((x - cx + ext) / CELL)
    const j = Math.floor((z - cz + ext) / CELL)
    return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i
  }
  const mark = (x: number, z: number, r: number, v = 1) => {
    for (let dz = -r; dz <= r; dz += CELL)
      for (let dx = -r; dx <= r; dx += CELL) {
        if (dx * dx + dz * dz > r * r) continue
        const c = cell(x + dx, z + dz)
        if (c >= 0 && occ[c] < v) occ[c] = v
      }
  }
  const free = (x: number, z: number, r: number) => {
    for (let dz = -r; dz <= r; dz += CELL)
      for (let dx = -r; dx <= r; dx += CELL) {
        const c = cell(x + dx, z + dz)
        if (c < 0 || occ[c]) return false
      }
    return true
  }
  /** The cells under a building's turned footprint (as an Object3D's rotation.y turns it). */
  const rectCells = (x: number, z: number, hw: number, hd: number, ry: number, fn: (cx: number, cz: number) => boolean | void) => {
    const c = Math.cos(ry)
    const sn = Math.sin(ry)
    for (let u = -hw; u <= hw + 0.01; u += CELL * 0.9)
      for (let v = -hd; v <= hd + 0.01; v += CELL * 0.9) if (fn(x + u * c + v * sn, z - u * sn + v * c) === false) return false
    return true
  }
  const freeRect = (x: number, z: number, hw: number, hd: number, ry: number) =>
    rectCells(x, z, hw, hd, ry, (px, pz) => {
      const ci = cell(px, pz)
      return ci >= 0 && !occ[ci]
    })
  const markRect = (x: number, z: number, hw: number, hd: number, ry: number) =>
    rectCells(x, z, hw, hd, ry, (px, pz) => {
      const ci = cell(px, pz)
      if (ci >= 0) occ[ci] = 1
    })
  const inCity = (x: number, z: number) => world.insideWall(outerW, x, z) && !world.onWall(x, z, 22)
  for (const s of streets)
    for (let i = 0; i < s.pts.length - 1; i++) {
      const [ax, az] = s.pts[i]
      const [bx, bz] = s.pts[i + 1]
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 3)
      for (let t = 0; t <= n; t++) mark(ax + ((bx - ax) * t) / n, az + ((bz - az) * t) / n, s.w / 2 + 2)
    }
  // Strongholds and their plazas.
  const plazas: { x: number; z: number; r: number }[] = []
  for (const c of world.def.castles) {
    // The Citadel on its mount (Three Crowns has one in each city: keep_a and the like), and the
    // ramps up to its four gates along the axes: no houses on the revetment or the ramps.
    if (c.id === town.keep || (c.capital && Math.hypot(c.x - cx, c.z - cz) < 60)) {
      mark(c.x, c.z, mount * 1.3)
      for (let q = 0; q < 4; q++) for (let r = mount; r < mount * 1.62; r += 6) mark(c.x + Math.cos((q * Math.PI) / 2) * r, c.z + Math.sin((q * Math.PI) / 2) * r, 24)
    }
    else if (c.district) {
      // (Exactly the ground the ward builds on: wardReach, as the map laid it out by.)
      const r = wardReach(c.id)
      plazas.push({ x: c.x, z: c.z, r })
      mark(c.x, c.z, r + 4)
    } else if (c.gate) mark(c.x, c.z, 70)
  }
  // Small squares where the lanes cross the middle ring, each with a fountain or a statue.
  const squares: { x: number; z: number; r: number; kind: 'fountain' | 'statue' | 'well' }[] = []
  for (let a = 0.15; a < Math.PI * 2; a += 0.4) {
    const [x, z] = at((rIn(a) + rOut(a)) / 2 + 8, a)
    if (!inCity(x, z) || plazas.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 68)) continue
    const kind = (['fountain', 'statue', 'well'] as const)[squares.length % 3]
    squares.push({ x, z, r: 26, kind })
    mark(x, z, 28)
  }

  // --- Paving: every street, plaza and square laid in stone (following the ground). ---
  const pave = new PaveBuilder(world)
  for (const s of streets) pave.ribbon(s.pts, s.w, s.kind === 'avenue' ? 0x9a9284 : s.kind === 'ring' ? 0x8f8778 : 0x857d6e, rnd)
  for (const p of plazas) pave.disc(p.x, p.z, p.r, 0x9d9483, rnd)
  for (const q of squares) pave.disc(q.x, q.z, q.r, 0x958c7c, rnd)
  group.add(pave.mesh())

  // --- Houses: a range of kit-built town houses, drawn as instances. ---
  const protos = housePrototypes(rnd)
  const lists: THREE.Matrix4[][] = protos.map(() => [])
  const colors: THREE.Color[][] = protos.map(() => [])
  const tmp = new THREE.Object3D()
  const place = (v: number, x: number, z: number, ry: number, s: number) => {
    tmp.position.set(x, world.heightAt(x, z) - 0.2, z)
    tmp.rotation.set(0, ry, 0)
    tmp.scale.setScalar(s)
    tmp.updateMatrix()
    lists[v].push(tmp.matrix.clone())
    const sh = 0.88 + rnd() * 0.18
    colors[v].push(new THREE.Color(sh, sh * (0.98 + rnd() * 0.04), sh * (0.95 + rnd() * 0.05)))
  }
  const SCALE = 1.32
  const houseCount = protos.findIndex((p) => p.kind !== 'house')
  const churchIdx = protos.findIndex((p) => p.kind === 'church')
  const towerIdx = protos.findIndex((p) => p.kind === 'tower')
  const rows = mobile ? [1] : [1, 2]
  // Houses front the streets: walk each one, both sides, a house every few paces, a second row behind.
  for (const s of streets)
    for (let i = 0; i < s.pts.length - 1; i++) {
      const [ax, az] = s.pts[i]
      const [bx, bz] = s.pts[i + 1]
      const L = Math.hypot(bx - ax, bz - az)
      if (L < 1) continue
      const ux = (bx - ax) / L
      const uz = (bz - az) / L
      const ry = -Math.atan2(uz, ux)
      for (const side of [-1, 1])
        for (const row of rows) {
          // Shoulder to shoulder: each house's footprint is checked as its own rectangle, so the
          // next one goes up right against it.
          let t = rnd() * 2
          while (t < L) {
            const v = rnd() < 0.012 && row === 1 ? churchIdx : rnd() < 0.015 ? towerIdx : Math.floor(rnd() * houseCount)
            const p = protos[v]
            const sc = SCALE * (0.94 + rnd() * 0.12)
            const half = (p.w * sc) / 2
            const off = s.w / 2 + 1.8 + (p.d * sc) / 2 + (row - 1) * (p.d * sc + 3.5)
            const x = ax + ux * (t + half) + -uz * side * off
            const z = az + uz * (t + half) + ux * side * off
            const hry = ry + (side < 0 ? Math.PI : 0)
            if (inCity(x, z) && freeRect(x, z, half, (p.d * sc) / 2, hry) && (row === 1 || rnd() < 0.8)) {
              place(v, x, z, hry, sc)
              markRect(x, z, half + 0.15, (p.d * sc) / 2 + 0.3, hry)
              t += p.w * sc + 0.2 + rnd() * 0.5
            } else t += 2
          }
        }
    }
  // Behind the street fronts, the blocks fill up: back houses, workshops, a courtyard or garden here
  // and there (left open for the trees). Houses turn to the nearer street direction (round the city or
  // out along a lane).
  const IN = mobile ? 17 : 11.5
  for (let gz = -ext; gz < ext; gz += IN)
    for (let gx = -ext; gx < ext; gx += IN) {
      if (rnd() < 0.14) continue
      const x = cx + gx + (rnd() - 0.5) * 3.5
      const z = cz + gz + (rnd() - 0.5) * 3.5
      if (Math.hypot(x - cx, z - cz) < mount * 1.3 || !inCity(x, z)) continue
      const v = rnd() < 0.006 ? churchIdx : rnd() < 0.01 ? towerIdx : Math.floor(rnd() * houseCount)
      const p = protos[v]
      const r = (Math.max(p.w, p.d) * SCALE) / 2 + 0.4
      if (!free(x, z, r)) continue
      const a = Math.atan2(z - cz, x - cx)
      place(v, x, z, -(a + Math.PI / 2) + (rnd() < 0.5 ? 0 : Math.PI / 2) + (rnd() < 0.5 ? 0 : Math.PI), SCALE * (0.9 + rnd() * 0.18))
      mark(x, z, r)
    }
  const houseMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88 }), '', true)
  protos.forEach((p, v) => {
    if (!lists[v].length) return
    const m = new THREE.InstancedMesh(p.geo, houseMat, lists[v].length)
    lists[v].forEach((mx, i) => {
      m.setMatrixAt(i, mx)
      m.setColorAt(i, colors[v][i])
    })
    m.castShadow = !mobile
    m.receiveShadow = true
    m.computeBoundingSphere()
    group.add(m)
    if (p.detail) {
      const dm = new THREE.InstancedMesh(p.detail, houseMat, lists[v].length)
      lists[v].forEach((mx, i) => {
        dm.setMatrixAt(i, mx)
        dm.setColorAt(i, colors[v][i])
      })
      dm.castShadow = false
      dm.receiveShadow = true
      dm.computeBoundingSphere()
      group.add(dm)
    }
  })

  // --- Courtyards: trees in the open ground behind the houses. ---
  const treeKit = newKit()
  tree(treeKit, new Frame(0, 0, 0), 0, 0, rnd, 1)
  const treeGeo = bmerge(treeKit.walls)
  const trees: THREE.Matrix4[] = []
  for (let n = 0; n < (mobile ? 700 : 1600); n++) {
    const a = rnd() * Math.PI * 2
    const r = mount * 1.4 + rnd() * (rOut(a) - mount * 1.4)
    const [x, z] = at(r, a)
    if (!inCity(x, z) || !free(x, z, 4)) continue
    tmp.position.set(x, world.heightAt(x, z), z)
    tmp.rotation.set(0, rnd() * 6, 0)
    tmp.scale.setScalar(1.1 + rnd() * 0.6)
    tmp.updateMatrix()
    trees.push(tmp.matrix.clone())
    mark(x, z, 5)
  }
  if (trees.length) {
    // In squares of the city, so the trees' shadows can follow the camera (see updateTreeShadows).
    const tg = new THREE.Group()
    tg.name = 'city-trees'
    for (const m of chunkInstances(treeGeo, houseMat, trees, null, !mobile, 500)) tg.add(m)
    group.add(tg)
  }

  // --- Squares, lamps: fountains, statues, wells, and lamp posts along the avenues. ---
  const props = newKit()
  // (The wards dress their own plazas.)
  for (const q of squares) {
    const f = new Frame(q.x, q.z, rnd() * 6, world.heightAt(q.x, q.z))
    if (q.kind === 'fountain') {
      f.put(props.walls, cyl(7, 7.5, 1.4, 14), PAL.stoneL, 0, 0.7, 0, { ao: 0 })
      f.put(props.walls, cyl(6.2, 6.2, 0.3, 14), 0x4f7f96, 0, 1.3, 0, { ao: 0 })
      f.put(props.walls, cyl(1, 1.4, 4, 8), PAL.stone, 0, 3, 0)
      f.put(props.walls, cyl(2.6, 2, 0.6, 10), PAL.stoneL, 0, 5, 0, { ao: 0 })
      f.put(props.walls, sphere(0.7, 0), 0xd9b04a, 0, 5.8, 0, { ao: 0 })
    } else if (q.kind === 'statue') {
      f.put(props.walls, box(5, 3, 5), PAL.stoneL, 0, 1.5, 0)
      f.put(props.walls, box(4, 0.6, 4), PAL.stone, 0, 3.3, 0, { ao: 0 })
      // A king on horseback, in bronze gone green.
      f.put(props.walls, box(1.2, 1.6, 3.2), 0x4f7a6a, 0, 5, 0)
      f.put(props.walls, box(0.7, 1.4, 0.8), 0x4f7a6a, 0, 5.8, 1.6, { rx: -0.5 })
      for (const [x, z] of [[-0.4, 1.1], [0.4, 1.1], [-0.4, -1.1], [0.4, -1.1]]) f.put(props.walls, box(0.3, 1.8, 0.3), 0x46705f, x, 3.9, z)
      f.put(props.walls, box(0.8, 1.6, 0.6), 0x4f7a6a, 0, 6.8, -0.2)
      f.put(props.walls, sphere(0.35, 0), 0x4f7a6a, 0, 7.9, -0.2)
      f.put(props.walls, box(0.1, 2.6, 0.1), 0x46705f, 0.5, 7.4, 0.3, { rx: 0.4 })
    } else {
      f.put(props.walls, cyl(1.8, 1.9, 1.4, 10), PAL.stone, 0, 0.7, 0)
      for (const s of [-1, 1]) f.put(props.walls, box(0.3, 3, 0.3), PAL.timber, s * 1.6, 2, 0)
      f.put(props.roofs, box(4, 0.3, 2.4), PAL.tile[0], 0, 3.6, 0, { rz: 0.3 })
    }
    if (!q.r) continue
    // A market round each square: stalls under awnings with their wares, carts, a market cross
    // where there is no fountain, benches, and trees round the edge.
    const awn = [0xa8322a, 0x2f4f9a, 0x3f6a3a, 0xc8902a]
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.25
      const sf = f.sub(Math.cos(a) * q.r * 0.66, Math.sin(a) * q.r * 0.66, -a - Math.PI / 2)
      sf.put(props.walls, box(4.6, 1.1, 2.4), PAL.timberL, 0, 0.8, 0)
      for (const [lx, lz] of [[-2.2, -1.1], [2.2, -1.1], [-2.2, 1.3], [2.2, 1.3]]) sf.put(props.walls, box(0.22, 3, 0.22), PAL.timber, lx, 1.5, lz, { ao: 0 })
      sf.put(props.walls, box(5.2, 0.16, 3.4), awn[i % 4], 0, 3.1, 0.2, { rx: 0.22 })
      if (i % 2) crate(props, sf, -1, 1.35, 0, 0.8)
      else barrel(props, sf, 1.2, 0.2, 0.7)
    }
    if (q.kind === 'well') {
      for (let st = 0; st < 3; st++) f.put(props.walls, box(4.4 - st * 1.2, 0.6, 4.4 - st * 1.2), PAL.stoneD, q.r * 0.3, 0.3 + st * 0.6, 0)
      f.put(props.walls, box(0.6, 5.5, 0.6), PAL.stoneL, q.r * 0.3, 4.6, 0)
      f.put(props.walls, box(2.4, 0.5, 0.5), PAL.stoneL, q.r * 0.3, 6.2, 0)
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.8
      const bf = f.sub(Math.cos(a) * q.r * 0.38, Math.sin(a) * q.r * 0.38, -a)
      bf.put(props.walls, box(3, 0.3, 0.9), PAL.timberL, 0, 0.8, 0)
      for (const sx of [-1.2, 1.2]) bf.put(props.walls, box(0.3, 0.8, 0.8), PAL.stoneD, sx, 0.4, 0)
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4
      tree(props, f, Math.cos(a) * (q.r + 2), Math.sin(a) * (q.r + 2), rnd, 1.2)
    }
  }
  const lamps: THREE.BufferGeometry[] = []
  for (const s of streets) {
    if (s.kind !== 'avenue' && s.kind !== 'ring') continue
    const step = s.kind === 'avenue' ? 34 : 70
    for (let i = 0; i < s.pts.length - 1; i++) {
      const [ax, az] = s.pts[i]
      const [bx, bz] = s.pts[i + 1]
      const L = Math.hypot(bx - ax, bz - az)
      for (let t = step / 2; t < L; t += step) {
        for (const side of s.kind === 'avenue' ? [-1, 1] : [1]) {
          const x = ax + ((bx - ax) * t) / L + (-(bz - az) / L) * side * (s.w / 2 + 1)
          const z = az + ((bz - az) * t) / L + ((bx - ax) / L) * side * (s.w / 2 + 1)
          if (!inCity(x, z)) continue
          const f = new Frame(x, z, 0, world.heightAt(x, z))
          f.put(props.walls, cyl(0.16, 0.22, 5, 5), PAL.iron, 0, 2.5, 0, { ao: 0 })
          f.put(props.walls, box(0.9, 0.2, 0.9), PAL.iron, 0, 5.1, 0, { ao: 0 })
          f.put(lamps, box(0.6, 0.8, 0.6), 0xffc46a, 0, 5.6, 0)
        }
      }
    }
  }
  const pm = new THREE.Mesh(groundShade(bmerge([...props.walls, ...props.roofs]), 3, 0.2), buildMat)
  // (Fountains, statues, stalls and lamps: small, no shadow of their own.)
  pm.castShadow = false
  pm.receiveShadow = true
  group.add(pm)
  if (lamps.length) group.add(new THREE.Mesh(bmerge(lamps), lampMat))
  void distToSegment
  return group
}

type ProtoKind = 'house' | 'church' | 'tower'
type Proto = { geo: THREE.BufferGeometry; detail: THREE.BufferGeometry | null; w: number; d: number; kind: ProtoKind }

/** Paint the owner-colour parts of a kit (awnings, banners, signs) a fixed colour, for instancing. */
function tint(parts: THREE.BufferGeometry[], color: number) {
  const c = new THREE.Color(color)
  for (const g of parts) {
    const col = g.attributes.color as THREE.BufferAttribute
    for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b)
  }
  return parts
}

/** One prototype: what the kit built, on a stone footing that runs well down into the ground. */
function proto(k: Kit, w: number, d: number, kind: ProtoKind, accent = 0xa8322a): Proto {
  k.walls.push(bpartFoot(w, d))
  const geo = groundShade(bmerge([...k.walls, ...k.roofs, ...tint(k.accents, accent)]), 3, 0.22)
  // The fine work (framing, frames, shutters, props) is drawn apart and casts no shadow.
  const detail = k.flat?.length ? groundShade(bmerge(k.flat), 3, 0.22) : null
  return { geo, detail, w, d, kind }
}
/** A kit for a prototype: its fine work kept apart. */
function pkit(): Kit {
  const k = newKit()
  k.flat = []
  return k
}
/** A footing of dressed stone under a building: from its floor down into the slope. */
function bpartFoot(w: number, d: number) {
  const k = newKit()
  new Frame(0, 0, 0).put(k.walls, box(w + 0.9, 5.2, d + 0.9), PAL.stoneD, 0, -1.7, 0, { ao: 0.25, jitter: 0.1 })
  return k.walls[0]
}

/**
 * The kinds of building the city is built from (some twenty): jettied half-timbered town houses
 * of every size, plastered and stone houses, shops with awnings and their wares out, houses turned
 * gable-end to the street, L-shaped houses, a terrace of three under one roof, an inn with its sign,
 * a merchant's hall over an arcade, a smithy with its tall chimney, a warehouse, a thatched cottage,
 * a tower house of the old families, a parish church. Each stands on a stone footing.
 */
function housePrototypes(rnd: () => number): Proto[] {
  const out: Proto[] = []
  const specs: HouseOpts[] = [
    { w: 7.5, d: 6, storeys: 2, roof: 'tile', style: 'timber' },
    { w: 6.5, d: 5.5, storeys: 2, roof: 'shingle', style: 'timber' },
    { w: 8, d: 6, storeys: 2, roof: 'slate', style: 'stone' },
    { w: 7, d: 5.5, storeys: 1, roof: 'tile', style: 'plaster', annex: true },
    { w: 6, d: 5, storeys: 2, roof: 'tile', style: 'plaster' },
    { w: 8.5, d: 6.5, storeys: 2, roof: 'slate', style: 'timber' },
    { w: 6, d: 5, storeys: 1, roof: 'shingle', style: 'stone' },
    { w: 7, d: 6, storeys: 2, roof: 'tile', style: 'stone' },
    { w: 9, d: 5.5, storeys: 2, roof: 'tile', style: 'timber' },
    { w: 6.5, d: 6, storeys: 2, roof: 'slate', style: 'plaster', annex: true },
    { w: 5.5, d: 6.5, storeys: 2, roof: 'tile', style: 'timber' },
  ]
  for (const o of specs) {
    const k = pkit()
    house(k, new Frame(0, 0, 0), { ...o, detail: 'high' }, rnd)
    out.push(proto(k, o.w, o.d, 'house'))
  }
  // Shops: awnings over the front, trestles with their wares.
  for (const [o, accent] of [[{ w: 7, d: 6, roof: 'tile', style: 'timber' }, 0xa8322a], [{ w: 6.5, d: 6, roof: 'slate', style: 'plaster' }, 0x2f4f9a], [{ w: 8, d: 6, roof: 'tile', style: 'stone' }, 0x3f6a3a]] as const) {
    const k = pkit()
    const f = new Frame(0, 0, 0)
    house(k, f, { ...o, storeys: 2, detail: 'high' } as HouseOpts, rnd)
    f.put(k.accents, box(o.w * 0.85, 0.14, 2.4), 0xffffff, 0, 3.1, o.d / 2 + 1.1, { rx: 0.32 })
    for (const s of [-1, 1]) f.put(k.walls, box(0.16, 2.7, 0.16), PAL.timber, s * o.w * 0.4, 1.6, o.d / 2 + 2.2)
    f.put(k.walls, box(o.w * 0.65, 0.9, 1.1), PAL.timberL, 0, 1.3, o.d / 2 + 1.5)
    crate(k, f, -o.w * 0.25, 1.8, o.d / 2 + 1.5, 0.7)
    barrel(k, f, o.w * 0.32, o.d / 2 + 1.7, 0.6)
    out.push(proto(k, o.w, o.d + 2.5, 'house', accent))
  }
  // Gable-end to the street: the ridge runs back from the front.
  {
    const k = pkit()
    house(k, new Frame(0, 0, Math.PI / 2), { w: 8, d: 5.5, storeys: 2, roof: 'tile', style: 'timber', detail: 'high' }, rnd)
    out.push(proto(k, 5.5, 8, 'house'))
  }
  // An L: a house with a wing running back.
  {
    const k = pkit()
    house(k, new Frame(0, 0, 0), { w: 8, d: 5.5, storeys: 2, roof: 'slate', style: 'stone', detail: 'high' }, rnd)
    house(k, new Frame(-2.4, -5.2, Math.PI / 2), { w: 5.5, d: 4.5, storeys: 1, roof: 'slate', style: 'stone', detail: 'mid' }, rnd)
    out.push(proto(k, 8, 10, 'house'))
  }
  // A terrace of three under one roof line.
  {
    const k = pkit()
    for (let i = 0; i < 3; i++) house(k, new Frame(-5.6 + i * 5.6, 0, 0), { w: 5.5, d: 6, storeys: 2, roof: 'tile', style: i === 1 ? 'plaster' : 'timber', detail: 'high' }, rnd)
    out.push(proto(k, 16.8, 6, 'house'))
  }
  // An inn: big, jettied, its sign on a bracket, benches out front.
  {
    const k = pkit()
    const f = new Frame(0, 0, 0)
    house(k, f, { w: 11, d: 8, storeys: 2, roof: 'tile', style: 'timber', detail: 'high', annex: true }, rnd)
    f.put(k.walls, box(0.18, 0.18, 2.4), PAL.iron, 4, 4.6, 4.8)
    f.put(k.accents, box(1.6, 1.3, 0.14), 0xffffff, 4, 3.7, 5.8)
    for (const u of [-3, 1.5]) {
      f.put(k.walls, box(3, 0.25, 1.2), PAL.timberL, u, 1.2, 6.6)
      for (const s of [-1, 1]) f.put(k.walls, box(3, 0.2, 0.45), PAL.timber, u, 0.7, 6.6 + s * 1.1)
    }
    barrel(k, f, -5, 5, 0.8)
    out.push(proto(k, 11, 10, 'house', 0x6a3a1e))
  }
  // A merchant's hall: stone, over an open arcade.
  {
    const k = pkit()
    const f = new Frame(0, 0, 0)
    house(k, f, { w: 13, d: 8, storeys: 2, roof: 'slate', style: 'stone', detail: 'high', banner: true }, rnd)
    for (let i = 0; i < 5; i++) {
      const u = -5.2 + i * 2.6
      f.put(k.walls, cyl(0.32, 0.36, 3.2, 8), PAL.stoneL, u, 1.6, 5)
      if (i < 4) f.put(k.walls, new THREE.TorusGeometry(1.3, 0.28, 3, 8, Math.PI), PAL.stoneL, u + 1.3, 3.1, 5, { ao: 0 })
    }
    f.put(k.walls, box(13, 0.5, 2.4), PAL.stoneD, 0, 4.3, 4.6)
    out.push(proto(k, 13, 10.5, 'house', 0x2f4f9a))
  }
  // A smithy: a stone forge with its tall chimney and the anvil out front.
  {
    const k = pkit()
    const f = new Frame(0, 0, 0)
    house(k, f, { w: 8, d: 6.5, storeys: 1, roof: 'slate', style: 'stone', detail: 'high' }, rnd)
    f.put(k.walls, box(1.6, 10, 1.6), PAL.soot, 3, 5, -2.4)
    f.put(k.walls, box(1.5, 0.8, 0.7), PAL.iron, -1.5, 1.2, 4.4)
    f.put(k.walls, box(0.8, 0.8, 0.8), 0x4a3a2a, -1.5, 0.4, 4.4)
    out.push(proto(k, 8, 8, 'house'))
  }
  // A warehouse: tall timber, a hoist beam over the loft door.
  {
    const k = pkit()
    const f = new Frame(0, 0, 0)
    f.put(k.walls, box(10, 9, 8), PAL.timberL, 0, 4.5, 0)
    for (let u = -4.5; u <= 4.5; u += 3) f.put(k.walls, box(0.35, 9, 0.4), PAL.timber, u, 4.5, 4.05)
    f.put(k.walls, box(2.4, 3, 0.3), PAL.door, 0, 1.5, 4.1)
    f.put(k.walls, box(2, 2.2, 0.3), PAL.dark, 0, 6.6, 4.1)
    f.put(k.walls, box(0.3, 0.3, 2.6), PAL.timber, 0, 8.4, 5.2)
    f.put(k.roofs, gable(9.4, 11, 4), PAL.tile[1], 0, 9, 0)
    out.push(proto(k, 10, 8, 'house'))
  }
  // A thatched cottage that the city grew round.
  {
    const k = pkit()
    house(k, new Frame(0, 0, 0), { w: 7, d: 5.5, storeys: 1, roof: 'thatch', style: 'timber', detail: 'high', annex: true }, rnd)
    out.push(proto(k, 7, 5.5, 'house'))
  }
  {
    const k = pkit()
    chapel(k, new Frame(0, 0, 0), rnd, false)
    out.push(proto(k, 13, 9, 'church'))
  }
  {
    // A tower house of the old families: tall, narrow, crenellated, a little turret with its spire.
    const k = pkit()
    const f = new Frame(0, 0, 0)
    f.put(k.walls, box(7, 1.4, 7), PAL.stoneD, 0, 0.2, 0)
    k.walls.push(mottle(bpart(new THREE.BoxGeometry(6, 19, 6, 2, 6, 2), PAL.stoneL, { y: 10, ao: 0.2 }), 0.05))
    for (const y of [6, 11, 16]) for (let s = 0; s < 4; s++) new Frame(0, 0, (s * Math.PI) / 2).put(k.walls, box(1, 1.6, 0.2), PAL.dark, 0, y, 3.05, { ao: 0 })
    for (const [x, z] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6], [0, -2.6], [0, 2.6], [-2.6, 0], [2.6, 0]]) f.put(k.walls, box(1.1, 1.4, 1.1), PAL.stone, x, 20.2, z, { ao: 0 })
    f.put(k.walls, cyl(1.3, 1.3, 4, 8), PAL.stone, 2.6, 21, 2.6)
    coursedCone(k.roofs, 2.6, 23, 2.6, 1.7, 3.6, PAL.slate[0], 8)
    out.push(proto(k, 7, 7, 'tower'))
  }
  return out
}

/** Paving laid over the ground: ribbons along streets, discs for plazas (one merged mesh). */
class PaveBuilder {
  private pos: number[] = []
  private col: number[] = []
  private world: World
  constructor(world: World) {
    this.world = world
  }
  private tri(p: [number, number][], c: THREE.Color) {
    for (const [x, z] of p) {
      this.pos.push(x, this.world.heightAt(x, z) + 0.35, z)
      this.col.push(c.r, c.g, c.b)
    }
  }
  ribbon(pts: [number, number][], w: number, color: number, rnd: () => number) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]
      const [bx, bz] = pts[i + 1]
      const L = Math.hypot(bx - ax, bz - az)
      if (L < 0.5) continue
      const n = Math.max(1, Math.ceil(L / 8))
      const nx = (-(bz - az) / L) * (w / 2)
      const nz = ((bx - ax) / L) * (w / 2)
      for (let j = 0; j < n; j++) {
        const x0 = ax + ((bx - ax) * j) / n
        const z0 = az + ((bz - az) * j) / n
        const x1 = ax + ((bx - ax) * (j + 1)) / n
        const z1 = az + ((bz - az) * (j + 1)) / n
        const c = new THREE.Color(color).multiplyScalar(0.9 + rnd() * 0.18)
        this.tri([[x0 + nx, z0 + nz], [x1 + nx, z1 + nz], [x0 - nx, z0 - nz]], c)
        this.tri([[x1 + nx, z1 + nz], [x1 - nx, z1 - nz], [x0 - nx, z0 - nz]], c)
      }
    }
  }
  disc(x: number, z: number, r: number, color: number, rnd: () => number) {
    const rings = Math.max(2, Math.round(r / 10))
    const segs = 24
    for (let i = 0; i < rings; i++) {
      const r0 = (r * i) / rings
      const r1 = (r * (i + 1)) / rings
      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * Math.PI * 2
        const a1 = ((s + 1) / segs) * Math.PI * 2
        const c = new THREE.Color(color).multiplyScalar(0.88 + rnd() * 0.2)
        const p = (rr: number, a: number): [number, number] => [x + Math.cos(a) * rr, z + Math.sin(a) * rr]
        this.tri([p(r0, a0), p(r0, a1), p(r1, a0)], c)
        this.tri([p(r0, a1), p(r1, a1), p(r1, a0)], c)
      }
    }
  }
  mesh(): THREE.Mesh {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, side: THREE.DoubleSide }), '', true))
    m.receiveShadow = true
    m.renderOrder = 1
    return m
  }
}
