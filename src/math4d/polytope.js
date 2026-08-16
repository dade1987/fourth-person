// polytope.js — i sei politopi regolari di ℝ⁴, generati da codice (SPEC §4.12).
//
// In quattro dimensioni ce ne sono esattamente sei: 5-cella, tesseratto, 16-cella,
// 24-cella, 120-cella, 600-cella. La 24-cella non ha alcun analogo tridimensionale.
//
// Il bordo di un solido 4D è fatto di CELLE 3D (SPEC §4.6): qui una cella è un
// poliedro, e le sue facce sono poligoni. Nessuna dipendenza dal rendering.

import { wedge3, sub4, dot4, normalize4, length4, dist4 } from './wedge.js';

const EPS = 1e-9;

export const POLYTOPE_NAMES = ['5-cell', 'tesseract', '16-cell', '24-cell', '120-cell', '600-cell'];

/** Conteggi noti (vertici / spigoli / facce / celle), usati come oracolo dai test. */
export const KNOWN_COUNTS = {
  '5-cell': [5, 10, 10, 5],
  'tesseract': [16, 32, 24, 8],
  '16-cell': [8, 24, 32, 16],
  '24-cell': [24, 96, 96, 24],
  '120-cell': [600, 1200, 720, 120],
  '600-cell': [120, 720, 1200, 600],
};

const PHI = (1 + Math.sqrt(5)) / 2;

// ---------------------------------------------------------------- vertici ---

function key4(v, q = 1e-6) {
  return [0, 1, 2, 3].map((i) => Math.round(v[i] / q) * q + 0).map((x) => (x === 0 ? 0 : x).toFixed(6)).join(',');
}

function dedupe(list) {
  const seen = new Map();
  for (const v of list) {
    const k = key4(v);
    if (!seen.has(k)) seen.set(k, Float64Array.from(v));
  }
  return [...seen.values()];
}

function signs(base, movable) {
  const out = [];
  const n = movable.length;
  for (let m = 0; m < 1 << n; m++) {
    const v = Float64Array.from(base);
    for (let b = 0; b < n; b++) if (m & (1 << b)) v[movable[b]] = -v[movable[b]];
    out.push(v);
  }
  return out;
}

function permutations(n) {
  if (n === 1) return [[0]];
  const out = [];
  for (const p of permutations(n - 1)) {
    for (let i = 0; i <= p.length; i++) out.push([...p.slice(0, i), n - 1, ...p.slice(i)]);
  }
  return out;
}

function parity(p) {
  let swaps = 0;
  const a = [...p];
  for (let i = 0; i < a.length; i++) {
    while (a[i] !== i) {
      const j = a[i];
      [a[i], a[j]] = [a[j], a[i]];
      swaps++;
    }
  }
  return swaps % 2;
}

function vertices5Cell() {
  const r = 1 / Math.sqrt(5);
  return [
    new Float64Array([1, 1, 1, -r]),
    new Float64Array([1, -1, -1, -r]),
    new Float64Array([-1, 1, -1, -r]),
    new Float64Array([-1, -1, 1, -r]),
    new Float64Array([0, 0, 0, 4 * r]),
  ];
}

function verticesTesseract() {
  return signs(new Float64Array([1, 1, 1, 1]), [0, 1, 2, 3]);
}

function vertices16Cell() {
  const out = [];
  for (let i = 0; i < 4; i++) {
    for (const s of [1, -1]) {
      const v = new Float64Array(4);
      v[i] = s;
      out.push(v);
    }
  }
  return out;
}

function vertices24Cell() {
  const out = [];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      for (const si of [1, -1]) {
        for (const sj of [1, -1]) {
          const v = new Float64Array(4);
          v[i] = si;
          v[j] = sj;
          out.push(v);
        }
      }
    }
  }
  return out;
}

