import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, group, sign, mat, rand, pick } from './voxel.js';
import { MARKERS, MEMORIES } from './story.js';
import {
  makeCar, makeTruck, makeBronco, makeBike, makeBoat, makeSnowboard, makeChair, makeRocket,
  tree, autumnTree, pine, rock, cactus, mesa, flowers, makePlayer, makeDolphin,
} from './models.js';

// Lane index L maps to world z = -L. Positive L is the future, negative is the past.
export const L_MIN = -44;
export const L_MAX = 84;
const WIDTH = 44;

export const ROAD_LANES = new Set([3, 4, 6, 7]);
const WATER = [24, 30];
const MUD = [14, 17];
const TRAIL = [33, 45];

// The 2005 Saudi Arabia to Canada scene is personal-route only.
let personalWorld = false;

// Canadian flags along the whole route (we're still in Canada).
const CANADA_FLAGS = [
  [-2.2, -35.6], [3.2, -36.8], [-5.8, -34.2], // behind UWaterloo
  [-6.8, -27.4], [-2.6, -30.4], [2.6, -31.2], // UWaterloo
  [2.4, -21.3], [4.4, -10.1], [-2.2, -0.3], // LANSA, Toronto, founding
  [-3.4, 8.4], [-2.2, 22.9], [2.8, 32.4], [3.4, 38.2], // road, camp, beach, trail
  [-3.6, 46.4], [-7.2, 57.2], [-2.6, 72.4], // Now, basecamp, launch pad
];

export function laneType(L) {
  if (personalWorld && L <= -39) return 'sand'; // Saudi Arabia, 2005
  if (L < -1) return 'past';
  if (ROAD_LANES.has(L)) return 'road';
  if (L <= 10) return 'grass';
  if (L <= 23) return 'sand';
  if (L <= WATER[1]) return L >= WATER[0] ? 'water' : 'sand';
  if (L <= 32) return 'sand';
  if (L <= TRAIL[1]) return 'forest';
  return 'snow';
}

export function laneHeight(L) {
  if (laneType(L) === 'water') return -0.3;
  if (L <= 46) return 0;
  if (L <= 56) return (L - 46) * 0.8;
  if (L <= 59) return 8; // basecamp plateau
  if (L <= 67) return 8 - (L - 59) * 0.2;
  if (L <= 73) return 6.4 + (L - 67) * 0.9;
  return 11.8;
}

// Smooth height for moving actors between lane centers.
export function groundAt(Lf) {
  const a = Math.floor(Lf);
  const t = Lf - a;
  return laneHeight(a) * (1 - t) + laneHeight(a + 1) * t;
}

const COLORS = {
  past: ['#d9cf7c', '#cfc471'],
  grass: ['#a9e35b', '#9dd752'],
  road: ['#4b5160', '#4b5160'],
  sand: ['#f3d89b', '#ecce8b'],
  water: ['#4fc3f7', '#49bbef'],
  forest: ['#86c95a', '#7cbf51'],
  snow: ['#f5f9ff', '#e7eff9'],
};

const z = (L) => -L;

