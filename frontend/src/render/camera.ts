import * as THREE from 'three'
import { clamp, lerp } from '../game/noise'
import type { World } from '../game/world'

export const MIN_DIST = 150
/**
 * The commander's view: low behind an army steered by hand, framed by the rule of thirds that most
 * third-person games use: the horizon on the upper third line (two thirds land, one third sky... or
 * far hills), the army on the lower third line, a moderately wide lens. From the lens and those two
 * lines follow the camera's tilt and how far ahead of the army it looks; the distance sets the
 * scale (about 55 m up, 140 m behind the army). It swings round only when the army has turned well
 * away from the view, and then slowly: no lurching.
 */
const CHASE = (() => {
  const fov = 58
  const distance = 300
  // A third of the half-screen above the centre is the upper third line: the horizon goes there.
  const third = Math.tan(((fov / 2) * Math.PI) / 180) / 3
  const pitch = Math.atan(third)
  // ...and the army a third of the half-screen below the centre: twice the tilt below level.
  const up = distance * Math.sin(pitch)
  const back = up / Math.tan(pitch + Math.atan(third))
  return { distance, pitch, ahead: distance * Math.cos(pitch) - back, fov, turnRate: 0.9, startTurn: 0.45, stopTurn: 0.06 }
})()

/**
 * RTS camera: orbits a ground target. In the tilted view, zooming in lowers
 * the pitch for a three-quarter look; the overhead view stays close to
 * straight down at every zoom (easier to read on phones), while castles and
 * soldiers still show their height through perspective.
 */
export class RTSCamera {
  readonly camera: THREE.PerspectiveCamera
  target = new THREE.Vector2(0, 0)
  distance = 700
  yaw = 0
  private goal = { x: 0, z: 0, distance: 700, yaw: 0 }
  private world: World
  readonly maxDist: number
  private keys = new Set<string>()
  /** Near top-down view at every zoom level. */
  overhead = false
  /** The usual field of view (set on resize: wider on tall screens). */
  baseFov = 42
  /** The commander's view (0: off, 1: fully on), easing in and out; and the zoom to return to. */
  private chaseOn = false
  private chaseBlend = 0
  /** How far the commander's view has risen to see over a hill (eased). */
  private lift = 0
  private liftVel = 0
  /** Where the army followed in the commander's view stands (the line of sight must reach it). */
  private chaseAt = { x: 0, z: 0 }
  /** The ground under the army, smoothed: the view rides over hills instead of bobbing with them. */
  private chaseGround: number | null = null
  private lastDt = 1 / 60
  /** Swinging round behind the army (until it is back behind it). */
  private chaseTurning = false
  private savedDistance: number | null = null
  /** The way the map faced before the commander's view (restored when it ends, so north is where it was). */
  private savedYaw: number | null = null
  get chasing() {
    return this.chaseOn
  }
  /** How far into the commander's view the camera has eased (0-1). */
  get chaseAmount() {
    return this.chaseBlend
  }
  /**
   * The commander's view: swing round behind an army steered by hand and look down over its
   * shoulder, a little ahead of it (call every frame while it is steered).
   */
  chase(x: number, z: number, heading: number, dt: number) {
    if (!this.chaseOn) {
      this.chaseOn = true
      this.chaseTurning = false
      this.savedDistance = this.goal.distance
      this.savedYaw = this.goal.yaw
    }
    this.chaseAt.x = x
    this.chaseAt.z = z
    const g = Math.max(0, this.world.heightAt(x, z))
    this.chaseGround = this.chaseGround === null ? g : this.chaseGround + (g - this.chaseGround) * (1 - Math.exp(-dt * 1.6))
    // Look ahead along the way the view faces (not the army's every twitch).
    const fx = -Math.sin(this.goal.yaw)
    const fz = -Math.cos(this.goal.yaw)
    this.goal.x = x + fx * CHASE.ahead
    this.goal.z = z + fz * CHASE.ahead
    this.goal.distance = CHASE.distance
    // The camera sits at (sin yaw, cos yaw) from its target. Behind the army is this yaw:
    const want = Math.atan2(-Math.cos(heading), -Math.sin(heading))
    const diff = Math.atan2(Math.sin(want - this.goal.yaw), Math.cos(want - this.goal.yaw))
    // Only swing round once the army has turned well away, then slowly, until it is behind it again.
    if (Math.abs(diff) > CHASE.startTurn) this.chaseTurning = true
    else if (Math.abs(diff) < CHASE.stopTurn) this.chaseTurning = false
    if (this.chaseTurning) this.goal.yaw += Math.max(-CHASE.turnRate * dt, Math.min(CHASE.turnRate * dt, diff))
  }
  /** Back to the usual view (at the zoom it had before). */
  endChase() {
    if (!this.chaseOn) return
    this.chaseOn = false
    if (this.savedDistance) this.goal.distance = this.savedDistance
    this.savedDistance = null
    // Turn the map back the way it faced before (the short way round).
    if (this.savedYaw !== null) {
      const d = this.savedYaw - this.goal.yaw
      this.goal.yaw += Math.atan2(Math.sin(d), Math.cos(d))
    }
    this.savedYaw = null
    this.chaseGround = null
  }

  constructor(world: World, aspect: number) {
    this.world = world
    this.maxDist = clamp(world.size * 0.55, 1700, 4800)
    this.camera = new THREE.PerspectiveCamera(42, aspect, 2, 12000)
  }

  get pitch() {
    const t = (this.distance - MIN_DIST) / (1700 - MIN_DIST)
    const k = Math.pow(clamp(t, 0, 1), 0.7)
    const base = this.overhead ? lerp(1.08, 1.32, k) : lerp(0.5, 1.12, k)
    return lerp(base, CHASE.pitch, this.chaseBlend)
  }

