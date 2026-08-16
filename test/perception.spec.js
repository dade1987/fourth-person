// I test della percezione (SPEC §5, §12).
// Qui non si verifica che il codice giri: si verifica che le regole percettive
// dichiarate nella specifica siano davvero vincolanti.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  wiggleAllowed, clampParams, wiggleOffset, makeHandover, WIGGLE_LIMITS, STILLNESS_SECONDS,
  cueCheck, REQUIRED_CUES, withinFlashLimit, MAX_FLASHES_PER_SECOND,
  evaluateDepthOrdering, evaluateStability, DEPTH_ORDERING_CRITERION,
} from '../src/render/wiggle.js';
import {
  eyeFromOrientation, frustumParams, offAxisProjection, translationView, asymmetry,
  makeLowPass, MAX_TILT_DEG, VIEW_DISTANCE, screenHalfSizeMeters,
} from '../src/render/headcoupled.js';
import { createSealedBoxPuzzle } from '../src/game/puzzles/sealedbox.js';
import { createRingsPuzzle } from '../src/game/puzzles/rings.js';
import { createHandPuzzle, chiralityOf } from '../src/game/puzzles/hand.js';
import { identity, planeRotation } from '../src/math4d/rotor.js';

test('l oscillazione NON si accende sui fili: sarebbe ambigua', () => {
  assert.equal(wiggleAllowed({ geometry: 'wire' }), false);
  assert.equal(wiggleAllowed({ geometry: 'glass' }), true);
  assert.equal(wiggleAllowed({ geometry: 'solid' }), true);
});

test('l oscillazione NON si accende in ortografica: serve la prospettiva', () => {
  assert.equal(wiggleAllowed({ geometry: 'glass', projection: 'orthographic' }), false);
  assert.equal(wiggleAllowed({ geometry: 'glass', projection: 'perspective' }), true);
});

test('prefers-reduced-motion spegne l oscillazione senza chiedere niente', () => {
  assert.equal(wiggleAllowed({ geometry: 'glass', reducedMotion: true }), false);
  assert.equal(wiggleAllowed({ geometry: 'glass', userEnabled: false }), false);
});

test('gli indizi obbligatori sono cinque, e se ne manca uno non si oscilla', () => {
  assert.deepEqual(REQUIRED_CUES, ['occlusion', 'perspective', 'shading', 'headCoupled', 'refraction']);
  assert.equal(cueCheck(REQUIRED_CUES).sufficient, true);
  const senzaOcclusione = cueCheck(REQUIRED_CUES.filter((c) => c !== 'occlusion'));
  assert.equal(senzaOcclusione.sufficient, false);
  assert.deepEqual(senzaOcclusione.missing, ['occlusion']);
});

test('i parametri dell oscillazione restano nei limiti dichiarati', () => {
  const low = clampParams({ amplitudeDeg: 0.5, frequencyHz: 0.05 });
  const high = clampParams({ amplitudeDeg: 30, frequencyHz: 8 });
  assert.equal(low.amplitudeDeg, WIGGLE_LIMITS.minAmplitudeDeg);
  assert.equal(low.frequencyHz, WIGGLE_LIMITS.minFrequencyHz);
  assert.equal(high.amplitudeDeg, WIGGLE_LIMITS.maxAmplitudeDeg);
  assert.equal(high.frequencyHz, WIGGLE_LIMITS.maxFrequencyHz);
  assert.ok(WIGGLE_LIMITS.minFrequencyHz >= 0.4 && WIGGLE_LIMITS.maxFrequencyHz <= 0.8);
  assert.ok(WIGGLE_LIMITS.minAmplitudeDeg >= 3 && WIGGLE_LIMITS.maxAmplitudeDeg <= 6);
});

test('il moto è sinusoidale e continuo, non un alternarsi fra due fotogrammi', () => {
  const params = { amplitudeDeg: 4.5, frequencyHz: 0.55, distance: VIEW_DISTANCE };
  const dt = 1 / 60;
  let maxStep = 0;
  const values = [];
  for (let i = 0; i < 600; i++) {
    const a = wiggleOffset(i * dt, params);
    const b = wiggleOffset((i + 1) * dt, params);
    maxStep = Math.max(maxStep, Math.abs(b.x - a.x));
    values.push(a.x);
  }
  const amp = VIEW_DISTANCE * Math.tan((4.5 * Math.PI) / 180);
  // in un fotogramma non si può spostare più di quanto una sinusoide permetta
  assert.ok(maxStep < amp * 2 * Math.PI * 0.55 * dt * 1.05);
  assert.ok(Math.max(...values) <= amp + 1e-12);
  assert.ok(Math.min(...values) >= -amp - 1e-12);
  // e non è una alternanza: i valori sono tanti, non due
  assert.ok(new Set(values.map((v) => v.toFixed(4))).size > 100);
});

test('la parallasse generata da te ha la precedenza su quella subita', () => {
  const h = makeHandover({ fadeSeconds: 0.5 });
  for (let i = 0; i < 60; i++) h.update(1 / 60, true); // dispositivo in movimento
  assert.ok(h.gain < 0.05, 'con il telefono in mano l oscillazione deve spegnersi');
  let steps = 0;
  let prev = h.gain;
  let maxJump = 0;
  while (h.gain < 0.99 && steps < 60 * 12) {
    h.update(1 / 60, false);
    maxJump = Math.max(maxJump, Math.abs(h.gain - prev));
    prev = h.gain;
    steps++;
  }
  const seconds = steps / 60;
  assert.ok(seconds >= STILLNESS_SECONDS, `ha ripreso dopo ${seconds}s, doveva aspettare ${STILLNESS_SECONDS}`);
  assert.ok(maxJump < 0.05, 'la transizione deve essere morbida, mai a scatto');
});

