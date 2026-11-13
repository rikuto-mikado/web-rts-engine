import * as THREE from 'three'
import { PAINT_CHUNK, RELIEF_CHUNK } from './paint'

/**
 * Shared uniforms for the fog-of-war overlay. Any material passed to
 * `applyVision` darkens and desaturates areas the player cannot currently see.
 */
export const visionUniforms = {
  uVision: { value: null as THREE.Texture | null },
  uMapHalf: { value: 1200 },
  uTime: { value: 0 },
  /** 0..1 snow cover on the ground and trees (winter). */
  uSnow: { value: 0 },
  /** Tileable paint texture for the hand-painted ground (see paint.ts). */
  uPaint: { value: null as THREE.Texture | null },
  /** Roads, ruts and the height about the water, over the whole map (see ground.ts). */
  uGround: { value: null as THREE.Texture | null },
}

/**
 * Surface grain for buildings: soft world-space noise at a few scales, so a
 * plastered wall, a stone course or a thatched roof shows the hand of its
 * makers instead of a flat fill. Applied to the base colour, before lighting.
 */
const GRAIN_CHUNK = `
  {
    vec3 gp = vVisWorld;
    float g1 = vgNoise(gp * 0.45);
    float g2 = vgNoise(gp * vec3(2.6, 0.7, 2.6));
    float g3 = vgNoise(gp * 6.5);
    float grain = 0.9 + 0.1 * g1 + 0.07 * g2 + 0.05 * g3;
    diffuseColor.rgb *= grain;
    // Weathering: a faint cool-warm drift over larger patches.
    diffuseColor.rgb *= mix(vec3(1.03, 1.0, 0.95), vec3(0.97, 1.0, 1.04), vgNoise(gp * 0.08));
  }
`
const NOISE_FN = `
float vgHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vgNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(vgHash(i), vgHash(i + vec3(1, 0, 0)), f.x), mix(vgHash(i + vec3(0, 1, 0)), vgHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(vgHash(i + vec3(0, 0, 1)), vgHash(i + vec3(1, 0, 1)), f.x), mix(vgHash(i + vec3(0, 1, 1)), vgHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
`

export function applyVision<T extends THREE.Material>(mat: T, extraFragment = '', snowy = false, painted = false, grain = false): T {
  if (snowy) {
    extraFragment += `
      {
        float up = clamp(vVisWorld.y * 0.0 + 1.0, 0.0, 1.0);
        float n = fract(sin(dot(floor(vVisWorld.xz * 0.15), vec2(12.9898, 78.233))) * 43758.5453);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.86, 0.89, 0.94) * (0.92 + n * 0.08), uSnow * up * (0.75 + n * 0.25));
      }`
  }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uVision = visionUniforms.uVision
    shader.uniforms.uMapHalf = visionUniforms.uMapHalf
    shader.uniforms.uTime = visionUniforms.uTime
    shader.uniforms.uSnow = visionUniforms.uSnow
    shader.uniforms.uPaint = visionUniforms.uPaint
    shader.uniforms.uGround = visionUniforms.uGround
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vVisUv;\nvarying vec3 vVisWorld;\nuniform float uMapHalf;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 visWP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          visWP = instanceMatrix * visWP;
        #endif
        visWP = modelMatrix * visWP;
        vVisWorld = visWP.xyz;
        vVisUv = (visWP.xz + uMapHalf) / (2.0 * uMapHalf);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vVisUv;\nvarying vec3 vVisWorld;\nuniform sampler2D uVision;\nuniform float uTime;\nuniform float uSnow;\nuniform sampler2D uPaint;\nuniform sampler2D uGround;' + (grain ? NOISE_FN : ''),
      )
      .replace('#include <color_fragment>', `#include <color_fragment>\n${painted ? PAINT_CHUNK : ''}\n${grain ? GRAIN_CHUNK : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${painted ? RELIEF_CHUNK : ''}`)
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        ${extraFragment}
        // Unexplored land lies under a drifting mist; only faint shapes show through.
        float vis = texture2D(uVision, vVisUv).r;
        // Beyond the map edge is scenery, never fogged (and never stretched from the edge texels).
        vec2 outUv = max(-vVisUv, vVisUv - 1.0);
        vis = max(vis, smoothstep(0.0, 0.012, max(outUv.x, outUv.y)));
        float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        float drift = sin(vVisWorld.x * 0.006 + uTime * 0.12) * sin(vVisWorld.z * 0.007 - uTime * 0.09);
        vec3 mist = vec3(0.70, 0.73, 0.76) * (0.95 + 0.05 * drift);
        vec3 dim = mix(vec3(lum), gl_FragColor.rgb, 0.5) * 0.85;
        vec3 hidden = mix(dim, mist, 0.32);
        gl_FragColor.rgb = mix(hidden, gl_FragColor.rgb, smoothstep(0.1, 0.75, vis));`,
      )
  }
  mat.customProgramCacheKey = () => `vision:${extraFragment.length}:${snowy}:${painted}:${grain}`
  return mat
}
