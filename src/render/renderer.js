// renderer.js — mette insieme i tre stadi (SPEC §3).
//
// Stadio 1: dal mondo 4D al volume-retina   (project.js, nello shader di vertice)
// Stadio 2: dal volume allo schermo          (frustum fuori asse, headcoupled.js)
// Stadio 3: far sentire solido il volume     (vetro, ombra, olografia, oscillazione)
//
// Il terzo è quello che quasi tutti saltano, ottenendo un gioco corretto e illeggibile.

import {
  createContext, program, buffer, resize, mat4Identity, mat4Multiply, mat4Translate,
} from './gl.js';
import { GEOMETRY_VERTEX, GEOMETRY_FRAGMENT, DEPTH_FRAGMENT, WIRE_FRAGMENT } from './glass.js';
import {
  createShadowMap, beginShadowPass, endShadowPass, lightMatrix, LIGHT_DIR,
  FLOOR_VERTEX, FLOOR_FRAGMENT,
} from './shadow.js';
import { offAxisProjection, translationView } from './headcoupled.js';
import { createBackdrop } from './backdrop.js';
import { createBloom } from './bloom.js';
import { toFloat32, cameraMatrixT, NEAR_W } from './project.js';
import { windowWidth } from './slice.js';

export const QUALITY = { FULL: 2, NO_SHADOW: 1, PLAIN: 0 };

