// I pezzi di contorno che gli altri test non toccano.
//
// Non sono test messi lì per far salire un numero: ognuno di questi è una
// funzione pubblica con un contratto, e qui il contratto viene verificato.
// Il numero che sale è una conseguenza, non lo scopo.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  identity, clone, planeRotation, mul, mulAll, transpose, apply, det,
  orthonormalize, orthonormalityError, expMatrix, makeRng, randomRotation,
  fixedPointDimension, isIsoclinic, doubleRotation,
} from '../src/math4d/rotor.js';
import * as bv from '../src/math4d/bivector.js';
import {
  wedge3, sub4, add4, scale4, dot4, length4, normalize4, lerp4, dist4,
  hyperplaneNormal, signedVolume,
} from '../src/math4d/wedge.js';
import {
  makeBox, pointInBox, boxesOverlap, segmentHitsBox, moveWithCollision,
  cellVisible, pointInBall4, hypersphereContains, segmentDistance, selfClearance,
  sealedBox, anyBoxHit, escapePathFromShell3D, linkingNumber,
} from '../src/math4d/collide.js';
import { makeBody, step, angularVelocity, kineticEnergy, worldAngularMomentum, planeAngle, DOF_TOTAL } from '../src/math4d/rigidbody.js';
import { intensity, acceleration, circularSpeed, integrate, constrainToSlice } from '../src/math4d/orbit.js';
import { polytope, buildMesh, vertexDegrees, cellIsCube, orderPolygon, sphere3Area, ball4Volume, hypercubeVolume } from '../src/math4d/polytope.js';
import { trefoil, sampleClosed, crossings, tricolorings, unknottingPath, isEmbedded, hopfRings, unlinkPath } from '../src/math4d/knots.js';

import {
  makeCamera4, setPlayerW, rotateCamera, cameraPlaneAngles, toCameraSpace, projectTo3D,
  cameraMatrixT, makeTransform4, transformPoint, rotateTransform, toFloat32, W_DISTANCE, NEAR_W,
} from '../src/render/project.js';
import {
  makeSliceMode, setMode, toggle, updateSlice, currentName, windowWidth, sliceCell, sliceVertexCount,
  PROJECTION_WINDOW, SLICE_WINDOW,
} from '../src/render/slice.js';
import { sheenStrength } from '../src/render/holo.js';
import { elasticReturn, screenHalfSizeMeters, frustumMatrix, clamp, deg, rad } from '../src/render/headcoupled.js';
import { chiralityOf } from '../src/game/puzzles/hand.js';

test('rotor: utilità di base', () => {
  const R = planeRotation(1, 2, 0.5);
  assert.notEqual(clone(R), R);
  assert.deepEqual([...clone(R)], [...R]);
  assert.throws(() => planeRotation(2, 2, 1), /due assi distinti/);
  const I = identity();
  assert.equal(det(I), 1);
  assert.ok(orthonormalityError(mulAll(R, transpose(R))) < 1e-12);
  // Gram-Schmidt ripara una matrice sporcata a mano
  const dirty = clone(R);
  dirty[0] += 0.01;
  assert.ok(orthonormalityError(dirty) > 1e-4);
  assert.ok(orthonormalityError(orthonormalize(dirty)) < 1e-12);
  // esponenziale di una matrice grande: scalatura e quadratura
  const big = bv.toMatrix(bv.fromPlane('xy', 12.5));
  assert.ok(orthonormalityError(expMatrix(big)) < 1e-9);
  assert.equal(isIsoclinic(0.4, -0.4), true);
  assert.equal(isIsoclinic(0.4, 0.7), false);
  assert.equal(isIsoclinic(0, 0), false);
  assert.equal(fixedPointDimension(identity()), 4);
  assert.ok(Math.abs(det(doubleRotation(0.3, 0.9)) - 1) < 1e-12);
  const rng = makeRng();
  assert.ok(Math.abs(det(randomRotation(rng)) - 1) < 1e-9);
  const v = apply(planeRotation(0, 1, Math.PI / 2), new Float64Array([1, 0, 0, 0]));
  assert.ok(Math.abs(v[1] - 1) < 1e-12);
});

