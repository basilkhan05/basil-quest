// Voxel props for Wake Run (src/arcade/games/wakeboard.js): river features,
// riverbank decor, checkpoint arches and the finish beach. Everything faces -z
// like the rest of the site; local y = 0 is the surface the prop sits on.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, group, sign } from '../../game/voxel.js';
import { makePlayer, LICHEN } from '../../game/models.js';

export const C = {
  teal: '#15c2b0',
  tealDark: '#0f9486',
  ink: '#111111',
  pink: '#ff4d6d',
  white: '#ffffff',
  yellow: '#ffd23f',
  sand: '#f3d89b',
  sandWet: '#e6c78e',
  grass: '#8fd14f',
  water: '#4fc3f7',
  water2: '#49bbef',
  foam: '#e8fbff',
  navy: '#2b3240',
  wood: '#9b6b43',
};

export const RAIL_H = 0.72;

// Merge a prop's boxes into one mesh per material so recycled props stay cheap
// (a palm goes from 9 draw calls to 3). Sign faces (multi-material) are kept.
export function bake(g) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert();
  const buckets = new Map();
  const keep = [];
  g.traverseVisible((o) => {
    if (!o.isMesh) return;
    const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    if (Array.isArray(o.material) || o.material.transparent) {
      keep.push([o, rel]);
      return;
    }
    const key = o.material.uuid + (o.castShadow ? 's' : 'n');
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, geos: [] });
    buckets.get(key).geos.push(o.geometry.clone().applyMatrix4(rel));
  });
  keep.forEach(([o]) => o.removeFromParent());
  g.clear();
  for (const b of buckets.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(b.geos), b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  keep.forEach(([o, rel]) => {
    rel.decompose(o.position, o.quaternion, o.scale);
    g.add(o);
  });
  return g;
}

// Floating kicker: front edge at z = 0, lip at z = -len, rising to `lip`.
export function makeKicker({ w = 2.4, len = 3, lip = 1, side = C.teal, flag = C.pink }, signTpl) {
  const g = group();
  const n = 8;
  const d = len / n;
  for (let i = 0; i < n; i++) {
    const h = (lip * (i + 1)) / n;
    box(g, w, h + 0.25, d + 0.01, side, 0, -0.25, -(i + 0.5) * d);
    box(g, w - 0.14, 0.05, d + 0.01, C.white, 0, h, -(i + 0.5) * d, { shadow: false });
  }
  box(g, w + 0.04, 0.1, 0.12, C.pink, 0, lip - 0.06, -len + 0.06);
  for (const sx of [-1, 1]) {
    box(g, 0.36, 0.3, len + 0.4, C.navy, sx * (w / 2 - 0.2), -0.32, -len / 2);
    box(g, 0.05, 0.9, 0.05, '#dddddd', sx * (w / 2), lip, -len + 0.05);
    box(g, 0.34, 0.22, 0.03, flag, sx * (w / 2 + 0.17), lip + 0.66, -len + 0.05);
    if (signTpl) {
      const s = signTpl.clone();
      s.rotation.y = sx * (Math.PI / 2);
      s.position.set(sx * (w / 2 + 0.07), -0.05, -len * 0.42);
      g.add(s);
    }
  }
  return bake(g);
}

// Slider: short entry ramp (z 0 -> -entry) up onto a rail that runs to -entry - railLen.
export function makeSlider({ entry = 1.8, railLen = 12 }, signTpl) {
  const g = group();
  const n = 5;
  const d = entry / n;
  for (let i = 0; i < n; i++) {
    const h = (RAIL_H * (i + 1)) / n;
    box(g, 1.0, h + 0.2, d + 0.01, C.teal, 0, -0.2, -(i + 0.5) * d);
    box(g, 0.86, 0.05, d + 0.01, C.white, 0, h - 0.02, -(i + 0.5) * d, { shadow: false });
  }
  box(g, 0.26, 0.1, railLen, C.pink, 0, RAIL_H - 0.1, -entry - railLen / 2);
  box(g, 0.14, 0.08, railLen, C.ink, 0, RAIL_H - 0.18, -entry - railLen / 2);
  for (let zz = 0.6; zz < railLen; zz += 3.6) {
    box(g, 0.12, RAIL_H, 0.12, C.navy, 0, -0.18, -entry - zz);
    box(g, 0.8, 0.3, 0.6, C.white, 0, -0.22, -entry - zz);
  }
  box(g, 0.12, RAIL_H, 0.12, C.navy, 0, -0.18, -entry - railLen + 0.2);
  box(g, 0.8, 0.3, 0.6, C.white, 0, -0.22, -entry - railLen + 0.2);
  if (signTpl) {
    for (const sx of [-1, 1]) {
      const s = signTpl.clone();
      s.rotation.y = sx * (Math.PI / 2);
      s.position.set(sx * 0.42, -0.08, -entry - railLen / 2);
      g.add(s);
    }
  }
  return bake(g);
}

