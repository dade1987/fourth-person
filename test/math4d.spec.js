// Test della matematica pura. Nessun pixel finché questi non passano (SPEC §17.1).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  identity, planeRotation, mul, transpose, apply, applyT, det, orthonormalityError,
  doubleRotation, fixedPointDimension, expMatrix, makeRng, randomRotation, IDX,
} from '../src/math4d/rotor.js';
import * as bv from '../src/math4d/bivector.js';
import { wedge3, dot4, sub4, normalize4, hyperplaneNormal } from '../src/math4d/wedge.js';
import {
  polytope, POLYTOPE_NAMES, KNOWN_COUNTS, hypercubeVolume, ball4Volume, sphere3Area,
  vertexDegrees, cellIsCube, buildMesh,
} from '../src/math4d/polytope.js';
import { DOF_TOTAL, DOF_ROTATION, DOF_TRANSLATION } from '../src/math4d/rigidbody.js';

test('una rotazione di piano è ortonormale e conserva l orientamento', () => {
  for (const [i, j] of bv.PLANES) {
    for (const theta of [0.1, 1, 2.5, -0.7]) {
      const R = planeRotation(i, j, theta);
      assert.ok(orthonormalityError(R) < 1e-12, `RᵀR ≠ I nel piano ${i}${j}`);
      assert.ok(Math.abs(det(R) - 1) < 1e-12, `det R ≠ +1 nel piano ${i}${j}`);
    }
  }
});

test('la rotazione tocca solo i due assi del suo piano', () => {
  const R = planeRotation(0, 3, 0.9); // xw
  const v = apply(R, new Float64Array([0, 1, 2, 0]));
  assert.ok(Math.abs(v[1] - 1) < 1e-15);
  assert.ok(Math.abs(v[2] - 2) < 1e-15);
});

test('la trasposta è l inversa', () => {
  const R = mul(planeRotation(0, 1, 0.4), planeRotation(1, 3, -1.2));
  const v = new Float64Array([0.3, -1.1, 2, 0.5]);
  const back = applyT(R, apply(R, v));
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(back[i] - v[i]) < 1e-12);
});

test('SO(4) ha sei piani e SE(4) dieci gradi di libertà', () => {
  assert.equal(bv.PLANES.length, 6);
  assert.equal(DOF_ROTATION, 6);
  assert.equal(DOF_TRANSLATION, 4);
  assert.equal(DOF_TOTAL, 10);
});

test('una rotazione semplice ha un piano di punti fissi, una doppia no', () => {
  assert.equal(fixedPointDimension(planeRotation(0, 1, 0.8)), 2);
  assert.equal(fixedPointDimension(doubleRotation(0.8, 0.3)), 0);
});

test('la rotazione isoclina non ha punti fissi oltre l origine', () => {
  for (const a of [0.3, 1.1, 2.0]) {
    const R = doubleRotation(a, a);
    assert.equal(fixedPointDimension(R), 0);
    // e nemmeno autovettori reali: nessuna direzione resta se stessa
    for (let k = 0; k < 200; k++) {
      const rng = makeRng(k + 1);
      const v = normalize4(new Float64Array([rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5]));
      const w = apply(R, v);
      assert.ok(Math.abs(Math.abs(dot4(v, w)) - 1) > 1e-6);
    }
  }
});

test('esponenziale del bivettore = rotazione di piano', () => {
  for (let p = 0; p < 6; p++) {
    const [i, j] = bv.PLANES[p];
    const theta = 0.73;
    const b = bv.zero();
    b[p] = theta;
    const R = expMatrix(bv.toMatrix(b));
    const ref = planeRotation(i, j, theta);
    for (let k = 0; k < 16; k++) assert.ok(Math.abs(R[k] - ref[k]) < 1e-10);
  }
});

test('il bivettore va e torna dalla matrice antisimmetrica', () => {
  const b = new Float64Array([0.2, -1, 0.5, 0.3, -0.7, 1.4]);
  const back = bv.fromMatrix(bv.toMatrix(b));
  for (let i = 0; i < 6; i++) assert.ok(Math.abs(back[i] - b[i]) < 1e-15);
  const m = bv.toMatrix(b);
  for (let r = 0; r < 4; r++) {
    assert.equal(m[IDX(r, r)], 0);
    for (let c = 0; c < 4; c++) assert.ok(Math.abs(m[IDX(r, c)] + m[IDX(c, r)]) < 1e-15);
  }
});