export function buildWorld(scene, mode = 'pro') {
  personalWorld = mode === 'personal';
  const root = group(scene);
  const stat = group(root); // merged into a handful of meshes after build
  const anim = []; // per-frame updaters
  const cars = [];
  const props = {};

  // ---------- Terrain ----------
  for (let L = L_MIN; L <= L_MAX; L++) {
    const t = laneType(L);
    const top = laneHeight(L);
    const c = COLORS[t][((L % 2) + 2) % 2];
    box(stat, WIDTH, top + 4, 1, c, 0, -4, z(L), { shadow: false });
    if (t === 'forest') box(stat, 3, 0.04, 1, L % 2 ? '#b27b4f' : '#a8714a', 0, top, z(L), { shadow: false });
    if (t === 'road') {
      box(stat, WIDTH, 0.02, 0.06, '#5c6272', 0, top, z(L) - 0.47, { shadow: false });
      if (ROAD_LANES.has(L + 1)) {
        for (let x = -20; x < 20; x += 2.2) box(stat, 1, 0.03, 0.08, '#f2f2f2', x, top, z(L) - 0.5, { shadow: false });
      }
    }
    // Rock face on rising lanes so the mountain reads as a climb from above.
    const rise = top - laneHeight(L - 1);
    if (t === 'snow' && rise > 0.05) {
      // Sit just in front of the lane's front face (never in the same plane, or it flickers).
      box(stat, WIDTH - 0.02, rise - 0.01, 0.02, '#aebdd6', 0, top - rise, z(L) + 0.512, { shadow: false });
      box(stat, WIDTH - 0.02, 0.08, 0.02, '#ffffff', 0, top - 0.09, z(L) + 0.535, { shadow: false });
    }
    if (t === 'past' && L % 3 === 0) {
      // Faded cobblestone "memory lane"
      box(stat, 1.2, 0.03, 0.8, '#c2b56a', 0, top, z(L), { shadow: false });
    }
  }
  // Edge fence at the very beginning of the timeline.
  for (let x = -8; x <= 8; x += 0.8) box(stat, 0.12, 0.6, 0.12, '#8b6a4a', x, 0, z(L_MIN + 1));
  box(stat, 16.4, 0.1, 0.1, '#8b6a4a', 0, 0.45, z(L_MIN + 1));

  // ---------- Scatter helpers ----------
  const sideX = () => (rand() < 0.5 ? -1 : 1) * (2.2 + rand() * 8);
  // Areas kept free of random trees and rocks so signs and banners stay readable.
  const KEEP = [
    ...[36, 39, 41.6].map((L) => [-2.6, L, 1.8]),
    ...MARKERS.map((m) => [m.x - 0.4, m.L, 1.9]),
    ...MEMORIES.map((m) => [m.x, m.L, 2.6]),
    ...CANADA_FLAGS.map(([x, L]) => [x, L, 0.8]),
    [2.9, 23.2, 1.7],
    [5.8, 73.8, 2.8], // launch pad team
    [5.9, 50.6, 0.6], // the Easter egg (trees around it, not on it)
  ];
  const clear = (x, L) => KEEP.every(([kx, kL, r]) => Math.hypot(x - kx, L - kL) > r);
  const scatter = (L, n, fn) => {
    for (let i = 0; i < n; i++) {
      const x = sideX();
      const dz = (rand() - 0.5) * 0.4;
      if (clear(x, L - dz)) fn(x, laneHeight(L), z(L) + dz);
    }
  };

  // ---------- The past ----------
  for (let L = L_MIN + 2; L <= -2; L++) {
    if ([-36, -28, -26, -22, -16, -11, -6].some((s) => Math.abs(s - L) <= 1)) continue;
    if (personalWorld && L <= -39) {
      if (rand() < 0.6) palm(stat, sideX(), 0, z(L));
      continue;
    }
    scatter(L, 2, (x, y, zz) => (rand() < 0.5 ? autumnTree(stat, x, y, zz) : tree(stat, x, y, zz)));
    if (rand() < 0.6) flowers(stat, sideX(), 0, z(L));
  }
  pastLandmarks(stat, anim);
  if (personalWorld) movingToCanada(stat, root, anim);
  tobiStage(stat, anim);
  CANADA_FLAGS.forEach(([x, L]) => canadaFlag(stat, root, anim, x, L));
  // Shopify bags around the App Challenge
  shopifyBag(stat, -1.8, 0, z(2.6), 0.09);
  shopifyBag(stat, 6.4, 0, z(-0.9), 0.07);

  // ---------- The present ----------
  for (let L = -1; L <= 2; L++) if (rand() < 0.8) flowers(stat, sideX(), 0, z(L));
  [-9, -8.2, 8.4, 9.2].forEach((x) => tree(stat, x, 0, z(0)));
  presentLandmarks(stat, root, anim);

  // ---------- Road ----------
  [
    [3, 1, 2.6], [4, -1, 3.4], [6, 1, 2.2], [7, -1, 3.0],
  ].forEach(([L, dir, speed]) => {
    for (let i = 0; i < 3; i++) {
      const truck = rand() < 0.3;
      const m = truck ? makeTruck() : makeCar();
      m.position.set(-16 + i * 11 + rand() * 3, 0, z(L));
      // Cars face +x, trucks have their cab at -x.
      if ((dir < 0) !== truck) m.rotation.y = Math.PI;
      root.add(m);
      cars.push({ mesh: m, L, v: dir * speed, len: truck ? 2.6 : 1.8 });
    }
  });
  [8, 9, 10].forEach((L) => scatter(L, 2, (x, y, zz) => tree(stat, x, y, zz)));
  [1, 2, 5, 8, 9].forEach((L) => scatter(L, 1, (x, y, zz) => rock(stat, x, y, zz)));
  sign(stat, ['$10K MRR'], { x: -2.4, z: z(10) - 0.3, w: 2.2, h: 0.7, post: 0.6, bg: '#ffd23f', fg: '#1b1b1f', size: 26 });
  booth(stat, -5.6, 9.3, '#ffe3ec', '#ff4d6d', 'SIMPLE', 'BUNDLES');

  // ---------- Desert + mud pit + campsite ----------
  for (let L = 11; L <= 21; L++) {
    if (rand() < 0.7) cactus(stat, sideX(), 0, z(L));
    if (rand() < 0.3) rock(stat, sideX(), 0, z(L), '#d9a36b');
  }
  mesa(stat, -9, 0, z(13), 3.5, 2.8);
  mesa(stat, 8.5, 0, z(16), 4, 3.4);
  mesa(stat, -8, 0, z(19), 2.6, 2);
  for (let L = MUD[0]; L <= MUD[1]; L++) {
    box(stat, 5.4, 0.06, 1, L % 2 ? '#6b4a2f' : '#5e4028', 0, 0, z(L), { shadow: false });
    for (let i = 0; i < 4; i++) box(stat, 0.3 + rand() * 0.4, 0.12, 0.3 + rand() * 0.3, '#4f3521', -2.4 + rand() * 4.8, 0, z(L) + (rand() - 0.5) * 0.7);
  }
  sign(stat, ['MUD', 'PIT'], { x: -3.4, z: z(13), w: 1.1, h: 0.7, post: 0.4, bg: '#6b4a2f', fg: '#ffd23f', size: 14 });
  campsite(stat, anim);

  // ---------- Beach + ocean ----------
  [22, 23, 31, 32].forEach((L) => {
    const px = pick([-6, -4.5, 5, 6.5]) + rand();
    if (clear(px, L)) palm(stat, px, 0, z(L));
    if (rand() < 0.5) box(stat, 0.9, 0.04, 0.5, pick(['#ff6fa8', '#7fdcff', '#ffd23f']), sideX(), 0, z(L), { shadow: false });
  });
  const foam = [];
  for (let L = WATER[0]; L <= WATER[1]; L++) {
    for (let i = 0; i < 9; i++) {
      const f = box(root, 0.3 + rand() * 0.6, 0.06, 0.2, '#e8fbff', -10 + rand() * 20, -0.31, z(L) + (rand() - 0.5) * 0.6, { shadow: false });
      foam.push({ m: f, p: rand() * 6, x0: f.position.x });
    }
  }
  // Two short curling waves under the wakeboard line to launch off.
  const crests = [[26, 0.5], [28, 0.9]].map(([L, cx]) => {
    const g = group(root, cx, -0.3, z(L));
    box(g, 3.2, 0.25, 0.8, '#3fb0e6', 0, 0, 0, { shadow: false });
    box(g, 2.6, 0.2, 0.55, '#5cc4ef', 0, 0.25, 0.05, { shadow: false });
    box(g, 2.2, 0.1, 0.3, '#ffffff', 0, 0.45, 0.15, { shadow: false });
    box(g, 0.3, 0.08, 0.2, '#e8fbff', -1.4, 0.26, 0.3, { shadow: false });
    box(g, 0.3, 0.08, 0.2, '#e8fbff', 1.4, 0.26, 0.3, { shadow: false });
    return g;
  });
  anim.push((dt, t) => {
    foam.forEach((f) => {
      f.m.position.y = -0.3 + Math.sin(t * 2 + f.p) * 0.04;
      f.m.position.x = f.x0 + Math.sin(t * 0.5 + f.p) * 0.4;
    });
    crests.forEach((c, i) => (c.position.y = -0.36 + Math.sin(t * 1.6 + i * 2) * 0.1));
  });
  surfShack(stat, -4, z(31.6));
  // Dolphins leaping across the water, each on its own loop.
  [[-6.5, 25, 0], [5.5, 27, 1.3], [9, 24.5, 2.4], [-10, 28, 3.1]].forEach(([x, L0, phase]) => {
    const d = makeDolphin();
    root.add(d);
    anim.push((dt, t) => {
      const u = ((t + phase) % 4) / 4; // leap during the first 40% of each loop
      const k = u / 0.4;
      d.visible = k < 1;
      if (!d.visible) return;
      d.position.set(x, -0.7 + Math.sin(k * Math.PI) * 1.6, z(L0 + k * 2.4));
      d.rotation.x = (0.5 - k) * 1.8;
    });
  });
  // Boat launch dock
  for (let L = 22.6; L <= 25.4; L += 0.4) box(stat, 1.2, 0.12, 0.36, '#b5875a', -0.9, L > 23.5 ? -0.15 : 0, z(L));
  for (const L of [23.8, 25.2]) {
    box(stat, 0.14, 0.7, 0.14, '#7a4b33', -1.45, -0.6, z(L));
    box(stat, 0.14, 0.7, 0.14, '#7a4b33', -0.35, -0.6, z(L));
  }
  sign(stat, ['SIMPLE BUNDLES', '2.0 LAUNCH'], { x: 2.9, z: z(23.2), w: 2.6, h: 0.9, post: 0.6, bg: '#ff4d6d', fg: '#fff', size: 20 });

  // ---------- Forest trail ----------
  for (let L = TRAIL[0]; L <= TRAIL[1]; L++) {
    scatter(L, 3, (x, y, zz) => (rand() < 0.6 ? pine(stat, x, y, zz) : tree(stat, x, y, zz)));
    const rx = sideX();
    if (rand() < 0.4 && clear(rx, L)) rock(stat, rx, 0, z(L));
  }
  [36, 39].forEach((L) => {
    box(stat, 2.6, 0.36, 0.38, '#7a4b33', 0, 0, z(L));
    box(stat, 0.06, 0.3, 0.3, '#d9a36b', -1.31, 0.03, z(L));
    box(stat, 0.06, 0.3, 0.3, '#d9a36b', 1.31, 0.03, z(L));
  });
  // Kicker ramp rising toward the future (z decreasing).
  for (let i = 0; i < 5; i++) box(stat, 1.6, 0.16 * (i + 1), 0.2, '#9b6b43', 0.3, 0, z(41.3 + i * 0.2));
  box(stat, 1.6, 0.05, 1.0, '#c89163', 0.3, 0.8, z(41.9));
  [
    [36, 'GLOSSIER', '#f6c6d0', '#1b1b1f'],
    [39, 'STANLEY', '#1e6b3a', '#ffffff'],
    [41.6, 'YAMAHA', '#4b2a7b', '#ffffff'],
  ].forEach(([L, name, bg, fg]) => {
    sign(stat, [name], { x: -2.6, z: z(L), w: 2.2, h: 0.6, post: 0.7, bg, fg, size: 24 });
  });

  // ---------- Mountain ----------
  for (let L = 46; L <= L_MAX; L++) {
    const y = laneHeight(L);
    if (L >= 55 && L <= 60) continue; // basecamp
    const px = pick([-1, 1]) * (4.5 + rand() * 6);
    if (rand() < 0.8 && clear(px, L)) pine(stat, px, y, z(L), true);
    const rx = sideX();
    if (rand() < 0.3 && clear(rx, L)) rock(stat, rx, y, z(L), '#c9d3e3');
  }
  // Pines around the hidden Easter egg on the slope.
  pine(stat, 6.9, laneHeight(50), z(50.2), true);
  pine(stat, 5.0, laneHeight(51), z(51.2), true);
  // Big backdrop peaks on both sides.
  [[-13, 58, 14], [12, 64, 16], [-11, 74, 12], [13, 78, 10]].forEach(([x, L, h]) => peak(stat, x, z(L), h));
  liftSystem(stat, root, anim);
  [60.5, 63].forEach((L) => {
    const y = groundAt(L);
    box(stat, 3.0, 0.35, 1.2, '#ffffff', 0.4, y, z(L));
    box(stat, 2.2, 0.35, 0.85, '#f4f8ff', 0.4, y + 0.35, z(L));
    box(stat, 1.3, 0.3, 0.5, '#ffffff', 0.4, y + 0.7, z(L));
  });
  for (let i = 0; i < 5; i++) box(stat, 2.4, 0.26 * (i + 1), 0.2, '#dfe9f7', 0.4, groundAt(64.7 + i * 0.2), z(64.7 + i * 0.2));
  sign(stat, ['TERRAIN', 'PARK'], { x: -2.8, z: z(61.6), y: groundAt(61.6), w: 2.2, h: 0.8, post: 0.5, bg: '#2b6cff', fg: '#fff', size: 16 });
  basecamp(stat, anim);
  summit(stat, root, anim);

  // ---------- Rideable props (moved around by the story) ----------
  props.bronco = makeBronco();
  props.bike = makeBike();
  props.boat = makeBoat();
  props.board = makeSnowboard();
  props.chair = makeChair();
  props.rocket = makeRocket();
  Object.values(props).forEach((p) => root.add(p));

  MARKERS.forEach((m) => marker(stat, root, anim, m));
  if (mode === 'personal') MEMORIES.forEach((m) => memory(stat, root, anim, m));

  bake(stat);

  return {
    root,
    cars,
    props,
    update(dt, t, actor) {
      anim.forEach((fn) => fn(dt, t));
      for (const c of cars) {
        let v = c.v;
        // Polite drivers: brake for Basil if he's standing in their lane.
        if (actor && Math.round(actor.L) === c.L && Math.abs(actor.L - c.L) < 0.3) {
          const ahead = (actor.x - c.mesh.position.x) * Math.sign(v);
          if (ahead > 0 && ahead < c.len / 2 + 1.1) v = 0;
        }
        c.mesh.position.x += v * dt;
        if (c.mesh.position.x > 18) c.mesh.position.x -= 36;
        if (c.mesh.position.x < -18) c.mesh.position.x += 36;
      }
    },
    laneClear(L, x, horizon = 0.45) {
      return cars.every((c) => {
        if (c.L !== L) return true;
        const r = c.len / 2 + 0.6;
        const x0 = c.mesh.position.x;
        const x1 = x0 + c.v * horizon;
        const lo = Math.min(x0, x1) - r;
        const hi = Math.max(x0, x1) + r;
        return x < lo || x > hi;
      });
    },
  };
}

// Merge every static mesh into one mesh per material: thousands of boxes -> ~50 draw calls.
function bake(g) {
  g.updateMatrixWorld(true);
  const buckets = new Map();
  const keep = [];
  // Hidden meshes (e.g. unused character gear) are dropped from the merge.
  g.traverseVisible((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material)) {
      keep.push(o);
      return;
    }
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const key = o.material.uuid + (o.castShadow ? 's' : 'n');
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, geos: [] });
    buckets.get(key).geos.push(geo);
  });
  // Detach sign meshes with their world transform before clearing.
  keep.forEach((o) => {
    const m = o.matrixWorld.clone();
    o.removeFromParent();
    m.decompose(o.position, o.quaternion, o.scale);
  });
  g.clear();
  g.position.set(0, 0, 0);
  for (const b of buckets.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(b.geos), b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  keep.forEach((o) => g.add(o));
}

