// Gli invarianti fisici. Il rischio non è il crash: è avere qualcosa che sembra
// giusto e non lo è (SPEC §12).
import test from 'node:test';
import assert from 'node:assert/strict';

import { planeRotation, apply, makeRng, randomSliceRotation, det } from '../src/math4d/rotor.js';
import * as bv from '../src/math4d/bivector.js';
import { wedge3, sub4, dot4, length4 } from '../src/math4d/wedge.js';
import { makeBody, step, worldAngularMomentum, angularVelocity, planeAngle } from '../src/math4d/rigidbody.js';
import { polytope } from '../src/math4d/polytope.js';
import {
  cellVisible, sealedBox, anyBoxHit, escapePathFromShell3D, hypersphereContains,
  linkingNumber, segmentDistance, makeBox, segmentHitsBox,
} from '../src/math4d/collide.js';
import { trefoil, sampleClosed, crossings, tricolorings, unknottingPath, isEmbedded, unlinkPath } from '../src/math4d/knots.js';
import { intensity, acceleration, circularSpeed, integrate } from '../src/math4d/orbit.js';

test('momento angolare conservato su 10 000 passi, deriva sotto lo 0,1%', () => {
  const body = makeBody({
    inertia: new Float64Array([1, 1.7, 2.3, 0.9, 1.3, 2.9]),
    angularMomentum: new Float64Array([0.7, -0.3, 0.5, 1.1, -0.9, 0.4]),
  });
  const L0 = worldAngularMomentum(body);
  const n0 = bv.norm(L0);
  for (let i = 0; i < 10000; i++) step(body, 1 / 240);
  const L1 = worldAngularMomentum(body);
  let worst = 0;
  for (let i = 0; i < 6; i++) worst = Math.max(worst, Math.abs(L1[i] - L0[i]));
  assert.ok(worst / n0 < 1e-3, `deriva ${(worst / n0) * 100}%`);
});

test('un corpo libero mostra DUE velocità angolari distinte', () => {
  const body = makeBody({
    inertia: new Float64Array([1, 1, 1, 1, 1, 2]),
    // momento nei piani xy e zw: completamente ortogonali
    angularMomentum: bv.add(bv.fromPlane('xy', 1.0), bv.fromPlane('zw', 1.0)),
  });
  const w = angularVelocity(body);
  const wxy = w[bv.planeIndex('xy')];
  const wzw = w[bv.planeIndex('zw')];
  assert.ok(Math.abs(wxy - wzw) > 0.1, 'le due velocità devono essere diverse');

  const dt = 1 / 500;
  const T = 400;
  for (let i = 0; i < T; i++) step(body, dt);
  const measuredXY = planeAngle(body, bv.planeIndex('xy')) / (T * dt);
  assert.ok(Math.abs(measuredXY - wxy) < 1e-3, 'la velocità misurata nel piano xy non torna');
  // e il moto non è una rotazione semplice: il corpo si muove in due piani insieme
  const R = body.orientation;
  assert.ok(Math.abs(R[2 * 4 + 2] - 1) > 1e-6, 'il piano zw non ha ruotato');
});

test('rotazione isoclina: due velocità uguali, nessun punto fermo', () => {
  const body = makeBody({
    inertia: new Float64Array([1, 1, 1, 1, 1, 1]),
    angularMomentum: bv.add(bv.fromPlane('xy', 1.0), bv.fromPlane('zw', 1.0)),
  });
  const w = angularVelocity(body);
  assert.ok(Math.abs(w[bv.planeIndex('xy')] - w[bv.planeIndex('zw')]) < 1e-12);
  for (let i = 0; i < 500; i++) step(body, 1 / 500);
  const rng = makeRng(3);
  for (let k = 0; k < 300; k++) {
    const v = new Float64Array([rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5]);
    const n = length4(v);
    const u = apply(body.orientation, v);
    assert.ok(Math.abs(dot4(v, u)) / (n * n) < 0.999999, 'una direzione è rimasta ferma');
  }
});

