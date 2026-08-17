// backdrop.js — la stanza vera dietro l'oggetto impossibile (SPEC §3.3f).
//
// Parallasse su mappa di profondità: lo sfondo si muove con l'occhio, di poco e
// per strati, come se dietro il vetro ci fosse una stanza e non un disegno. È il
// contrasto fra un ambiente indiscutibilmente reale e una cosa che non può
// esistere a moltiplicare lo stupore — ed è il motivo per cui questo file esiste.
//
// Qui dentro NON c'è nessuna fotografia: c'è un fondale finto disegnato da codice,
// e il meccanismo per sostituirlo. Mettendo `assets/room.jpg` e `assets/room-depth.jpg`
// il gioco li usa al posto del finto, senza toccare una riga.

import { program, buffer } from './gl.js';

export const PHOTO_URL = 'assets/room.jpg';
export const DEPTH_URL = 'assets/room-depth.jpg';

const VERT = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aXY;
out vec2 vUv;
void main() {
  vUv = aXY * 0.5 + 0.5;
  gl_Position = vec4(aXY, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPhoto;
uniform sampler2D uDepth;
uniform vec2 uParallax;   // spostamento dell'occhio, in unità di schermo
uniform vec2 uUvScale;    // ritaglio: la foto copre lo schermo senza deformarsi
uniform vec2 uUvOffset;
uniform float uDim;       // quanto si abbassa, per non rubare l'occhio all'oggetto
out vec4 frag;

void main() {
  vec2 base = vUv * uUvScale + uUvOffset;
  // due passi: il secondo campiona la profondità già spostata, e i bordi reggono meglio
  float d0 = texture(uDepth, base).r;
  vec2 uv1 = base + uParallax * (d0 - 0.5);
  float d1 = texture(uDepth, uv1).r;
  vec2 uv = base + uParallax * (d1 - 0.5);

  vec3 c = texture(uPhoto, clamp(uv, vec2(0.001), vec2(0.999))).rgb;

  // vignettatura: l'occhio va al centro, dove sta la cosa impossibile
  float r = length((vUv - 0.5) * vec2(1.0, 1.35));
  c *= 1.0 - 0.42 * smoothstep(0.30, 1.00, r);
  c *= uDim;

  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  frag = vec4(c + (dither - 0.5) / 255.0, 1.0);
}
`;

/**
 * Il fondale finto: una stanza disegnata a mano con due canvas, uno per il colore
 * e uno per la profondità. Serve a far funzionare il meccanismo prima che esista
 * la fotografia — e a far vedere subito che cosa succederà quando ci sarà.
 */
export function placeholderRoom(width = 1024, height = 640) {
  const photo = document.createElement('canvas');
  photo.width = width;
  photo.height = height;
  const g = photo.getContext('2d');

  // parete di fondo
  const wall = g.createLinearGradient(0, 0, 0, height);
  wall.addColorStop(0, '#3a4152');
  wall.addColorStop(0.62, '#282e3a');
  wall.addColorStop(1, '#20242e');
  g.fillStyle = wall;
  g.fillRect(0, 0, width, height);

  // finestra a sinistra: è la sorgente di luce, e si vede da dove viene
  const win = g.createLinearGradient(width * 0.06, 0, width * 0.34, height * 0.6);
  win.addColorStop(0, '#8fb6e8');
  win.addColorStop(1, '#43526d');
  g.fillStyle = win;
  g.fillRect(width * 0.06, height * 0.10, width * 0.26, height * 0.42);
  g.fillStyle = 'rgba(20,24,32,.9)';
  g.fillRect(width * 0.185, height * 0.10, width * 0.012, height * 0.42);
  g.fillRect(width * 0.06, height * 0.30, width * 0.26, height * 0.014);

  // alone di luce sulla parete
  const glow = g.createRadialGradient(width * 0.22, height * 0.33, 10, width * 0.22, height * 0.33, width * 0.55);
  glow.addColorStop(0, 'rgba(150,185,235,.20)');
  glow.addColorStop(1, 'rgba(150,185,235,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, width, height);

  // pavimento
  const floor = g.createLinearGradient(0, height * 0.62, 0, height);
  floor.addColorStop(0, '#22262f');
  floor.addColorStop(1, '#0e1116');
  g.fillStyle = floor;
  g.fillRect(0, height * 0.62, width, height * 0.38);

  // tavolo in primo piano: è lui che dà la parallasse
  g.fillStyle = '#3a3025';
  g.fillRect(width * 0.12, height * 0.70, width * 0.76, height * 0.06);
  g.fillStyle = '#2b231b';
  g.fillRect(width * 0.18, height * 0.76, width * 0.05, height * 0.24);
  g.fillRect(width * 0.77, height * 0.76, width * 0.05, height * 0.24);
  g.fillStyle = 'rgba(255,255,255,.05)';
  g.fillRect(width * 0.12, height * 0.70, width * 0.76, height * 0.012);

  // ---- mappa di profondità: bianco = vicino
  const depth = document.createElement('canvas');
  depth.width = width;
  depth.height = height;
  const d = depth.getContext('2d');
  d.fillStyle = '#1e1e1e'; // parete: lontana
  d.fillRect(0, 0, width, height);
  const fl = d.createLinearGradient(0, height * 0.62, 0, height);
  fl.addColorStop(0, '#2a2a2a');
  fl.addColorStop(1, '#9a9a9a'); // il pavimento si avvicina venendo giù
  d.fillStyle = fl;
  d.fillRect(0, height * 0.62, width, height * 0.38);
  d.fillStyle = '#111'; // la finestra è un buco: più lontana di tutto
  d.fillRect(width * 0.06, height * 0.10, width * 0.26, height * 0.42);
  d.fillStyle = '#d8d8d8'; // il tavolo è vicino
  d.fillRect(width * 0.12, height * 0.70, width * 0.76, height * 0.06);
  d.fillStyle = '#c0c0c0';
  d.fillRect(width * 0.18, height * 0.76, width * 0.05, height * 0.24);
  d.fillRect(width * 0.77, height * 0.76, width * 0.05, height * 0.24);

  return { photo, depth, placeholder: true };
}

function makeTexture(gl, source) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function createBackdrop(gl) {
  const prog = program(gl, VERT, FRAG);
  const quad = buffer(gl, new Float32Array([-1, -1, 3, -1, -1, 3]));
  const fallback = placeholderRoom();
  let photoTex = makeTexture(gl, fallback.photo);
  let depthTex = makeTexture(gl, fallback.depth);
  let usingPhoto = false;
  let aspect = fallback.photo.width / fallback.photo.height;

  // Se un giorno arrivano la foto e la sua mappa, entrano da qui e basta.
  Promise.all([loadImage(PHOTO_URL), loadImage(DEPTH_URL)]).then(([photo, depth]) => {
    if (!photo || !depth) return;
    photoTex = makeTexture(gl, photo);
    depthTex = makeTexture(gl, depth);
    aspect = photo.naturalWidth / photo.naturalHeight;
    usingPhoto = true;
  });

  return {
    get usingPhoto() {
      return usingPhoto;
    },
    draw(eye, { dim = 1, strength = 0.055 } = {}) {
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.BLEND);
      prog.use();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, photoTex);
      gl.uniform1i(prog.u.uPhoto, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, depthTex);
      gl.uniform1i(prog.u.uDepth, 2);
      // l'occhio si muove di pochi centimetri: lo sfondo deve rispondere di poco
      gl.uniform2f(prog.u.uParallax, (-eye.x / 0.35) * strength, (eye.y / 0.35) * strength);
      // "cover": si ritaglia il lato che avanza, non si deforma mai la stanza
      const screen = gl.drawingBufferWidth / gl.drawingBufferHeight;
      let sx = 1;
      let sy = 1;
      if (aspect > screen) sx = screen / aspect;
      else sy = aspect / screen;
      gl.uniform2f(prog.u.uUvScale, sx, sy);
      gl.uniform2f(prog.u.uUvOffset, (1 - sx) / 2, (1 - sy) / 2);
      gl.uniform1f(prog.u.uDim, dim);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
    },
  };
}
