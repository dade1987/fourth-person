// shadow.js — l'ombra dell'ombra (SPEC §3.3d).
//
// Il tesseratto proiettato in 3D sta nella stanza e proietta a sua volta un'ombra
// sul pavimento. Ombra di un'ombra, in un solo colpo d'occhio: ruotando in 4D il
// volume si rovescia e la macchia si contorce — due gradini della scala nello
// stesso fotogramma. La shadow map è ordinaria di proposito: l'ombra è vera.

import { mat4Multiply, mat4Ortho, mat4LookAt, normalize } from './gl.js';

export const SHADOW_SIZE = 1024;

export function createShadowMap(gl, size = SHADOW_SIZE) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);

  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { texture, framebuffer, size };
}

export const LIGHT_DIR = normalize([0.26, 1.0, 0.30]);

/** Matrice luce: ortografica, centrata sull'oggetto. */
export function lightMatrix(center, radius = 0.16) {
  const eye = [
    center[0] + LIGHT_DIR[0] * radius * 4,
    center[1] + LIGHT_DIR[1] * radius * 4,
    center[2] + LIGHT_DIR[2] * radius * 4,
  ];
  const view = mat4LookAt(eye, center, [0, 0, -1]);
  const proj = mat4Ortho(-radius, radius, -radius, radius, 0.001, radius * 9);
  return mat4Multiply(proj, view);
}

export function beginShadowPass(gl, shadow) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadow.framebuffer);
  gl.viewport(0, 0, shadow.size, shadow.size);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

export function endShadowPass(gl, width, height) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, width, height);
}

// ------------------------------------------------------------- pavimento ---

export const FLOOR_VERTEX = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aXZ;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCenter;
uniform float uExtent;
out vec3 vPos;
void main() {
  vPos = vec3(uCenter.x + aXZ.x * uExtent, uCenter.y, uCenter.z + aXZ.y * uExtent);
  gl_Position = uProj * uView * vec4(vPos, 1.0);
}
`;

export const FLOOR_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec3 vPos;
uniform mat4 uLightMatrix;
uniform highp sampler2DShadow uShadow;
uniform vec3 uEye3;
uniform vec3 uObjectCenter;
uniform float uObjectRadius;
uniform float uFogDensity;
uniform vec3 uFogColor;
uniform float uGridScale;
uniform float uShadowOnly;   // 1 = il pavimento è invisibile e resta solo l'ombra
out vec4 frag;

float shadowFactor() {
  vec4 lp = uLightMatrix * vec4(vPos, 1.0);
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = 0.0016;
  float s = 0.0;
  float texel = 1.0 / 1024.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      s += texture(uShadow, vec3(p.xy + vec2(float(i), float(j)) * texel, p.z - bias));
    }
  }
  return s / 9.0;
}

void main() {
  if (uShadowOnly > 0.5) {
    // sopra una stanza vera il pavimento non si disegna: si posa solo l'ombra
    float sh = shadowFactor();
    float d = length(vPos.xz - uObjectCenter.xz);
    float contact = smoothstep(uObjectRadius * 1.9, uObjectRadius * 0.35, d);
    float a = clamp((1.0 - sh) * 0.62 + contact * 0.34, 0.0, 0.92);
    float dist = length(uEye3 - vPos);
    a *= exp(-dist * uFogDensity * 0.5);
    frag = vec4(0.0, 0.0, 0.0, a);
    return;
  }
  // griglia morbida: dà scala al pavimento senza rubare l'occhio
  vec2 g = abs(fract(vPos.xz * uGridScale) - 0.5) / fwidth(vPos.xz * uGridScale);
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  vec3 base = mix(vec3(0.095, 0.101, 0.122), vec3(0.19, 0.20, 0.24), line * 0.85);

  float sh = shadowFactor();
  base *= mix(0.26, 1.0, sh);

  // occlusione di contatto: il buio che sta sotto le cose, e che costa zero
  float d = length(vPos.xz - uObjectCenter.xz);
  float contact = smoothstep(uObjectRadius * 1.9, uObjectRadius * 0.35, d);
  base *= mix(1.0, 0.45, contact);

  float dist = length(uEye3 - vPos);
  base = mix(base, uFogColor, clamp(1.0 - exp(-dist * uFogDensity), 0.0, 1.0));

  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  base += (dither - 0.5) / 255.0;

  frag = vec4(base, 1.0);
}
`;
