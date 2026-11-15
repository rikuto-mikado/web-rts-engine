import { RAMPART_GATE, type World } from '../game/world'

/** Paint the land from above (height-shaded climate colours, water, fords and bridges) into a square canvas. */
export function paintTerrain(world: World, size: number): HTMLCanvasElement {
  const bg = document.createElement('canvas')
  bg.width = bg.height = size
  const ctx = bg.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const c: [number, number, number] = [0, 0, 0]
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = -world.half + ((i + 0.5) / size) * world.size
      const z = -world.half + ((j + 0.5) / size) * world.size
      const h = world.heightAt(x, z)
      world.colorAt(x, z, c)
      if (h < 0.5 && !world.bridgeAt(x, z)) {
        const w = world.biome.water
        const ford = world.fordAt(x, z) ? 0.45 : 0
        c[0] = (((w >> 16) & 255) / 255) * (1 - ford) + 0.78 * ford
        c[1] = (((w >> 8) & 255) / 255) * (1 - ford) + 0.72 * ford
        c[2] = ((w & 255) / 255) * (1 - ford) + 0.55 * ford
      } else if (world.bridgeAt(x, z)) {
        c[0] = 0.55
        c[1] = 0.42
        c[2] = 0.27
      }
      const shade = 0.85 + Math.min(0.3, h / 400)
      const k = (j * size + i) * 4
      img.data[k] = Math.min(255, c[0] * 255 * shade)
      img.data[k + 1] = Math.min(255, c[1] * 255 * shade)
      img.data[k + 2] = Math.min(255, c[2] * 255 * shade)
      img.data[k + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  drawStructures(ctx, world, size)
  return bg
}

/**
 * The map's great works, drawn over the painted land so they read at any size: roads, the
 * escarpments' cliff edges (with their canyons left open), and the great walls with their
 * gates (gold) and breaches (a gap of rubble).
 */
export function drawStructures(ctx: CanvasRenderingContext2D, world: World, size: number) {
  const k = size / world.size
  const px = (v: number) => (v + world.half) * k
  const line = (pts: [number, number][], skip: (x: number, z: number) => boolean) => {
    let open = false
    ctx.beginPath()
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]
      const [bx, bz] = pts[i + 1]
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (world.size / size) / 2))
      for (let s = 0; s <= n; s++) {
        const x = ax + ((bx - ax) * s) / n
        const z = az + ((bz - az) * s) / n
        if (skip(x, z)) {
          open = false
          continue
        }
        if (!open) ctx.moveTo(px(x), px(z))
        else ctx.lineTo(px(x), px(z))
        open = true
      }
    }
    ctx.stroke()
  }
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const r of world.def.roads ?? []) {
    ctx.strokeStyle = 'rgba(92,66,38,0.85)'
    ctx.lineWidth = Math.max(1, size / 190)
    line(r.points, () => false)
  }
  for (const e of world.def.escarpments ?? []) {
    // The cliff top, traced along its real (wandering) line, open where the ravines climb it.
    const edge: [number, number][] = []
    for (let x = -world.half; x <= world.half; x += world.size / size) edge.push([x, world.escarpSide(e, x, 0)])
    const ravine = (x: number) => e.passes.some((p) => Math.abs(p.x - x) < p.w + 14)
    ctx.strokeStyle = 'rgba(40,18,10,0.9)'
    ctx.lineWidth = Math.max(1.5, size / 140)
    line(edge, (x) => ravine(x))
  }
  // A city's ring walls, open at their gates (the gates themselves in gold).
  for (const w of world.def.walls ?? []) {
    const ring: [number, number][] = []
    if (w.points) ring.push(...world.wallLoop(w))
    else for (let k = 0; k <= 96; k++) ring.push([w.x + Math.cos((k / 96) * Math.PI * 2) * w.r, w.z + Math.sin((k / 96) * Math.PI * 2) * w.r])
    const gap = (x: number, z: number) => {
      if (w.gatePts) return w.gatePts.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 62)
      const a = Math.atan2(z - w.z, x - w.x)
      return w.gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 62 / w.r)
    }
    ctx.strokeStyle = 'rgba(20,18,16,0.9)'
    ctx.lineWidth = Math.max(3, size / 70)
    line(ring, gap)
    ctx.strokeStyle = '#d9d3c4'
    ctx.lineWidth = Math.max(1.6, size / 130)
    line(ring, gap)
    const gatePts: [number, number][] = w.gatePts ?? w.gates.map((g) => [w.x + Math.cos(g) * w.r, w.z + Math.sin(g) * w.r])
    for (const [gx, gz] of gatePts) {
      const s = Math.max(2.5, size / 75)
      ctx.fillStyle = '#e8c066'
      ctx.strokeStyle = '#1a140e'
      ctx.lineWidth = 1
      ctx.fillRect(px(gx) - s / 2, px(gz) - s / 2, s, s)
      ctx.strokeRect(px(gx) - s / 2, px(gz) - s / 2, s, s)
    }
  }
  for (const r of world.def.ramparts ?? []) {
    const gap = (x: number, z: number) => r.gates.some((g) => Math.hypot(g.x - x, g.z - z) < RAMPART_GATE)
    ctx.strokeStyle = 'rgba(20,18,16,0.9)'
    ctx.lineWidth = Math.max(3, size / 70)
    line(r.points, gap)
    ctx.strokeStyle = '#d9d3c4'
    ctx.lineWidth = Math.max(1.6, size / 130)
    line(r.points, gap)
    for (const g of r.gates) {
      ctx.fillStyle = g.breach ? '#c7b9a0' : '#e8c066'
      ctx.strokeStyle = '#1a140e'
      ctx.lineWidth = 1
      const s = Math.max(2.5, size / 75)
      ctx.beginPath()
      if (g.breach) {
        ctx.arc(px(g.x), px(g.z), s * 0.7, 0, Math.PI * 2)
      } else {
        ctx.rect(px(g.x) - s / 2, px(g.z) - s / 2, s, s)
      }
      ctx.fill()
      ctx.stroke()
    }
  }
  ctx.restore()
}

