// Endless winding trail for Bronco Off-Road.
//
// The world is a ring of 1-unit rows (Crossy Road style). Each row is a strip of
// ground, two soft shoulders, the dirt trail and two tire ruts, all drawn with a
// handful of InstancedMeshes so the whole trail is a few draw calls. Roadside
// scenery reuses the site's voxel models (pine, tree, rock, cactus, mesa...):
// each model is captured once as a list of boxes, then stamped into one big
// instanced mesh with a fixed budget of boxes per row.
import * as THREE from 'three';
import { pine, tree, autumnTree, rock, cactus, mesa, flowers } from '../../game/models.js';

export const W = 6; // trail width
export const SH = 1.5; // soft shoulder on each side
export const EDGE = W / 2 + SH; // hard limit for the Bronco
export const AHEAD = 100;
export const BEHIND = 12;
const R = AHEAD + BEHIND;
const SLOTS = 20; // scenery boxes per row
const FOREST_LEN = 520;
const CYCLE = 940;

export const BIOMES = [
  {
    name: 'forest',
    ground: ['#86c95a', '#7cbf51'],
    shoulder: ['#b5c463', '#aabb5b'],
    trail: ['#b27b4f', '#a8714a'],
    rut: '#93603b',
    sky: '#bdeeff',
    dust: ['#b27b4f', '#c99a6b', '#a8714a'],
  },
  {
    name: 'desert',
    ground: ['#f3d89b', '#ecce8b'],
    shoulder: ['#e6c080', '#ddb776'],
    trail: ['#d29a62', '#c9915a'],
    rut: '#b37d4c',
    sky: '#ffd6a0',
    dust: ['#e8c48c', '#d9a36b', '#f3d89b'],
  },
];

export function biomeAt(s) {
  if (s < FOREST_LEN) return 0;
  return ((s % CYCLE) + CYCLE) % CYCLE < FOREST_LEN ? 0 : 1;
}
// Distance from s to the next biome boundary.
export function nextBoundary(s) {
  const m = ((s % CYCLE) + CYCLE) % CYCLE;
  return m < FOREST_LEN ? FOREST_LEN - m : CYCLE - m;
}

