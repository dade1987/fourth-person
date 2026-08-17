// world.js — la stanza, il giocatore, gli oggetti.
//
// Il giocatore NON guarda un tesseratto che gira: abita uno spazio a quattro
// dimensioni, e ha dieci gradi di libertà (SPEC §4.4, §18). La camera 4D è lui.

import { polytope, buildMesh } from '../math4d/polytope.js';
import { moveWithCollision } from '../math4d/collide.js';
import { makeCamera4, setPlayerW, rotateCamera, makeTransform4, rotateTransform, W_DISTANCE } from '../render/project.js';
import { planeRotation } from '../math4d/rotor.js';
import { makeSliceMode, updateSlice, setMode, toggle as toggleSlice, currentName } from '../render/slice.js';
import { PLANE_NAMES } from '../math4d/bivector.js';
import * as shapes from './shapes.js';
import { createInhabitants, updateInhabitants, startle } from './npc.js';
import { createSealedBoxPuzzle } from './puzzles/sealedbox.js';
import { createRingsPuzzle } from './puzzles/rings.js';
import { createHandPuzzle } from './puzzles/hand.js';

export const SCALE_3D = 0.028; // metri per unità del volume-retina
export const OFFSET_3D = [0, 0.012, -0.125];
export const FLOOR_Y = -0.050;

const TINTS = {
  tesseract: [0.55, 0.78, 1.0],
  sixteen: [1.0, 0.72, 0.45],
  twentyfour: [0.72, 1.0, 0.78],
  box: [0.70, 0.86, 0.95],
  key: [1.0, 0.82, 0.42],
  ring: [0.92, 0.76, 0.45],
  hand: [0.94, 0.78, 0.64],
  lock: [0.62, 0.68, 0.80],
  npc: [0.66, 0.72, 0.86],
  cube: [0.62, 0.82, 1.0],
  mug: [0.95, 0.93, 0.88],
  padlock: [0.78, 0.82, 0.90],
  shackle: [0.88, 0.90, 0.96],
};

const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** Quanta della crescita dovuta a w si compensa. 0 = matematica pura e scena
 *  che esce dallo schermo; 1 = nessun indizio di distanza in w. A 0,6 la
 *  nidificazione e la parallasse restano tutte, e il mondo non si perde. */
