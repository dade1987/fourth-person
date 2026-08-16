// Enigma 3 — separare due anelli concatenati (SPEC §9.3, §4.9).
//
// Due cerchi allacciati non si separano in ℝ³: è un teorema, non una difficoltà.
// In ℝ⁴ basta portarne uno fuori dalla fetta, scostarlo e riappoggiarlo — e non
// si attraversano mai, perché nel momento del passaggio stanno a w diversi.
// Il numero di allacciamento passa da 1 a 0 e il gioco non deve dirlo a parole.

import { linkingNumber } from '../../math4d/collide.js';
import { dist4 } from '../../math4d/wedge.js';

const SAMPLES = 72;

function circle(center, radius, plane) {
  const pts = [];
  for (let i = 0; i < SAMPLES; i++) {
    const a = (2 * Math.PI * i) / SAMPLES;
    const c = Math.cos(a) * radius;
    const s = Math.sin(a) * radius;
    if (plane === 'xy') pts.push(new Float64Array([center[0] + c, center[1] + s, center[2], center[3]]));
    else pts.push(new Float64Array([center[0] + c, center[1], center[2] + s, center[3]]));
  }
  return pts;
}

export function createRingsPuzzle({ center = [0, 0.1, 0], radius = 0.62 } = {}) {
  const a = new Float64Array([center[0], center[1], center[2], 0]);
  const b = new Float64Array([center[0] + radius, center[1], center[2], 0]);

  const state = {
    id: 'rings',
    solved: false,
    holding: false,
    linking: 1,
    requiresMotionCue: false,
  };

  let frame = 0;

  function curves() {
    return { a: circle(a, radius, 'xy'), b: circle(b, radius, 'xz') };
  }

  return {
    state,
    positionA: a,
    positionB: b,
    radius,

    update(player, emit) {
      if (state.solved) return;
      if (!state.holding) {
        if (dist4(player, b) < radius * 0.9) {
          state.holding = true;
          emit?.('grab', { puzzle: 'rings' });
        }
        return;
      }
      b.set(player);
      // il conteggio è caro: una volta ogni dieci fotogrammi basta e avanza
      if (++frame % 10 === 0) {
        const c = curves();
        state.linking = linkingNumber(c.a, c.b);
        const apart = Math.abs(b[0] - a[0]) > radius * 2.4 || Math.abs(b[2] - a[2]) > radius * 2.4;
        if (Math.abs(state.linking) < 0.3 && Math.abs(player[3]) < 0.08 && apart) {
          state.solved = true;
          emit?.('solved', { puzzle: 'rings' });
        }
      }
    },

    curves,

    solvable() {
      const c0 = curves();
      const start = Math.abs(linkingNumber(c0.a, c0.b));
      const moved = circle(new Float64Array([center[0] + radius * 5, center[1], center[2], 0]), radius, 'xz');
      return start > 0.7 && Math.abs(linkingNumber(c0.a, moved)) < 0.3;
    },
  };
}
