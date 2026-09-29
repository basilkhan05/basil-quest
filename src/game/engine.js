import * as THREE from 'three';
import { buildWorld, groundAt, laneHeight, ROAD_LANES } from './world.js';
import { makePlayer, makeBronco, makeBike, makeSurfboard, makeSnowboard, makeChair, makeRocket } from './models.js';
import { STOPS, START } from './story.js';
import { box, group } from './voxel.js';

const HOP_DUR = 0.17;
const HOP_H = 0.42;
const EASE = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inout: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

// How Basil sits on each vehicle: offset of the player inside the actor.
const SEATS = {
  bronco: { pos: [-0.24, 0.66, 0.05], sit: true },
  bike: { pos: [0, 0.42, 0.08], sit: false },
  surf: { pos: [0, 0.08, 0.1], sit: false, rot: 0.5 },
  board: { pos: [0, 0.08, 0], sit: false, rot: 0.7 },
  chair: { pos: [0, -0.2, 0], sit: true },
  rocket: { hidden: true },
};

const SKY = {
  past: '#f3e2b8',
  freshly: '#bdeeff',
  road: '#bdeeff',
  roadtrip: '#ffd6a0',
  surf: '#9fe3ff',
  trail: '#c9f2cf',
  lift: '#dce9ff',
  park: '#dce9ff',
  summit: '#cfdcff',
  launch: '#0a0f2c',
};

