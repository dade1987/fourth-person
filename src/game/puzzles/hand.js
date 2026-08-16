// Enigma 4 — trasformare una mano sinistra in una destra (SPEC §9.4, §4.11).
//
// La serratura è specchiata. Nessuna rotazione dentro la fetta rimette a posto una
// mano: la chiralità non si aggiusta da dentro. Serve mezzo giro in un piano che
// contiene w — e quando l'oggetto torna nella fetta, è specchiato.
//
// Perché una mano e non un'elica: il giocatore la propria mano ce l'ha lì accanto,
// la gira per farla combaciare e non ci riesce. Vale dieci eliche.

import { identity, apply, mul, planeRotation, orthonormalize } from '../../math4d/rotor.js';
import { wedge3 } from '../../math4d/wedge.js';

// Con la convenzione del prodotto cuneo, la terna non ruotata dà −1: la
// riportiamo a +1 così "destra" e "sinistra" hanno un segno leggibile.
const REFERENCE = Math.sign(
  wedge3(new Float64Array([1, 0, 0, 0]), new Float64Array([0, 1, 0, 0]), new Float64Array([0, 0, 1, 0]))[3]
);

/** Chiralità rispetto alla fetta: il segno del volume orientato dei tre assi del corpo. */
export function chiralityOf(rotation) {
  const e1 = apply(rotation, new Float64Array([1, 0, 0, 0]));
  const e2 = apply(rotation, new Float64Array([0, 1, 0, 0]));
  const e3 = apply(rotation, new Float64Array([0, 0, 1, 0]));
  return (Math.sign(wedge3(e1, e2, e3)[3]) || 1) * REFERENCE;
}

export function createHandPuzzle({ position = [0, 0.1, 0], lockRequires = -1 } = {}) {
  const state = {
    id: 'hand',
    solved: false,
    holding: false,
    chirality: 1,
    lockRequires,
    /** Serve la quarta dimensione, non il movimento della camera. */
    requiresMotionCue: false,
  };

  const transform = { rotation: identity(), position: new Float64Array([position[0], position[1], position[2], 0]) };

  return {
    state,
    transform,

    /** Ruota nel piano indicato. Solo i piani che contengono w possono specchiarla. */
    rotate(planeI, planeJ, angle) {
      transform.rotation = orthonormalize(mul(transform.rotation, planeRotation(planeI, planeJ, angle)));
      state.chirality = chiralityOf(transform.rotation);
    },

    update(player, emit) {
      if (state.solved) return;
      const inSlice = Math.abs(transform.position[3]) < 0.08;
      state.chirality = chiralityOf(transform.rotation);
      if (inSlice && state.chirality === state.lockRequires) {
        state.solved = true;
        emit?.('solved', { puzzle: 'hand' });
      }
    },

    /** Nessuna rotazione interna alla fetta può risolverlo, mezzo giro in xw sì. */
    solvable() {
      const flipped = mul(identity(), planeRotation(0, 3, Math.PI));
      return chiralityOf(flipped) === lockRequires;
    },
  };
}
