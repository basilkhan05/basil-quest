// Voxel props for Bronco Off-Road: wildlife, trail obstacles, pickups and
// roadside signs. Everything faces -z (the direction of travel) and sits on y = 0,
// same conventions as src/game/models.js.
import * as THREE from 'three';
import { box, group, sign } from '../../game/voxel.js';

export const TEAL = '#15c2b0';
export const INK = '#111111';
export const PINK = '#ff4d6d';

// ---------- Wildlife ----------

export function makeBear(black = false) {
  const fur = black ? '#2a2420' : '#7a4b2a';
  const dark = black ? '#1a1614' : '#5e3a20';
  const snout = black ? '#b8916a' : '#c49a6c';
  const g = group();
  const legs = [];
  [[-0.27, -0.4], [0.27, -0.4], [-0.27, 0.42], [0.27, 0.42]].forEach(([x, z]) => legs.push(box(g, 0.24, 0.42, 0.26, dark, x, 0, z)));
  box(g, 0.84, 0.62, 1.25, fur, 0, 0.36, 0.02);
  if (!black) box(g, 0.6, 0.16, 0.44, fur, 0, 0.98, -0.28); // grizzly hump
  box(g, 0.52, 0.48, 0.46, fur, 0, 0.6, -0.78);
  box(g, 0.28, 0.22, 0.24, snout, 0, 0.62, -1.1);
  box(g, 0.12, 0.08, 0.04, INK, 0, 0.78, -1.23);
  box(g, 0.08, 0.08, 0.03, INK, -0.13, 0.9, -1.02);
  box(g, 0.08, 0.08, 0.03, INK, 0.13, 0.9, -1.02);
  box(g, 0.14, 0.14, 0.1, dark, -0.19, 1.08, -0.72);
  box(g, 0.14, 0.14, 0.1, dark, 0.19, 1.08, -0.72);
  box(g, 0.14, 0.14, 0.1, fur, 0, 0.8, 0.68);
  g.userData.legs = legs;
  return g;
}

export function makeMoose() {
  const coat = '#5a3d2b';
  const dark = '#3b2a1e';
  const muzzle = '#4a3222';
  const antler = '#e3d3a8';
  const g = group();
  const legs = [];
  [[-0.3, -0.62], [0.3, -0.62], [-0.3, 0.68], [0.3, 0.68]].forEach(([x, z]) => legs.push(box(g, 0.2, 1.0, 0.22, dark, x, 0, z)));
  box(g, 0.96, 0.82, 1.9, coat, 0, 0.95, 0);
  box(g, 0.82, 0.28, 0.72, dark, 0, 1.77, -0.48); // shoulder hump
  box(g, 0.46, 0.5, 0.46, coat, 0, 1.42, -1.05);
  box(g, 0.44, 0.44, 0.62, coat, 0, 1.68, -1.42);
  box(g, 0.42, 0.36, 0.44, muzzle, 0, 1.58, -1.88);
  box(g, 0.06, 0.06, 0.03, INK, -0.1, 1.82, -2.11);
  box(g, 0.06, 0.06, 0.03, INK, 0.1, 1.82, -2.11);
  box(g, 0.03, 0.08, 0.08, INK, -0.235, 1.94, -1.5);
  box(g, 0.03, 0.08, 0.08, INK, 0.235, 1.94, -1.5);
  box(g, 0.12, 0.34, 0.14, dark, 0, 1.24, -1.55); // the bell
  box(g, 0.12, 0.2, 0.08, dark, -0.22, 2.08, -1.24);
  box(g, 0.12, 0.2, 0.08, dark, 0.22, 2.08, -1.24);
  box(g, 0.14, 0.18, 0.14, coat, 0, 1.45, 1.0);
  // Palmate antlers
  [-1, 1].forEach((s) => {
    box(g, 0.34, 0.1, 0.12, antler, s * 0.36, 2.06, -1.32);
    box(g, 0.62, 0.1, 0.5, antler, s * 0.78, 2.14, -1.3);
    for (let i = 0; i < 3; i++) box(g, 0.09, 0.24, 0.09, antler, s * (0.56 + i * 0.2), 2.24, -1.48 + i * 0.05);
    box(g, 0.09, 0.2, 0.09, antler, s * 1.04, 2.24, -1.1);
  });
  g.userData.legs = legs;
  return g;
}