export function createRenderer(canvas) {
  const gl = createContext(canvas);
  const geom = program(gl, GEOMETRY_VERTEX, GEOMETRY_FRAGMENT);
  const depth = program(gl, GEOMETRY_VERTEX, DEPTH_FRAGMENT);
  const wire = program(gl, GEOMETRY_VERTEX, WIRE_FRAGMENT);
  const floor = program(gl, FLOOR_VERTEX, FLOOR_FRAGMENT);
  const shadow = createShadowMap(gl);
  const backdrop = createBackdrop(gl);
  const bloom = createBloom(gl);
  const floorQuad = buffer(gl, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));

  const state = {
    quality: QUALITY.FULL,
    frameMs: 16,
    slowFrames: 0,
    triangles: 0,
    drawCalls: 0,
    frames: 0,
  };

  function upload(mesh) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const pos = buffer(gl, mesh.position);
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    const cc = buffer(gl, mesh.cellCenter);
    gl.bindBuffer(gl.ARRAY_BUFFER, cc);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
    const ci = buffer(gl, mesh.cellId);
    gl.bindBuffer(gl.ARRAY_BUFFER, ci);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

    let wireVao = null;
    let wireVerts = 0;
    if (mesh.wirePosition && mesh.wirePosition.length) {
      wireVao = gl.createVertexArray();
      gl.bindVertexArray(wireVao);
      const wp = buffer(gl, mesh.wirePosition);
      gl.bindBuffer(gl.ARRAY_BUFFER, wp);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, wp);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(2);
      gl.vertexAttrib1f(2, 0);
      wireVerts = mesh.wirePosition.length / 4;
    }
    gl.bindVertexArray(null);

    return {
      vao,
      wireVao,
      wireVerts,
      vertexCount: mesh.position.length / 4,
      cellRanges: mesh.cellRanges || [{ cell: 0, start: 0, count: mesh.position.length / 4 }],
      triangleCount: mesh.triangleCount,
    };
  }

  function setCommon(prog, ctx) {
    prog.use();
    gl.uniformMatrix4fv(prog.u.uCamRT, true, toFloat32(cameraMatrixT(ctx.camera)));
    gl.uniform4f(prog.u.uCamC, ...ctx.camera.position);
    gl.uniform1f(prog.u.uFocal, ctx.camera.focal);
    gl.uniform1f(prog.u.uNearW, NEAR_W);
    gl.uniform1f(prog.u.uScale3, ctx.scale3);
    gl.uniform3f(prog.u.uOffset3, ...ctx.offset3);
    gl.uniform1f(prog.u.uSliceCenter, ctx.sliceCenter);
    gl.uniform1f(prog.u.uWindow, ctx.window);
  }

  function drawObject(prog, obj, ctx, { sortedCells = null } = {}) {
    gl.uniformMatrix4fv(prog.u.uObjR, true, toFloat32(obj.transform.rotation));
    gl.uniform4f(prog.u.uObjT, ...obj.transform.position);
    if (prog.u.uTint) gl.uniform3f(prog.u.uTint, ...obj.tint);
    if (prog.u.uOpacity) gl.uniform1f(prog.u.uOpacity, obj.opacity ?? 1);
    if (prog.u.uGlass) gl.uniform1f(prog.u.uGlass, obj.glass ?? 1);
    if (prog.u.uCellHue) gl.uniform1f(prog.u.uCellHue, obj.cellHue ?? 0);
    gl.bindVertexArray(obj.gpu.vao);
    const ranges = sortedCells || obj.gpu.cellRanges;
    for (const r of ranges) {
      if (obj.hiddenCells && obj.hiddenCells.has(r.cell)) continue;
      gl.drawArrays(gl.TRIANGLES, r.start, r.count);
      state.drawCalls++;
      state.triangles += r.count / 3;
    }
  }

  /** Profondità della cella nello spazio schermo: serve a disegnare dal fondo. */
  function cellDepth(obj, cell, ctx) {
    const c = cell.centroid4;
    const t = obj.transform;
    const world = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) {
      world[r] =
        t.rotation[r * 4] * c[0] + t.rotation[r * 4 + 1] * c[1] +
        t.rotation[r * 4 + 2] * c[2] + t.rotation[r * 4 + 3] * c[3] + t.position[r];
    }
    const cam = ctx.camera;
    const d = [world[0] - cam.position[0], world[1] - cam.position[1], world[2] - cam.position[2], world[3] - cam.position[3]];
    const R = cam.orientation;
    const p = [0, 0, 0, 0];
    for (let c2 = 0; c2 < 4; c2++) {
      p[c2] = R[c2] * d[0] + R[4 + c2] * d[1] + R[8 + c2] * d[2] + R[12 + c2] * d[3];
    }
    const w = Math.max(p[3], NEAR_W);
    return ctx.scale3 * ((cam.focal * p[2]) / w) + ctx.offset3[2];
  }

  function render(scene, view) {
    const t0 = performance.now();
    const { width, height } = resize(gl, canvas);
    const eye = view.eye;
    const proj = offAxisProjection({
      eye,
      halfWidth: view.halfWidth,
      halfHeight: view.halfHeight,
      near: 0.008,
      far: 12,
    });
    const viewM = translationView(eye);
    state.lastProj = proj;
    state.lastView = viewM;

    const ctx = {
      camera: scene.camera,
      scale3: scene.scale3,
      offset3: scene.offset3,
      sliceCenter: scene.sliceMode.center,
      window: windowWidth(scene.sliceMode),
    };

    state.triangles = 0;
    state.drawCalls = 0;

    // ---- passata dell'ombra: l'ombra dell'ombra è vera, non dipinta
    const useShadow = state.quality >= QUALITY.FULL && scene.shadows !== false;
    const lm = lightMatrix(scene.offset3, scene.shadowRadius || 0.16);
    if (useShadow) {
      beginShadowPass(gl, shadow);
      setCommon(depth, ctx);
      gl.uniformMatrix4fv(depth.u.uProj, false, lm);
      gl.uniformMatrix4fv(depth.u.uView, false, mat4Identity());
      for (const obj of scene.objects) {
        if (obj.wire || obj.castsShadow === false || (obj.opacity ?? 1) < 0.05) continue;
        drawObject(depth, obj, ctx);
      }
      endShadowPass(gl, width, height);
    }

    // ---- scena (dentro il bagliore, se il fotogramma se lo può permettere)
    const useBloom = state.quality >= QUALITY.FULL && scene.bloom !== false;
    if (useBloom) bloom.begin(width, height);
    gl.clearColor(scene.background[0], scene.background[1], scene.background[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (scene.backdrop) backdrop.draw(eye, { dim: scene.backdropDim ?? 1 });
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    if (scene.floor !== false) {
      floor.use();
      gl.uniformMatrix4fv(floor.u.uProj, false, proj);
      gl.uniformMatrix4fv(floor.u.uView, false, viewM);
      gl.uniform3f(floor.u.uCenter, scene.offset3[0], scene.floorY, scene.offset3[2]);
      gl.uniform1f(floor.u.uExtent, 1.8);
      gl.uniformMatrix4fv(floor.u.uLightMatrix, false, lm);
      gl.uniform3f(floor.u.uEye3, eye.x, eye.y, eye.z);
      gl.uniform3f(floor.u.uObjectCenter, ...scene.offset3);
      gl.uniform1f(floor.u.uObjectRadius, scene.shadowRadius || 0.16);
      gl.uniform1f(floor.u.uFogDensity, scene.floorFogDensity ?? scene.fogDensity * 3);
      gl.uniform3f(floor.u.uFogColor, ...scene.fogColor);
      gl.uniform1f(floor.u.uGridScale, 22);
      const shadowOnly = scene.backdrop && backdrop.usingPhoto;
      gl.uniform1f(floor.u.uShadowOnly, shadowOnly ? 1 : 0);
      if (shadowOnly) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, useShadow ? shadow.texture : shadow.texture);
      gl.uniform1i(floor.u.uShadow, 0);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, floorQuad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      state.drawCalls++;
      if (shadowOnly) {
        gl.disable(gl.BLEND);
        gl.depthMask(true);
      }
    }

    // ---- geometria: vetro, dal fondo verso di noi, senza scrivere la profondità
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    setCommon(geom, ctx);
    gl.uniformMatrix4fv(geom.u.uProj, false, proj);
    gl.uniformMatrix4fv(geom.u.uView, false, viewM);
    gl.uniform3f(geom.u.uEye3, eye.x, eye.y, eye.z);
    gl.uniform3f(geom.u.uLightDir, ...LIGHT_DIR);
    gl.uniform2f(geom.u.uTilt, view.tilt?.x || 0, view.tilt?.y || 0);
    gl.uniform1f(geom.u.uTime, scene.time || 0);
    gl.uniform1f(geom.u.uFogDensity, scene.fogDensity);
    gl.uniform3f(geom.u.uFogColor, ...scene.fogColor);

    const drawList = [];
    for (const obj of scene.objects) {
      if (obj.wire) continue;
      if ((obj.opacity ?? 1) < 0.01) continue;
      for (const r of obj.gpu.cellRanges) {
        if (obj.hiddenCells && obj.hiddenCells.has(r.cell)) continue;
        const cell = obj.cells?.[r.cell];
        drawList.push({ obj, range: r, z: cell ? cellDepth(obj, cell, ctx) : -1 });
      }
    }
    drawList.sort((a, b) => a.z - b.z);
    let current = null;
    for (const item of drawList) {
      if (item.obj !== current) {
        current = item.obj;
        gl.uniformMatrix4fv(geom.u.uObjR, true, toFloat32(current.transform.rotation));
        gl.uniform4f(geom.u.uObjT, ...current.transform.position);
        gl.uniform3f(geom.u.uTint, ...current.tint);
        gl.uniform1f(geom.u.uOpacity, current.opacity ?? 1);
        gl.uniform1f(geom.u.uGlass, state.quality === QUALITY.PLAIN ? 0 : current.glass ?? 1);
        gl.uniform1f(geom.u.uCellHue, current.cellHue ?? 0);
        gl.bindVertexArray(current.gpu.vao);
      }
      gl.drawArrays(gl.TRIANGLES, item.range.start, item.range.count);
      state.drawCalls++;
      state.triangles += item.range.count / 3;
    }

    // ---- spigoli sopra il vetro: senza, "otto cubi" restano una scatola.
    // Non è geometria a fili (quella sarebbe ambigua): è il vetro, più i suoi bordi.
    const wires = scene.objects.filter((o) => (o.wire || o.wireOverlay) && o.gpu.wireVao);
    if (wires.length) {
      setCommon(wire, ctx);
      gl.uniformMatrix4fv(wire.u.uProj, false, proj);
      gl.uniformMatrix4fv(wire.u.uView, false, viewM);
      for (const obj of wires) {
        gl.uniformMatrix4fv(wire.u.uObjR, true, toFloat32(obj.transform.rotation));
        gl.uniform4f(wire.u.uObjT, ...obj.transform.position);
        gl.uniform3f(wire.u.uTint, ...(obj.wireTint || obj.tint));
        gl.uniform1f(wire.u.uOpacity, (obj.opacity ?? 1) * (obj.wireOverlay ? 0.95 : 1));
        gl.bindVertexArray(obj.gpu.wireVao);
        gl.drawArrays(gl.LINES, 0, obj.gpu.wireVerts);
        state.drawCalls++;
      }
    }

    gl.bindVertexArray(null);
    gl.depthMask(true);
    if (useBloom) bloom.end({ strength: scene.bloomStrength ?? 0.85 });

    // ---- budget: se si scende sotto i 55 fps si salta l'EFFETTO, non la risoluzione
    state.frames++;
    const ms = performance.now() - t0;
    state.frameMs += (ms - state.frameMs) * 0.1;
    if (state.frameMs > 18) {
      state.slowFrames++;
      if (state.slowFrames > 60 && state.quality > QUALITY.PLAIN) {
        state.quality--;
        state.slowFrames = 0;
      }
    } else {
      state.slowFrames = Math.max(0, state.slowFrames - 1);
    }
    return state;
  }

  return {
    gl, upload, render, state, canvas,
    get lastProj() { return state.lastProj; },
    get lastView() { return state.lastView; },
    get backdrop() { return backdrop; },
  };
}
