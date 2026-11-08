import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Prepare a primitive for merging: transform it and bake a flat vertex colour. */
export function part(
  geo: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  opts: { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number } = {},
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.deleteAttribute('uv')
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0)),
    new THREE.Vector3(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1),
  )
  g.applyMatrix4(m)
  const c = new THREE.Color(color)
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)
  if (!g) throw new Error('mergeGeometries failed')
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
export const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg)
export const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg)
export const sphere = (r: number, detail = 0) => new THREE.IcosahedronGeometry(r, detail)