test('bivettori: piani, nomi e coppie completamente ortogonali', () => {
  assert.equal(bv.planeIndex('zw'), 5);
  assert.equal(bv.planeIndex('boh'), -1);
  assert.throws(() => bv.fromPlane('boh', 1), /piano sconosciuto/);
  assert.deepEqual(bv.W_PLANES, [2, 4, 5]);
  // ogni piano ha esattamente un complemento, e la relazione è simmetrica
  for (let p = 0; p < 6; p++) {
    const q = bv.orthogonalComplementPlane(p);
    assert.equal(bv.orthogonalComplementPlane(q), p);
    assert.notEqual(p, q);
  }
  assert.throws(() => bv.orthogonalComplementPlane(9), /fuori intervallo/);
  const a = bv.fromPlane('xy', 2);
  const b = bv.fromPlane('zw', 3);
  assert.equal(bv.dot(a, b), 0);
  assert.ok(Math.abs(bv.norm(bv.add(a, b)) - Math.hypot(2, 3)) < 1e-12);
  assert.equal(bv.norm(bv.scale(a, 2)), 4);
  assert.equal(bv.norm(bv.zero()), 0);
  // un bivettore trasportato da una rotazione conserva la norma
  const R = randomRotation(makeRng(5));
  assert.ok(Math.abs(bv.norm(bv.rotateBivector(R, a)) - bv.norm(a)) < 1e-12);
  // il commutatore di due matrici uguali è nullo
  const M = bv.toMatrix(a);
  assert.ok(bv.commutator(M, M).every((x) => Math.abs(x) < 1e-15));
});

test('wedge: algebra vettoriale in quattro dimensioni', () => {
  const a = new Float64Array([1, 2, 3, 4]);
  const b = new Float64Array([0, 1, 0, 1]);
  assert.deepEqual([...add4(a, b)], [1, 3, 3, 5]);
  assert.deepEqual([...sub4(a, b)], [1, 1, 3, 3]);
  assert.deepEqual([...scale4(b, 3)], [0, 3, 0, 3]);
  assert.equal(dot4(b, b), 2);
  assert.ok(Math.abs(length4(normalize4(a)) - 1) < 1e-12);
  assert.deepEqual([...normalize4(new Float64Array(4))], [0, 0, 0, 0]);
  assert.deepEqual([...lerp4(a, b, 0)], [...a]);
  assert.deepEqual([...lerp4(a, b, 1)], [...b]);
  assert.ok(Math.abs(dist4(a, b) - length4(sub4(a, b))) < 1e-12);
  const n = hyperplaneNormal(
    new Float64Array([0, 0, 0, 0]), new Float64Array([1, 0, 0, 0]),
    new Float64Array([0, 1, 0, 0]), new Float64Array([0, 0, 1, 0])
  );
  assert.ok(Math.abs(Math.abs(n[3]) - 1) < 1e-12);
  // volume orientato: cambia segno scambiando due vettori
  const e1 = new Float64Array([1, 0, 0, 0]);
  const e2 = new Float64Array([0, 1, 0, 0]);
  const e3 = new Float64Array([0, 0, 1, 0]);
  const w = new Float64Array([0, 0, 0, 1]);
  assert.equal(Math.sign(signedVolume(e1, e2, e3, w)), -Math.sign(signedVolume(e2, e1, e3, w)));
  assert.ok(Math.abs(length4(wedge3(a, a, b))) < 1e-12); // due vettori uguali: niente volume
});

test('collisioni: scatole, sfere e distanze', () => {
  const box = makeBox(new Float64Array([0, 0, 0, 0]), new Float64Array([1, 1, 1, 1]));
  assert.ok(pointInBox(box, new Float64Array([0.5, 0, 0, 0])));
  assert.ok(!pointInBox(box, new Float64Array([2, 0, 0, 0])));
  assert.ok(pointInBox(box, new Float64Array([1.2, 0, 0, 0]), 0.5));
  assert.ok(boxesOverlap(box, makeBox(new Float64Array([1, 0, 0, 0]), new Float64Array([1, 1, 1, 1]))));
  assert.ok(!boxesOverlap(box, makeBox(new Float64Array([5, 0, 0, 0]), new Float64Array([1, 1, 1, 1]))));
  // segmento parallelo a un asse, fuori dalla fetta della scatola: non tocca
  assert.equal(segmentHitsBox(box, new Float64Array([-3, 5, 0, 0]), new Float64Array([3, 5, 0, 0])), null);
  assert.equal(segmentHitsBox(box, new Float64Array([3, 0, 0, 0]), new Float64Array([5, 0, 0, 0])), null);
  assert.ok(pointInBall4(new Float64Array(4), 1, new Float64Array([0, 0, 0, 1])));
  assert.ok(!hypersphereContains(new Float64Array(4), 1, new Float64Array([1, 1, 0, 0])));
  // segmenti paralleli: la distanza è quella fra le rette
  const d = segmentDistance(
    new Float64Array([0, 0, 0, 0]), new Float64Array([1, 0, 0, 0]),
    new Float64Array([0, 1, 0, 0]), new Float64Array([1, 1, 0, 0])
  );
  assert.ok(Math.abs(d - 1) < 1e-9);
  // un quadrato non si attraversa da solo
  const square = [
    new Float64Array([0, 0, 0, 0]), new Float64Array([1, 0, 0, 0]),
    new Float64Array([1, 1, 0, 0]), new Float64Array([0, 1, 0, 0]),
  ];
  assert.ok(selfClearance(square) > 0.5);
  // il movimento scivola lungo la parete invece di incastrarsi
  const wall = [makeBox(new Float64Array([1, 0, 0, 0]), new Float64Array([0.1, 5, 5, 5]))];
  const moved = moveWithCollision(new Float64Array([0, 0, 0, 0]), new Float64Array([2, 1, 0, 0]), wall, 0.05);
  assert.ok(moved[0] < 1);
  assert.ok(cellVisible(new Float64Array([0, 0, 0, 1]), new Float64Array([0, 0, 0, 1]), new Float64Array([0, 0, 0, 5])));
  const walls = sealedBox(new Float64Array(4), [1, 1, 1], 0.05);
  assert.equal(walls.length, 6);
  assert.ok(anyBoxHit(walls, new Float64Array([0, 0, 0, 0]), new Float64Array([3, 0, 0, 0])));
  assert.ok(escapePathFromShell3D(new Float64Array(4), 1, 0.05, new Float64Array(4)).length > 10);
  // due cerchi lontani non sono allacciati
  const far = sampleClosed((s) => new Float64Array([Math.cos(s), Math.sin(s), 0, 0]), 60);
  const other = sampleClosed((s) => new Float64Array([20 + Math.cos(s), 0, Math.sin(s), 0]), 60);
  assert.ok(Math.abs(linkingNumber(far, other)) < 0.05);
});

