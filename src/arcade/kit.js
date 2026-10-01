// Arcade kit: everything the mini-games share. A game module only builds its
// scene and runs its rules; the kit owns rendering, input, HUD, scoring,
// high scores, the start/game-over screens and mobile touch controls.
//
// A game module (src/arcade/games/<id>.js) default-exports create(ctx):
//
//   export default function create(ctx) {
//     // build the world once with ctx.scene / ctx.box / ctx.models ...
//     return {
//       reset() {},              // start of every run: put everything back
//       update(dt, input, t) {}, // every frame while playing
//       idle(dt, t) {},          // optional: animate behind the title / game-over screens
//     };
//   }
//
// ctx:
//   THREE, scene, camera (PerspectiveCamera, fov 50), setCamera(cam), renderer
//   box, group, sign, mat          voxel helpers (src/game/voxel.js)
//   models                         src/game/models.js (makePlayer, makeBronco, makeBike, ...)
//   sun                            DirectionalLight with shadows; call ctx.followSun(vec3) each frame
//   score / setScore(n) / addScore(n, label?)   label pops a "+n label" toast
//   setMeter(frac 0..1, label)     progress bar at the top (distance to the moon, etc.)
//   setLives(n)                    hearts in the HUD (omit to hide)
//   toast(text)                    big pixel text that pops and fades (e.g. "BACKFLIP!")
//   emit(colors, pos, n, opts)     voxel particles. opts: { speed, up, gravity, life, size }
//   shake(amount)                  quick camera shake
//   end(message?)                  game over (message shows on the game-over card)
//   rand(), clamp(v, a, b), lerp(a, b, t)
//   isTouch                        true on touch devices
//   meta                           registry entry (title, basilBest, ...)
//
// input (passed to update):
//   input.left / right / up / down / action   held booleans (keys, touch buttons)
//   input.pressed                              Set of one-shot presses this frame:
//                                              'left' 'right' 'up' 'down' 'action'
//   Keyboard: arrows or WASD; space = action. Touch: on-screen buttons, swipes
//   (one-shot left/right/up/down) and a tap on the scene (one-shot 'action').
//
// Debug: ?debug exposes window.__arcade = { start(), step(sec), ctx, inst, input, state() };
// ?autostart skips the title screen.

import * as THREE from 'three';
import { box, group, sign, mat } from '../game/voxel.js';
import * as models from '../game/models.js';

const storeKey = (id) => `basil-arcade:${id}`;
export function getBest(id) {
  try {
    return Number(localStorage.getItem(storeKey(id))) || 0;
  } catch {
    return 0;
  }
}
function saveBest(id, v) {
  try {
    localStorage.setItem(storeKey(id), String(v));
  } catch {}
}

const fmt = (n) => Math.round(n).toLocaleString('en-CA');