function palm(p, x, y, zz) {
  const g = group(p, x, y, zz);
  for (let i = 0; i < 5; i++) box(g, 0.22, 0.3, 0.22, '#9b6b43', i * 0.05, i * 0.3, 0);
  const top = 1.5;
  // Leaves at slightly different heights so their crossing doesn't flicker.
  box(g, 0.3, 0.15, 0.3, '#3fae6a', 0.25, top, 0);
  box(g, 1.4, 0.1, 0.3, '#48c774', 0.25, top + 0.1, 0);
  box(g, 0.3, 0.1, 1.4, '#48c774', 0.25, top + 0.12, 0);
  box(g, 0.14, 0.14, 0.14, '#7a4b33', 0.1, top - 0.1, 0.12);
}

function peak(p, x, zz, h) {
  const g = group(p, x, 0, zz);
  for (let i = 0; i < h; i++) {
    const w = (h - i) * 1.1;
    const c = i > h * 0.6 ? '#ffffff' : i > h * 0.35 ? '#c9d3e3' : '#9aa8bd';
    box(g, w, 1, w * 0.8, c, (rand() - 0.5) * 0.4, i, 0, { shadow: false });
  }
}

function building(p, x, L, { w = 2.4, d = 1.6, h = 1.6, color, roof, windows = '#9fdcff', name, sub, bg, fg = '#fff' }) {
  const g = group(p, x, 0, z(L));
  box(g, w, h, d, color, 0, 0, 0);
  box(g, w + 0.2, 0.18, d + 0.2, roof, 0, h, 0);
  for (let i = 0; i < Math.floor(w / 0.6); i++) {
    const wx = -w / 2 + 0.4 + i * 0.6;
    box(g, 0.3, 0.3, 0.04, windows, wx, h * 0.55, d / 2 + 0.01, { shadow: false });
  }
  box(g, 0.44, 0.6, 0.04, '#3a2a22', w / 2 - 0.5, 0, d / 2 + 0.01, { shadow: false });
  if (name) {
    sign(g, sub ? [{ text: name, size: 30 }, { text: sub, size: 20 }] : [name], {
      z: d / 2 + 0.35, x: 0, y: 0, w: Math.max(2.6, w), h: 1.05, post: 0.5, bg: bg || roof, fg, size: 26,
    });
  }
  return g;
}

function pastLandmarks(p, anim) {
  // University of Waterloo
  const uw = building(p, -4.2, -28.3, { w: 3.4, d: 1.8, h: 2.2, color: '#e9dcc0', roof: '#1b1b1f', name: 'UWATERLOO', sub: '2012-16', bg: '#1b1b1f', fg: '#ffd54f' });
  box(uw, 0.6, 1.0, 0.6, '#e9dcc0', -1.2, 2.2, 0);
  box(uw, 0.7, 0.2, 0.7, '#ffd54f', -1.2, 3.2, 0);
  box(uw, 0.8, 0.8, 0.1, '#ffd54f', 0.6, 1.2, 0.92);
  box(uw, 0.5, 0.5, 0.12, '#c62828', 0.6, 1.35, 0.93);
  goose(p, 2.4, -27.8, anim);
  goose(p, 3.4, -28.6, anim);
  // Chem lab beaker
  const bk = group(p, 3.8, 0, z(-29.5));
  box(bk, 0.5, 0.7, 0.5, '#bfe8ff', 0, 0, 0);
  box(bk, 0.46, 0.35, 0.46, '#7cf29a', 0, 0.02, 0);
  box(bk, 0.26, 0.3, 0.26, '#bfe8ff', 0, 0.7, 0);

  building(p, -4, -22.3, { w: 2.6, d: 1.6, h: 2.6, color: '#dfe7ea', roof: '#1a9e5a', name: 'LANSA', sub: '2016', bg: '#1a9e5a' });
  // Toronto office towers
  [[-7.2, -23.2, 4.2, '#b9c7d8'], [-8.8, -22, 5.6, '#9fb3c8'], [3.6, -23, 3.4, '#c9d3e3'], [5.2, -22.4, 4.8, '#a9bbd0']].forEach(([x, L, h, c]) =>
    tower(p, x, L, h, c),
  );

  building(p, -4, -16.3, { w: 2.8, d: 1.6, h: 1.8, color: '#e8fff4', roof: '#1fbf8f', name: 'VIDYARD', sub: '2017-19', bg: '#1fbf8f' });
  // Vidyard robot mascot
  const bot = group(p, 3, 0, z(-16));
  box(bot, 0.7, 0.6, 0.6, '#1fbf8f', 0, 0.3, 0);
  box(bot, 0.9, 0.7, 0.7, '#1fbf8f', 0, 0.9, 0);
  box(bot, 0.2, 0.2, 0.05, '#fff', -0.2, 1.15, -0.36);
  box(bot, 0.2, 0.2, 0.05, '#fff', 0.2, 1.15, -0.36);
  box(bot, 0.06, 0.4, 0.06, '#333', -0.25, 1.6, 0);
  box(bot, 0.06, 0.4, 0.06, '#333', 0.25, 1.6, 0);
  const tip = box(bot, 0.14, 0.14, 0.14, '#ff3b5c', 0.25, 2.0, 0);
  box(bot, 0.18, 0.3, 0.18, '#333', -0.2, 0, 0);
  box(bot, 0.18, 0.3, 0.18, '#333', 0.2, 0, 0);
  anim.push((dt, t) => (tip.visible = Math.sin(t * 5) > 0));
  bot.rotation.y = -0.4;
  // Moving to Waterloo
  const mv = group(p, 5.6, 0, z(-16.6));
  box(mv, 1.2, 1.1, 2.0, '#ffffff', 0, 0.2, 0.3);
  box(mv, 1.22, 0.3, 2.02, '#ff8a1f', 0, 0.9, 0.3);
  box(mv, 1.1, 0.8, 0.8, '#ff8a1f', 0, 0.2, -1.0);
  box(mv, 1.0, 0.3, 0.05, '#2c3240', 0, 0.6, -1.41, { shadow: false });
  [[-0.5, -1.0], [0.5, -1.0], [-0.5, 0.8], [0.5, 0.8]].forEach(([x, zz]) => box(mv, 0.14, 0.34, 0.34, '#1d1d22', x * 1.2, 0, zz));
  [[-0.4, 0, 1.7], [0.3, 0, 1.8], [0, 0.42, 1.75]].forEach(([x, y, zz]) => {
    box(mv, 0.4, 0.4, 0.4, '#d9a36b', x, y, zz);
    box(mv, 0.42, 0.05, 0.1, '#9b6b43', x, y + 0.36, zz);
  });
  sign(p, ['WATERLOO', 'POP. +1'], { x: 7.6, z: z(-15.4), w: 2.2, h: 0.8, post: 0.6, bg: '#1e6b3a', fg: '#fff', size: 18 });

  building(p, -4, -11.3, { w: 2.2, d: 1.5, h: 1.5, color: '#e6e3f5', roof: '#5d6bff', name: 'ASTEROIDX', sub: '2018', bg: '#5d6bff' });
  cnTower(p, 6.6, -12.5);
  [[4.8, -13.4, 3.2, '#b9c7d8'], [8.6, -13.2, 4.2, '#9fb3c8'], [9.8, -11.8, 2.6, '#c9d3e3'], [-7.6, -12.4, 3.6, '#a9bbd0']].forEach(([x, L, h, c]) =>
    tower(p, x, L, h, c),
  );
  const ast = group(p, 3, 2.2, z(-11));
  box(ast, 0.9, 0.8, 0.8, '#8d8a99', 0, 0, 0);
  box(ast, 0.5, 0.5, 0.5, '#6f6c7c', 0.3, 0.5, 0.2);
  box(ast, 0.4, 0.3, 0.4, '#a9a6b6', -0.35, 0.2, -0.3);
  anim.push((dt, t) => {
    ast.rotation.y = t * 0.8;
    ast.rotation.x = t * 0.5;
    ast.position.y = 2.2 + Math.sin(t * 1.5) * 0.15;
  });

  building(p, -4, -6.3, { w: 2.6, d: 1.6, h: 1.8, color: '#fff3c4', roof: '#f7c843', name: 'PODIA', sub: '2019-21', bg: '#f7c843', fg: '#1b1b1f' });
  garage(p, anim);
}

function goose(p, x, L, anim) {
  const g = group(p, x, 0, z(L));
  box(g, 0.5, 0.35, 0.3, '#6b5a4a', 0, 0.2, 0);
  box(g, 0.1, 0.4, 0.1, '#1b1b1f', -0.22, 0.45, 0);
  box(g, 0.2, 0.14, 0.12, '#1b1b1f', -0.28, 0.82, 0);
  box(g, 0.1, 0.05, 0.13, '#fff', -0.26, 0.74, 0);
  box(g, 0.06, 0.2, 0.06, '#1b1b1f', 0, 0, 0);
  const head = g;
  let seed = x;
  anim.push((dt, t) => (head.rotation.y = Math.sin(t * 0.7 + seed) * 0.6));
  return g;
}

