/**
 * The realm's heraldry. Every castle is marked by a shield in its lord's colours, finished as a
 * herald would: an enamelled field parted per pale (the right half in shade, the left catching the
 * light), darkening toward the base, a fine filigree line inside a forged rim. Its rank shows in the
 * shield itself:
 *
 * - royal: the court of a crowned head, a double rim of antique gold, a forged Gothic crown sitting
 *   on the shield's top (fleurons, a band engraved and set with garnets and bevelled gold), and the
 *   crown's charge: the King's fleur-de-lis, the Usurper's thorned greatsword, the Sun Emperor's
 *   radiant sun, or the free lords' crossed halberds under an iron crown.
 * - lord: the seat of a local lord, a polished silver rim, an embattled silver chief and a keep with
 *   its turrets, gate and portcullis.
 * - castle: any other castle or stronghold, a rim of blackened iron with rivets, a chevron of steel
 *   and a bastion.
 *
 * Used as inline SVG (map labels, UI) and drawn on canvases (minimaps, the war report).
 */
export type ShieldRank = 'royal' | 'lord' | 'castle'
/** The crown's charge: the King's side, the Usurper's, the Sun Emperor's, or the free lords'. */
export type ShieldCharge = 'fleur' | 'thorn' | 'sun' | 'iron'

/** The charge a side bears (by its team: A the King's, B the Usurper's, C the Sun Emperor's). */
export function chargeForTeam(team: string): ShieldCharge {
  return team === 'A' ? 'fleur' : team === 'B' ? 'thorn' : team === 'C' ? 'sun' : 'iron'
}

/** A Gothic heater shield, its top dipping a little to the middle, in a 24 x 28 box. */
export const SHIELD_PATH = 'M2 2.4 Q12 3.5 22 2.4 V12 C22 19.4 17.3 24.4 12 27.4 C6.7 24.4 2 19.4 2 12 Z'
/** The same outline set in, for the filigree inside the rim. */
const INNER_PATH = 'M3.7 4 Q12 5 20.3 4 V12 C20.3 18.6 16.3 23 12 25.5 C7.7 23 3.7 18.6 3.7 12 Z'

const DEFS =
  '<defs>' +
  '<clipPath id="hg-clip"><path d="' + SHIELD_PATH + '"/></clipPath>' +
  '<linearGradient id="hg-gold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset="0.48" stop-color="#d8a642"/><stop offset="1" stop-color="#6e490c"/></linearGradient>' +
  '<linearGradient id="hg-charge" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#ffeeb0"/><stop offset="0.5" stop-color="#e0b04e"/><stop offset="1" stop-color="#8a5c12"/></linearGradient>' +
  '<linearGradient id="hg-silver" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#cdd3da"/><stop offset="1" stop-color="#6f7680"/></linearGradient>' +
  '<linearGradient id="hg-steel" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#e8ecef"/><stop offset="0.55" stop-color="#a6adb6"/><stop offset="1" stop-color="#565c64"/></linearGradient>' +
  '<linearGradient id="hg-iron" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#8f8a82"/><stop offset="0.3" stop-color="#4c4741"/><stop offset="0.7" stop-color="#26221e"/><stop offset="1" stop-color="#5c574f"/></linearGradient>' +
  '<linearGradient id="hg-blade" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#f6f8fa"/><stop offset="0.5" stop-color="#d2d7dd"/><stop offset="0.51" stop-color="#8f969f"/><stop offset="1" stop-color="#b8bec6"/></linearGradient>' +
  '<linearGradient id="hg-garnet" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#d43848"/><stop offset="1" stop-color="#7a1420"/></linearGradient>' +
  '<linearGradient id="hg-vig" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.1"/><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.38"/></linearGradient>' +
  '<filter id="hg-lift" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0.25" dy="0.45" stdDeviation="0.4" flood-color="#000" flood-opacity="0.7"/></filter>' +
  '<radialGradient id="hg-disc" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#fff6cc"/><stop offset="0.6" stop-color="#e6b44c"/><stop offset="1" stop-color="#9a6614"/></radialGradient>' +
  '</defs>'

