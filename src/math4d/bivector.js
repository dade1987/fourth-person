// bivector.js — il momento angolare in 4D ha SEI componenti, non tre (SPEC §4.3).
//
// Un bivettore è una matrice antisimmetrica 4x4: 6 gradi di libertà, uno per piano.
// Ordine canonico usato in tutto il progetto:
//   0: xy   1: xz   2: xw   3: yz   4: yw   5: zw

import { IDX, identity, mul, transpose } from './rotor.js';

export const PLANES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
export const PLANE_NAMES = ['xy', 'xz', 'xw', 'yz', 'yw', 'zw'];
/** I tre piani che contengono w: sono quelli che ti fanno uscire dalla fetta. */
export const W_PLANES = [2, 4, 5];

export function zero() {
  return new Float64Array(6);
}

export function fromPlane(name, value) {
  const b = zero();
  const i = PLANE_NAMES.indexOf(name);
  if (i < 0) throw new Error(`piano sconosciuto: ${name}`);
  b[i] = value;
  return b;
}

export function planeIndex(name) {
  return PLANE_NAMES.indexOf(name);
}

/**
 * Matrice antisimmetrica associata. Il segno è scelto perché
 * expMatrix(toMatrix(θ · e_p)) === planeRotation(i, j, θ).
 */
export function toMatrix(b) {
  const m = new Float64Array(16);
  for (let p = 0; p < 6; p++) {
    const [i, j] = PLANES[p];
    m[IDX(i, j)] = -b[p];
    m[IDX(j, i)] = b[p];
  }
  return m;
}

export function fromMatrix(m) {
  const b = zero();
  for (let p = 0; p < 6; p++) {
    const [i, j] = PLANES[p];
    b[p] = 0.5 * (m[IDX(j, i)] - m[IDX(i, j)]);
  }
  return b;
}

export function add(a, b) {
  const out = zero();
  for (let i = 0; i < 6; i++) out[i] = a[i] + b[i];
  return out;
}

export function scale(a, k) {
  const out = zero();
  for (let i = 0; i < 6; i++) out[i] = a[i] * k;
  return out;
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < 6; i++) s += a[i] * b[i];
  return s;
}

export function norm(a) {
  return Math.sqrt(dot(a, a));
}

/** Coppia di piani completamente ortogonali: (xy, zw), (xz, yw), (xw, yz). */
export const ORTHOGONAL_PAIRS = [[0, 5], [1, 4], [2, 3]];

export function orthogonalComplementPlane(p) {
  for (const [a, b] of ORTHOGONAL_PAIRS) {
    if (a === p) return b;
    if (b === p) return a;
  }
  throw new Error(`piano fuori intervallo: ${p}`);
}

/** Trasporta un bivettore dal corpo al mondo: R B Rᵀ. */
export function rotateBivector(R, b) {
  return fromMatrix(mul(mul(R, toMatrix(b)), transpose(R)));
}

/** Commutatore [A, B] = AB − BA, il cuore delle equazioni di Eulero in 4D. */
export function commutator(A, B) {
  const ab = mul(A, B);
  const ba = mul(B, A);
  const out = new Float64Array(16);
  for (let i = 0; i < 16; i++) out[i] = ab[i] - ba[i];
  return out;
}

export { identity };