export async function startGame(root) {
  const base = root.dataset.base || '/';
  const $ = (sel) => root.querySelector(sel);
  const canvasWrap = $('#stage');

  // ---------- Three setup ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvasWrap.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -100, 200);
  const CAM_OFFSET = new THREE.Vector3(2.2, 12, 8.5);

  scene.add(new THREE.HemisphereLight('#ffffff', '#8aa0b8', 1.25));
  const sun = new THREE.DirectionalLight('#fff4e0', 1.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  await document.fonts.load('16px "Press Start 2P"').catch(() => {});
  const world = buildWorld(scene);
  addLogos(scene, base);

  // ---------- Actor ----------
  const actor = { x: 0, L: 0, alt: 0, rot: 0, vehicle: null };
  const aGroup = group(scene);
  const aSpin = group(aGroup, 0, 0.6, 0);
  const aInner = group(aSpin, 0, -0.6, 0);
  const player = makePlayer();
  aInner.add(player.root);
  const rides = {
    bronco: makeBronco(),
    bike: makeBike(),
    surf: makeSurfboard(),
    board: makeSnowboard(),
    chair: makeChair(),
    rocket: makeRocket(),
  };
  Object.values(rides).forEach((m) => {
    m.visible = false;
    aInner.add(m);
  });

  function setVehicle(name) {
    actor.vehicle = name;
    Object.entries(rides).forEach(([k, m]) => (m.visible = k === name));
    const seat = name ? SEATS[name] : null;
    player.root.visible = !seat?.hidden;
    player.root.position.set(...(seat?.pos || [0, 0, 0]));
    player.root.rotation.y = seat?.rot || 0;
    if (seat?.sit) {
      player.legs.rotation.x = -Math.PI / 2;
      player.legs.position.set(0, 0.3, 0.05);
    } else {
      player.legs.rotation.x = 0;
      player.legs.position.set(0, 0, 0);
    }
    if (name && world.props[name]) world.props[name].visible = false;
  }

  function setGear(name) {
    Object.entries(player.gear).forEach(([k, g]) => (g.visible = k === name));
  }

  function placeProp(name, pose) {
    const p = world.props[name];
    if (!pose) {
      p.visible = false;
      return;
    }
    p.visible = true;
    p.position.set(pose.x, groundAt(pose.L) + (pose.alt || 0), -pose.L);
    p.rotation.set(0, pose.rot || 0, 0);
    if (name === 'surf' && pose.stand) {
      p.rotation.x = Math.PI / 2 - 0.2;
      p.position.y += 0.7;
    }
  }

  // ---------- Compile story paths into ops ----------
  const propPoses = {}; // name -> { seg, before, after }
  STOPS.forEach((stop, i) => {
    const s = { x: stop.pos.x, L: stop.pos.L, alt: stop.pos.alt || 0, rot: 0, vehicle: null };
    stop.ops = [];
    if (!stop.path) {
      stop.end = { ...s };
      return;
    }
    const prev = STOPS[i - 1].end;
    let cur = { ...prev, rot: 0 };
    for (const step of stop.path) {
      const from = { ...cur };
      if (step.type === 'hop' || step.type === 'move') {
        const to = { ...cur, x: step.x, L: step.L };
        if (step.alt !== undefined) to.alt = step.alt;
        if (step.type === 'hop') {
          const dx = step.x - cur.x;
          const dL = step.L - cur.L;
          if (Math.abs(dx) + Math.abs(dL) > 0.05) to.rot = Math.atan2(-dx, dL);
        } else if (step.rot !== undefined) {
          to.rot = step.rot;
        } else if (Math.hypot(step.x - cur.x, step.L - cur.L) > 0.3) {
          to.rot = Math.atan2(-(step.x - cur.x), step.L - cur.L);
        }
        stop.ops.push({ ...step, from, to, dur: step.type === 'hop' ? HOP_DUR : step.dur });
        cur = to;
      } else if (step.type === 'mount') {
        propPoses[step.name] = { seg: i, before: { ...cur }, after: null };
        stop.ops.push({ ...step, from, to: { ...cur, vehicle: step.name } });
        cur = { ...cur, vehicle: step.name };
      } else if (step.type === 'dismount') {
        propPoses[step.name].after = { ...cur };
        stop.ops.push({ ...step, from, to: { ...cur, vehicle: null } });
        cur = { ...cur, vehicle: null };
      } else if (step.type === 'wait') {
        stop.ops.push({ ...step, from, to: { ...cur } });
      }
    }
    const want = stop.pos;
    if (Math.abs(cur.x - want.x) > 0.01 || Math.abs(cur.L - want.L) > 0.01) {
      console.warn(`[story] path for ${stop.id} ends at`, cur, 'expected', want);
    }
    stop.end = cur;
  });
  if (propPoses.surf) propPoses.surf.before.stand = true;

  function syncProps(idx) {
    Object.entries(propPoses).forEach(([name, info]) => {
      placeProp(name, idx < info.seg ? info.before : info.after);
    });
    const end = STOPS[idx].end;
    Object.assign(actor, end, { rot: 0 });
    setVehicle(end.vehicle);
  }

  // ---------- Particles ----------
  const MAXP = 500;
  const pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), MAXP);
  pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pMesh.frustumCulled = false;
  scene.add(pMesh);
  const parts = [];
  const tmpM = new THREE.Matrix4();
  const tmpC = new THREE.Color();
  const FX = {
    mud: { colors: ['#5e4028', '#7a5536', '#4f3521'], up: 3, spread: 2.2, size: 0.14, life: 0.7 },
    dirt: { colors: ['#b27b4f', '#9b6b43'], up: 2, spread: 1.2, size: 0.1, life: 0.5 },
    snow: { colors: ['#ffffff', '#e8f2ff'], up: 2.5, spread: 1.8, size: 0.12, life: 0.6 },
    splash: { colors: ['#ffffff', '#bff0ff', '#7fdcff'], up: 2.6, spread: 1.6, size: 0.12, life: 0.6 },
    flame: { colors: ['#ffb020', '#ff5a1f', '#ffe14d', '#dddddd'], up: -6, spread: 1.4, size: 0.24, life: 0.8 },
    dust: { colors: ['#ffffff'], up: 1, spread: 0.8, size: 0.08, life: 0.35 },
  };
  function emit(kind, x, y, zz, n) {
    const f = FX[kind];
    for (let i = 0; i < n; i++) {
      if (parts.length >= MAXP) parts.shift();
      parts.push({
        x: x + (Math.random() - 0.5) * 0.6,
        y,
        z: zz + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * f.spread,
        vy: f.up * (0.5 + Math.random() * 0.7),
        vz: (Math.random() - 0.2) * f.spread,
        s: f.size * (0.6 + Math.random() * 0.8),
        life: f.life,
        max: f.life,
        c: f.colors[(Math.random() * f.colors.length) | 0],
        grav: kind === 'flame' ? 0 : 9,
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
      p.vy -= p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    for (let i = 0; i < MAXP; i++) {
      const p = parts[i];
      if (!p) {
        tmpM.makeScale(0, 0, 0);
        pMesh.setMatrixAt(i, tmpM);
        continue;
      }
      const s = p.s * (p.life / p.max) + 0.02;
      tmpM.makeScale(s, s, s).setPosition(p.x, p.y, p.z);
      pMesh.setMatrixAt(i, tmpM);
      pMesh.setColorAt(i, tmpC.set(p.c));
    }
    pMesh.instanceMatrix.needsUpdate = true;
    if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
  }

  // ---------- Playback ----------
  let cur = START;
  let target = START;
  let run = null; // { ops, i, t, reverse, speed }
  const ui = makeUI(root, base, { go: (i) => go(i) });

  function go(i) {
    target = Math.max(0, Math.min(STOPS.length - 1, i));
    ui.hideTitle();
    if (!run && target !== cur) advance();
  }

  function advance() {
    if (cur === target) return arrive();
    const dir = Math.sign(target - cur);
    const seg = dir > 0 ? STOPS[cur + 1] : STOPS[cur];
    const dest = STOPS[cur + dir];
    const far = Math.abs(target - cur) > 1;
    const reverse = dir < 0;
    run = {
      ops: reverse ? [...seg.ops].reverse() : seg.ops,
      i: 0,
      t: 0,
      reverse,
      speed: far ? 2.6 : reverse ? 1.6 : 1,
      dest: cur + dir,
      waiting: 0,
    };
    ui.traveling(dest, reverse ? 'rewind' : far ? 'ffwd' : null);
    setGear(dest.gear || null);
    setSky(dest.id, dest.era);
    startOp();
  }

  function startOp() {
    const op = run.ops[run.i];
    if (!op) return;
    if (op.type === 'mount' || op.type === 'dismount') {
      const mounting = (op.type === 'mount') !== run.reverse;
      const info = propPoses[op.name];
      if (mounting) setVehicle(op.name);
      else {
        setVehicle(null);
        placeProp(op.name, run.reverse ? info.before : info.after);
      }
      emit('dust', actor.x, groundAt(actor.L) + actor.alt + 0.1, -actor.L, 8);
      nextOp();
    }
  }

  function nextOp() {
    run.i++;
    run.t = 0;
    if (run.i >= run.ops.length) {
      cur = run.dest;
      run = null;
      if (cur !== target) advance();
      else arrive();
      return;
    }
    startOp();
  }

  function stepRun(dt) {
    const op = run.ops[run.i];
    if (!op) return;
    const b = run.reverse ? op.from : op.to;
    if (run.t === 0 && op.type === 'hop') {
      const lane = Math.round(b.L);
      if (ROAD_LANES.has(lane) && !world.laneClear(lane, b.x) && run.waiting < 4) {
        run.waiting += dt;
        return;
      }
      run.waiting = 0;
    }
    run.t += (dt * run.speed) / op.dur;
    const u = Math.min(1, run.t);
    // Arcs, flips and spins are authored forward; playing reversed mirrors time.
    const fu = run.reverse ? 1 - u : u;
    const e = EASE[op.ease || (op.type === 'hop' ? 'linear' : 'inout')](fu);
    const A = op.from;
    const B = op.to;
    actor.x = lerp(A.x, B.x, e);
    actor.L = lerp(A.L, B.L, e);
    actor.alt = lerp(A.alt, B.alt, e);
    actor.rot = run.reverse ? actor.rot : lerpAngle(A.rot, B.rot, Math.min(1, fu * 3));
    let arc = 0;
    if (op.type === 'hop') arc = HOP_H * 4 * fu * (1 - fu);
    if (op.h) arc = op.h * 4 * fu * (1 - fu);
    if (op.bumpy) arc += Math.abs(Math.sin(fu * 28)) * op.bumpy;
    actor.arc = arc;
    actor.flip = op.flip ? op.flip * fu : 0;
    actor.spin = op.spin ? op.spin * fu : 0;
    // Squash & stretch on hops
    const sq = op.type === 'hop' ? 1 + Math.sin(fu * Math.PI) * 0.12 : 1;
    player.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));

    if (op.fx) {
      const gy = groundAt(actor.L) + actor.alt;
      const onGround = !op.h || fu < 0.12 || fu > 0.88;
      if (op.fx === 'flame') {
        emit('flame', actor.x, gy + actor.arc, -actor.L, 4);
        rides.rocket.userData.flame.visible = true;
      } else if (onGround && Math.random() < 0.8) {
        emit(op.fx, actor.x, gy + 0.1, -actor.L + 0.4, 2);
      }
    }
    if (op.type === 'wait' && actor.vehicle === 'rocket') {
      actor.jitter = (Math.random() - 0.5) * 0.06;
      if (Math.random() < 0.5) emit('dust', actor.x, groundAt(actor.L) + 0.3, -actor.L, 2);
    } else actor.jitter = 0;

    if (op.type === 'hop' && u >= 1) emit('dust', actor.x, groundAt(actor.L) + actor.alt + 0.05, -actor.L, 3);
    if (u >= 1) {
      if (op.fx !== 'flame') rides.rocket.userData.flame.visible = false;
      nextOp();
    }
  }

  function arrive() {
    const stop = STOPS[cur];
    actor.arc = 0;
    actor.flip = 0;
    actor.spin = 0;
    player.body.scale.set(1, 1, 1);
    rides.rocket.userData.flame.visible = stop.id === 'launch';
    setGear(stop.gear || null);
    setSky(stop.id, stop.era);
    ui.arrived(cur);
    history.replaceState(null, '', `#${stop.id}`);
  }

  function setSky(id, era) {
    const c = SKY[id] || SKY[era] || SKY.freshly;
    root.style.setProperty('--sky', c);
    root.classList.toggle('is-space', id === 'launch');
    root.classList.toggle('is-past', era === 'past');
  }

  // Deep link: #surf, #summit, ...
  const fromHash = STOPS.findIndex((s) => `#${s.id}` === location.hash);
  if (fromHash >= 0) {
    cur = target = fromHash;
    ui.hideTitle();
  }
  syncProps(cur);
  arrive();

  // ---------- Input ----------
  const next = () => !run && go(cur + 1);
  const prev = () => !run && go(cur - 1);
  ui.onNext(next);
  ui.onPrev(prev);
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return;
    if (['ArrowRight', 'ArrowUp', ' ', 'Enter'].includes(e.key)) {
      e.preventDefault();
      next();
    }
    if (['ArrowLeft', 'ArrowDown', 'Backspace'].includes(e.key)) {
      e.preventDefault();
      prev();
    }
  });
  let touch = null;
  canvasWrap.addEventListener('pointerdown', (e) => (touch = { x: e.clientX, y: e.clientY }));
  canvasWrap.addEventListener('pointerup', (e) => {
    if (!touch) return;
    const dx = e.clientX - touch.x;
    const dy = e.clientY - touch.y;
    touch = null;
    if (Math.hypot(dx, dy) < 12) return next();
    if (Math.abs(dy) > Math.abs(dx)) (dy < 0 ? next : prev)();
    else (dx < 0 ? next : prev)();
  });
  let wheelLock = 0;
  canvasWrap.addEventListener(
    'wheel',
    (e) => {
      if (performance.now() < wheelLock || Math.abs(e.deltaY) < 20) return;
      wheelLock = performance.now() + 900;
      (e.deltaY > 0 ? next : prev)();
    },
    { passive: true },
  );

  // ---------- Resize + loop ----------
  function resize() {
    const w = canvasWrap.clientWidth;
    const h = canvasWrap.clientHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const halfH = aspect >= 1 ? 6.8 : Math.max(7, 5.4 / aspect);
    camera.left = -halfH * aspect;
    camera.right = halfH * aspect;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvasWrap);
  resize();

  const camTarget = new THREE.Vector3();
  const look = new THREE.Vector3();
  let first = true;
  let t = 0;
  let last = performance.now();
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function frame() {
    const now = performance.now();
    tick(Math.min(0.05, (now - last) / 1000));
    last = now;
    requestAnimationFrame(frame);
  }

  function tick(dt) {
    t += dt;
    if (run) stepRun(reduceMotion ? dt * 3 : dt);
    else {
      actor.rot = lerpAngle(actor.rot, 0, Math.min(1, dt * 6));
      // idle bob
      if (!actor.vehicle) player.body.scale.y = 1 + Math.sin(t * 3) * 0.015;
    }
    world.update(dt, t, actor);
    updateParticles(dt);

    const y = groundAt(actor.L) + actor.alt + (actor.arc || 0);
    aGroup.position.set(actor.x + (actor.jitter || 0), y, -actor.L);
    aGroup.rotation.y = actor.rot;
    aSpin.rotation.set(actor.flip || 0, actor.spin || 0, 0);

    // Camera: look slightly ahead of Basil, follow height smoothly.
    camTarget.set(actor.x * 0.5, groundAt(actor.L) + actor.alt, -actor.L - 2.6);
    if (first) {
      look.copy(camTarget);
      first = false;
    } else look.lerp(camTarget, Math.min(1, dt * 4));
    camera.position.copy(look).add(CAM_OFFSET);
    camera.lookAt(look);
    sun.position.copy(look).add(new THREE.Vector3(-6, 16, 7));
    sun.target.position.copy(look);

    renderer.render(scene, camera);
    ui.frame(camera, !run, cur);
  }
  requestAnimationFrame(frame);

  // ?debug exposes manual stepping so headless/background tabs can be inspected.
  if (new URLSearchParams(location.search).has('debug')) {
    window.__quest = {
      go,
      state: () => ({ cur, target, running: !!run, actor: { ...actor } }),
      step(sec = 1) {
        for (let i = 0; i < sec * 60; i++) tick(1 / 60);
      },
    };
  }
}

