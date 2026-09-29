import * as THREE from 'three';

// Shared geometry + material cache. Every voxel is a scaled unit cube, which keeps
// draw setup cheap and lets us build characters and props from plain box calls.
const UNIT = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map();

export function mat(color) {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    mats.set(color, m);
  }
  return m;
}

// Box anchored at its bottom-center so `y` is the surface it sits on.
export function box(parent, w, h, d, color, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(UNIT, opts.material || mat(color));
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
}

// Pixel-font sign rendered to a canvas texture. Font must be loaded first
// (see `ready()` in engine.js) or the canvas falls back to a system font.
export function signTexture(lines, { bg = '#111', fg = '#fff', w = 256, h = 96, size = 18, border = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (border) {
    g.strokeStyle = border;
    g.lineWidth = 8;
    g.strokeRect(4, 4, w - 8, h - 8);
  }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const arr = (Array.isArray(lines) ? lines : [lines]).map((line) =>
    typeof line === 'object' ? { ...line } : { text: line, size },
  );
  // Shrink any line that would overflow the board.
  arr.forEach((l) => {
    g.font = `${l.size}px "Press Start 2P", monospace`;
    const fit = (w * 0.88) / g.measureText(l.text).width;
    if (fit < 1) l.size = Math.floor(l.size * fit);
  });
  const gap = 0.55;
  const total = arr.reduce((n, l) => n + l.size, 0) + gap * Math.max(...arr.map((l) => l.size)) * (arr.length - 1);
  let y = (h - total) / 2;
  arr.forEach((l) => {
    g.font = `${l.size}px "Press Start 2P", monospace`;
    g.fillText(l.text, w / 2, y + l.size / 2 + 1);
    y += l.size * (1 + gap);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A thin board with the sign texture on its front face (facing +z, toward camera).
export function sign(parent, lines, opts = {}) {
  const { w = 2, h = 0.75, x = 0, y = 0, z = 0, post = 0, postColor = '#6b4a2f' } = opts;
  const g = group(parent, x, y, z);
  if (post > 0) {
    box(g, 0.14, post, 0.14, postColor, -w / 2 + 0.2, 0, 0);
    box(g, 0.14, post, 0.14, postColor, w / 2 - 0.2, 0, 0);
  }
  const tex = signTexture(lines, { ...opts, w: Math.round(128 * w), h: Math.round(128 * h) });
  const side = mat(opts.bg || '#111');
  const face = new THREE.MeshLambertMaterial({ map: tex });
  const mesh = new THREE.Mesh(UNIT, [side, side, side, side, face, side]);
  mesh.scale.set(w, h, 0.12);
  mesh.position.set(0, post + h / 2, 0);
  mesh.castShadow = true;
  g.add(mesh);
  return g;
}

export const rand = (() => {
  // Deterministic PRNG so the world looks the same on every visit.
  let s = 1337;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
})();

export const pick = (arr) => arr[Math.floor(rand() * arr.length)];
