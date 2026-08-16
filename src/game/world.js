// world.js — la stanza, il giocatore, gli oggetti.
//
// Il giocatore NON guarda un tesseratto che gira: abita uno spazio a quattro
// dimensioni, e ha dieci gradi di libertà (SPEC §4.4, §18). La camera 4D è lui.

import { polytope, buildMesh } from '../math4d/polytope.js';
import { moveWithCollision } from '../math4d/collide.js';
import { makeCamera4, setPlayerW, rotateCamera, makeTransform4, rotateTransform, W_DISTANCE } from '../render/project.js';
import { makeSliceMode, updateSlice, setMode, toggle as toggleSlice, currentName } from '../render/slice.js';
import { PLANE_NAMES } from '../math4d/bivector.js';
import * as shapes from './shapes.js';
import { createInhabitants, updateInhabitants, startle } from './npc.js';
import { createSealedBoxPuzzle } from './puzzles/sealedbox.js';
import { createRingsPuzzle } from './puzzles/rings.js';
import { createHandPuzzle } from './puzzles/hand.js';

export const SCALE_3D = 0.044; // metri per unità del volume-retina
export const OFFSET_3D = [0, 0.012, -0.125];
export const FLOOR_Y = -0.050;

const TINTS = {
  tesseract: [0.55, 0.78, 1.0],
  sixteen: [1.0, 0.72, 0.45],
  twentyfour: [0.72, 1.0, 0.78],
  box: [0.85, 0.86, 0.92],
  key: [1.0, 0.86, 0.35],
  ring: [0.95, 0.55, 0.75],
  hand: [0.98, 0.80, 0.66],
  lock: [0.60, 0.64, 0.75],
  npc: [0.70, 0.74, 0.85],
  cube: [0.62, 0.82, 1.0],
};