test('niente che lampeggi più di tre volte al secondo (WCAG)', () => {
  assert.equal(MAX_FLASHES_PER_SECOND, 3);
  assert.ok(withinFlashLimit(2.9));
  assert.ok(!withinFlashLimit(3.1));
  // l'oscillazione stessa è ben sotto la soglia
  assert.ok(withinFlashLimit(WIGGLE_LIMITS.maxFrequencyHz));
});

test('il frustum è asimmetrico e fuori asse, e la vista NON ruota mai', () => {
  const { halfWidth, halfHeight } = screenHalfSizeMeters(390, 844);
  const centre = frustumParams({ eye: { x: 0, y: 0, z: VIEW_DISTANCE }, halfWidth, halfHeight, near: 0.01 });
  assert.ok(asymmetry(centre) < 1e-12, 'con l occhio al centro il frustum è simmetrico');

  const off = frustumParams({ eye: { x: 0.03, y: 0.02, z: VIEW_DISTANCE }, halfWidth, halfHeight, near: 0.01 });
  assert.ok(asymmetry(off) > 0.2, 'spostando l occhio il frustum deve diventare asimmetrico');
  assert.ok(off.left !== -off.right);
  assert.ok(off.bottom !== -off.top);

  // la vista è una traslazione pura: il blocco di rotazione resta l'identità
  const view = translationView({ x: 0.03, y: -0.02, z: 0.35 });
  const rot = [view[0], view[1], view[2], view[4], view[5], view[6], view[8], view[9], view[10]];
  assert.deepEqual([...rot], [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  assert.ok(Math.abs(view[12] + 0.03) < 1e-6);
  assert.ok(Math.abs(view[13] - 0.02) < 1e-6);
  assert.ok(Math.abs(view[14] + 0.35) < 1e-6);

  const proj = offAxisProjection({ eye: { x: 0.03, y: 0, z: 0.35 }, halfWidth, halfHeight });
  assert.ok(Math.abs(proj[8]) > 1e-6, 'la proiezione deve portare il termine fuori asse');
});

test('l occhio stimato dal giroscopio satura a dodici gradi', () => {
  const dritto = eyeFromOrientation({ beta: 0, gamma: 0 });
  assert.ok(Math.abs(dritto.x) < 1e-12);
  assert.ok(Math.abs(dritto.z - VIEW_DISTANCE) < 1e-12);

  const destra = eyeFromOrientation({ beta: 0, gamma: 10 });
  assert.ok(destra.x > 0, 'inclinando a destra l occhio si sposta a destra');
  const oltre = eyeFromOrientation({ beta: 0, gamma: 80 });
  const limite = eyeFromOrientation({ beta: 0, gamma: MAX_TILT_DEG });
  assert.ok(Math.abs(oltre.x - limite.x) < 1e-12, 'oltre la saturazione non si va');

  const su = eyeFromOrientation({ beta: 10, beta0: 0, gamma: 0 });
  assert.ok(su.y < 0, 'e la parallasse verticale c è, non solo quella orizzontale');
});

test('il passa-basso smorza il rumore del sensore', () => {
  const lp = makeLowPass(6, 0);
  let v = 0;
  for (let i = 0; i < 60; i++) v = lp.update(10, 1 / 60);
  assert.ok(v > 9 && v <= 10, 'in un secondo arriva a regime');
  const lp2 = makeLowPass(6, 0);
  const first = lp2.update(10, 1 / 60);
  assert.ok(first < 5, 'ma in un fotogramma non salta');
});

test('con il movimento ridotto ogni enigma resta risolvibile', () => {
  const box = createSealedBoxPuzzle({});
  const rings = createRingsPuzzle({});
  const hand = createHandPuzzle({});
  for (const p of [box, rings, hand]) {
    assert.equal(p.state.requiresMotionCue, false, `${p.state.id} non deve dipendere dal movimento`);
    assert.equal(p.solvable(), true, `${p.state.id} deve restare risolvibile`);
  }
});

test('la mano si specchia solo passando per un piano che contiene w', () => {
  const dritta = chiralityOf(identity());
  assert.equal(chiralityOf(planeRotation(0, 1, Math.PI)), dritta, 'una rotazione in xy non specchia');
  assert.equal(chiralityOf(planeRotation(1, 2, 1.3)), dritta, 'nemmeno una in yz');
  assert.equal(chiralityOf(planeRotation(0, 3, Math.PI)), -dritta, 'mezzo giro in xw sì');
});

test('i criteri degli esperimenti sono dichiarati, e sanno dire di no', () => {
  assert.equal(DEPTH_ORDERING_CRITERION.trialsPerCondition, 20);
  assert.equal(DEPTH_ORDERING_CRITERION.participants, 10);
  const buono = evaluateDepthOrdering({ staticView: 60, wiggle: 80, headCoupled: 88 });
  assert.equal(buono.passes, true);
  const scarso = evaluateDepthOrdering({ staticView: 60, wiggle: 70, headCoupled: 90 });
  assert.equal(scarso.passes, false);
  const alRovescio = evaluateDepthOrdering({ staticView: 60, wiggle: 80, headCoupled: 74 });
  assert.equal(alRovescio.passes, false);

  assert.equal(evaluateStability(0, 60).passes, true);
  assert.equal(evaluateStability(6, 60).passes, false);
});
