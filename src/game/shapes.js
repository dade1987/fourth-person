// shapes.js — geometria generata da codice, nessun asset esterno.
//
// Gli oggetti della stanza sono tridimensionali: vivono nella fetta w = 0 e hanno
// uno spessore minimo in w, quel tanto che basta perché esistano davvero. È il
// motivo per cui si può passargli sopra: sono sottili nella quarta direzione.

const DEFAULT_W_HALF = 0.02;

export function builder() {
  const position = [];
  const cellCenter = [];
  const cellId = [];
  const cellRanges = [];
  const wire = [];
  let cursor = 0;

  function beginCell(id, center) {
    return {
      id,
      center,
      start: cursor,
      tri(a, b, c) {
        for (const v of [a, b, c]) {
          position.push(v[0], v[1], v[2], v[3] ?? 0);
          cellCenter.push(center[0], center[1], center[2], center[3] ?? 0);
          cellId.push(id);
        }
        cursor += 3;
      },
      quad(a, b, c, d) {
        this.tri(a, b, c);
        this.tri(a, c, d);
      },
      end() {
        cellRanges.push({ cell: id, start: this.start, count: cursor - this.start });
      },
    };
  }

  return {
    beginCell,
    line(a, b) {
      wire.push(a[0], a[1], a[2], a[3] ?? 0, b[0], b[1], b[2], b[3] ?? 0);
    },
    build() {
      return {
        position: new Float32Array(position),
        cellCenter: new Float32Array(cellCenter),
        cellId: new Float32Array(cellId),
        cellRanges,
        triangleCount: position.length / 12,
        wirePosition: new Float32Array(wire),
        cells: cellRanges.map((r, i) => ({ centroid4: cellCenterOf(cellCenter, r.start) })),
      };
    },
  };
}

function cellCenterOf(arr, start) {
  return new Float64Array([arr[start * 4], arr[start * 4 + 1], arr[start * 4 + 2], arr[start * 4 + 3]]);
}

const CORNERS = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
];
const FACES = [
  [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7],
  [1, 5, 6, 2], [4, 5, 1, 0], [3, 2, 6, 7],
];

/** Una scatola: sottile in w, solida nelle altre tre. */
export function addBox(b, id, center, half, wHalf = DEFAULT_W_HALF) {
  const cell = b.beginCell(id, [center[0], center[1], center[2], center[3] ?? 0]);
  const pts = CORNERS.map((c) => [
    center[0] + c[0] * half[0],
    center[1] + c[1] * half[1],
    center[2] + c[2] * half[2],
    (center[3] ?? 0),
  ]);
  // due copie sfalsate in w, così l'oggetto ha uno spessore vero anche in quarta
  const lo = pts.map((p) => [p[0], p[1], p[2], p[3] - wHalf]);
  const hi = pts.map((p) => [p[0], p[1], p[2], p[3] + wHalf]);
  for (const f of FACES) {
    cell.quad(lo[f[0]], lo[f[1]], lo[f[2]], lo[f[3]]);
    cell.quad(hi[f[3]], hi[f[2]], hi[f[1]], hi[f[0]]);
  }
  cell.end();
  return cell;
}

export function boxMesh(half, wHalf = DEFAULT_W_HALF) {
  const b = builder();
  addBox(b, 0, [0, 0, 0, 0], half, wHalf);
  return b.build();
}

/** Anello (toro) nel piano indicato, sottile in w. */
export function ringMesh({ radius = 1, tube = 0.16, plane = 'xy', segments = 48, sides = 10, wHalf = DEFAULT_W_HALF } = {}) {
  const b = builder();
  const cell = b.beginCell(0, [0, 0, 0, 0]);
  const point = (u, v) => {
    const cu = Math.cos(u);
    const su = Math.sin(u);
    const r = radius + tube * Math.cos(v);
    const h = tube * Math.sin(v);
    if (plane === 'xy') return [r * cu, r * su, h, 0];
    if (plane === 'xz') return [r * cu, h, r * su, 0];
    return [h, r * cu, r * su, 0];
  };
  for (let i = 0; i < segments; i++) {
    const u0 = (2 * Math.PI * i) / segments;
    const u1 = (2 * Math.PI * (i + 1)) / segments;
    for (let j = 0; j < sides; j++) {
      const v0 = (2 * Math.PI * j) / sides;
      const v1 = (2 * Math.PI * (j + 1)) / sides;
      const a = point(u0, v0), c = point(u1, v0), d = point(u1, v1), e = point(u0, v1);
      for (const s of [-wHalf, wHalf]) {
        const off = (p) => [p[0], p[1], p[2], s];
        cell.quad(off(a), off(c), off(d), off(e));
      }
    }
  }
  cell.end();
  return b.build();
}

/**
 * Una mano. Non un'elica: una mano.
 * Specchiare un'elica è astratto; il giocatore la propria mano ce l'ha lì accanto,
 * la gira per farla combaciare e non ci riesce. Vale dieci eliche (SPEC §9).
 * `handed` = +1 destra, −1 sinistra: il pollice sta da una parte sola.
 */
export function handMesh(handed = 1, wHalf = DEFAULT_W_HALF) {
  const b = builder();
  addBox(b, 0, [0, 0, 0, 0], [0.34, 0.42, 0.10], wHalf); // palmo
  const fingers = [0.30, 0.36, 0.33, 0.26];
  fingers.forEach((len, i) => {
    const x = -0.24 + i * 0.16;
    addBox(b, 1 + i, [x, 0.42 + len / 2, 0, 0], [0.06, len / 2, 0.08], wHalf);
  });
  // il pollice: è lui che decide se è destra o sinistra
  addBox(b, 5, [handed * 0.44, -0.02, 0, 0], [0.14, 0.10, 0.08], wHalf);
  return b.build();
}

/** L'oggetto da recuperare dalla cassa sigillata. */
export function keyMesh(wHalf = DEFAULT_W_HALF) {
  const b = builder();
  addBox(b, 0, [0, 0, 0, 0], [0.06, 0.22, 0.06], wHalf);
  addBox(b, 1, [0, 0.26, 0, 0], [0.16, 0.06, 0.06], wHalf);
  addBox(b, 2, [0.10, -0.16, 0, 0], [0.10, 0.05, 0.05], wHalf);
  return b.build();
}

/** Le sei pareti della cassa, come geometria: la stessa che collide.js usa come ostacolo. */
export function sealedBoxMesh(half, thickness = 0.05, wall = 0.04) {
  const b = builder();
  let id = 0;
  for (let axis = 0; axis < 3; axis++) {
    for (const s of [1, -1]) {
      const center = [0, 0, 0, 0];
      center[axis] = s * half[axis];
      const h = [half[0], half[1], half[2]];
      h[axis] = wall;
      addBox(b, id++, center, h, thickness);
    }
  }
  return b.build();
}

/** Un abitante: un blocchetto con la testa. Tridimensionale, e ci tiene. */
export function inhabitantMesh(wHalf = DEFAULT_W_HALF) {
  const b = builder();
  addBox(b, 0, [0, 0, 0, 0], [0.16, 0.24, 0.16], wHalf);
  addBox(b, 1, [0, 0.34, 0, 0], [0.11, 0.11, 0.11], wHalf);
  return b.build();
}