/** The enamel of the field: parted per pale in light and shade, darkening toward the base. */
const FIELD = '<rect x="0" y="0" width="12" height="28" fill="#fff" opacity="0.07"/><rect x="12" y="0" width="12" height="28" fill="#000" opacity="0.22"/><rect x="0" y="0" width="24" height="28" fill="url(#hg-vig)"/>'

// --- The ordinaries and charges of the lesser ranks ---------------------------------------------

/** A chevron of steel, and a bastion above its point. */
const CASTLE_BODY =
  '<path d="M0 21.4 L12 10.6 L24 21.4 V26.4 L12 15.8 L0 26.4 Z" fill="url(#hg-steel)" stroke="#1d1b18" stroke-width="0.45" stroke-linejoin="round"/>' +
  '<path d="M12 10.6 L24 21.4 V26.4 L12 15.8 Z" fill="#000" opacity="0.2"/>' +
  '<path d="M1.2 22.6 L12 12.9" stroke="#fff" stroke-opacity="0.45" stroke-width="0.35"/>' +
  '<g stroke="#1d1b18" stroke-width="0.4" stroke-linejoin="round">' +
  '<path d="M8.6 11.2 V6.6 H9.8 V5.2 H11.1 V6.6 H12.9 V5.2 H14.2 V6.6 H15.4 V11.2 Z" fill="url(#hg-steel)"/>' +
  '<path d="M12 6.6 H12.9 V5.2 H14.2 V6.6 H15.4 V11.2 H12 Z" fill="#000" opacity="0.18" stroke="none"/>' +
  '</g>' +
  '<rect x="11.55" y="7.4" width="0.9" height="2" fill="#141210"/><path d="M8.6 9 H15.4" stroke="#1d1b18" stroke-width="0.25" opacity="0.6"/>'

/** An embattled chief of silver, and a keep with its turrets, gate and portcullis. */
const LORD_BODY =
  '<path d="M0 0 H24 V7.4 H21.6 V8.8 H19.2 V7.4 H16.8 V8.8 H14.4 V7.4 H12 V8.8 H9.6 V7.4 H7.2 V8.8 H4.8 V7.4 H2.4 V8.8 H0 Z" fill="url(#hg-silver)" stroke="#20242a" stroke-width="0.4"/>' +
  '<path d="M12 0 H24 V7.4 H21.6 V8.8 H19.2 V7.4 H16.8 V8.8 H14.4 V7.4 H12 Z" fill="#000" opacity="0.15"/>' +
  '<g fill="url(#hg-silver)" stroke="#1d2127" stroke-width="0.4" stroke-linejoin="round">' +
  // The turrets either side, then the great tower between.
  '<path d="M5.4 22.6 V14.2 H5.4 V13 H6.5 V14.2 H7.4 V13 H8.5 V14.2 H8.9 V22.6 Z"/>' +
  '<path d="M15.1 22.6 V14.2 H15.5 V13 H16.6 V14.2 H17.5 V13 H18.6 V14.2 H18.6 V22.6 Z"/>' +
  '<path d="M8.6 22.6 V11.6 H8.6 V10 H10 V11.6 H11.3 V10 H12.7 V11.6 H14 V10 H15.4 V11.6 H15.4 V22.6 Z"/>' +
  '</g>' +
  '<path d="M12 11.6 V10 H12.7 V11.6 H14 V10 H15.4 V22.6 H12 Z M15.1 14.2 H18.6 V22.6 H15.4 Z" fill="#000" opacity="0.16"/>' +
  '<path d="M8.6 13.2 H15.4 M5.4 16.4 H8.6 M15.4 16.4 H18.6" stroke="#1d2127" stroke-width="0.25" opacity="0.6"/>' +
  // The gate, its portcullis half down; arrow slits.
  '<path d="M10.5 22.6 V19.4 Q12 17.4 13.5 19.4 V22.6 Z" fill="#141210"/>' +
  '<path d="M11.1 18.6 V21.2 M12 18.2 V21.2 M12.9 18.6 V21.2 M10.6 20 H13.4" stroke="#b8bec6" stroke-width="0.32"/>' +
  '<rect x="11.6" y="13.8" width="0.8" height="2" fill="#141210"/><rect x="6.7" y="16.8" width="0.6" height="1.6" fill="#141210"/><rect x="16.7" y="16.8" width="0.6" height="1.6" fill="#141210"/>'

