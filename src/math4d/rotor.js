// rotor.js — rotazioni in SO(4).
//
// Regola del progetto (SPEC §4.1): in quattro dimensioni NON esiste un asse di
// rotazione. Si ruota in un PIANO. SO(4) ha dimensione 6: xy, xz, xw, yz, yw, zw.
//
// Convenzione: matrici 4x4 in Float64Array(16), ordine per righe.
//   m[r*4 + c] = elemento riga r, colonna c
//   (M v)_i = Σ_j m[i*4+j] · v_j
// Le colonne sono le immagini dei vettori base.
//
// Nessuna dipendenza dal rendering. Deve girare in Node senza browser.

export const IDX = (r, c) => r * 4 + c;

export function identity() {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function clone(m) {
  return Float64Array.from(m);
}

/**
 * Rotazione di `theta` nel piano (i, j).
 * Identità ovunque tranne:
 *   M[i][i] = M[j][j] = cos θ,  M[i][j] = −sin θ,  M[j][i] = +sin θ
 */
export function planeRotation(i, j, theta) {
  if (i === j) throw new Error('un piano ha bisogno di due assi distinti');
  const m = identity();
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  m[IDX(i, i)] = c;
  m[IDX(j, j)] = c;
  m[IDX(i, j)] = -s;
  m[IDX(j, i)] = s;
  return m;
}

export function mul(a, b) {
  const out = new Float64Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[IDX(r, k)] * b[IDX(k, c)];
      out[IDX(r, c)] = s;
    }
  }
  return out;
}

export function mulAll(...ms) {
  return ms.reduce((a, b) => mul(a, b), identity());
}

export function transpose(m) {
  const out = new Float64Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[IDX(r, c)] = m[IDX(c, r)];
  return out;
}

export function apply(m, v) {
  const out = new Float64Array(4);
  for (let r = 0; r < 4; r++) {
    out[r] = m[IDX(r, 0)] * v[0] + m[IDX(r, 1)] * v[1] + m[IDX(r, 2)] * v[2] + m[IDX(r, 3)] * v[3];
  }
  return out;
}

/** Applica la trasposta: per una rotazione è l'inversa. */
export function applyT(m, v) {
  const out = new Float64Array(4);
  for (let c = 0; c < 4; c++) {
    out[c] = m[IDX(0, c)] * v[0] + m[IDX(1, c)] * v[1] + m[IDX(2, c)] * v[2] + m[IDX(3, c)] * v[3];
  }
  return out;
}

export function det(m) {
  const M = (r, c) => m[IDX(r, c)];
  // Espansione di Laplace sulla prima riga con minori 3x3.
  const minor = (r0, r1, r2, c0, c1, c2) =>
    M(r0, c0) * (M(r1, c1) * M(r2, c2) - M(r1, c2) * M(r2, c1)) -
    M(r0, c1) * (M(r1, c0) * M(r2, c2) - M(r1, c2) * M(r2, c0)) +
    M(r0, c2) * (M(r1, c0) * M(r2, c1) - M(r1, c1) * M(r2, c0));
  return (
    M(0, 0) * minor(1, 2, 3, 1, 2, 3) -
    M(0, 1) * minor(1, 2, 3, 0, 2, 3) +
    M(0, 2) * minor(1, 2, 3, 0, 1, 3) -
    M(0, 3) * minor(1, 2, 3, 0, 1, 2)
  );
}

/** Errore di ortonormalità: max |(MᵀM − I)_ij|. */
export function orthonormalityError(m) {
  let worst = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += m[IDX(k, i)] * m[IDX(k, j)];
      worst = Math.max(worst, Math.abs(s - (i === j ? 1 : 0)));
    }
  }
  return worst;
}

/** Gram-Schmidt sulle colonne: ripara la deriva numerica dell'integrazione. */
export function orthonormalize(m) {
  const col = (k) => [m[IDX(0, k)], m[IDX(1, k)], m[IDX(2, k)], m[IDX(3, k)]];
  const cols = [col(0), col(1), col(2), col(3)];
  for (let k = 0; k < 4; k++) {
    for (let p = 0; p < k; p++) {
      let d = 0;
      for (let i = 0; i < 4; i++) d += cols[k][i] * cols[p][i];
      for (let i = 0; i < 4; i++) cols[k][i] -= d * cols[p][i];
    }
    let n = Math.hypot(...cols[k]);
    if (n < 1e-12) n = 1;
    for (let i = 0; i < 4; i++) cols[k][i] /= n;
  }
  const out = new Float64Array(16);
  for (let k = 0; k < 4; k++) for (let i = 0; i < 4; i++) out[IDX(i, k)] = cols[k][i];
  return out;
}