test('occlusione: si scartano le celle che danno le spalle alla camera', () => {
  const t = polytope('tesseract');
  const cam = new Float64Array([0, 0, 0, 5]);
  const visible = t.cells.filter((c) => cellVisible(c.normal, c.centroid, cam));
  assert.equal(visible.length, 1, 'da lontano in w si vede una cella sola, come una faccia di un cubo');
  const obliqua = new Float64Array([4, 0, 0, 4]);
  const visible2 = t.cells.filter((c) => cellVisible(c.normal, c.centroid, obliqua));
  assert.equal(visible2.length, 2);
});

test('intensità e gravità vanno come 1/r³: a distanza doppia un ottavo', () => {
  assert.ok(Math.abs(intensity(1, 2) / intensity(1, 1) - 1 / 8) < 1e-15);
  const a1 = length4(acceleration(1, new Float64Array([1, 0, 0, 0])));
  const a2 = length4(acceleration(1, new Float64Array([2, 0, 0, 0])));
  assert.ok(Math.abs(a2 / a1 - 1 / 8) < 1e-12);
});

test('nessuna orbita circolare stabile: la perturbazione non torna indietro', () => {
  const mu = 1;
  // orbita circolare esatta: resta dov'è
  const exact = integrate({
    mu,
    position: new Float64Array([1, 0, 0, 0]),
    velocity: new Float64Array([0, circularSpeed(mu, 1), 0, 0]),
    dt: 1e-3,
    steps: 20000,
  });
  const rMax = Math.max(...exact.radii);
  const rMin = Math.min(...exact.radii);
  assert.ok(rMax - rMin < 1e-3, 'quella esatta deve restare circolare');

  // un per cento di perturbazione, e non torna più
  const perturbed = integrate({
    mu,
    position: new Float64Array([1.01, 0, 0, 0]),
    velocity: new Float64Array([0, circularSpeed(mu, 1), 0, 0]),
    dt: 1e-3,
    steps: 60000,
  });
  const rEnd = perturbed.radii[perturbed.radii.length - 1];
  assert.ok(rEnd > 2, `raggio finale ${rEnd}: doveva scappare via`);
  // e non è un'oscillazione: dopo un po' cresce e basta
  const tail = perturbed.radii.slice(-1000);
  for (let i = 1; i < tail.length; i++) assert.ok(tail[i] >= tail[i - 1] - 1e-9);
});

test('chiralità: 180° in xw restituisce l oggetto specchiato e nulla lo rimette a posto', () => {
  // una "mano": tre dita non complanari nella fetta w = 0
  const hand = [
    new Float64Array([0, 0, 0, 0]),
    new Float64Array([1, 0, 0, 0]),
    new Float64Array([0.2, 1, 0, 0]),
    new Float64Array([0.1, 0.2, 1, 0]),
  ];
  const handedness = (pts) => {
    const a = sub4(pts[1], pts[0]);
    const b = sub4(pts[2], pts[0]);
    const c = sub4(pts[3], pts[0]);
    return Math.sign(wedge3(a, b, c)[3]);
  };
  const before = handedness(hand);
  const R = planeRotation(0, 3, Math.PI); // 180° nel piano xw
  const mirrored = hand.map((p) => apply(R, p));
  assert.ok(mirrored.every((p) => Math.abs(p[3]) < 1e-12), 'deve tornare dentro la fetta');
  assert.equal(handedness(mirrored), -before, 'non si è specchiata');

  const rng = makeRng(99);
  for (let k = 0; k < 1000; k++) {
    const S = randomSliceRotation(rng);
    assert.ok(Math.abs(det(S) - 1) < 1e-9);
    const tried = mirrored.map((p) => apply(S, p));
    assert.equal(handedness(tried), -before, 'una rotazione ha rimesso a posto la chiralità');
  }
});

