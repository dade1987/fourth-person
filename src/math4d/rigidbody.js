// rigidbody.js — dinamica del corpo rigido in quattro dimensioni.
//
// Il momento angolare è un BIVETTORE: sei componenti, non tre (SPEC §4.3).
// Il tensore d'inerzia generalizzato è una mappa lineare sui bivettori; qui è
// diagonale nella base dei piani, che basta per corpi con simmetria abbastanza alta.
//
// Equazioni del moto (ten Bosch, N-Dimensional Rigid Body Dynamics, 2020):
//   Ω = I⁻¹ L              (velocità angolare, bivettore)
//   dL/dt = [L, Ω]         (Eulero, nel sistema del corpo)
//   dR/dt = R Ω            (trasporto dell'orientamento)
// Da cui il momento angolare nel mondo, R L Rᵀ, è conservato esattamente.
//
// Gradi di libertà di SE(4): 4 di traslazione + 6 di rotazione = 10 (SPEC §4.4).

import { identity, mul, transpose, expMatrix, orthonormalize } from './rotor.js';
import * as bv from './bivector.js';

export const DOF_TRANSLATION = 4;
export const DOF_ROTATION = 6;
export const DOF_TOTAL = DOF_TRANSLATION + DOF_ROTATION;

export function makeBody({
  position = new Float64Array(4),
  velocity = new Float64Array(4),
  orientation = identity(),
  inertia = new Float64Array([1, 1, 1, 1, 1, 1]),
  angularMomentum = bv.zero(),
  mass = 1,
} = {}) {
  return {
    position: Float64Array.from(position),
    velocity: Float64Array.from(velocity),
    orientation: Float64Array.from(orientation),
    inertia: Float64Array.from(inertia),
    L: Float64Array.from(angularMomentum),
    mass,
  };
}

/** Ω = I⁻¹ L, componente per componente nella base dei piani. */
export function angularVelocity(body) {
  const w = bv.zero();
  for (let i = 0; i < 6; i++) w[i] = body.L[i] / body.inertia[i];
  return w;
}

function derivative(L, inertia) {
  const w = bv.zero();
  for (let i = 0; i < 6; i++) w[i] = L[i] / inertia[i];
  const dL = bv.fromMatrix(bv.commutator(bv.toMatrix(L), bv.toMatrix(w)));
  return { dL, w };
}

export function step(body, dt) {
  const I = body.inertia;
  const L0 = body.L;

  const a = derivative(L0, I);
  const b = derivative(bv.add(L0, bv.scale(a.dL, dt / 2)), I);
  const c = derivative(bv.add(L0, bv.scale(b.dL, dt / 2)), I);
  const d = derivative(bv.add(L0, bv.scale(c.dL, dt)), I);

  const dL = bv.scale(
    bv.add(bv.add(a.dL, bv.scale(b.dL, 2)), bv.add(bv.scale(c.dL, 2), d.dL)),
    1 / 6
  );
  const wAvg = bv.scale(bv.add(bv.add(a.w, bv.scale(b.w, 2)), bv.add(bv.scale(c.w, 2), d.w)), 1 / 6);

  body.L = bv.add(L0, bv.scale(dL, dt));
  body.orientation = orthonormalize(mul(body.orientation, expMatrix(bv.toMatrix(bv.scale(wAvg, dt)))));
  for (let i = 0; i < 4; i++) body.position[i] += body.velocity[i] * dt;
  return body;
}

/** R L Rᵀ: quello che un osservatore fermo misura, e che non deve cambiare. */
export function worldAngularMomentum(body) {
  return bv.fromMatrix(mul(mul(body.orientation, bv.toMatrix(body.L)), transpose(body.orientation)));
}

export function kineticEnergy(body) {
  let e = 0;
  for (let i = 0; i < 6; i++) e += (body.L[i] * body.L[i]) / body.inertia[i];
  let t = 0;
  for (let i = 0; i < 4; i++) t += body.velocity[i] * body.velocity[i];
  return 0.5 * e + 0.5 * body.mass * t;
}

/**
 * Angoli accumulati nei due piani di una rotazione doppia.
 * Serve a mostrare — e a misurare — che le velocità angolari sono DUE e distinte.
 */
export function planeAngle(body, planeIndex) {
  const [i, j] = bv.PLANES[planeIndex];
  const R = body.orientation;
  return Math.atan2(R[j * 4 + i], R[i * 4 + i]);
}
