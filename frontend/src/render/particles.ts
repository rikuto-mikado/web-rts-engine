import * as THREE from 'three'

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`

const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.15, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}`

export interface ParticleSpec {
  x: number
  y: number
  z: number
  vx?: number
  vy?: number
  vz?: number
  life: number
  size: number
  grow?: number // size change per second
  gravity?: number
  drag?: number
  color: THREE.ColorRepresentation
  alpha?: number
}

/** A fixed-capacity CPU particle pool rendered as soft round sprites. */
export class ParticleSystem {
  readonly points: THREE.Points
  private cap: number
  private pos: Float32Array
  private col: Float32Array
  private size: Float32Array
  private alpha: Float32Array
  private vel: Float32Array
  private life: Float32Array
  private maxLife: Float32Array
  private grow: Float32Array
  private grav: Float32Array
  private drag: Float32Array
  private baseAlpha: Float32Array
  private next = 0
  private tmp = new THREE.Color()
  readonly material: THREE.ShaderMaterial

  constructor(cap: number, additive: boolean) {
    this.cap = cap
    this.pos = new Float32Array(cap * 3)
    this.col = new Float32Array(cap * 3)
    this.size = new Float32Array(cap)
    this.alpha = new Float32Array(cap)
    this.vel = new Float32Array(cap * 3)
    this.life = new Float32Array(cap)
    this.maxLife = new Float32Array(cap)
    this.grow = new Float32Array(cap)
    this.grav = new Float32Array(cap)
    this.drag = new Float32Array(cap)
    this.baseAlpha = new Float32Array(cap)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    this.points = new THREE.Points(geo, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = additive ? 11 : 10
  }

  spawn(p: ParticleSpec) {
    const i = this.next
    this.next = (this.next + 1) % this.cap
    this.pos[i * 3] = p.x
    this.pos[i * 3 + 1] = p.y
    this.pos[i * 3 + 2] = p.z
    this.vel[i * 3] = p.vx ?? 0
    this.vel[i * 3 + 1] = p.vy ?? 0
    this.vel[i * 3 + 2] = p.vz ?? 0
    this.life[i] = p.life
    this.maxLife[i] = p.life
    this.size[i] = p.size
    this.grow[i] = p.grow ?? 0
    this.grav[i] = p.gravity ?? 0
    this.drag[i] = p.drag ?? 0
    this.baseAlpha[i] = p.alpha ?? 1
    this.tmp.set(p.color)
    this.col[i * 3] = this.tmp.r
    this.col[i * 3 + 1] = this.tmp.g
    this.col[i * 3 + 2] = this.tmp.b
  }

  update(dt: number, viewportHeight: number) {
    this.material.uniforms.uScale.value = viewportHeight * 0.9
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0
        continue
      }
      this.life[i] -= dt
      const k = i * 3
      const drag = Math.max(0, 1 - this.drag[i] * dt)
      this.vel[k] *= drag
      this.vel[k + 1] = this.vel[k + 1] * drag - this.grav[i] * dt
      this.vel[k + 2] *= drag
      this.pos[k] += this.vel[k] * dt
      this.pos[k + 1] += this.vel[k + 1] * dt
      this.pos[k + 2] += this.vel[k + 2] * dt
      this.size[i] = Math.max(0, this.size[i] + this.grow[i] * dt)
      const t = this.life[i] / this.maxLife[i]
      // Fade in quickly, fade out slowly.
      this.alpha[i] = this.baseAlpha[i] * Math.min(1, (1 - t) * 8) * Math.min(1, t * 2.2)
    }
    const g = this.points.geometry
    g.attributes.position.needsUpdate = true
    g.attributes.aColor.needsUpdate = true
    g.attributes.aSize.needsUpdate = true
    g.attributes.aAlpha.needsUpdate = true
  }
}
