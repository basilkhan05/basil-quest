// Voxel models for "To the Moon" (rocket.js). Everything faces +z, toward the
// arcade camera, and is centred on its origin unless noted.
import * as THREE from 'three';
import { box, group, sign } from '../../game/voxel.js';
import { pine, tree } from '../../game/models.js';

const R = Math.random;
const pick = (a) => a[(R() * a.length) | 0];
const UNIT = new THREE.BoxGeometry(1, 1, 1);
const glow = new Map();
// Unlit material for lights so they read as glowing in the dark.
export function glowMat(color) {
  let m = glow.get(color);
  if (!m) glow.set(color, (m = new THREE.MeshBasicMaterial({ color })));
  return m;
}

// voxel.js boxes sit on their bottom face; most props here want a centred box.
export function cbox(p, w, h, d, color, x = 0, y = 0, z = 0, o) {
  return box(p, w, h, d, color, x, y - h / 2, z, o);
}

// Hollow ball of voxels (same look as the Moon and Dyson sphere on the journey).
export function voxelBall(r, size, colorAt, shell = 1.6) {
  const cells = [];
  for (let x = -r; x <= r; x++)
    for (let y = -r; y <= r; y++)
      for (let z = -r; z <= r; z++) {
        const d = Math.hypot(x, y, z);
        if (d <= r && d > r - shell) cells.push([x, y, z]);
      }
  const mesh = new THREE.InstancedMesh(UNIT, new THREE.MeshLambertMaterial(), cells.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  cells.forEach(([x, y, z], i) => {
    mesh.setMatrixAt(i, m.makeScale(size, size, size).setPosition(x * size, y * size, z * size));
    mesh.setColorAt(i, c.set(colorAt(x, y, z)));
  });
  mesh.computeBoundingSphere();
  return mesh;
}

export function makeEarth() {
  const land = (x, y, z) => Math.sin(x * 0.5 + Math.sin(z * 0.45) * 2) + Math.cos(z * 0.5 - y * 0.4) > 0.75;
  const cloud = (x, y, z) => Math.sin(x * 1.3 + y * 0.7) * Math.cos(z * 1.1 - y) > 0.82;
  return voxelBall(10, 1, (x, y, z) => {
    if (Math.abs(y) > 8.3) return '#ffffff';
    if (cloud(x, y, z)) return '#f4f8ff';
    if (land(x, y, z)) return (x + y + z) % 2 ? '#3ddc84' : '#2fbf6e';
    return (x * 3 + z) % 5 ? '#2b6cff' : '#3a7dff';
  }, 2);
}

export function makeMoonBall() {
  const crater = (x, y, z) => Math.sin(x * 1.7) + Math.sin(y * 1.3 + z * 0.9) + Math.sin(z * 2.1 - x) > 1.5;
  return voxelBall(8, 1, (x, y, z) => (crater(x, y, z) ? '#a9a9b8' : (x + y) % 3 ? '#e4e4ee' : '#d2d2de'), 2);
}

// ---------- Hazards ----------
const ROCK = ['#8a7f74', '#7a7068', '#9b9084', '#6c635b'];
export function makeAsteroid(r) {
  const root = group();
  const spin = group(root);
  const s = r * 1.4;
  cbox(spin, s, s * 0.9, s, pick(ROCK));
  for (let i = 0; i < 6; i++) {
    const a = R() * Math.PI * 2;
    const b = (R() - 0.5) * Math.PI;
    const ls = s * (0.42 + R() * 0.22);
    cbox(spin, ls, ls, ls, pick(ROCK), Math.cos(a) * Math.cos(b) * s * 0.42, Math.sin(b) * s * 0.42, Math.sin(a) * Math.cos(b) * s * 0.42);
  }
  for (let i = 0; i < 3; i++) cbox(spin, s * 0.24, s * 0.24, 0.06, '#544c45', (R() - 0.5) * s * 0.5, (R() - 0.5) * s * 0.5, s / 2 + 0.02, { shadow: false });
  return { root, spin };
}

export function makeDebris() {
  const root = group();
  const spin = group(root);
  const t = (R() * 4) | 0;
  if (t === 0) {
    // snapped-off solar panel
    cbox(spin, 0.95, 0.55, 0.1, '#3d5bd9');
    cbox(spin, 0.06, 0.56, 0.12, '#9fe6ff', -0.16, 0, 0);
    cbox(spin, 0.06, 0.56, 0.12, '#9fe6ff', 0.16, 0, 0);
    cbox(spin, 0.99, 0.1, 0.14, '#e9edf2', 0, 0.28, 0);
    cbox(spin, 0.99, 0.1, 0.14, '#e9edf2', 0, -0.28, 0);
  } else if (t === 1) {
    // gold foil chunk
    cbox(spin, 0.55, 0.45, 0.5, '#ffb020');
    cbox(spin, 0.3, 0.5, 0.3, '#d9d9e3', 0.22, 0.12, 0);
  } else if (t === 2) {
    // bolts and rods
    cbox(spin, 0.8, 0.16, 0.16, '#c0c6d0');
    cbox(spin, 0.16, 0.6, 0.16, '#e9edf2', 0.22, 0, 0);
    cbox(spin, 0.34, 0.34, 0.34, '#ff8a1f', -0.26, 0, 0);
  } else {
    // spent booster nozzle
    cbox(spin, 0.6, 0.5, 0.6, '#d9d9e3');
    cbox(spin, 0.42, 0.3, 0.42, '#6d737d', 0, -0.36, 0);
    cbox(spin, 0.62, 0.12, 0.62, '#ff3b5c', 0, 0.2, 0);
  }
  return { root, spin };
}

// Freshly Commerce satellite: teal bus, solar "panels" that are Freshly signs.
export function makeFreshlySat() {
  const root = group();
  const spin = group(root);
  cbox(spin, 1.2, 1.2, 1.0, '#15c2b0');
  cbox(spin, 1.22, 0.14, 1.02, '#111', 0, 0.45, 0);
  cbox(spin, 1.22, 0.14, 1.02, '#111', 0, -0.45, 0);
  cbox(spin, 0.5, 0.5, 0.04, '#0f9486', 0, 0, 0.52);
  cbox(spin, 0.22, 0.22, 0.05, '#e9fffb', 0, 0, 0.54, { shadow: false });
  // dish + antenna
  cbox(spin, 0.1, 0.4, 0.1, '#9aa0a8', 0, 0.8, 0);
  cbox(spin, 0.6, 0.12, 0.6, '#f4f6fb', 0, 1.02, 0);
  const light = cbox(spin, 0.14, 0.14, 0.14, '#ffd23f', 0, 1.18, 0, { material: glowMat('#ffd23f') });
  ['FRESHLY', 'COMMERCE'].forEach((word, i) => {
    const s = i ? 1 : -1;
    cbox(spin, 0.36, 0.1, 0.1, '#9aa0a8', s * 0.76, 0, 0);
    sign(spin, [word], { x: s * 1.65, y: -0.4, z: 0, w: 1.5, h: 0.8, bg: '#111', fg: '#15c2b0', border: '#15c2b0', size: 14 });
  });
  return { root, spin, light };
}

// Simple Bundles billboard satellite.
export function makeBundlesSat() {
  const root = group();
  const spin = group(root);
  cbox(spin, 3.7, 1.75, 0.2, '#555c68', 0, 0, -0.08);
  sign(spin, ['SIMPLE', 'BUNDLES'], { x: 0, y: -0.78, z: 0.04, w: 3.5, h: 1.56, bg: '#ff4d6d', fg: '#ffffff', border: '#ffffff', size: 22 });
  // little solar wings + thrusters
  for (const s of [-1, 1]) {
    cbox(spin, 0.5, 0.1, 0.1, '#9aa0a8', s * 2.05, 0, -0.1);
    cbox(spin, 0.9, 0.6, 0.06, '#1f2a5a', s * 2.7, 0, -0.1);
    cbox(spin, 0.06, 0.6, 0.07, '#7fdcff', s * 2.7, 0, -0.1);
    cbox(spin, 0.24, 0.3, 0.24, '#d9d9e3', s * 1.6, -1.0, -0.1);
  }
  const light = cbox(spin, 0.16, 0.16, 0.16, '#ff4d6d', 0, 1.02, -0.08, { material: glowMat('#ff4d6d') });
  return { root, spin, light };
}

// Broken satellite with a blinking red light: it blows up when you get close.
export function makeBrokenSat() {
  const root = group();
  const spin = group(root);
  cbox(spin, 1.0, 0.9, 0.8, '#9aa0a8');
  cbox(spin, 1.02, 0.12, 0.82, '#6d737d', 0, 0.22, 0);
  cbox(spin, 0.3, 0.3, 0.04, '#2c3240', -0.2, -0.1, 0.42);
  const p = group(spin, 0.55, 0.1, 0);
  p.rotation.z = -0.55;
  cbox(p, 1.3, 0.7, 0.06, '#1f2a5a', 0.75, 0, 0);
  cbox(p, 0.06, 0.7, 0.07, '#7fdcff', 0.55, 0, 0);
  cbox(p, 0.06, 0.7, 0.07, '#7fdcff', 0.95, 0, 0);
  cbox(spin, 0.4, 0.1, 0.1, '#6d737d', -0.66, 0, 0);
  cbox(spin, 0.14, 0.14, 0.14, '#ff8a1f', -0.88, 0.04, 0, { shadow: false });
  const light = cbox(spin, 0.26, 0.26, 0.26, '#ff3b5c', 0, 0.6, 0, { material: glowMat('#ff3b5c') });
  return { root, spin, light };
}

// Leaky fuel tank with hazard stripes: also explodes.
export function makeFuelTank() {
  const root = group();
  const spin = group(root);
  cbox(spin, 0.9, 1.5, 0.9, '#ff8a1f');
  cbox(spin, 0.7, 1.8, 0.7, '#ff8a1f');
  for (let i = 0; i < 4; i++) cbox(spin, 0.92, 0.12, 0.92, i % 2 ? '#111' : '#ffd23f', 0, -0.36 + i * 0.12, 0);
  cbox(spin, 0.3, 0.2, 0.3, '#555c68', 0, -1.0, 0);
  const light = cbox(spin, 0.24, 0.24, 0.24, '#ff3b5c', 0, 1.0, 0, { material: glowMat('#ff3b5c') });
  return { root, spin, light };
}

export function makeComet() {
  const root = group();
  const spin = group(root);
  cbox(spin, 0.9, 0.9, 0.9, '#dff6ff');
  cbox(spin, 0.6, 0.6, 1.1, '#9fe6ff');
  cbox(spin, 1.1, 0.5, 0.5, '#ffffff');
  cbox(spin, 0.5, 1.1, 0.5, '#c8f1ff');
  return { root, spin };
}

// Canada goose, flying toward +x.
export function makeGoose() {
  const root = group();
  const body = group(root);
  cbox(body, 0.8, 0.34, 0.36, '#8a7a66');
  cbox(body, 0.6, 0.12, 0.34, '#e8e2d6', 0, -0.14, 0);
  cbox(body, 0.18, 0.2, 0.3, '#1b1b1f', -0.46, 0.04, 0);
  cbox(body, 0.14, 0.14, 0.14, '#1b1b1f', 0.44, 0.12, 0);
  cbox(body, 0.14, 0.14, 0.14, '#1b1b1f', 0.54, 0.22, 0);
  cbox(body, 0.26, 0.16, 0.16, '#1b1b1f', 0.68, 0.3, 0);
  cbox(body, 0.1, 0.08, 0.17, '#ffffff', 0.64, 0.25, 0);
  cbox(body, 0.1, 0.05, 0.08, '#2a2a2a', 0.85, 0.28, 0);
  const wings = [-1, 1].map((s) => {
    const w = group(body, 0.02, 0.1, s * 0.16);
    cbox(w, 0.42, 0.06, 0.62, '#6e604f', 0, 0, s * 0.31);
    cbox(w, 0.42, 0.065, 0.16, '#1b1b1f', 0, 0, s * 0.56);
    w.userData.s = s;
    return w;
  });
  return { root, body, wings };
}

export function makeBalloon() {
  const root = group();
  const ball = voxelBall(3, 0.27, (x, y) => (y > 1 ? '#ffffff' : '#eef0f6'), 3);
  ball.position.y = 0.9;
  root.add(ball);
  cbox(root, 0.04, 0.7, 0.04, '#cfcfd6', 0, 0.02, 0);
  cbox(root, 0.32, 0.26, 0.32, '#ff3b5c', 0, -0.36, 0);
  cbox(root, 0.34, 0.06, 0.34, '#ffffff', 0, -0.26, 0);
  return { root };
}

export function makeCloud() {
  const g = group();
  const n = 3 + ((R() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const w = 1.2 + R() * 1.6;
    box(g, w, 0.7 + R() * 0.7, 1 + R(), i % 2 ? '#ffffff' : '#f1f7ff', (i - n / 2) * 0.9, R() * 0.5, R() * 0.4, { shadow: false });
  }
  return g;
}

// ---------- Pickups ----------
export function makeStar() {
  const root = group();
  const spin = group(root);
  const o = (c) => ({ material: glowMat(c), shadow: false });
  cbox(spin, 0.26, 0.82, 0.2, '#ffd23f', 0, 0, 0, o('#ffd23f'));
  cbox(spin, 0.82, 0.26, 0.2, '#ffd23f', 0, 0, 0, o('#ffd23f'));
  cbox(spin, 0.46, 0.46, 0.22, '#ffe98a', 0, 0, 0, o('#ffe98a'));
  cbox(spin, 0.14, 0.14, 0.24, '#fff7c2', -0.08, 0.08, 0, o('#ffffff'));
  return { root, spin };
}

export function makeFuelCell() {
  const root = group();
  const spin = group(root);
  cbox(spin, 0.5, 0.72, 0.5, '#15c2b0', 0, 0, 0, { material: glowMat('#2fe0cc') });
  cbox(spin, 0.54, 0.12, 0.54, '#ffffff', 0, 0.32, 0);
  cbox(spin, 0.54, 0.12, 0.54, '#ffffff', 0, -0.32, 0);
  cbox(spin, 0.2, 0.12, 0.2, '#d9d9e3', 0, 0.46, 0);
  cbox(spin, 0.1, 0.2, 0.05, '#ffe14d', 0.05, 0.07, 0.27, { material: glowMat('#ffe14d') });
  cbox(spin, 0.1, 0.2, 0.05, '#ffe14d', -0.05, -0.09, 0.27, { material: glowMat('#ffe14d') });
  return { root, spin };
}

export function makeHeart() {
  const root = group();
  const spin = group(root);
  const rows = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
  const s = 0.14;
  rows.forEach((row, j) =>
    [...row].forEach((c, i) => c === 'X' && cbox(spin, s, s, 0.22, '', (i - 3) * s, (2.5 - j) * s, 0, { material: glowMat(j === 1 && i === 1 ? '#ffd0d8' : '#ff3b5c') })),
  );
  return { root, spin };
}

// ---------- Rocket extras ----------
// Four landing legs hinged near the base. setLegs(legs, 0) stows them, 1 deploys.
export function addLegs(rocket) {
  const defs = [
    [0.55, 0, 'z', 1],
    [-0.55, 0, 'z', -1],
    [0, 0.55, 'x', -1],
    [0, -0.55, 'x', 1],
  ];
  return defs.map(([x, z, axis, s]) => {
    const p = group(rocket, x, 1.0, z);
    box(p, 0.12, 1.15, 0.12, '#2c3240', 0, -1.15, 0);
    box(p, 0.26, 0.06, 0.26, '#555c68', 0, -1.18, 0);
    return { p, axis, s };
  });
}
export function setLegs(legs, k) {
  const a = Math.PI - 0.12 + (0.5 - (Math.PI - 0.12)) * k;
  legs.forEach((l) => {
    l.p.rotation[l.axis] = a * l.s;
    l.p.visible = k > 0;
  });
}

export function makeFlag() {
  const g = group();
  box(g, 0.08, 2.0, 0.08, '#d9d9e3', 0, 0, 0);
  sign(g, ['FRESHLY'], { x: 0.6, y: 1.3, w: 1.1, h: 0.62, bg: '#15c2b0', fg: '#111', size: 14 });
  return g;
}

// ---------- Sets ----------
// Launch site on Earth: pad top is at y = 0.4, grass at y = 0.
export function makeLaunchSite() {
  const g = group();
  box(g, 260, 4, 150, '#7cc242', 0, -4, -35);
  box(g, 10, 0.06, 7, '#c3c8d0', 0, 0, 0);
  box(g, 3.2, 0.4, 3.2, '#8a9099', 0, 0, 0);
  box(g, 3.3, 0.08, 0.2, '#ffd23f', 0, 0.36, 1.55);
  // Service tower
  const tx = 2.4;
  [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]].forEach(([x, z]) => box(g, 0.14, 6.4, 0.14, '#9aa0a8', tx + x, 0, z));
  for (let y = 0.5; y < 6.2; y += 0.7) {
    box(g, 0.94, 0.1, 0.1, '#ff3b5c', tx, y, 0.4);
    box(g, 0.94, 0.1, 0.1, '#ff3b5c', tx, y, -0.4);
    box(g, 0.1, 0.1, 0.94, '#ff3b5c', tx - 0.4, y, 0);
    box(g, 0.1, 0.1, 0.94, '#ff3b5c', tx + 0.4, y, 0);
  }
  box(g, 1.2, 0.2, 1.2, '#555c68', tx, 6.4, 0);
  box(g, 0.2, 0.3, 0.2, '#ff3b5c', tx, 6.6, 0, { material: glowMat('#ff3b5c') });
  box(g, 1.5, 0.16, 0.3, '#9aa0a8', tx - 1.05, 4.0, 0);
  box(g, 1.5, 0.16, 0.3, '#9aa0a8', tx - 1.05, 2.4, 0);
  // Branding + mission control
  sign(g, ['FRESHLY', 'COMMERCE'], { x: -4.4, y: 0, z: -1.4, w: 2.8, h: 1.0, post: 1.0, bg: '#15c2b0', fg: '#111', size: 18, postColor: '#555c68' });
  box(g, 3.2, 1.4, 2.2, '#f4f6fb', -8.6, 0, -4.5);
  box(g, 3.3, 0.22, 2.3, '#15c2b0', -8.6, 1.4, -4.5);
  box(g, 2.6, 0.4, 0.05, '#2c3240', -8.6, 0.7, -3.38, { shadow: false });
  box(g, 0.1, 0.5, 0.1, '#9aa0a8', -9.4, 1.6, -4.5);
  box(g, 0.7, 0.12, 0.7, '#ffffff', -9.4, 2.1, -4.5);
  // Fuel tanks
  [[6.5, -3], [7.6, -3.4]].forEach(([x, z]) => {
    box(g, 0.9, 1.4, 0.9, '#f4f6fb', x, 0, z);
    box(g, 0.92, 0.16, 0.92, '#ff3b5c', x, 1.0, z);
  });
  // Trees and mountains
  for (let i = 0; i < 26; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (9 + R() * 30);
    const z = -6 - R() * 30;
    (R() < 0.7 ? pine : tree)(g, x, 0, z);
  }
  // Rockies on the horizon: stepped peaks with snow caps
  for (let i = 0; i < 11; i++) {
    const x = -95 + i * 19 + R() * 8;
    const z = -95 - R() * 20;
    const w = 14 + R() * 12;
    const h = 12 + R() * 16;
    const tiers = 5;
    for (let k = 0; k < tiers; k++) {
      const f = 1 - k / tiers;
      const c = k >= tiers - 2 ? '#ffffff' : k === tiers - 3 ? '#b7c1d4' : k % 2 ? '#8792ab' : '#7a86a0';
      box(g, w * f, h / tiers, w * f * 0.8, c, x + k * 0.6, (k * h) / tiers, z);
    }
  }
  return g;
}

// Moon landing set. The pad is centred on x = 0 with its top at y = 0;
// the regolith around it sits 0.3 lower.
export function makeMoonSet() {
  const g = group();
  const lights = [];
  const GREY = ['#b5b5c3', '#d4d4df', '#aeaebb', '#c9c9d6'];
  box(g, 260, 6, 160, '#c3c3d0', 0, -6.3, -40);
  for (let i = 0; i < 70; i++) {
    const x = (R() - 0.5) * 70;
    const z = 6 - R() * 40;
    if (Math.abs(x) < 3.5 && z > -3.5) continue;
    box(g, 0.6 + R() * 2.4, 0.05, 0.6 + R() * 2, pick(GREY), x, -0.3, z, { shadow: false });
  }
  // Craters: dark floor with a raised rim
  [[-9, -6, 2.2], [11, -9, 3], [-16, -16, 3.5], [7, 2.5, 1.4], [-6, 3, 1.1], [20, -3, 2]].forEach(([x, z, r]) => {
    box(g, r * 2, 0.04, r * 1.4, '#9d9dab', x, -0.29, z, { shadow: false });
    box(g, r * 2.2, 0.22, 0.3, '#d8d8e2', x, -0.3, z - r * 0.75);
    box(g, r * 2.2, 0.16, 0.3, '#d8d8e2', x, -0.3, z + r * 0.75);
    box(g, 0.3, 0.2, r * 1.5, '#d8d8e2', x - r * 1.05, -0.3, z);
    box(g, 0.3, 0.2, r * 1.5, '#d8d8e2', x + r * 1.05, -0.3, z);
  });
  // Boulders
  for (let i = 0; i < 16; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (5 + R() * 25);
    const z = -2 - R() * 22;
    const s = 0.4 + R() * 1.1;
    box(g, s, s * 0.7, s, pick(['#9d9dab', '#8e8e9c', '#b0b0be']), x, -0.3, z);
  }
  // Hills on the horizon
  for (let i = 0; i < 12; i++) {
    const x = -90 + i * 16 + R() * 6;
    const h = 3 + R() * 9;
    const w = 12 + R() * 10;
    box(g, w, h, 10, pick(['#a8a8b6', '#b9b9c6', '#9c9caa']), x, -0.3, -55 - R() * 20);
    box(g, w * 0.6, h * 0.35, 8, '#cfcfda', x + 1, h - 0.3, -55);
  }
  // Landing pad: dark deck, yellow ring and X
  box(g, 5.4, 0.12, 5.4, '#2c2f38', 0, -0.3, 0);
  box(g, 5, 0.3, 5, '#3b3f4a', 0, -0.3, 0);
  box(g, 4.4, 0.03, 0.18, '#ffd23f', 0, 0, 2.1, { shadow: false });
  box(g, 4.4, 0.03, 0.18, '#ffd23f', 0, 0, -2.1, { shadow: false });
  box(g, 0.18, 0.03, 4.4, '#ffd23f', 2.1, 0, 0, { shadow: false });
  box(g, 0.18, 0.03, 4.4, '#ffd23f', -2.1, 0, 0, { shadow: false });
  box(g, 3.6, 0.035, 0.26, '#ffd23f', 0, 0, 0, { shadow: false }).rotation.y = Math.PI / 4;
  box(g, 3.6, 0.035, 0.26, '#ffd23f', 0, 0, 0, { shadow: false }).rotation.y = -Math.PI / 4;
  [[-2.5, 2.5], [2.5, 2.5], [-2.5, -2.5], [2.5, -2.5]].forEach(([x, z], i) => {
    box(g, 0.1, 0.5, 0.1, '#9aa0a8', x, -0.3, z);
    const c = i % 2 ? '#3ddc84' : '#ff3b5c';
    lights.push(box(g, 0.2, 0.2, 0.2, c, x, 0.2, z, { material: glowMat(c) }));
  });
  sign(g, ['LUNAR', 'PAD 1'], { x: -6.5, y: -0.3, z: -2.5, w: 2, h: 0.8, post: 0.9, bg: '#111', fg: '#ffd23f', size: 16, postColor: '#9aa0a8' });
  // A little moon base for scale
  box(g, 3, 1.2, 2, '#f4f6fb', 9, -0.3, -7);
  box(g, 3.1, 0.2, 2.1, '#15c2b0', 9, 0.9, -7);
  box(g, 1.2, 0.8, 0.05, '#7fdcff', 9, 0, -5.98, { shadow: false });
  return { root: g, lights };
}
