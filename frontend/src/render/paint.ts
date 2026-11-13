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
 * Shader chunk (inserted after <color_fragment>) that paints the ground in world space, so it never
 * stretches: colour blotches at three scales with a warm/cool drift and brush strokes; in meadows
 * grass blades, tufts and a scatter of wildflowers; on the roads (from the ground map) packed earth,
 * two worn wheel ruts, pebbles and ragged grassy verges; a wet dark line where the water meets the
 * bank and pale sand above it; wind-carved snow; rock strata on steep ground.
 */
export const PAINT_CHUNK = `
{
  vec2 pp = vVisWorld.xz;
  vec4 gm = texture2D(uGround, vVisUv);
  float hW = gm.b * 20.0 - 10.0;
  float big = texture2D(uPaint, pp * 0.0019).r;
  float mid = texture2D(uPaint, pp * 0.011 + vec2(0.21, 0.63)).r;
  float strokes = texture2D(uPaint, pp * 0.0095 + vec2(0.37, 0.11)).g;
  float grain = texture2D(uPaint, pp * 0.055).b;
  float fine = texture2D(uPaint, pp * 0.21 + vec2(0.5)).b;
  vec3 base = diffuseColor.rgb;
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  float sat = max(base.r, max(base.g, base.b)) - min(base.r, min(base.g, base.b));
  float grass = smoothstep(-0.01, 0.05, base.g - max(base.r, base.b));
  float snowy = smoothstep(0.7, 0.84, lum) * (1.0 - smoothstep(0.04, 0.12, sat));
  float tone = (big - 0.5) * 0.3 + (mid - 0.5) * 0.16 + (strokes - 0.5) * 0.3 + (grain - 0.5) * 0.12;
  diffuseColor.rgb *= 1.0 + tone;
  diffuseColor.rgb += vec3(0.045, 0.025, -0.035) * (big - 0.5) * 1.6;
  // Meadows: blades and tufts (dark roots, sunlit tips), now and then a fleck of wildflowers.
  float blades = texture2D(uPaint, vec2(pp.x * 0.16 + pp.y * 0.04, pp.y * 0.07)).b;
  diffuseColor.rgb *= 1.0 + grass * ((blades - 0.5) * 0.2 + (fine - 0.5) * 0.06);
  diffuseColor.rgb += grass * vec3(0.05, 0.06, 0.0) * smoothstep(0.68, 0.85, blades);
  float fl = smoothstep(0.88, 0.92, texture2D(uPaint, pp * 0.37 + vec2(0.13, 0.77)).b) * grass * smoothstep(0.5, 0.62, mid) * (1.0 - gm.r);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.96, 0.86, 0.36), vec3(0.86, 0.58, 0.78), step(0.5, big)), fl * 0.75);
  // Roads: packed earth with two worn ruts, pebbles, and verges where the grass creeps back.
  float verge = smoothstep(0.2, 0.6, gm.r + (strokes - 0.5) * 0.5 + (fine - 0.5) * 0.35);
  float road = verge * (1.0 - snowy * 0.5);
  vec3 earth = base * vec3(1.0, 0.95, 0.88) * (0.95 + (grain - 0.5) * 0.3);
  diffuseColor.rgb = mix(diffuseColor.rgb, earth, road * 0.8);
  diffuseColor.rgb *= 1.0 - gm.g * 0.24 * road;
  diffuseColor.rgb += vec3(0.03, 0.025, 0.015) * smoothstep(0.35, 0.0, gm.g) * road * (grain - 0.3);
  float peb = smoothstep(0.8, 0.86, fine) * road;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.56) * (0.8 + grain * 0.4), peb * 0.8);
  // Banks: a wet dark line at the water's edge, pale dry sand above it.
  float wet = (1.0 - smoothstep(0.0, 0.9, hW)) * step(-0.6, hW);
  float shore = (1.0 - smoothstep(0.8, 3.4, hW + (strokes - 0.5) * 1.6)) * step(0.0, hW);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.04, 0.94) + vec3(0.04, 0.035, 0.02), shore * (1.0 - road) * 0.6);
  diffuseColor.rgb *= 1.0 - wet * 0.25;
  // Snowfields: wind-carved drifts with cool hollows.
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.94, 0.97, 1.04) * (0.94 + strokes * 0.12), snowy);
  // Steep ground: rock strata.
  vec3 fn = normalize(cross(dFdx(vVisWorld), dFdy(vVisWorld)));
  float steep = 1.0 - abs(fn.y);
  float strata = texture2D(uPaint, vec2((vVisWorld.x + vVisWorld.z) * 0.0035, vVisWorld.y * 0.045)).g;
  float ledges = smoothstep(0.55, 0.75, texture2D(uPaint, vec2((vVisWorld.x - vVisWorld.z) * 0.002, vVisWorld.y * 0.11)).g);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (0.74 + strata * 0.4) * (1.0 - ledges * 0.18), smoothstep(0.3, 0.65, steep));
}
`

/**
 * Shader chunk (inserted after <normal_fragment_maps>) that shapes the light on the ground: smooth
 * on gentle slopes, crisp facets on steep rock (the triangle's own face), and a fine micro-relief of
 * clods, tufts and the ruts of the roads, fading out with distance so it never shimmers.
 */
export const RELIEF_CHUNK = `
{
  vec3 wN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  vec3 fN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  float steepN = 1.0 - clamp(wN.y, 0.0, 1.0);
  normal = normalize(mix(normal, fN, smoothstep(0.28, 0.55, steepN)));
  vec2 rp = vVisWorld.xz;
  float hgt = texture2D(uPaint, rp * 0.03).b * 0.35 + texture2D(uPaint, rp * 0.017 + vec2(0.3)).g * 0.65 - texture2D(uGround, vVisUv).g * 0.7;
  vec3 sx = dFdx(-vViewPosition);
  vec3 sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal);
  vec3 r2 = cross(normal, sx);
  float det = dot(sx, r1);
  float fade = 1.0 - smoothstep(250.0, 1100.0, length(vViewPosition));
  vec3 grad = sign(det) * (dFdx(hgt) * r1 + dFdy(hgt) * r2);
  normal = normalize(abs(det) * normal - grad * 0.9 * fade);
}
`
