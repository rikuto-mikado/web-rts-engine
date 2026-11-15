import * as THREE from 'three'
import { CORONATION, SPY, HIDING_KEYS, HOLDINGS, PLAYER, type GameEngine } from '../game/engine'
import { FORMATIONS } from '../game/formations'
import { clamp } from '../game/noise'
import { fmt, totalInt } from '../game/troops'
import type { Army, Castle, GameEvent } from '../game/types'
import { castleRadius, holdingRadius, villageRadius } from '../game/world'
import { ArmyRenderer } from './armies'
import { RTSCamera } from './camera'
import { CastleView, setLampsLit } from './castles'
import { OutpostRenderer } from './outposts'
import { ConvoyRenderer } from './convoys'
import { buildRamparts } from './ramparts'
import { buildIce } from './ice'
import { buildRifts } from './rifts'
import { buildCityWalls, cityBuild } from './city'
import { ObstacleRenderer } from './obstacles'
import { EngineRenderer } from './engines'
import { SiteRenderer } from './sites'
import { GrangeRenderer } from './grange'
import { TempleRenderer } from './temple'
import { TEMPLE } from '../game/sanctuary'
import { GRANGE } from '../game/granary'
import { chargeForTeam, shieldSvg } from './heraldry'
import { glyphSvg } from './glyphs'
import { ParticleSystem } from './particles'
import { buildWoods } from './woods'
import type { FortStyle } from './fortress'
import { bridgeMesh, buildBridges, buildFeatures, buildFords, buildSkirt, buildStoneBridges, buildTown, buildVegetation, buildWalls, buildWater, clearVegetation, terrainBuild, updateTreeShadows } from './terrain'
import { TORCH_SLOTS, visionUniforms } from './vision'
import { Fires, type FireLight } from './torches'
import { makePaintTexture } from './paint'
import { makeGroundMap } from './ground'
import { Diorama } from './postfx'

/** One step of raising the map (see GameRenderer.buildStages). */
export interface RenderStage {
  label: string
  run: () => void
  /** Roughly how long it takes, against the others (for the progress bar). */
  weight: number
}

export type Selection = { kind: 'army'; id: string } | { kind: 'castle'; id: string } | { kind: 'outpost'; id: string } | { kind: 'convoy'; id: string } | { kind: 'site'; id: string } | { kind: 'grange'; id: string } | null
export type PickTarget = Selection

interface Label {
  el: HTMLDivElement
  key: string
}

interface FloatText {
  el: HTMLDivElement
  x: number
  y: number
  z: number
  age: number
}

const SUN_DIR = new THREE.Vector3(-0.55, 0.78, 0.32).normalize()
/** The low sun of a golden evening (or a morning): long shadows across the land. */
const LOW_SUN = new THREE.Vector3(-0.86, 0.3, 0.42).normalize()
/** The moon: high and a little to the south-east, so the night still has its shadows. */
const MOON_DIR = new THREE.Vector3(0.42, 0.82, -0.38).normalize()

