// Voxel props for Powder Day (snowboard.js). Everything faces -z (downhill) unless noted,
// and is built from the shared voxel helpers so it matches the main site.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, group, sign } from '../../game/voxel.js';
import { makePlayer, pine, rock } from '../../game/models.js';

export const BRAND = { teal: '#15c2b0', black: '#111111', pink: '#ff4d6d', purple: '#7b61ff' };
const R = Math.random;
const pick = (a) => a[(R() * a.length) | 0];

// Merge a group's meshes into one vertex-coloured mesh per shadow setting (in the
// group's local space), so a pine or a whole scenery chunk costs one or two draw
// calls instead of dozens. Multi-material meshes (signs) are kept as-is.
const BAKED = new THREE.MeshLambertMaterial({ vertexColors: true });
export function bake(g) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert();
  const buckets = new Map();
  const keep = [];
  g.traverseVisible((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material)) {
      keep.push(o);
      return;
    }
    const geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const n = geo.attributes.position.count;
    const c = o.material.color;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const key = o.castShadow ? 's' : 'n';
    if (!buckets.has(key)) buckets.set(key, { mat: BAKED, cast: o.castShadow, geos: [] });
    buckets.get(key).geos.push(geo);
  });
  keep.forEach((o) => {
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    o.removeFromParent();
    m.decompose(o.position, o.quaternion, o.scale);
  });
  g.clear();
  for (const b of buckets.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(b.geos), b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  keep.forEach((o) => g.add(o));
  return g;
}

// ---------- Obstacles ----------

export function makePineObstacle() {
  const g = group();
  const s = group(g);
  s.scale.setScalar(1.35 + R() * 0.25);
  pine(s, 0, 0, 0, true);
  return bake(g);
}

export function makeRockObstacle() {
  const g = group();
  const s = group(g);
  s.scale.set(1.35, 1.5, 1.35);
  rock(s, 0, 0, 0, '#a3aec0');
  box(s, 0.5, 0.06, 0.44, '#ffffff', 0.05, 0.55, 0);
  box(s, 0.3, 0.05, 0.3, '#ffffff', -0.18, 0.35, 0.12);
  return bake(g);
}

// Faces +z: he is watching the riders come down.
export function makeSnowman() {
  const g = group();
  box(g, 0.95, 0.75, 0.95, '#ffffff', 0, 0, 0);
  box(g, 0.72, 0.6, 0.72, '#f6faff', 0, 0.72, 0);
  box(g, 0.52, 0.46, 0.52, '#ffffff', 0, 1.3, 0);
  box(g, 0.08, 0.08, 0.04, '#111', -0.12, 1.56, 0.27);
  box(g, 0.08, 0.08, 0.04, '#111', 0.12, 1.56, 0.27);
  box(g, 0.1, 0.1, 0.3, '#ff8a1f', 0, 1.42, 0.4);
  [-0.12, -0.04, 0.04, 0.12].forEach((x, i) => box(g, 0.05, 0.05, 0.03, '#111', x, i % 3 ? 1.36 : 1.38, 0.27));
  box(g, 0.09, 0.09, 0.04, '#111', 0, 1.0, 0.37);
  box(g, 0.09, 0.09, 0.04, '#111', 0, 0.82, 0.37);
  // Freshly-teal beanie and a pink scarf.
  box(g, 0.56, 0.2, 0.56, BRAND.teal, 0, 1.74, 0);
  box(g, 0.14, 0.12, 0.14, '#ffffff', 0, 1.94, 0);
  box(g, 0.76, 0.12, 0.76, BRAND.pink, 0, 1.24, 0);
  box(g, 0.16, 0.36, 0.06, BRAND.pink, 0.2, 0.92, 0.4);
  const a = box(g, 0.62, 0.06, 0.06, '#6b4a2f', -0.62, 1.0, 0);
  a.rotation.z = -0.5;
  const b = box(g, 0.62, 0.06, 0.06, '#6b4a2f', 0.62, 1.0, 0);
  b.rotation.z = 0.5;
  return bake(g);
}

const JACKETS = ['#ff4d6d', '#ffd23f', '#2ec4ff', '#7b61ff', '#ff8a1f', '#3ddc84', '#15c2b0', '#ff8fb1'];
const HELMETS = ['#ffffff', '#ff3b5c', '#ffd23f', '#2b6cff', '#ff8fb1', '#1b1b1f', '#3ddc84'];
const SKINS = ['#f1c7a3', '#c68a64', '#8d5a3b', '#e2b08c', '#a8714a'];
const PANTS = ['#2c3a57', '#1b1b1f', '#4b2a7b', '#0f9486', '#c42b4a'];

