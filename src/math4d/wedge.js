// wedge.js — niente prodotto vettoriale (SPEC §4.5).
//
// Il prodotto vettoriale esiste solo in 3 e in 7 dimensioni. In ℝ⁴ la normale a
// un iperpiano si ottiene da TRE vettori:  n = ⋆(a ∧ b ∧ c)
// componente i = (−1)^i · det del minore 3x3 ottenuto togliendo la colonna i.

export function wedge3(a, b, c) {
  const rows = [a, b, c];
  const out = new Float64Array(4);
  for (let i = 0; i < 4; i++) {
    const cols = [0, 1, 2, 3].filter((k) => k !== i);
    const m = rows.map((r) => cols.map((k) => r[k]));
    const d =
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    out[i] = (i % 2 === 0 ? 1 : -1) * d;
  }
  return out;
}

export function sub4(a, b) {
  return new Float64Array([a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]]);
}

export function add4(a, b) {
  return new Float64Array([a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]]);
}

export function scale4(a, k) {
  return new Float64Array([a[0] * k, a[1] * k, a[2] * k, a[3] * k]);
}

export function dot4(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

export function length4(a) {
  return Math.sqrt(dot4(a, a));
}

export function normalize4(a) {
  const n = length4(a) || 1;
  return scale4(a, 1 / n);
}

export function lerp4(a, b, t) {
  return new Float64Array([
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ]);
}

export function dist4(a, b) {
  return length4(sub4(a, b));
}

/** Normale unitaria all'iperpiano per quattro punti. */
export function hyperplaneNormal(p0, p1, p2, p3) {
  return normalize4(wedge3(sub4(p1, p0), sub4(p2, p0), sub4(p3, p0)));
}

/**
 * Volume 3D con segno del simplesso teso da tre vettori dentro un iperpiano,
 * misurato lungo la normale: serve per l'orientamento e la chiralità.
 */
export function signedVolume(a, b, c, n) {
  return dot4(wedge3(a, b, c), n);
}
