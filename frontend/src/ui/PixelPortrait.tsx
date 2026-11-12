import { memo } from 'react'
import type { PortraitSpec } from '../game/types'

/**
 * Procedural 32x32 pixel-art bust, drawn from a small spec stored with each
 * commander in the database. Faces are bare (no helms or plate): soldiers
 * in quilted gambesons, tabards, fur mantles and travelling cloaks, with the
 * scars, beards and crowns of their trade.
 */
const N = 32

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))))
  const r = ch((n >> 16) & 255)
  const g = ch((n >> 8) & 255)
  const b = ch(n & 255)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

type Px = (string | null)[][]

function draw(p: PortraitSpec): Px {
  const px: Px = Array.from({ length: N }, () => Array(N).fill(null))
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && y >= 0 && x < N && y < N) px[y][x] = c
  }
  const rect = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c)
  }
  const get = (x: number, y: number) => (x >= 0 && y >= 0 && x < N && y < N ? px[y][x] : null)

  const skin = p.skin ?? '#d6a07a'
  const skinD = shade(skin, -0.16)
  const skinDD = shade(skin, -0.32)
  const skinL = shade(skin, 0.12)
  const hair = p.hair ?? '#3a2a1a'
  const hairD = shade(hair, -0.3)
  const hairL = shade(hair, 0.18)
  const cloth = p.cloth ?? p.armor ?? '#5a4a3a'
  const clothD = shade(cloth, -0.28)
  const clothL = shade(cloth, 0.14)
  const trim = p.trim ?? '#c9a227'
  const fur = p.fur ?? '#8a7458'
  const bg = p.bg ?? '#222'
  const gold = '#e3bd5a'
  const goldD = '#a8862a'

  // Background: a dark vertical wash with a vignette.
  for (let y = 0; y < N; y++) rect(0, y, N - 1, y, shade(bg, 0.08 - (y / N) * 0.22))
  for (let i = 0; i < N; i++) {
    for (const [x, y] of [[i, 0], [i, N - 1], [0, i], [N - 1, i]]) set(x, y, shade(bg, -0.4))
  }

  // Long hair falls behind the shoulders.
  if (p.hair_style === 'long' || p.hair_style === 'wild') {
    rect(8, 10, 9, 25, hairD)
    rect(22, 10, 23, 25, hairD)
  }

  // --- Clothing (no armour) --------------------------------------------------
  const shoulders = () => {
    for (let y = 25; y < N; y++) {
      const w = Math.min(13, 6 + (y - 25) * 2)
      rect(16 - w, y, 15 + w, y, cloth)
    }
    rect(3, 29, 4, 31, clothD)
    rect(27, 29, 28, 31, clothD)
  }
  shoulders()
  switch (p.clothing ?? 'gambeson') {
    case 'gambeson':
      // Quilted jacket: stitched rows and a stand-up collar.
      for (let y = 26; y < N; y += 2) for (let x = 2; x < N - 2; x++) if (get(x, y) === cloth) set(x, y, clothD)
      rect(12, 24, 19, 25, clothL)
      rect(15, 26, 16, 31, trim)
      break
    case 'tabard':
      // A surcoat in the lord's colours with a broad stripe.
      rect(10, 25, 21, 31, trim)
      rect(14, 25, 17, 31, shade(trim, -0.25))
      rect(12, 24, 19, 24, clothL)
      break
    case 'fur':
      // A fur mantle over the shoulders, fastened with a brooch.
      for (let y = 24; y <= 28; y++) for (let x = 4; x <= 27; x++) if (get(x, y) && (x + y) % 3 !== 0 && Math.abs(x - 15.5) > 3 - (y - 24)) set(x, y, (x * 7 + y) % 4 === 0 ? shade(fur, -0.2) : fur)
      rect(15, 28, 16, 29, gold)
      set(15, 28, '#fff3c0')
      break
    case 'cloak':
      // A travelling cloak, the clasp chain across the chest.
      rect(10, 26, 21, 31, clothD)
      for (let x = 11; x <= 20; x++) set(x, 26 + Math.round(Math.abs(x - 15.5) / 3), gold)
      rect(10, 26, 11, 27, goldD)
      rect(20, 26, 21, 27, goldD)
      break
    case 'robe':
      // A robe with an embroidered collar.
      rect(12, 24, 19, 26, trim)
      for (let x = 12; x <= 19; x += 2) set(x, 25, shade(trim, 0.3))
      rect(15, 27, 16, 31, trim)
      break
    case 'jerkin':
      // A leather jerkin laced up the front.
      rect(12, 25, 19, 31, clothL)
      for (let y = 26; y <= 30; y += 2) {
        set(14, y, '#2a1a10')
        set(17, y, '#2a1a10')
        set(15, y + 1, '#2a1a10')
        set(16, y + 1, '#2a1a10')
      }
      break
  }

  // --- Neck and head -----------------------------------------------------------
  rect(13, 21, 18, 24, skinD)
  rect(13, 23, 18, 23, skinDD)
  // Head: rounded, with the jaw narrowing.
  rect(11, 8, 20, 18, skin)
  rect(10, 10, 21, 16, skin)
  rect(12, 19, 19, 20, skin)
  rect(13, 21, 18, 21, skin)
  set(11, 18, skinD)
  set(20, 18, skinD)
  // Light from the left: the right side in shade, a cheekbone highlight.
  rect(19, 10, 21, 18, skinD)
  rect(17, 19, 19, 20, skinD)
  rect(11, 14, 12, 15, skinL)
  // Ears.
  rect(9, 12, 9, 15, skinD)
  rect(22, 12, 22, 15, skinDD)
  set(9, 13, skinDD)

  // Face: brows, eyes, nose and mouth.
  const eye = p.eyes ?? '#2a1a10'
  const brow = p.brows === 'heavy' ? hairD : shade(hair, -0.15)
  rect(12, 11, 14, 11, brow)
  rect(17, 11, 19, 11, brow)
  if (p.brows === 'heavy') {
    rect(12, 10, 14, 10, brow)
    rect(17, 10, 19, 10, brow)
  }
  // Eyes: lid shadow, white, iris.
  rect(12, 12, 14, 12, skinDD)
  rect(17, 12, 19, 12, skinDD)
  rect(12, 13, 14, 13, '#efe6d6')
  rect(17, 13, 19, 13, '#efe6d6')
  set(13, 13, eye)
  set(18, 13, eye)
  set(14, 13, shade(eye, 0.2))
  set(19, 13, shade(eye, 0.2))
  if (p.female) {
    set(11, 12, '#1a1010')
    set(20, 12, '#1a1010')
  }
  // Nose: bridge highlight, shaded side, nostrils.
  rect(15, 13, 15, 16, skinL)
  rect(16, 13, 16, 16, skinD)
  rect(15, 17, 16, 17, skinDD)
  set(14, 17, skinD)
  // Mouth.
  rect(14, 19, 17, 19, p.female ? '#a8464e' : shade(skin, -0.38))
  set(14, 20, skinD)
  set(17, 20, skinD)
  // Age: lines at the brow and the corners of the eyes.
  if (p.age === 'old' || p.age === 'veteran') {
    rect(13, 9, 18, 9, skinD)
    set(11, 14, skinD)
    set(20, 14, skinDD)
    if (p.age === 'old') {
      rect(14, 8, 17, 8, skinD)
      set(13, 18, skinD)
      set(18, 18, skinD)
    }
  }
  if (p.freckles) for (const [x, y] of [[12, 15], [13, 16], [18, 15], [19, 16], [14, 15]]) set(x, y, shade(skin, -0.24))
  if (p.scar) {
    // An old sword cut down the cheek, below the eye.
    for (const [x, y] of [[19, 14], [19, 15], [20, 16], [20, 17]]) set(x, y, '#b86a5e')
    set(18, 15, '#d08a7e')
  }

  // --- Hair --------------------------------------------------------------------
  switch (p.hair_style) {
    case 'bald':
      rect(10, 11, 10, 15, hair)
      rect(21, 11, 21, 15, hair)
      set(14, 8, skinL)
      set(15, 8, skinL)
      break
    case 'shaved':
      for (let y = 7; y <= 10; y++) for (let x = 11; x <= 20; x++) if ((x + y) % 2 === 0) set(x, y, shade(skin, -0.22))
      break
    case 'cropped':
      rect(11, 6, 20, 8, hair)
      rect(10, 8, 10, 11, hairD)
      rect(21, 8, 21, 11, hairD)
      for (let x = 11; x <= 20; x += 2) set(x, 6, hairL)
      break
    case 'wild':
      // A shaggy mane: uneven locks, swept every way.
      rect(10, 6, 21, 9, hair)
      for (const [x, y] of [[10, 5], [12, 4], [13, 5], [16, 5], [17, 4], [20, 5], [9, 7], [22, 7]]) set(x, y, hair)
      rect(8, 8, 10, 16, hair)
      rect(21, 8, 23, 16, hairD)
      set(8, 17, hairD)
      set(23, 17, hairD)
      for (const [x, y] of [[11, 7], [14, 6], [18, 7], [9, 11]]) set(x, y, hairL)
      for (const [x, y] of [[12, 9], [19, 9]]) set(x, y, hairD)
      break
    case 'topknot':
      rect(11, 7, 20, 8, hair)
      rect(10, 9, 10, 12, hair)
      rect(21, 9, 21, 12, hair)
      rect(14, 3, 17, 6, hair)
      rect(15, 2, 16, 2, hairD)
      rect(14, 6, 17, 6, gold)
      break
    case 'braid':
      rect(11, 6, 20, 8, hair)
      rect(10, 7, 10, 14, hair)
      rect(21, 7, 22, 14, hair)
      set(12, 9, hair)
      for (let y = 15; y <= 27; y++) set(22 + (y % 2), y, y % 2 ? hair : hairD)
      set(22, 28, trim)
      break
    case 'tied':
      // Swept back and tied at the nape.
      rect(11, 6, 20, 8, hair)
      rect(10, 8, 10, 12, hair)
      rect(21, 8, 21, 12, hairD)
      for (let x = 11; x <= 20; x += 2) set(x, 7, hairL)
      rect(22, 12, 23, 17, hairD)
      break
    case 'long':
      rect(11, 6, 20, 8, hair)
      rect(10, 7, 10, 18, hair)
      rect(21, 7, 21, 18, hair)
      rect(12, 9, 13, 9, hair)
      for (let x = 11; x <= 20; x += 2) set(x, 6, hairL)
      break
    default:
      rect(11, 6, 20, 8, hair)
      rect(10, 8, 10, 11, hair)
      rect(21, 8, 21, 11, hair)
      set(12, 9, hair)
      for (let x = 12; x <= 19; x += 3) set(x, 6, hairL)
  }

  // --- Beard ---------------------------------------------------------------------
  const beardC = p.beard_color ?? hair
  const beardD = shade(beardC, -0.25)
  switch (p.beard) {
    case 'full':
      rect(10, 15, 10, 18, beardC)
      rect(21, 15, 21, 18, beardD)
      rect(11, 17, 20, 21, beardC)
      rect(12, 22, 19, 22, beardD)
      rect(13, 23, 18, 23, beardD)
      rect(13, 18, 18, 18, beardC)
      rect(14, 19, 17, 19, shade(skin, -0.38))
      for (let x = 12; x <= 19; x += 2) set(x, 21, beardD)
      break
    case 'short':
      rect(10, 15, 10, 17, beardC)
      rect(21, 15, 21, 17, beardD)
      rect(11, 18, 20, 20, beardC)
      rect(13, 18, 18, 18, beardC)
      rect(14, 19, 17, 19, shade(skin, -0.38))
      break
    case 'forked':
      rect(11, 17, 20, 19, beardC)
      rect(13, 18, 18, 18, beardC)
      rect(14, 19, 17, 19, shade(skin, -0.38))
      rect(12, 20, 14, 23, beardC)
      rect(17, 20, 19, 23, beardD)
      set(13, 24, beardD)
      set(18, 24, beardD)
      break
    case 'goatee':
      rect(14, 18, 17, 18, beardC)
      rect(14, 20, 17, 22, beardC)
      set(15, 23, beardD)
      set(16, 23, beardD)
      break
    case 'mustache':
      rect(13, 18, 18, 18, beardC)
      set(12, 19, beardC)
      set(19, 19, beardC)
      set(12, 20, beardD)
      set(19, 20, beardD)
      break
    case 'stubble':
      for (let y = 16; y <= 21; y++) for (let x = 11; x <= 20; x++) if ((x + y) % 2 === 0 && (get(x, y) === skin || get(x, y) === skinD)) set(x, y, shade(skin, -0.14))
      break
  }

  if (p.eyepatch) {
    rect(17, 12, 19, 14, '#141414')
    for (let x = 10; x <= 21; x++) set(x, 10 + Math.round((x - 10) * 0.12), '#2a2420')
  }

  // --- Headgear (never a helm) -----------------------------------------------------
  switch (p.headgear) {
    case 'crown':
      // A gold circlet with points and gems: a king on campaign, not on a throne.
      rect(10, 6, 21, 7, gold)
      rect(10, 7, 21, 7, goldD)
      for (const x of [10, 13, 16, 18, 21]) rect(x, 3, x, 5, gold)
      for (const x of [13, 18]) set(x, 3, '#fff3c0')
      set(15, 6, '#c0392b')
      set(16, 6, '#c0392b')
      set(12, 6, '#2e86de')
      set(19, 6, '#27ae60')
      break
    case 'circlet':
      rect(10, 8, 21, 8, gold)
      set(15, 8, '#3ad08a')
      set(16, 8, '#3ad08a')
      break
    case 'chaperon': {
      // A draped cloth hat.
      const h = p.hat ?? '#7a2a2a'
      rect(9, 5, 22, 8, h)
      rect(8, 7, 23, 8, shade(h, -0.2))
      rect(20, 4, 24, 6, shade(h, 0.1))
      rect(23, 6, 25, 12, shade(h, -0.15))
      break
    }
    case 'hood': {
      // A deep travelling hood: the face in shadow, the brim low over the eyes.
      const h = p.hat ?? cloth
      const hD = shade(h, -0.3)
      const hL = shade(h, 0.14)
      rect(8, 4, 23, 9, h)
      rect(10, 2, 21, 3, h)
      rect(7, 8, 9, 26, h)
      rect(22, 8, 24, 26, hD)
      rect(10, 3, 14, 4, hL)
      rect(8, 6, 9, 14, hL)
      // The brim's shadow falls across brow and eyes.
      rect(10, 9, 21, 10, hD)
      for (let x = 10; x <= 21; x++) {
        const c = get(x, 11)
        if (c) set(x, 11, shade(c, -0.35))
      }
      rect(10, 10, 10, 20, shade(skin, -0.45))
      rect(21, 10, 21, 20, shade(skin, -0.5))
      // The hood falls onto the shoulders.
      rect(6, 24, 25, 27, h)
      rect(6, 27, 25, 27, hD)
      break
    }
    case 'headband': {
      const h = p.hat ?? trim
      rect(10, 8, 21, 8, h)
      rect(22, 8, 23, 11, shade(h, -0.2))
      break
    }
  }
  return px
}

export const PixelPortrait = memo(function PixelPortrait({ spec, size = 40, className = '' }: { spec: PortraitSpec | undefined; size?: number; className?: string }) {
  const px = draw(spec ?? {})
  const rects: { x: number; y: number; w: number; c: string }[] = []
  for (let y = 0; y < N; y++) {
    let x = 0
    while (x < N) {
      const c = px[y][x]
      let w = 1
      while (x + w < N && px[y][x + w] === c) w++
      if (c) rects.push({ x, y, w, c })
      x += w
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${N} ${N}`} shapeRendering="crispEdges" className={`shrink-0 rounded-md ${className}`} aria-hidden>
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />
      ))}
    </svg>
  )
})