// A dry tumbleweed; the inner ball spins while the group rolls.
export function makeTumbleweed() {
  const g = group();
  const ball = group(g, 0, 0.38, 0);
  const c = ['#c9a66b', '#b08850', '#d8b97e'];
  box(ball, 0.72, 0.5, 0.6, c[0], 0, -0.25, 0);
  box(ball, 0.5, 0.72, 0.52, c[1], 0.04, -0.36, 0.05);
  box(ball, 0.58, 0.58, 0.74, c[2], -0.05, -0.29, -0.03);
  box(ball, 0.2, 0.2, 0.2, c[1], 0.36, 0.1, 0.1);
  box(ball, 0.18, 0.18, 0.18, c[0], -0.32, -0.32, -0.3);
  g.userData.ball = ball;
  return g;
}

// ---------- Trail obstacles ----------

export function makeLog(len = 3) {
  const g = group();
  box(g, len, 0.44, 0.46, '#7a4b33', 0, 0, 0);
  box(g, len + 0.01, 0.1, 0.47, '#6b3f2a', 0, 0.28, 0);
  box(g, 0.04, 0.34, 0.36, '#e0b98a', -len / 2 - 0.01, 0.05, 0);
  box(g, 0.04, 0.34, 0.36, '#e0b98a', len / 2 + 0.01, 0.05, 0);
  box(g, 0.05, 0.14, 0.14, '#b98a5a', len / 2 + 0.02, 0.15, 0, { shadow: false });
  box(g, 0.14, 0.32, 0.14, '#7a4b33', len * 0.22, 0.44, 0);
  box(g, 0.5, 0.06, 0.3, '#5f9e3a', -len * 0.18, 0.44, 0.02);
  return g;
}

// Wooden kicker that rises toward -z.
export function makeRamp() {
  const g = group();
  for (let i = 0; i < 5; i++) box(g, 2.4, 0.13 * (i + 1), 0.5, i % 2 ? '#c8955c' : '#b5834f', 0, 0, 1.0 - i * 0.5);
  for (let i = 0; i < 6; i++) box(g, 0.4, 0.05, 0.5, i % 2 ? INK : '#ffd23f', -1.0 + i * 0.4, 0.65, -1.0, { shadow: false });
  box(g, 0.12, 0.7, 0.12, '#7a4b33', -1.1, 0, -1.2);
  box(g, 0.12, 0.7, 0.12, '#7a4b33', 1.1, 0, -1.2);
  return g;
}

// Small dirt whoop: a quick hop.
export function makeBump() {
  const g = group();
  box(g, 2.8, 0.12, 1.4, '#9a6a42', 0, 0, 0);
  box(g, 2.3, 0.12, 0.8, '#8d5f3a', 0, 0.12, 0);
  return g;
}

// Mud pit: a base slab scaled to size plus lumps placed on spawn.
export function makeMud() {
  const g = group();
  const base = box(g, 1, 0.06, 1, '#6b4a2f', 0, 0.02, 0, { shadow: false });
  const stripes = [];
  for (let i = 0; i < 3; i++) stripes.push(box(g, 1, 0.065, 0.5, '#5e4028', 0, 0.02, 0, { shadow: false }));
  const lumps = [];
  for (let i = 0; i < 9; i++) lumps.push(box(g, 0.3, 0.12, 0.3, '#4f3521', 0, 0.06, 0));
  g.userData = { base, stripes, lumps };
  return g;
}

export function shapeMud(g, w, l, rnd) {
  const { base, stripes, lumps } = g.userData;
  base.scale.set(w, 0.06, l);
  stripes.forEach((m, i) => {
    m.scale.set(w - 0.1, 0.065, 0.5);
    m.position.z = -l / 2 + ((i + 0.5) * l) / 3;
  });
  lumps.forEach((m) => {
    const sx = 0.25 + rnd() * 0.4;
    const sz = 0.25 + rnd() * 0.35;
    m.scale.set(sx, 0.1 + rnd() * 0.08, sz);
    m.position.set((rnd() - 0.5) * (w - sx - 0.2), 0.06 + m.scale.y / 2, (rnd() - 0.5) * (l - sz - 0.2));
  });
}

// ---------- Pickups ----------