const W_SCALE_COMPENSATION = 0.6;

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
    // 1,6 volte il raggio unitario: più estensione in w = nidificazione più marcata
    const s = scale ?? 1.6 / poly.circumradius;
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
      cellHue: 1, // sui politopi le otto celle devono distinguersi tutte
      // i bordi accesi sopra il vetro: è quello che rende leggibile "cubo dentro cubo"
      wireOverlay: true,
      wireTint: [1.0, 0.98, 0.92],
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
    coldopen: { scale3: 0.034, offset3: [0, 0.014, -0.112], floorY: -0.058, shadowRadius: 0.20 },
    oggetti: { scale3: 0.062, offset3: [0, 0.010, -0.100], floorY: -0.062, shadowRadius: 0.22 },
    cube: { scale3: 0.060, offset3: [0, 0.020, -0.058], floorY: -0.085, shadowRadius: 0.22 },
    box: { scale3: 0.030, offset3: [0, 0.014, -0.140], floorY: -0.044, shadowRadius: 0.20 },
    room: { scale3: 0.030, offset3: [0, 0.014, -0.140], floorY: -0.044, shadowRadius: 0.20 },
  };

  /**
   * Allontanandosi nella fetta il divisore della proiezione cambia e tutto si
   * gonfia: corretto, e ingiocabile. Qui se ne compensa una parte, uguale per
   * ogni oggetto — quindi i rapporti fra le cose, che sono il contenuto, non
   * cambiano di una virgola.
   */
  const wCompensation = () => {
    const pw = W_DISTANCE - world.player[3];
    const raw = W_DISTANCE / Math.max(pw, 0.4);
    const corrected = 1 + (raw - 1) * (1 - W_SCALE_COMPENSATION);
    return corrected / raw;
  };

  const world = {
    camera,
    sliceMode,
    time: 0,
    stage: 'coldopen',
    view: DEFAULT_VIEW,
    /** L'entrata in scena: 0,7 s in cui tutto si posa invece di comparire. */
    enter: 1,
    geometry: 'glass', // glass | solid | wire
    player: new Float64Array([0, 0, 2.4, 0]),
    objects: [],
    blockers: [],
    inhabitants: [],
    puzzles: {},
    listeners: [],
    autoSpin: { xw: 0.30, zw: 0.18, xy: 0 },
    lastW: 0,
    /** Coreografie scritte a mano: il rallentatore sta dentro la curva del tempo. */
    padlockAnim: null,
    mirrorAnim: null,
    showcase: 'mug',
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
      world.enter = 0;
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
          world.player.set([0, 0, 2.6, 0]);
          camera.position[2] = 2.6;
          if (name === 'room') {
            const rings = createRingsPuzzle({ center: [-1.7, 0.05, -0.5] });
            world.puzzles.rings = rings;
            const rA = shapeObject('ringA', () => shapes.ringMesh({ radius: rings.radius, tube: 0.11, plane: 'xy' }), TINTS.ring, { glass: 0 });
            const rB = shapeObject('ringB', () => shapes.ringMesh({ radius: rings.radius, tube: 0.11, plane: 'xz' }), TINTS.ring, { glass: 0 });
            rA.role = 'ringA';
            rB.role = 'ringB';
            rA.transform.position.set(rings.positionA);
            rB.transform.position.set(rings.positionB);
            world.objects.push(rA, rB);

            const hand = createHandPuzzle({ position: [1.7, 0.05, -0.5] });
            world.puzzles.hand = hand;
            const hMesh = shapeObject('hand', () => shapes.handMesh(1), TINTS.hand, { glass: 0 });
            hMesh.role = 'hand';
            hMesh.transform = hand.transform;
            const lock = shapeObject('lock', () => shapes.handMesh(-1), TINTS.lock, { glass: 1, opacity: 0.5 });
            lock.role = 'lock';
            lock.transform.position.set([1.7, 0.05, -1.5, 0]);
            // il fantasma della forma di partenza: compare solo dopo il mezzo giro,
            // e lascia che sia il giocatore ad accorgersene
            const ghost = shapeObject('handGhost', () => shapes.handMesh(1), TINTS.hand, { glass: 1, opacity: 0 });
            ghost.role = 'handGhost';
            ghost.transform.position.set([0.9, 0.05, -0.5, 0]);
            world.objects.push(hMesh, lock, ghost);
          }
          break;
        }
        case 'oggetti': {
          const mug = shapeObject('mug', () => shapes.mugMesh(), TINTS.mug, { glass: 1, cellHue: 1 });
          mug.role = 'showcase';
          mug.showcase = 'mug';
          const body = shapeObject('padlockBody', () => shapes.padlockBodyMesh(), TINTS.padlock, { glass: 0 });
          body.role = 'padlockBody';
          body.showcase = 'lucchetto';
          const shackle = shapeObject('shackle', () => shapes.shackleMesh(), TINTS.shackle, { glass: 0 });
          shackle.role = 'shackle';
          shackle.showcase = 'lucchetto';
          world.objects.push(mug, body, shackle);
          world.setShowcase(world.showcase);
          break;
        }
        default:
          break;
      }
      world.emit('stage', { stage: name });
    },

    /** Quale oggetto di casa è in vetrina. */
    setShowcase(name) {
      world.showcase = name;
      world.padlockAnim = null;
      for (const o of world.objects) {
        if (!o.showcase) continue;
        o.opacity = o.showcase === name ? 1 : 0;
        if (o.showcase === name) o.transform.position.set([0, 0, 0, 0]);
      }
      world.emit('showcase', { name });
    },

    nextShowcase() {
      const order = ['mug', 'lucchetto'];
      const i = (order.indexOf(world.showcase) + 1) % order.length;
      world.setShowcase(order[i]);
      return order[i];
    },

    /**
     * Il lucchetto si apre senza rompersi: l'archetto esce dalla fetta, passa
     * attraverso il corpo e riscende accanto. Rallentatore al 40% nel passaggio
     * critico — è l'unica volta in cui si tocca il tempo, e per questo funziona.
     */
    playPadlock() {
      if (world.showcase !== 'lucchetto' || world.padlockAnim) return false;
      world.padlockAnim = { t: 0 };
      world.emit('padlock', { phase: 'start' });
      return true;
    },

    /** Mezzo giro in xw, mostrato per intero e lento: la mano torna specchiata. */
    playMirror() {
      if (world.mirrorAnim) return false;
      world.mirrorAnim = { t: 0 };
      world.emit('mirror', { phase: 'start' });
      return true;
    },

    /** Un fotogramma di mondo. */
    update(dt, input = {}) {
      world.time += dt;
      world.enter = Math.min(1, world.enter + dt / 0.7);

      // ---- coreografia del lucchetto (SPEC §6: rallentatore nel passaggio critico)
      if (world.padlockAnim) {
        const a = world.padlockAnim;
        a.t += dt / 2.6;
        const k = Math.min(1, a.t);
        const p1 = Math.min(1, Math.max(0, k * 3.2));
        // il passaggio attraverso il corpo scorre al 40%: dura più di tutto il resto
        const p2raw = Math.min(1, Math.max(0, (k - 0.34) / 0.40));
        const p2 = p2raw * p2raw * (3 - 2 * p2raw);
        const p3 = Math.min(1, Math.max(0, (k - 0.78) / 0.22));
        const shackle = world.objects.find((o) => o.role === 'shackle');
        if (shackle) {
          shackle.transform.position[0] = 0.95 * p2;
          shackle.transform.position[3] = 0.62 * (p1 - p3);
        }
        if (k >= 1) {
          world.padlockAnim = null;
          world.emit('padlock', { phase: 'done' });
        }
      }

      // ---- il ritorno specchiato: 1,8 s, per intero, mai tagliato
      if (world.mirrorAnim) {
        const a = world.mirrorAnim;
        a.t += dt / 1.8;
        const k = Math.min(1, a.t);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const hand = world.objects.find((o) => o.role === 'hand');
        if (hand) hand.transform.rotation = planeRotation(0, 3, Math.PI * e);
        if (k >= 1) {
          world.mirrorAnim = null;
          const ghost = world.objects.find((o) => o.role === 'handGhost');
          if (ghost) ghost.opacity = 0.32; // il confronto, senza una parola sopra
          world.emit('mirror', { phase: 'done' });
        }
      }

      // rotazione automatica: solo dove serve (cold open, capitolo finale)
      const obj = world.objects.find((o) => o.role === 'polytope' || o.role === 'cube' || o.role === 'showcase');
      if (obj && obj.role === 'polytope') {
        if (world.autoSpin.xw) rotateTransform(obj.transform, PLANE_NAMES.indexOf('xw'), world.autoSpin.xw * dt);
        if (world.autoSpin.zw) rotateTransform(obj.transform, PLANE_NAMES.indexOf('zw'), world.autoSpin.zw * dt);
        if (world.autoSpin.xy) rotateTransform(obj.transform, PLANE_NAMES.indexOf('xy'), world.autoSpin.xy * dt);
      }

      // sguardo: si ruota in un piano, mai attorno a un asse
      if (input.look && (input.look.x || input.look.y)) {
        if (input.wMode) {
          rotateCamera(camera, PLANE_NAMES.indexOf('xw'), input.look.x * dt * 0.65);
          rotateCamera(camera, PLANE_NAMES.indexOf('yw'), -input.look.y * dt * 0.65);
        } else {
          rotateCamera(camera, PLANE_NAMES.indexOf('xz'), input.look.x * dt * 0.85);
          rotateCamera(camera, PLANE_NAMES.indexOf('yz'), -input.look.y * dt * 0.7);
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
      const speed = 0.85;
      if (move.x || move.y) {
        const R = camera.orientation;
        const right = [R[0], R[4], R[8], R[12]];
        const fwd = [R[2], R[6], R[10], R[14]];
        const target = Float64Array.from(world.player);
        // `fwd` è l'asse +z della camera, che punta VERSO di te: avanti è −fwd.
        // Il dito verso l'alto dà move.y = −1, quindi il segno giusto è +fwd·move.y.
        for (let i = 0; i < 4; i++) {
          target[i] += (right[i] * move.x + fwd[i] * move.y) * speed * dt;
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
      if (key && world.puzzles.box) {
        key.transform.position.set(world.puzzles.box.keyPosition);
        // respira piano quando è a portata: 0,6 Hz, ben sotto la soglia WCAG
        const near = world.puzzles.box.canGrab(world.player);
        const k = near ? 0.5 + 0.5 * Math.sin(world.time * 2 * Math.PI * 0.6) : 0;
        key.tint = [
          Math.min(1, TINTS.key[0] * (1 + 0.55 * k)),
          Math.min(1, TINTS.key[1] * (1 + 0.55 * k)),
          Math.min(1, TINTS.key[2] * (1 + 1.6 * k)),
        ];
        key.reachable = near;
      }
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
        // la scena entra avvicinandosi appena: cubic-bezier, mai lineare
        scale3: world.view.scale3 * (0.90 + 0.10 * easeOut(world.enter)) * wCompensation(),
        offset3: world.view.offset3,
        floorY: world.view.floorY,
        shadowRadius: world.view.shadowRadius,
        background: [0.040, 0.043, 0.055],
        fogColor: [0.040, 0.043, 0.055],
        fogDensity: 0.42,
        floorFogDensity: 1.6,
        shadows: true,
        // la stanza degli abitanti sta dentro un ambiente vero (finto, per ora)
        backdrop: world.stage === 'room' || world.stage === 'box',
        backdropDim: 1.12,
        bloom: true,
        bloomStrength: 0.9,
        time: world.time,
      };
    },
  };

  return world;
}

export { W_DISTANCE };