function presentLandmarks(p, root, anim) {
  // Freshly HQ
  const hq = group(p, -4.6, 0, z(1.4));
  box(hq, 3.6, 2.4, 2.2, '#f7f7f2', 0, 0, 0);
  box(hq, 3.8, 0.2, 2.4, '#111111', 0, 2.4, 0);
  box(hq, 3.62, 0.14, 2.22, '#111111', 0, 1.2, 0);
  for (let i = 0; i < 5; i++) {
    box(hq, 0.4, 0.5, 0.04, '#9fdcff', -1.4 + i * 0.7, 1.55, 1.11, { shadow: false });
    if (i !== 2) box(hq, 0.4, 0.5, 0.04, '#9fdcff', -1.4 + i * 0.7, 0.45, 1.11, { shadow: false });
  }
  box(hq, 0.7, 0.9, 0.05, '#15c2b0', 0, 0, 1.12, { shadow: false });
  sign(hq, ['FRESHLY', 'COMMERCE'], { z: 1.5, x: 1.9, w: 1.5, h: 0.62, post: 0.35, bg: '#111', fg: '#15c2b0', size: 11 });

  // App #1
  booth(p, 4.2, 0.6, '#e1fbf6', '#15c2b0', 'FRESHLY', 'INVENTORY');
  const crates = group(p, 4.2, 0, z(2.2));
  [[-0.9, 0, 0], [-0.9, 0.45, 0], [0.9, 0, 0], [0.9, 0, 0.5], [0.9, 0.45, 0.2]].forEach(([x, y, zz]) => {
    box(crates, 0.42, 0.42, 0.42, '#d9a36b', x, y, zz);
    box(crates, 0.44, 0.06, 0.44, '#9b6b43', x, y + 0.18, zz);
  });
  sign(p, ['EST. 2020'], { x: 1.6, z: z(-0.6), w: 1.6, h: 0.55, post: 0.5, bg: '#111', fg: '#15c2b0', size: 18 });
  // Shopify App Challenge 2020 trophy: Shopify-green plinth, gold cup with
  // the Shopify bag on it, slowly turning.
  // On the grass between the start and the road (lanes 1-2), clear of traffic.
  const tr = group(p, 2.2, 0, z(1.6));
  tr.scale.setScalar(1.3);
  box(tr, 1.4, 0.3, 1.2, '#5e8e3e', 0, 0, 0);
  box(tr, 1.1, 0.5, 0.9, '#95bf47', 0, 0.3, 0);
  sign(tr, [{ text: 'SHOPIFY APP', size: 13 }, { text: 'CHALLENGE 2020', size: 13 }, { text: 'WINNER', size: 18 }], {
    y: 0.02, z: 0.62, w: 1.3, h: 0.72, post: 0, bg: '#1b1b1f', fg: '#f6c453', size: 13,
  });
  const cup = group(root, 2.2, 1.04, z(1.6));
  cup.scale.setScalar(1.3);
  const gold = '#f6c453';
  const deep = '#e0a526';
  box(cup, 0.6, 0.12, 0.6, deep, 0, 0, 0);
  box(cup, 0.2, 0.45, 0.2, gold, 0, 0.12, 0);
  box(cup, 0.46, 0.14, 0.46, deep, 0, 0.55, 0);
  box(cup, 0.72, 0.26, 0.72, gold, 0, 0.66, 0);
  box(cup, 0.86, 0.5, 0.86, gold, 0, 0.9, 0);
  box(cup, 0.92, 0.08, 0.92, deep, 0, 1.4, 0);
  [-1, 1].forEach((sx) => {
    box(cup, 0.12, 0.44, 0.12, gold, sx * 0.58, 0.88, 0);
    box(cup, 0.2, 0.1, 0.12, gold, sx * 0.5, 1.26, 0);
    box(cup, 0.2, 0.1, 0.12, gold, sx * 0.5, 0.86, 0);
  });
  shopifyBag(cup, 0.02, 0.84, 0.44, 0.045);
  anim.push((dt, t) => {
    cup.rotation.y = Math.sin(t * 0.6) * 0.5;
    cup.position.y = 1.04 + Math.sin(t * 1.5) * 0.05;
  });
}

function booth(p, x, L, wall, accent, a, b, y = 0) {
  const g = group(p, x, y, z(L));
  box(g, 2.1, 1.1, 1.2, wall, 0, 0, 0);
  box(g, 2.3, 0.14, 1.4, accent, 0, 1.1, 0);
  for (let i = 0; i < 5; i++) box(g, 0.46, 0.12, 0.3, i % 2 ? '#ffffff' : accent, -0.92 + i * 0.46, 1.0, 0.72, { shadow: false });
  sign(g, [a, b], { z: 0.66, y: 0.05, w: 2.0, h: 0.62, post: 0, bg: accent, fg: '#fff', size: 18 });
}

function campsite(p, anim) {
  const L = 21.4;
  const g = group(p, -3.2, 0, z(L));
  // Tent
  for (let i = 0; i < 5; i++) box(g, 1.8 - i * 0.36, 0.22, 1.5, i % 2 ? '#ff8a1f' : '#ffa94d', 0, i * 0.22, 0);
  box(g, 0.36, 0.6, 0.04, '#5a3a22', 0, 0, 0.76, { shadow: false });
  // Logs around the fire
  box(p, 0.9, 0.24, 0.3, '#7a4b33', -1.6, 0, z(L) + 0.6);
  box(p, 0.3, 0.24, 0.9, '#7a4b33', -0.6, 0, z(L));
  const fire = group(p, -1.5, 0, z(L - 0.2));
  box(fire, 0.5, 0.1, 0.5, '#5a3a22', 0, 0, 0);
  const f1 = box(fire, 0.3, 0.35, 0.3, '#ff8a1f', 0, 0.1, 0, { shadow: false });
  const f2 = box(fire, 0.16, 0.25, 0.16, '#ffe14d', 0, 0.3, 0, { shadow: false });
  anim.push((dt, t) => {
    f1.scale.y = 0.3 + Math.abs(Math.sin(t * 9)) * 0.15;
    f2.position.y = 0.3 + Math.sin(t * 13) * 0.05 + 0.12;
  });
  sign(p, ['TEAM CAMP', 'WORLDWIDE'], { x: -5.6, z: z(20.2), w: 2.0, h: 0.7, post: 0.45, bg: '#2f6b3a', fg: '#ffe14d', size: 16 });

  // The team around the fire.
  [
    [-1.5, 20.45, 0, { hair: '#e0c070', skin: '#f0c9a8', shirt: '#2ec4ff', beard: null, longHair: true }],
    [-2.35, 21.35, -Math.PI / 2, { hair: '#1c1512', skin: '#8d5a3b', shirt: '#ffd23f', beard: null }],
    [-0.75, 21.95, Math.PI * 0.8, { hair: '#6b3f2a', skin: '#e2b08c', shirt: '#7b61ff', beard: '#6b3f2a' }],
    [-1.9, 22.05, Math.PI, { hair: '#141012', skin: '#c68a64', shirt: '#ff7a8a', beard: null, longHair: true }],
  ].forEach(([x, L2, rot, look]) => {
    const m = makePlayer(look);
    m.legs.rotation.x = -Math.PI / 2;
    m.legs.position.set(0, 0.3, 0.05);
    m.root.position.set(x, -0.08, z(L2));
    m.root.rotation.y = rot;
    p.add(m.root);
  });

  // A spinning voxel globe: the team is spread around the world.
  const globe = group(p.parent || p, -6.8, 1.2, z(21.6));
  const land = (a, b, c) => Math.sin(a * 1.7) + Math.cos(b * 2.3 + c) > 0.6;
  for (let i = -3; i <= 3; i++)
    for (let j = -3; j <= 3; j++)
      for (let k = -3; k <= 3; k++) {
        const d = Math.hypot(i, j, k);
        if (d > 3.2 || d < 2.2) continue;
        box(globe, 0.2, 0.2, 0.2, land(i, j, k) ? '#48c774' : '#2b6cff', i * 0.2, j * 0.2 - 0.1, k * 0.2, { shadow: false });
      }
  box(p, 0.14, 0.9, 0.14, '#7a4b33', -6.8, 0, z(21.6));
  anim.push((dt, t) => (globe.rotation.y = t * 0.6));
}

function surfShack(p, x, zz) {
  const g = group(p, x, 0, zz);
  box(g, 2.2, 1.3, 1.4, '#7fdcff', 0, 0, 0);
  // Striped roof: stacked, non-overlapping layers (overlapping ones flicker).
  for (let i = 0; i < 5; i++) box(g, 2.6, 0.06, 1.8, i % 2 ? '#ffffff' : '#ff6fa8', 0, 1.3 + i * 0.06, 0);
  sign(g, ['SURF', 'SHACK'], { z: 0.9, w: 1.4, h: 0.5, post: 0, y: 0.5, bg: '#ff6fa8', fg: '#fff', size: 10 });
  [-0.8, 0.8].forEach((bx, i) => box(g, 0.35, 1.4, 0.1, i ? '#ffd23f' : '#20c997', bx * 1.6, 0, 0.8));
}

function liftSystem(p, root, anim) {
  const upX = 2.3;
  const downX = 3.1;
  // Stations
  [[46, 0], [56, 1]].forEach(([L, top]) => {
    const y = laneHeight(L);
    const g = group(p, 2.7, y, z(L + (top ? 0.3 : -0.3)));
    box(g, 2.2, 0.2, 1.4, '#7a4b33', 0, 0, 0);
    box(g, 0.2, 3.6, 0.2, '#555c68', -0.9, 0, -0.5);
    box(g, 0.2, 3.6, 0.2, '#555c68', 0.9, 0, -0.5);
    box(g, 2.0, 0.4, 1.1, '#ff3b5c', 0, 3.6, -0.3);
    box(g, 1.4, 0.2, 1.4, '#9aa0a8', 0, 4.0, 0);
  });
  sign(p, ['SKI', 'LIFT'], { x: 1.1, z: z(45.4), w: 1.0, h: 0.62, post: 0.6, bg: '#ff3b5c', fg: '#fff', size: 12 });
  sign(p, ['YOU ARE', 'HERE'], { x: -1.5, z: z(45.5), w: 1.3, h: 0.7, post: 0.5, bg: '#ff3b5c', fg: '#fff', size: 16 });
  // Towers
  [49, 52, 55].forEach((L) => {
    const y = laneHeight(L);
    box(p, 0.24, 4.4, 0.24, '#555c68', 2.7, y, z(L));
    box(p, 1.2, 0.14, 0.2, '#555c68', 2.7, y + 4.3, z(L));
  });
  // Cables: rider sits 1.9 above ground, cable is 2.3 above the seat.
  const cableAt = (L) => laneHeight(46) + (L - 46) * 0.8 + 4.2;
  [upX, downX].forEach((x) => {
    const a = new THREE.Vector3(x, cableAt(46), z(46));
    const b = new THREE.Vector3(x, cableAt(56), z(56));
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, len), mat('#2b2f36'));
    m.position.copy(a).lerp(b, 0.5);
    m.lookAt(b);
    root.add(m);
  });
  // Empty chairs riding down.
  const chairs = [0, 0.25, 0.5, 0.75].map((o) => {
    const c = makeChair();
    root.add(c);
    return { c, o };
  });
  anim.push((dt, t) => {
    chairs.forEach(({ c, o }) => {
      const u = (t * 0.06 + o) % 1;
      const L = 56 - u * 10;
      c.position.set(downX, cableAt(L) - 2.3, z(L));
      c.rotation.y = Math.PI;
    });
  });
}

