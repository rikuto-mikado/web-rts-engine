import * as THREE from 'three'
import { mulberry32 } from '../game/noise'

/**
 * A tileable "paint" texture for the hand-painted ground, made on a canvas at
 * start-up (no image files):
 *   R: soft colour blotches (big, slow variation)
 *   G: brush strokes laid at a slant
 *   B: fine grain
 * Everything wraps around the edges so it tiles without seams.
 */
export function makePaintTexture(size = 256): THREE.Texture {
  // Pure CPU work on typed arrays: no canvas filters (heavy 2D canvas blurs can
  // stall the GPU process and cost the 3D view its WebGL context).
  const rnd = mulberry32(1247)
  const N = size * size
  const idx = (x: number, y: number) => (((y % size) + size) % size) * size + (((x % size) + size) % size)

  // R: soft blotches — tileable value noise, two octaves.
  const blotch = new Float32Array(N)
  for (const [cells, amp] of [[6, 0.65], [14, 0.35]] as const) {
    const lattice = new Float32Array(cells * cells).map(() => rnd())
    const at = (i: number, j: number) => lattice[((j % cells) + cells) % cells * cells + (((i % cells) + cells) % cells)]
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells
        const fy = (y / size) * cells
        const i0 = Math.floor(fx)
        const j0 = Math.floor(fy)
        const tx = fx - i0
        const ty = fy - j0
        const sx = tx * tx * (3 - 2 * tx)
        const sy = ty * ty * (3 - 2 * ty)
        const a = at(i0, j0) + (at(i0 + 1, j0) - at(i0, j0)) * sx
        const b = at(i0, j0 + 1) + (at(i0 + 1, j0 + 1) - at(i0, j0 + 1)) * sx
        blotch[y * size + x] += (a + (b - a) * sy) * amp
      }
    }
  }

  // G: brush strokes — soft slanted ellipses stamped with wrap-around.
  const strokes = new Float32Array(N).fill(0.5)
  for (let k = 0; k < 900; k++) {
    const cx = rnd() * size
    const cy = rnd() * size
    const len = 5 + rnd() * 13
    const wid = 1.2 + rnd() * 2.2
    const ang = -0.5 + (rnd() - 0.5) * 0.5
    const v = (rnd() - 0.5) * 0.5
    const c = Math.cos(ang)
    const sn = Math.sin(ang)
    const r = Math.ceil(len) + 1
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const u = (dx * c + dy * sn) / len
        const w = (-dx * sn + dy * c) / wid
        const d = u * u + w * w
        if (d >= 1) continue
        const p = idx(Math.round(cx + dx), Math.round(cy + dy))
        strokes[p] += v * (1 - d) * 0.6
      }
    }
  }

  // B: fine grain, lightly smoothed.
  const raw = new Float32Array(N).map(() => rnd())
  const grain = new Float32Array(N)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) sum += raw[idx(x + ox, y + oy)]
      grain[y * size + x] = raw[y * size + x] * 0.5 + (sum / 9) * 0.5
    }
  }

  const to8 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
  const data = new Uint8Array(N * 4)
  for (let i = 0; i < N; i++) {
    data[i * 4] = to8(blotch[i])
    data[i * 4 + 1] = to8(strokes[i])
    data[i * 4 + 2] = to8(grain[i])
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

/**
 * Shader chunk (inserted after <color_fragment>) that paints the ground: colour
 * blotches with a warm/cool drift, brush strokes, grain, and rock strata on
 * steep slopes. Works in world space, so it never stretches.
 */
export const PAINT_CHUNK = `
{
  vec2 pp = vVisWorld.xz;
  float big = texture2D(uPaint, pp * 0.0019).r;
  float strokes = texture2D(uPaint, pp * 0.0095 + vec2(0.37, 0.11)).g;
  float grain = texture2D(uPaint, pp * 0.055).b;
  float tone = (big - 0.5) * 0.3 + (strokes - 0.5) * 0.34 + (grain - 0.5) * 0.12;
  diffuseColor.rgb *= 1.0 + tone;
  diffuseColor.rgb += vec3(0.045, 0.025, -0.035) * (big - 0.5) * 1.6;
  vec3 fn = normalize(cross(dFdx(vVisWorld), dFdy(vVisWorld)));
  float steep = 1.0 - abs(fn.y);
  float strata = texture2D(uPaint, vec2((vVisWorld.x + vVisWorld.z) * 0.0035, vVisWorld.y * 0.045)).g;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (0.78 + strata * 0.38), smoothstep(0.3, 0.65, steep));
}
`
