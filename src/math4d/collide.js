// collide.js — collisioni, occlusione e contenimento in ℝ⁴.
//
// Due fatti che il gioco deve rendere tangibili:
//   §4.6 il bordo di un solido è fatto di celle 3D: occludere vuol dire togliere celle;
//   §4.10 "chiuso" non significa niente: un guscio 3D non racchiude nulla in ℝ⁴.
//         Solo un contenitore ipersferico tiene.

import { dot4, sub4, length4, add4, scale4 } from './wedge.js';

export function makeBox(center, half) {
  const min = new Float64Array(4);
  const max = new Float64Array(4);
  for (let i = 0; i < 4; i++) {
    min[i] = center[i] - half[i];
    max[i] = center[i] + half[i];
  }
  return { min, max };
}

export function pointInBox(box, p, pad = 0) {
  for (let i = 0; i < 4; i++) {
    if (p[i] < box.min[i] - pad || p[i] > box.max[i] + pad) return false;
  }
  return true;
}

export function boxesOverlap(a, b) {
  for (let i = 0; i < 4; i++) {
    if (a.max[i] < b.min[i] || b.max[i] < a.min[i]) return false;
  }
  return true;
}

/**
 * Segmento contro scatola, metodo delle fette (slab) esteso a quattro assi.
 * È qui che si vede tutto: se il segmento sta a un `w` diverso da quello della
 * scatola, la fetta in `w` non si sovrappone e il passaggio è libero.
 * Nessun caso speciale, nessun trucco: è la geometria a farlo.
 */
export function segmentHitsBox(box, from, to, radius = 0) {
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    const d = to[i] - from[i];
    const lo = box.min[i] - radius;
    const hi = box.max[i] + radius;
    if (Math.abs(d) < 1e-12) {
      if (from[i] < lo || from[i] > hi) return null;
      continue;
    }
    let a = (lo - from[i]) / d;
    let b = (hi - from[i]) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}

/** Movimento con arresto sul primo ostacolo, e scivolamento sugli altri assi. */
export function moveWithCollision(from, to, boxes, radius = 0.05) {
  let target = Float64Array.from(to);
  for (let axis = 0; axis < 4; axis++) {
    const trial = Float64Array.from(from);
    for (let i = 0; i <= axis; i++) trial[i] = target[i];
    let blocked = false;
    for (const box of boxes) {
      if (segmentHitsBox(box, from, trial, radius) !== null) {
        blocked = true;
        break;
      }
    }
    if (blocked) target[axis] = from[axis];
  }
  const finalPos = Float64Array.from(target);
  for (const box of boxes) {
    if (segmentHitsBox(box, from, finalPos, radius) !== null) return Float64Array.from(from);
  }
  return finalPos;
}

/**
 * Occlusione come rimozione di celle (SPEC §4.6):
 * scarta la cella se n · (camera − centro_cella) ≤ 0.
 */
export function cellVisible(cellNormal, cellCentroid, camera) {
  return dot4(cellNormal, sub4(camera, cellCentroid)) > 0;
}

export function pointInBall4(center, radius, p) {
  return length4(sub4(p, center)) <= radius;
}

/**
 * Un guscio sferico 3D (spesso `thickness` in w) non separa ℝ⁴: esiste sempre un
 * cammino continuo dall'interno all'esterno. Lo restituiamo, così il gioco può
 * mostrarlo invece di raccontarlo.
 */
export function escapePathFromShell3D(center, radius, thickness, start, steps = 48) {
  const path = [];
  const lift = thickness * 3 + radius * 0.5;
  const exit = add4(center, new Float64Array([radius * 2.2, 0, 0, 0]));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // sale in w, attraversa, ridiscende: la parete non è mai toccata.
    const w = Math.sin(Math.PI * t) * lift;
    const base = add4(scale4(start, 1 - t), scale4(exit, t));
    const p = Float64Array.from(base);
    p[3] = w;
    path.push(p);
  }
  return path;
}

/**
 * Le sei pareti di una cassa 3D sigillata, spesse `thickness` lungo w.
 * In tre dimensioni è chiusa. In quattro non chiude niente.
 */
export function sealedBox(center, half, thickness = 0.05, wall = 0.04) {
  const walls = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const s of [1, -1]) {
      const c = Float64Array.from(center);
      c[axis] += s * half[axis];
      const h = new Float64Array([half[0], half[1], half[2], thickness]);
      h[axis] = wall;
      walls.push(makeBox(c, h));
    }
  }
  return walls;
}

export function anyBoxHit(boxes, from, to, radius = 0) {
  return boxes.some((b) => segmentHitsBox(b, from, to, radius) !== null);
}

/** Un contenitore ipersferico invece tiene: la sua frontiera è una 3-sfera. */
export function hypersphereContains(center, radius, p) {
  return length4(sub4(p, center)) < radius;
}

/** Distanza minima fra due segmenti in ℝ⁴, per i controlli di auto-intersezione. */
export function segmentDistance(p1, p2, q1, q2) {
  const u = sub4(p2, p1);
  const v = sub4(q2, q1);
  const w0 = sub4(p1, q1);
  const a = dot4(u, u);
  const b = dot4(u, v);
  const c = dot4(v, v);
  const d = dot4(u, w0);
  const e = dot4(v, w0);
  const den = a * c - b * b;
  let s;
  let t;
  if (den < 1e-12) {
    s = 0;
    t = c > 1e-12 ? e / c : 0;
  } else {
    s = (b * e - c * d) / den;
    t = (a * e - b * d) / den;
  }
  s = Math.min(1, Math.max(0, s));
  t = Math.min(1, Math.max(0, t));
  const p = add4(p1, scale4(u, s));
  const q = add4(q1, scale4(v, t));
  return length4(sub4(p, q));
}

/** Distanza minima fra segmenti non adiacenti di una curva chiusa. */
export function selfClearance(curve) {
  const n = curve.length;
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const d = segmentDistance(curve[i], curve[(i + 1) % n], curve[j], curve[(j + 1) % n]);
      if (d < min) min = d;
    }
  }
  return min;
}

/**
 * Numero di allacciamento fra due curve chiuse (integrale di Gauss).
 * Le curve devono stare nella fetta w = 0: è l'unico posto dove la domanda
 * "sono concatenate?" ha senso.
 */
export function linkingNumber(curveA, curveB) {
  let sum = 0;
  const mid = (c, i) => [
    (c[i][0] + c[(i + 1) % c.length][0]) / 2,
    (c[i][1] + c[(i + 1) % c.length][1]) / 2,
    (c[i][2] + c[(i + 1) % c.length][2]) / 2,
  ];
  const seg = (c, i) => [
    c[(i + 1) % c.length][0] - c[i][0],
    c[(i + 1) % c.length][1] - c[i][1],
    c[(i + 1) % c.length][2] - c[i][2],
  ];
  for (let i = 0; i < curveA.length; i++) {
    const pa = mid(curveA, i);
    const da = seg(curveA, i);
    for (let j = 0; j < curveB.length; j++) {
      const pb = mid(curveB, j);
      const db = seg(curveB, j);
      const r = [pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]];
      const rn = Math.hypot(r[0], r[1], r[2]);
      if (rn < 1e-9) continue;
      const cross = [
        da[1] * db[2] - da[2] * db[1],
        da[2] * db[0] - da[0] * db[2],
        da[0] * db[1] - da[1] * db[0],
      ];
      sum += (r[0] * cross[0] + r[1] * cross[1] + r[2] * cross[2]) / (rn * rn * rn);
    }
  }
  return sum / (4 * Math.PI);
}
