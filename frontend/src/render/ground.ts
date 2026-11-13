import * as THREE from 'three'
import { WATER_LEVEL, distToSegment, type World } from '../game/world'

/**
 * The ground map: one texture over the whole map that the painted ground and the water read per
 * pixel (the terrain's own colours live on its vertices, a cell apart, too coarse for a road's ruts
 * or the line where water meets the bank).
 *   R: road (1 on the road, falling off over its verges)
 *   G: wheel ruts (1 in the two tracks the carts wear into it)
 *   B: height about the water line, -10..+10 m mapped to 0..1 (water depth below, bank above)
 */
export function makeGroundMap(world: World, res = 1024): THREE.DataTexture {
  const data = new Uint8Array(res * res * 4)
  const cell = world.size / res
  const at = (i: number) => -world.half + (i + 0.5) * cell
  // Height about the water.
  for (let j = 0; j < res; j++) {
    const z = at(j)
    for (let i = 0; i < res; i++) {
      const h = world.heightAt(at(i), z) - WATER_LEVEL
      data[(j * res + i) * 4 + 2] = Math.round(Math.max(0, Math.min(1, (h + 10) / 20)) * 255)
      data[(j * res + i) * 4 + 3] = 255
    }
  }
  // Roads: rasterised segment by segment, only the cells near each one.
  for (const road of world.def.roads ?? []) {
    const w = road.width
    const reach = w / 2 + 7
    const pts = road.points
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k]
      const [bx, bz] = pts[k + 1]
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + world.half) / cell))
      const i1 = Math.min(res - 1, Math.ceil((Math.max(ax, bx) + reach + world.half) / cell))
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach + world.half) / cell))
      const j1 = Math.min(res - 1, Math.ceil((Math.max(az, bz) + reach + world.half) / cell))
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const d = distToSegment(at(i), at(j), ax, az, bx, bz)
          if (d > reach) continue
          const o = (j * res + i) * 4
          const road = 1 - smoothstep(w / 2 - 3, w / 2 + 5, d)
          const rut = Math.max(0, 1 - Math.abs(d - w * 0.22) / 1.6) * (1 - smoothstep(w / 2 - 4, w / 2, d))
          data[o] = Math.max(data[o], Math.round(road * 255))
          data[o + 1] = Math.max(data[o + 1], Math.round(rut * 255))
        }
    }
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
