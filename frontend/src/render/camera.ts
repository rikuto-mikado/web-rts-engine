import * as THREE from 'three'
import { clamp, lerp } from '../game/noise'
import type { World } from '../game/world'

export const MIN_DIST = 150

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

  constructor(world: World, aspect: number) {
    this.world = world
    this.maxDist = clamp(world.size * 0.55, 1700, 4800)
    this.camera = new THREE.PerspectiveCamera(42, aspect, 2, 12000)
  }

  get pitch() {
    const t = (this.distance - MIN_DIST) / (1700 - MIN_DIST)
    const k = Math.pow(clamp(t, 0, 1), 0.7)
    return this.overhead ? lerp(1.08, 1.32, k) : lerp(0.5, 1.12, k)
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
    this.target.x += (this.goal.x - this.target.x) * k
    this.target.y += (this.goal.z - this.target.y) * k
    this.distance += (this.goal.distance - this.distance) * k
    this.yaw += (this.goal.yaw - this.yaw) * k
    this.apply()
  }

  private apply() {
    const p = this.pitch
    const ty = Math.max(0, this.world.heightAt(this.target.x, this.target.y) * 0.6)
    const h = Math.cos(p) * this.distance
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * h,
      ty + Math.sin(p) * this.distance,
      this.target.y + Math.cos(this.yaw) * h,
    )
    // Keep the camera above terrain when zoomed in near hills.
    const ground = this.world.heightAt(this.camera.position.x, this.camera.position.z)
    if (this.camera.position.y < ground + 60) this.camera.position.y = ground + 60
    this.camera.lookAt(this.target.x, ty, this.target.y)
  }
}