// --- The crowns' charges ---------------------------------------------------------------------------

const FLEUR =
  '<g fill="url(#hg-charge)" stroke="#4a2e06" stroke-width="0.42" stroke-linejoin="round">' +
  // The middle petal, sword-shaped, with its midrib.
  '<path d="M12 4.4 C13.7 6.5 14.7 9.3 13.3 12.5 L12 14.4 L10.7 12.5 C9.3 9.3 10.3 6.5 12 4.4 Z"/>' +
  // The outer petals, curling back.
  '<path d="M11 14 C9.7 11 6.1 9.5 4.8 11.6 C4 13.1 5.1 14.8 6.8 14.3 C6.2 13.2 6.9 12.2 7.9 12.6 C9.1 13.1 9.9 14.1 10.4 15.2 Z"/>' +
  '<path d="M13 14 C14.3 11 17.9 9.5 19.2 11.6 C20 13.1 18.9 14.8 17.2 14.3 C17.8 13.2 17.1 12.2 16.1 12.6 C14.9 13.1 14.1 14.1 13.6 15.2 Z"/>' +
  // The band, and the trefoil foot below it.
  '<path d="M7.4 14.5 H16.6 L16.3 16.4 H7.7 Z"/>' +
  '<path d="M12 16.4 L13.3 19.8 L12 22 L10.7 19.8 Z"/>' +
  '<path d="M10.6 16.4 C9.9 17.7 8.6 18.2 7.4 17.8 C8.2 19.2 9.8 19.4 11 18.2 Z"/>' +
  '<path d="M13.4 16.4 C14.1 17.7 15.4 18.2 16.6 17.8 C15.8 19.2 14.2 19.4 13 18.2 Z"/>' +
  '</g>' +
  '<path d="M12 5.6 V13.4 M7.6 15.4 H16.4" stroke="#7a5212" stroke-width="0.3" fill="none"/>' +
  '<path d="M11.2 6.8 C10.6 8.6 10.6 10.4 11.2 12" stroke="#fff6cf" stroke-width="0.35" fill="none" opacity="0.8"/>'

const THORN =
  '<g stroke="#2a0a0e" stroke-width="0.4" stroke-linejoin="round">' +
  // The blade, its fuller down the middle.
  '<path d="M10.9 10.4 H13.1 L12.95 21.2 L12 24 L11.05 21.2 Z" fill="url(#hg-blade)"/>' +
  // The crossguard, its quillons flaring; the grip bound in wire; the pommel.
  '<path d="M5.8 8.6 Q12 9.8 18.2 8.6 L18.7 9.5 L17.6 10 Q12 10.9 6.4 10 L5.3 9.5 Z" fill="url(#hg-charge)"/>' +
  '<rect x="11.35" y="5.2" width="1.3" height="3.6" rx="0.3" fill="#4a2a18"/>' +
  '<circle cx="12" cy="4.3" r="1.25" fill="url(#hg-charge)"/>' +
  '</g>' +
  '<path d="M12 10.8 V21" stroke="#5d646d" stroke-width="0.35"/>' +
  '<path d="M11.35 6 H12.65 M11.35 7 H12.65 M11.35 8 H12.65" stroke="#c9a04a" stroke-width="0.25"/>' +
  // The thorned briar, wound round the blade.
  '<path d="M13 11.4 C15.9 12.2 15.6 14.5 13 14.9 C10.4 15.3 8.4 16.9 11 17.9 C13.6 18.9 15.4 20.3 13 21.2" fill="none" stroke="#2a0d10" stroke-width="1.05"/>' +
  '<path d="M13 11.4 C15.9 12.2 15.6 14.5 13 14.9 C10.4 15.3 8.4 16.9 11 17.9 C13.6 18.9 15.4 20.3 13 21.2" fill="none" stroke="#7a1a24" stroke-width="0.45"/>' +
  '<path d="M15.3 12.1 l1.5 -0.7 l-0.5 1.4 Z M15.4 14.1 l1.6 0.4 l-1.3 0.8 Z M10.2 15.6 l-1.5 -0.5 l1 1.2 Z M9.3 17.2 l-1.5 0.5 l1.4 0.5 Z M14.4 19 l1.5 -0.4 l-0.9 1.2 Z M14.6 20.4 l1.4 0.8 l-1.5 0.1 Z" fill="#1a0608" stroke="#3a0a10" stroke-width="0.2"/>'

