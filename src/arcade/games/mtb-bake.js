// Voxel baker for Send It: merges thousands of boxes into one vertex-colored
// BufferGeometry, so a whole stretch of forest trail is a single draw call.
// Boxes use the same conventions as src/game/voxel.js (bottom-anchored, Lambert).
import * as THREE from 'three';

// Each face: normal n and tangents u, v with u x v = n (counter-clockwise from outside).
const FACES = [
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
];
const UV = []; // unit cube corners (centered), 24 verts
const UN = []; // matching normals
for (const [n, u, v] of FACES) {
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    for (let k = 0; k < 3; k++) {
      UV.push(0.5 * (n[k] + a * u[k] + b * v[k]));
      UN.push(n[k]);
    }
  }
}

let INDEX = new Uint32Array(0);
function indexFor(boxes) {
  if (INDEX.length < boxes * 36) {
    const n = Math.max(boxes, 4096) * 2;
    INDEX = new Uint32Array(n * 36);
    for (let i = 0; i < n; i++) {
      for (let f = 0; f < 6; f++) {
        const b = i * 24 + f * 4;
        INDEX.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 36 + f * 6);
      }
    }
  }
  return INDEX.slice(0, boxes * 36);
}

const colors = new Map();
export function rgb(c) {
  if (Array.isArray(c)) return c;
  if (c && c.isColor) return [c.r, c.g, c.b];
  let v = colors.get(c);
  if (!v) {
    const k = new THREE.Color(c);
    v = [k.r, k.g, k.b];
    colors.set(c, v);
  }
  return v;
}

const NM = new THREE.Matrix3();

export class Baker {
  constructor(cap = 4096) {
    this.n = 0;
    this.alloc(cap);
  }
  alloc(cap) {
    const old = this.cap ? [this.P, this.N, this.C] : null;
    this.cap = cap;
    this.P = new Float32Array(cap * 72);
    this.N = new Float32Array(cap * 72);
    this.C = new Float32Array(cap * 72);
    if (old) {
      this.P.set(old[0]);
      this.N.set(old[1]);
      this.C.set(old[2]);
    }
  }
  // Axis-aligned box, bottom-anchored like voxel.box().
  box(w, h, d, color, x = 0, y = 0, z = 0) {
    if (this.n >= this.cap) this.alloc(this.cap * 2);
    const [r, g, b] = rgb(color);
    const o = this.n * 72;
    const cy = y + h / 2;
    const { P, N, C } = this;
    for (let k = 0; k < 72; k += 3) {
      P[o + k] = x + UV[k] * w;
      P[o + k + 1] = cy + UV[k + 1] * h;
      P[o + k + 2] = z + UV[k + 2] * d;
      N[o + k] = UN[k];
      N[o + k + 1] = UN[k + 1];
      N[o + k + 2] = UN[k + 2];
      C[o + k] = r;
      C[o + k + 1] = g;
      C[o + k + 2] = b;
    }
    this.n++;
  }
  // Unit cube through an arbitrary matrix (rotated / scaled parts).
  matrix(m, color) {
    if (this.n >= this.cap) this.alloc(this.cap * 2);
    const [r, g, b] = rgb(color);
    const e = m.elements;
    const ne = NM.getNormalMatrix(m).elements;
    const o = this.n * 72;
    const { P, N, C } = this;
    for (let k = 0; k < 72; k += 3) {
      const x = UV[k];
      const y = UV[k + 1];
      const z = UV[k + 2];
      P[o + k] = e[0] * x + e[4] * y + e[8] * z + e[12];
      P[o + k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      P[o + k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = UN[k];
      const bb = UN[k + 1];
      const c = UN[k + 2];
      let nx = ne[0] * a + ne[3] * bb + ne[6] * c;
      let ny = ne[1] * a + ne[4] * bb + ne[7] * c;
      let nz = ne[2] * a + ne[5] * bb + ne[8] * c;
      const l = Math.hypot(nx, ny, nz) || 1;
      N[o + k] = nx / l;
      N[o + k + 1] = ny / l;
      N[o + k + 2] = nz / l;
      C[o + k] = r;
      C[o + k + 1] = g;
      C[o + k + 2] = b;
    }
    this.n++;
  }
  // Stamp a template (see template()) at a position, with optional yaw and scale.
  put(tpl, x, y, z, rotY = 0, s = 1) {
    const add = tpl.n;
    while (this.n + add > this.cap) this.alloc(this.cap * 2);
    const o = this.n * 72;
    const { P, N } = this;
    const tp = tpl.P;
    const tn = tpl.N;
    const len = add * 72;
    this.C.set(tpl.C, o);
    if (rotY === 0) {
      N.set(tn, o);
      for (let k = 0; k < len; k += 3) {
        P[o + k] = x + tp[k] * s;
        P[o + k + 1] = y + tp[k + 1] * s;
        P[o + k + 2] = z + tp[k + 2] * s;
      }
    } else {
      const c = Math.cos(rotY);
      const sn = Math.sin(rotY);
      for (let k = 0; k < len; k += 3) {
        const lx = tp[k] * s;
        const lz = tp[k + 2] * s;
        P[o + k] = x + lx * c + lz * sn;
        P[o + k + 1] = y + tp[k + 1] * s;
        P[o + k + 2] = z - lx * sn + lz * c;
        const nx = tn[k];
        const nz = tn[k + 2];
        N[o + k] = nx * c + nz * sn;
        N[o + k + 1] = tn[k + 1];
        N[o + k + 2] = -nx * sn + nz * c;
      }
    }
    this.n += add;
  }
  // Hand the baked boxes over as a geometry and start fresh.
  geometry() {
    const g = new THREE.BufferGeometry();
    const v = this.n * 72;
    g.setAttribute('position', new THREE.BufferAttribute(this.P.slice(0, v), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.N.slice(0, v), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.C.slice(0, v), 3));
    g.setIndex(new THREE.BufferAttribute(indexFor(this.n), 1));
    g.computeBoundingSphere();
    this.n = 0;
    return g;
  }
}

// Capture a model built from voxel.js boxes (pine, tree, rock, makePlayer...)
// as pre-transformed vertex data that a Baker can stamp anywhere cheaply.
export function template(obj) {
  obj.updateMatrixWorld(true);
  const b = new Baker(64);
  obj.traverseVisible((o) => {
    if (o.isMesh && o.material && !Array.isArray(o.material) && !o.material.transparent && !o.material.map) {
      b.matrix(o.matrixWorld, o.material.color);
    }
  });
  const v = b.n * 72;
  return { n: b.n, P: b.P.slice(0, v), N: b.N.slice(0, v), C: b.C.slice(0, v) };
}
