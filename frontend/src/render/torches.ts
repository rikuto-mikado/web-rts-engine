import * as THREE from 'three'
import { bmerge, bpart, box, cone, cyl } from './geo'
import { applyVision } from './vision'

/**
 * Fire by night: the torches carried by armies on the march (or in a fight), the campfires of armies
 * camped in the open, and the pools of light they throw (handed to the shaders, see vision.ts).
 *
 * A torch is a real object in a soldier's hand: an ash shaft with a pitch-soaked head, raised beside
 * the shield (higher for a rider), turning and bobbing with the figure that carries it. Its flame is
 * a soft additive sprite that flickers and leans with the march, and now and then lets a spark go.
 * A campfire is a ring of stones round crossed logs, with a bigger flame.
 */

const MAX_TORCHES = 2400
const MAX_FIRES = 160
/** Flames that stand alone: the braziers and torches of castles, gates, yards and lists. */
const MAX_POINTS = 1400

/** The torch in a soldier's left hand, out beside the shield, the head leaning a little out and forward. */
const FOOT_TORCH = new THREE.Matrix4().compose(new THREE.Vector3(-1.95, 3.7, 0.55), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.16, 0, 0.2)), new THREE.Vector3(1, 1, 1))
/** A rider holds it higher, from the saddle. */
const RIDER_TORCH = new THREE.Matrix4().compose(new THREE.Vector3(-2.25, 8.4, 0.9), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, 0, 0.26)), new THREE.Vector3(1, 1, 1))
/** Where the flame sits on the torch (its local frame). */
const FLAME_AT = new THREE.Vector3(0, 4.85, 0)

function torchGeometry(): THREE.BufferGeometry {
  return bmerge([
    // The shaft: ash, darker where the hand has held it.
    bpart(cyl(0.1, 0.12, 4.0, 5), 0x6a4a2c, { y: 2.0, ao: 0.2 }),
    bpart(cyl(0.135, 0.135, 0.7, 5), 0x3a2818, { y: 1.3, ao: 0 }),
    // The head: rags wound and soaked in pitch, charred at the top.
    bpart(cyl(0.3, 0.2, 0.75, 6), 0x2c2118, { y: 4.25, ao: 0 }),
    bpart(cyl(0.26, 0.3, 0.18, 6), 0x47351f, { y: 3.92, ao: 0 }),
    // Embers glowing in the head.
    bpart(cyl(0.22, 0.27, 0.12, 6), 0xff7a2a, { y: 4.66, ao: 0 }),
  ])
}

function campfireGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  // A ring of fieldstones.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    parts.push(bpart(box(0.9, 0.55, 0.7), i % 2 ? 0x7a746a : 0x8e877a, { x: Math.cos(a) * 2.1, y: 0.25, z: Math.sin(a) * 2.1, ry: -a, ao: 0.2 }))
  }
  // Crossed logs, and the glowing bed of embers under them.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + 0.3
    parts.push(bpart(cyl(0.22, 0.26, 3.2, 5), i % 2 ? 0x4a3420 : 0x5a3e24, { y: 0.55 + i * 0.12, rz: Math.PI / 2, ry: a, ao: 0 }))
  }
  parts.push(bpart(cyl(1.3, 1.5, 0.2, 8), 0xd8501c, { y: 0.15, ao: 0 }))
  parts.push(bpart(cone(0.9, 0.9, 6), 0xff9a3a, { y: 0.8, ao: 0 }))
  return bmerge(parts)
}

const FLAME_VERT = `
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform float uScale;
varying float vSeed;
varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float fl = 0.86 + 0.1 * sin(uTime * 13.0 + aSeed * 17.0) + 0.06 * sin(uTime * 31.0 + aSeed * 5.0);
  vSeed = aSeed;
  // Far off, the flames shrink to points of light rather than vanishing.
  float d = -mv.z;
  vFade = clamp(1.4 - d / 3200.0, 0.35, 1.0);
  gl_PointSize = max(2.5, aSize * fl * uScale / d);
  gl_Position = projectionMatrix * mv;
}
`
const FLAME_FRAG = `
uniform float uTime;
uniform float uOn;
varying float vSeed;
varying float vFade;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  p.y = -p.y;
  // The flame licks and sways, more at its tip.
  float up = clamp((p.y + 1.0) * 0.5, 0.0, 1.0);
  p.x += sin(uTime * 8.0 + vSeed * 11.0 + p.y * 3.0) * 0.13 * up + sin(uTime * 17.0 + vSeed * 3.0) * 0.04;
  // A teardrop: round at the root, drawn to a point at the top.
  float w = mix(0.5, 0.08, clamp((p.y + 0.35) / 1.25, 0.0, 1.0));
  float body = 1.0 - smoothstep(0.55, 1.0, length(vec2(p.x / w, (p.y + 0.3) * 0.85)));
  float core = 1.0 - smoothstep(0.0, 0.75, length(vec2(p.x / (w * 0.55), (p.y + 0.42) * 1.4)));
  float r = length(p);
  float halo = exp(-r * r * 3.2) * 0.28;
  vec3 col = vec3(1.0, 0.32, 0.05) * body + vec3(1.0, 0.72, 0.3) * core * 0.9 + vec3(1.0, 0.95, 0.75) * core * core * 0.6 + vec3(1.0, 0.45, 0.12) * halo;
  float a = clamp(body * 0.9 + halo + core * 0.4, 0.0, 1.0) * uOn * vFade;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col * uOn * vFade, a);
}
`

