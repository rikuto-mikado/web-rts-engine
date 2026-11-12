import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Prepare a primitive for merging: transform it and bake a flat vertex colour. */
export function part(
  geo: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  opts: { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number; order?: THREE.EulerOrder } = {},
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo
  // Every part carries just position and colour; merge() computes the (flat) normals for the whole.
  g.deleteAttribute('uv')
  g.deleteAttribute('normal')
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0, opts.order ?? 'XYZ')),
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

/**
 * A building part: like `part`, plus the touches that keep merged models from
 * looking like clean plastic. Each part darkens towards its own foot (contact
 * shade where it meets the part below: walls on plinths, chimneys on roofs,
 * posts on the ground), and takes a slight, stable shift of tone so neighbouring
 * stones, beams and thatch bundles are never quite the same colour.
 */
export function bpart(
  geo: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  opts: { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number; order?: THREE.EulerOrder; ao?: number; jitter?: number } = {},
): THREE.BufferGeometry {
  // Buildings stay indexed and carry no normals: their materials are flat-shaded, which
  // derives the facet normal per pixel, so shared corners cost nothing and memory stays low.
  const g = geo
  if (!g.index) {
    const n = g.attributes.position.count
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n)
    for (let i = 0; i < n; i++) idx[i] = i
    g.setIndex(new THREE.BufferAttribute(idx, 1))
  }
  g.deleteAttribute('uv')
  g.deleteAttribute('normal')
  g.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0, opts.order ?? 'XYZ')),
      new THREE.Vector3(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1),
    ),
  )
  const pos = g.attributes.position as THREE.BufferAttribute
  const n = pos.count
  let y0 = Infinity
  let y1 = -Infinity
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i)
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  const c = new THREE.Color(color)
  const ao = opts.ao ?? 0.2
  const span = Math.max(0.6, Math.min(4, (y1 - y0) * 0.6))
  // A stable per-part tone: a hash of where the part sits.
  const h = Math.abs(Math.sin((opts.x ?? 0) * 12.9898 + (opts.y ?? 0) * 4.1414 + (opts.z ?? 0) * 78.233) * 43758.5453) % 1
  const j = opts.jitter ?? 0.07
  const tone = 1 + (h - 0.5) * 2 * j
  const warm = (((h * 7.31) % 1) - 0.5) * j * 0.5
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, (pos.getY(i) - y0) / span)
    const k = (1 - ao * (1 - t * t * (3 - 2 * t))) * tone
    arr[i * 3] = Math.min(1, c.r * k * (1 + warm))
    arr[i * 3 + 1] = Math.min(1, c.g * k)
    arr[i * 3 + 2] = Math.min(1, c.b * k * (1 - warm))
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}

/** Merge building parts (from `bpart`): indexed, no normals (flat-shaded materials only). */
export function bmerge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)
  if (!g) throw new Error('mergeGeometries failed')
  g.computeBoundingSphere()
  return g
}

/**
 * Ground contact for a whole merged model: everything close to its base (y = 0)
 * is shaded, as if by the soil, the grass and the bounce of light off the ground.
 */
export function groundShade(g: THREE.BufferGeometry, fade = 3.5, strength = 0.28) {
  const pos = g.attributes.position as THREE.BufferAttribute
  const col = g.attributes.color as THREE.BufferAttribute | undefined
  if (!col) return g
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / fade))
    const k = 1 - strength * (1 - t)
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k)
  }
  col.needsUpdate = true
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