/** The sun: a disc, straight rays and flaming rays in turn. */
const SUN = (() => {
  const cx = 12
  const cy = 13.6
  let rays = ''
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    const p = (r: number, t: number) => `${(cx + c * r - s * t).toFixed(2)} ${(cy + s * r + c * t).toFixed(2)}`
    if (i % 2 === 0) rays += `<path d="M${p(4.1, -0.85)} L${p(8.6, 0)} L${p(4.1, 0.85)} Z"/>`
    else rays += `<path d="M${p(4.1, -0.7)} Q${p(5.4, 0.9)} ${p(6.2, -0.1)} T${p(7.6, 0)} Q${p(6.4, 0.6)} ${p(5.5, 0.6)} Q${p(4.8, -0.6)} ${p(4.1, 0.7)} Z"/>`
  }
  return (
    `<g fill="url(#hg-charge)" stroke="#5a3a08" stroke-width="0.32" stroke-linejoin="round">${rays}</g>` +
    `<circle cx="${cx}" cy="${cy}" r="4" fill="url(#hg-disc)" stroke="#5a3a08" stroke-width="0.45"/>` +
    `<circle cx="${cx}" cy="${cy}" r="2.9" fill="none" stroke="#8a5c12" stroke-width="0.3"/>`
  )
})()

/** Two halberds crossed, and an iron crown between them. */
const IRON = (() => {
  const halberd =
    '<rect x="11.5" y="4.6" width="1" height="19.4" rx="0.3" fill="#5a3e27" stroke="#1d1b18" stroke-width="0.3"/>' +
    '<path d="M12 2.4 L12.7 5.2 H11.3 Z" fill="url(#hg-steel)" stroke="#1d1b18" stroke-width="0.3"/>' +
    '<path d="M12.5 5.6 C15.4 5.4 16.6 7.2 16.2 9.6 C14.8 8.8 13.6 8.8 12.5 9.2 Z" fill="url(#hg-steel)" stroke="#1d1b18" stroke-width="0.32"/>' +
    '<path d="M11.5 6.2 L9.4 7.1 L11.5 8.1 Z" fill="url(#hg-steel)" stroke="#1d1b18" stroke-width="0.3"/>'
  return (
    `<g transform="rotate(-32 12 14)">${halberd}</g><g transform="rotate(32 12 14)">${halberd}</g>` +
    '<path d="M8.4 16.2 V13.4 L9.6 14.6 L10.8 12.8 L12 14.4 L13.2 12.8 L14.4 14.6 L15.6 13.4 V16.2 Z" fill="url(#hg-steel)" stroke="#1d1b18" stroke-width="0.35" stroke-linejoin="round"/>' +
    '<rect x="8.2" y="16" width="7.6" height="1.6" rx="0.3" fill="url(#hg-steel)" stroke="#1d1b18" stroke-width="0.35"/>'
  )
})()

/** A fleuron for the crown, at x on the band, `h` tall. */
function fleuron(x: number, h: number): string {
  const k = h / 7
  return `<path transform="translate(${x} 8.6) scale(${k.toFixed(3)})" d="M0 -7 C1.1 -5.8 1.2 -4.6 0.5 -3.8 L1.6 -3.9 C2.7 -4.2 3 -2.8 2 -2.2 L0.9 -1.9 L0.9 0 H-0.9 L-0.9 -1.9 L-2 -2.2 C-3 -2.8 -2.7 -4.2 -1.6 -3.9 L-0.5 -3.8 C-1.2 -4.6 -1.1 -5.8 0 -7 Z"/>`
}