test('corpo rigido: energia, velocità angolare e angoli', () => {
  const body = makeBody();
  assert.equal(kineticEnergy(body), 0);
  assert.equal(DOF_TOTAL, 10);
  const spinning = makeBody({
    angularMomentum: bv.fromPlane('xy', 2),
    velocity: new Float64Array([1, 0, 0, 0]),
    mass: 2,
  });
  assert.equal(angularVelocity(spinning)[0], 2);
  assert.ok(kineticEnergy(spinning) > 0);
  const before = [...spinning.position];
  step(spinning, 0.1);
  assert.ok(spinning.position[0] > before[0]); // la traslazione avanza
  assert.ok(Math.abs(planeAngle(spinning, 0) - 0.2) < 1e-3);
  assert.ok(bv.norm(worldAngularMomentum(spinning)) > 1);
});

test('orbite: intensità, velocità circolare e vincolo alla fetta', () => {
  assert.equal(intensity(8, 2), 1);
  assert.deepEqual([...acceleration(1, new Float64Array(4))], [0, 0, 0, 0]);
  assert.equal(circularSpeed(4, 2), 1);
  const out = integrate({ mu: 1, position: new Float64Array([1, 0, 0, 0]), velocity: new Float64Array([0, 1, 0, 0]), steps: 10 });
  assert.equal(out.radii.length, 11);
  const c = constrainToSlice(new Float64Array([1, 2, 3, 4]), new Float64Array([1, 1, 1, 1]));
  assert.equal(c.position[3], 0);
  assert.equal(c.velocity[3], 0);
});

test('politopi: mesh, gradi e forma delle celle', () => {
  const five = polytope('5-cell');
  assert.throws(() => polytope('7-cell'), /politopo sconosciuto/);
  assert.ok(vertexDegrees(five).every((d) => d === 4));
  assert.equal(cellIsCube(five, 0), false); // le celle della 5-cella sono tetraedri
  const mesh = buildMesh(five);
  assert.equal(mesh.cellRanges.length, 5);
  assert.ok(mesh.wireCount > 0);
  // l'ordinamento di un poligono è ciclico e non perde vertici
  const t = polytope('tesseract');
  const face = t.faces[0];
  assert.equal(new Set(orderPolygon(t.vertices, face)).size, face.length);
  assert.ok(Math.abs(sphere3Area(2) / sphere3Area(1) - 8) < 1e-9);
  assert.ok(Math.abs(ball4Volume(2) / ball4Volume(1) - 16) < 1e-9);
  assert.equal(hypercubeVolume(2), 16);
});

test('nodi: diagramma del trifoglio e anelli di Hopf', () => {
  const curve = sampleClosed(trefoil, 120);
  assert.equal(curve.length, 120);
  assert.ok(isEmbedded(curve));
  assert.equal(crossings(curve).length, 3);
  assert.ok(tricolorings(curve) > 3);
  // un cerchio non ha incroci, e le colorazioni sono solo le tre banali
  const circle = sampleClosed((s) => new Float64Array([Math.cos(s), Math.sin(s), 0, 0]), 80);
  assert.equal(crossings(circle).length, 0);
  assert.equal(tricolorings(circle), 3);
  const { ringA, ringB } = hopfRings();
  assert.equal(typeof ringA, 'function');
  assert.ok(Math.abs(Math.abs(linkingNumber(sampleClosed(ringA, 80), sampleClosed(ringB, 80))) - 1) < 0.05);
  assert.ok(unknottingPath(0.5, 120).length === 120);
  assert.ok(unlinkPath(0.5).a.length > 0);
});

