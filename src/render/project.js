// project.js — Stadio 1: dal mondo 4D alla retina 3D (SPEC §3.1).
//
//   p = Rᵀ (v − C)
//   q = ( f·p.x/p.w , f·p.y/p.w , f·p.z/p.w )
//
// Il risultato è un VOLUME tridimensionale: la retina di un'entità 4D è solida,
// come la nostra è una superficie. Poi lo Stadio 2 lo schiaccia sullo schermo, e
// quella è la perdita inevitabile — dichiarata nell'interfaccia, mai nascosta.

import { identity, mul, planeRotation, transpose, applyT, orthonormalize } from '../math4d/rotor.js';
import { PLANES, PLANE_NAMES } from '../math4d/bivector.js';

/**
 * Distanza in w fra la camera 4D e la fetta abitata: è il "fuoco" della proiezione,
 * e decide quanto la quarta dimensione si vede. A 3,2 la cella lontana era al 73%
 * di quella vicina e il tesseratto sembrava una scatola foderata; a 2,5 sta poco
 * sopra la metà, ed è il rapporto delle immagini classiche.
 */
export const W_DISTANCE = 2.5;
export const NEAR_W = 0.35;

export function makeCamera4() {
  return {
    // Posizione nel mondo. La camera sta indietro di W_DISTANCE lungo w rispetto
    // alla fetta del giocatore, altrimenti dividere per p.w non avrebbe senso.
    position: new Float64Array([0, 0, 0, -W_DISTANCE]),
    orientation: identity(),
    focal: W_DISTANCE,
    /** Dove si trova il giocatore lungo w. La camera lo segue. */
    playerW: 0,
  };
}

export function setPlayerW(cam, w) {
  cam.playerW = w;
  cam.position[3] = w - W_DISTANCE;
}

/** Ruota la camera 4D nel piano indicato. In 4D si ruota in un piano, non attorno a un asse. */
export function rotateCamera(cam, planeIndex, angle) {
  const [i, j] = PLANES[planeIndex];
  cam.orientation = orthonormalize(mul(cam.orientation, planeRotation(i, j, angle)));
}

/** Angoli letti dalla matrice, uno per piano: è quello che mostra la bussola. */
export function cameraPlaneAngles(cam) {
  const R = cam.orientation;
  return PLANES.map(([i, j]) => Math.atan2(R[j * 4 + i], R[i * 4 + i]));
}

export { PLANE_NAMES };

/** p = Rᵀ (v − C) */
export function toCameraSpace(cam, v) {
  const d = new Float64Array([
    v[0] - cam.position[0],
    v[1] - cam.position[1],
    v[2] - cam.position[2],
    v[3] - cam.position[3],
  ]);
  return applyT(cam.orientation, d);
}

/** q = f · p.xyz / p.w, con clipping vicino su p.w */
export function projectTo3D(cam, v) {
  const p = toCameraSpace(cam, v);
  const w = Math.max(p[3], NEAR_W);
  return {
    q: [(cam.focal * p[0]) / w, (cam.focal * p[1]) / w, (cam.focal * p[2]) / w],
    w: p[3],
    clipped: p[3] < NEAR_W,
  };
}

/** La trasposta, pronta da mandare allo shader. */
export function cameraMatrixT(cam) {
  return transpose(cam.orientation);
}

/**
 * Trasformazione 4D di un oggetto: rotazione più posizione.
 * Sono dieci gradi di libertà, e ci sono tutti (SPEC §4.4).
 */
export function makeTransform4() {
  return { rotation: identity(), position: new Float64Array(4) };
}

export function transformPoint(tr, v) {
  const out = new Float64Array(4);
  for (let r = 0; r < 4; r++) {
    out[r] =
      tr.rotation[r * 4 + 0] * v[0] +
      tr.rotation[r * 4 + 1] * v[1] +
      tr.rotation[r * 4 + 2] * v[2] +
      tr.rotation[r * 4 + 3] * v[3] +
      tr.position[r];
  }
  return out;
}

export function rotateTransform(tr, planeIndex, angle) {
  const [i, j] = PLANES[planeIndex];
  tr.rotation = orthonormalize(mul(tr.rotation, planeRotation(i, j, angle)));
}

/** Float32Array riga per riga: lo shader lo riceve con transpose = true. */
export function toFloat32(m) {
  const out = new Float32Array(16);
  for (let i = 0; i < 16; i++) out[i] = m[i];
  return out;
}