// Obstacle buoy with a pennant. About 0.8 tall above the water.
export function makeBuoy(a = C.pink, b = C.teal) {
  const g = group();
  box(g, 0.62, 0.42, 0.62, a, 0, -0.26, 0);
  box(g, 0.64, 0.12, 0.64, C.white, 0, 0.16, 0);
  box(g, 0.46, 0.28, 0.46, a, 0, 0.28, 0);
  box(g, 0.24, 0.14, 0.24, b, 0, 0.56, 0);
  box(g, 0.05, 0.55, 0.05, C.ink, 0, 0.7, 0);
  box(g, 0.34, 0.22, 0.03, b, 0.18, 1.0, 0);
  return bake(g);
}

// Lane marker buoy with a branded flag (non-colliding, lines the river).
export function makeMarker(signTpl, color) {
  const g = group();
  box(g, 0.5, 0.45, 0.5, color, 0, -0.28, 0);
  box(g, 0.52, 0.1, 0.52, C.white, 0, 0.17, 0);
  box(g, 0.06, 1.2, 0.06, C.navy, 0, 0.27, 0);
  const s = signTpl.clone();
  s.position.set(0, 0.92, 0);
  g.add(s);
  return bake(g);
}

export function makeLog() {
  const g = group();
  box(g, 2.6, 0.42, 0.42, '#8a5a3b', 0, -0.2, 0);
  box(g, 2.5, 0.08, 0.3, '#a8744f', 0, 0.2, 0);
  box(g, 0.06, 0.34, 0.34, '#d9a36b', -1.31, -0.16, 0);
  box(g, 0.06, 0.34, 0.34, '#d9a36b', 1.31, -0.16, 0);
  box(g, 0.14, 0.24, 0.14, '#7a4b33', 0.6, 0.18, -0.08);
  box(g, 0.3, 0.06, 0.2, '#48c774', 0.66, 0.38, -0.08);
  return bake(g);
}

export function makePalm(s = 1.25) {
  const g = group();
  for (let i = 0; i < 6; i++) box(g, 0.24 * s, 0.32 * s, 0.24 * s, C.wood, i * 0.06 * s, i * 0.32 * s, 0);
  const top = 1.92 * s;
  const x = 0.32 * s;
  box(g, 0.34 * s, 0.16 * s, 0.34 * s, '#3fae6a', x, top, 0);
  box(g, 1.7 * s, 0.1 * s, 0.34 * s, '#48c774', x, top + 0.1 * s, 0);
  box(g, 0.34 * s, 0.1 * s, 1.7 * s, '#48c774', x, top + 0.12 * s, 0);
  box(g, 0.3 * s, 0.1 * s, 0.3 * s, '#3fae6a', x - 0.85 * s, top - 0.02 * s, 0);
  box(g, 0.3 * s, 0.1 * s, 0.3 * s, '#3fae6a', x + 0.85 * s, top - 0.02 * s, 0);
  box(g, 0.3 * s, 0.1 * s, 0.3 * s, '#3fae6a', x, top, 0.85 * s);
  box(g, 0.16 * s, 0.16 * s, 0.16 * s, '#7a4b33', x - 0.14 * s, top - 0.14 * s, 0.14 * s);
  return bake(g);
}

export function makeUmbrella(a = C.teal, b = C.white) {
  const g = group();
  box(g, 0.07, 1.6, 0.07, '#f4f4f4', 0, 0, 0);
  box(g, 1.6, 0.12, 1.6, a, 0, 1.6, 0);
  box(g, 1.1, 0.12, 1.1, b, 0, 1.72, 0);
  box(g, 0.4, 0.1, 0.4, a, 0, 1.84, 0);
  box(g, 0.7, 0.04, 1.3, b === C.white ? C.pink : C.yellow, 0.75, 0, 0.4, { shadow: false });
  return bake(g);
}

export function makeFlag(color) {
  const g = group();
  box(g, 0.08, 2.7, 0.08, '#d6d6d6', 0, 0, 0);
  box(g, 0.62, 1.8, 0.05, color, 0.34, 0.8, 0);
  box(g, 0.62, 0.14, 0.06, C.ink, 0.34, 2.46, 0);
  return bake(g);
}

