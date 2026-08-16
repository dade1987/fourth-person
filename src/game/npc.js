// npc.js — gli abitanti.
//
// Sono tridimensionali e confinati alla fetta w = 0. Non è una limitazione tecnica:
// è il loro mondo intero. Quando esci in w spariscono dalla loro vista, e quando
// rientri ricompari dal nulla. Da dentro la fetta non c'è modo di dire dove eri.

const SPEED = 0.22;

export function createInhabitants(count = 5, radius = 1.9, rng = Math.random) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / count + rng() * 0.4;
    const r = radius * (0.5 + rng() * 0.5);
    list.push({
      position: new Float64Array([Math.cos(a) * r, 0, Math.sin(a) * r, 0]),
      heading: rng() * Math.PI * 2,
      phase: rng() * 6.28,
      turnAt: 1 + rng() * 3,
      /** Cosa vedono: nulla di ciò che sta fuori dalla loro fetta. */
      sees(player) {
        return Math.abs(player[3]) < 0.05;
      },
    });
  }
  return list;
}

export function updateInhabitants(list, dt, bounds = 2.4) {
  for (const n of list) {
    n.turnAt -= dt;
    if (n.turnAt <= 0) {
      n.heading += (Math.random() - 0.5) * 2.2;
      n.turnAt = 1.5 + Math.random() * 3;
    }
    n.position[0] += Math.cos(n.heading) * SPEED * dt;
    n.position[2] += Math.sin(n.heading) * SPEED * dt;
    if (Math.hypot(n.position[0], n.position[2]) > bounds) {
      n.heading += Math.PI * 0.9;
      n.position[0] *= 0.98;
      n.position[2] *= 0.98;
    }
    n.position[3] = 0; // e da qui non si esce
    n.phase += dt * 2.4;
  }
}

/** Reazione quando il giocatore ricompare nella fetta: un piccolo sobbalzo. */
export function startle(list, player) {
  for (const n of list) {
    const d = Math.hypot(n.position[0] - player[0], n.position[2] - player[2]);
    if (d < 1.2) n.heading = Math.atan2(n.position[2] - player[2], n.position[0] - player[0]);
  }
}
