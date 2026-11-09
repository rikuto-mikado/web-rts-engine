import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

/** Tilt-shift: blur grows toward the top and bottom of the screen, like a photo of a miniature. */
const TiltShift = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uDir: { value: new THREE.Vector2(1, 0) },
    uAmount: { value: 1 / 600 },
    uFocus: { value: 0.5 },
    uBand: { value: 0.42 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uDir; uniform float uAmount; uniform float uFocus; uniform float uBand;
    varying vec2 vUv;
    void main() {
      float d = abs(vUv.y - uFocus);
      float k = smoothstep(uBand * 0.5, uBand + 0.32, d);
      vec2 step = uDir * uAmount * k * 3.0;
      vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
      c += texture2D(tDiffuse, vUv + step * 1.3846153846) * 0.3162162162;
      c += texture2D(tDiffuse, vUv - step * 1.3846153846) * 0.3162162162;
      c += texture2D(tDiffuse, vUv + step * 3.2307692308) * 0.0702702703;
      c += texture2D(tDiffuse, vUv - step * 3.2307692308) * 0.0702702703;
      gl_FragColor = c;
    }`,
}

/** Colour grade for the diorama look: a touch more saturation and contrast, warm light, cool shade, soft vignette. */
const Grade = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSat: { value: 1.05 },
    uContrast: { value: 1.05 },
    uVignette: { value: 0.28 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uSat; uniform float uContrast; uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      // Split toning: warm highlights, cool shadows.
      c += mix(vec3(-0.012, 0.0, 0.03), vec3(0.03, 0.012, -0.02), smoothstep(0.2, 0.8, l));
      vec2 q = vUv - 0.5;
      c *= 1.0 - uVignette * smoothstep(0.35, 0.95, length(q * vec2(1.25, 1.0)));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
}

/**
 * The "diorama" finish: render → tone mapping → tilt-shift blur (two passes)
 * → colour grade. On phones the blur is skipped (it costs the most).
 */
export class Diorama {
  readonly composer: EffectComposer
  private blurH: ShaderPass
  private blurV: ShaderPass
  private grade: ShaderPass
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, light: boolean) {
    const size = renderer.getSize(new THREE.Vector2())
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: light ? 0 : 4 })
    this.composer = new EffectComposer(renderer, target)
    this.composer.addPass(new RenderPass(scene, camera))
    this.composer.addPass(new OutputPass())
    this.blurH = new ShaderPass(TiltShift)
    this.blurV = new ShaderPass(TiltShift)
    this.blurV.uniforms.uDir.value = new THREE.Vector2(0, 1)
    this.blurH.enabled = this.blurV.enabled = !light
    this.composer.addPass(this.blurH)
    this.composer.addPass(this.blurV)
    this.grade = new ShaderPass(Grade)
    this.composer.addPass(this.grade)
  }
  /** Blur follows the camera: the wide view looks like a miniature; close-ups stay sharp enough to read. */
  setZoom(distance: number) {
    const k = THREE.MathUtils.clamp((distance - 250) / 1000, 0.12, 1)
    for (const p of [this.blurH, this.blurV]) p.uniforms.uAmount.value = (1 / 1150) * k
  }
  setSize(w: number, h: number) {
    this.composer.setSize(w, h)
    this.blurH.uniforms.uAmount.value = 1 / Math.max(400, w * 0.45)
    this.blurV.uniforms.uAmount.value = 1 / Math.max(300, h * 0.6)
  }
  render() {
    this.composer.render()
  }
  dispose() {
    this.composer.dispose()
  }
}