function summit(p, root, anim) {
  const y = laneHeight(73);
  // Launch pad
  box(p, 1.8, 0.3, 1.8, '#555c68', 2.6, y, z(74));
  box(p, 1.9, 0.06, 1.9, '#ffd23f', 2.6, y + 0.3, z(74), { shadow: false });
  box(p, 0.2, 4.2, 0.2, '#ff3b5c', 3.7, y, z(74.4));
  box(p, 0.6, 0.12, 0.12, '#ff3b5c', 3.4, y + 3.0, z(74.4));
  // An ops team for every merchant: little robots at the pad, one planning, two doing.
  [[4.9, 72.8, '#15c2b0', 'plan'], [6.1, 73.9, '#7b61ff', 'act'], [5.4, 75, '#ff4d6d', 'act']].forEach(([bx, bL, c, role], i) => {
    const bot = group(root, bx, y, z(bL));
    box(bot, 0.5, 0.4, 0.4, '#dfe3ea', 0, 0.2, 0);
    box(bot, 0.6, 0.5, 0.5, c, 0, 0.55, 0);
    box(bot, 0.14, 0.14, 0.05, '#fff', -0.13, 0.78, 0.26);
    box(bot, 0.14, 0.14, 0.05, '#fff', 0.13, 0.78, 0.26);
    box(bot, 0.05, 0.25, 0.05, '#333', 0, 1.05, 0);
    const led = box(bot, 0.12, 0.12, 0.12, '#ffd23f', 0, 1.3, 0);
    box(bot, 0.14, 0.2, 0.14, '#555', -0.15, 0, 0);
    box(bot, 0.14, 0.2, 0.14, '#555', 0.15, 0, 0);
    // The planner holds a clipboard; the doers carry boxes.
    if (role === 'plan') box(bot, 0.3, 0.36, 0.05, '#ffffff', 0.38, 0.45, 0.15);
    else box(bot, 0.34, 0.3, 0.34, '#d9a36b', 0, 0.62, 0.36);
    anim.push((dt, t) => {
      bot.position.y = y + Math.abs(Math.sin(t * 4 + i)) * 0.08;
      led.visible = Math.sin(t * 3 + i * 2) > -0.3;
    });
  });
  sign(p, ['AN OPS TEAM', 'FOR EVERY MERCHANT'], { x: 7.6, y, z: z(72.4), w: 1.9, h: 0.7, post: 0.5, bg: '#15c2b0', fg: '#1b1b1f', size: 16 });
  sign(p, ['LAUNCH PAD'], { x: -1.4, y: laneHeight(72), z: z(72.3), w: 1.8, h: 0.5, post: 0.4, bg: '#1b1b1f', fg: '#fff', size: 16 });
}

function tower(p, x, L, h, c) {
  const g = group(p, x, 0, z(L));
  box(g, 1.2, h, 1.2, c, 0, 0, 0);
  for (let y = 0.4; y < h - 0.3; y += 0.5) box(g, 1.22, 0.14, 1.22, '#dff4ff', 0, y, 0, { shadow: false });
  box(g, 1.3, 0.14, 1.3, '#6f7c8f', 0, h, 0);
}

function cnTower(p, x, L) {
  const g = group(p, x, 0, z(L));
  box(g, 1.2, 0.4, 1.2, '#b8b3a8', 0, 0, 0);
  box(g, 0.6, 6.2, 0.6, '#d8d3c6', 0, 0.4, 0);
  box(g, 0.3, 6.2, 0.9, '#cfc9bb', 0, 0.4, 0);
  box(g, 1.5, 0.5, 1.5, '#9aa0a8', 0, 6.4, 0);
  box(g, 1.7, 0.2, 1.7, '#6f7c8f', 0, 6.6, 0);
  box(g, 1.3, 0.3, 1.3, '#9fdcff', 0, 6.9, 0);
  box(g, 0.6, 0.6, 0.6, '#d8d3c6', 0, 7.2, 0);
  box(g, 0.2, 2.2, 0.2, '#e8e4da', 0, 7.8, 0);
  box(g, 0.08, 0.6, 0.08, '#ff3b5c', 0, 10, 0);
}

function garage(p, anim) {
  // First fully remote job: a garage office that doubles as a longboard shop.
  const g = group(p, 3.4, 0, z(-6.4));
  box(g, 2.6, 1.5, 1.8, '#e8dcc8', 0, 0, 0);
  box(g, 2.8, 0.16, 2.0, '#8b5e3c', 0, 1.5, 0);
  box(g, 1.9, 1.1, 0.04, '#3a2f2a', -0.2, 0, 0.91, { shadow: false });
  // Desk + laptop inside the open door
  box(g, 0.9, 0.36, 0.4, '#b5875a', -0.6, 0, 0.7);
  box(g, 0.44, 0.03, 0.3, '#333', -0.6, 0.36, 0.7);
  box(g, 0.44, 0.3, 0.03, '#333', -0.6, 0.36, 0.56);
  box(g, 0.36, 0.22, 0.02, '#f7c843', -0.6, 0.4, 0.58, { shadow: false });
  // Chair
  box(g, 0.3, 0.2, 0.3, '#ff6fa8', -0.6, 0, 1.05);
  sign(g, ['REMOTE', 'HQ'], { x: 0.9, y: 0.95, z: 0.95, w: 0.8, h: 0.5, post: 0, bg: '#f7c843', fg: '#1b1b1f', size: 14 });

  // Longboard shop next door
  const shop = group(p, 6.2, 0, z(-6));
  const deck = (x, y, zz, c, standing) => {
    const d = group(shop, x, y, zz);
    box(d, 0.34, 0.06, 1.3, c, 0, 0.1, 0);
    box(d, 0.36, 0.08, 0.08, '#555', 0, 0.02, -0.4);
    box(d, 0.36, 0.08, 0.08, '#555', 0, 0.02, 0.4);
    if (standing) {
      d.rotation.x = -Math.PI / 2 + 0.25;
      d.position.y += 0.7;
    }
    return d;
  };
  // Rack of finished boards
  box(shop, 1.5, 0.12, 0.12, '#7a4b33', 0, 1.4, 0.6);
  box(shop, 0.12, 1.5, 0.12, '#7a4b33', -0.75, 0, 0.6);
  box(shop, 0.12, 1.5, 0.12, '#7a4b33', 0.75, 0, 0.6);
  ['#ff6fa8', '#2ec4ff', '#ffd23f'].forEach((c, i) => deck(-0.45 + i * 0.45, 0, 0.45, c, true));
  // Sawhorses with a deck in progress
  [-0.5, 0.5].forEach((zz) => {
    box(shop, 0.9, 0.1, 0.12, '#b5875a', 0, 0.5, -0.6 + zz * 0.9);
    box(shop, 0.08, 0.5, 0.08, '#b5875a', -0.35, 0, -0.6 + zz * 0.9);
    box(shop, 0.08, 0.5, 0.08, '#b5875a', 0.35, 0, -0.6 + zz * 0.9);
  });
  const wip = deck(0, 0.5, -0.6, '#d9b27c', false);
  for (let i = 0; i < 8; i++) box(shop, 0.08, 0.02, 0.05, '#e7c79a', -0.6 + rand() * 1.2, 0, -1.2 + rand() * 1.2, { shadow: false });
  anim.push((dt, t) => (wip.position.y = 0.5 + Math.max(0, Math.sin(t * 6)) * 0.02));
}

function basecamp(p, anim) {
  const y = laneHeight(57);
  // Freshly lodge
  const lodge = group(p, -4.6, y, z(57.8));
  box(lodge, 3.6, 1.8, 2.2, '#8b5e3c', 0, 0, 0);
  for (let i = 0; i < 6; i++) box(lodge, 3.62, 0.08, 2.22, '#7a4f31', 0, 0.2 + i * 0.28, 0, { shadow: false });
  box(lodge, 3.9, 0.3, 2.5, '#1b1b1f', 0, 1.8, 0);
  box(lodge, 3.2, 0.3, 2.0, '#1b1b1f', 0, 2.1, 0);
  box(lodge, 3.9, 0.12, 2.5, '#ffffff', 0, 2.1, 0);
  box(lodge, 0.7, 0.9, 0.05, '#15c2b0', 0.8, 0, 1.11, { shadow: false });
  box(lodge, 0.5, 0.4, 0.04, '#ffe9a8', -0.9, 0.7, 1.11, { shadow: false });
  sign(lodge, ['NEXT: 100,000', 'MERCHANTS'], { x: -0.6, y: 0.2, z: 1.3, w: 2.0, h: 0.8, post: 0, bg: '#111', fg: '#15c2b0', size: 20 });

  // Three app shops
  booth(p, -8.4, 58.4, '#e1fbf6', '#15c2b0', 'FRESHLY', 'INVENTORY', y);
  booth(p, 5.4, 58.4, '#ffe3ec', '#ff4d6d', 'SIMPLE', 'BUNDLES', y);
  booth(p, 7.8, 58.4, '#e7e3ff', '#7b61ff', 'SIMPLE', 'DISCOUNTS', y);
  const pct = group(p, 7.8, y + 1.3, z(58.4));
  ['#..#', '..#.', '.#..', '#..#'].forEach((row, r) =>
    row.split('').forEach((ch, c) => ch === '#' && box(pct, 0.2, 0.2, 0.2, '#7b61ff', -0.3 + c * 0.2, (3 - r) * 0.2, 0)),
  );

  // Built for Shopify badge on a pedestal
  const badge = group(p, -2.2, y, z(59.2));
  box(badge, 1.0, 0.5, 0.8, '#9aa8bd', 0, 0, 0);
  const b = group(badge, 0, 1.25, 0);
  const D = ['...##...', '..####..', '.######.', '##.###.#', '###.#.##', '.####.#.', '..####..', '...##...'];
  D.forEach((row, r) =>
    row.split('').forEach((ch, c) => {
      if (ch === '.') return;
      box(b, 0.12, 0.12, 0.12, '#1f8f4e', -0.42 + c * 0.12, (7 - r) * 0.12 - 0.5, 0);
    }),
  );
  // White check mark on top of the green diamond
  [[-0.18, -0.05], [-0.06, -0.17], [0.06, -0.05], [0.18, 0.07], [0.3, 0.19]].forEach(([x, yy]) =>
    box(b, 0.12, 0.12, 0.14, '#ffffff', x, yy, 0),
  );
  anim.push((dt, t) => (b.rotation.y = Math.sin(t * 1.2) * 0.5));
  sign(p, ['BUILT FOR', 'SHOPIFY'], { x: -2.2, y, z: z(58.6), w: 1.6, h: 0.5, post: 0, bg: '#1f8f4e', fg: '#fff', size: 14 });

}

