// Enigma 1 — recuperare un oggetto da una cassa 3D sigillata (SPEC §9.1).
//
// La cassa è chiusa: in tre dimensioni non c'è verso di entrarci. Ma "chiuso" in
// ℝ⁴ non significa niente (SPEC §4.10): basta uscire dalla fetta, passare sopra
// il coperchio — che sopra non ha niente — e rientrare dentro.
// Non c'è nessun trucco nel codice: sono le stesse collisioni di sempre.

import { sealedBox, anyBoxHit } from '../../math4d/collide.js';
import { dist4 } from '../../math4d/wedge.js';

export const SLICE_TOLERANCE = 0.06;
/** Quanto vicino devi essere per prenderla. Generoso: il difficile è entrare, non afferrare. */
export const GRAB_RADIUS = 0.52;

export function createSealedBoxPuzzle({ center = [0, 0, 0], half = [0.55, 0.45, 0.55] } = {}) {
  const c4 = new Float64Array([center[0], center[1], center[2], 0]);
  const walls = sealedBox(c4, half, SLICE_TOLERANCE * 0.8);
  const keyPosition = new Float64Array([center[0], center[1] - 0.1, center[2], 0]);

  const state = {
    id: 'sealed-box',
    solved: false,
    holding: false,
    grabbedAt: 0,
    /** L'enigma non dipende dal movimento della camera: si risolve muovendosi (SPEC §5.6). */
    requiresMotionCue: false,
  };

  return {
    state,
    walls,
    keyPosition,
    half,
    center: c4,

    /** Le pareti fermano solo chi resta nella fetta. Nessun caso speciale. */
    blockers: () => walls,

    inSlice(player) {
      return Math.abs(player[3]) < SLICE_TOLERANCE;
    },

    /** Si può prendere adesso? Da qui esce anche il bagliore della chiave. */
    canGrab(player) {
      return !state.holding && !state.solved && this.inSlice(player) && dist4(player, keyPosition) < GRAB_RADIUS;
    },

    /**
     * Toccarla deve fare qualcosa. Se non si può ancora prendere, il perché non
     * è un dettaglio da nascondere: è l'enigma. Restituisce il motivo.
     */
    attemptGrab(player, emit) {
      if (state.holding || state.solved) return 'holding';
      if (this.canGrab(player)) {
        state.holding = true;
        emit?.('grab', { puzzle: 'sealed-box' });
        return 'grabbed';
      }
      if (!this.inSlice(player)) return 'outOfSlice';
      return 'blocked';
    },

    update(player, emit) {
      if (state.solved) return;
      const inSlice = this.inSlice(player);
      if (!state.holding) {
        // camminarci sopra basta: toccarla è l'altra strada, non l'unica
        if (this.canGrab(player)) {
          state.holding = true;
          emit?.('grab', { puzzle: 'sealed-box' });
        }
        return;
      }
      keyPosition.set(player);
      keyPosition[1] = player[1] - 0.1;
      const outside =
        Math.abs(player[0] - c4[0]) > half[0] + 0.2 ||
        Math.abs(player[2] - c4[2]) > half[2] + 0.2;
      if (inSlice && outside) {
        state.solved = true;
        emit?.('solved', { puzzle: 'sealed-box' });
      }
    },

    /**
     * A che punto sei, e quindi cosa devi fare adesso.
     * "Non ho capito come si prende" non è colpa di chi gioca: se l'enigma ha
     * quattro passi e il gioco ne suggerisce uno solo, la colpa è del gioco.
     */
    guide(player) {
      if (state.solved) return 'done';
      const inSlice = this.inSlice(player);
      const overBox =
        Math.abs(player[0] - c4[0]) < half[0] &&
        Math.abs(player[2] - c4[2]) < half[2];
      if (state.holding) return inSlice ? 'carryOut' : 'comeDown';
      if (!inSlice && !overBox) return 'walkOver';   // sei fuori: adesso cammina
      if (!inSlice && overBox) return 'comeDown';    // sei sopra il coperchio: scendi
      if (inSlice && overBox) return 'takeIt';       // sei dentro: prendila
      return 'stepOut';                              // sei fuori e nella fetta: esci dalla fetta
    },

    /** Verifica di risolvibilità: esiste un cammino, e non passa dalle pareti. */
    solvable() {
      const from = new Float64Array([0, 0, 0, 0]);
      const lift = new Float64Array([0, 0, 0, 0.6]);
      const over = new Float64Array([half[0] * 3, 0, 0, 0.6]);
      const down = new Float64Array([half[0] * 3, 0, 0, 0]);
      const path = [from, lift, over, down];
      for (let i = 1; i < path.length; i++) {
        if (anyBoxHit(walls, path[i - 1], path[i])) return false;
      }
      return true;
    },
  };
}