function vertices600Cell() {
  const out = [];
  // (±2, 0, 0, 0) e permutazioni — 8
  for (let i = 0; i < 4; i++) {
    for (const s of [2, -2]) {
      const v = new Float64Array(4);
      v[i] = s;
      out.push(v);
    }
  }
  // (±1, ±1, ±1, ±1) — 16
  out.push(...signs(new Float64Array([1, 1, 1, 1]), [0, 1, 2, 3]));
  // permutazioni PARI di (±φ, ±1, ±1/φ, 0) — 96
  const base = [PHI, 1, 1 / PHI, 0];
  for (const p of permutations(4)) {
    if (parity(p) !== 0) continue;
    const v = new Float64Array(4);
    for (let k = 0; k < 4; k++) v[p[k]] = base[k];
    const nonZero = [0, 1, 2, 3].filter((i) => Math.abs(v[i]) > EPS);
    out.push(...signs(v, nonZero));
  }
  return dedupe(out);
}

// -------------------------------------------------------- struttura celle ---

function computeEdges(verts) {
  let min = Infinity;
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      const d = dist4(verts[i], verts[j]);
      if (d < min) min = d;
    }
  }
  const tol = min * 1e-6 + 1e-9;
  const edges = [];
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      if (Math.abs(dist4(verts[i], verts[j]) - min) < tol) edges.push([i, j]);
    }
  }
  return { edges, edgeLength: min };
}

/** Forza bruta sugli iperpiani: ogni quaterna di vertici che lascia tutti gli altri da una parte. */
function cellsByHyperplane(verts) {
  const n = verts.length;
  const found = new Map();
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        for (let d = c + 1; d < n; d++) {
          const nrm = wedge3(sub4(verts[b], verts[a]), sub4(verts[c], verts[a]), sub4(verts[d], verts[a]));
          const len = length4(nrm);
          if (len < 1e-7) continue;
          const u = normalize4(nrm);
          const off = dot4(u, verts[a]);
          let above = 0;
          let below = 0;
          const on = [];
          for (let i = 0; i < n; i++) {
            const s = dot4(u, verts[i]) - off;
            if (s > 1e-7) above++;
            else if (s < -1e-7) below++;
            else on.push(i);
          }
          if (above > 0 && below > 0) continue;
          const k = on.join(',');
          if (!found.has(k)) found.set(k, on);
        }
      }
    }
  }
  return [...found.values()];
}

/** Per i politopi simpliciali: ogni 4-cricca del grafo degli spigoli è una cella. */
function cellsByClique(verts, edges) {
  const adj = verts.map(() => new Set());
  for (const [i, j] of edges) {
    adj[i].add(j);
    adj[j].add(i);
  }
  const found = new Map();
  for (const [i, j] of edges) {
    const common = [...adj[i]].filter((k) => adj[j].has(k) && k > j);
    for (let a = 0; a < common.length; a++) {
      for (let b = a + 1; b < common.length; b++) {
        if (!adj[common[a]].has(common[b])) continue;
        const cell = [i, j, common[a], common[b]].sort((x, y) => x - y);
        found.set(cell.join(','), cell);
      }
    }
  }
  return [...found.values()];
}

function centroidOf(verts, idxs) {
  const c = new Float64Array(4);
  for (const i of idxs) for (let k = 0; k < 4; k++) c[k] += verts[i][k];
  for (let k = 0; k < 4; k++) c[k] /= idxs.length;
  return c;
}

/** Rango affine di un insieme di punti (serve a scartare intersezioni degeneri). */
function affineRank(points) {
  if (points.length < 2) return 0;
  const basis = [];
  for (let i = 1; i < points.length; i++) {
    let v = Float64Array.from(sub4(points[i], points[0]));
    for (const b of basis) {
      const d = dot4(v, b);
      for (let k = 0; k < 4; k++) v[k] -= d * b[k];
    }
    const n = length4(v);
    if (n > 1e-7) basis.push(normalize4(v));
  }
  return basis.length;
}

/**
 * Una 2-faccia è l'intersezione di due celle adiacenti (SPEC §4.6):
 * in un politopo regolare due celle si toccano esattamente lungo una faccia.
 */