// A ski-school kid: tiny, round, bright jacket, helmet, goggles, pizza-stance skis.
export function makeKid(i = 0) {
  const g = group();
  const s = group(g);
  s.scale.setScalar(0.82);
  const jacket = JACKETS[i % JACKETS.length];
  const helmet = HELMETS[(i * 3 + 1) % HELMETS.length];
  const skin = pick(SKINS);
  const pants = pick(PANTS);
  const ski = pick(['#ffd23f', '#ff3b5c', '#2ec4ff', '#ffffff']);
  // Skis (pizza!) with upturned tips.
  [-1, 1].forEach((sd) => {
    const k = box(s, 0.12, 0.05, 1.0, ski, sd * 0.16, 0, -0.08);
    k.rotation.y = sd * 0.18;
    box(s, 0.12, 0.06, 0.08, ski, sd * 0.07, 0.04, -0.6);
    box(s, 0.17, 0.16, 0.24, '#2b2f36', sd * 0.13, 0.05, 0);
    box(s, 0.15, 0.24, 0.18, pants, sd * 0.11, 0.2, 0);
  });
  box(s, 0.44, 0.38, 0.3, jacket, 0, 0.42, 0);
  // Ski-school pinny over the jacket.
  box(s, 0.46, 0.2, 0.32, '#ff8a1f', 0, 0.5, 0);
  box(s, 0.12, 0.1, 0.02, '#ffffff', 0, 0.55, 0.165);
  box(s, 0.12, 0.1, 0.02, '#ffffff', 0, 0.55, -0.165);
  // Arms out for balance.
  [-1, 1].forEach((sd) => {
    const a = box(s, 0.3, 0.12, 0.14, jacket, sd * 0.33, 0.6, 0);
    a.rotation.z = sd * -0.4;
    box(s, 0.1, 0.1, 0.1, '#ffd23f', sd * 0.48, 0.48, 0);
  });
  box(s, 0.34, 0.3, 0.32, skin, 0, 0.8, 0);
  box(s, 0.4, 0.2, 0.38, helmet, 0, 1.02, 0.01);
  box(s, 0.38, 0.11, 0.04, '#1b1b1f', 0, 0.9, -0.17);
  box(s, 0.3, 0.07, 0.03, pick(['#ffb020', '#7fdcff', '#ff8fb1']), 0, 0.92, -0.19);
  box(s, 0.12, 0.04, 0.02, '#c0504d', 0, 0.84, -0.165);
  return bake(g);
}

// The ski instructor leading the train: red jacket with a white cross, helmet, shades.
export function makeCoach() {
  const p = makePlayer({ shirt: '#e8333f', shirtDark: '#b8202c', pants: '#1b1b1f', beard: null, hair: '#6b4a2f', skin: '#e2b08c', helmet: '#1b1b1f' });
  p.gear.helmet.visible = true;
  p.gear.shades.visible = true;
  const g = group();
  g.add(p.root);
  p.root.position.y = 0.05;
  box(p.body, 0.08, 0.24, 0.02, '#ffffff', 0, 0.4, 0.16);
  box(p.body, 0.24, 0.08, 0.02, '#ffffff', 0, 0.48, 0.16);
  [-1, 1].forEach((sd) => {
    box(g, 0.12, 0.05, 1.4, '#1b1b1f', sd * 0.1, 0, -0.05);
    box(g, 0.12, 0.06, 0.08, '#1b1b1f', sd * 0.1, 0.04, -0.75);
  });
  return bake(g);
}

// ---------- Terrain park features ----------

// Snow kicker rising toward -z. Local z: +len/2 is the takeoff, -len/2 the lip.
export function makeKicker(big) {
  const w = big ? 3.4 : 2.8;
  const h = big ? 1.4 : 0.85;
  const len = big ? 3.6 : 2.6;
  const g = group();
  const n = Math.round(len / 0.2);
  for (let i = 0; i < n; i++) {
    box(g, w, (h * (i + 1)) / n, 0.2, i % 2 ? '#f4f8fe' : '#e6eef9', 0, 0, len / 2 - 0.1 - i * 0.2);
  }
  box(g, w + 0.04, 0.08, 0.22, big ? BRAND.pink : BRAND.teal, 0, h - 0.05, -len / 2 + 0.11);
  box(g, 0.06, h * 0.7, len * 0.9, '#d3dfee', -w / 2 - 0.01, 0, -len * 0.05, { shadow: false });
  box(g, 0.06, h * 0.7, len * 0.9, '#d3dfee', w / 2 + 0.01, 0, -len * 0.05, { shadow: false });
  // Lip marker poles with little flags.
  [-1, 1].forEach((sd) => {
    box(g, 0.08, h + 0.9, 0.08, '#1b1b1f', sd * (w / 2 + 0.2), 0, -len / 2 + 0.1);
    box(g, 0.4, 0.28, 0.04, sd < 0 ? BRAND.teal : BRAND.pink, sd * (w / 2 + 0.42), h + 0.58, -len / 2 + 0.1);
  });
  return { g: bake(g), w, h, len, big };
}

