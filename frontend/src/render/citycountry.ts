import * as THREE from 'three'
import type { Castle, CityWall, TownDef } from '../game/types'
import { PROF_N, type CastleShape, type World } from '../game/world'
import { newKit } from './buildings'
import { buildCastleTown } from './castletown'
import { buildFarmland } from './farmland'
import { STYLES, circleHitsRect, rectsOverlap, type Ctx, type FortStyle, type Taken } from './fortress'
import { bpart, box } from './geo'

/**
 * A royal city's country, outside its great outer wall: a gate town out of each of the great
 * gatehouses (townhouses and shops pressed together by the gate, an inn on a plaza, side alleys and
 * back lanes, workshops, carts, travellers' tents), and round the whole city a broad farmland of
 * fields behind hedges and hurdles, windmills on the rises, orchards, pastures of sheep, cattle and
 * horses, farmsteads with their barns. Built by the same builders as a lord's castle's suburbs and
 * farmland (castletown.ts, farmland.ts), with the city's outer wall standing in for the curtain.
 *
 * Everything is in coordinates local to the city's centre. Keeps clear of the other holdings round
 * the city, the terrain features and anything else in `avoid` (world circles).
 */
export interface CityCountry {
  stone: THREE.BufferGeometry[]
  roof: THREE.BufferGeometry[]
  gold: THREE.BufferGeometry[]
  glow: THREE.BufferGeometry[]
  /** Ground and small parts that cast no shadow. */
  flat: THREE.BufferGeometry[]
  mills: { x: number; y: number; z: number; ry: number; r: number }[]
  smoke: [number, number, number][]
  /** Ground it took (local circles), to clear the wild trees from. */
  cleared: { x: number; z: number; r: number }[]
  base: number
}