// A side milestone: flag on a pole plus a year/label sign at its foot.
function marker(stat, root, anim, { year, text, x, L, color = '#ff3b5c' }) {
  const y = groundAt(L);
  box(stat, 0.1, 2.4, 0.1, '#dfe3ea', x - 0.95, y, z(L));
  box(stat, 0.18, 0.18, 0.18, '#ffd23f', x - 0.95, y + 2.4, z(L));
  sign(stat, [{ text: year, size: 22 }, { text, size: 18 }], { x, y, z: z(L) + 0.05, w: 2.3, h: 0.9, post: 0.3, bg: '#ffffff', fg: '#1b1b1f', border: color, size: 13 });
  const flag = group(root, x - 0.9, y + 1.7, z(L));
  const cloth = [];
  for (let i = 0; i < 4; i++) cloth.push(box(flag, 0.2, 0.55, 0.05, color, 0.1 + i * 0.2, 0, 0, { shadow: false }));
  anim.push((dt, t) => cloth.forEach((c, i) => (c.position.z = Math.sin(t * 5 - i * 0.9) * 0.06 * i)));
}

// ---------- 2005 to 2015 ----------
function movingToCanada(stat, root, anim) {
  // Saudi house with a crenellated roof
  const h = group(stat, -4.5, 0, z(-40.4));
  box(h, 2.4, 1.5, 1.8, '#e8cfa0', 0, 0, 0);
  for (let i = 0; i < 6; i++) box(h, 0.24, 0.24, 0.24, '#d9b980', -1.05 + i * 0.42, 1.5, 0.78);
  box(h, 0.5, 0.8, 0.05, '#7a4b33', 0.4, 0, 0.91, { shadow: false });
  box(h, 0.34, 0.34, 0.05, '#2b6cff', -0.6, 0.8, 0.91, { shadow: false });
  sign(stat, ['SAUDI ARABIA'], { x: 3.2, z: z(-41), w: 2.4, h: 0.55, post: 0.5, bg: '#1e6b3a', fg: '#fff', size: 18 });
  sign(stat, ['WELCOME TO', 'CANADA'], { x: 3.4, z: z(-35.2), w: 2.4, h: 0.9, post: 0.6, bg: '#d52b1e', fg: '#fff', size: 20 });
  // Maple trees on the Canadian side
  [[-7.6, -37.4], [6.4, -38.2], [7.8, -34.8], [-8.6, -35.2]].forEach(([x, L]) => {
    const g = group(stat, x, 0, z(L));
    box(g, 0.3, 0.6, 0.3, '#6b3f2a', 0, 0, 0);
    box(g, 1.0, 0.8, 1.0, '#d52b1e', 0, 0.6, 0);
    box(g, 0.6, 0.4, 0.6, '#e8543f', 0, 1.4, 0);
  });
  // Plane flying from Saudi Arabia toward Canada, on a loop.
  const plane = group(root, -1.5, 4.2, 0);
  box(plane, 0.6, 0.6, 3.0, '#ffffff', 0, 0, 0);
  box(plane, 0.5, 0.3, 0.5, '#d52b1e', 0, 0.12, -1.6);
  box(plane, 3.6, 0.1, 0.8, '#e8ecf2', 0, 0.2, 0.1);
  box(plane, 1.4, 0.08, 0.5, '#e8ecf2', 0, 0.45, 1.3);
  box(plane, 0.08, 0.7, 0.5, '#d52b1e', 0, 0.5, 1.3);
  for (let i = 0; i < 5; i++) box(plane, 0.62, 0.14, 0.14, '#7fdcff', 0, 0.35, -0.9 + i * 0.4, { shadow: false });
  // Fly a wide loop: up the right side, bank left over the top, back down the
  // left side and around again, so it reappears on the right.
  plane.rotation.order = 'YXZ';
  anim.push((dt, t) => {
    const th = t * 0.32;
    const x = 8 * Math.cos(th);
    const L = -37.5 + 5.5 * Math.sin(th);
    plane.position.set(x, 4.2 + Math.sin(th * 2) * 0.3, z(L));
    plane.rotation.y = Math.atan2(8 * Math.sin(th), 5.5 * Math.cos(th));
    plane.rotation.z = 0.35;
  });
}

function tobiStage(stat, anim) {
  // E5, UWaterloo, 2015: Tobi's fireside chat about Shopify Plus.
  const x = 4.4;
  const L = -25.8;
  const g = group(stat, x, 0, z(L));
  box(g, 3.0, 0.35, 1.6, '#3a3f4b', 0, 0, 0);
  box(g, 3.0, 1.9, 0.14, '#95bf47', 0, 0.35, -0.73);
  sign(g, ['SHOPIFY PLUS'], { x: 0.4, y: 1.45, z: -0.64, w: 1.9, h: 0.45, post: 0, bg: '#ffffff', fg: '#5e8e3e', size: 18 });
  sign(g, ['FIRESIDE CHAT'], { x: 0.4, y: 0.95, z: -0.64, w: 1.9, h: 0.36, post: 0, bg: '#5e8e3e', fg: '#ffffff', size: 14 });
  shopifyBag(g, -1.0, 0.75, -0.6, 0.08);

  // Two armchairs, a side table, and the chat.
  const chair = (cx, rot) => {
    const c = group(g, cx, 0.35, 0);
    c.rotation.y = rot;
    box(c, 0.62, 0.42, 0.6, '#8b5e3c', 0, 0, 0);
    box(c, 0.62, 0.55, 0.14, '#7a4f31', 0, 0.42, -0.26);
    box(c, 0.12, 0.2, 0.6, '#7a4f31', -0.28, 0.42, 0);
    box(c, 0.12, 0.2, 0.6, '#7a4f31', 0.28, 0.42, 0);
    return c;
  };
  const seat = (m, cx, rot) => {
    m.legs.rotation.x = -Math.PI / 2;
    m.legs.position.set(0, 0.3, 0.05);
    m.root.position.set(cx, 0.35 + 0.42 - 0.3, 0.05);
    m.root.rotation.y = rot;
    g.add(m.root);
  };
  // Seats face the audience (+z), angled toward each other.
  chair(0.75, Math.PI - 0.5 + Math.PI);
  chair(-0.45, Math.PI + 0.5 + Math.PI);
  box(g, 0.3, 0.4, 0.3, '#5a3a22', 0.15, 0.35, 0.1);
  box(g, 0.1, 0.12, 0.1, '#ffffff', 0.12, 0.75, 0.1);
  // Tobi: bald, with his usual cap.
  const tobi = makePlayer({ hair: '#f0c9a8', skin: '#f0c9a8', beard: '#b58a5a', shirt: '#1b1b1f', shirtDark: '#111111', pants: '#2c3a57', cap: '#1b1b1f' });
  seat(tobi, 0.75, Math.PI + 0.5);
  const host = makePlayer({ hair: '#3b2a20', skin: '#e2b08c', beard: null, shirt: '#95bf47', shirtDark: '#5e8e3e', longHair: true });
  seat(host, -0.45, Math.PI - 0.5);

  // Audience (a younger Basil in the front row)
  const kid = makePlayer();
  kid.root.position.set(-0.4, 0, 1.4);
  g.add(kid.root);
  [[0.6, 1.5], [1.3, 1.4], [-1.1, 1.6]].forEach(([ax, az], i) => {
    const a = makePlayer({ hair: ['#3b2a20', '#e0c070', '#1c1512'][i], beard: null, shirt: ['#ffd23f', '#2ec4ff', '#ff6fa8'][i] });
    a.root.position.set(ax, 0, az);
    g.add(a.root);
  });
  sign(stat, ['E5, UWATERLOO', '2015'], { x: x + 2.2, z: z(L) + 0.9, w: 1.9, h: 0.7, post: 0.4, bg: '#95bf47', fg: '#fff', size: 16 });
}

// Pixel Shopify bag, built from a small bitmap. `s` is the voxel size.
function shopifyBag(parent, x, y, zz, s) {
  const BAG = [
    '...####...',
    '..#....#..',
    '..#....#..',
    'GGGGGGGGGG',
    'GGGGWWWGGG',
    'GGGWGGGGGG',
    'GGGGWWGGGG',
    'GGGGGGWGGG',
    'GGGWWWGGGG',
    'GGGGGGGGGG',
  ];
  const g = group(parent, x, y, zz);
  const C = { '#': '#5e8e3e', G: '#95bf47', W: '#ffffff' };
  BAG.forEach((row, r) =>
    row.split('').forEach((ch, c) => {
      if (ch === '.') return;
      box(g, s, s, s * 2, C[ch], (c - 4.5) * s, (BAG.length - 1 - r) * s, 0, { shadow: ch !== 'W' });
    }),
  );
  return g;
}