export function makeBillboard(lines, bg, fg, w = 4.6, h = 1.7) {
  const g = group();
  sign(g, lines, { w, h, post: 1.3, bg, fg, size: 26, postColor: '#6b4a2f' });
  return bake(g);
}

export function makeHut() {
  const g = group();
  box(g, 2.4, 1.3, 1.7, '#e9dcc0', 0, 0, 0);
  box(g, 2.8, 0.22, 2.1, '#d9a36b', 0, 1.3, 0);
  box(g, 2.2, 0.22, 1.6, '#c89163', 0, 1.52, 0);
  box(g, 1.4, 0.5, 0.06, '#3a2a22', 0, 0.45, 0.86, { shadow: false });
  box(g, 1.6, 0.14, 0.4, '#b5875a', 0, 0.42, 1.0);
  sign(g, ['FRESHLY'], { w: 1.8, h: 0.42, x: 0, y: 1.0, z: 0.92, bg: C.teal, fg: C.ink, size: 18 });
  return bake(g);
}

// Inflatable checkpoint arch spanning the river; banner text faces the camera (+z).
export function makeArch(lines, span) {
  const g = group();
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 7; i++) box(g, 0.9, 0.62, 0.9, i % 2 ? C.white : C.teal, (sx * span) / 2, -0.3 + i * 0.62, 0);
    box(g, 1.0, 0.3, 1.0, C.pink, (sx * span) / 2, 4.04, 0);
  }
  box(g, span + 0.9, 1.05, 0.4, C.ink, 0, 3.62, 0);
  sign(g, lines, { w: 8.4, h: 0.95, x: 0, y: 3.67, z: 0.2, bg: C.ink, fg: C.teal, size: 30 });
  return bake(g);
}

// The finish beach. Local z = 0 is the waterline; the beach runs off toward -z.
export function makeShore() {
  const g = group();
  box(g, 220, 0.5, 3, C.sandWet, 0, -0.32, -1.5, { shadow: false });
  box(g, 220, 0.7, 140, C.sand, 0, -0.35, -73, { shadow: false });
  box(g, 220, 0.05, 0.6, C.foam, 0, -0.02, 0.25, { shadow: false });
  box(g, 220, 0.8, 100, C.grass, 0, -0.35, -100, { shadow: false });
  // Finish arch on the sand
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) box(g, 0.8, 0.6, 0.8, i % 2 ? C.white : C.pink, sx * 5, 0.35 + i * 0.6, -7);
  }
  box(g, 10.8, 1.0, 0.4, C.pink, 0, 3.6, -7);
  sign(g, [{ text: 'SIMPLE BUNDLES 2.0', size: 26 }, { text: 'LAUNCH PARTY', size: 16 }], { w: 8.6, h: 0.92, x: 0, y: 3.64, z: -6.79, bg: C.pink, fg: C.white, size: 24 });
  sign(g, [{ text: 'FRESHLY', size: 40 }, { text: 'COMMERCE', size: 40 }], { w: 6.5, h: 2.4, x: 0, y: 0.35, z: -19, post: 1.6, bg: C.teal, fg: C.ink, size: 40 });
  const hut = makeHut();
  hut.position.set(-8.5, 0.35, -13);
  g.add(hut);
  [[-10, -4], [-13.5, -9], [9.5, -4.5], [13, -11], [-4.5, -24], [5.5, -23], [-17, -3.5], [17, -5], [-20, -14], [20, -15]].forEach(([x, z], i) => {
    const p = makePalm(1.15 + (i % 3) * 0.12);
    p.position.set(x, 0.35, z);
    p.rotation.y = i * 1.3;
    g.add(p);
  });
  [[-6, -11, C.teal, C.white], [8, -10, C.pink, C.white], [3.5, -14, C.yellow, C.teal]].forEach(([x, z, a, b]) => {
    const u = makeUmbrella(a, b);
    u.position.set(x, 0.35, z);
    g.add(u);
  });
  [[-3.4, -6.4, C.teal], [3.4, -6.4, C.pink]].forEach(([x, z, c]) => {
    const f = makeFlag(c);
    f.position.set(x, 0.35, z);
    g.add(f);
  });
  bake(g);
  // Lichen waits on the beach and waves Basil in.
  const lichen = makePlayer({ ...LICHEN });
  lichen.gear.shades.visible = true;
  lichen.root.position.set(1.6, 0.35, -4.5);
  lichen.root.rotation.y = Math.PI - 0.3;
  g.add(lichen.root);
  return { g, lichen };
}