export function buildCityCountry(world: World, town: TownDef, outerW: CityWall, rOut: (a: number) => number, style: FortStyle, rnd: () => number, avoid: { x: number; z: number; r: number }[], mobile: boolean): CityCountry {
  const cx = town.x
  const cz = town.z
  const base = world.heightAt(cx, cz)
  const kit = newKit()
  const stone = kit.walls
  const flat: THREE.BufferGeometry[] = []
  kit.flat = flat
  const roof: THREE.BufferGeometry[] = []
  const gold: THREE.BufferGeometry[] = []
  const smoke: [number, number, number][] = []
  const mills: CityCountry['mills'] = []
  const G = (lx: number, lz: number) => world.heightAt(cx + lx, cz + lz) - base
  const S = (geo: THREE.BufferGeometry, col: number, o: Parameters<typeof bpart>[2] = {}) => {
    stone.push(bpart(geo, col, o))
  }
  const F = (geo: THREE.BufferGeometry, col: number, o: Parameters<typeof bpart>[2] = {}) => {
    flat.push(bpart(geo, col, o))
  }
  const Rf = (geo: THREE.BufferGeometry, col: number, o: Parameters<typeof bpart>[2] = {}) => {
    roof.push(bpart(geo, col, { ao: 0.12, ...o }))
  }
  // The great gates, in order round the city; the main one towards the heart of the map.
  const gates = (outerW.gatePts ?? []).map(([gx, gz]) => Math.atan2(gz - cz, gx - cx)).sort((a, b) => a - b)
  const toHeart = Math.atan2(-cz, -cx)
  let mi = 0
  gates.forEach((g, i) => {
    if (Math.abs(Math.atan2(Math.sin(g - toHeart), Math.cos(g - toHeart))) < Math.abs(Math.atan2(Math.sin(gates[mi] - toHeart), Math.cos(gates[mi] - toHeart)))) mi = i
  })
  const ordered = [...gates.slice(mi), ...gates.slice(0, mi).map((g) => g + Math.PI * 2)]
  const main = ordered[0]
  let maxR = 0
  for (let i = 0; i < 64; i++) maxR = Math.max(maxR, rOut((i / 64) * Math.PI * 2))
  const shape: CastleShape = { x: cx, z: cz, r: maxR, rot: main, gates: ordered, prof: new Float32Array(PROF_N).fill(1), site: 'plain', level: base, corners: [] }
  const taken: Taken[] = avoid.map((a) => ({ x: a.x - cx, z: a.z - cz, r: a.r }))
  const preset = taken.length
  const free = (x: number, z: number, r: number) => taken.every((t) => (t.hw !== undefined ? !circleHitsRect(x, z, r, t) : Math.hypot(t.x - x, t.z - z) > t.r + r))
  const freeRect = (x: number, z: number, hw: number, hd: number, ry: number) => {
    const me: Taken = { x, z, r: Math.hypot(hw, hd), hw, hd, ry }
    return taken.every((t) => (Math.hypot(t.x - x, t.z - z) > t.r + me.r ? true : t.hw !== undefined ? !rectsOverlap(me, t) : !circleHitsRect(t.x, t.z, t.r, me)))
  }
  const rAt = (a: number) => rOut(a)
  const inWalls = (x: number, z: number, pad: number) => Math.hypot(x, z) < rOut(Math.atan2(z, x)) + pad
  const firm = (x: number, z: number, r = 4) => {
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const wx = cx + x + dx
      const wz = cz + z + dz
      if (Math.abs(wx) > world.half - 170 || Math.abs(wz) > world.half - 170) return false
      if (world.heightAt(wx, wz) < 3.2 || !world.isPassable(wx, wz) || world.slopeAt(wx, wz) > 0.95 || world.onWall(wx, wz, 16) || world.onRampart(wx, wz, 20)) return false
    }
    return true
  }
  const foot = (x: number, z: number, w: number, d: number, ry: number, col = 0x8a8274) => {
    const cs = Math.cos(ry)
    const sn = Math.sin(ry)
    let lo = Infinity
    let hi = -Infinity
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, 0]]) {
      const h = G(x + lx * cs + lz * sn, z - lx * sn + lz * cs)
      lo = Math.min(lo, h)
      hi = Math.max(hi, h)
    }
    if (hi - lo > 0.35) S(box(w + 0.9, hi - lo + 1.4, d + 0.9), col, { x, y: (hi + lo) / 2 - 0.4, z, ry, ao: 0.2, jitter: 0.1 })
    return hi
  }
  const lanes: Ctx['lanes'] = []
  const laneClear = (x: number, z: number, r: number, except?: [number, number][]) => {
    for (const l of lanes) {
      if (l.pts === except) continue
      for (let i = 0; i < l.pts.length - 1; i++) {
        const [ax, az] = l.pts[i]
        const [bx, bz] = l.pts[i + 1]
        const ex = bx - ax
        const ez = bz - az
        const L2 = ex * ex + ez * ez || 1
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2))
        if (Math.hypot(x - ax - ex * t, z - az - ez * t) < r + l.half) return false
      }
    }
    return true
  }
  const keep = world.def.castles.find((k) => k.id === town.keep)
  const c = { id: `${town.keep ?? 'city'}-country`, name: 'country', faction: keep?.faction ?? 'player', tier: 4, x: cx, z: cz, ruined: false, staging: false } as unknown as Castle
  const ctx: Ctx = {
    c,
    world,
    shape,
    style,
    S0: STYLES[style],
    tier: 4,
    grand: 0,
    ruined: false,
    timber: false,
    rnd,
    kit,
    stone,
    roof,
    gold,
    flat,
    smoke,
    mills,
    G,
    S,
    F,
    Rf,
    rAt,
    pt: (a: number, extra = 0) => [Math.cos(a) * (rOut(a) + extra), Math.sin(a) * (rOut(a) + extra)],
    gates: ordered,
    main,
    waterGate: null,
    sq: 0,
    innerR: 0,
    keepAt: [0, 0],
    wallH: 24,
    taken,
    free,
    freeRect,
    onStreet: () => false,
    inWalls,
    firm,
    foot,
    roofCone: () => {},
    outer: maxR + (mobile ? 300 : 420),
    lanes,
    laneClear,
    nearOuterWall: () => false,
    barbican: false,
    noRing: true,
    country: mobile ? { fields: 26, mills: 2, orchards: 2, pastures: 2, farms: 6 } : { fields: 60, mills: 4, orchards: 4, pastures: 4, farms: 14 },
  }
  buildCastleTown(ctx, true)
  buildFarmland(ctx)
  // Travellers' camps by the roads outside the gates: tents, a fire, picketed horses.
  roof.push(...kit.accents)
  stone.push(...kit.roofs)
  const cleared = taken.slice(preset).map((t) => ({ x: t.x, z: t.z, r: t.r + 4 }))
  for (const l of lanes) for (const [x, z] of l.pts) cleared.push({ x, z, r: l.half + 3 })
  return { stone, roof, gold, glow: kit.glow, flat, mills, smoke, cleared, base }
}
