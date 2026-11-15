import * as THREE from 'three'
import { PAINT_CHUNK, RELIEF_CHUNK } from './paint'

/**
 * Shared uniforms for the fog-of-war overlay. Any material passed to
 * `applyVision` darkens and desaturates areas the player cannot currently see.
 */
/**
 * Torch and fire light: how many pools of firelight the shaders take at once (the nearest to the
 * view). Phones and tablets take half as many, to spare their GPUs.
 */
export const TORCH_SLOTS = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 8 : 16

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
  /** Pools of firelight: centre (xyz) and reach (w; 0 = unused), and their strength. */
  uTorchP: { value: Array.from({ length: TORCH_SLOTS }, () => new THREE.Vector4()) },
  uTorchI: { value: new Array<number>(TORCH_SLOTS).fill(0) },
  /** How much the fires show: 0 by day, 1 at night. */
  uTorchOn: { value: 0 },
  /** How dark the night is (0 by day): the moonlit colour grade. */
  uNight: { value: 0 },
}

/**
 * Firelight: each pool lights what lies inside its reach with a warm, flickering glow that falls
 * off softly to its edge and favours the faces turned towards it. It is added to the light the
 * surface already has (moonlight), so torches carry a column through the dark and campfires light
 * the tents round them. The facet normal comes from the screen derivatives, which suits the
 * flat-shaded world (and works for unlit materials too).
 */
const TORCH_UNIFORMS = `\nuniform vec4 uTorchP[${TORCH_SLOTS}];\nuniform float uTorchI[${TORCH_SLOTS}];\nuniform float uTorchOn;\nuniform float uNight;`
const TORCH_CHUNK = `
  // Moonlight drains the colour from the land (the firelight added after keeps its warmth).
  if (uNight > 0.001) {
    float nl = dot(outgoingLight, vec3(0.3, 0.59, 0.11));
    outgoingLight = mix(outgoingLight, nl * vec3(0.7, 0.82, 1.08), 0.5 * uNight);
  }
  if (uTorchOn > 0.001) {
    vec3 tdx = dFdx(vVisWorld);
    vec3 tdy = dFdy(vVisWorld);
    vec3 tn = cross(tdx, tdy);
    float tnl = length(tn);
    tn = tnl > 1e-6 ? tn / tnl : vec3(0.0, 1.0, 0.0);
    if (dot(tn, cameraPosition - vVisWorld) < 0.0) tn = -tn;
    float tl = 0.0;
    for (int i = 0; i < ${TORCH_SLOTS}; i++) {
      vec4 tp = uTorchP[i];
      if (tp.w <= 0.0) continue;
      vec3 td = tp.xyz - vVisWorld;
      float tq = dot(td, td) / (tp.w * tp.w);
      if (tq >= 1.0) continue;
      float tf = 1.0 - tq;
      tf *= tf;
      float lam = 0.3 + 0.7 * max(dot(tn, normalize(td)), 0.0);
      tl += tf * lam * uTorchI[i];
    }
    outgoingLight += diffuseColor.rgb * vec3(1.0, 0.44, 0.14) * min(tl, 1.8) * uTorchOn * 1.9;
  }
`

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
    shader.uniforms.uTorchP = visionUniforms.uTorchP
    shader.uniforms.uTorchI = visionUniforms.uTorchI
    shader.uniforms.uTorchOn = visionUniforms.uTorchOn
    shader.uniforms.uNight = visionUniforms.uNight
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
        '#include <common>\nvarying vec2 vVisUv;\nvarying vec3 vVisWorld;\nuniform sampler2D uVision;\nuniform float uTime;\nuniform float uSnow;\nuniform sampler2D uPaint;\nuniform sampler2D uGround;' + TORCH_UNIFORMS + (grain ? NOISE_FN : ''),
      )
      .replace('#include <color_fragment>', `#include <color_fragment>\n${painted ? PAINT_CHUNK : ''}\n${grain ? GRAIN_CHUNK : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${painted ? RELIEF_CHUNK : ''}`)
      .replace('#include <opaque_fragment>', `${TORCH_CHUNK}\n#include <opaque_fragment>`)
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
  mat.customProgramCacheKey = () => `vision2:${extraFragment.length}:${snowy}:${painted}:${grain}`
  return mat
}
