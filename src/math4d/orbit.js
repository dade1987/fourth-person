// orbit.js — la caduta cubica (SPEC §4.7).
//
// L'area della 3-sfera è 2π²r³: in quattro dimensioni luce, gravità ed elettro-
// statica vanno come 1/r³. Conseguenza, nota dal 1917 (Ehrenfest): non esiste
// orbita circolare stabile. Il gioco lo fa vedere fallire, non lo racconta.

import { sub4, add4, scale4, length4 } from './wedge.js';

/** Intensità a distanza r. A distanza doppia è un ottavo. */
export function intensity(power, r) {
  return power / (r * r * r);
}

/** Accelerazione gravitazionale 1/r³ verso il centro. */
export function acceleration(mu, position, center = new Float64Array(4)) {
  const d = sub4(center, position);
  const r = length4(d);
  if (r < 1e-9) return new Float64Array(4);
  return scale4(d, mu / (r * r * r * r)); // (mu / r³) · versore
}

/** Velocità dell'orbita circolare esatta: v² / r = mu / r³  →  v = √(mu)/r. */
export function circularSpeed(mu, r) {
  return Math.sqrt(mu) / r;
}

/**
 * Integrazione con Runge-Kutta 4. Restituisce la storia del raggio: è lì che si
 * vede l'instabilità, perché una perturbazione minima non torna mai indietro.
 */
export function integrate({ mu = 1, position, velocity, dt = 1e-3, steps = 20000 }) {
  let p = Float64Array.from(position);
  let v = Float64Array.from(velocity);
  const radii = [length4(p)];
  for (let i = 0; i < steps; i++) {
    const a1 = acceleration(mu, p);
    const k1v = a1;
    const k1p = v;
    const a2 = acceleration(mu, add4(p, scale4(k1p, dt / 2)));
    const k2v = a2;
    const k2p = add4(v, scale4(k1v, dt / 2));
    const a3 = acceleration(mu, add4(p, scale4(k2p, dt / 2)));
    const k3v = a3;
    const k3p = add4(v, scale4(k2v, dt / 2));
    const a4 = acceleration(mu, add4(p, scale4(k3p, dt)));
    const k4v = a4;
    const k4p = add4(v, scale4(k3v, dt));

    p = add4(p, scale4(add4(add4(k1p, scale4(k2p, 2)), add4(scale4(k3p, 2), k4p)), dt / 6));
    v = add4(v, scale4(add4(add4(k1v, scale4(k2v, 2)), add4(scale4(k3v, 2), k4v)), dt / 6));
    radii.push(length4(p));
    if (radii[radii.length - 1] > 1e6 || radii[radii.length - 1] < 1e-4) break;
  }
  return { position: p, velocity: v, radii };
}

/**
 * Stabilizzazione: vincolando il corpo a una fetta (una sola direzione in meno di
 * libertà non basta — serve togliere la componente radiale della perturbazione)
 * l'orbita si può tenere in piedi solo forzandola. È l'enigma 6.
 */
export function constrainToSlice(position, velocity, sliceW = 0) {
  const p = Float64Array.from(position);
  const v = Float64Array.from(velocity);
  p[3] = sliceW;
  v[3] = 0;
  return { position: p, velocity: v };
}
