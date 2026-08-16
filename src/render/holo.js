// holo.js — la specularità che scorre con l'inclinazione (SPEC §3.3c).
//
// Le carte olografiche funzionano perché il riflesso si muove in direzione
// OPPOSTA al tilt, con un gradiente non lineare: il cervello lo legge come un
// oggetto fisico sotto luce vera. Qui l'intensità è proporzionale alla vicinanza
// in w, così l'indizio di luce e l'indizio di quarta dimensione dicono la stessa cosa.

export const HOLO_GLSL = /* glsl */ `
vec3 holoSheen(vec3 N, vec3 V, vec2 tilt, float nearW, float seed) {
  // la banda scorre CONTRO l'inclinazione: è ciò che la rende fisica
  float ang = dot(N, V);
  float u = fract(seed * 0.13 + N.x * 1.7 + N.y * 1.1 - tilt.x * 2.6 + tilt.y * 1.4 + ang * 1.9);
  float band = pow(abs(sin(u * 3.14159265)), 7.0);           // gradiente non lineare
  vec3 hue = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + u * 2.0));
  return hue * band * nearW;
}
`;

/** Quanto conta la specularità olografica: zero se la cella è lontana nella quarta direzione. */
export function sheenStrength(distanceInW) {
  return Math.exp(-Math.abs(distanceInW) * 1.8);
}