// ---------- Voxelized brand logos ----------
function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

async function voxelLogo(url, { cols, size, depth = 2, color = null, alpha = 110 }) {
  const img = await loadImage(url);
  const rows = Math.round((cols * img.height) / img.width);
  const c = document.createElement('canvas');
  c.width = cols;
  c.height = rows;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, cols, rows);
  const px = g.getImageData(0, 0, cols, rows).data;
  const cells = [];
  for (let r = 0; r < rows; r++)
    for (let q = 0; q < cols; q++) {
      const i = (r * cols + q) * 4;
      if (px[i + 3] > alpha) cells.push([q, r, px[i], px[i + 1], px[i + 2]]);
    }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), cells.length);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  cells.forEach(([q, r, R, G, B], i) => {
    m.makeScale(size, size, size * depth).setPosition((q - cols / 2 + 0.5) * size, (rows - r - 0.5) * size, 0);
    mesh.setMatrixAt(i, m);
    if (color) col.set(color);
    else col.setRGB(R / 255, G / 255, B / 255, THREE.SRGBColorSpace);
    mesh.setColorAt(i, col);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const holder = new THREE.Group();
  holder.add(mesh);
  holder.userData.size = { w: cols * size, h: rows * size };
  return holder;
}

async function addLogos(scene, base) {
  const u = (p) => `${base}logos/${p}`;
  const place = (obj, x, y, zz) => {
    obj.position.set(x, y, zz);
    scene.add(obj);
    return obj;
  };
  try {
    // Giant Freshly "F" on the HQ roof
    const hqMark = await voxelLogo(u('freshly-mark.png'), { cols: 24, size: 0.1, depth: 3, color: '#15c2b0' });
    place(hqMark, -4.6, 2.6, -1.4);
    // Simple Bundles logo, in full colour, above its booth
    const sb = await voxelLogo(u('simple-bundles.png'), { cols: 56, size: 0.055, depth: 3 });
    place(sb, 3.2, 1.3, -0.3);
    // Freshly wordmark billboard by the highway
    const bb = new THREE.Group();
    box(bb, 0.2, 1.4, 0.2, '#555c68', -2.2, 0, 0);
    box(bb, 0.2, 1.4, 0.2, '#555c68', 2.2, 0, 0);
    box(bb, 5.8, 2.1, 0.16, '#ffffff', 0, 1.4, 0);
    box(bb, 5.9, 0.12, 0.2, '#15c2b0', 0, 1.34, 0);
    const word = await voxelLogo(u('freshly-full.png'), { cols: 64, size: 0.08, depth: 1.5, color: '#111111' });
    word.position.set(0, 1.62, 0.12);
    bb.add(word);
    place(bb, 5.6, 0, -9.2);
    // Teal Freshly monument on the summit
    const peakY = laneHeight(72);
    const mon = new THREE.Group();
    box(mon, 2.2, 0.5, 1, '#9aa8bd', 0, 0, 0);
    const mark = await voxelLogo(u('freshly-mark.png'), { cols: 24, size: 0.085, depth: 3, color: '#15c2b0' });
    mark.position.y = 0.5;
    mon.add(mark);
    place(mon, -4.4, peakY, -73.2);
  } catch (e) {
    console.warn('logo voxelization failed', e);
  }
}

// ---------- DOM UI ----------
function makeUI(root, base, { go }) {
  const $ = (s) => root.querySelector(s);
  const card = $('#card');
  const bubbles = $('#bubbles');
  const track = $('#track');
  const title = $('#title');
  const tape = $('#tape');
  const year = $('#year');
  const v = new THREE.Vector3();
  let bubbleEls = [];
  let nextCb = () => {};
  let prevCb = () => {};

  STOPS.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = `dot dot--${s.era}`;
    b.innerHTML = `<span>${s.label}</span>`;
    b.title = s.title;
    b.addEventListener('click', () => go(i));
    track.appendChild(b);
  });
  const dots = [...track.children];

  $('#next').addEventListener('click', () => nextCb());
  $('#prev').addEventListener('click', () => prevCb());
  $('#start')?.addEventListener('click', () => go(STOPS.findIndex((s) => s.id === 'road')));
  $('#rewind')?.addEventListener('click', () => go(STOPS.findIndex((s) => s.id === 'podia')));

  const href = (l) => (l.ext ? l.href : base + l.href);

  function renderCard(i) {
    const s = STOPS[i];
    card.dataset.era = s.era;
    card.innerHTML = `
      <div class="card__era">${s.era === 'past' ? 'The past' : s.era === 'now' ? 'Now' : 'The future'}</div>
      <h2 class="card__title">${s.title}</h2>
      <div class="card__role">${s.role}</div>
      <p class="card__blurb">${s.blurb}</p>
      ${s.links ? `<div class="card__links">${s.links.map((l) => `<a class="pxbtn pxbtn--sm" href="${href(l)}" ${l.ext ? 'target="_blank" rel="noopener"' : ''}>${l.text}</a>`).join('')}</div>` : ''}
    `;
    year.textContent = s.year;
    $('#prev').disabled = i === 0;
    $('#next').disabled = i === STOPS.length - 1;
    $('#next-label').textContent = i < STOPS.length - 1 ? STOPS[i + 1].label : '';
    $('#prev-label').textContent = i > 0 ? STOPS[i - 1].label : '';
    dots.forEach((d, j) => {
      d.classList.toggle('is-on', j === i);
      d.classList.toggle('is-done', j < i);
    });
    dots[i].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  function showBubbles(i) {
    bubbles.innerHTML = '';
    bubbleEls = STOPS[i].bubbles.map((b, k) => {
      const el = document.createElement('div');
      el.className = 'bubble';
      el.style.animationDelay = `${0.15 + k * 0.25}s`;
      el.textContent = b.text;
      bubbles.appendChild(el);
      return { el, at: b.at };
    });
  }

  return {
    onNext: (f) => (nextCb = f),
    onPrev: (f) => (prevCb = f),
    hideTitle() {
      title?.classList.add('is-hidden');
      root.classList.remove('has-title');
    },
    traveling(dest, mode) {
      root.classList.add('is-moving');
      tape.textContent = mode === 'rewind' ? '◀◀ REWIND' : mode === 'ffwd' ? '▶▶ FAST FWD' : '▶ PLAY';
      tape.dataset.mode = mode || 'play';
      bubbles.innerHTML = '';
      bubbleEls = [];
      year.textContent = dest.year;
    },
    arrived(i) {
      root.classList.remove('is-moving');
      renderCard(i);
      showBubbles(i);
    },
    frame(camera, idle) {
      if (!idle) return;
      const w = bubbles.clientWidth;
      const h = bubbles.clientHeight;
      bubbleEls.forEach(({ el, at }) => {
        v.set(at[0], laneHeight(Math.round(at[2])) + at[1], -at[2]).project(camera);
        el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      });
    },
  };
}