// Canadian flag: a waving textured plane on a pole.
let flagTex;
function canadaFlagTexture() {
  if (flagTex) return flagTex;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 8;
  const g = c.getContext('2d');
  g.fillStyle = '#d52b1e';
  g.fillRect(0, 0, 16, 8);
  g.fillStyle = '#ffffff';
  g.fillRect(4, 0, 8, 8);
  g.fillStyle = '#d52b1e';
  // Pixel maple leaf
  [[7, 1], [8, 1], [6, 2], [7, 2], [8, 2], [9, 2], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [6, 4], [7, 4], [8, 4], [9, 4], [7, 5], [8, 5], [7, 6], [8, 6]].forEach(([px, py]) =>
    g.fillRect(px, py, 1, 1),
  );
  flagTex = new THREE.CanvasTexture(c);
  flagTex.magFilter = THREE.NearestFilter;
  flagTex.minFilter = THREE.NearestFilter;
  flagTex.colorSpace = THREE.SRGBColorSpace;
  return flagTex;
}

function canadaFlag(stat, root, anim, x, L) {
  const y = groundAt(L);
  box(stat, 0.1, 2.6, 0.1, '#dfe3ea', x, y, z(L));
  box(stat, 0.16, 0.16, 0.16, '#ffd23f', x, y + 2.6, z(L));
  const geo = new THREE.PlaneGeometry(1.4, 0.7, 10, 1);
  geo.translate(0.7, 0, 0);
  const base = geo.attributes.position.array.slice();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: canadaFlagTexture(), side: THREE.DoubleSide }));
  m.position.set(x + 0.05, y + 2.2, z(L));
  m.castShadow = true;
  root.add(m);
  const seed = x * 1.7 + L;
  anim.push((dt, t) => {
    const pos = geo.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      const fx = base[i];
      pos[i + 2] = Math.sin(t * 5 + seed - fx * 4) * 0.09 * fx;
      pos[i + 1] = base[i + 1] - Math.sin(t * 3 + fx * 2) * 0.03 * fx;
    }
    geo.attributes.position.needsUpdate = true;
  });
}

// ---------- Personal memories (dioramas beside the route) ----------
function memory(stat, root, anim, m) {
  const y = groundAt(m.L);
  const g = group(stat, m.x, y, z(m.L));
  // Animated bits live under root, positioned relative to the diorama.
  const live = (dx = 0, dy = 0, dz = 0) => group(root, m.x + dx, y + dy, z(m.L) + dz);
  // No sign: the scene should speak for itself (year/title stay in MEMORIES as notes).
  memoryKinds[m.kind]?.(g, live, anim);
}

// Friends who show up in trip memories (short, light beards).
const FRIENDS = {
  shared: { hair: '#4a3426', skin: '#e2b08c', beard: '#7a5a44', shirt: '#2ec4ff', shirtDark: '#1f9fd0' },
  b: { hair: '#1c1512', skin: '#c68a64', beard: '#4a3426', shirt: '#ffd23f', shirtDark: '#e0b52a' },
  c: { hair: '#b58a5a', skin: '#f0c9a8', beard: '#caa27c', shirt: '#ff7a8a', shirtDark: '#e0566a' },
  d: { hair: '#2b1e18', skin: '#b87a55', beard: '#5a4030', shirt: '#48c774', shirtDark: '#36a35c' },
  e: { hair: '#6b3f2a', skin: '#e8b996', beard: '#9b6b4a', shirt: '#7b61ff', shirtDark: '#5d47d6' },
};
function crew(g, looks, x0, zz, rot = 0) {
  looks.forEach((look, i) => {
    const p = makePlayer(look);
    p.root.position.set(x0 + i * 0.55, 0, zz + (i % 2) * 0.15);
    p.root.rotation.y = rot;
    p.root.scale.setScalar(0.85);
    g.add(p.root);
  });
}