/** A bevelled stone: a diamond with a lit facet. */
function gem(x: number, y: number, r: number, fill: string, light: string): string {
  return `<path d="M${x} ${y - r} L${x + r} ${y} L${x} ${y + r} L${x - r} ${y} Z" fill="${fill}" stroke="#3a2406" stroke-width="0.25"/><path d="M${x} ${y - r} L${x + r * 0.5} ${y - r * 0.2} L${x} ${y} L${x - r * 0.5} ${y - r * 0.2} Z" fill="${light}" opacity="0.7"/>`
}

/** The crown, forged and set on the shield's top edge (drawn in its own 24 x 12 band above the shield). */
const CROWN =
  '<g fill="url(#hg-gold)" stroke="#3e2804" stroke-width="0.4" stroke-linejoin="round">' +
  // Between the fleurons: the arches of the circlet.
  '<path d="M3.6 9 L4.4 6 L6.2 7.6 L7.8 5.2 L9.9 7.4 L12 6.2 L14.1 7.4 L16.2 5.2 L17.8 7.6 L19.6 6 L20.4 9 Z"/>' +
  fleuron(12, 8) +
  fleuron(7.8, 5.6) +
  fleuron(16.2, 5.6) +
  '<path d="M4.4 6 L3.7 3.9 L5.1 4.9 Z M19.6 6 L20.3 3.9 L18.9 4.9 Z"/>' +
  // The band, its rims and its engraving.
  '<path d="M3.2 8.6 Q12 9.9 20.8 8.6 V11.9 Q12 13.2 3.2 11.9 Z"/>' +
  '</g>' +
  '<path d="M3.4 9.4 Q12 10.7 20.6 9.4 M3.4 11.2 Q12 12.5 20.6 11.2" fill="none" stroke="#6e490c" stroke-width="0.3"/>' +
  '<path d="M5 10.3 Q12 11.6 19 10.3" fill="none" stroke="#fff3c4" stroke-width="0.25" stroke-dasharray="0.5 0.7" opacity="0.8"/>' +
  gem(12, 10.7, 1.15, 'url(#hg-garnet)', '#ff8a96') +
  gem(7.4, 10.4, 0.8, '#b88a2e', '#fff0b8') +
  gem(16.6, 10.4, 0.8, '#b88a2e', '#fff0b8') +
  gem(4.6, 10.1, 0.55, 'url(#hg-garnet)', '#ff8a96') +
  gem(19.4, 10.1, 0.55, 'url(#hg-garnet)', '#ff8a96') +
  gem(12, 2.2, 0.6, 'url(#hg-garnet)', '#ff8a96')

