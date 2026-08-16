// slice.js — le due modalità, e il passaggio continuo fra loro (SPEC §3.1, §6).
//
// Proiezione: tutto il volume-retina insieme, celle lontane in w rimpicciolite.
// Sezione: solo la fetta w = w₀, scena 3D nitida.
// Il confronto fra le due è il contenuto didattico centrale, quindi la
// transizione non è un taglio: è una finestra in w che si stringe fino a zero.
// Sezionare non è un'altra cosa dal proiettare — è proiettare una fetta sola.

import { W_DISTANCE } from './project.js';

export const PROJECTION_WINDOW = 1000; // praticamente infinita: si vede tutto
export const SLICE_WINDOW = 0.06;

export function makeSliceMode() {
  return {
    /** 0 = proiezione, 1 = sezione. Nel mezzo ci si può fermare, ed è il punto. */
    t: 0,
    target: 0,
    seconds: 1.1,
    center: W_DISTANCE,
  };
}

export function setMode(mode, name) {
  mode.target = name === 'section' ? 1 : 0;
}

export function toggle(mode) {
  mode.target = mode.target > 0.5 ? 0 : 1;
  return mode.target;
}

export function updateSlice(mode, dt) {
  const rate = dt / mode.seconds;
  const d = mode.target - mode.t;
  mode.t += Math.sign(d) * Math.min(Math.abs(d), rate);
  mode.t = Math.min(1, Math.max(0, mode.t));
  return mode.t;
}

export function currentName(mode) {
  if (mode.t < 0.02) return 'projection';
  if (mode.t > 0.98) return 'section';
  return 'between';
}

/** Larghezza della finestra in w, interpolata in modo geometrico. */
export function windowWidth(mode) {
  const a = Math.log(PROJECTION_WINDOW);
  const b = Math.log(SLICE_WINDOW);
  return Math.exp(a + (b - a) * easeInOut(mode.t));
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Sezione esatta di una cella con l'iperpiano w = w₀, calcolata sugli spigoli.
 * Il renderer non ne ha bisogno (la finestra in w fa lo stesso lavoro sul
 * frammento), ma l'interfaccia sì: serve a dire quante facce ha la fetta.
 */
export function sliceCell(vertices, edges, w0) {
  const pts = [];
  for (const [i, j] of edges) {
    const a = vertices[i];
    const b = vertices[j];
    const da = a[3] - w0;
    const db = b[3] - w0;
    if (Math.abs(da) < 1e-12 && Math.abs(db) < 1e-12) continue;
    if (da === 0) pts.push(a.slice(0, 3));
    else if (db === 0) pts.push(b.slice(0, 3));
    else if (da * db < 0) {
      const t = da / (da - db);
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return dedupe3(pts);
}

function dedupe3(pts) {
  const out = [];
  for (const p of pts) {
    if (!out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-9)) out.push(p);
  }
  return out;
}

/** Quanti vertici ha la sezione del tesseratto a w₀? Otto: è un cubo. */
export function sliceVertexCount(poly, w0) {
  return sliceCell(poly.vertices, poly.edges, w0).length;
}
