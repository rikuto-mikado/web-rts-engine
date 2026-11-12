/**
 * The realm's heraldry. Every castle is marked by a shield in its lord's
 * colours, and its rank shows in the shield itself:
 *
 * - royal: the court of one of the two crowned heads who came to this land
 *   (the King: a fleur-de-lis; the Usurper Queen: a thorned sword), a
 *   gilt rim and a jewelled crown above.
 * - lord: the seat of a local lord, a silver rim, a silver chief and a tower.
 * - castle: any other castle, an iron rim and a pale fess.
 *
 * Used as inline SVG (map labels, UI) and drawn on canvases (minimaps).
 */
export type ShieldRank = 'royal' | 'lord' | 'castle'
export type ShieldCharge = 'fleur' | 'thorn'

/** A heater shield, slightly waisted at the top, in a 24 x 28 box. */
export const SHIELD_PATH = 'M2 3.2 Q7 1.4 12 2.6 Q17 1.4 22 3.2 V12.6 C22 19.6 17.2 24.4 12 27.2 C6.8 24.4 2 19.6 2 12.6 Z'

const CROWN =
  '<path d="M3.6 9.2 L4.6 3.4 L8 6.4 L12 1 L16 6.4 L19.4 3.4 L20.4 9.2 Z" fill="url(#hg-gold)" stroke="#4a3006" stroke-width="0.7" stroke-linejoin="round"/>' +
  '<rect x="3.4" y="8.4" width="17.2" height="2.2" rx="0.6" fill="url(#hg-gold)" stroke="#4a3006" stroke-width="0.6"/>' +
  '<circle cx="12" cy="9.5" r="0.9" fill="#c2253a"/><circle cx="7.4" cy="9.5" r="0.7" fill="#2a6fd0"/><circle cx="16.6" cy="9.5" r="0.7" fill="#2a8a52"/>' +
  '<circle cx="4.6" cy="3.2" r="0.8" fill="#fff1c2"/><circle cx="12" cy="0.9" r="0.9" fill="#fff1c2"/><circle cx="19.4" cy="3.2" r="0.8" fill="#fff1c2"/>'

const FLEUR =
  '<g fill="url(#hg-gold)" stroke="#5a3a08" stroke-width="0.45" stroke-linejoin="round">' +
  '<path d="M12 5.6 C13.8 8.2 14.4 10.6 12 13.6 C9.6 10.6 10.2 8.2 12 5.6 Z"/>' +
  '<path d="M11.3 13.4 C9.3 10.4 6 10.6 5.8 13 C5.7 14.5 7.1 15.3 8.4 14.7 C7.9 16.2 9.4 16.6 11.3 14.9 Z"/>' +
  '<path d="M12.7 13.4 C14.7 10.4 18 10.6 18.2 13 C18.3 14.5 16.9 15.3 15.6 14.7 C16.1 16.2 14.6 16.6 12.7 14.9 Z"/>' +
  '<rect x="8.4" y="13.7" width="7.2" height="1.7" rx="0.5"/>' +
  '<path d="M12 15.2 L13.4 20 L12 21.6 L10.6 20 Z"/></g>'

const THORN =
  '<g stroke="#2a0a0e" stroke-width="0.45" stroke-linejoin="round">' +
  '<path d="M11.3 7.6 H12.7 V18.6 L12 21.4 L11.3 18.6 Z" fill="url(#hg-silver)"/>' +
  '<rect x="8" y="8.6" width="8" height="1.5" rx="0.6" fill="url(#hg-gold)"/>' +
  '<circle cx="12" cy="6.6" r="1.15" fill="url(#hg-gold)"/>' +
  '<path d="M12.7 12 C15.8 11 16.4 13.6 14.2 14.2 C12.6 14.6 11.2 15.8 12.7 17.4" fill="none" stroke="#1a0608" stroke-width="0.9"/>' +
  '<path d="M15.6 11.4 l1.3 -0.9 l-0.3 1.4 Z M14.6 14.4 l1.2 0.7 l-1.4 0.2 Z M11.4 15.9 l-1.3 0.4 l0.8 -1.1 Z" fill="#1a0608"/></g>'

const TOWER =
  '<g fill="url(#hg-silver)" stroke="#20242a" stroke-width="0.45" stroke-linejoin="round">' +
  '<path d="M8.2 21.6 V12.6 H9.7 V10.8 H11.1 V12.6 H12.9 V10.8 H14.3 V12.6 H15.8 V21.6 Z"/></g>' +
  '<path d="M10.9 21.6 V18.6 Q12 17.2 13.1 18.6 V21.6 Z" fill="#1a1612"/><rect x="11.5" y="14.2" width="1" height="1.9" fill="#1a1612"/>'