test('camera 4D: proiezione, angoli e trasformazioni', () => {
  const cam = makeCamera4();
  assert.equal(cam.position[3], -W_DISTANCE);
  setPlayerW(cam, 0.5);
  assert.ok(Math.abs(cam.position[3] - (0.5 - W_DISTANCE)) < 1e-12);
  // un punto nella fetta del giocatore sta esattamente a fuoco
  const p = toCameraSpace(cam, new Float64Array([0, 0, 0, 0.5]));
  assert.ok(Math.abs(p[3] - W_DISTANCE) < 1e-12);
  const q = projectTo3D(cam, new Float64Array([1, 0, 0, 0.5]));
  assert.ok(Math.abs(q.q[0] - 1) < 1e-12); // f/pw = 1: la fetta è a scala uno
  assert.equal(q.clipped, false);
  // dietro la camera si taglia
  assert.equal(projectTo3D(cam, new Float64Array([0, 0, 0, -10])).clipped, true);
  assert.ok(NEAR_W > 0);

  const angles = cameraPlaneAngles(cam);
  assert.equal(angles.length, 6);
  assert.ok(angles.every((a) => Math.abs(a) < 1e-12));
  rotateCamera(cam, 0, 0.3);
  assert.ok(Math.abs(cameraPlaneAngles(cam)[0] - 0.3) < 1e-9);
  assert.ok(orthonormalityError(cameraMatrixT(cam)) < 1e-12);

  const tr = makeTransform4();
  tr.position[1] = 2;
  assert.deepEqual([...transformPoint(tr, new Float64Array([1, 0, 0, 0]))], [1, 2, 0, 0]);
  rotateTransform(tr, 2, Math.PI); // xw
  const flipped = transformPoint(tr, new Float64Array([1, 0, 0, 0]));
  assert.ok(Math.abs(flipped[0] + 1) < 1e-9);
  assert.equal(toFloat32(identity()).length, 16);
});

test('ombra o fetta: la finestra in w si stringe con continuità', () => {
  const mode = makeSliceMode();
  assert.equal(currentName(mode), 'projection');
  assert.ok(Math.abs(windowWidth(mode) - PROJECTION_WINDOW) < 1e-6);
  assert.equal(toggle(mode), 1);
  // a metà strada non è né l'una né l'altra: ci si può fermare
  updateSlice(mode, mode.seconds / 2);
  assert.equal(currentName(mode), 'between');
  const half = windowWidth(mode);
  assert.ok(half < PROJECTION_WINDOW && half > SLICE_WINDOW);
  updateSlice(mode, 10);
  assert.equal(currentName(mode), 'section');
  assert.ok(Math.abs(windowWidth(mode) - SLICE_WINDOW) < 1e-6);
  setMode(mode, 'projection');
  updateSlice(mode, 10);
  assert.equal(currentName(mode), 'projection');

  // la sezione del tesseratto a w = 0 è un cubo: otto vertici
  const t = polytope('tesseract');
  assert.equal(sliceVertexCount(t, 0), 8);
  assert.equal(sliceCell(t.vertices, t.edges, 5).length, 0); // fuori dall'oggetto: niente
});

test('specularità e frustum: i conti di contorno', () => {
  assert.ok(sheenStrength(0) > sheenStrength(1));
  assert.ok(sheenStrength(0) <= 1);
  assert.ok(elasticReturn(1, 1) < 1);
  assert.equal(elasticReturn(0, 1), 0);
  const s = screenHalfSizeMeters(378, 756);
  assert.ok(Math.abs(s.halfWidth - 0.05) < 1e-6);
  assert.ok(Math.abs(s.halfHeight - 0.1) < 1e-6);
  const m = frustumMatrix(-1, 1, -1, 1, 1, 10);
  assert.equal(m[11], -1);
  assert.equal(clamp(5, 0, 1), 1);
  assert.ok(Math.abs(deg(rad(90)) - 90) < 1e-12);
});

test('chiralità: la terna non ruotata è destra per definizione', () => {
  assert.equal(chiralityOf(identity()), 1);
  assert.equal(chiralityOf(planeRotation(0, 3, Math.PI)), -1);
  assert.equal(chiralityOf(planeRotation(1, 3, Math.PI)), -1);
  assert.equal(chiralityOf(mul(planeRotation(0, 3, Math.PI), planeRotation(1, 3, Math.PI))), 1);
});
