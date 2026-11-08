import * as THREE from 'three'

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
}

export function applyVision<T extends THREE.Material>(mat: T, extraFragment = '', snowy = false): T {
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
        '#include <common>\nvarying vec2 vVisUv;\nvarying vec3 vVisWorld;\nuniform sampler2D uVision;\nuniform float uTime;\nuniform float uSnow;',
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        ${extraFragment}
        float vis = texture2D(uVision, vVisUv).r;
        float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 grey = mix(vec3(lum), gl_FragColor.rgb, 0.3) * vec3(0.82, 0.87, 1.0);
        float bright = vis < 0.41 ? mix(0.13, 0.52, vis / 0.41) : mix(0.52, 1.0, (vis - 0.41) / 0.59);
        gl_FragColor.rgb = mix(grey, gl_FragColor.rgb, smoothstep(0.45, 0.95, vis)) * bright;`,
      )
  }
  mat.customProgramCacheKey = () => `vision:${extraFragment.length}:${snowy}`
  return mat
}