export function createWorld(renderer) {
  const meshCache = new Map();

  function gpuFor(key, make) {
    if (!meshCache.has(key)) {
      const mesh = make();
      meshCache.set(key, { gpu: renderer.upload(mesh), cells: mesh.cells || null, mesh });
    }
    return meshCache.get(key);
  }

  function polytopeObject(name, tint, { scale = null } = {}) {
    const poly = polytope(name);
    const s = scale ?? 1 / poly.circumradius;
    const entry = gpuFor(`poly:${name}:${s}`, () => {
      const mesh = buildMesh(poly, { scale: s });
      mesh.cells = poly.cells.map((c) => ({
        centroid4: new Float64Array([c.centroid[0] * s, c.centroid[1] * s, c.centroid[2] * s, c.centroid[3] * s]),
        normal: c.normal,
      }));
      return mesh;
    });
    return {
      name,
      poly,
      scale: s,
      gpu: entry.gpu,
      cells: entry.cells,
      transform: makeTransform4(),
      tint,
      glass: 1,
      opacity: 1,
    };
  }

  function shapeObject(key, make, tint, options = {}) {
    const entry = gpuFor(key, make);
    return {
      name: key,
      gpu: entry.gpu,
      cells: entry.cells,
      transform: makeTransform4(),
      tint,
      glass: options.glass ?? 0,
      opacity: options.opacity ?? 1,
      ...options,
    };
  }

  const camera = makeCamera4();
  const sliceMode = makeSliceMode();

  // Ogni scena può avvicinare o allontanare il volume-retina dallo schermo.
  // Non è vezzo: la prospettiva di un telefono è debole, e il capitolo 1 parla
  // proprio di quella. Là l'oggetto sta più vicino al vetro, e le facce si aprono.
  const DEFAULT_VIEW = { scale3: SCALE_3D, offset3: OFFSET_3D, floorY: FLOOR_Y, shadowRadius: 0.16 };
  const VIEWS = {
    coldopen: { scale3: 0.055, offset3: [0, 0.014, -0.112], floorY: -0.058, shadowRadius: 0.20 },
    cube: { scale3: 0.060, offset3: [0, 0.020, -0.058], floorY: -0.085, shadowRadius: 0.22 },
    box: { scale3: 0.038, offset3: [0, 0.012, -0.130], floorY: -0.050, shadowRadius: 0.20 },
    room: { scale3: 0.038, offset3: [0, 0.012, -0.130], floorY: -0.050, shadowRadius: 0.20 },
  };

  const world = {
    camera,
    sliceMode,
    time: 0,
    stage: 'coldopen',
    view: DEFAULT_VIEW,
    geometry: 'glass', // glass | solid | wire
    player: new Float64Array([0, 0, 2.4, 0]),
    objects: [],
    blockers: [],
    inhabitants: [],
    puzzles: {},
    listeners: [],
    autoSpin: { xw: 0.30, zw: 0.18, xy: 0 },
    lastW: 0,
    spinTarget: null,
    events: [],

    on(fn) {
      world.listeners.push(fn);
      return () => {
        const i = world.listeners.indexOf(fn);
        if (i >= 0) world.listeners.splice(i, 1);
      };
    },
    emit(type, payload = {}) {
      world.events.push({ type, ...payload });
      for (const fn of world.listeners) fn(type, payload);
    },

    setGeometry(mode) {
      world.geometry = mode;
      for (const o of world.objects) {
        if (o.role === 'polytope') {
          o.glass = mode === 'glass' ? 1 : 0;
          o.wire = mode === 'wire';
        }
      }
    },

    toggleSlice() {
      const t = toggleSlice(sliceMode);
      world.emit('slice', { target: t });
      return t;
    },
    setSlice(name) {
      setMode(sliceMode, name);
    },
    get sliceName() {
      return currentName(sliceMode);
    },

    /** Costruisce la scena giusta per il momento giusto. */
    setStage(name) {
      world.stage = name;
      world.view = VIEWS[name] || DEFAULT_VIEW;
      world.objects = [];
      world.blockers = [];
      world.inhabitants = [];
      world.puzzles = {};
      world.autoSpin = { xw: 0, zw: 0, xy: 0 };
      world.player.set([0, 0, 2.4, 0]);
      camera.orientation = makeCamera4().orientation;
      setPlayerW(camera, 0);
      camera.position[0] = 0;
      camera.position[1] = 0;
      camera.position[2] = 2.4;

      switch (name) {
        case 'coldopen': {
          const t = polytopeObject('tesseract', TINTS.tesseract);
          t.role = 'polytope';
          t.transform.position[2] = 0;
          world.objects.push(t);
          world.autoSpin = { xw: 0.34, zw: 0.21, xy: 0 };
          world.player.set([0, 0, 2.6, 0]);
          camera.position[2] = 2.6;
          break;
        }
        case 'cube': {
          const c = shapeObject('cube', () => shapes.boxMesh([0.7, 0.7, 0.7], 0.02), TINTS.cube, { glass: 0 });
          c.role = 'cube';
          world.objects.push(c);
          break;
        }
        case 'tesseract':
        case 'chapter3':
        case 'chapter4':
        case 'chapter5':
        case 'chapter7': {
          const t = polytopeObject('tesseract', TINTS.tesseract);
          t.role = 'polytope';
          world.objects.push(t);
          if (name === 'chapter7') world.autoSpin = { xw: 0.12, zw: 0.07, xy: 0 };
          break;
        }
        case 'sixteen': {
          const t = polytopeObject('16-cell', TINTS.sixteen);
          t.role = 'polytope';
          world.objects.push(t);
          break;
        }
        case 'twentyfour': {
          const t = polytopeObject('24-cell', TINTS.twentyfour);
          t.role = 'polytope';
          world.objects.push(t);
          break;
        }
        case 'box':
        case 'room': {
          const puzzle = createSealedBoxPuzzle({});
          world.puzzles.box = puzzle;
          const walls = shapeObject(
            'sealedbox',
            () => shapes.sealedBoxMesh(puzzle.half, 0.048),
            TINTS.box,
            { glass: 1, opacity: 0.9 }
          );
          walls.role = 'walls';
          const key = shapeObject('key', () => shapes.keyMesh(), TINTS.key, { glass: 0 });
          key.role = 'key';
          key.transform.position.set(puzzle.keyPosition);
          world.objects.push(walls, key);
          world.blockers = puzzle.blockers();
          world.inhabitants = createInhabitants(4, 2.0);
          const npcMesh = shapeObject('npc', () => shapes.inhabitantMesh(), TINTS.npc, { glass: 0 });
          world.npcTemplate = npcMesh;
          world.player.set([0, 0, 1.9, 0]);
          camera.position[2] = 1.9;
          if (name === 'room') {
            const rings = createRingsPuzzle({ center: [-2.2, 0.1, -1.0] });
            world.puzzles.rings = rings;
            const rA = shapeObject('ringA', () => shapes.ringMesh({ radius: rings.radius, tube: 0.11, plane: 'xy' }), TINTS.ring, { glass: 1 });
            const rB = shapeObject('ringB', () => shapes.ringMesh({ radius: rings.radius, tube: 0.11, plane: 'xz' }), TINTS.ring, { glass: 1 });
            rA.role = 'ringA';
            rB.role = 'ringB';
            rA.transform.position.set(rings.positionA);
            rB.transform.position.set(rings.positionB);
            world.objects.push(rA, rB);

            const hand = createHandPuzzle({ position: [2.4, 0.1, -1.0] });
            world.puzzles.hand = hand;
            const hMesh = shapeObject('hand', () => shapes.handMesh(1), TINTS.hand, { glass: 0 });
            hMesh.role = 'hand';
            hMesh.transform = hand.transform;
            const lock = shapeObject('lock', () => shapes.handMesh(-1), TINTS.lock, { glass: 1, opacity: 0.5 });
            lock.role = 'lock';
            lock.transform.position.set([2.4, 0.1, -2.2, 0]);
            world.objects.push(hMesh, lock);
          }
          break;
        }
        default:
          break;
      }
      world.emit('stage', { stage: name });
    },

    /** Un fotogramma di mondo. */
    update(dt, input = {}) {
      world.time += dt;

      // rotazione automatica: solo dove serve (cold open, capitolo finale)
      const obj = world.objects.find((o) => o.role === 'polytope' || o.role === 'cube');
      if (obj && obj.role === 'polytope') {
        if (world.autoSpin.xw) rotateTransform(obj.transform, PLANE_NAMES.indexOf('xw'), world.autoSpin.xw * dt);
        if (world.autoSpin.zw) rotateTransform(obj.transform, PLANE_NAMES.indexOf('zw'), world.autoSpin.zw * dt);
        if (world.autoSpin.xy) rotateTransform(obj.transform, PLANE_NAMES.indexOf('xy'), world.autoSpin.xy * dt);
      }

      // sguardo: si ruota in un piano, mai attorno a un asse
      if (input.look && (input.look.x || input.look.y)) {
        if (input.wMode) {
          rotateCamera(camera, PLANE_NAMES.indexOf('xw'), input.look.x * dt * 1.1);
          rotateCamera(camera, PLANE_NAMES.indexOf('yw'), -input.look.y * dt * 1.1);
        } else {
          rotateCamera(camera, PLANE_NAMES.indexOf('xz'), input.look.x * dt * 1.5);
          rotateCamera(camera, PLANE_NAMES.indexOf('yz'), -input.look.y * dt * 1.2);
        }
      }

      // trascinamento diretto dell'oggetto: potersi fermare a metà del
      // rovesciamento è la differenza fra guardare e capire (SPEC §6)
      if (input.dragObject && obj) {
        // trascinamento orizzontale e verticale: due piani, mai un asse
        const planeA = input.wMode ? 'xw' : 'xz';
        const planeB = input.wMode ? 'yw' : 'yz';
        rotateTransform(obj.transform, PLANE_NAMES.indexOf(planeA), input.dragObject.x);
        rotateTransform(obj.transform, PLANE_NAMES.indexOf(planeB), input.dragObject.y);
        world.dragAccum = (world.dragAccum || 0) + Math.abs(input.dragObject.x) + Math.abs(input.dragObject.y);
        if (input.wMode) world.dragAccumW = (world.dragAccumW || 0) + Math.abs(input.dragObject.x) + Math.abs(input.dragObject.y);
      }

      // traslazione: quattro direzioni, e la quarta è come le altre
      const move = input.move || { x: 0, y: 0 };
      const speed = 1.35;
      if (move.x || move.y) {
        const R = camera.orientation;
        const right = [R[0], R[4], R[8], R[12]];
        const fwd = [R[2], R[6], R[10], R[14]];
        const target = Float64Array.from(world.player);
        for (let i = 0; i < 4; i++) {
          target[i] += (right[i] * move.x - fwd[i] * move.y) * speed * dt;
        }
        target[1] = world.player[1];
        const next = world.blockers.length
          ? moveWithCollision(world.player, target, world.blockers, 0.12)
          : target;
        let blocked = false;
        for (let i = 0; i < 4; i++) if (Math.abs(next[i] - target[i]) > 1e-9) blocked = true;
        if (blocked) world.emit('bump', {});
        world.player.set(next);
      }

      if (typeof input.w === 'number') {
        const target = Float64Array.from(world.player);
        target[3] = input.w;
        const next = world.blockers.length
          ? moveWithCollision(world.player, target, world.blockers, 0.12)
          : target;
        world.player.set(next);
      }

      camera.position[0] = world.player[0];
      camera.position[1] = world.player[1];
      camera.position[2] = world.player[2];
      setPlayerW(camera, world.player[3]);

      if (Math.abs(world.player[3]) < 0.05 && Math.abs(world.lastW) >= 0.05) {
        startle(world.inhabitants, world.player);
        world.emit('reentry', { w: world.player[3] });
      }
      world.lastW = world.player[3];

      updateSlice(sliceMode, dt);
      updateInhabitants(world.inhabitants, dt);

      for (const p of Object.values(world.puzzles)) p.update(world.player, world.emit);

      const key = world.objects.find((o) => o.role === 'key');
      if (key && world.puzzles.box) key.transform.position.set(world.puzzles.box.keyPosition);
      const ringB = world.objects.find((o) => o.role === 'ringB');
      if (ringB && world.puzzles.rings) ringB.transform.position.set(world.puzzles.rings.positionB);
    },

    /** La descrizione della scena per il renderer. */
    scene() {
      const objects = world.objects.slice();
      if (world.npcTemplate) {
        for (const n of world.inhabitants) {
          objects.push({
            ...world.npcTemplate,
            transform: { rotation: world.npcTemplate.transform.rotation, position: n.position },
          });
        }
      }
      return {
        camera,
        sliceMode,
        objects,
        scale3: world.view.scale3,
        offset3: world.view.offset3,
        floorY: world.view.floorY,
        shadowRadius: world.view.shadowRadius,
        background: [0.040, 0.043, 0.055],
        fogColor: [0.040, 0.043, 0.055],
        fogDensity: 0.42,
        floorFogDensity: 1.6,
        shadows: true,
        time: world.time,
      };
    },
  };

  return world;
}

export { W_DISTANCE };