/**
 * The granges on a small map: a thin dashed line back to the castle each one belongs to (so a free
 * castle and its farm read as one), and a sheaf-gold square edged in its holder's colour.
 */
export function drawGranges(
  ctx: CanvasRenderingContext2D,
  world: World,
  size: number,
  granges: { x: number; z: number; castleId: string; faction?: string }[],
  castleAt: (id: string) => { x: number; z: number } | undefined,
  colorOf: (g: { castleId: string; faction?: string }) => string,
) {
  const px = (v: number) => ((v + world.half) / world.size) * size
  const s = Math.max(2.4, size / 110)
  ctx.save()
  for (const g of granges) {
    const c = castleAt(g.castleId)
    if (!c) continue
    ctx.strokeStyle = 'rgba(232,206,140,0.55)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    ctx.moveTo(px(g.x), px(g.z))
    ctx.lineTo(px(c.x), px(c.z))
    ctx.stroke()
  }
  ctx.setLineDash([])
  for (const g of granges) {
    const x = px(g.x)
    const y = px(g.z)
    ctx.fillStyle = '#d8b65a'
    ctx.strokeStyle = colorOf(g)
    ctx.lineWidth = 1.4
    ctx.fillRect(x - s, y - s, s * 2, s * 2)
    ctx.strokeRect(x - s, y - s, s * 2, s * 2)
  }
  ctx.restore()
}

/**
 * The Sanctuary of the High King on a map: a white marble disc in a gilded ring with the sun's rays
 * about it; `lit` once the doors are open (a blue-white glow), brighter once the High King answered.
 */
export function drawTemple(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, lit: 0 | 1 | 2 = 0) {
  ctx.save()
  if (lit) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * (lit === 2 ? 2.4 : 1.9))
    g.addColorStop(0, 'rgba(190,220,255,0.55)')
    g.addColorStop(1, 'rgba(190,220,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, s * (lit === 2 ? 2.4 : 1.9), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = '#f0c460'
  ctx.lineWidth = Math.max(1, s * 0.16)
  ctx.lineCap = 'round'
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(a) * s * 0.95, y + Math.sin(a) * s * 0.95)
    ctx.lineTo(x + Math.cos(a) * s * 1.35, y + Math.sin(a) * s * 1.35)
    ctx.stroke()
  }
  ctx.fillStyle = '#f4efe2'
  ctx.strokeStyle = '#1a140a'
  ctx.lineWidth = Math.max(1, s * 0.14)
  ctx.beginPath()
  ctx.arc(x, y, s * 0.78, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = '#d8a83e'
  ctx.lineWidth = Math.max(1, s * 0.18)
  ctx.beginPath()
  ctx.arc(x, y, s * 0.55, 0, Math.PI * 2)
  ctx.stroke()
  // The dome.
  ctx.fillStyle = '#e2b850'
  ctx.beginPath()
  ctx.arc(x, y, s * 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
