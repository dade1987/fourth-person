// glass.js — le celle come vetro (SPEC §3.3b).
//
// Il reticolo di fili è onesto e illeggibile: la profondità si ribalta da sola.
// Il solido opaco è leggibile ma la cella esterna nasconde le altre sette.
// La terza via è il vetro: riflesso e rifrazione hanno un verso univoco — quindi
// la profondità non si capovolge — e insieme si vede attraverso.
//
// Il punto che fa la differenza: la rifrazione VARIA con w. Celle vicine nella
// quarta direzione = vetro più denso e più colorato; celle lontane = quasi aria.
// Se fosse uniforme sarebbe solo bella, e non direbbe niente.

import { HOLO_GLSL } from './holo.js';

export const GEOMETRY_VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec4 aPos4;
layout(location = 1) in vec4 aCell4;
layout(location = 2) in float aCellId;

uniform mat4 uObjR;      // rotazione 4D dell'oggetto
uniform vec4 uObjT;      // posizione 4D dell'oggetto
uniform mat4 uCamRT;     // Rᵀ della camera 4D, già trasposta a monte
uniform vec4 uCamC;      // posizione 4D della camera
uniform float uFocal;    // f
uniform float uNearW;
uniform float uScale3;   // dal volume-retina ai metri dello schermo
uniform vec3 uOffset3;
uniform mat4 uView;      // traslazione pura di −E: MAI una rotazione
uniform mat4 uProj;      // frustum asimmetrico fuori asse

out vec3 vPos3;
out float vW;
out float vCellW;
out float vCellId;
out float vClip;

vec4 toCam(vec4 v) {
  vec4 world = uObjR * v + uObjT;
  return uCamRT * (world - uCamC);
}

void main() {
  vec4 p = toCam(aPos4);
  vec4 pc = toCam(aCell4);
  float w = max(p.w, uNearW);
  vec3 q = uFocal * p.xyz / w;
  vPos3 = uScale3 * q + uOffset3;
  vW = p.w;
  vCellW = pc.w;
  vCellId = aCellId;
  vClip = p.w < uNearW ? 0.0 : 1.0;
  gl_Position = uProj * uView * vec4(vPos3, 1.0);
}
`;

export const GEOMETRY_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec3 vPos3;
in float vW;
in float vCellW;
in float vCellId;
in float vClip;

uniform vec3 uEye3;
uniform vec3 uLightDir;
uniform vec2 uTilt;
uniform float uGlass;        // 1 vetro, 0 solido
uniform float uSliceCenter;  // il w della tua fetta, in coordinate camera
uniform float uWindow;       // larghezza della finestra in w
uniform float uOpacity;
uniform vec3 uTint;
uniform float uCellHue;   // 1 sui politopi (le celle vanno distinte), 0 sugli oggetti di scena
uniform float uTime;
uniform float uFogDensity;
uniform vec3 uFogColor;

out vec4 frag;

${HOLO_GLSL}

vec3 env(vec3 d) {
  float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = mix(vec3(0.16, 0.20, 0.29), vec3(0.78, 0.90, 1.10), pow(up, 1.25));
  vec3 ground = vec3(0.13, 0.13, 0.17);
  vec3 c = mix(ground, sky, smoothstep(-0.06, 0.10, d.y));
  c += vec3(1.0, 0.96, 0.90) * pow(max(dot(d, normalize(vec3(0.30, 0.85, 0.42))), 0.0), 90.0) * 2.6;
  c += vec3(0.35, 0.55, 1.00) * pow(max(dot(d, normalize(vec3(-0.65, 0.25, -0.55))), 0.0), 18.0) * 0.85;
  return c;
}

void main() {
  if (vClip < 0.5) discard;

  // finestra in w: aperta = proiezione, chiusa = sezione. Nessun taglio, mai.
  float dwSlice = abs(vW - uSliceCenter);
  float win = 1.0 - smoothstep(uWindow * 0.55, uWindow, dwSlice);
  if (win <= 0.001) discard;

  vec3 N = normalize(cross(dFdx(vPos3), dFdy(vPos3)));
  vec3 V = normalize(uEye3 - vPos3);
  if (dot(N, V) < 0.0) N = -N;

  // quanto la cella è vicina a te nella quarta direzione: da qui esce tutto
  float dw = (vCellW - uSliceCenter);
  float nearW = exp(-abs(dw) * 1.8);

  float cosT = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.05 + 0.95 * pow(1.0 - cosT, 5.0);

  float eta = mix(1.02, 1.55, nearW);      // vetro denso se sei nella stessa fetta
  float chroma = 0.012 + 0.03 * nearW;     // aberrazione cromatica sui bordi
  vec3 refr;
  refr.r = env(refract(-V, N, 1.0 / (eta * (1.0 - chroma)))).r;
  refr.g = env(refract(-V, N, 1.0 / eta)).g;
  refr.b = env(refract(-V, N, 1.0 / (eta * (1.0 + chroma)))).b;
  vec3 refl = env(reflect(-V, N));

  // ogni cella la sua tinta: devono distinguersi tutte e otto
  float hue = fract(vCellId * 0.1379);
  vec3 cellHue = mix(vec3(1.0), 0.78 + 0.22 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + hue)), uCellHue);
  vec3 tint = mix(vec3(1.0), uTint * cellHue * 1.18, 0.40 + 0.60 * nearW);
  vec3 glassColor = mix(refr * tint, refl, fres);
  glassColor += holoSheen(N, V, uTilt, nearW, vCellId) * (0.22 + 0.33 * uCellHue);

  float lam = max(dot(N, normalize(uLightDir)), 0.0);
  vec3 solidColor = uTint * (0.22 + 0.78 * lam);
  vec3 H = normalize(normalize(uLightDir) + V);
  solidColor += vec3(1.0) * pow(max(dot(N, H), 0.0), 48.0) * 0.5;

  vec3 color = mix(solidColor, glassColor, uGlass);

  // bagliore soffuso solo su ciò che sta fuori dalla tua fetta
  color += uTint * clamp(abs(dw) * 0.22, 0.0, 0.35) * uGlass;

  float alpha = mix(1.0, clamp(0.24 + 0.70 * fres + 0.34 * nearW, 0.0, 1.0), uGlass);
  alpha *= uOpacity * win;

  color *= 1.25; // esposizione: il vetro deve leggersi anche su uno schermo al sole

  float dist = length(uEye3 - vPos3);
  float fog = 1.0 - exp(-dist * uFogDensity);
  color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));

  // dithering contro il banding degli OLED
  float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  color += (d - 0.5) / 255.0;

  frag = vec4(color * alpha, alpha); // premoltiplicato
}
`;

export const DEPTH_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec3 vPos3;
in float vW;
in float vCellW;
in float vCellId;
in float vClip;
uniform float uSliceCenter;
uniform float uWindow;
void main() {
  if (vClip < 0.5) discard;
  if (1.0 - smoothstep(uWindow * 0.55, uWindow, abs(vW - uSliceCenter)) <= 0.02) discard;
}
`;

export const WIRE_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec3 vPos3;
in float vW;
in float vCellW;
in float vCellId;
in float vClip;
uniform vec3 uTint;
uniform float uOpacity;
uniform float uSliceCenter;
uniform float uWindow;
out vec4 frag;
void main() {
  if (vClip < 0.5) discard;
  float win = 1.0 - smoothstep(uWindow * 0.55, uWindow, abs(vW - uSliceCenter));
  float nearW = exp(-abs(vW - uSliceCenter) * 1.2);
  float a = uOpacity * win * (0.35 + 0.65 * nearW);
  frag = vec4(uTint * a, a);
}
`;