function facesFromCells(verts, cells) {
  const found = new Map();
  for (let a = 0; a < cells.length; a++) {
    const setA = new Set(cells[a]);
    for (let b = a + 1; b < cells.length; b++) {
      const inter = cells[b].filter((i) => setA.has(i));
      if (inter.length < 3) continue;
      if (affineRank(inter.map((i) => verts[i])) !== 2) continue;
      found.set(inter.slice().sort((x, y) => x - y).join(','), inter);
    }
  }
  return [...found.values()].map((f) => orderPolygon(verts, f));
}

/** Ordina i vertici di un poligono planare girando attorno al suo centro. */
export function orderPolygon(verts, idxs) {
  const c = centroidOf(verts, idxs);
  const e1 = normalize4(sub4(verts[idxs[0]], c));
  let e2 = null;
  for (let i = 1; i < idxs.length; i++) {
    let v = Float64Array.from(sub4(verts[idxs[i]], c));
    const d = dot4(v, e1);
    for (let k = 0; k < 4; k++) v[k] -= d * e1[k];
    if (length4(v) > 1e-7) {
      e2 = normalize4(v);
      break;
    }
  }
  if (!e2) return idxs.slice();
  return idxs
    .map((i) => {
      const d = sub4(verts[i], c);
      return { i, a: Math.atan2(dot4(d, e2), dot4(d, e1)) };
    })
    .sort((p, q) => p.a - q.a)
    .map((p) => p.i);
}

function assemble(name, verts, cellVertexSets) {
  const { edges, edgeLength } = computeEdges(verts);
  const faces = facesFromCells(verts, cellVertexSets);
  const faceKey = new Map();
  faces.forEach((f, i) => faceKey.set(f.slice().sort((a, b) => a - b).join(','), i));

  const cells = cellVertexSets.map((cv) => {
    const set = new Set(cv);
    const centroid = centroidOf(verts, cv);
    const myFaces = [];
    faces.forEach((f, i) => {
      if (f.every((k) => set.has(k))) myFaces.push(i);
    });
    // Politopo centrato nell'origine: la normale uscente della cella è il suo centro.
    const normal = normalize4(centroid);
    return { vertices: cv, faces: myFaces, centroid, normal };
  });

  return {
    name,
    vertices: verts,
    edges,
    edgeLength,
    faces,
    cells,
    counts: [verts.length, edges.length, faces.length, cells.length],
    circumradius: Math.max(...verts.map((v) => length4(v))),
  };
}

const cache = new Map();

export function polytope(name) {
  if (cache.has(name)) return cache.get(name);
  let p;
  switch (name) {
    case '5-cell': {
      const v = vertices5Cell();
      p = assemble(name, v, cellsByHyperplane(v));
      break;
    }
    case 'tesseract': {
      const v = verticesTesseract();
      p = assemble(name, v, cellsByHyperplane(v));
      break;
    }
    case '16-cell': {
      const v = vertices16Cell();
      p = assemble(name, v, cellsByHyperplane(v));
      break;
    }
    case '24-cell': {
      const v = vertices24Cell();
      p = assemble(name, v, cellsByHyperplane(v));
      break;
    }
    case '600-cell': {
      const v = vertices600Cell();
      const { edges } = computeEdges(v);
      p = assemble(name, v, cellsByClique(v, edges));
      break;
    }
    case '120-cell': {
      // Duale della 600-cella: i vertici sono i centri delle sue 600 celle,
      // e ogni dodecaedro raccoglie le celle che condividono un vertice.
      const six = polytope('600-cell');
      const dualVerts = six.cells.map((c) => normalize4(c.centroid));
      const cellsAt = six.vertices.map(() => []);
      six.cells.forEach((c, ci) => c.vertices.forEach((vi) => cellsAt[vi].push(ci)));
      p = assemble(name, dualVerts, cellsAt);
      break;
    }
    default:
      throw new Error(`politopo sconosciuto: ${name}`);
  }
  cache.set(name, p);
  return p;
}

// ---------------------------------------------------------------- misure ---

/** Ipercubo di lato s (SPEC §4.8). */
export function hypercubeVolume(s) {
  return s ** 4;
}