export function createTerrain(scene) {
  const UNIT = new THREE.BoxGeometry(1, 1, 1);
  UNIT.translate(0, 0.5, 0); // bottom-anchored like voxel.box
  const white = () => new THREE.MeshLambertMaterial({ color: '#ffffff' });

  const CENTER = new THREE.BoxGeometry(1, 1, 1); // what voxel.box uses
  const mk = (n, shadow = false, geo = UNIT) => {
    const m = new THREE.InstancedMesh(geo, white(), n);
    m.frustumCulled = false;
    m.receiveShadow = true;
    m.castShadow = shadow;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) m.setColorAt(i, new THREE.Color('#ffffff'));
    scene.add(m);
    return m;
  };
  const groundIM = mk(R);
  const shoulderIM = mk(R * 2);
  const trailIM = mk(R);
  const rutIM = mk(R * 2);
  const sceneryIM = mk(R * SLOTS, true, CENTER);

  // ---------- Capture site models as box templates ----------
  function capture(build) {
    const g = new THREE.Group();
    build(g);
    g.updateMatrixWorld(true);
    const parts = [];
    g.traverse((o) => {
      if (o.isMesh) parts.push({ m: o.matrixWorld.clone(), c: o.material.color.clone() });
    });
    return parts;
  }
  const T = {
    pine: [capture((g) => pine(g, 0, 0, 0))],
    tree: [0, 1, 2, 3, 4].map(() => capture((g) => tree(g, 0, 0, 0))),
    autumn: [0, 1, 2].map(() => capture((g) => autumnTree(g, 0, 0, 0))),
    rock: [capture((g) => rock(g, 0, 0, 0))],
    drock: [capture((g) => rock(g, 0, 0, 0, '#d9a36b'))],
    cactus: [capture((g) => cactus(g, 0, 0, 0))],
    mesa: [capture((g) => mesa(g, 0, 0, 0, 3, 2.5))],
    flowers: [0, 1, 2, 3].map(() => capture((g) => flowers(g, 0, 0, 0))),
    shrub: [
      capture((g) => {
        const b = (w, h, d, c, x, y, z) => {
          const m = new THREE.Mesh(CENTER, new THREE.MeshLambertMaterial({ color: c }));
          m.scale.set(w, h, d);
          m.position.set(x, y + h / 2, z);
          g.add(m);
        };
        b(0.5, 0.3, 0.5, '#a39257', 0, 0, 0);
        b(0.3, 0.25, 0.3, '#8c7c45', 0.15, 0.25, 0.05);
        b(0.25, 0.2, 0.25, '#b5a160', -0.12, 0.2, -0.1);
      }),
    ],
  };

  // ---------- Trail curve ----------
  let ph = [0, 0, 0];
  function cx(s) {
    const ramp = Math.min(1, Math.max(0, (s - 15) / 70));
    return ramp * (3.0 * Math.sin(s * 0.068 + ph[0]) + 1.5 * Math.sin(s * 0.157 + ph[1]) + 0.3 * Math.sin(s * 0.29 + ph[2]));
  }
  const slope = (s) => (cx(s + 0.5) - cx(s - 0.5));
  const curv = (s) => cx(s + 1) - 2 * cx(s) + cx(s - 1);

  // ---------- Row building ----------
  const M = new THREE.Matrix4();
  const M2 = new THREE.Matrix4();
  const P = new THREE.Vector3();
  const S = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const C = new THREE.Color();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const put = (im, i, x, y, z, w, h, d, color) => {
    im.setMatrixAt(i, M.compose(P.set(x, y, z), Q.identity(), S.set(w, h, d)));
    im.setColorAt(i, C.set(color));
  };

  let built = -Infinity;
  let clearFn = () => true;
  let rnd = Math.random;

  function buildRow(i) {
    const k = ((i % R) + R) % R;
    const s = i + 0.5;
    const x = cx(s);
    const z = -s;
    const bi = biomeAt(s + (rnd() - 0.5) * 12);
    const b = BIOMES[bi];
    const st = i & 1;
    put(groundIM, k, x, -1, z, 200, 1, 1, b.ground[st]);
    put(shoulderIM, k * 2, x - W / 2 - SH / 2, 0, z, SH, 0.015, 1, b.shoulder[st]);
    put(shoulderIM, k * 2 + 1, x + W / 2 + SH / 2, 0, z, SH, 0.015, 1, b.shoulder[st]);
    put(trailIM, k, x, 0, z, W, 0.03, 1, b.trail[st]);
    put(rutIM, k * 2, x - 0.56, 0.03, z, 0.28, 0.012, 1, b.rut);
    put(rutIM, k * 2 + 1, x + 0.56, 0.03, z, 0.28, 0.012, 1, b.rut);

    // Scenery
    let n = 0;
    const base = k * SLOTS;
    const place = (set, u, sc) => {
      const tpl = set[(rnd() * set.length) | 0];
      if (n + tpl.length > SLOTS) return;
      if (!clearFn(s, u, sc)) return;
      M.compose(P.set(x + u, 0, z + (rnd() - 0.5) * 0.3), Q.identity(), S.set(sc, sc, sc));
      for (const part of tpl) {
        sceneryIM.setMatrixAt(base + n, M2.multiplyMatrices(M, part.m));
        sceneryIM.setColorAt(base + n, part.c);
        n++;
      }
    };
    const side = () => (rnd() < 0.5 ? -1 : 1);
    if (s > 4) {
      if (bi === 0) {
        if (rnd() < 0.45) place(T.pine, -(6.0 + rnd() * 1.4), 1.45 + rnd() * 0.6);
        if (rnd() < 0.45) place(T.pine, 6.0 + rnd() * 1.4, 1.45 + rnd() * 0.6);
        if (rnd() < 0.6) {
          const r = rnd();
          place(r < 0.6 ? T.pine : r < 0.9 ? T.tree : T.autumn, side() * (8 + rnd() * 18), 1.5 + rnd() * 1.1);
        }
        if (rnd() < 0.06) place(T.rock, side() * (4.8 + rnd() * 2.5), 1 + rnd() * 0.6);
        if (rnd() < 0.12) place(T.flowers, side() * (4.7 + rnd() * 9), 1.3);
      } else {
        if (rnd() < 0.15) place(T.cactus, side() * (5.2 + rnd() * 14), 1.0 + rnd() * 0.5);
        if (rnd() < 0.1) place(T.drock, side() * (4.8 + rnd() * 14), 1 + rnd() * 0.9);
        if (rnd() < 0.1) place(T.shrub, side() * (4.8 + rnd() * 12), 1 + rnd() * 0.6);
        if (rnd() < 0.03) place(T.mesa, side() * (16 + rnd() * 14), 1.6 + rnd() * 1.1);
      }
    }
    for (; n < SLOTS; n++) sceneryIM.setMatrixAt(base + n, ZERO);
  }

  function flag() {
    [groundIM, shoulderIM, trailIM, rutIM, sceneryIM].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    });
  }

  return {
    cx,
    slope,
    curv,
    // New trail shape, rebuilt from the start.
    reset(random = Math.random) {
      rnd = random;
      ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
      built = -BEHIND - 1;
      this.update(0);
    },
    setClear(fn) {
      clearFn = fn;
    },
    // Make sure rows exist from sp - BEHIND to sp + AHEAD.
    update(sp) {
      const want = Math.floor(sp) + AHEAD - 1;
      if (built < Math.floor(sp) - BEHIND) built = Math.floor(sp) - BEHIND;
      if (want <= built) return;
      while (built < want) buildRow(++built);
      flag();
    },
  };
}
