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

// ---------------------------------------------------------------------------
// Cose di tutti i giorni.
//
// Un tesseratto non l'hai mai tenuto in mano, quindi quando si rovescia non hai
// niente da confrontare. Una tazza sì. Qui gli oggetti di casa hanno uno spessore
// VERO nella quarta direzione: non sono figurine sottili, sono famiglie di tazze
// impilate lungo w. In proiezione le vedi tutte insieme, annidate — la stessa
// immagine del cubo dentro il cubo, ma fatta con una cosa che conosci.

/** Tubo lungo l'asse y, con lo spessore in w che gli si dice. */
export function addTube(b, id, center, radius, height, { wOffset = 0, wHalf = DEFAULT_W_HALF, segments = 28, thickness = 0 } = {}) {
  const cell = b.beginCell(id, [center[0], center[1], center[2], wOffset]);
  const ring = (r, y, w) => {
    const out = [];
    for (let i = 0; i < segments; i++) {
      const a = (2 * Math.PI * i) / segments;
      out.push([center[0] + Math.cos(a) * r, center[1] + y, center[2] + Math.sin(a) * r, w]);
    }
    return out;
  };
  const inner = thickness > 0 ? radius - thickness : 0;
  for (const w of [wOffset - wHalf, wOffset + wHalf]) {
    const lo = ring(radius, -height / 2, w);
    const hi = ring(radius, height / 2, w);
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      cell.quad(lo[i], lo[j], hi[j], hi[i]);
    }
    if (inner > 0) {
      const li = ring(inner, -height / 2, w);
      const hiI = ring(inner, height / 2, w);
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % segments;
        cell.quad(li[j], li[i], hiI[i], hiI[j]); // parete interna
        cell.quad(hi[i], hi[j], hiI[j], hiI[i]); // bordo
        cell.quad(lo[j], lo[i], li[i], li[j]);   // fondo
      }
    } else {
      const c0 = [center[0], center[1] - height / 2, center[2], w];
      const c1 = [center[0], center[1] + height / 2, center[2], w];
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % segments;
        cell.tri(c0, lo[j], lo[i]);
        cell.tri(c1, hi[i], hi[j]);
      }
    }
  }
  cell.end();
  return cell;
}

/** Arco di toro: il manico della tazza, l'archetto del lucchetto. */
export function addTorusArc(b, id, center, radius, tube, { from = 0, to = Math.PI, plane = 'xy', wOffset = 0, wHalf = DEFAULT_W_HALF, segments = 24, sides = 8 } = {}) {
  const cell = b.beginCell(id, [center[0], center[1], center[2], wOffset]);
  const point = (u, v, w) => {
    const r = radius + tube * Math.cos(v);
    const h = tube * Math.sin(v);
    const cu = Math.cos(u);
    const su = Math.sin(u);
    if (plane === 'xy') return [center[0] + r * cu, center[1] + r * su, center[2] + h, w];
    if (plane === 'xz') return [center[0] + r * cu, center[1] + h, center[2] + r * su, w];
    return [center[0] + h, center[1] + r * cu, center[2] + r * su, w];
  };
  for (const w of [wOffset - wHalf, wOffset + wHalf]) {
    for (let i = 0; i < segments; i++) {
      const u0 = from + ((to - from) * i) / segments;
      const u1 = from + ((to - from) * (i + 1)) / segments;
      for (let j = 0; j < sides; j++) {
        const v0 = (2 * Math.PI * j) / sides;
        const v1 = (2 * Math.PI * (j + 1)) / sides;
        cell.quad(point(u0, v0, w), point(u1, v0, w), point(u1, v1, w), point(u0, v1, w));
      }
    }
  }
  cell.end();
  return cell;
}

/**
 * La tazza, con vero spessore nella quarta direzione.
 * `layers` fette lungo w, ognuna una cella: in proiezione si vedono annidate,
 * in sezione ne resta una sola. Il profilo si stringe ai bordi, così la fetta
 * che vedi dipende da dove sei — ed è tutto il punto.
 */
export function mugMesh({ layers = 5, span = 0.55, radius = 0.42, height = 0.62 } = {}) {
  const b = builder();
  for (let k = 0; k < layers; k++) {
    const t = layers === 1 ? 0 : (k / (layers - 1)) * 2 - 1; // −1 … +1
    const w = t * span;
    const s = 1 - 0.34 * t * t; // il profilo si assottiglia agli estremi
    const wHalf = (span / layers) * 0.75;
    addTube(b, k, [0, 0, 0], radius * s, height * s, { wOffset: w, wHalf, thickness: 0.08 * s });
    addTorusArc(b, k, [radius * s * 0.98, 0, 0], 0.22 * s, 0.055 * s, {
      from: -Math.PI / 2, to: Math.PI / 2, plane: 'xy', wOffset: w, wHalf,
    });
  }
  return b.build();
}

/** Il corpo del lucchetto. L'archetto è un oggetto a parte: deve poter uscire. */
export function padlockBodyMesh(wHalf = 0.06) {
  const b = builder();
  addBox(b, 0, [0, 0, 0, 0], [0.34, 0.30, 0.16], wHalf);
  addBox(b, 1, [0, -0.02, 0.17, 0], [0.09, 0.09, 0.02], wHalf * 0.9); // il buco della chiave
  return b.build();
}

/** L'archetto: entra ed esce dal corpo passando per una direzione che il corpo non ha. */
export function shackleMesh(wHalf = 0.05) {
  const b = builder();
  addTorusArc(b, 0, [0, 0.30, 0], 0.19, 0.05, { from: 0, to: Math.PI, plane: 'xy', wHalf });
  addBox(b, 1, [-0.19, 0.16, 0, 0], [0.05, 0.15, 0.05], wHalf);
  addBox(b, 2, [0.19, 0.16, 0, 0], [0.05, 0.15, 0.05], wHalf);
  return b.build();
}