/** Rivets on the iron rim. */
const RIVETS = [
  [3.4, 3.4],
  [20.6, 3.4],
  [2.6, 14.2],
  [21.4, 14.2],
]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.7" fill="url(#hg-silver)" stroke="#0e0c0a" stroke-width="0.3"/>`)
  .join('')

let uid = 0
/** The inner markup of a shield (the field, its charges, rim and, for a royal seat, the crown). */
export function shieldMarkup(rank: ShieldRank, fill: string, charge: ShieldCharge = 'fleur'): string {
  // Each shield gets its own gradient and clip ids: a hidden label's defs must never be the ones another shield relies on.
  const id = `h${(uid = (uid + 1) % 1e9)}`
  return shieldMarkupRaw(rank, fill, charge).replace(/hg-[a-z]+/g, `$&-${id}`)
}
function shieldMarkupRaw(rank: ShieldRank, fill: string, charge: ShieldCharge): string {
  const body = rank === 'royal' ? (charge === 'thorn' ? THORN : charge === 'sun' ? SUN : charge === 'iron' ? IRON : FLEUR) : rank === 'lord' ? LORD_BODY : CASTLE_BODY
  const rim =
    rank === 'royal'
      ? // A double rim of antique gold.
        `<path d="${SHIELD_PATH}" fill="none" stroke="url(#hg-gold)" stroke-width="2.3" stroke-linejoin="round"/><path d="${INNER_PATH}" fill="none" stroke="#6e490c" stroke-width="0.45" opacity="0.8"/><path d="${SHIELD_PATH}" fill="none" stroke="#fff3c4" stroke-width="0.35" opacity="0.6" stroke-linejoin="round"/>`
      : rank === 'lord'
        ? `<path d="${SHIELD_PATH}" fill="none" stroke="url(#hg-silver)" stroke-width="2.1" stroke-linejoin="round"/>`
        : `<path d="${SHIELD_PATH}" fill="none" stroke="url(#hg-iron)" stroke-width="2.2" stroke-linejoin="round"/>${RIVETS}`
  const filigree = `<path d="${INNER_PATH}" fill="none" stroke="${rank === 'castle' ? '#d8dde2' : rank === 'lord' ? '#ffffff' : '#fff3c4'}" stroke-width="0.55" opacity="0.45"/>`
  const shield =
    `<g clip-path="url(#hg-clip)"><path d="${SHIELD_PATH}" fill="${fill}"/>${FIELD}<g filter="url(#hg-lift)">${body}</g>${filigree}</g>` +
    `<path d="${SHIELD_PATH}" fill="none" stroke="#000" stroke-opacity="0.6" stroke-width="3.6" stroke-linejoin="round"/>` +
    rim
  return rank === 'royal' ? `${DEFS}<g transform="translate(0 9)">${shield}</g>${CROWN}` : `${DEFS}${shield}`
}

/** A complete inline SVG shield, `size` pixels wide. */
export function shieldSvg(rank: ShieldRank, fill: string, size = 16, charge: ShieldCharge = 'fleur', cls = 'cl-shield'): string {
  const vh = rank === 'royal' ? 37 : 28
  return `<svg class="${cls}" width="${size}" height="${Math.round((size * vh) / 24)}" viewBox="-1 -1 26 ${vh + 2}" aria-hidden="true">${shieldMarkup(rank, fill, charge)}</svg>`
}

// --- On a canvas -----------------------------------------------------------------------------------

const paths = new Map<string, Path2D>()
const path2d = (d: string) => {
  let p = paths.get(d)
  if (!p) paths.set(d, (p = new Path2D(d)))
  return p
}
/** The charges' outlines for a canvas, simplified from the SVG. */
const CANVAS_CHARGE: Record<ShieldCharge, string[]> = {
  fleur: [
    'M12 4.4 C13.7 6.5 14.7 9.3 13.3 12.5 L12 14.4 L10.7 12.5 C9.3 9.3 10.3 6.5 12 4.4 Z',
    'M11 14 C9.7 11 6.1 9.5 4.8 11.6 C4 13.1 5.1 14.8 6.8 14.3 C6.2 13.2 6.9 12.2 7.9 12.6 C9.1 13.1 9.9 14.1 10.4 15.2 Z',
    'M13 14 C14.3 11 17.9 9.5 19.2 11.6 C20 13.1 18.9 14.8 17.2 14.3 C17.8 13.2 17.1 12.2 16.1 12.6 C14.9 13.1 14.1 14.1 13.6 15.2 Z',
    'M7.4 14.5 H16.6 L16.3 16.4 H7.7 Z',
    'M12 16.4 L13.3 19.8 L12 22 L10.7 19.8 Z',
  ],
  thorn: ['M10.9 10.4 H13.1 L12.95 21.2 L12 24 L11.05 21.2 Z', 'M5.8 8.6 Q12 9.8 18.2 8.6 L18.7 9.5 L17.6 10 Q12 10.9 6.4 10 L5.3 9.5 Z', 'M10.8 4.3 A1.2 1.2 0 1 0 13.2 4.3 A1.2 1.2 0 1 0 10.8 4.3 Z'],
  sun: ['M8 13.6 A4 4 0 1 0 16 13.6 A4 4 0 1 0 8 13.6 Z', 'M12 5 L13 9.6 L11 9.6 Z M12 22.2 L13 17.6 L11 17.6 Z M3.4 13.6 L8 12.6 L8 14.6 Z M20.6 13.6 L16 12.6 L16 14.6 Z'],
  iron: ['M8.4 16.2 V13.4 L9.6 14.6 L10.8 12.8 L12 14.4 L13.2 12.8 L14.4 14.6 L15.6 13.4 V16.2 Z', 'M8.2 16 H15.8 V17.6 H8.2 Z'],
}
const CANVAS_CROWN = 'M3.6 9 L4.4 5 L6.4 7.2 L7.8 3.6 L9.9 7 L12 2 L14.1 7 L16.2 3.6 L17.6 7.2 L19.6 5 L20.4 9 L20.8 12 Q12 13.2 3.2 12 Z'

/** Draw a shield on a canvas (minimaps, the war report): centred at x, y, `size` pixels wide. */
export function drawShield(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: string, rank: ShieldRank, charge: ShieldCharge = 'fleur') {
  const shield = path2d(SHIELD_PATH)
  const k = size / 24
  ctx.save()
  ctx.translate(x - 12 * k, y - 14 * k)
  ctx.scale(k, k)
  ctx.lineJoin = 'round'
  // The field, parted per pale, and what it bears, all inside the shield's outline.
  ctx.save()
  ctx.clip(shield)
  ctx.fillStyle = fill
  ctx.fill(shield)
  ctx.fillStyle = 'rgba(0,0,0,0.24)'
  ctx.fillRect(12, 0, 12, 28)
  if (rank === 'castle') {
    ctx.fillStyle = '#b4bac2'
    ctx.fill(path2d('M0 21.4 L12 10.6 L24 21.4 V26.4 L12 15.8 L0 26.4 Z'))
  } else if (rank === 'lord') {
    ctx.fillStyle = '#dde2e8'
    ctx.fill(path2d('M0 0 H24 V7.4 H21.6 V8.8 H19.2 V7.4 H16.8 V8.8 H14.4 V7.4 H12 V8.8 H9.6 V7.4 H7.2 V8.8 H4.8 V7.4 H2.4 V8.8 H0 Z'))
    ctx.fill(path2d('M5.4 22.6 V14.2 H8.6 V11.6 H15.4 V14.2 H18.6 V22.6 Z M8.6 11.6 V10 H10 V11.6 Z M11.3 11.6 V10 H12.7 V11.6 Z M14 11.6 V10 H15.4 V11.6 Z'))
    ctx.fillStyle = '#141210'
    ctx.fill(path2d('M10.5 22.6 V19.4 Q12 17.4 13.5 19.4 V22.6 Z'))
  } else {
    ctx.fillStyle = '#e0b04e'
    ctx.strokeStyle = '#4a2e06'
    ctx.lineWidth = 0.6
    for (const d of CANVAS_CHARGE[charge]) {
      ctx.fill(path2d(d))
      ctx.stroke(path2d(d))
    }
  }
  ctx.restore()
  // The rim: a dark ground, then the rank's metal.
  ctx.lineWidth = 4.2
  ctx.strokeStyle = 'rgba(0,0,0,0.78)'
  ctx.stroke(shield)
  ctx.lineWidth = 2.2
  ctx.strokeStyle = rank === 'royal' ? '#d8a642' : rank === 'lord' ? '#d6dbe2' : '#4a4540'
  ctx.stroke(shield)
  if (rank === 'royal') {
    // The crown, sitting on the shield's top edge.
    ctx.translate(0, -9)
    const crown = path2d(CANVAS_CROWN)
    ctx.fillStyle = '#e3b44e'
    ctx.fill(crown)
    ctx.lineWidth = 1
    ctx.strokeStyle = '#3e2804'
    ctx.stroke(crown)
    ctx.fillStyle = '#b02434'
    ctx.fill(path2d('M12 9.6 L13.1 10.7 L12 11.8 L10.9 10.7 Z'))
  }
  ctx.restore()
}