  jumpTo(x: number, z: number, distance?: number) {
    this.goal.x = this.target.x = x
    this.goal.z = this.target.y = z
    if (distance) this.goal.distance = this.distance = distance
    this.apply()
  }

  focus(x: number, z: number, distance?: number) {
    this.goal.x = x
    this.goal.z = z
    if (distance) this.goal.distance = clamp(distance, MIN_DIST, this.maxDist)
  }

  zoomBy(factor: number, toward?: { x: number; z: number }) {
    const prev = this.goal.distance
    this.goal.distance = clamp(prev * factor, MIN_DIST, this.maxDist)
    if (toward && factor < 1) {
      const k = 1 - this.goal.distance / prev
      this.goal.x += (toward.x - this.goal.x) * k
      this.goal.z += (toward.z - this.goal.z) * k
    }
  }

  panBy(dx: number, dz: number) {
    // Stop at the edge of the map; never overshoot and spring back.
    const lim = this.world.half - 80
    this.goal.x = clamp(this.goal.x + dx, -lim, lim)
    this.goal.z = clamp(this.goal.z + dz, -lim, lim)
    this.target.x = clamp(this.target.x + dx, -lim, lim)
    this.target.y = clamp(this.target.y + dz, -lim, lim)
  }

  rotateBy(a: number) {
    this.goal.yaw += a
  }

  keyDown(code: string) {
    this.keys.add(code)
  }
  keyUp(code: string) {
    this.keys.delete(code)
  }
  clearKeys() {
    this.keys.clear()
  }

  update(dt: number) {
    const speed = this.distance * 1.1 * dt
    let mx = 0
    let mz = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz -= 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz += 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1
    if (this.keys.has('KeyQ')) this.goal.yaw -= dt * 1.4
    if (this.keys.has('KeyE')) this.goal.yaw += dt * 1.4
    if (mx || mz) {
      const c = Math.cos(this.yaw)
      const s = Math.sin(this.yaw)
      // Screen-relative: forward is away from the camera.
      this.goal.x += (mx * c + mz * s) * speed
      this.goal.z += (-mx * s + mz * c) * speed
    }
    const lim = this.world.half - 80
    this.goal.x = clamp(this.goal.x, -lim, lim)
    this.goal.z = clamp(this.goal.z, -lim, lim)
    const k = 1 - Math.exp(-dt * 9)
    // (In the commander's view the picture drifts after the army rather than snapping to it.)
    const kt = this.chaseOn ? 1 - Math.exp(-dt * 4) : k
    this.target.x += (this.goal.x - this.target.x) * kt
    this.target.y += (this.goal.z - this.target.y) * kt
    // The commander's view swings round and settles more gently than a pan or a zoom.
    const kc = this.chaseOn ? 1 - Math.exp(-dt * 4) : k
    this.distance += (this.goal.distance - this.distance) * (this.chaseOn ? 1 - Math.exp(-dt * 3) : k)
    this.yaw += (this.goal.yaw - this.yaw) * kc
    this.chaseBlend += ((this.chaseOn ? 1 : 0) - this.chaseBlend) * (1 - Math.exp(-dt * 2.5))
    this.lastDt = dt
    // A wider lens in the commander's view: more of the land ahead, and a feel for how far it runs.
    const fov = lerp(this.baseFov, Math.max(this.baseFov, CHASE.fov), this.chaseBlend)
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
    this.apply()
  }

  private apply() {
    const p = this.pitch
    // Usually aimed a little into the ground (which flattens hills); low over the land, at the
    // smoothed ground under the army, so the picture does not bob with every rise and dip ahead.
    const tGround = Math.max(0, this.world.heightAt(this.target.x, this.target.y))
    const ty = lerp(tGround * 0.6, this.chaseGround ?? tGround, this.chaseBlend)
    const h = Math.cos(p) * this.distance
    const c = this.camera.position
    c.set(this.target.x + Math.sin(this.yaw) * h, ty + Math.sin(p) * this.distance, this.target.y + Math.cos(this.yaw) * h)
    const ground = this.world.heightAt(c.x, c.z)
    if (this.chaseBlend > 0.05) {
      // Low over the land: rise over a ridge underneath, or a hill between the camera and the army,
      // quickly; sink back slowly. Never jump.
      let need = Math.max(c.y, ground + 30)
      const ax = this.chaseAt.x
      const az = this.chaseAt.z
      const ay = (this.chaseGround ?? Math.max(0, this.world.heightAt(ax, az))) + 6
      for (let i = 1; i < 9; i++) {
        const t = i / 10
        const clear = this.world.heightAt(c.x + (ax - c.x) * t, c.z + (az - c.z) * t) + 8
        // The line's height at t: c.y + (ay - c.y) * t >= clear.
        need = Math.max(need, (clear - ay * t) / (1 - t))
      }
      const want = need - c.y
      const dt = this.lastDt
      // A critically damped spring: it gathers and sheds speed smoothly instead of lurching.
      const k = want > this.lift ? 3 : 1.1
      this.liftVel += ((want - this.lift) * k * k - 2 * k * this.liftVel) * dt
      this.lift += this.liftVel * dt
      c.y += Math.max(0, this.lift)
      // Whatever the easing, never inside the ground.
      if (c.y < ground + 8) c.y = ground + 8
    } else {
      this.lift = 0
      this.liftVel = 0
      // Keep the camera above terrain when zoomed in near hills.
      if (c.y < ground + 60) c.y = ground + 60
    }
    this.camera.lookAt(this.target.x, ty, this.target.y)
  }
}