/** 4-palla di raggio r: π²r⁴/2. */
export function ball4Volume(r) {
  return (Math.PI ** 2 * r ** 4) / 2;
}

/** Area della 3-sfera: 2π²r³. È da qui che nasce la caduta 1/r³. */
export function sphere3Area(r) {
  return 2 * Math.PI ** 2 * r ** 3;
}

// -------------------------------------------------- geometria per il render ---

/**
 * Triangolazione a ventaglio delle facce di ogni cella.
 * Restituisce array semplici (nessun oggetto WebGL): il rendering ci costruisce
 * sopra i buffer, ma questo modulo resta testabile in Node.
 */
export function buildMesh(poly, { scale = 1 } = {}) {
  const pos = [];
  const cellId = [];
  const cellCenter = [];
  const lineIdx = [];
  const centroidOfFace = (f) => {
    const c = new Float64Array(4);
    for (const i of f) for (let k = 0; k < 4; k++) c[k] += poly.vertices[i][k];
    for (let k = 0; k < 4; k++) c[k] /= f.length;
    return c;
  };
  const push = (v, ci, cc) => {
    pos.push(v[0] * scale, v[1] * scale, v[2] * scale, v[3] * scale);
    cellId.push(ci);
    cellCenter.push(cc[0] * scale, cc[1] * scale, cc[2] * scale, cc[3] * scale);
  };

  poly.cells.forEach((cell, ci) => {
    for (const fi of cell.faces) {
      const f = poly.faces[fi];
      const fc = centroidOfFace(f);
      for (let k = 0; k < f.length; k++) {
        const a = poly.vertices[f[k]];
        const b = poly.vertices[f[(k + 1) % f.length]];
        push(fc, ci, cell.centroid);
        push(a, ci, cell.centroid);
        push(b, ci, cell.centroid);
      }
    }
  });

  // Intervalli per cella: servono a disegnarle una alla volta, ordinate dal
  // fondo, e a toglierne alcune quando si occlude (SPEC §4.6).
  const cellRanges = [];
  {
    let start = 0;
    poly.cells.forEach((cell, ci) => {
      let count = 0;
      for (const fi of cell.faces) count += poly.faces[fi].length * 3;
      cellRanges.push({ cell: ci, start, count });
      start += count;
    });
  }

  const wirePos = [];
  for (const [i, j] of poly.edges) {
    for (const v of [poly.vertices[i], poly.vertices[j]]) {
      wirePos.push(v[0] * scale, v[1] * scale, v[2] * scale, v[3] * scale);
    }
    lineIdx.push(i, j);
  }

  return {
    position: new Float32Array(pos),
    cellId: new Float32Array(cellId),
    cellCenter: new Float32Array(cellCenter),
    triangleCount: pos.length / 12,
    cellRanges,
    wirePosition: new Float32Array(wirePos),
    wireCount: lineIdx.length,
  };
}

/** Grado di un vertice nel grafo degli spigoli: nel tesseratto è 4 per tutti. */
export function vertexDegrees(poly) {
  const deg = poly.vertices.map(() => 0);
  for (const [i, j] of poly.edges) {
    deg[i]++;
    deg[j]++;
  }
  return deg;
}

/** Una cella è un cubo? Otto vertici, dodici spigoli, sei facce quadrate. */
export function cellIsCube(poly, cellIndex) {
  const cell = poly.cells[cellIndex];
  if (cell.vertices.length !== 8) return false;
  if (cell.faces.length !== 6) return false;
  if (!cell.faces.every((fi) => poly.faces[fi].length === 4)) return false;
  const set = new Set(cell.vertices);
  const inner = poly.edges.filter(([i, j]) => set.has(i) && set.has(j));
  if (inner.length !== 12) return false;
  // Tutti gli spigoli della stessa lunghezza e tutti i vertici alla stessa distanza dal centro.
  const r = cell.vertices.map((i) => dist4(poly.vertices[i], cell.centroid));
  return Math.max(...r) - Math.min(...r) < 1e-9;
}