test('rotazioni casuali: ortonormali, determinante +1', () => {
  const rng = makeRng(7);
  for (let k = 0; k < 200; k++) {
    const R = randomRotation(rng);
    assert.ok(orthonormalityError(R) < 1e-12);
    assert.ok(Math.abs(det(R) - 1) < 1e-10);
  }
});

test('prodotto cuneo: la normale è ortogonale ai tre vettori', () => {
  const rng = makeRng(11);
  for (let k = 0; k < 300; k++) {
    const v = () => new Float64Array([rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5]);
    const a = v(); const b = v(); const c = v();
    const n = wedge3(a, b, c);
    const scale = Math.max(1e-9, Math.hypot(...n));
    assert.ok(Math.abs(dot4(n, a)) / scale < 1e-9);
    assert.ok(Math.abs(dot4(n, b)) / scale < 1e-9);
    assert.ok(Math.abs(dot4(n, c)) / scale < 1e-9);
  }
});

test('la normale a un iperpiano è unitaria e passa per i quattro punti', () => {
  const p0 = new Float64Array([1, 0, 0, 0]);
  const p1 = new Float64Array([0, 1, 0, 0]);
  const p2 = new Float64Array([0, 0, 1, 0]);
  const p3 = new Float64Array([0, 0, 0, 1]);
  const n = hyperplaneNormal(p0, p1, p2, p3);
  assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-12);
  const off = dot4(n, p0);
  for (const p of [p1, p2, p3]) assert.ok(Math.abs(dot4(n, p) - off) < 1e-12);
});

test('i politopi regolari in 4D sono sei, e i conteggi sono quelli noti', () => {
  assert.equal(POLYTOPE_NAMES.length, 6);
  for (const name of POLYTOPE_NAMES) {
    const p = polytope(name);
    assert.deepEqual(p.counts, KNOWN_COUNTS[name], `conteggi sbagliati per ${name}`);
    // Caratteristica di Eulero di una 4-politopo: V − E + F − C = 0
    const [v, e, f, c] = p.counts;
    assert.equal(v - e + f - c, 0, `Eulero non torna per ${name}`);
  }
});

test('ogni vertice del tesseratto ha grado 4, e ogni cella è un cubo', () => {
  const t = polytope('tesseract');
  assert.ok(vertexDegrees(t).every((d) => d === 4));
  assert.equal(t.cells.length, 8);
  for (let i = 0; i < 8; i++) assert.ok(cellIsCube(t, i), `la cella ${i} non è un cubo`);
});

test('la 24-cella è fatta di ottaedri e non ha analogo tridimensionale', () => {
  const p = polytope('24-cell');
  assert.equal(p.cells.length, 24);
  for (const cell of p.cells) {
    assert.equal(cell.vertices.length, 6);
    assert.equal(cell.faces.length, 8);
  }
  assert.ok(vertexDegrees(p).every((d) => d === 8));
});

test('mesh: triangoli entro il budget e coerenti con la struttura', () => {
  const t = polytope('tesseract');
  const mesh = buildMesh(t, { scale: 0.05 });
  assert.equal(mesh.position.length / 4, mesh.triangleCount * 3);
  // ogni cella è chiusa e disegnabile da sola: 8 cubi × 6 quadrati × 4 triangoli
  assert.equal(mesh.triangleCount, 192);
  assert.ok(mesh.triangleCount <= 40000);
  const p = polytope('24-cell');
  assert.ok(buildMesh(p).triangleCount <= 40000);
});

test('misure: ipercubo s⁴, 4-palla π²r⁴/2, 3-sfera 2π²r³', () => {
  assert.ok(Math.abs(hypercubeVolume(3) - 81) < 1e-12);
  assert.ok(Math.abs(ball4Volume(1) - Math.PI ** 2 / 2) < 1e-12);
  assert.ok(Math.abs(sphere3Area(1) - 2 * Math.PI ** 2) < 1e-12);

  // controprova Monte Carlo, con germe fisso
  const rng = makeRng(23);
  let inside = 0;
  const N = 400000;
  for (let i = 0; i < N; i++) {
    const x = rng() * 2 - 1, y = rng() * 2 - 1, z = rng() * 2 - 1, w = rng() * 2 - 1;
    if (x * x + y * y + z * z + w * w <= 1) inside++;
  }
  const estimate = (16 * inside) / N;
  assert.ok(Math.abs(estimate - ball4Volume(1)) / ball4Volume(1) < 0.03);
});

test('identità e trasposizione si comportano', () => {
  const I = identity();
  const R = planeRotation(2, 3, 1.3);
  const back = mul(R, transpose(R));
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(back[i] - I[i]) < 1e-14);
});