// Teal Freshly Commerce supply crate with a pixel "F" on every face.
let crateMat = null;
function crateMaterial() {
  if (crateMat) return crateMat;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = TEAL;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#0f9486';
  g.fillRect(6, 30, 52, 4);
  g.fillStyle = INK;
  g.fillRect(0, 0, 64, 6);
  g.fillRect(0, 58, 64, 6);
  g.fillRect(0, 0, 6, 64);
  g.fillRect(58, 0, 6, 64);
  const F = ['#####', '#####', '##...', '####.', '####.', '##...', '##...'];
  const px = 6;
  const ox = 32 - (5 * px) / 2;
  const oy = 32 - (7 * px) / 2;
  F.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && g.fillRect(ox + x * px, oy + y * px, px, px)));
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  crateMat = new THREE.MeshLambertMaterial({ map: tex });
  return crateMat;
}

export function makeCrate() {
  const g = group();
  const spin = group(g, 0, 0.12, 0);
  box(spin, 0.72, 0.72, 0.72, TEAL, 0, 0, 0, { material: crateMaterial() });
  g.userData.spin = spin;
  return g;
}

export function makeCan() {
  const g = group();
  const spin = group(g, 0, 0.12, 0);
  box(spin, 0.46, 0.6, 0.26, '#d7263d', 0, 0, 0);
  box(spin, 0.3, 0.06, 0.27, '#b51d31', 0, 0.2, 0, { shadow: false });
  box(spin, 0.06, 0.4, 0.27, '#b51d31', 0, 0.1, 0, { shadow: false });
  box(spin, 0.3, 0.08, 0.1, INK, -0.06, 0.6, 0);
  box(spin, 0.1, 0.14, 0.1, '#ffd23f', 0.15, 0.6, 0);
  g.userData.spin = spin;
  return g;
}

// ---------- Roadside ----------

export const BILLBOARDS = [
  { lines: ['FRESHLY', 'COMMERCE'], bg: TEAL, fg: INK },
  { lines: ['SIMPLE', 'BUNDLES'], bg: PINK, fg: '#ffffff' },
  { lines: ['CAMP', 'BRONCO'], bg: '#2f6b3a', fg: '#ffe14d' },
  { lines: ['FRESHLY', 'SUPPLY RUN'], bg: INK, fg: TEAL },
];

export function makeBillboard(i) {
  const b = BILLBOARDS[i % BILLBOARDS.length];
  const g = group();
  sign(g, b.lines, { w: 3.2, h: 1.3, post: 1.15, bg: b.bg, fg: b.fg, size: 40, postColor: '#5a3a22' });
  // A strip of lights along the top
  for (let k = 0; k < 4; k++) box(g, 0.14, 0.1, 0.14, '#fff7c2', -1.2 + k * 0.8, 2.47, 0.04, { shadow: false });
  return g;
}

export const WARNINGS = {
  mud: { lines: ['MUD', 'PIT'], bg: '#6b4a2f', fg: '#ffd23f' },
  moose: { lines: ['MOOSE', 'XING'], bg: '#ffd23f', fg: INK },
  bear: { lines: ['BEAR', 'COUNTRY'], bg: '#ffd23f', fg: INK },
  ramp: { lines: ['SEND', 'IT'], bg: PINK, fg: '#ffffff' },
};

export function makeWarning(kind) {
  const w = WARNINGS[kind];
  const g = group();
  sign(g, w.lines, { w: 1.2, h: 0.72, post: 0.5, bg: w.bg, fg: w.fg, size: 14 });
  return g;
}

// Roadside campsite: striped tent, a crackling fire and log benches.
export function makeCamp() {
  const g = group();
  const tent = group(g, 0, 0, 0);
  for (let i = 0; i < 5; i++) box(tent, 1.8 - i * 0.36, 0.22, 1.5, i % 2 ? '#ff8a1f' : '#ffa94d', 0, i * 0.22, 0);
  box(tent, 0.36, 0.6, 0.04, '#5a3a22', 0, 0, 0.76, { shadow: false });
  box(g, 0.9, 0.24, 0.3, '#7a4b33', 1.5, 0, 1.4);
  box(g, 0.3, 0.24, 0.9, '#7a4b33', 2.6, 0, 0.5);
  const fire = group(g, 1.7, 0, 0.6);
  box(fire, 0.5, 0.1, 0.5, '#5a3a22', 0, 0, 0);
  const f1 = box(fire, 0.3, 0.35, 0.3, '#ff8a1f', 0, 0.1, 0, { shadow: false });
  const f2 = box(fire, 0.16, 0.25, 0.16, '#ffe14d', 0, 0.3, 0, { shadow: false });
  g.userData.flame = [f1, f2];
  return g;
}