// SIMPLE BUNDLES fun box with a snow entry ramp. Local z: +L/2 is the entry.
export function makeFunbox() {
  const H = 0.5;
  const L = 8.4;
  const ramp = 1.4;
  const w = 0.7;
  const g = group();
  const n = Math.round(ramp / 0.2);
  for (let i = 0; i < n; i++) box(g, 1.1, (H * (i + 1)) / n, 0.2, i % 2 ? '#f4f8fe' : '#e6eef9', 0, 0, L / 2 - 0.1 - i * 0.2);
  const bl = L - ramp;
  const bc = -ramp / 2;
  box(g, w, H, bl, BRAND.teal, 0, 0, bc);
  box(g, w + 0.04, 0.07, bl, '#1b1b1f', 0, H - 0.06, bc);
  box(g, w + 0.02, 0.1, bl, BRAND.pink, 0, 0.14, bc);
  for (let z = bc - bl / 2 + 0.6; z < bc + bl / 2; z += 1.6) box(g, w + 0.03, 0.1, 0.5, '#ffffff', 0, 0.14, z);
  return { g: bake(g), H, L, ramp, w };
}

// ---------- Sponsor dressing ----------

export const BANNERS = [
  { text: 'FRESHLY COMMERCE', bg: BRAND.black, fg: BRAND.teal },
  { text: 'SIMPLE BUNDLES', bg: BRAND.teal, fg: BRAND.black },
  { text: 'SIMPLE DISCOUNTS', bg: BRAND.purple, fg: '#ffffff' },
  { text: 'FRESHLY COMMERCE', bg: BRAND.pink, fg: '#ffffff' },
];

export function makeBanner(i) {
  const b = BANNERS[i % BANNERS.length];
  const g = group();
  sign(g, [b.text], { w: 3.6, h: 0.85, post: 0.95, bg: b.bg, fg: b.fg, size: 22, postColor: '#1b1b1f' });
  return g;
}

// Race gate spanning the course: two pillars, a crossbar and a big banner.
export function makeArch(lines, bg = BRAND.black, fg = BRAND.teal) {
  const g = group();
  const X = 8.1;
  [-1, 1].forEach((sd) => {
    box(g, 0.6, 4.6, 0.6, BRAND.black, sd * X, 0, 0);
    box(g, 0.64, 0.34, 0.64, BRAND.teal, sd * X, 1.0, 0);
    box(g, 0.64, 0.34, 0.64, BRAND.pink, sd * X, 2.2, 0);
    box(g, 0.64, 0.34, 0.64, BRAND.purple, sd * X, 3.4, 0);
  });
  box(g, X * 2 + 0.6, 0.34, 0.5, BRAND.black, 0, 4.6, 0);
  bake(g);
  sign(g, lines, { w: 9.5, h: 1.6, y: 2.95, z: 0.32, bg, fg, size: 30, border: fg });
  return g;
}

// Feather flag (faces +z), for the chunk dressing.
function featherFlag(p, x, z, color) {
  box(p, 0.08, 2.5, 0.08, '#1b1b1f', x, 0, z);
  box(p, 0.55, 1.5, 0.05, color, x + 0.31 * Math.sign(-x), 0.85, z);
  box(p, 0.4, 0.16, 0.05, color, x + 0.24 * Math.sign(-x), 2.35, z);
  box(p, 0.55, 0.12, 0.055, '#ffffff', x + 0.31 * Math.sign(-x), 1.6, z);
}

