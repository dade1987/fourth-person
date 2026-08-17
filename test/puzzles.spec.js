// Le regole del gioco, verificate senza aprire un browser.
//
// Ogni enigma è una macchina a stati con un contratto preciso: cosa si può fare,
// quando, e perché no. Se un giorno toccare la chiave tornasse a non fare niente,
// è qui che il progetto se ne accorge — non su un telefono, tre settimane dopo.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSealedBoxPuzzle, SLICE_TOLERANCE, GRAB_RADIUS } from '../src/game/puzzles/sealedbox.js';
import { createRingsPuzzle } from '../src/game/puzzles/rings.js';
import { createHandPuzzle, chiralityOf } from '../src/game/puzzles/hand.js';
import { anyBoxHit } from '../src/math4d/collide.js';
import { identity, planeRotation, mul } from '../src/math4d/rotor.js';

const at = (x, y, z, w) => new Float64Array([x, y, z, w]);

test('cassa: restando nella fetta la parete ferma, uscendo no', () => {
  const p = createSealedBoxPuzzle({});
  const walls = p.blockers();
  assert.equal(walls.length, 6);
  assert.ok(anyBoxHit(walls, at(0, 0, 2, 0), at(0, 0, 0, 0)), 'dentro la fetta si sbatte');
  assert.ok(!anyBoxHit(walls, at(0, 0, 2, 0.5), at(0, 0, 0, 0.5)), 'fuori dalla fetta si passa');
  assert.equal(p.solvable(), true);
});

test('cassa: toccare la chiave dà sempre una risposta, e la risposta è il perché', () => {
  const p = createSealedBoxPuzzle({});
  const events = [];
  const emit = (type, payload) => events.push([type, payload.puzzle]);

  // da lontano, nella fetta: la cassa è chiusa
  assert.equal(p.canGrab(at(0, 0, 3, 0)), false);
  assert.equal(p.attemptGrab(at(0, 0, 3, 0), emit), 'blocked');
  // fuori dalla fetta non si afferra niente: là dentro non ci sei
  assert.equal(p.attemptGrab(at(0, 0, 0, 0.5), emit), 'outOfSlice');
  assert.equal(events.length, 0);

  // dentro la cassa, nella fetta: si prende
  assert.equal(p.canGrab(at(0, 0, 0, 0)), true);
  assert.equal(p.attemptGrab(at(0, 0, 0, 0), emit), 'grabbed');
  assert.deepEqual(events, [['grab', 'sealed-box']]);
  assert.equal(p.state.holding, true);
  // e una seconda volta non si prende due volte
  assert.equal(p.attemptGrab(at(0, 0, 0, 0), emit), 'holding');
});

test('cassa: si risolve solo portandola fuori, e solo tornando nella fetta', () => {
  const p = createSealedBoxPuzzle({});
  const events = [];
  const emit = (type, payload) => events.push(type);
  p.update(at(0, 0, 0, 0), emit); // ci cammini sopra: la prende da sola
  assert.equal(p.state.holding, true);

  // fuori dalla cassa ma fuori anche dalla fetta: non è finita
  p.update(at(3, 0, 0, 0.5), emit);
  assert.equal(p.state.solved, false);
  // dentro la fetta ma ancora dentro la cassa: nemmeno
  p.update(at(0, 0, 0, 0), emit);
  assert.equal(p.state.solved, false);
  // fuori e nella fetta: fatto
  p.update(at(3, 0, 0, 0), emit);
  assert.equal(p.state.solved, true);
  assert.ok(events.includes('solved'));

  // e da lì in poi non succede più niente
  const after = events.length;
  p.update(at(0, 0, 0, 0), emit);
  assert.equal(events.length, after);
});

test('cassa: le tolleranze sono quelle dichiarate', () => {
  const p = createSealedBoxPuzzle({});
  assert.ok(SLICE_TOLERANCE > 0 && SLICE_TOLERANCE < 0.2);
  assert.ok(GRAB_RADIUS > SLICE_TOLERANCE);
  assert.equal(p.inSlice(at(0, 0, 0, SLICE_TOLERANCE * 0.5)), true);
  assert.equal(p.inSlice(at(0, 0, 0, SLICE_TOLERANCE * 2)), false);
});

test('anelli: partono allacciati, e si separano solo passando per w', () => {
  const p = createRingsPuzzle({});
  assert.equal(p.solvable(), true);
  const events = [];
  const emit = (type) => events.push(type);

  // lontano: non si prende
  p.update(at(9, 0, 0, 0), emit);
  assert.equal(p.state.holding, false);
  // vicino all'anello mobile: si prende
  p.update(new Float64Array(p.positionB), emit);
  assert.equal(p.state.holding, true);
  assert.ok(events.includes('grab'));

  // spostarlo restando allacciato non basta
  for (let i = 0; i < 12; i++) p.update(at(0.2, 0.1, 0, 0), emit);
  assert.equal(p.state.solved, false);

  // portarlo via passando fuori dalla fetta, e riappoggiarlo: sciolti
  for (let i = 0; i < 12; i++) p.update(at(6, 0.1, 0, 0.8), emit);
  for (let i = 0; i < 12; i++) p.update(at(6, 0.1, 0, 0), emit);
  assert.equal(p.state.solved, true);
  assert.ok(Math.abs(p.state.linking) < 0.3, `allacciamento finale ${p.state.linking}`);
});

test('mano: la chiralità si ribalta solo in un piano che contiene w', () => {
  const p = createHandPuzzle({});
  assert.equal(p.state.lockRequires, -1);
  assert.equal(p.state.solved, false);

  // girarla quanto si vuole dentro la fetta non serve a niente
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
    p.rotate(i, j, Math.PI);
    assert.equal(p.state.chirality, 1, `il piano ${i}${j} non deve specchiare`);
  }
  p.transform.rotation = identity();

  // mezzo giro in xw sì
  p.rotate(0, 3, Math.PI);
  assert.equal(p.state.chirality, -1);
  const events = [];
  p.update(new Float64Array(4), (type) => events.push(type));
  assert.equal(p.state.solved, true);
  assert.ok(events.includes('solved'));
  assert.equal(p.solvable(), true);
});

test('mano: fuori dalla fetta la serratura non si chiude', () => {
  const p = createHandPuzzle({});
  p.rotate(0, 3, Math.PI);
  p.transform.position[3] = 0.5; // l'oggetto è fuori dalla fetta
  p.update(new Float64Array(4), () => {});
  assert.equal(p.state.solved, false);
  p.transform.position[3] = 0;
  p.update(new Float64Array(4), () => {});
  assert.equal(p.state.solved, true);
});

test('mano: due specchiature tornano al punto di partenza', () => {
  const twice = mul(planeRotation(0, 3, Math.PI), planeRotation(1, 3, Math.PI));
  assert.equal(chiralityOf(twice), chiralityOf(identity()));
});
