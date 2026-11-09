import * as THREE from 'three'
import { PAINT_CHUNK } from './paint'

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
}

export function applyVision<T extends THREE.Material>(mat: T, extraFragment = '', snowy = false, painted = false): T {
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
        '#include <common>\nvarying vec2 vVisUv;\nvarying vec3 vVisWorld;\nuniform sampler2D uVision;\nuniform float uTime;\nuniform float uSnow;\nuniform sampler2D uPaint;',
      )
      .replace('#include <color_fragment>', painted ? `#include <color_fragment>\n${PAINT_CHUNK}` : '#include <color_fragment>')
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
  mat.customProgramCacheKey = () => `vision:${extraFragment.length}:${snowy}:${painted}`
  return mat
}