const DEFS =
  '<defs>' +
  '<linearGradient id="hg-gold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff0be"/><stop offset="0.45" stop-color="#e3b85a"/><stop offset="1" stop-color="#9a6a18"/></linearGradient>' +
  '<linearGradient id="hg-silver" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#c9ced6"/><stop offset="1" stop-color="#7d838d"/></linearGradient>' +
  '<linearGradient id="hg-iron" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#6a6560"/><stop offset="1" stop-color="#1e1a16"/></linearGradient>' +
  '<radialGradient id="hg-sheen" cx="0.32" cy="0.22" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="0.38"/><stop offset="0.45" stop-color="#fff" stop-opacity="0.06"/><stop offset="1" stop-color="#000" stop-opacity="0.38"/></radialGradient>' +
  '</defs>'

let uid = 0
/** The inner markup of a shield (the field, its charge, sheen, rim and, for a royal seat, the crown). */
export function shieldMarkup(rank: ShieldRank, fill: string, charge: ShieldCharge = 'fleur'): string {
  // Each shield gets its own gradient ids: a hidden label's defs must never be the ones another shield relies on.
  const id = `h${(uid = (uid + 1) % 1e9)}`
  return shieldMarkupRaw(rank, fill, charge).replace(/hg-(gold|silver|iron|sheen)/g, `$&-${id}`)
}
function shieldMarkupRaw(rank: ShieldRank, fill: string, charge: ShieldCharge): string {
  const rim = rank === 'royal' ? 'url(#hg-gold)' : rank === 'lord' ? 'url(#hg-silver)' : 'url(#hg-iron)'
  const body =
    rank === 'royal'
      ? (charge === 'thorn' ? THORN : FLEUR)
      : rank === 'lord'
        ? `<path d="M2.6 3.6 Q7 2 12 3.1 Q17 2 21.4 3.6 V8.2 H2.6 Z" fill="url(#hg-silver)" opacity="0.92"/>${TOWER}`
        : '<path d="M2.4 11 H21.6 V15.4 H2.4 Z" fill="#fff" opacity="0.3"/><path d="M2.4 11 H21.6 M2.4 15.4 H21.6" stroke="#000" stroke-opacity="0.35" stroke-width="0.5"/>'
  const shield =
    `<path d="${SHIELD_PATH}" fill="${fill}"/>` +
    body +
    `<path d="${SHIELD_PATH}" fill="url(#hg-sheen)"/>` +
    `<path d="${SHIELD_PATH}" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="3.6" stroke-linejoin="round"/>` +
    `<path d="${SHIELD_PATH}" fill="none" stroke="${rim}" stroke-width="2.1" stroke-linejoin="round"/>` +
    (rank !== 'castle' ? '<circle cx="4" cy="4.6" r="0.55" fill="#fff" opacity="0.7"/><circle cx="20" cy="4.6" r="0.55" fill="#fff" opacity="0.7"/>' : '')
  return rank === 'royal' ? `${DEFS}${CROWN}<g transform="translate(0 9)">${shield}</g>` : `${DEFS}${shield}`
}

/** A complete inline SVG shield, `size` pixels wide. */
export function shieldSvg(rank: ShieldRank, fill: string, size = 16, charge: ShieldCharge = 'fleur', cls = 'cl-shield'): string {
  const vh = rank === 'royal' ? 37 : 28
  return `<svg class="${cls}" width="${size}" height="${Math.round((size * vh) / 24)}" viewBox="-1 -1 26 ${vh + 2}" aria-hidden="true">${shieldMarkup(rank, fill, charge)}</svg>`
}

let shieldPath: Path2D | null = null
/** Draw a small shield on a canvas (minimaps): centred at x, y, `size` pixels wide. */
export function drawShield(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: string, rank: ShieldRank) {
  shieldPath ??= new Path2D(SHIELD_PATH)
  const k = size / 24
  ctx.save()
  ctx.translate(x - 12 * k, y - 14 * k)
  ctx.scale(k, k)
  ctx.fillStyle = fill
  ctx.fill(shieldPath)
  ctx.lineJoin = 'round'
  ctx.lineWidth = 4.2
  ctx.strokeStyle = 'rgba(0,0,0,0.75)'
  ctx.stroke(shieldPath)
  ctx.lineWidth = 2.2
  ctx.strokeStyle = rank === 'royal' ? '#e8c066' : rank === 'lord' ? '#d6dbe2' : '#2a241e'
  ctx.stroke(shieldPath)
  if (rank === 'royal') {
    ctx.fillStyle = '#f2c75a'
    ctx.beginPath()
    ctx.moveTo(4, 0)
    ctx.lineTo(6, -6)
    ctx.lineTo(9, -2.5)
    ctx.lineTo(12, -8)
    ctx.lineTo(15, -2.5)
    ctx.lineTo(18, -6)
    ctx.lineTo(20, 0)
    ctx.closePath()
    ctx.fill()
    ctx.lineWidth = 1.2
    ctx.strokeStyle = '#3a2608'
    ctx.stroke()
  } else if (rank === 'lord') {
    ctx.fillStyle = 'rgba(240,240,245,0.9)'
    ctx.fillRect(8.5, 10, 7, 11)
  }
  ctx.restore()
}