/**
 * Rotazione doppia: due piani completamente ortogonali ruotano insieme,
 * con angoli indipendenti (SPEC §4.2). Se |alpha| = |beta| è isoclina.
 */
export function doubleRotation(alpha, beta, planeA = [0, 1], planeB = [2, 3]) {
  return mul(planeRotation(planeA[0], planeA[1], alpha), planeRotation(planeB[0], planeB[1], beta));
}

export function isIsoclinic(alpha, beta, eps = 1e-12) {
  return Math.abs(Math.abs(alpha) - Math.abs(beta)) < eps && Math.abs(alpha) > eps;
}

/**
 * Punti fissi: soluzioni di (M − I)v = 0 diverse dall'origine.
 * Restituisce la dimensione del nucleo, calcolata per eliminazione di Gauss.
 */
export function fixedPointDimension(m, eps = 1e-9) {
  const a = [];
  for (let r = 0; r < 4; r++) {
    a.push([m[IDX(r, 0)], m[IDX(r, 1)], m[IDX(r, 2)], m[IDX(r, 3)]]);
    a[r][r] -= 1;
  }
  let rank = 0;
  for (let c = 0; c < 4 && rank < 4; c++) {
    let piv = -1;
    let best = eps;
    for (let r = rank; r < 4; r++) if (Math.abs(a[r][c]) > best) { best = Math.abs(a[r][c]); piv = r; }
    if (piv < 0) continue;
    [a[rank], a[piv]] = [a[piv], a[rank]];
    for (let r = 0; r < 4; r++) {
      if (r === rank) continue;
      const f = a[r][c] / a[rank][c];
      for (let k = 0; k < 4; k++) a[r][k] -= f * a[rank][k];
    }
    rank++;
  }
  return 4 - rank;
}

/** Esponenziale di matrice antisimmetrica, per scalatura e quadratura. */
export function expMatrix(A) {
  let norm = 0;
  for (let i = 0; i < 16; i++) norm = Math.max(norm, Math.abs(A[i]));
  const k = Math.max(0, Math.ceil(Math.log2(Math.max(norm, 1e-12) / 0.05)));
  const scale = Math.pow(2, -k);
  const S = new Float64Array(16);
  for (let i = 0; i < 16; i++) S[i] = A[i] * scale;

  let term = identity();
  let sum = identity();
  for (let n = 1; n <= 12; n++) {
    term = mul(term, S);
    for (let i = 0; i < 16; i++) term[i] /= n;
    for (let i = 0; i < 16; i++) sum[i] += term[i];
  }
  for (let i = 0; i < k; i++) sum = mul(sum, sum);
  return orthonormalize(sum);
}

/** Generatore pseudocasuale deterministico: i test devono essere ripetibili. */
export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Rotazione casuale in SO(4): QR di una matrice gaussiana, det riportato a +1. */
export function randomRotation(rng = Math.random) {
  const gauss = () => {
    const u = Math.max(rng(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  };
  const m = new Float64Array(16);
  for (let i = 0; i < 16; i++) m[i] = gauss();
  const q = orthonormalize(m);
  if (det(q) < 0) for (let r = 0; r < 4; r++) q[IDX(r, 3)] *= -1;
  return q;
}

/**
 * Rotazione casuale che tiene ferma la direzione w: è tutto — proprio tutto —
 * ciò che può fare un abitante tridimensionale. Serve a provare che la chiralità
 * non si ripara dall'interno della fetta.
 */
export function randomSliceRotation(rng = Math.random) {
  const gauss = () => {
    const u = Math.max(rng(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  };
  const cols = [0, 1, 2].map(() => [gauss(), gauss(), gauss()]);
  for (let k = 0; k < 3; k++) {
    for (let p = 0; p < k; p++) {
      const d = cols[k][0] * cols[p][0] + cols[k][1] * cols[p][1] + cols[k][2] * cols[p][2];
      for (let i = 0; i < 3; i++) cols[k][i] -= d * cols[p][i];
    }
    let n = Math.hypot(...cols[k]) || 1;
    for (let i = 0; i < 3; i++) cols[k][i] /= n;
  }
  const d =
    cols[0][0] * (cols[1][1] * cols[2][2] - cols[1][2] * cols[2][1]) -
    cols[1][0] * (cols[0][1] * cols[2][2] - cols[0][2] * cols[2][1]) +
    cols[2][0] * (cols[0][1] * cols[1][2] - cols[0][2] * cols[1][1]);
  if (d < 0) for (let i = 0; i < 3; i++) cols[2][i] *= -1;
  const m = identity();
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[IDX(r, c)] = cols[c][r];
  return m;
}
