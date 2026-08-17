// bloom.js — la luce che sborda.
//
// È l'unico effetto di post-produzione del gioco, e c'è per un motivo preciso:
// il vetro vive di bordi accesi (fresnel, specularità olografica, bagliore di ciò
// che sta fuori dalla tua fetta), e senza il bagliore quei bordi restano righe
// sottili su uno schermo piccolo. Con il bagliore diventano luce.
//
// Costa due passate a un quarto di risoluzione. Se il fotogramma scende sotto i
// 55 fps, il renderer lo spegne: si salta l'effetto, non la risoluzione.

import { program, buffer } from './gl.js';

const QUAD_VERT = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aXY;
out vec2 vUv;
void main() {
  vUv = aXY * 0.5 + 0.5;
  gl_Position = vec4(aXY, 0.0, 1.0);
}
`;

const EXTRACT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform float uThreshold;
out vec4 frag;
void main() {
  vec3 c = texture(uScene, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // soglia morbida: niente scalini sui bordi appena accesi
  float k = smoothstep(uThreshold, uThreshold + 0.35, l);
  frag = vec4(c * k, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uDirection;   // (1/w, 0) oppure (0, 1/h)
out vec4 frag;
void main() {
  // gaussiana separabile a nove campioni, pesi binomiali
  vec3 c = texture(uSource, vUv).rgb * 0.2270270270;
  c += texture(uSource, vUv + uDirection * 1.3846153846).rgb * 0.3162162162;
  c += texture(uSource, vUv - uDirection * 1.3846153846).rgb * 0.3162162162;
  c += texture(uSource, vUv + uDirection * 3.2307692308).rgb * 0.0702702703;
  c += texture(uSource, vUv - uDirection * 3.2307692308).rgb * 0.0702702703;
  frag = vec4(c, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uStrength;
out vec4 frag;
void main() {
  vec3 base = texture(uScene, vUv).rgb;
  vec3 glow = texture(uBloom, vUv).rgb;
  vec3 c = base + glow * uStrength;

  // tonemap morbido: le luci si arrotondano invece di bruciarsi
  c = c / (c + vec3(0.85)) * 1.35;

  // vignettatura appena accennata: tiene l'occhio dove sta la cosa impossibile
  float r = length((vUv - 0.5) * vec2(1.0, 1.25));
  c *= 1.0 - 0.28 * smoothstep(0.45, 1.05, r);

  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  frag = vec4(c + (dither - 0.5) / 255.0, 1.0);
}
`;

function makeTarget(gl, width, height, { depth = false } = {}) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  let depthBuffer = null;
  if (depth) {
    depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffer, depthBuffer, width, height };
}

function dispose(gl, target) {
  if (!target) return;
  gl.deleteTexture(target.texture);
  gl.deleteFramebuffer(target.framebuffer);
  if (target.depthBuffer) gl.deleteRenderbuffer(target.depthBuffer);
}

export function createBloom(gl) {
  const extract = program(gl, QUAD_VERT, EXTRACT_FRAG);
  const blur = program(gl, QUAD_VERT, BLUR_FRAG);
  const composite = program(gl, QUAD_VERT, COMPOSITE_FRAG);
  const quad = buffer(gl, new Float32Array([-1, -1, 3, -1, -1, 3]));

  let scene = null;
  let half = null;
  let ping = null;
  let size = { width: 0, height: 0 };

  function resize(width, height) {
    if (size.width === width && size.height === height) return;
    dispose(gl, scene);
    dispose(gl, half);
    dispose(gl, ping);
    const hw = Math.max(2, width >> 2);
    const hh = Math.max(2, height >> 2);
    scene = makeTarget(gl, width, height, { depth: true });
    half = makeTarget(gl, hw, hh);
    ping = makeTarget(gl, hw, hh);
    size = { width, height };
  }

  function drawQuad() {
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    /** Da qui in poi la scena finisce in una texture invece che sullo schermo. */
    begin(width, height) {
      resize(width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.framebuffer);
      gl.viewport(0, 0, width, height);
    },

    /** Estrai le luci, sfocale, rimettile sopra. Tre passate corte. */
    end({ threshold = 0.62, strength = 0.85 } = {}) {
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.depthMask(false);

      gl.bindFramebuffer(gl.FRAMEBUFFER, half.framebuffer);
      gl.viewport(0, 0, half.width, half.height);
      extract.use();
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, scene.texture);
      gl.uniform1i(extract.u.uScene, 3);
      gl.uniform1f(extract.u.uThreshold, threshold);
      drawQuad();

      blur.use();
      for (const [src, dst, dir] of [
        [half, ping, [1 / half.width, 0]],
        [ping, half, [0, 1 / half.height]],
      ]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.framebuffer);
        gl.viewport(0, 0, dst.width, dst.height);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, src.texture);
        gl.uniform1i(blur.u.uSource, 3);
        gl.uniform2f(blur.u.uDirection, dir[0], dir[1]);
        drawQuad();
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, size.width, size.height);
      composite.use();
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, scene.texture);
      gl.uniform1i(composite.u.uScene, 3);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, half.texture);
      gl.uniform1i(composite.u.uBloom, 4);
      gl.uniform1f(composite.u.uStrength, strength);
      drawQuad();

      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
    },
  };
}