const NIGHT_SKY = new THREE.Color(0x1a2233)
/** The sky and the haze of dusk and dawn. */
const DUSK_SKY = new THREE.Color(0xc98458)
const DAY_SUN = new THREE.Color(1, 0.94, 0.84)
const DUSK_SUN = new THREE.Color(1, 0.6, 0.32)
const MOON = new THREE.Color(0.6, 0.7, 0.98)
const DAY_HEMI = new THREE.Color(0xc4dbff)
const NIGHT_HEMI = new THREE.Color(0x5d74a8)

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly cam: RTSCamera
  private engine: GameEngine
  private host: HTMLElement
  private overlay: HTMLElement
  private sun: THREE.DirectionalLight
  private castles = new Map<string, CastleView>()
  private armies: ArmyRenderer
  /** Torches, campfires and the pools of firelight by night. */
  private fires = new Fires()
  /** How much the fires show (eased: 0 by day, 1 at night). */
  private fireOn = 0
  /** Where the light comes from now: the sun's arc by day, the low sun at dusk, the moon by night. */
  private sunDir = SUN_DIR.clone()
  private lightOrder: FireLight[] = []
  private outposts: OutpostRenderer
  private vegetation!: THREE.Group
  private woods: THREE.Group | null = null
  /** Ground the royal cities' countryside took, and their chimneys. */
  private cityCleared: { x: number; z: number; r: number }[] = []
  private citySmoke: [number, number, number][] = []
  private cityTrees: THREE.Object3D[] = []
  private frustum = new THREE.Frustum()
  private viewProj = new THREE.Matrix4()
  private viewSphere = new THREE.Sphere()
  private viewPoint = new THREE.Vector3()
  private clearedKey = ''
  private convoys: ConvoyRenderer
  private diorama: Diorama | null = null
  private obstacles: ObstacleRenderer
  private siegeEngines: EngineRenderer
  private sites: SiteRenderer
  /** The granges (raised with the map, in a build stage of their own). */
  private granges: GrangeRenderer | null = null
  /** The Sanctuary of the High King (Alliance War, when the High King's Blessing is chosen). */
  private temple: TempleRenderer | null = null
  private bridgeGroup!: THREE.Group
  private bridgeDown = new Set<number>()
  private dust: ParticleSystem
  private glow: ParticleSystem
  private precip: ParticleSystem
  private hemi: THREE.HemisphereLight
  private baseFog = new THREE.Color()
  private lightning = 0
  /** Night mode (easier on the eyes after dark): 0 = day, 1 = moonlight. Eased towards the target. */
  private night = 0
  private nightTarget = 0
  setNight(on: boolean) {
    this.nightTarget = on ? 1 : 0
  }
  private visionTex: THREE.DataTexture
  private visionVersion = -1
  private labels = new Map<string, Label>()
  private floats: FloatText[] = []
  private selRing: THREE.Mesh
  private hoverRing: THREE.Mesh
  private pathLine: THREE.Line
  private markerPool: THREE.Mesh[] = []
  private clickMarkers: { mesh: THREE.Mesh; age: number }[] = []
  private time = 0
  private labelTick = 0
  private raycaster = new THREE.Raycaster()
  private disposed = false
  private resizeObs: ResizeObserver

  selection: Selection = null
  /** Deep Freeze: the ice on the rivers (faded in while they are frozen). */
  private ice: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial } | null = null
  /** Fewer soldier figures on phones and tablets. */
  private densityScale = 1
  hover: PickTarget = null
  /** Visual effects are only spawned for events the player can see. */
  private pendingEvents: GameEvent[] = []

  constructor(host: HTMLElement, overlay: HTMLElement, engine: GameEngine) {
    this.engine = engine
    this.host = host
    this.overlay = overlay
    const world = engine.world

    const mobile = window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600
    this.renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 1.75))
    this.renderer.setSize(host.clientWidth, host.clientHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    visionUniforms.uPaint.value ??= makePaintTexture()
    host.appendChild(this.renderer.domElement)
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost)
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored)
    this.renderer.domElement.style.display = 'block'

    this.cam = new RTSCamera(world, host.clientWidth / Math.max(1, host.clientHeight))
    // The diorama finish (tilt-shift and colour grade); phones skip the blur.
    // If the post-processing cannot start here, fall back to the plain look rather than failing.
    try {
      this.diorama = new Diorama(this.renderer, this.scene, this.cam.camera, mobile)
      this.diorama.setSize(host.clientWidth, host.clientHeight)
    } catch (e) {
      console.warn('Diorama effects unavailable, using the plain renderer.', e)
      this.diorama = null
    }
    this.densityScale = mobile ? 0.6 : 1

    const fogColor = new THREE.Color(world.biome.fog)
    this.scene.background = fogColor
    this.scene.fog = new THREE.Fog(fogColor, 900, 3200)

    this.hemi = new THREE.HemisphereLight(0xc4dbff, 0x4a3b28, 0.95)
    this.scene.add(this.hemi)
    this.baseFog.copy(fogColor)
    this.sun = new THREE.DirectionalLight(0xfff0d6, 2.6)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048)
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 0.6
    this.scene.add(this.sun, this.sun.target)

    this.visionTex = new THREE.DataTexture(engine.visionTex, engine.visRes, engine.visRes, THREE.RedFormat, THREE.UnsignedByteType)
    this.visionTex.magFilter = THREE.LinearFilter
    this.visionTex.minFilter = THREE.LinearFilter
    this.visionTex.needsUpdate = true
    visionUniforms.uVision.value = this.visionTex
    visionUniforms.uMapHalf.value = world.half

    this.mobile = mobile

    this.armies = new ArmyRenderer(engine)
    this.scene.add(this.armies.group)
    this.scene.add(this.fires.group)
    this.armies.fires = this.fires
    this.outposts = new OutpostRenderer(engine)
    this.scene.add(this.outposts.group)
    this.convoys = new ConvoyRenderer(engine)
    this.scene.add(this.convoys.group)
    this.obstacles = new ObstacleRenderer(engine)
    this.scene.add(this.obstacles.group)
    this.siegeEngines = new EngineRenderer(engine)
    this.scene.add(this.siegeEngines.group)
    this.sites = new SiteRenderer(engine)
    this.scene.add(this.sites.group)

    this.dust = new ParticleSystem(5000, false)
    this.glow = new ParticleSystem(3000, true)
    this.precip = new ParticleSystem(mobile ? 2500 : 6000, false)
    this.scene.add(this.dust.points, this.glow.points, this.precip.points)

    const ringGeo = new THREE.RingGeometry(0.86, 1, 48)
    ringGeo.rotateX(-Math.PI / 2)
    this.selRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xf5c542, transparent: true, opacity: 0.9, depthWrite: false }))
    this.hoverRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }))
    this.selRing.renderOrder = this.hoverRing.renderOrder = 5
    this.scene.add(this.selRing, this.hoverRing)

    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 256), 3))
    lineGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3 * 256), 3))
    this.pathLine = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: 0xffffff, vertexColors: true, dashSize: 8, gapSize: 6, transparent: true, opacity: 0.9, depthTest: false }))
    this.pathLine.frustumCulled = false
    this.pathLine.renderOrder = 6
    this.scene.add(this.pathLine)


    const home = engine.castle(engine.state.factions[PLAYER]?.capitalId) ?? engine.state.castles.find((c) => c.faction === PLAYER) ?? engine.state.castles[0]
    // Convoy Raid: open on our own forces (the escort by the caravanserai, or the raiders' first camp).
    const lead = engine.state.train ? engine.state.armies.find((a) => a.faction === PLAYER) : undefined
    this.opening = lead ? { x: lead.x, z: lead.z + 60, d: 560 } : { x: home.x + 60, z: home.z - 120, d: 620 }
    this.cam.jumpTo(this.opening.x, this.opening.z, this.opening.d)

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(host)
  }

  private mobile = false
  private built = false
  /** Where the war opens: over our seat of power (or our first band on the forest road). */
  private opening = { x: 0, z: 0, d: 620 }

  /** The curtain rises: come down from high over the opening view (a plain cut if motion is reduced). */
  reveal() {
    const o = this.opening
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.cam.jumpTo(o.x, o.z, o.d)
    else this.cam.descend(o.x, o.z, o.d * 2.6, o.d, 2.6)
  }

  /**
   * The heavy part of raising the map, stage by stage: the loading screen draws a frame between
   * stages (everything here runs on the main thread, so a single long build would freeze it).
   * Run every stage, in order, before the first render.
   */
  buildStages(): RenderStage[] {
    const engine = this.engine
    const world = engine.world
    const mobile = this.mobile
    const royal = world.towns.some((t) => t.poly)
    const castles = engine.state.castles
    // Weights: roughly the time each stage takes (in tenths of a second, measured on the Three
    // Crowns), so the bar moves at an even pace whatever the map.
    const ground = terrainBuild(world, 6)
    const stages: RenderStage[] = [
      {
        label: 'Surveying the land',
        weight: 0.5,
        run: () => {
          // Roads, ruts and the water line, per pixel (for the painted ground and the water).
          visionUniforms.uGround.value?.dispose()
          visionUniforms.uGround.value = makeGroundMap(world, mobile ? 768 : 1024)
        },
      },
      ...ground.steps.map((run) => ({ label: 'Shaping the hills', weight: 3, run })),
      {
        label: 'Shaping the hills',
        weight: 1,
        run: () => {
          this.scene.add(ground.mesh())
          this.scene.add(buildSkirt(world))
        },
      },
      {
        label: 'Filling the rivers',
        weight: 0.7,
        run: () => {
          this.scene.add(buildWater(world))
          this.bridgeGroup = buildBridges(world)
          this.scene.add(this.bridgeGroup)
          this.scene.add(buildFords(world))
          this.scene.add(buildStoneBridges(world))
          this.ice = buildIce(world)
          if (this.ice) this.scene.add(this.ice.mesh)
        },
      },
      {
        label: 'Planting the forests',
        weight: 2,
        run: () => {
          this.vegetation = buildVegetation(world)
          this.scene.add(this.vegetation)
          this.scene.add(buildFeatures(world))
          this.woods = buildWoods(world)
          this.scene.add(this.woods)
        },
      },
      {
        label: 'Raising the walls',
        weight: royal ? 6.5 : 1,
        run: () => {
          // A royal city gets its monumental walls and streets; older circular towns keep the simple ones.
          this.scene.add(royal ? buildCityWalls(world) : buildWalls(world))
          this.scene.add(buildRamparts(world))
        },
      },
    ]
    if (royal) {
      // Each royal city in the style of the realm that holds it; its countryside keeps clear of the
      // rifts of the Long Night.
      const styles = world.towns.map((t) => {
        const keep = castles.find((c) => c.id === t.keep)
        const team = keep ? engine.team(keep.faction) : 'A'
        return (team === 'B' ? 'thorn' : team === 'C' ? 'sun' : team === 'A' ? 'crown' : 'free') as FortStyle
      })
      const rifts = (engine.state.rules.night?.rifts ?? []).map((r: { x: number; z: number }) => ({ x: r.x, z: r.z, r: 260 }))
      const city = cityBuild(world, mobile, styles, rifts)
      for (const st of city.steps) stages.push({ ...st, weight: 4 })
      stages.push({
        label: 'Lighting the hearths',
        weight: 0.1,
        run: () => {
          city.group.traverse((o) => {
            if (o.name === 'city-trees') this.cityTrees.push(o)
          })
          this.cityCleared = city.group.userData.cleared ?? []
          this.citySmoke = city.group.userData.smoke ?? []
          this.scene.add(city.group)
          if (engine.state.rules.night) this.scene.add(buildRifts(world, engine.state.rules.night.rifts))
        },
      })
    } else
      stages.push({
        label: 'Building the town',
        weight: 1,
        run: () => {
          this.scene.add(buildTown(world, mobile))
          if (engine.state.rules.night) this.scene.add(buildRifts(world, engine.state.rules.night.rifts))
        },
      })
    if (engine.state.granges?.length)
      stages.push({
        label: 'Raising the granges',
        weight: engine.state.granges.length * 0.4,
        run: () => {
          this.granges = new GrangeRenderer(engine)
          this.scene.add(this.granges.group)
        },
      })
    if (engine.state.sanctuary)
      stages.push({
        label: 'Raising the Sanctuary',
        weight: 1,
        run: () => {
          this.temple = new TempleRenderer(engine)
          this.scene.add(this.temple.group)
        },
      })
    // The castles in small batches (a big map has dozens, and the great seats are heavy): a batch
    // closes once it holds about a quarter of a second of work (measured: a gatehouse or a village
    // takes a few milliseconds, a castle about 70, a seat of power nearly 200).
    const cost = (c: Castle) => (c.gate ? 0.04 : c.village ? 0.08 : c.capital ? 1.8 : 0.7)
    let batch: Castle[] = []
    let load = 0
    const close = () => {
      if (!batch.length) return
      const these = batch
      stages.push({ label: 'Manning the castles', weight: load, run: () => these.forEach((c) => this.buildCastle(c)) })
      batch = []
      load = 0
    }
    for (const c of castles) {
      batch.push(c)
      load += cost(c)
      if (load >= 2.5) close()
    }
    close()
    stages.push({
      label: 'Lighting the torches',
      weight: 0.6,
      run: () => {
        // Compile every shader now rather than stalling on the first frames of play.
        this.cam.update(0)
        this.renderer.compile(this.scene, this.cam.camera)
        this.built = true
      },
    })
    return stages
  }

  private buildCastle(c: Castle) {
    const old = this.castles.get(c.id)
    if (old) {
      this.scene.remove(old.group)
      old.dispose()
    }
    const v = new CastleView(c, this.engine.world, this.engine.factionColor(c.faction), this.styleOf(c))
    this.castles.set(c.id, v)
    this.scene.add(v.group)
  }

  /** How a castle is built: in the way of the realm that holds it. */
  private styleOf(c: Castle): FortStyle {
    if (c.faction === 'neutral') return 'free'
    const t = this.engine.team(c.faction)
    return t === 'A' ? 'crown' : t === 'B' ? 'thorn' : t === 'C' ? 'sun' : 'free'
  }

  private resize() {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h)
    this.diorama?.setSize(w, h)
    const aspect = w / h
    this.cam.camera.aspect = aspect
    // Keep the horizontal view wide on tall (portrait) screens instead of
    // cropping the sides: widen the vertical field of view to compensate.
    const base = 42
    const ref = 1.25
    this.cam.baseFov = aspect >= ref ? base : Math.min(78, (2 * Math.atan((Math.tan(((base / 2) * Math.PI) / 180) * ref) / aspect) * 180) / Math.PI)
    this.cam.camera.fov = this.cam.baseFov
    // A side panel covers part of the screen: centre the view on what is left.
    if (this.rightInset > 0) this.cam.camera.setViewOffset(w, h, Math.round(this.rightInset / 2), 0, w, h)
    else this.cam.camera.clearViewOffset()
    this.cam.camera.updateProjectionMatrix()
  }

  /** Overhead (near top-down) or tilted camera. */
  setOverhead(on: boolean) {
    this.cam.overhead = on
  }

  /** Keep trees and rocks out of villages, holdings, mines, lumber camps and outposts (re-checked as outposts come and go). */
  private clearGrounds() {
    const s = this.engine.state
    const key = s.outposts.map((o) => o.id).join(',') + '|' + s.castles.reduce((n, c) => n + c.tier, 0) + '|' + (s.granges?.length ?? 0)
    if (key === this.clearedKey) return
    this.clearedKey = key
    const circles: { x: number; z: number; r: number }[] = []
    for (const c of s.castles) if (c.village) circles.push({ x: c.x, z: c.z, r: villageRadius(c.tier) * 1.5 })
    // A royal city's gate towns and farmland, and a castle's country (its suburbs, fields and
    // orchards), are cleared land.
    circles.push(...this.cityCleared)
    for (const c of s.castles) if (!c.village && this.engine.world.walls.has(c.id)) circles.push({ x: c.x, z: c.z, r: castleRadius(c.tier) * 2.15 })
    for (const r of s.sites ?? []) circles.push({ x: r.x, z: r.z, r: r.kind === 'mine' ? 34 : 22 })
    for (const g of s.granges ?? []) circles.push({ x: g.x, z: g.z, r: GRANGE.clear })
    if (s.sanctuary) circles.push({ x: s.sanctuary.x, z: s.sanctuary.z, r: 120 })
    const OUTPOST_R: Record<string, number> = { castrum: 80, laager: 54, redoubt: 60, pavilion: 44, depot: 66 }
    for (const o of s.outposts) circles.push({ x: o.x, z: o.z, r: OUTPOST_R[o.kind] ?? 60 })
    clearVegetation(this.vegetation, circles)
    if (this.woods) clearVegetation(this.woods, circles)
  }

  private rightInset = 0
  /** Pixels at the right of the screen hidden behind UI (the phone selection panel). */
  setRightInset(px: number) {
    const v = Math.max(0, Math.round(px))
    if (v === this.rightInset) return
    this.rightInset = v
    this.resize()
  }

  /** Free every GPU resource and the WebGL context itself (browsers allow only a few). */
  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.resizeObs.disconnect()
    const canvas = this.renderer.domElement
    canvas.removeEventListener('webglcontextlost', this.onContextLost)
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    const materials = new Set<THREE.Material>()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => materials.add(x))
      else if (mat) materials.add(mat)
    })
    for (const mat of materials) mat.dispose()
    this.visionTex.dispose()
    this.diorama?.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    canvas.remove()
    this.overlay.innerHTML = ''
  }

  /** Called when the GPU drops our context; rendering pauses until it is restored. */
  onContextChange?: (lost: boolean) => void
  private contextLost = false
  private onContextLost = (e: Event) => {
    // Ask the browser to restore the context instead of giving up on the page.
    e.preventDefault()
    this.contextLost = true
    this.onContextChange?.(true)
  }
  private onContextRestored = () => {
    this.contextLost = false
    this.visionTex.needsUpdate = true
    this.onContextChange?.(false)
  }

  pushEvents(events: GameEvent[]) {
    this.pendingEvents.push(...events)
  }

  // -------------------------------------------------------------------------
  // Picking
  // -------------------------------------------------------------------------

  /** Intersect a screen point with the terrain (ray-marched height field). */
  /**
   * The point under the cursor on a level plane at height y. Dragging the map holds on to this
   * rather than to the ground itself: over a ridge, the ground under the finger can leap from this
   * slope to the land behind it, and the map would leap with it.
   */
  planeAt(clientX: number, clientY: number, y: number): { x: number; z: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.cam.camera)
    const p = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p)) return null
    return { x: p.x, z: p.z }
  }
  groundAt(clientX: number, clientY: number): { x: number; z: number; y: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.cam.camera)
    const { origin, direction } = this.raycaster.ray
    const world = this.engine.world
    let prev = 0
    for (let t = 0; t < 8000; t += 6) {
      const x = origin.x + direction.x * t
      const y = origin.y + direction.y * t
      const z = origin.z + direction.z * t
      if (y <= Math.max(0, world.heightAt(x, z))) {
        let lo = prev
        let hi = t
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2
          const mx = origin.x + direction.x * mid
          const my = origin.y + direction.y * mid
          const mz = origin.z + direction.z * mid
          if (my <= Math.max(0, world.heightAt(mx, mz))) hi = mid
          else lo = mid
        }
        return { x: origin.x + direction.x * hi, z: origin.z + direction.z * hi, y: origin.y + direction.y * hi }
      }
      prev = t
    }
    return null
  }

  private toScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.cam.camera)
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, visible: v.z < 1 && v.z > -1 }
  }

  pick(clientX: number, clientY: number): PickTarget {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    let best: PickTarget = null
    let bestD = 34
    for (const a of this.engine.state.armies) {
      const v = this.armies.visuals.get(a.id)
      if (!v || !v.seen) continue
      const p = this.toScreen(v.x, this.engine.world.surfaceAt(v.x, v.z) + 4, v.z)
      const d = Math.hypot(p.x - sx, p.y - sy)
      if (d < bestD) {
        bestD = d
        best = { kind: 'army', id: a.id }
      }
    }
    if (best) return best
    const g = this.groundAt(clientX, clientY)
    if (g) {
      const w = this.convoys.nearest(g.x, g.z, 30)
      if (w) return { kind: 'convoy', id: w.id }
      if (!this.engine.isExplored(g.x, g.z)) return null
      const c = this.engine.castleAt(g.x, g.z, 10)
      if (c) return { kind: 'castle', id: c.id }
      const o = this.engine.state.outposts.find((o) => Math.hypot(o.x - g.x, o.z - g.z) < 40)
      if (o) return { kind: 'outpost', id: o.id }
      const site = (this.engine.state.sites ?? []).find((x) => Math.hypot(x.x - g.x, x.z - g.z) < 30)
      if (site) return { kind: 'site', id: site.id }
      const gr = (this.engine.state.granges ?? []).find((x) => Math.hypot(x.x - g.x, x.z - g.z) < GRANGE.outerZ)
      if (gr) return { kind: 'grange', id: gr.id }
    }
    return null
  }

  spawnClickMarker(x: number, z: number, color: number) {
    const geo = new THREE.RingGeometry(6, 8, 32)
    geo.rotateX(-Math.PI / 2)
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false }))
    mesh.position.set(x, this.engine.world.surfaceAt(x, z) + 1, z)
    mesh.renderOrder = 7
    this.scene.add(mesh)
    this.clickMarkers.push({ mesh, age: 0 })
  }

  /** Ground-plane footprint of the camera view, for the minimap. */
  footprint(): [number, number][] {
    const out: [number, number][] = []
    const cam = this.cam.camera
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -20)
    for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      this.raycaster.setFromCamera(new THREE.Vector2(x, y), cam)
      const p = new THREE.Vector3()
      if (this.raycaster.ray.intersectPlane(plane, p)) out.push([p.x, p.z])
      else {
        const d = this.raycaster.ray.direction
        out.push([cam.position.x + d.x * 4000, cam.position.z + d.z * 4000])
      }
    }
    return out
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  render(dt: number) {
    // (Nothing to show until the map is raised.)
    if (!this.built) return
    if (this.ice) {
      const want = this.engine.world.frozen ? 0.98 : 0
      const m = this.ice.mat
      m.opacity += (want - m.opacity) * (1 - Math.exp(-dt * 1.6))
      this.ice.mesh.visible = m.opacity > 0.01
    }
    if (this.disposed || this.contextLost) return
    this.time += dt
    visionUniforms.uTime.value = this.time
    const engine = this.engine
    this.cam.update(dt)
    const target = this.cam.target
    // Fire by night: lit at dusk, out at dawn (and always on the Long Night).
    const dark = engine.daylight().dark
    this.fireOn += (clamp((dark - 0.1) / 0.5, 0, 1) - this.fireOn) * (1 - Math.exp(-dt * 1.5))
    const camFov = THREE.MathUtils.degToRad(this.cam.camera.fov)
    setLampsLit(this.fireOn)
    this.fires.begin(this.time, this.fireOn, (this.host.clientHeight * this.renderer.getPixelRatio()) / (2 * Math.tan(camFov / 2)))
    this.armies.fireOn = this.fireOn

    // Shadow frustum follows the camera target.
    const ext = clamp(this.cam.distance * 0.95, 260, 1100)
    const sc = this.sun.shadow.camera
    if (sc.right !== ext) {
      sc.left = -ext
      sc.right = ext
      sc.top = ext
      sc.bottom = -ext
      sc.near = 10
      sc.far = 3000
      sc.updateProjectionMatrix()
    }
    // Trees cast shadows only where the shadow map reaches (and a little beyond, for long shadows).
    updateTreeShadows(this.vegetation, target.x, target.y, ext * 1.25)
    if (this.woods) updateTreeShadows(this.woods, target.x, target.y, ext * 1.25)
    for (const t of this.cityTrees) updateTreeShadows(t, target.x, target.y, ext * 1.25)
    this.sun.target.position.set(target.x, 0, target.y)
    this.sun.position.set(target.x + this.sunDir.x * 1200, this.sunDir.y * 1200, target.y + this.sunDir.z * 1200)
    const fog = this.scene.fog as THREE.Fog
    // The commander's view looks out low over the land: the haze draws back so the far ground shows.
    const look = this.cam.chaseAmount
    fog.near = this.cam.distance * 1.15 + look * 1500
    fog.far = this.cam.distance * 3.6 + 600 + look * 5600

    if (engine.visionVersion !== this.visionVersion) {
      this.visionVersion = engine.visionVersion
      this.visionTex.needsUpdate = true
    }

    // What the camera sees: castles off screen or far away skip their flags, sails and smoke.
    const cam = this.cam.camera
    cam.updateMatrixWorld()
    this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.viewProj)
    const farOff = Math.max(2600, this.cam.distance * 2.6)
    for (const c of engine.state.castles) {
      const v = this.castles.get(c.id)
      if (!v) continue
      // Rebuilt only when it really changes: its size, ruin, owner or style (not its splendour,
      // which follows the garrison up and down).
      if (v.tier !== c.tier || v.ruined !== !!c.ruined || v.owned !== (c.faction !== 'neutral') || v.style !== this.styleOf(c)) this.buildCastle(c)
      const view = this.castles.get(c.id)!
      if (!c.village || c.faction !== 'neutral') view.setColor(engine.factionColor(c.faction))
      this.viewSphere.center.set(c.x, view.height + 20, c.z)
      this.viewSphere.radius = view.radius * 2.4 + 40
      if (!this.frustum.intersectsSphere(this.viewSphere) || this.viewSphere.center.distanceTo(cam.position) > farOff || !engine.isExplored(c.x, c.z)) continue
      view.animate(this.time + view.radius)
      this.castleEffects(c, view, dt)
      // By night the braziers, lanterns and windows of a holding light its streets and walls: its
      // torches and braziers burn (near enough to be seen), and their light falls round them.
      if (this.fireOn > 0.02 && !c.ruined && view.flames.length) {
        const near = this.viewSphere.center.distanceTo(cam.position) < 2400
        if (near && this.fires.pointsLeft > view.flames.length) for (const [x, y, z, s] of view.flames) this.fires.flamePoint(x, y, z, s, (x * 0.37 + z * 0.11) % 1)
        for (const l of view.lights) this.fires.light({ ...l, weight: 0.4, seed: (l.x * 0.017) % 1 })
      }
      if (this.fireOn > 0.02 && !c.ruined) this.fires.light({ x: c.x, y: engine.world.surfaceAt(c.x, c.z) + 14, z: c.z, r: view.radius * 1.1 + 30, i: c.village ? 0.42 : 0.55, weight: 0.45, seed: (c.x * 0.013) % 1 })
    }
    // Smoke from the chimneys and camp fires of the royal cities' countryside (where it can be seen).
    if (this.citySmoke.length && Math.random() < dt * Math.min(8, this.citySmoke.length * 0.2)) {
      const [x, y, z] = this.citySmoke[Math.floor(Math.random() * this.citySmoke.length)]
      this.viewPoint.set(x, y, z)
      if (this.engine.isExplored(x, z) && this.frustum.containsPoint(this.viewPoint) && this.viewPoint.distanceTo(cam.position) < farOff) this.dust.spawn({ x, y, z, vx: 1.5 + Math.random(), vy: 3 + Math.random() * 2, vz: 0.5, life: 5 + Math.random() * 2, size: 2.5, grow: 4, drag: 0.2, color: 0x8a8580, alpha: 0.28 })
    }
    this.armies.density = (this.cam.distance > 1500 ? 0.35 : this.cam.distance > 900 ? 0.6 : 1) * this.densityScale
    this.armies.eye.copy(this.cam.camera.position)
    this.armies.update(dt, this.time)
    this.outposts.update(this.time)
    this.clearGrounds()
    this.convoys.update(this.time)
    this.obstacles.update()
    this.siegeEngines.update()
    this.sites.update(this.time)
    if (this.granges) {
      this.granges.update(this.time)
      this.grangeEffects(dt)
    }
    if (this.temple) {
      this.temple.update(this.time)
      const sa = engine.state.sanctuary!
      const [x, y, z] = this.temple.flameAt()
      if (this.fireOn > 0.02 || sa.praying || sa.blessed) this.fires.light({ x, y, z, r: sa.blessed ? 150 : 90, i: sa.blessed ? 0.7 : 0.45, weight: 0.5, seed: 0.37 })
    }
    // Every fire of this frame is in: share out the firelight.
    this.fires.end()
    this.shareFirelight(dt)
    this.updateBridges()
    this.armyEffects(dt)
    this.consumeEvents()

    this.updateWeather(dt)
    this.dust.update(dt, this.host.clientHeight)
    this.glow.update(dt, this.host.clientHeight)
    this.precip.update(dt, this.host.clientHeight)
    this.updateSelection()
    this.updateMarkers(dt)
    this.updateFloats(dt)
    this.labelTick -= dt
    this.updateLabels(this.labelTick <= 0)
    if (this.labelTick <= 0) this.labelTick = 0.2

    if (this.diorama) {
      this.diorama.setZoom(this.cam.distance)
      this.diorama.render()
    } else this.renderer.render(this.scene, this.cam.camera)
  }

  /** Dust and falling stone where enemies pull down a grange's wall; by night, the lanterns of its farmyard. */
  private grangeEffects(dt: number) {
    const engine = this.engine
    const world = engine.world
    const cam = this.cam.camera.position
    for (const g of engine.state.granges ?? []) {
      this.viewPoint.set(g.x, world.heightAt(g.x, g.z) + 10, g.z)
      if (this.viewPoint.distanceTo(cam) > Math.max(2600, this.cam.distance * 2.6)) continue
      // Under attack: dust off the wall on the attackers' side.
      if (engine.state.time - (g.assaultAt ?? -999) < 1.5 && Math.random() < dt * 10) {
        const by = engine.grangeAttackers(g)[0]
        if (by) {
          const a = Math.atan2(by.z - g.z, by.x - g.x) + (Math.random() - 0.5) * 0.6
          const r = Math.min(Math.hypot(by.x - g.x, by.z - g.z), GRANGE.outerX)
          const x = g.x + Math.cos(a) * r
          const z = g.z + Math.sin(a) * r
          this.dust.spawn({ x, y: world.heightAt(x, z) + 2, z, vx: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5) * 3, life: 2.5 + Math.random() * 1.5, size: 4, grow: 5, drag: 0.4, color: 0x9a8f7c, alpha: 0.4 })
        }
      }
      // Smoke from the chimneys; dust still settling over a breach in the wall.
      const pts = this.granges?.points(g.id)
      if (pts) {
        if (pts.smoke.length && Math.random() < dt * 0.8) {
          const [x, y, z] = pts.smoke[Math.floor(Math.random() * pts.smoke.length)]
          this.dust.spawn({ x, y, z, vx: 1.5 + Math.random(), vy: 3 + Math.random() * 2, vz: 0.5, life: 5 + Math.random() * 2, size: 2.5, grow: 4, drag: 0.2, color: 0x8a8580, alpha: 0.28 })
        }
        if (pts.breach.length && Math.random() < dt * 2.5) {
          const [x, y, z] = pts.breach[Math.floor(Math.random() * pts.breach.length)]
          this.dust.spawn({ x: x + (Math.random() - 0.5) * 6, y, z: z + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, life: 3 + Math.random() * 2, size: 4, grow: 5, drag: 0.3, color: 0x9a8f7c, alpha: 0.35 })
        }
      }
      if (this.fireOn <= 0.02) continue
      const x = g.x + Math.sin(g.heading) * 6
      const z = g.z + Math.cos(g.heading) * 6
      this.fires.light({ x, y: world.heightAt(g.x, g.z) + 8, z, r: 52, i: 0.42, weight: 0.45, seed: (g.z * 0.01) % 1 })
    }
  }

  /**
   * The pools of firelight go to the shaders: the nearest to the middle of the view first (armies
   * before castles), each flickering a little. A spark now and then rises from a flame near the view.
   */
  private shareFirelight(dt: number) {
    const on = this.fireOn
    visionUniforms.uTorchOn.value = on
    const P = visionUniforms.uTorchP.value
    const I = visionUniforms.uTorchI.value
    const tx = this.cam.target.x
    const tz = this.cam.target.y
    const reach = Math.max(900, this.cam.distance * 1.6)
    const order = this.lightOrder
    order.length = 0
    if (on > 0.01)
      for (const l of this.fires.lights) {
        const d = Math.hypot(l.x - tx, l.z - tz)
        if (d - l.r > reach) continue
        order.push(l)
      }
    const score = (l: FireLight) => Math.max(0, Math.hypot(l.x - tx, l.z - tz) - l.r * 0.5) / l.weight
    order.sort((a, b) => score(a) - score(b))
    const t = this.time
    for (let k = 0; k < TORCH_SLOTS; k++) {
      const l = order[k]
      if (!l) {
        P[k].w = 0
        I[k] = 0
        continue
      }
      P[k].set(l.x, l.y, l.z, l.r)
      const s = l.seed * 40
      I[k] = l.i * (0.88 + 0.07 * Math.sin(t * 9.3 + s) + 0.05 * Math.sin(t * 23.1 + s * 1.7))
    }
    // Sparks from the flames near the view.
    const sp = this.fires.sparks
    if (on > 0.3 && sp.length && this.cam.distance < 1400) {
      const rate = Math.min(30, sp.length * 0.8) * dt
      for (let i = 0; i < rate || Math.random() < rate - i; i++) {
        const [x, y, z] = sp[Math.floor(Math.random() * sp.length)]
        this.glow.spawn({ x: x + (Math.random() - 0.5) * 0.6, y: y + 0.8, z: z + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 3, vy: 5 + Math.random() * 6, vz: (Math.random() - 0.5) * 3, life: 0.7 + Math.random() * 0.9, size: 0.55, drag: 0.6, color: Math.random() < 0.5 ? 0xffb050 : 0xff7a2a, alpha: 0.9 })
        if (i > 30) break
      }
    }
  }

  /** Rain and snow around the view, darker skies in storms, snow settling in winter. */
  private updateWeather(dt: number) {
    const kind = this.engine.state.weather.kind
    const winter = this.engine.season() === 'Winter'
    const k = 1 - Math.exp(-dt * 0.8)
    // Night mode (the player's choice, easier on the eyes): a dimmer, cooler light; the lanterns,
    // forges and fires stay bright.
    this.night += (this.nightTarget - this.night) * (1 - Math.exp(-dt * 2.5))
    // The day itself: the golden light of evening and morning, the dark of night under the moon.
    const day = this.engine.daylight()
    // (The Long Night is fought under a little more light than a common night, so its battles read.)
    const dark = this.engine.state.rules.night ? 0.72 : day.dark
    const golden = day.phase === 'day' ? clamp(1 - day.next / 60, 0, 1) * 0.75 : day.phase === 'dusk' ? 0.75 + 0.25 * Math.sin(Math.PI * day.twilight) : day.phase === 'dawn' ? Math.sin(Math.PI * day.twilight) * 0.9 : 0
    const warm = golden * (1 - dark * 0.7)
    const n = Math.max(this.night, dark)
    this.sun.color.copy(DAY_SUN).lerp(DUSK_SUN, warm).lerp(MOON, Math.max(this.night * 0.85, dark))
    this.hemi.color.copy(DAY_HEMI).lerp(NIGHT_HEMI, dark)
    // The light swings round from the sun's arc to the low evening sun, and to the moon by night.
    this.sunDir.copy(SUN_DIR).lerp(LOW_SUN, warm).lerp(MOON_DIR, dark * dark).normalize()
    this.renderer.toneMappingExposure = 1 - Math.max(0.18 * this.night, 0.26 * dark)
    visionUniforms.uNight.value = dark
    // Dust and rain stand in the same light as the land.
    const amb = 1 - Math.max(0.45 * this.night, 0.68 * dark)
    ;(this.dust.material.uniforms.uLight.value as THREE.Color).setRGB(amb * (1 - 0.1 * dark), amb * (1 - 0.02 * dark), amb * (1 + 0.15 * dark))
    ;(this.precip.material.uniforms.uLight.value as THREE.Color).setRGB(amb, amb, amb * (1 + 0.1 * dark))
    const dim = Math.max(0.55 * this.night, 0.8 * dark)
    const sunTarget = (kind === 'storm' ? 1.0 : kind === 'rain' ? 1.5 : kind === 'snow' ? 1.8 : winter ? 2.1 : 2.6) * (1 - dim) * (1 - 0.15 * warm)
    this.sun.intensity += (sunTarget - this.sun.intensity) * k
    const hemiTarget = (kind === 'storm' ? 0.65 : kind === 'rain' ? 0.8 : 0.95) * (1 - Math.max(0.45 * this.night, 0.62 * dark)) + this.lightning
    this.hemi.intensity += (hemiTarget - this.hemi.intensity) * Math.max(k, this.lightning > 0 ? 0.6 : 0)
    this.lightning = Math.max(0, this.lightning - dt * 6)
    if (kind === 'storm' && Math.random() < dt * 0.12) this.lightning = 2.2
    const grey = kind === 'storm' ? 0.55 : kind === 'rain' ? 0.35 : kind === 'snow' ? 0.3 : 0
    const fog = this.scene.fog as THREE.Fog
    const target = this.baseFog.clone().lerp(new THREE.Color(kind === 'snow' ? 0xd6dde4 : 0x6f7a84), grey).lerp(DUSK_SKY, 0.45 * warm * (1 - grey)).lerp(NIGHT_SKY, 0.7 * n)
    fog.color.lerp(target, k)
    ;(this.scene.background as THREE.Color).copy(fog.color)
    const snowTarget = (winter ? 0.5 : 0) + (kind === 'snow' ? 0.25 : 0)
    visionUniforms.uSnow.value += (snowTarget - visionUniforms.uSnow.value) * dt * 0.05
    // Precipitation around the camera target.
    if (kind === 'clear') return
    const t = this.cam.target
    const spread = Math.min(1600, this.cam.distance * 1.3)
    const rate = (kind === 'storm' ? 1600 : kind === 'rain' ? 900 : 500) * dt
    const top = this.cam.camera.position.y * 0.85
    for (let i = 0; i < rate; i++) {
      const x = t.x + (Math.random() - 0.5) * spread
      const z = t.y + (Math.random() - 0.5) * spread
      if (kind === 'snow') {
        this.precip.spawn({ x, y: top * (0.4 + Math.random() * 0.6), z, vx: 8, vy: -28 - Math.random() * 10, vz: 4, life: 6, size: 2.4, color: 0xf4f7fb, alpha: 0.85 })
      } else {
        this.precip.spawn({ x, y: top * (0.5 + Math.random() * 0.5), z, vx: kind === 'storm' ? 60 : 15, vy: -380, vz: 10, life: 1.1, size: 1.3, color: 0xaebfd0, alpha: kind === 'storm' ? 0.55 : 0.4 })
      }
    }
  }

  private castleEffects(c: Castle, v: CastleView, dt: number) {
    if (!this.engine.isExplored(c.x, c.z)) return
    // Smoke from the chimneys, forges and kilns of the town and its suburbs.
    if (v.smoke.length && Math.random() < dt * Math.min(6, v.smoke.length * 0.25)) {
      const [x, y, z] = v.smoke[Math.floor(Math.random() * v.smoke.length)]
      this.dust.spawn({ x, y, z, vx: 1.5 + Math.random(), vy: 3 + Math.random() * 2, vz: 0.5, life: 5 + Math.random() * 2, size: 2.5, grow: 4, drag: 0.2, color: 0x8a8580, alpha: 0.28 })
    }
    // Ruins smoulder a little; wall-less villages only smoke while fighting rages.
    if (c.ruined) {
      if (Math.random() > 0.6 * dt) return
    } else if (c.maxWalls <= 0 && !c.battleId) return
    const dmg = c.ruined ? 0.3 : c.maxWalls > 0 ? 1 - c.walls / c.maxWalls : 0.5
    const sieged = !!c.battleId
    if (dmg < 0.25 && !sieged) return
    const rate = (sieged ? 10 : 2) * dmg + (sieged ? 3 : 0)
    if (Math.random() > rate * dt) return
    const p = v.wallRing[Math.floor(Math.random() * v.wallRing.length)]
    const y = v.height + v.wallHeight
    this.dust.spawn({
      x: p[0], y, z: p[1], vx: 3 + Math.random() * 3, vy: 9 + Math.random() * 5, vz: -2 + Math.random() * 2,
      life: 4 + Math.random() * 2, size: 10, grow: 9, drag: 0.3, color: 0x3a3632, alpha: 0.55,
    })
    if (dmg > 0.4) {
      this.glow.spawn({
        x: p[0] + (Math.random() - 0.5) * 4, y: y - 2, z: p[1] + (Math.random() - 0.5) * 4,
        vy: 8 + Math.random() * 6, life: 0.8 + Math.random() * 0.5, size: 6, grow: -4, color: Math.random() < 0.5 ? 0xff8a2a : 0xffc04a,
      })
    }
  }

  private armyEffects(dt: number) {
    const world = this.engine.world
    for (const a of this.engine.state.armies) {
      const v = this.armies.visuals.get(a.id)
      if (!v || !v.seen) continue
      if (a.status === 'marching' || a.status === 'retreating') {
        if (Math.random() < dt * (2 + v.radius * 0.08)) {
          const ang = Math.random() * Math.PI * 2
          const r = Math.random() * v.radius * 0.8
          const x = v.x + Math.cos(ang) * r
          const z = v.z + Math.sin(ang) * r
          this.dust.spawn({ x, y: world.surfaceAt(x, z) + 1, z, vy: 2.5, life: 2.2, size: 7, grow: 6, drag: 0.5, color: 0xb59f7c, alpha: 0.35 })
        }
      } else if (a.status === 'battle' || a.status === 'sieging') {
        if (Math.random() < dt * 14) {
          const fx = Math.cos(v.heading)
          const fz = Math.sin(v.heading)
          const lat = (Math.random() - 0.5) * v.radius * 1.4
          const x = v.x + fx * v.radius * 0.45 - fz * lat
          const z = v.z + fz * v.radius * 0.45 + fx * lat
          const y = world.surfaceAt(x, z) + 3 + Math.random() * 3
          this.glow.spawn({ x, y, z, vx: (Math.random() - 0.5) * 22, vy: 8 + Math.random() * 12, vz: (Math.random() - 0.5) * 22, gravity: 40, life: 0.35 + Math.random() * 0.25, size: 2.2, color: Math.random() < 0.6 ? 0xffd27a : 0xffffff })
          if (Math.random() < 0.3) this.dust.spawn({ x, y: y - 2, z, vy: 3, life: 2.5, size: 9, grow: 7, drag: 0.6, color: 0xa89474, alpha: 0.35 })
        }
      }
    }
  }

  /** New engineers' bridges appear; demolished ones go down in fire and smoke. */
  private updateBridges() {
    const world = this.engine.world
    while (this.bridgeGroup.children.length < world.bridges.length) this.bridgeGroup.add(bridgeMesh(world.bridges[this.bridgeGroup.children.length]))
    world.bridges.forEach((b, i) => {
      const mesh = this.bridgeGroup.children[i]
      if (!mesh) return
      const down = world.broken.has(i)
      if (down && !this.bridgeDown.has(i)) {
        this.bridgeDown.add(i)
        for (let k = 0; k < 70; k++) {
          const t = (Math.random() - 0.5) * b.length
          const x = b.x + b.dirX * t
          const z = b.z + b.dirZ * t
          this.glow.spawn({ x, y: 4, z, vx: (Math.random() - 0.5) * 10, vy: 14 + Math.random() * 18, vz: (Math.random() - 0.5) * 10, gravity: -4, life: 0.8 + Math.random() * 0.9, size: 2.4, color: Math.random() < 0.5 ? 0xff8a3a : 0xffd27a })
          this.dust.spawn({ x, y: 8, z, vx: (Math.random() - 0.5) * 6, vy: 10 + Math.random() * 8, vz: (Math.random() - 0.5) * 6, gravity: -3, life: 2.2 + Math.random(), size: 4, color: 0x3a342e, alpha: 0.6 })
        }
      } else if (!down && this.bridgeDown.has(i)) this.bridgeDown.delete(i)
      mesh.visible = !down
    })
  }

  private consumeEvents() {
    const world = this.engine.world
    for (const ev of this.pendingEvents) {
      if (ev.type === 'blast') {
        // Pitch barrels go up: a fireball, sparks and a column of black smoke.
        if (!this.engine.isVisible(ev.x, ev.z)) continue
        const y0 = world.surfaceAt(ev.x, ev.z)
        for (let k = 0; k < 140; k++) {
          const a = Math.random() * Math.PI * 2
          const r = Math.random() * 40
          this.glow.spawn({ x: ev.x + Math.cos(a) * r, y: y0 + 3, z: ev.z + Math.sin(a) * r, vx: Math.cos(a) * (10 + Math.random() * 30), vy: 20 + Math.random() * 45, vz: Math.sin(a) * (10 + Math.random() * 30), gravity: 30, life: 0.6 + Math.random() * 0.9, size: 3 + Math.random() * 3, color: Math.random() < 0.5 ? 0xff7a2a : 0xffd27a })
        }
        for (let k = 0; k < 40; k++) {
          this.dust.spawn({ x: ev.x + (Math.random() - 0.5) * 50, y: y0 + 6, z: ev.z + (Math.random() - 0.5) * 50, vx: (Math.random() - 0.5) * 6, vy: 12 + Math.random() * 10, vz: (Math.random() - 0.5) * 6, gravity: -2, life: 3 + Math.random() * 2, size: 10, grow: 8, drag: 0.5, color: 0x2a2420, alpha: 0.55 })
        }
        continue
      }
      if (ev.type === 'hit') {
        if (!this.engine.isVisible(ev.x, ev.z)) continue
        const y = world.surfaceAt(ev.x, ev.z)
        this.addFloat(ev.x, y + 16, ev.z, `-${Math.max(1, Math.round(ev.amount))}`, ev.team === 'A' ? 'player' : 'enemy')
        if (ev.ranged) {
          // A volley of arrows arcing in.
          for (let i = 0; i < 14; i++) {
            const ox = (Math.random() - 0.5) * 50
            const oz = (Math.random() - 0.5) * 50
            this.dust.spawn({ x: ev.x + ox - 30, y: y + 40, z: ev.z + oz - 10, vx: 55, vy: -10, vz: 18, gravity: 60, life: 0.7, size: 1.6, color: 0x2a2018, alpha: 0.9 })
          }
        }
      } else if (ev.type === 'captured') {
        const c = this.engine.castle(ev.castleId)
        if (!c) continue
        for (let i = 0; i < 60; i++) {
          const a = Math.random() * Math.PI * 2
          this.glow.spawn({
            x: c.x + Math.cos(a) * 20, y: world.heightAt(c.x, c.z) + 40, z: c.z + Math.sin(a) * 20,
            vx: Math.cos(a) * 30, vy: 20 + Math.random() * 25, vz: Math.sin(a) * 30, gravity: 25,
            life: 1.6, size: 4, color: this.engine.team(ev.faction) === 'A' ? 0x9cc3ff : 0xff7a5a,
          })
        }
      }
    }
    this.pendingEvents.length = 0
  }

  private updateSelection() {
    const place = (ring: THREE.Mesh, t: PickTarget) => {
      ring.visible = false
      if (!t) return
      if (t.kind === 'army') {
        const v = this.armies.visuals.get(t.id)
        if (!v || !v.seen) return
        ring.position.set(v.x, this.engine.world.surfaceAt(v.x, v.z) + 0.8, v.z)
        ring.scale.setScalar(v.radius * 0.8)
      } else if (t.kind === 'castle') {
        const c = this.engine.castle(t.id)
        if (!c) return
        ring.position.set(c.x, this.engine.world.heightAt(c.x, c.z) + 1.5, c.z)
        ring.scale.setScalar(holdingRadius(c) * 1.05)
      } else {
        const o = this.engine.outpost(t.id)
        if (!o) return
        ring.position.set(o.x, this.engine.world.heightAt(o.x, o.z) + 1.5, o.z)
        ring.scale.setScalar(38)
      }
      ring.visible = true
    }
    place(this.selRing, this.selection)
    const sameAsSel = this.hover && this.selection && this.hover.kind === this.selection.kind && this.hover.id === this.selection.id
    place(this.hoverRing, sameAsSel ? null : this.hover)
    ;(this.selRing.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(this.time * 4) * 0.25

    // Planned route of the selected friendly army.
    this.pathLine.visible = false
    const sel = this.selection
    if (sel?.kind === 'army') {
      const a = this.engine.army(sel.id)
      const v = this.armies.visuals.get(sel.id)
      if (a && v && a.faction === 'player' && a.path.length > 0) {
        const pts: [number, number][] = [[v.x, v.z], ...a.path]
        const arr = this.pathLine.geometry.attributes.position as THREE.BufferAttribute
        const col = this.pathLine.geometry.attributes.color as THREE.BufferAttribute
        const base = new THREE.Color(a.order.type === 'attack' || a.order.type === 'intercept' ? 0xff6a4d : a.status === 'retreating' ? 0xbbbbbb : 0xf5c542)
        // A spymaster's road is coloured by what the band would be there: under cover, in disguise, or watched.
        const spy = this.engine.isSpyBand(a)
        let n = 0
        const world = this.engine.world
        const put = (x: number, z: number) => {
          arr.setXYZ(n, x, world.surfaceAt(x, z) + 2.5, z)
          const c = spy ? this.routeColor(a, x, z) : base
          col.setXYZ(n, c.r, c.g, c.b)
          n++
        }
        for (let i = 0; i < pts.length - 1 && n < 250; i++) {
          const [ax, az] = pts[i]
          const [bx, bz] = pts[i + 1]
          const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 20))
          for (let s = 0; s < steps && n < 250; s++) {
            const t = s / steps
            put(ax + (bx - ax) * t, az + (bz - az) * t)
          }
        }
        const [lx, lz] = pts[pts.length - 1]
        put(lx, lz)
        arr.needsUpdate = true
        col.needsUpdate = true
        this.pathLine.geometry.setDrawRange(0, n)
        this.pathLine.computeLineDistances()
        this.pathLine.visible = true
      }
    }

    this.updateWorldMarkers()
    this.updateWatchRings(sel?.kind === 'army' ? this.engine.army(sel.id) : undefined)
    this.updateGroupLines(sel?.kind === 'army' ? this.engine.army(sel.id) : undefined)
  }

  private routeCache = new Map<string, THREE.Color>()
  private routeCacheAt = -1
  private static readonly ROUTE_COLORS = { concealed: new THREE.Color(0x6ee7a0), disguised: new THREE.Color(0xf5c542), watched: new THREE.Color(0xff4433) }
  /** The colour of one stretch of a spymaster's road (cached for a second, on a 20m grid). */
  private routeColor(a: Army, x: number, z: number): THREE.Color {
    const now = Math.floor(this.engine.state.time)
    if (now !== this.routeCacheAt) {
      this.routeCache.clear()
      this.routeCacheAt = now
    }
    const key = `${a.id}|${Math.round(x / 20)}|${Math.round(z / 20)}`
    let c = this.routeCache.get(key)
    if (!c) {
      const v = this.engine.veilAt(a, x, z).veil
      c = this.engine.watchedAt(a, x, z, v) ? GameRenderer.ROUTE_COLORS.watched : GameRenderer.ROUTE_COLORS[v]
      this.routeCache.set(key, c)
    }
    return c
  }

  private groupLines: THREE.LineSegments | null = null
  /** With one army of a battle group selected: faint lines from its lead to each of the escorts. */
  private updateGroupLines(a: Army | undefined) {
    const engine = this.engine
    const lead = a ? (a.stance?.kind === 'escortArmy' ? engine.army(a.stance.targetId) : a) : undefined
    const escorts = lead && lead.faction === PLAYER ? engine.escortsOf(lead) : []
    if (!this.groupLines) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 2 * 3), 3))
      this.groupLines = new THREE.LineSegments(g, new THREE.LineDashedMaterial({ color: 0x8fb4ff, dashSize: 10, gapSize: 7, transparent: true, opacity: 0.75, depthTest: false }))
      this.groupLines.renderOrder = 6
      this.groupLines.frustumCulled = false
      this.scene.add(this.groupLines)
    }
    const line = this.groupLines
    line.visible = !!lead && escorts.length > 0
    if (!line.visible || !lead) return
    const vl = this.armies.visuals.get(lead.id)
    const lx = vl?.x ?? lead.x
    const lz = vl?.z ?? lead.z
    const arr = (line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
    let n = 0
    for (const e of escorts.slice(0, 8)) {
      const ve = this.armies.visuals.get(e.id)
      const ex = ve?.x ?? e.x
      const ez = ve?.z ?? e.z
      arr.set([lx, this.engine.world.surfaceAt(lx, lz) + 6, lz, ex, this.engine.world.surfaceAt(ex, ez) + 6, ez], n * 6)
      n++
    }
    line.geometry.setDrawRange(0, n * 2)
    ;(line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
    line.computeLineDistances()
  }

  private watchPool: { ring: THREE.Mesh; disc: THREE.Mesh }[] = []
  /**
   * With one of our spymaster's bands selected: the enemy's watches on the ground. Inside the red
   * ring even a concealed band is found; inside the faint orange one, a band in disguise. Enemy
   * scouts in sight carry their own orange ring.
   */
  private updateWatchRings(a: Army | undefined) {
    const engine = this.engine
    const zones: { x: number; z: number; r: number; rd: number; ours?: boolean }[] = []
    // (Our Wardens carry their own aura always, drawn with the armies.)
    // A band on guard: the ring it watches round its post.
    if (a && a.faction === PLAYER && a.stance?.kind === 'guard' && a.stance.x !== undefined) zones.push({ x: a.stance.x, z: a.stance.z!, r: a.stance.r ?? 400, rd: 0, ours: true })
    if (a && a.faction === PLAYER && engine.isSpyBand(a)) {
      for (const w of engine.spyWatches(PLAYER)) if (!w.secret) zones.push(w)
      for (const b of engine.state.armies)
        if (b.order.type === 'scout' && engine.isHostile(b.faction, PLAYER) && engine.canSee(engine.team(PLAYER), b)) zones.push({ x: b.x, z: b.z, r: 0, rd: SPY.scoutEye })
    }
    while (this.watchPool.length < zones.length * 2) {
      const rg = new THREE.RingGeometry(0.975, 1, 96)
      rg.rotateX(-Math.PI / 2)
      const dg = new THREE.CircleGeometry(1, 64)
      dg.rotateX(-Math.PI / 2)
      const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false }))
      const disc = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false }))
      ring.renderOrder = 3
      disc.renderOrder = 2
      this.scene.add(ring, disc)
      this.watchPool.push({ ring, disc })
    }
    this.watchPool.forEach((m, i) => {
      const z = zones[i >> 1]
      const outer = i % 2 === 1
      const r = z ? (outer ? z.rd : z.r) : 0
      m.ring.visible = m.disc.visible = !!z && r > 0
      if (!z || r <= 0) return
      const y = engine.world.surfaceAt(z.x, z.z) + 2
      m.ring.position.set(z.x, y, z.z)
      m.disc.position.set(z.x, y, z.z)
      m.ring.scale.setScalar(r)
      m.disc.scale.setScalar(r)
      const rm = m.ring.material as THREE.MeshBasicMaterial
      const dm = m.disc.material as THREE.MeshBasicMaterial
      const hex = z.ours ? (outer ? 0xc8e88a : 0x8fd14f) : outer ? 0xff9a4d : 0xff4433
      rm.color.setHex(hex)
      dm.color.setHex(hex)
      rm.opacity = outer ? 0.45 : 0.75
      dm.opacity = z.ours ? (outer ? 0.03 : 0.07) : outer ? 0.05 : 0.1
    })
  }

  /** Pulsing rings for Great Host muster points and alliance offensive targets. */
  private updateWorldMarkers() {
    const engine = this.engine
    const marks: { x: number; z: number; r: number; color: number; opacity?: number }[] = []
    // The Old Throne: a coronation under way rings the Imperial Crossroads in gold, a wave rolling
    // out over the ground it must be held clear in (paused: a dim, still ring).
    const cor = engine.state.coronation
    const heart = cor && cor.progress > 0 ? engine.castle(CORONATION.heartId) : undefined
    if (cor && heart) {
      const base = holdingRadius(heart) * 1.35
      marks.push({ x: heart.x, z: heart.z, r: base, color: 0xffd257, opacity: cor.active ? 0.75 : 0.3 })
      marks.push({ x: heart.x, z: heart.z, r: CORONATION.contest, color: 0xffd257, opacity: cor.active ? 0.22 : 0.12 })
      if (cor.active) {
        const w = (this.time * 0.45) % 1
        marks.push({ x: heart.x, z: heart.z, r: base + (CORONATION.contest - base) * w, color: 0xffe08a, opacity: 0.6 * (1 - w) })
      }
    }
    for (const f of Object.values(engine.state.factions)) {
      const h = f.host
      if (!h || (h.phase !== 'mustering' && h.phase !== 'gathered')) continue
      const rel = engine.relation(f.id)
      if (rel === 'enemy') marks.push({ x: h.rallyX, z: h.rallyZ, r: 44, color: 0xff4433 })
      else if (rel === 'ally') marks.push({ x: h.rallyX, z: h.rallyZ, r: 44, color: 0x4fd1c5 })
    }
    for (const m of engine.state.musters) {
      if (m.team !== 'A') continue
      if (m.phase === 'gathering') marks.push({ x: m.rallyX, z: m.rallyZ, r: 60, color: 0x4fd1c5 })
      const t = engine.castle(m.targetCastleId)
      if (t) marks.push({ x: t.x, z: t.z, r: holdingRadius(t) * 1.3, color: 0x4fd1c5 })
    }
    // The rifts of the Endless Night pulse violet.
    const rifts = engine.state.rules.night?.rifts ?? []
    for (const r of rifts) marks.push({ x: r.x, z: r.z, r: rifts.length === 1 ? 210 : 85, color: 0x9a5cff })
    const now = engine.state.time
    const call = engine.state.callToArms
    const focusA = call && call.until > now ? call : engine.state.teamFocus.A && engine.state.teamFocus.A.until > now ? engine.state.teamFocus.A : null
    const fa = engine.castle(focusA?.castleId)
    if (fa) marks.push({ x: fa.x, z: fa.z, r: holdingRadius(fa) * 1.2, color: 0xf5c542 })
    const fb = engine.castle(engine.state.teamFocus.B?.castleId)
    if (fb && engine.state.rules.mode === 'alliance' && engine.state.teamFocus.B!.until > now) marks.push({ x: fb.x, z: fb.z, r: holdingRadius(fb) * 1.2, color: 0xff4433 })
    while (this.markerPool.length < marks.length) {
      const g = new THREE.RingGeometry(0.88, 1, 56)
      g.rotateX(-Math.PI / 2)
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }))
      m.renderOrder = 4
      this.scene.add(m)
      this.markerPool.push(m)
    }
    this.markerPool.forEach((m, i) => {
      const mk = marks[i]
      m.visible = !!mk
      if (!mk) return
      m.position.set(mk.x, engine.world.surfaceAt(mk.x, mk.z) + 2, mk.z)
      m.scale.setScalar(mk.r * (mk.opacity !== undefined ? 1 : 1 + Math.sin(this.time * 1.5 + i) * 0.05))
      const mat = m.material as THREE.MeshBasicMaterial
      mat.color.setHex(mk.color)
      mat.opacity = mk.opacity ?? 0.35 + Math.sin(this.time * 3 + i) * 0.2
    })
  }

  private updateMarkers(dt: number) {
    for (const m of this.clickMarkers) {
      m.age += dt
      m.mesh.scale.setScalar(1 + m.age * 3)
      ;(m.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - m.age * 1.6)
    }
    for (const m of this.clickMarkers.filter((m) => m.age > 0.7)) {
      this.scene.remove(m.mesh)
      m.mesh.geometry.dispose()
      ;(m.mesh.material as THREE.Material).dispose()
    }
    this.clickMarkers = this.clickMarkers.filter((m) => m.age <= 0.7)
  }

  // -------------------------------------------------------------------------
  // DOM overlay: labels and floating combat numbers
  // -------------------------------------------------------------------------

  private addFloat(x: number, y: number, z: number, text: string, side: 'player' | 'enemy') {
    if (this.floats.length > 40) return
    const el = document.createElement('div')
    el.className = `float-text float-${side}`
    el.textContent = text
    this.overlay.appendChild(el)
    this.floats.push({ el, x: x + (Math.random() - 0.5) * 16, y, z: z + (Math.random() - 0.5) * 16, age: 0 })
  }

  private updateFloats(dt: number) {
    for (const f of this.floats) {
      f.age += dt
      f.y += dt * 9
      const p = this.toScreen(f.x, f.y, f.z)
      f.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`
      f.el.style.opacity = String(Math.max(0, 1 - f.age / 1.4))
      f.el.style.display = p.visible ? '' : 'none'
    }
    for (const f of this.floats.filter((f) => f.age > 1.4)) f.el.remove()
    this.floats = this.floats.filter((f) => f.age <= 1.4)
  }

  private label(id: string, cls: string): Label {
    let l = this.labels.get(id)
    if (!l) {
      const el = document.createElement('div')
      el.className = cls
      this.overlay.appendChild(el)
      l = { el, key: '' }
      this.labels.set(id, l)
    }
    return l
  }

  private updateLabels(refreshContent: boolean) {
    const engine = this.engine
    const world = engine.world
    const seen = new Set<string>()
    const zoomFade = clamp(1.25 - this.cam.distance / 1500, 0.55, 1)
    // Low over the land (the commander's view) the far ground is in sight: only nearby places keep a
    // label, or the horizon fills up with names.
    const cp = this.cam.camera.position
    const lowView = this.cam.chaseAmount > 0.5
    const near = (x: number, z: number, r = 950) => !lowView || Math.hypot(x - cp.x, z - cp.z) < r

    for (const c of engine.state.castles) {
      const id = `c:${c.id}`
      seen.add(id)
      const l = this.label(id, 'map-label castle-label')
      const p = this.toScreen(c.x, world.heightAt(c.x, c.z) + (c.village ? holdingRadius(c) * 0.9 : 70 + c.tier * 12) + 18, c.z)
      l.el.style.display = p.visible && near(c.x, c.z, c.village ? 950 : 1500) && (c.faction === PLAYER || engine.isExplored(c.x, c.z)) ? '' : 'none'
      l.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%) scale(${zoomFade})`
      if (refreshContent) {
        const g = knownCount(engine, c.id)
        const walls = c.maxWalls > 0 ? Math.round((c.walls / c.maxWalls) * 100) : 100
        const sel = this.selection?.kind === 'castle' && this.selection.id === c.id
        const key = `${c.faction}|${g}|${walls}|${!!c.battleId}|${sel}|${c.tier}|${!!c.ruined}`
        if (key !== l.key) {
          l.key = key
          l.el.dataset.rel = engine.relation(c.faction)
          const showRealm = engine.state.rules.mode !== 'campaign' && c.faction !== PLAYER
          l.el.classList.toggle('selected', sel)
          l.el.classList.toggle('village-label', !!c.village)
          l.el.classList.toggle('ruins-label', !!c.ruined)
          if (c.ruined) {
            l.el.innerHTML = `<div class="cl-name">${glyphSvg('fire', 13)} ${escapeHtml(c.name)}</div><div class="cl-row"><span class="cl-gar">RUINS</span></div>`
            continue
          }
          if (c.village && c.faction === 'neutral') {
            l.el.innerHTML = `<div class="cl-name">${glyphSvg(HOLDINGS[engine.holdingOf(c)].icon, 13)} ${escapeHtml(c.name)}</div><div class="cl-realm">Free ${HOLDINGS[engine.holdingOf(c)].name.toLowerCase()}</div><div class="cl-row"><span class="cl-gar">militia ${g}</span>${c.battleId ? '<span class="cl-siege">RAID</span>' : ''}</div>`
            continue
          }
          l.el.innerHTML = `
            ${c.faction === PLAYER ? `<span class="cl-home">${c.id === engine.state.factions[PLAYER]?.capitalId ? `${glyphSvg('crown', 11)} YOUR SEAT` : c.village ? `${glyphSvg(HOLDINGS[engine.holdingOf(c)].icon, 11)} YOUR ${HOLDINGS[engine.holdingOf(c)].name.toUpperCase()}` : `${glyphSvg('flag', 11)} YOUR CASTLE`}</span>` : ''}
            <div class="cl-name">${c.village ? `<i class="cl-swatch" style="background:${engine.factionColor(c.faction)}"></i>` : shieldSvg(engine.seatRank(c), engine.factionColor(c.faction), engine.seatRank(c) === 'royal' ? 20 : engine.seatRank(c) === 'lord' ? 16 : 14, chargeForTeam(engine.team(c.faction)))}${escapeHtml(c.name)}</div>
            ${showRealm ? `<div class="cl-realm">${escapeHtml(engine.factionName(c.faction))}</div>` : ''}
            <div class="cl-row"><span class="cl-gar">${glyphSvg('swords', 11)} ${g}</span>${c.battleId ? '<span class="cl-siege">SIEGE</span>' : ''}</div>
            ${walls < 100 ? `<div class="cl-walls"><i style="width:${walls}%"></i></div>` : ''}`
        }
      }
    }

    const sa = engine.state.sanctuary
    for (const a of engine.state.armies) {
      const v = this.armies.visuals.get(a.id)
      const id = `a:${a.id}`
      if (!v || !v.seen) continue
      seen.add(id)
      const l = this.label(id, 'map-label army-label')
      const p = this.toScreen(v.x, world.surfaceAt(v.x, v.z) + 26, v.z)
      l.el.style.display = p.visible && (near(v.x, v.z, 1300) || (this.selection?.kind === 'army' && this.selection.id === a.id)) ? '' : 'none'
      l.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%) scale(${zoomFade})`
      if (refreshContent) {
        const n = knownCount(engine, a.id)
        const morale = Math.round(a.morale)
        const sel = this.selection?.kind === 'army' && this.selection.id === a.id
        const hidden = engine.isHidden(a)
        const key = `${a.name}|${n}|${morale}|${a.status}|${sel}|${a.formation}|${a.column}|${hidden}|${a.supplied}|${a.order.type}|${a.spottedBy ?? ''}|${!!a.pursuit}|${a.veil ?? ''}|${engine.isSpyBand(a)}|${a.stance?.kind ?? ''}|${a.faction === PLAYER ? engine.escortsOf(a).length : 0}|${a.royal && sa?.praying ? Math.floor(sa.progress) : ''}|${!!a.blessed}`
        if (key !== l.key) {
          l.key = key
          l.el.dataset.rel = engine.relation(a.faction)
          l.el.classList.toggle('sacred', a.sacred !== undefined)
          l.el.style.setProperty('--realm', engine.factionColor(a.faction))
          l.el.classList.toggle('selected', sel)
          const rumour = a.faction !== PLAYER && engine.knowledge(a.id).kind === 'rumour'
          const leader = rumour ? 'Leader unknown' : engine.armyLeader(a)
          const form = a.faction === PLAYER ? (a.column && a.status === 'marching' ? 'Column' : FORMATIONS[a.formation].short) : ''
          const group = a.faction === PLAYER ? engine.escortsOf(a).length : 0
          const sub = [leader !== a.name ? leader : '', form, group ? `+${group} escort${group > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')
          l.el.innerHTML = `
            <div class="al-head">${armyEmblem(engine, a, rumour)}<div class="al-titles"><span class="al-name">${escapeHtml(a.name)}</span>${sub ? `<span class="al-sub">${escapeHtml(sub)}</span>` : ''}</div><span class="al-n">${n}</span></div>
            <div class="al-morale"><i style="width:${morale}%"></i></div>
            ${statusBadge(a)}${a.faction === PLAYER && hidden && !a.veil ? `<div class="al-status stealth">${glyphSvg('tree', 11)} HIDDEN</div>` : ''}${a.faction === PLAYER && !a.supplied ? `<div class="al-status nosupply">${glyphSvg('warning', 11)} NO SUPPLY</div>` : ''}${a.order.type === 'scout' ? `<div class="al-status stealth">${glyphSvg('spyglass', 11)} SCOUTING${a.spottedBy ? ' · SPOTTED' : ''}</div>` : ''}${a.pursuit ? `<div class="al-status retreat">${glyphSvg('horse', 11)} PURSUIT</div>` : ''}${a.royal && a.faction === PLAYER && sa?.praying ? `<div class="al-status holy">${glyphSvg('sun', 11)} PRAYING ${Math.floor((sa.progress / TEMPLE.prayer) * 100)}%</div>` : ''}${a.royal && a.blessed ? `<div class="al-status holy">${glyphSvg('sun', 11)} BLESSED</div>` : ''}${a.order.type === 'gather' ? `<div class="al-status stealth">${glyphSvg('pick', 11)} WORKING</div>` : ''}`
        }
      }
    }

    for (const o of engine.state.outposts) {
      const id = `o:${o.id}`
      seen.add(id)
      const l = this.label(id, 'map-label castle-label outpost-label')
      const p = this.toScreen(o.x, world.heightAt(o.x, o.z) + 40, o.z)
      l.el.style.display = p.visible && near(o.x, o.z) && (o.faction === PLAYER || engine.isExplored(o.x, o.z)) ? '' : 'none'
      l.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%) scale(${zoomFade * 0.9})`
      if (refreshContent) {
        const depot = o.kind === 'depot' && o.progress >= 1
        const quartered = depot ? totalInt(o.garrison ?? {}) : 0
        const known = o.faction === PLAYER || engine.relation(o.faction) === 'ally'
        const stock = Math.round(o.stock ?? 100)
        const state =
          o.raze > 0.02
            ? `BURNING ${Math.round(o.raze * 100)}%`
            : o.progress < 1
              ? `BUILDING ${Math.round(o.progress * 100)}%`
              : depot
                ? `${known && quartered > 0 ? `${glyphSvg('swords', 10)} ${fmt(quartered)} · ` : ''}STORES ${stock}%`
                : 'OUTPOST'
        const key = `${o.faction}|${state}`
        if (key !== l.key) {
          l.key = key
          l.el.dataset.rel = engine.relation(o.faction)
          l.el.innerHTML = `<div class="cl-name"><i class="cl-swatch" style="background:${engine.factionColor(o.faction)}"></i>${glyphSvg('palisade', 13)} ${escapeHtml(o.name)}</div><div class="cl-row"><span class="${o.raze > 0.02 || (depot && stock < 25) ? 'cl-siege' : 'cl-gar'}">${state}</span></div>`
        }
      }
    }

    for (const s of engine.state.sites ?? []) {
      const id = `r:${s.id}`
      seen.add(id)
      const l = this.label(id, 'map-label castle-label site-label')
      const p = this.toScreen(s.x, world.heightAt(s.x, s.z) + 26, s.z)
      l.el.style.display = p.visible && zoomFade > 0.55 && near(s.x, s.z, 600) && engine.isExplored(s.x, s.z) ? '' : 'none'
      l.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%) scale(${zoomFade * 0.85})`
      if (refreshContent) {
        const w = engine.army(s.workerId)
        const stock = Math.round((s.stock / 2600) * 100)
        const state = w ? `${w.faction === PLAYER ? 'YOURS' : escapeHtml(engine.factionName(w.faction))} · +${engine.gatherRate(w.id, s.id).toFixed(1)}/s` : stock < 5 ? 'WORKED OUT' : 'UNWORKED'
        const key = `${w?.faction ?? ''}|${state}`
        if (key !== l.key) {
          l.key = key
          l.el.dataset.rel = w ? engine.relation(w.faction) : 'neutral'
          l.el.innerHTML = `<div class="cl-name">${s.kind === 'mine' ? `${glyphSvg('pick', 13)} Mine` : `${glyphSvg('axe', 13)} Lumber camp`}</div><div class="cl-row"><span class="cl-gar">${state}</span></div>`
        }
      }
    }

    // The Sanctuary of the High King: when it opens, the King's prayer, the answer.
    if (sa) {
      seen.add('sanctuary')
      const l = this.label('sanctuary', 'map-label castle-label site-label holy-label')
      const p = this.toScreen(sa.x, world.heightAt(sa.x, sa.z) + 64, sa.z)
      l.el.style.display = p.visible && zoomFade > 0.4 && near(sa.x, sa.z, 1400) && engine.isExplored(sa.x, sa.z) ? '' : 'none'
      l.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%) scale(${zoomFade * 0.9})`
      if (refreshContent) {
        const state = sa.blessed
          ? sa.over
            ? 'THE HIGH KING HAS ANSWERED'
            : `THE PALADINS RIDE · ${sa.captures}/${TEMPLE.castles} CASTLES`
          : sa.praying
            ? `THE KING PRAYS · ${Math.floor((sa.progress / TEMPLE.prayer) * 100)}%`
            : sa.progress > 0
                ? `PRAYER BROKEN OFF · ${Math.floor((sa.progress / TEMPLE.prayer) * 100)}%`
                : 'THE KING MAY PRAY HERE'
        if (state !== l.key) {
          l.key = state
          l.el.innerHTML = `<div class="cl-name">${glyphSvg('sun', 14)} Sanctuary of the High King</div><div class="cl-row"><span class="cl-gar">${state}</span></div>`
        }
      }
    }

    // The granges: who holds them, and how they fare (feeding, or being taken).
    for (const g of engine.state.granges ?? []) {
      const id = `g:${g.id}`
      seen.add(id)
      const l = this.label(id, 'map-label castle-label site-label')
      const p = this.toScreen(g.x, world.heightAt(g.x, g.z) + 30, g.z)
      l.el.style.display = p.visible && zoomFade > 0.55 && near(g.x, g.z, 700) && engine.isExplored(g.x, g.z) ? '' : 'none'
      l.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%) scale(${zoomFade * 0.85})`
      if (refreshContent) {
        const owner = engine.grangeOwner(g)
        const feeds = engine.grangeFeeds(g).length
        const taking = engine.state.time - (g.assaultAt ?? -999) < 3
        const wall = Math.round((g.walls / GRANGE.walls) * 100)
        const state = taking ? `WALL ${wall}% · UNDER ATTACK` : owner === 'neutral' ? (feeds ? `FEEDS ${escapeHtml(engine.castle(g.castleId)?.name ?? '')}` : 'IDLE') : `FEEDS ${feeds} CASTLE${feeds === 1 ? '' : 'S'}${wall < 100 ? ` · WALL ${wall}%` : ''}`
        const key = `${owner}|${state}`
        if (key !== l.key) {
          l.key = key
          l.el.dataset.rel = engine.relation(owner)
          l.el.innerHTML = `<div class="cl-name"><i class="cl-swatch" style="background:${owner === 'neutral' ? '#b8aa88' : engine.factionColor(owner)}"></i>${glyphSvg('sheaf', 13)} ${escapeHtml(g.name)}</div><div class="cl-row"><span class="${taking ? 'cl-siege' : 'cl-gar'}">${state}</span></div>`
        }
      }
    }

    // Where the Usurper Queen was last known to be (her guard shows as itself when in plain sight).
    const sight = engine.state.foeSighting
    const queen = engine.foeRoyal()
    if (sight && queen) {
      const live = engine.canSee(engine.team(PLAYER), queen) && !engine.inKeep(queen)
      seen.add('queen')
      const l = this.label('queen', 'map-label queen-label')
      const p = this.toScreen(sight.x, world.heightAt(sight.x, sight.z) + (sight.castleId ? 150 : 40), sight.z)
      l.el.style.display = p.visible && !live && near(sight.x, sight.z, 1500) ? '' : 'none'
      l.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%) scale(${Math.max(0.8, zoomFade)})`
      if (refreshContent) {
        const age = Math.max(0, engine.state.time - sight.t)
        const when = age < 20 ? 'now' : age < 60 ? `${Math.round(age)}s ago` : `${Math.round(age / 60)}m ago`
        const what = sight.how === 'court' ? 'holds court here' : sight.how === 'scouts' ? `scouts saw her ${when}` : `last seen ${when}`
        const key = `${what}`
        if (key !== l.key) {
          l.key = key
          l.el.dataset.stale = age > 240 ? '1' : ''
          l.el.innerHTML = `<div class="ql-crown">${glyphSvg('crown', 18)}</div><div class="ql-text"><b>Queen Morwenna</b><span>${what}</span></div>`
        }
      }
    }

    for (const [id, l] of this.labels) {
      if (seen.has(id)) continue
      l.el.remove()
      this.labels.delete(id)
    }
  }
}

/** Soldier count as the player knows it: exact, from a scouting report (≈), or a rumour (~…?). */
/**
 * The badge at the head of an army's label: the crowned head's royal shield, a named commander's
 * shield in their banner colour, the spymaster's dagger or the wardens' eye, or for a captain's band
 * the glyph of its main arm (horse, bow, siege, spear wall). A rumoured host shows crossed swords.
 */
function armyEmblem(engine: GameEngine, a: Army, rumour: boolean): string {
  const charge = chargeForTeam(engine.team(a.faction))
  const realm = engine.factionColor(a.faction)
  if (rumour) return `<span class="al-emblem">${glyphSvg('swords', 13)}</span>`
  if (a.royal) return `<span class="al-emblem al-shield">${shieldSvg('royal', realm, 15, charge, 'al-svg')}</span>`
  // The High King's paladins: a white shield with the golden sun.
  if (a.sacred) return `<span class="al-emblem al-shield">${shieldSvg('lord', '#f4ecd2', 15, 'sun', 'al-svg')}</span>`
  if (a.sappers) return `<span class="al-emblem al-spy">${glyphSvg('pick', 13)}</span>`
  if (a.blades || engine.isSpyBand(a)) return `<span class="al-emblem al-spy">${glyphSvg('dagger', 13)}</span>`
  if (a.wardens) return `<span class="al-emblem al-warden">${glyphSvg('eye', 13)}</span>`
  const cmd = engine.commanderOf(a)
  if (cmd) return `<span class="al-emblem al-shield">${shieldSvg('lord', cmd.banner_color, 15, charge, 'al-svg')}</span>`
  // A captain's band: its main arm.
  const cat = new Map<string, number>()
  for (const k in a.troops) {
    const u = engine.units.get(k)
    if (u) cat.set(u.category, (cat.get(u.category) ?? 0) + (a.troops[k] ?? 0))
  }
  let best = 'infantry'
  let bn = -1
  for (const [c, v] of cat) if (v > bn) [best, bn] = [c, v]
  const glyph = best === 'cavalry' ? 'horse' : best === 'ranged' ? 'bow' : best === 'siege' ? 'siege' : 'shield'
  return `<span class="al-emblem">${glyphSvg(glyph, 13)}</span>`
}

function knownCount(engine: GameEngine, id: string): string {
  const k = engine.knowledge(id)
  if (k.kind === 'exact') return fmt(Math.floor(k.total))
  if (k.kind === 'scouted') return `≈${fmt(Math.round(k.total / 10) * 10)}${k.age > 300 ? '·old' : ''}`
  return `~${fmt(k.total)}?`
}

const STANCE_GLYPH = { escort: 'wagon', hunt: 'horse', picket: 'flag', ambush: 'tree', harass: 'swords', bridge: 'stakes', strike: 'dagger', escortArmy: 'shield', follow: 'muster', guard: 'tower' } as const
const STANCE_LABEL: Partial<Record<string, string>> = { escortArmy: 'ESCORT', follow: 'FOLLOW', guard: 'GUARD' }
function statusBadge(a: Army): string {
  if (a.veil === 'concealed') return `<div class="al-status infil">${glyphSvg('eyeClosed', 12)} CONCEALED</div>`
  if (a.veil === 'disguised') return `<div class="al-status disguise">${glyphSvg('eyeHalf', 12)} DISGUISED</div>`
  if (a.faction === PLAYER && !!a.commanderKey && HIDING_KEYS.includes(a.commanderKey) && !a.battleId) return `<div class="al-status seen">${glyphSvg('eye', 12)} SEEN</div>`
  if (a.stance && a.faction === PLAYER && !a.battleId && a.status !== 'retreating') return `<div class="al-status stance">${glyphSvg(STANCE_GLYPH[a.stance.kind], 11)} ${STANCE_LABEL[a.stance.kind] ?? a.stance.kind.toUpperCase()}</div>`
  switch (a.status) {
    case 'battle':
      return `<div class="al-status battle">${glyphSvg('swords', 11)} BATTLE</div>`
    case 'sieging':
      return `<div class="al-status battle">${glyphSvg('castle', 11)} SIEGE</div>`
    case 'retreating':
      return `<div class="al-status retreat">${glyphSvg('retreat', 11)} RETREAT</div>`
    default:
      return ''
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}