test('il trifoglio è annodato, e in ℝ⁴ si scioglie senza mai attraversarsi', () => {
  const base = sampleClosed(trefoil, 180);
  assert.equal(crossings(base).length, 3, 'il diagramma del trifoglio ha tre incroci');
  assert.ok(tricolorings(base) > 3, 'il trifoglio è tricolorabile: non è il nodo banale');

  let worst = Infinity;
  for (let i = 0; i <= 40; i++) {
    const curve = unknottingPath(i / 40, 180);
    assert.ok(isEmbedded(curve, 1e-2), `auto-intersezione a t=${i / 40}`);
    worst = Math.min(worst, i / 40);
  }

  const end = unknottingPath(1, 180);
  assert.ok(end.every((p) => Math.abs(p[3]) < 1e-12), 'alla fine si torna nella fetta w = 0');
  assert.equal(crossings(end).length, 3);
  assert.equal(tricolorings(end), 3, 'non più tricolorabile: un diagramma a tre incroci che non è il trifoglio è il nodo banale');
});

test('due anelli concatenati si separano, e non si toccano mai', () => {
  const start = unlinkPath(0);
  assert.ok(Math.abs(Math.abs(linkingNumber(start.a, start.b)) - 1) < 0.05, 'partono concatenati');
  for (let i = 0; i <= 30; i++) {
    const { a, b } = unlinkPath(i / 30);
    let min = Infinity;
    for (let x = 0; x < a.length; x++) {
      for (let y = 0; y < b.length; y++) {
        min = Math.min(min, segmentDistance(a[x], a[(x + 1) % a.length], b[y], b[(y + 1) % b.length]));
      }
    }
    assert.ok(min > 1e-2, `anelli a contatto a t=${i / 30}`);
  }
  const end = unlinkPath(1);
  assert.ok(Math.abs(linkingNumber(end.a, end.b)) < 0.05, 'alla fine sono liberi');
});

test('una cassa 3D sigillata non racchiude nulla, un contenitore ipersferico sì', () => {
  const center = new Float64Array([0, 0, 0, 0]);
  const walls = sealedBox(center, [0.5, 0.5, 0.5], 0.05);
  const inside = new Float64Array([0, 0, 0, 0]);
  const outside = new Float64Array([2, 0, 0, 0]);

  // restando nella fetta, la cassa tiene
  assert.ok(anyBoxHit(walls, inside, outside), 'dentro la fetta la parete deve fermare');

  // uscendo in w, non tocca niente
  const path = escapePathFromShell3D(center, 0.5, 0.05, inside);
  for (let i = 1; i < path.length; i++) {
    assert.ok(!anyBoxHit(walls, path[i - 1], path[i]), `la parete è stata toccata al passo ${i}`);
  }
  const last = path[path.length - 1];
  assert.ok(Math.abs(last[3]) < 1e-9, 'si torna nella fetta');
  assert.ok(length4(last) > 0.5, 'e si è fuori');

  // l'ipersfera invece tiene: qualunque uscita passa dal suo bordo
  assert.ok(hypersphereContains(center, 1, new Float64Array([0, 0, 0, 0.9])));
  assert.ok(!hypersphereContains(center, 1, new Float64Array([0, 0, 0, 1.1])));
  for (const p of path) {
    if (length4(p) > 1) {
      assert.ok(!hypersphereContains(center, 1, p));
    }
  }
});

test('il segmento passa se cambia fetta, si ferma se resta', () => {
  const wall = makeBox(new Float64Array([0, 0, 0, 0]), new Float64Array([0.05, 1, 1, 0.05]));
  const a = new Float64Array([-1, 0, 0, 0]);
  const b = new Float64Array([1, 0, 0, 0]);
  assert.notEqual(segmentHitsBox(wall, a, b), null);
  const up = new Float64Array([-1, 0, 0, 0.5]);
  const over = new Float64Array([1, 0, 0, 0.5]);
  assert.equal(segmentHitsBox(wall, up, over), null);
});
