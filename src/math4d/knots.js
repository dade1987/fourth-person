// knots.js — in ℝ⁴ i nodi si sciolgono (SPEC §4.9).
//
// Una curva chiusa non può restare annodata in quattro dimensioni, e due cerchi
// concatenati si separano. Non è una metafora: qui c'è il cammino esplicito, e i
// test verificano che lungo tutto il cammino la curva non si attraversa mai.
//
// Il diagramma serve anche a dimostrare che alla fine il nodo se n'è andato:
// la tricolorabilità è un invariante, e il trifoglio è tricolorabile mentre il
// nodo banale no. Un diagramma a tre incroci può essere solo il trifoglio o il
// nodo banale; se non è tricolorabile, è il nodo banale.

import { selfClearance } from './collide.js';

/** Trifoglio standard, immerso nella fetta w = 0. */
export function trefoil(s) {
  return new Float64Array([
    Math.sin(s) + 2 * Math.sin(2 * s),
    Math.cos(s) - 2 * Math.cos(2 * s),
    -Math.sin(3 * s),
    0,
  ]);
}

export function sampleClosed(fn, n = 240) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(fn((2 * Math.PI * i) / n));
  return out;
}

function smoothBump(u, halfWidth) {
  const a = Math.abs(u);
  if (a >= halfWidth) return 0;
  return Math.cos((Math.PI * a) / (2 * halfWidth)) ** 2;
}

function wrapDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Incroci del diagramma: coppie di segmenti non adiacenti che si tagliano nella
 * proiezione su xy. `over` è il parametro del filo che passa sopra (z maggiore).
 */
export function crossings(curve) {
  const n = curve.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a0 = curve[i];
    const a1 = curve[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const b0 = curve[j];
      const b1 = curve[(j + 1) % n];
      const r = [a1[0] - a0[0], a1[1] - a0[1]];
      const s = [b1[0] - b0[0], b1[1] - b0[1]];
      const den = r[0] * s[1] - r[1] * s[0];
      if (Math.abs(den) < 1e-12) continue;
      const q = [b0[0] - a0[0], b0[1] - a0[1]];
      const t = (q[0] * s[1] - q[1] * s[0]) / den;
      const u = (q[0] * r[1] - q[1] * r[0]) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const za = a0[2] + (a1[2] - a0[2]) * t;
      const zb = b0[2] + (b1[2] - b0[2]) * u;
      const pa = i + t;
      const pb = j + u;
      const aOver = za > zb;
      out.push({
        over: aOver ? pa : pb,
        under: aOver ? pb : pa,
        // Segno dell'incrocio: orientazione della coppia (sopra, sotto).
        sign: Math.sign(aOver ? r[0] * s[1] - r[1] * s[0] : s[0] * r[1] - s[1] * r[0]),
        gap: Math.abs(za - zb),
      });
    }
  }
  return out;
}

/**
 * Numero di 3-colorazioni del diagramma. > 3 significa nodo non banale.
 * Gli archi sono i tratti fra due sottopassaggi consecutivi.
 */
export function tricolorings(curve) {
  const cr = crossings(curve);
  if (cr.length === 0) return 3;
  const unders = cr.map((c) => c.under).sort((a, b) => a - b);
  const arcOf = (p) => {
    let k = 0;
    while (k < unders.length && unders[k] <= p) k++;
    return k % unders.length; // l'arco che inizia al k-esimo sottopassaggio
  };
  const A = unders.length;
  const equations = cr.map((c) => {
    const idx = unders.indexOf(c.under);
    const inArc = idx; // arco che finisce qui
    const outArc = (idx + 1) % A;
    return [arcOf(c.over), inArc, outArc];
  });
  let count = 0;
  const colors = new Array(A).fill(0);
  const total = 3 ** A;
  for (let m = 0; m < total; m++) {
    let x = m;
    for (let i = 0; i < A; i++) {
      colors[i] = x % 3;
      x = (x - colors[i]) / 3;
    }
    let ok = true;
    for (const [o, a, b] of equations) {
      if ((2 * colors[o] - colors[a] - colors[b]) % 3 !== 0) {
        ok = false;
        break;
      }
    }
    if (ok) count++;
  }
  return count;
}

/**
 * Il cammino che scioglie il trifoglio, in tre atti:
 *   1. un arco si solleva in `w` — mentre è sollevato non può toccare nulla;
 *   2. sollevato, scivola sotto l'altro filo;
 *   3. riscende in `w`, e l'incrocio è cambiato.
 * Cambiare un incrocio al trifoglio dà il nodo banale.
 */
export function unknottingPath(t, samples = 240) {
  const base = sampleClosed(trefoil, samples);
  const cr = crossings(base).sort((a, b) => a.over - b.over);
  const c = cr[0];
  const sOver = (2 * Math.PI * c.over) / samples;
  const sUnder = (2 * Math.PI * c.under) / samples;
  const zOver = trefoil(sOver)[2];
  const zUnder = trefoil(sUnder)[2];
  const halfWidth = 0.55;
  const drop = -(zOver - zUnder) - 0.9; // abbastanza da passare sotto, con margine
  const lift = 2.2;

  const phase1 = Math.min(1, Math.max(0, t * 3));
  const phase2 = Math.min(1, Math.max(0, t * 3 - 1));
  const phase3 = Math.min(1, Math.max(0, t * 3 - 2));

  const out = [];
  for (let i = 0; i < samples; i++) {
    const s = (2 * Math.PI * i) / samples;
    const b = smoothBump(wrapDelta(s, sOver), halfWidth);
    const p = trefoil(s);
    p[2] += drop * b * phase2;
    p[3] = lift * b * (phase1 - phase3);
    out.push(p);
  }
  return out;
}

export function isEmbedded(curve, tol = 1e-3) {
  return selfClearance(curve) > tol;
}

// ------------------------------------------------ due anelli concatenati ---

export function hopfRings(radius = 1.6, gap = 0) {
  const ringA = (s) => new Float64Array([radius * Math.cos(s), radius * Math.sin(s), 0, 0]);
  const ringB = (s) => new Float64Array([radius + radius * Math.cos(s), 0, radius * Math.sin(s), gap]);
  return { ringA, ringB };
}

/**
 * Separazione dei due anelli: sollevare in `w`, scostare, riappoggiare.
 * Durante il sollevamento gli anelli stanno a `w` diversi e non possono toccarsi.
 */
export function unlinkPath(t, samples = 200, radius = 1.6) {
  const { ringA, ringB } = hopfRings(radius);
  const a = sampleClosed(ringA, samples);
  const phase1 = Math.min(1, Math.max(0, t * 3));
  const phase2 = Math.min(1, Math.max(0, t * 3 - 1));
  const phase3 = Math.min(1, Math.max(0, t * 3 - 2));
  const lift = 2.5 * (phase1 - phase3);
  const slide = 6 * radius * phase2;
  const b = sampleClosed(ringB).map((p) => {
    const q = Float64Array.from(p);
    q[0] += slide;
    q[3] += lift;
    return q;
  });
  return { a, b };
}