export async function runArcade(root, meta, create) {
  const $ = (s) => root.querySelector(s);
  const base = root.dataset.base || '/';
  const stageEl = $('#stage');
  const isTouch = matchMedia('(pointer: coarse)').matches;
  root.classList.toggle('is-touch', isTouch);

  // ---------- Three ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stageEl.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  let camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  scene.add(new THREE.HemisphereLight('#ffffff', '#8aa0b8', 1.25));
  const sun = new THREE.DirectionalLight('#fff4e0', 1.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  await document.fonts.load('16px "Press Start 2P"').catch(() => {});

  // ---------- Particles ----------
  const MAXP = 600;
  const pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), MAXP);
  pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pMesh.frustumCulled = false;
  scene.add(pMesh);
  const parts = [];
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  function emit(colors, pos, n = 10, o = {}) {
    const { speed = 2, up = 2, gravity = 9, life = 0.7, size = 0.12 } = o;
    for (let i = 0; i < n; i++) {
      if (parts.length >= MAXP) parts.shift();
      parts.push({
        x: pos.x, y: pos.y, z: pos.z,
        vx: (Math.random() - 0.5) * speed * 2, vy: up * (0.4 + Math.random() * 0.8), vz: (Math.random() - 0.5) * speed * 2,
        s: size * (0.6 + Math.random() * 0.8), life, max: life, g: gravity,
        c: colors[(Math.random() * colors.length) | 0],
      });
    }
  }
  function updateParticles(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      p.vy -= p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    for (let i = 0; i < MAXP; i++) {
      const p = parts[i];
      if (!p) {
        pMesh.setMatrixAt(i, m4.makeScale(0, 0, 0));
        continue;
      }
      const s = p.s * (p.life / p.max) + 0.01;
      pMesh.setMatrixAt(i, m4.makeScale(s, s, s).setPosition(p.x, p.y, p.z));
      pMesh.setColorAt(i, col.set(p.c));
    }
    pMesh.instanceMatrix.needsUpdate = true;
    if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
  }

  // ---------- HUD ----------
  const hud = { score: $('#hud-score'), meter: $('#hud-meter'), fill: $('#hud-meter .fill'), mlabel: $('#hud-meter .label'), lives: $('#hud-lives'), toast: $('#toast') };
  let score = 0;
  const setScore = (n) => {
    score = Math.max(0, n);
    hud.score.textContent = fmt(score);
  };
  let toastTimer = 0;
  const toast = (text) => {
    hud.toast.textContent = text;
    hud.toast.classList.remove('is-on');
    void hud.toast.offsetWidth;
    hud.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hud.toast.classList.remove('is-on'), 1200);
  };
  const addScore = (n, label) => {
    setScore(score + n);
    if (label) toast(`+${fmt(n)} ${label}`);
  };
  const setMeter = (frac, label) => {
    hud.meter.hidden = false;
    hud.fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    if (label != null) hud.mlabel.textContent = label;
  };
  const setLives = (n) => {
    hud.lives.hidden = false;
    hud.lives.textContent = '♥'.repeat(Math.max(0, n));
  };

  // ---------- Input ----------
  const input = { left: false, right: false, up: false, down: false, action: false, pressed: new Set() };
  const KEYS = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    ' ': 'action',
  };
  addEventListener('keydown', (e) => {
    const k = KEYS[e.key];
    if (e.key === 'Enter' || (e.key === ' ' && state !== 'play')) {
      e.preventDefault();
      if (state !== 'play') return start();
    }
    if (!k) return;
    e.preventDefault();
    if (!input[k]) input.pressed.add(k);
    input[k] = true;
  });
  addEventListener('keyup', (e) => {
    const k = KEYS[e.key];
    if (k) input[k] = false;
  });
  root.querySelectorAll('[data-key]').forEach((btn) => {
    const k = btn.dataset.key;
    const on = (e) => {
      e.preventDefault();
      if (!input[k]) input.pressed.add(k);
      input[k] = true;
      btn.classList.add('is-down');
    };
    const off = () => {
      input[k] = false;
      btn.classList.remove('is-down');
    };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
  });
  let touch = null;
  stageEl.addEventListener('pointerdown', (e) => (touch = { x: e.clientX, y: e.clientY }));
  stageEl.addEventListener('pointerup', (e) => {
    if (!touch || state !== 'play') return;
    const dx = e.clientX - touch.x;
    const dy = e.clientY - touch.y;
    touch = null;
    if (Math.hypot(dx, dy) < 14) return input.pressed.add('action');
    if (Math.abs(dx) > Math.abs(dy)) input.pressed.add(dx < 0 ? 'left' : 'right');
    else input.pressed.add(dy < 0 ? 'up' : 'down');
  });

  // ---------- Camera helpers ----------
  let shakeAmt = 0;
  const shake = (a) => (shakeAmt = Math.max(shakeAmt, a));
  const followSun = (v) => {
    sun.position.set(v.x - 8, v.y + 18, v.z + 10);
    sun.target.position.copy(v);
  };
  function resize() {
    const w = stageEl.clientWidth;
    const h = stageEl.clientHeight;
    renderer.setSize(w, h, false);
    if (camera.isPerspectiveCamera) {
      camera.aspect = w / h;
      // Keep roughly the same horizontal view on tall phones.
      camera.fov = w / h < 0.8 ? 64 : 50;
    } else if (camera.isOrthographicCamera) {
      const halfH = camera.userData.halfH || 8;
      camera.left = -halfH * (w / h);
      camera.right = halfH * (w / h);
      camera.top = halfH;
      camera.bottom = -halfH;
    }
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stageEl);

  // ---------- Game ----------
  let state = 'title';
  let endMessage = '';
  const ctx = {
    THREE, scene, renderer, sun, models, box, group, sign, mat, meta, isTouch,
    get camera() {
      return camera;
    },
    setCamera(c) {
      camera = c;
      resize();
    },
    get score() {
      return score;
    },
    setScore, addScore, setMeter, setLives, toast, emit, shake, followSun,
    end(message = '') {
      if (state !== 'play') return;
      endMessage = message;
      gameOver();
    },
    rand: Math.random,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    lerp: (a, b, t) => a + (b - a) * t,
  };
  const inst = create(ctx);
  resize();

  const titleEl = $('#title-screen');
  const overEl = $('#over-screen');
  const best = () => getBest(meta.id);
  function showTitle() {
    $('#best').textContent = fmt(best());
    $('#basil').textContent = fmt(meta.basilBest);
  }
  function start() {
    titleEl.hidden = true;
    overEl.hidden = true;
    root.classList.add('is-playing');
    hud.meter.hidden = true;
    hud.lives.hidden = true;
    setScore(0);
    input.pressed.clear();
    inst.reset();
    state = 'play';
  }
  function gameOver() {
    state = 'over';
    root.classList.remove('is-playing');
    const prev = best();
    const isBest = score > prev;
    if (isBest) saveBest(meta.id, Math.round(score));
    const beatBasil = score > meta.basilBest;
    $('#over-score').textContent = fmt(score);
    $('#over-best').textContent = fmt(Math.max(prev, score));
    $('#over-basil').textContent = fmt(meta.basilBest);
    $('#over-msg').textContent = endMessage;
    $('#over-verdict').textContent = beatBasil
      ? 'You beat Basil! Send him a screenshot.'
      : isBest
        ? 'New personal best. Basil is still ahead.'
        : `Basil's ahead by ${fmt(meta.basilBest - score)}.`;
    $('#over-verdict').dataset.win = beatBasil ? '1' : '';
    overEl.hidden = false;
  }
  $('#play')?.addEventListener('click', start);
  $('#again')?.addEventListener('click', start);
  showTitle();

  // ---------- Loop ----------
  let last = performance.now();
  let t = 0;
  function tick(dt) {
    t += dt;
    if (state === 'play') {
      inst.update(dt, input, t);
    } else inst.idle?.(dt, t);
    input.pressed.clear();
    updateParticles(dt);
    const cx = camera.position.x;
    const cy = camera.position.y;
    if (shakeAmt > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shakeAmt;
      camera.position.y += (Math.random() - 0.5) * shakeAmt;
      shakeAmt *= 0.88;
    }
    renderer.render(scene, camera);
    camera.position.x = cx;
    camera.position.y = cy;
  }
  function frame() {
    const now = performance.now();
    tick(Math.min(0.05, (now - last) / 1000));
    last = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
  });

  const params = new URLSearchParams(location.search);
  if (params.has('autostart')) start();
  if (params.has('debug')) {
    window.__arcade = {
      start, ctx, inst, input,
      state: () => ({ state, score, t }),
      step(sec = 1) {
        for (let i = 0; i < sec * 60; i++) tick(1 / 60);
      },
    };
  }
  return { ctx, start };
}