// One slice of slope: groomed course, race fence, flags, pines and drifts off-piste.
export function makeChunk(len) {
  const g = group();
  box(g, 320, 1, len, '#e7eff9', 0, -1, 0, { shadow: false });
  box(g, 15.6, 1.012, len, '#f5f9ff', 0, -1, 0, { shadow: false });
  for (let i = 0; i < 6; i++) {
    box(g, 0.8 + R() * 2.2, 0.02, 0.5 + R() * 1.8, R() < 0.5 ? '#e9f1fb' : '#eef4fc', (R() - 0.5) * 13, 0.012, (R() - 0.5) * (len - 2), { shadow: false });
  }
  for (let i = 0; i < 5; i++) {
    box(g, 0.12, 0.02, 0.12, '#ffffff', (R() - 0.5) * 14, 0.02, (R() - 0.5) * len, { shadow: false });
  }
  const flagCols = [BRAND.teal, BRAND.pink, BRAND.purple, BRAND.black];
  [-1, 1].forEach((sd) => {
    for (let z = -len / 2; z < len / 2 - 0.1; z += 2.5) box(g, 0.1, 0.62, 0.1, '#1b1b1f', sd * 7.75, 0, z + 1.25);
    box(g, 0.05, 0.07, len, BRAND.pink, sd * 7.75, 0.5, 0, { shadow: false });
    box(g, 0.05, 0.07, len, BRAND.pink, sd * 7.75, 0.24, 0, { shadow: false });
    featherFlag(g, sd * 8.4, -len / 4 + (sd > 0 ? len / 2 : 0), pick(flagCols));
    // Off-piste: pines, drifts and the odd rock.
    for (let i = 0; i < 6; i++) {
      const p = group(g, sd * (9.8 + R() * 24), 0, (R() - 0.5) * len);
      p.scale.setScalar(1 + R() * 1.1);
      pine(p, 0, 0, 0, true);
    }
    for (let i = 0; i < 2; i++) {
      const x = sd * (10 + R() * 14);
      const z = (R() - 0.5) * len;
      const w = 1.4 + R() * 2;
      box(g, w, 0.35, w * 0.8, '#f2f7fd', x, 0, z);
      box(g, w * 0.6, 0.3, w * 0.5, '#ffffff', x, 0.35, z);
    }
    if (R() < 0.4) rock(g, sd * (9.5 + R() * 10), 0, (R() - 0.5) * len, '#c9d3e3');
  });
  return bake(g);
}

// Distant range that travels with the camera (not fogged, so it reads as far away).
export function makeBackdrop() {
  const g = group();
  const mats = ['#b5c6dd', '#d5e1ef', '#ffffff'].map((c) => new THREE.MeshBasicMaterial({ color: c, fog: false }));
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 16; i++) {
    const x = -150 + i * 20 + (R() - 0.5) * 10;
    const h = 16 + R() * 26;
    const steps = 7;
    for (let s = 0; s < steps; s++) {
      const w = (1 - s / steps) * h * 1.3;
      const m = new THREE.Mesh(geo, mats[s > steps * 0.55 ? 2 : s > steps * 0.3 ? 1 : 0]);
      m.scale.set(w, h / steps, w * 0.5);
      m.position.set(x + (R() - 0.5) * 3, (s + 0.5) * (h / steps) - 2, -(R() * 20));
      g.add(m);
    }
  }
  return g;
}

// ---------- The avalanche ----------
// A tumbling wall of snow voxels plus a powder cloud. Local z: 0 is the front edge,
// the body trails behind it (+z). Call update(t) every frame.
export function makeAvalanche() {
  const g = group();
  const N = 230;
  // Emissive fill keeps the shaded faces snowy instead of grey.
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ emissive: '#9aabc4', emissiveIntensity: 0.55 }), N);
  im.castShadow = true;
  im.receiveShadow = true;
  im.frustumCulled = false;
  g.add(im);
  const cols = ['#ffffff', '#f3f8ff', '#e4edf8', '#d2deee', '#bfcde2'];
  const c = new THREE.Color();
  const P = [];
  for (let i = 0; i < N; i++) {
    const d = Math.pow(R(), 0.7) * 8 - 0.6;
    const top = 0.8 + Math.max(0, d) * 0.62;
    P.push({
      x: (R() - 0.5) * 36,
      d,
      y: R() * top,
      s: 0.45 + R() * 0.7 + Math.max(0, d) * 0.1,
      rad: 0.25 + R() * 0.6,
      w: 2.5 + R() * 3.5,
      ph: R() * 6.28,
    });
    im.setColorAt(i, c.set(cols[(R() * cols.length) | 0]));
  }
  const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, transparent: true, opacity: 0.4, depthWrite: false });
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), cloudMat);
    const s = 2 + R() * 2.2;
    m.scale.set(s, s * 0.8, s);
    m.userData = { x: -16 + i * 2.5 + (R() - 0.5) * 2, y: 2.6 + R() * 1.8, z: 3.5 + R() * 4, ph: R() * 6.28 };
    clouds.push(m);
    g.add(m);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  function update(t) {
    for (let i = 0; i < N; i++) {
      const p = P[i];
      const a = t * p.w + p.ph;
      pos.set(p.x, p.y + p.rad * (1 + Math.sin(a)) + p.s / 2, p.d + p.rad * Math.cos(a));
      e.set(-a, p.ph, a * 0.4);
      q.setFromEuler(e);
      sc.setScalar(p.s);
      im.setMatrixAt(i, m4.compose(pos, q, sc));
    }
    im.instanceMatrix.needsUpdate = true;
    for (const m of clouds) {
      const u = m.userData;
      m.position.set(u.x, u.y + Math.sin(t * 1.3 + u.ph) * 0.4, u.z + Math.cos(t * 1.1 + u.ph) * 0.4);
      m.rotation.set(t * 0.3 + u.ph, t * 0.2, 0);
    }
  }
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  update(0);
  return { group: g, update };
}