/** A pool of light for the shaders: where, how far, how bright, and how much it matters. */
export interface FireLight {
  x: number
  y: number
  z: number
  r: number
  i: number
  /** Armies come before castles and camps when the pools are shared out. */
  weight: number
  seed: number
}

export class Fires {
  readonly group = new THREE.Group()
  private torches: THREE.InstancedMesh
  private fires: THREE.InstancedMesh
  private flames: THREE.Points
  private flamePos: Float32Array
  private flameSeed: Float32Array
  private flameSize: Float32Array
  private flameMat: THREE.ShaderMaterial
  private nTorch = 0
  private nFire = 0
  private nFlame = 0
  private nPoint = 0
  /** The flame positions of this frame (for sparks). */
  readonly sparks: [number, number, number][] = []
  readonly lights: FireLight[] = []
  private m = new THREE.Matrix4()
  private v = new THREE.Vector3()

  constructor() {
    const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }))
    this.torches = new THREE.InstancedMesh(torchGeometry(), mat, MAX_TORCHES)
    this.fires = new THREE.InstancedMesh(campfireGeometry(), mat, MAX_FIRES)
    for (const m of [this.torches, this.fires]) {
      m.count = 0
      m.frustumCulled = false
      m.castShadow = false
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      this.group.add(m)
    }
    // (A campfire burns with two flames.)
    const cap = MAX_TORCHES + MAX_FIRES * 2 + MAX_POINTS
    this.flamePos = new Float32Array(cap * 3)
    this.flameSeed = new Float32Array(cap)
    this.flameSize = new Float32Array(cap)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.flamePos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.flameSeed, 1).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aSize', new THREE.BufferAttribute(this.flameSize, 1).setUsage(THREE.DynamicDrawUsage))
    g.setDrawRange(0, 0)
    this.flameMat = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      uniforms: { uTime: { value: 0 }, uScale: { value: 600 }, uOn: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.flames = new THREE.Points(g, this.flameMat)
    this.flames.frustumCulled = false
    this.flames.renderOrder = 6
    this.group.add(this.flames)
  }

  /** Start a frame: `on` is how much the fires show (0 by day), `scale` pixels per world unit at distance 1. */
  begin(time: number, on: number, scale: number) {
    this.nTorch = this.nFire = this.nFlame = this.nPoint = 0
    this.sparks.length = 0
    this.lights.length = 0
    this.flameMat.uniforms.uTime.value = time
    this.flameMat.uniforms.uOn.value = on
    this.flameMat.uniforms.uScale.value = scale
    this.group.visible = on > 0.01
  }

  private flame(x: number, y: number, z: number, size: number, seed: number) {
    const k = this.nFlame++
    this.flamePos[k * 3] = x
    this.flamePos[k * 3 + 1] = y
    this.flamePos[k * 3 + 2] = z
    this.flameSize[k] = size
    this.flameSeed[k] = seed
  }

  /** A torch in the hand of a figure (its world matrix), on foot or mounted. Returns the flame's position. */
  torch(figure: THREE.Matrix4, mounted: boolean, seed: number): THREE.Vector3 | null {
    if (this.nTorch >= MAX_TORCHES) return null
    this.m.multiplyMatrices(figure, mounted ? RIDER_TORCH : FOOT_TORCH)
    this.torches.setMatrixAt(this.nTorch++, this.m)
    this.v.copy(FLAME_AT).applyMatrix4(this.m)
    this.flame(this.v.x, this.v.y, this.v.z, 4, seed)
    if (this.sparks.length < 64) this.sparks.push([this.v.x, this.v.y, this.v.z])
    return this.v
  }

  /** A campfire on the ground. */
  campfire(x: number, y: number, z: number, seed: number) {
    if (this.nFire >= MAX_FIRES) return
    this.m.makeRotationY(seed * 6.283)
    this.m.setPosition(x, y, z)
    this.fires.setMatrixAt(this.nFire++, this.m)
    this.flame(x, y + 3.2, z, 7.5, seed)
    this.flame(x + 0.7, y + 2.2, z - 0.5, 4.8, seed + 0.37)
    if (this.sparks.length < 64) this.sparks.push([x, y + 3, z])
  }

  /** A flame standing alone (a brazier, a torch in its bracket): `size` as a torch's is 4. */
  flamePoint(x: number, y: number, z: number, size: number, seed: number) {
    if (this.nPoint >= MAX_POINTS) return
    this.nPoint++
    this.flame(x, y, z, size, seed)
    if (this.sparks.length < 64 && size > 5) this.sparks.push([x, y, z])
  }

  /** How many more flames standing alone this frame can take. */
  get pointsLeft(): number {
    return MAX_POINTS - this.nPoint
  }

  light(l: FireLight) {
    this.lights.push(l)
  }

  end() {
    this.torches.count = this.nTorch
    this.fires.count = this.nFire
    if (this.nTorch) this.torches.instanceMatrix.needsUpdate = true
    if (this.nFire) this.fires.instanceMatrix.needsUpdate = true
    const g = this.flames.geometry
    g.setDrawRange(0, this.nFlame)
    if (this.nFlame) {
      ;(g.attributes.position as THREE.BufferAttribute).needsUpdate = true
      ;(g.attributes.aSeed as THREE.BufferAttribute).needsUpdate = true
      ;(g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true
    }
  }
}