const memoryKinds = {
  // 2026: Hawaii
  hawaii(g, live, anim) {
    box(g, 2.8, 0.06, 1.6, '#f3d89b', 0, 0, 0, { shadow: false });
    box(g, 0.9, 0.06, 1.6, '#3fc6e8', 1.4, 0, 0, { shadow: false });
    for (let i = 0; i < 4; i++) {
      const w = 1.4 - i * 0.28;
      box(g, w, 0.35, w, i === 3 ? '#4a3a32' : '#6b5a4a', -0.7, i * 0.35, -0.5);
    }
    box(g, 0.24, 0.06, 0.24, '#ff5a1f', -0.7, 1.4, -0.5, { shadow: false });
    const smoke = live(-0.7, 1.5, -0.5);
    const puff = box(smoke, 0.2, 0.2, 0.2, '#e8e8ee', 0, 0, 0, { shadow: false });
    anim.push((dt, t) => {
      const u = (t * 0.4) % 1;
      puff.position.y = u * 0.8;
      puff.scale.setScalar(0.5 + u);
    });
    for (let i = 0; i < 5; i++) box(g, 0.18, 0.3, 0.18, '#9b6b43', 0.5 + i * 0.04, i * 0.3, 0.3);
    box(g, 1.3, 0.1, 0.3, '#48c774', 0.7, 1.55, 0.3);
    box(g, 0.3, 0.1, 1.3, '#48c774', 0.7, 1.57, 0.3);
    const sb = box(g, 0.32, 1.0, 0.08, '#2ec4ff', 1.1, 0, 0.6);
    sb.rotation.z = -0.2;
    [[-1.2, 0.5], [-0.3, 0.6]].forEach(([px, pz]) => {
      box(g, 0.16, 0.16, 0.16, '#ff3b5c', px, 0.06, pz);
      box(g, 0.06, 0.06, 0.06, '#ffd23f', px, 0.22, pz);
    });
  },
  // 2025: Whistler
  whistler(g, live, anim) {
    const stone = '#9aa0a8';
    box(g, 0.3, 0.7, 0.3, stone, -0.9, 0, 0.2);
    box(g, 0.3, 0.7, 0.3, stone, -0.3, 0, 0.2);
    box(g, 1.0, 0.25, 0.35, '#8a909a', -0.6, 0.7, 0.2);
    box(g, 0.35, 0.4, 0.3, stone, -0.6, 0.95, 0.2);
    box(g, 1.3, 0.2, 0.3, '#8a909a', -0.6, 1.35, 0.2);
    box(g, 0.35, 0.35, 0.3, stone, -0.6, 1.55, 0.2);
    for (let i = 0; i < 4; i++) {
      const w = 1.6 - i * 0.35;
      box(g, w, 0.5, w * 0.8, i >= 2 ? '#ffffff' : '#dfe9f7', 0.9, i * 0.5, -0.7);
    }
  },
  // 2024: Canmore and the Three Sisters
  canmore(g, live, anim) {
    [-0.9, 0.1, 1.1].forEach((px, k) => {
      const h = [2.4, 2.8, 2.2][k];
      for (let i = 0; i < 5; i++) {
        const w = 1.0 - i * 0.18;
        box(g, w, h / 5, w, i >= 3 ? '#ffffff' : '#7d8799', px, (i * h) / 5, -0.6 + k * 0.1);
      }
    });
    [[-1.5, 0.6], [1.6, 0.5], [0.2, 0.8]].forEach(([px, pz]) => {
      box(g, 0.2, 0.3, 0.2, '#6b3f2a', px, 0, pz);
      box(g, 0.6, 0.4, 0.6, '#2f7d5b', px, 0.3, pz);
      box(g, 0.62, 0.08, 0.62, '#ffffff', px, 0.7, pz);
    });
  },
  // 2019: Tofino, Vancouver Island
  tofino(g, live, anim) {
    box(g, 2.8, 0.05, 0.9, '#f3d89b', 0, 0, 0.4, { shadow: false });
    box(g, 2.8, 0.05, 0.9, '#3fa9d8', 0, 0, -0.5, { shadow: false });
    const tail = live(0.8, 0, -0.6);
    box(tail, 0.14, 0.4, 0.14, '#3a4a5c', 0, 0, 0);
    box(tail, 0.7, 0.12, 0.2, '#3a4a5c', 0, 0.4, 0);
    anim.push((dt, t) => (tail.position.y = -0.4 + Math.max(0, Math.sin(t * 0.8)) * 0.5));
    const b = box(g, 0.35, 1.1, 0.08, '#ff8a1f', -0.6, 0, 0.5);
    b.rotation.z = 0.15;
    [[-1.3, -0.2], [1.4, 0.7], [-1.1, 0.8]].forEach(([px, pz], i) => {
      box(g, 0.24, 0.8, 0.24, '#5a3a22', px, 0, pz);
      box(g, 0.8, 0.6, 0.8, i % 2 ? '#1f6b45' : '#2a7d52', px, 0.8, pz);
      box(g, 0.5, 0.5, 0.5, '#1f6b45', px, 1.4, pz);
    });
  },
  // 2019: Banff, Alberta
  banff(g, live, anim) {
    box(g, 2.6, 0.06, 1.3, '#3fd0c9', 0, 0, 0.1, { shadow: false });
    box(g, 2.6, 0.03, 1.32, '#8fe8e0', 0, 0.02, 0.1, { shadow: false });
    [[-0.9, 2.2], [0.3, 2.8], [1.2, 1.9]].forEach(([px, h]) => {
      for (let i = 0; i < 4; i++) {
        const w = 1.3 - i * 0.3;
        box(g, w, h / 4, w * 0.8, i === 3 ? '#ffffff' : i === 2 ? '#c9d3e3' : '#8a94a6', px, (i * h) / 4, -0.9);
      }
    });
    [[-1.6, 0.6], [1.7, 0.7]].forEach(([px, pz]) => {
      box(g, 0.2, 0.3, 0.2, '#6b3f2a', px, 0, pz);
      box(g, 0.6, 0.4, 0.6, '#2f7d5b', px, 0.3, pz);
      box(g, 0.4, 0.4, 0.4, '#2f7d5b', px, 0.7, pz);
    });
    box(g, 0.9, 0.12, 0.26, '#d52b1e', 0.2, 0.06, 0.3);
  },
  // 2018: Portugal and Spain
  iberia(g, live, anim) {
    // Lisbon's yellow tram
    box(g, 1.6, 0.7, 0.7, '#ffd23f', -0.6, 0.12, -0.7);
    box(g, 1.62, 0.18, 0.72, '#ffffff', -0.6, 0.82, -0.7);
    for (let i = 0; i < 4; i++) box(g, 0.24, 0.24, 0.03, '#2c3240', -1.15 + i * 0.37, 0.45, -0.34, { shadow: false });
    box(g, 0.2, 0.12, 0.2, '#1d1d22', -1.1, 0, -0.7);
    box(g, 0.2, 0.12, 0.2, '#1d1d22', -0.1, 0, -0.7);
    box(g, 0.04, 0.5, 0.04, '#333', -0.6, 1.0, -0.7);
    // Azulejo-tiled house
    box(g, 1.1, 1.3, 0.9, '#f4f4f4', 1.1, 0, -0.8);
    box(g, 1.2, 0.2, 1.0, '#e8743b', 1.1, 1.3, -0.8);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 4; c++)
        if ((r + c) % 2 === 0) box(g, 0.2, 0.2, 0.03, '#2b6cff', 0.8 + c * 0.2, 0.25 + r * 0.3, -0.34, { shadow: false });
    // Flags: Portugal and Spain
    box(g, 0.06, 1.2, 0.06, '#dfe3ea', 1.9, 0, 0.2);
    box(g, 0.2, 0.34, 0.04, '#046a38', 2.03, 0.8, 0.2);
    box(g, 0.3, 0.34, 0.04, '#da291c', 2.28, 0.8, 0.2);
    box(g, 0.06, 1.2, 0.06, '#dfe3ea', 1.9, 0, 0.7);
    box(g, 0.5, 0.1, 0.04, '#c60b1e', 2.18, 0.98, 0.7);
    box(g, 0.5, 0.16, 0.04, '#ffc400', 2.18, 0.84, 0.7);
    box(g, 0.5, 0.1, 0.04, '#c60b1e', 2.18, 0.74, 0.7);
    crew(g, [{}, FRIENDS.shared, FRIENDS.d, FRIENDS.e], -1.3, 0.6);
  },
  // 2017: EDC. A big stage, a crowd and lots of fireworks.
  edc(g, live, anim) {
    // Stage, truss and screen
    box(g, 3.2, 0.35, 1.4, '#2b2f3a', 0, 0, -0.7);
    box(g, 0.16, 2.3, 0.16, '#555c68', -1.5, 0.35, -1.3);
    box(g, 0.16, 2.3, 0.16, '#555c68', 1.5, 0.35, -1.3);
    box(g, 3.16, 0.16, 0.16, '#555c68', 0, 2.65, -1.3);
    box(g, 0.6, 1.0, 0.45, '#1b1b1f', -1.3, 0.35, -0.4);
    box(g, 0.6, 1.0, 0.45, '#1b1b1f', 1.3, 0.35, -0.4);
    const screen = live(0, 0.95, -1.36);
    const panels = [];
    for (let i = 0; i < 6; i++) panels.push(box(screen, 0.4, 1.3, 0.05, '#7b61ff', -1.0 + i * 0.4, 0, 0, { shadow: false }));
    const hues = ['#7b61ff', '#ff3b5c', '#15c2b0', '#ffd23f', '#ff6fa8', '#2ec4ff'];
    anim.push((dt, t) => panels.forEach((p, i) => p.material = mat(hues[(Math.floor(t * 2) + i) % hues.length])));
    // Crowd (live, so they can dance)
    const crowd = live(0, 0, 0);
    ['#ff6fa8', '#2ec4ff', '#ffd23f', '#48c774', '#ff8a1f'].forEach((shirt, i) => {
      const p = makePlayer({ shirt, beard: null, hair: ['#1c1512', '#e0c070', '#6b3f2a', '#1c1512', '#b58a5a'][i], longHair: i % 2 === 0 });
      p.root.position.set(-1.3 + i * 0.65, 0, 0.7 + (i % 2) * 0.3);
      p.root.scale.setScalar(0.8);
      crowd.add(p.root);
      p.armL.rotation.z = -2.6;
      p.armR.rotation.z = 2.6;
      anim.push((dt, t) => (p.root.position.y = Math.abs(Math.sin(t * 5 + i)) * 0.12));
    });
    // Fireworks: shells launch, then burst into sparks that fall and fade.
    const colors = ['#ff3b5c', '#ffd23f', '#15c2b0', '#7b61ff', '#ff6fa8', '#ff8a1f'];
    for (let f = 0; f < 5; f++) {
      const fw = live(-1.6 + f * 0.8, 0, -1.6 - (f % 2) * 0.6);
      const color = colors[f % colors.length];
      const shell = box(fw, 0.12, 0.12, 0.12, '#ffffff', 0, 0, 0, { shadow: false });
      const sparks = [];
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const e = (k % 3) * 0.5 - 0.5;
        sparks.push({ m: box(fw, 0.08, 0.08, 0.08, k % 4 === 0 ? '#ffffff' : color, 0, 0, 0, { shadow: false }), dx: Math.cos(a), dy: Math.sin(a) * 0.8 + e * 0.3, dz: Math.sin(a) * 0.3 });
      }
      const period = 2.6 + f * 0.37;
      const peak = 3.2 + (f % 3) * 0.6;
      anim.push((dt, t) => {
        const u = ((t + f * 0.9) % period) / period;
        const rise = 0.3;
        shell.visible = u < rise;
        if (u < rise) shell.position.set(0, (u / rise) * peak, 0);
        const k = (u - rise) / (1 - rise);
        sparks.forEach((sp) => {
          sp.m.visible = u >= rise && k < 0.8;
          if (!sp.m.visible) return;
          const r = Math.pow(k, 0.35) * 1.8;
          sp.m.position.set(sp.dx * r, peak + sp.dy * r - k * k * 1.2, sp.dz * r);
          sp.m.scale.setScalar(1 - k);
        });
      });
    }
  },
  // 2016: Netherlands, Germany, Prague, Switzerland
  europe(g, live, anim) {
    // Dutch windmill
    box(g, 0.9, 1.4, 0.9, '#8b5e3c', -0.9, 0, -0.6);
    box(g, 0.7, 0.6, 0.7, '#7a4f31', -0.9, 1.4, -0.6);
    box(g, 0.4, 0.3, 0.4, '#5a3a22', -0.9, 2.0, -0.6);
    const blades = live(-0.9, 1.7, -0.6 + 0.4);
    box(blades, 0.18, 2.0, 0.05, '#f4efe4', 0, -1.0, 0);
    box(blades, 2.0, 0.18, 0.05, '#f4efe4', 0, -0.09, 0);
    anim.push((dt, t) => (blades.rotation.z = t * 0.8));
    // Tulips
    ['#ff3b5c', '#ffd23f', '#ff6fa8', '#ff8a1f', '#7b61ff'].forEach((c, i) => {
      box(g, 0.06, 0.25, 0.06, '#3fae6a', -1.6 + i * 0.3, 0, 0.3);
      box(g, 0.16, 0.16, 0.16, c, -1.6 + i * 0.3, 0.25, 0.3);
    });
    // Prague spire
    box(g, 0.6, 1.6, 0.6, '#3a3f4b', 0.9, 0, -0.8);
    box(g, 0.4, 0.5, 0.4, '#2b2f3a', 0.9, 1.6, -0.8);
    box(g, 0.2, 0.5, 0.2, '#2b2f3a', 0.9, 2.1, -0.8);
    box(g, 0.08, 0.3, 0.08, '#f6c453', 0.9, 2.6, -0.8);
    // Swiss flag
    box(g, 0.06, 1.3, 0.06, '#dfe3ea', 1.6, 0, 0.1);
    box(g, 0.5, 0.5, 0.04, '#d52b1e', 1.87, 0.85, 0.1);
    box(g, 0.3, 0.1, 0.05, '#ffffff', 1.87, 1.05, 0.1);
    box(g, 0.1, 0.3, 0.05, '#ffffff', 1.87, 0.95, 0.1);
    crew(g, [{}, FRIENDS.shared, FRIENDS.b, FRIENDS.c], -1.0, 0.9);
  },
  // 2016: music festivals
  festival(g, live, anim) {
    box(g, 2.8, 0.3, 1.4, '#2b2f3a', 0, 0, -0.4);
    box(g, 0.14, 2.0, 0.14, '#555c68', -1.3, 0.3, -1.0);
    box(g, 0.14, 2.0, 0.14, '#555c68', 1.3, 0.3, -1.0);
    box(g, 2.74, 0.14, 0.14, '#555c68', 0, 2.3, -1.0);
    box(g, 2.5, 1.4, 0.06, '#1b1b1f', 0, 0.5, -1.05);
    box(g, 0.5, 0.8, 0.4, '#1b1b1f', -1.15, 0.3, -0.3);
    box(g, 0.5, 0.8, 0.4, '#1b1b1f', 1.15, 0.3, -0.3);
    const lights = live(0, 2.15, -0.9);
    const colors = ['#ff3b5c', '#ffd23f', '#15c2b0', '#7b61ff', '#ff8a1f'];
    const bulbs = colors.map((c, i) => box(lights, 0.22, 0.18, 0.18, c, -1.0 + i * 0.5, 0, 0, { shadow: false }));
    anim.push((dt, t) => bulbs.forEach((b, i) => (b.visible = Math.sin(t * 6 + i * 1.3) > -0.2)));
    // Crowd facing the stage
    ['#ff6fa8', '#2ec4ff', '#ffd23f', '#48c774'].forEach((shirt, i) => {
      const p = makePlayer({ shirt, beard: null, hair: ['#1c1512', '#e0c070', '#6b3f2a', '#1c1512'][i], longHair: i % 2 === 0 });
      p.root.position.set(-1.0 + i * 0.65, 0, 1.0 + (i % 2) * 0.25);
      p.root.scale.setScalar(0.8);
      g.add(p.root);
    });
  },
};
