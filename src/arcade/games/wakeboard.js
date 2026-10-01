// Wake Run: Basil wakeboards behind the tow boat down a river to the shore.
// Cut across the wake for air, hit kickers, side hits and sliders, spin and
// flip in the air, and dodge dolphins, salmon, buoys and logs on the way.
//
// Coordinates: s is distance down the course (metres), world z = -s.
// Debug URL params: ?skip=0.95 starts near the shore, ?god ignores hits,
// ?auto drives Basil with a simple autopilot (for screenshots).
import {
  C, RAIL_H, bake, makeKicker, makeSlider, makeBuoy, makeMarker, makeLog, makePalm, makeUmbrella,
  makeFlag, makeBillboard, makeHut, makeArch, makeShore,
} from './wakeboard-props.js';

const D = 3000; // course length to the shore
const ROPE = 8; // the boat leads Basil by this much
const RMAX = 5.6; // how far Basil can swing out from the boat
const XMAX = 6.4; // keep Basil inside the river
const RIVER = 8; // water half-width
const BANK = 0.35;
const G = 24;
const VX_MAX = 7.2;
const SPIN_RATE = 11;
const FLIP_RATE = 12;
const AHEAD = 95; // spawn distance
const SHORE_S = D + 6; // waterline of the finish beach
const PEEL_S = D - 46; // boat starts turning off
const RELEASE_S = D - 20; // Basil lets go of the rope
const CHECKPOINTS = [750, 1500, 2250];
const PI = Math.PI;
const TAU = PI * 2;

const SPIN_PTS = [0, 100, 250, 400, 600, 800, 1000];
const BASE_PTS = { kicker: 50, side: 40, wake: 25, rail: 20, ollie: 0, drop: 0 };
const SRC_NAME = { kicker: 'KICKER AIR', side: 'SIDE HIT', wake: 'WAKE JUMP' };
const SPLASH = ['#ffffff', '#e8fbff', '#bdeeff', '#7fd8ff'];
const CAUSE = {
  dolphin: 'A dolphin took you out',
  salmon: 'Slapped by a salmon',
  buoy: 'Clipped a buoy',
  log: 'Caught a log',
  bail: 'Bailed the landing',
};
const fmt = (n) => Math.round(n).toLocaleString('en-CA');

export default function create(ctx) {
  const { THREE, scene, models, box, group, sign, mat, clamp, lerp } = ctx;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const params = new URLSearchParams(location.search);
  const SKIP = clamp(Number(params.get('skip')) || 0, 0, 0.999);
  const GOD = params.has('god');
  const AUTO = params.has('auto');

  const SKY = '#9fe3ff';
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 55, 135);

  // The boat's line down the river (x as a function of s).
  const pathX = (s) => 1.7 * Math.sin(s * 0.011) + 0.7 * Math.sin(s * 0.029 + 1.3);
  const pathDX = (s) => 0.0187 * Math.cos(s * 0.011) + 0.0203 * Math.cos(s * 0.029 + 1.3);
  const speedAt = (p) => 9 + 11 * p; // 9 -> 20 m/s

  // ---------- Water ----------
  const WL = 340;
  const PERIOD = 3;
  const stripes = document.createElement('canvas');
  stripes.width = 4;
  stripes.height = 4;
  const sg = stripes.getContext('2d');
  sg.fillStyle = C.water;
  sg.fillRect(0, 0, 4, 2);
  sg.fillStyle = C.water2;
  sg.fillRect(0, 2, 4, 2);
  const stripeTex = new THREE.CanvasTexture(stripes);
  stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
  stripeTex.magFilter = THREE.NearestFilter;
  stripeTex.minFilter = THREE.LinearMipmapLinearFilter;
  stripeTex.anisotropy = 8;
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  stripeTex.repeat.set(1, WL / PERIOD);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(RIVER * 2 + 4, WL), new THREE.MeshLambertMaterial({ map: stripeTex }));
  water.rotation.x = -PI / 2;
  water.receiveShadow = true;
  scene.add(water);

  // Sandy banks + grass; uniform along z so they simply follow the camera.
  const banks = group(scene);
  for (const sx of [-1, 1]) {
    box(banks, 7, 0.85, WL, C.sand, sx * (RIVER + 3.5), -0.5, 0, { shadow: false });
    box(banks, 60, 0.95, WL, C.grass, sx * (RIVER + 37), -0.5, 0, { shadow: false });
    box(banks, 0.9, 0.5, WL, C.sandWet, sx * (RIVER - 0.1), -0.3, 0, { shadow: false });
    box(banks, 0.3, 0.04, WL, C.foam, sx * (RIVER - 0.7), -0.01, 0, { shadow: false });
  }

  // ---------- Foam: wake trails, board trail and drifting bits (one instanced mesh) ----------
  const FOAM_N = 760;
  const AMB_N = 90;
  const foamMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: C.foam }), FOAM_N + AMB_N);
  foamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  foamMesh.frustumCulled = false;
  foamMesh.receiveShadow = true;
  scene.add(foamMesh);
  const fx = new Float32Array(FOAM_N);
  const fz = new Float32Array(FOAM_N);
  const fvx = new Float32Array(FOAM_N);
  const fl = new Float32Array(FOAM_N);
  const fmax = new Float32Array(FOAM_N).fill(1);
  const fs = new Float32Array(FOAM_N);
  const fzero = new Uint8Array(FOAM_N);
  let fHead = 0;
  const ambX = new Float32Array(AMB_N);
  const ambZ = new Float32Array(AMB_N);
  const ambS = new Float32Array(AMB_N);
  const AMB_RING = 150;
  const m4 = new THREE.Matrix4();
  function foam(x, z, vx, life, size) {
    const i = fHead;
    fHead = (fHead + 1) % FOAM_N;
    fx[i] = x;
    fz[i] = z;
    fvx[i] = vx;
    fl[i] = life;
    fmax[i] = life;
    fs[i] = size;
    fzero[i] = 0;
  }
  function updateFoam(dt, t, baseZ) {
    for (let i = 0; i < FOAM_N; i++) {
      if (fl[i] <= 0) {
        if (!fzero[i]) foamMesh.setMatrixAt(i, m4.makeScale(0, 0, 0));
        fzero[i] = 1;
        continue;
      }
      fl[i] -= dt;
      fx[i] += fvx[i] * dt;
      fvx[i] *= 1 - dt * 0.35;
      const k = Math.max(0, fl[i] / fmax[i]);
      const s = fs[i] * (0.3 + 0.7 * k);
      const hide = Math.abs(fx[i]) > RIVER - 0.4 || -fz[i] > SHORE_S;
      foamMesh.setMatrixAt(i, hide ? m4.makeScale(0, 0, 0) : m4.makeScale(s, 0.05, s * 1.9).setPosition(fx[i], 0.02, fz[i]));
    }
    for (let i = 0; i < AMB_N; i++) {
      if (ambZ[i] > baseZ + 16) {
        ambZ[i] -= AMB_RING;
        ambX[i] = rnd(-RIVER + 0.8, RIVER - 0.8);
      }
      const hide = -ambZ[i] > SHORE_S;
      const s = ambS[i] * (0.8 + 0.2 * Math.sin(t * 2 + i));
      foamMesh.setMatrixAt(FOAM_N + i, hide ? m4.makeScale(0, 0, 0) : m4.makeScale(s * 1.6, 0.04, s * 0.6).setPosition(ambX[i] + Math.sin(t * 0.6 + i) * 0.2, 0.015, ambZ[i]));
    }
    foamMesh.instanceMatrix.needsUpdate = true;
  }
  function resetFoam(baseZ) {
    fl.fill(0);
    fzero.fill(0);
    for (let i = 0; i < AMB_N; i++) {
      ambX[i] = rnd(-RIVER + 0.8, RIVER - 0.8);
      ambZ[i] = baseZ + 16 - (i / AMB_N) * AMB_RING;
      ambS[i] = rnd(0.25, 0.6);
    }
  }

  // ---------- Branding templates (cloned so the textures are shared) ----------
  const signFC = sign(null, ['FRESHLY COMMERCE'], { w: 1.7, h: 0.42, bg: C.ink, fg: C.teal, size: 14 });
  const signSB = sign(null, ['SIMPLE BUNDLES 2.0'], { w: 1.7, h: 0.42, bg: C.pink, fg: C.white, size: 14 });
  const signKick = sign(null, ['FRESHLY'], { w: 1.4, h: 0.3, bg: C.ink, fg: C.teal, size: 14 });
  const signRail = sign(null, ['SIMPLE BUNDLES 2.0'], { w: 5.6, h: 0.32, bg: C.ink, fg: C.pink, size: 13 });

  // ---------- Riverbank decor (recycled ring per side) ----------
  const billboards = [
    makeBillboard(['FRESHLY COMMERCE'], C.teal, C.ink),
    makeBillboard(['SIMPLE BUNDLES 2.0'], C.pink, C.white),
    makeBillboard([{ text: 'SIMPLE BUNDLES', size: 26 }, { text: '2.0 IS LIVE', size: 20 }], C.ink, C.teal),
    makeBillboard([{ text: 'FRESHLY', size: 30 }, { text: 'COMMERCE', size: 30 }], C.white, C.ink),
  ];
  const palmTpl = [makePalm(1.15), makePalm(1.3), makePalm(1.45)];
  const umbTpl = [makeUmbrella(C.teal, C.white), makeUmbrella(C.pink, C.white), makeUmbrella(C.yellow, C.teal)];
  const flagTpl = [makeFlag(C.teal), makeFlag(C.pink)];
  const hutTpl = makeHut();
  const SLOT = 8;
  const SLOTS = 18;
  const RING = SLOT * SLOTS;
  const slots = [];
  for (const side of [-1, 1]) {
    const kinds = ['bill', 'palm', 'palm', 'umb', 'palm', 'flag', 'palm', 'bill', 'palm', 'umb', 'hut', 'palm', 'flag', 'palm', 'bill', 'umb', 'palm', 'palm'];
    kinds.forEach((kind, i) => {
      let m;
      if (kind === 'bill') m = billboards[(i + (side > 0 ? 1 : 0)) % billboards.length].clone();
      else if (kind === 'palm') m = palmTpl[i % 3].clone();
      else if (kind === 'umb') m = umbTpl[(i + side) % 3 === 0 ? 0 : i % 3].clone();
      else if (kind === 'flag') m = flagTpl[(i + (side > 0 ? 1 : 0)) % 2].clone();
      else m = hutTpl.clone();
      scene.add(m);
      slots.push({ m, kind, side, i, z: 0 });
    });
  }
  function placeSlot(o) {
    const { m, kind, side } = o;
    let x;
    if (kind === 'bill') {
      x = side * (RIVER + 3.4);
      m.rotation.y = -side * 0.35;
    } else if (kind === 'palm') {
      x = side * rnd(RIVER + 1, RIVER + 6.5);
      m.rotation.y = rnd(0, TAU);
    } else if (kind === 'umb') x = side * rnd(RIVER + 1.6, RIVER + 5);
    else if (kind === 'flag') x = side * (RIVER + 0.9);
    else {
      x = side * (RIVER + 5);
      m.rotation.y = -side * 0.3;
    }
    m.position.set(x, kind === 'palm' && Math.abs(x) > RIVER + 7 ? 0.45 : BANK, o.z);
    m.visible = -o.z < SHORE_S - 2;
  }
  // Lane markers: branded flag buoys along both edges of the river.
  const MSLOTS = 10;
  const MSPACE = 15;
  const markers = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < MSLOTS; i++) {
      const m = makeMarker((i + (side > 0 ? 1 : 0)) % 2 ? signSB : signFC, (i + (side > 0 ? 1 : 0)) % 2 ? C.pink : C.teal);
      scene.add(m);
      markers.push({ m, side, i, z: 0, ph: rnd(0, TAU) });
    }
  }
  function layoutDecor(baseZ) {
    slots.forEach((o) => {
      o.z = baseZ + 14 - o.i * SLOT - (o.side > 0 ? SLOT / 2 : 0);
      placeSlot(o);
    });
    markers.forEach((o) => {
      o.z = baseZ + 14 - o.i * MSPACE - (o.side > 0 ? MSPACE / 2 : 0);
    });
  }
  function updateDecor(baseZ, t) {
    for (const o of slots) {
      if (o.z > baseZ + 16) {
        o.z -= RING;
        placeSlot(o);
      }
    }
    for (const o of markers) {
      if (o.z > baseZ + 16) o.z -= MSLOTS * MSPACE;
      o.m.visible = -o.z < SHORE_S - 1;
      o.m.position.set(o.side * (RIVER - 0.9), Math.sin(t * 2 + o.ph) * 0.05, o.z);
      o.m.rotation.z = Math.sin(t * 1.6 + o.ph) * 0.05;
    }
  }

  // ---------- Checkpoint arches + finish beach ----------
  CHECKPOINTS.forEach((s, i) => {
    const arch = makeArch(
      [{ text: i === 1 ? 'SIMPLE BUNDLES 2.0' : 'FRESHLY COMMERCE', size: 30 }, { text: `${fmt(D - s)}M TO SHORE`, size: 16 }],
      RIVER * 2 - 0.6,
    );
    arch.position.set(0, 0, -s);
    scene.add(arch);
  });
  const shore = makeShore();
  shore.g.position.z = -SHORE_S;
  scene.add(shore.g);

  // ---------- Boat ----------
  const boat = models.makeBoat();
  box(boat, 0.12, 0.55, 0.12, C.navy, 0, 0.45, 1.0);
  box(boat, 0.05, 0.9, 0.05, '#dddddd', 0.55, 0.45, 1.1);
  box(boat, 0.4, 0.26, 0.03, C.pink, 0.76, 1.06, 1.1);
  sign(boat, ['FRESHLY COMMERCE'], { w: 1.2, h: 0.24, x: 0, y: 0.06, z: 1.31, bg: C.ink, fg: C.teal, size: 12 });
  const driver = models.makePlayer({ shirt: C.white, shirtDark: '#e6e6e6', cap: C.teal, beard: null, skin: '#d9a07a', hair: '#5a3a22' });
  driver.gear.shades.visible = true;
  driver.root.position.set(-0.22, 0.52, 0.1);
  boat.add(driver.root);
  bake(boat);
  boat.rotation.order = 'YXZ';
  scene.add(boat);
  const rope = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1), mat('#1b1b1f'));
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.05), mat('#1b1b1f'));
  scene.add(rope, handle);

  // ---------- Basil ----------
  const rider = group(scene);
  const yawG = group(rider);
  const pivot = group(yawG, 0, 0.6, 0);
  const inner = group(pivot, 0, -0.6, 0);
  const board = bake(models.makeWakeboard());
  board.position.y = 0.02;
  inner.add(board);
  const basil = models.makePlayer();
  basil.gear.shades.visible = true;
  basil.root.position.set(0, 0.1, 0);
  basil.root.rotation.y = 1.6;
  inner.add(basil.root);

  // ---------- Pools ----------
  const kickTpl = makeKicker({ w: 2.4, len: 3, lip: 1 }, signKick);
  const sideTpl = makeKicker({ w: 1.6, len: 2, lip: 0.65, side: C.pink, flag: C.teal }, null);
  const sliderTpl = makeSlider({ entry: 1.8, railLen: 12 }, signRail);
  const buoyTpl = [makeBuoy(C.pink, C.teal), makeBuoy(C.teal, C.pink), makeBuoy('#ff8a1f', C.white)];
  const logTpl = makeLog();
  const dolphinTpl = bake(models.makeDolphin());
  const salmonTpl = bake(models.makeSalmon());
  const pools = {};
  const active = [];
  function pool(type, n, make, extra = {}) {
    pools[type] = [];
    for (let i = 0; i < n; i++) {
      const m = make(i);
      m.visible = false;
      m.rotation.order = 'YXZ';
      scene.add(m);
      pools[type].push({ type, m, on: false, ...extra });
    }
  }
  pool('kicker', 4, () => kickTpl.clone(), { ramp: true, w: 2.4, len: 3, lip: 1 });
  pool('side', 4, () => sideTpl.clone(), { ramp: true, w: 1.6, len: 2, lip: 0.65 });
  pool('slider', 3, () => sliderTpl.clone(), { ramp: true, w: 1.0, len: 1.8, lip: RAIL_H, railLen: 12 });
  pool('buoy', 14, (i) => buoyTpl[i % 3].clone(), { hx: 0.32, hz: 0.32, top: 0.8 });
  pool('log', 6, () => logTpl.clone(), { hx: 1.3, hz: 0.22, top: 0.42 });
  pool('dolphin', 9, () => dolphinTpl.clone(), { hl: 0.8, hw: 0.3, top: 0.55 });
  pool('salmon', 18, () => salmonTpl.clone(), { hl: 0.32, hw: 0.12, top: 0.26 });
  function take(type) {
    const e = pools[type].find((o) => !o.on);
    if (!e) return null;
    e.on = true;
    e.hit = false;
    e.passed = false;
    e.prevA = null;
    e.ph = rnd(0, TAU);
    e.m.visible = true;
    e.m.rotation.set(0, 0, 0);
    active.push(e);
    return e;
  }
  function freeAll() {
    for (const list of Object.values(pools)) {
      for (const e of list) {
        e.on = false;
        e.m.visible = false;
      }
    }
    active.length = 0;
  }

  // ---------- State ----------
  let phase = 'title';
  let dist = 0;
  let speed = 9;
  let slow = 0;
  let px = 0;
  let vx = 0;
  let py = 0;
  let vy = 0;
  let rz = 0;
  let prevRz = 0;
  let swing = 0;
  let air = false;
  let airSrc = 'ollie';
  let airTime = 0;
  let onRamp = null;
  let rail = null;
  let railT = 0;
  let baseYaw = 0;
  let spin = 0;
  let spinT = 0;
  let flip = 0;
  let flipT = 0;
  let grabT = 0;
  let grabbing = false;
  let slideYaw = 0;
  const groundHold = { left: false, right: false };
  const holdT = { left: 0, right: 0 };
  let cutT = 0;
  let cutDir = 0;
  let lives = 3;
  let inv = 0;
  let tumble = 0;
  let tumbleDir = 1;
  let dead = false;
  let deadT = 0;
  let cause = 'bail';
  let fin = 0; // 0 towing, 1 released and coasting, 2 on the beach
  let finT = 0;
  let coastA = 0;
  let boatS = 0;
  let boatX = 0;
  let boatYaw = 0;
  let boatSpeed = 9;
  let nextRow = 60;
  let lastPattern = '';
  let cpIdx = 0;
  let tricks = 0;
  let recent = [];
  let emitAcc = 0;
  let trailAcc = 0;
  let meterTxt = '';
  let camX = 0;
  let autoT = 0;
  let inp = null;

  const reachLo = (b) => Math.max(-XMAX, b - RMAX);
  const reachHi = (b) => Math.min(XMAX, b + RMAX);
  // Wake lines spread out behind the stern; this is their half-width at Basil.
  const wakeHalf = () => 0.55 + 0.2 * Math.max(0, boatS + rz);

  // ---------- Spawning ----------
  function pickX(s, minOff, maxOff, side = 0) {
    const c = pathX(s);
    const b = pathX(s + ROPE);
    const lo = reachLo(b) + 0.4;
    const hi = reachHi(b) - 0.4;
    for (let i = 0; i < 10; i++) {
      const sd = side || (Math.random() < 0.5 ? -1 : 1);
      const x = c + sd * rnd(minOff, maxOff);
      if (x >= lo && x <= hi) return x;
    }
    return null;
  }
  function placeStatic(type, s, x) {
    const e = take(type);
    if (!e) return null;
    e.s = s;
    e.x = x;
    e.z = -s;
    e.m.position.set(x, 0, e.z);
    return e;
  }
  function spawnLeaper(kind, x, s, dX, dZ, o = {}) {
    const e = take(kind);
    if (!e) return null;
    const dolphin = kind === 'dolphin';
    Object.assign(e, {
      x, s, z: -s, dX, dZ,
      sp: o.sp ?? (dolphin ? 2.8 : 3.4),
      H: o.H ?? (dolphin ? rnd(1.5, 1.8) : rnd(0.9, 1.25)),
      leap: dolphin ? 0.85 : 0.55,
      gap: dolphin ? 0.4 : 0.28,
      trig: o.trig ?? rnd(2.2, 3.6),
      going: false,
      t: o.t0 ?? 0,
      u: 2,
      y: -1,
    });
    e.m.rotation.y = Math.atan2(-dX, -dZ);
    e.m.visible = false;
    return e;
  }
  const PATTERNS = ['buoys', 'log', 'kicker', 'side', 'slider', 'dAcross', 'dAlong', 'salmon', 'pod'];
  function weights(p) {
    return [3 - 1.5 * p, 0.9 + p, 2.2, 1.1, 1.4, 0.8 + 1.4 * p, 0.3 + 1.6 * p, 0.6 + 1.5 * p, p > 0.45 ? 1.4 * p : 0];
  }
  function spawnRow(s) {
    const p = s / D;
    const w = weights(p).map((v, i) => (PATTERNS[i] === lastPattern ? 0 : v));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    let k = 0;
    while (k < w.length - 1 && (r -= w[k]) > 0) k++;
    const pat = PATTERNS[k];
    lastPattern = pat;
    let extra = 0;
    const side = () => (Math.random() < 0.5 ? -1 : 1);
    if (pat === 'buoys') {
      const n = 1 + (Math.random() < 0.4 + p * 0.5 ? 1 : 0) + (p > 0.55 && Math.random() < 0.45 ? 1 : 0);
      const xs = [];
      for (let i = 0; i < n; i++) {
        const ss = s + rnd(-3, 3);
        const x = pickX(ss, 1.5, 5.4);
        if (x == null || xs.some((o) => Math.abs(o - x) < 1.5)) continue;
        xs.push(x);
        placeStatic('buoy', ss, x);
      }
    } else if (pat === 'log') {
      const x = pickX(s, 2.7, 5);
      const e = x != null && placeStatic('log', s, x);
      if (e) e.drift = Math.sign(pathX(s) - x) * rnd(0.4, 0.8) * (0.6 + p);
      if (p > 0.5 && Math.random() < 0.5) {
        const x2 = pickX(s + 6, 1.6, 5.2);
        if (x2 != null) placeStatic('buoy', s + 6, x2);
      }
    } else if (pat === 'kicker') {
      const x = pickX(s, 2.3, 4.6);
      if (x != null) {
        placeStatic('kicker', s, x);
        if (p > 0.35 && Math.random() < 0.55) {
          for (const sx of [-1, 1]) {
            const bx = x + sx * 2.1;
            if (Math.abs(bx - pathX(s - 2)) > 1.2 && Math.abs(bx) < RIVER - 1.2) placeStatic('buoy', s - 2, bx);
          }
        }
        extra = lerp(9, 18, p);
      }
    } else if (pat === 'side') {
      const x = pickX(s, 3.6, 5.8);
      if (x != null) {
        placeStatic('side', s, x);
        extra = lerp(7, 14, p);
      }
    } else if (pat === 'slider') {
      const x = pickX(s, 2.2, 4.4);
      if (x != null) {
        placeStatic('slider', s, x);
        extra = 14 + lerp(4, 10, p);
      }
    } else if (pat === 'dAcross') {
      const sd = side();
      spawnLeaper('dolphin', sd * (RIVER - 0.6), s, -sd, 0);
      if (p > 0.6 && Math.random() < 0.5) spawnLeaper('dolphin', -sd * (RIVER - 0.6), s + rnd(5, 8), sd, 0);
    } else if (pat === 'dAlong') {
      const b = pathX(s + ROPE);
      spawnLeaper('dolphin', clamp(b + rnd(-3.5, 3.5), -XMAX + 0.5, XMAX - 0.5), s, 0, 1, { sp: 3.2, trig: rnd(2.6, 3.6) });
    } else if (pat === 'salmon') {
      const n = 4 + Math.floor(Math.random() * 3 + p * 2);
      if (Math.random() < 0.5) {
        const sd = side();
        for (let i = 0; i < n; i++) spawnLeaper('salmon', sd * (RIVER - 0.6) + sd * rnd(0, 1.5), s + rnd(-1.6, 1.6), -sd, 0, { t0: rnd(0, 0.6), trig: 2.6 });
      } else {
        const c = clamp(pathX(s + ROPE) + rnd(-3, 3), -XMAX + 1, XMAX - 1);
        for (let i = 0; i < n; i++) spawnLeaper('salmon', c + rnd(-1.4, 1.4), s + rnd(0, 4), 0, 1, { sp: 4, t0: rnd(0, 0.6), trig: 3 });
      }
    } else if (pat === 'pod') {
      const n = p > 0.75 ? 3 : 2;
      const c = clamp(pathX(s + ROPE) + rnd(-2, 2), -XMAX + 2, XMAX - 2);
      for (let i = 0; i < n; i++) spawnLeaper('dolphin', c + (i - (n - 1) / 2) * 1.9, s + i * 1.5, 0, 1, { sp: 3.2, t0: i * 0.15, trig: 3.2 });
    }
    return lerp(25, 14, p) * rnd(0.85, 1.2) + extra;
  }

  // ---------- Rider mechanics ----------
  function splash(x, y, z, n, o = {}) {
    ctx.emit(SPLASH, { x, y, z }, n, { speed: 2, up: 3, life: 0.6, size: 0.14, ...o });
  }
  function takeoff(v, src) {
    air = true;
    vy = v;
    airSrc = src;
    airTime = 0;
    spin = spinT = 0;
    flip = flipT = 0;
    grabT = 0;
    onRamp = null;
    groundHold.left = !!inp?.left;
    groundHold.right = !!inp?.right;
    holdT.left = holdT.right = 0;
    if (v > 4) splash(px, 0.1, rz + 0.3, 8, { speed: 1.5, up: 2.5, life: 0.45 });
  }
  function scoreTrick(src, spinTotal, flips, grab) {
    const half = Math.round(Math.abs(spinTotal) / PI);
    const parts = [];
    let pts = BASE_PTS[src] || 0;
    if (half) {
      pts += SPIN_PTS[Math.min(half, 6)] + Math.max(0, half - 6) * 250;
      const dir = spinTotal > 0 ? 'BACKSIDE' : 'FRONTSIDE';
      parts.push([`${dir} ${half * 180}`, `${dir.slice(0, 1)}S ${half * 180}`]);
    }
    if (flips) {
      pts += flips > 1 ? 800 : 300;
      const n = flips > 1 ? 'DOUBLE FLIP' : src === 'wake' ? 'TANTRUM' : 'BACKFLIP';
      parts.push([n, flips > 1 ? 'DBL FLIP' : 'FLIP']);
    }
    if (grab > 0.15) {
      pts += 60 + Math.round(120 * Math.min(grab, 1));
      parts.push(['INDY GRAB', 'INDY']);
    }
    if (!parts.length && !SRC_NAME[src]) return;
    const name = parts.length === 0 ? SRC_NAME[src] : parts.length === 1 ? parts[0][0] : parts.map((q) => q[1]).join(' + ');
    // Repeating the same trick pays less; mix it up.
    const reps = recent.filter((n) => n === name).length;
    recent.push(name);
    if (recent.length > 6) recent.shift();
    const total = Math.max(5, Math.round(pts * Math.pow(0.5, reps)));
    if (parts.length) tricks++;
    ctx.addScore(total, `${name}!`);
  }
  function land() {
    air = false;
    vy = 0;
    const bad = Math.abs(spinT - spin) > 0.45 * PI || Math.abs(flipT - flip) > 0.45 * PI;
    const spinTotal = spinT;
    const flips = Math.round(flipT / TAU);
    baseYaw = (baseYaw + spinT) % TAU;
    spin = spinT = 0;
    flip = flipT = 0;
    if (bad) {
      wipe('bail');
      return false;
    }
    scoreTrick(airSrc, spinTotal, flips, grabT);
    grabT = 0;
    if (airTime > 0.45) {
      splash(px, 0.1, rz, Math.round(6 + airTime * 10), { speed: 2.4, up: 2.6 });
      if (airTime > 0.8) ctx.shake(0.12);
    }
    return true;
  }
  function wipe(why) {
    if (inv > 0 || dead || fin) return;
    splash(px, 0.3, rz, 34, { speed: 3.2, up: 4.5, life: 0.8, size: 0.18 });
    ctx.shake(0.5);
    tumble = 0.8;
    tumbleDir = Math.random() < 0.5 ? -1 : 1;
    inv = 2.2;
    slow = 1;
    air = false;
    rail = null;
    onRamp = null;
    py = 0;
    vy = 0;
    spin = spinT = flip = flipT = 0;
    grabT = 0;
    if (GOD) return ctx.toast('SPLASH! (god mode)');
    lives--;
    ctx.setLives(lives);
    cause = why;
    ctx.toast(why === 'bail' ? 'BAILED!' : 'WIPEOUT!');
    if (lives <= 0) {
      dead = true;
      deadT = 1.1;
    }
  }
  function startRail(e) {
    rail = e;
    railT = 0;
    air = false;
    onRamp = null;
    py = RAIL_H;
    vy = 0;
    vx = 0;
  }
  function leaveRail(v, vx0) {
    ctx.addScore(Math.round(100 + 160 * railT), 'RAIL SLIDE!');
    tricks++;
    rail = null;
    vx = vx0;
    takeoff(v, 'rail');
  }
  // Highest ramp surface under a point, if any.
  function rampAt(x, z) {
    let best = null;
    for (const e of active) {
      if (!e.ramp) continue;
      const t = (e.z - z) / e.len;
      if (t < 0 || t > 1 || Math.abs(x - e.x) > e.w / 2 + 0.15) continue;
      const h = e.lip * t;
      if (!best || h > best.h) best = { e, h };
    }
    return best;
  }

  // ---------- Reset / layout ----------
  function resetRun(startS) {
    freeAll();
    dist = startS;
    speed = speedAt(dist / D);
    slow = 0;
    boatS = dist + ROPE;
    boatX = pathX(boatS);
    boatYaw = 0;
    boatSpeed = speed;
    px = boatX;
    vx = 0;
    py = 0;
    vy = 0;
    swing = 0;
    rz = -dist;
    prevRz = rz;
    air = false;
    onRamp = null;
    rail = null;
    baseYaw = 0;
    spin = spinT = flip = flipT = 0;
    grabT = 0;
    slideYaw = 0;
    lives = 3;
    inv = 0;
    tumble = 0;
    dead = false;
    fin = 0;
    finT = 0;
    nextRow = dist + (startS > 0 ? 40 : 60);
    lastPattern = '';
    cpIdx = CHECKPOINTS.findIndex((s) => s > dist);
    if (cpIdx < 0) cpIdx = CHECKPOINTS.length;
    tricks = 0;
    recent = [];
    meterTxt = '';
    camX = px;
    shore.lichen.armR.rotation.z = 0;
    resetFoam(-dist);
    layoutDecor(-dist);
  }

  // ---------- Per-frame world ----------
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  function updateBoat(dt, t, mode) {
    if (mode === 'tow') {
      boatS = dist + ROPE;
      boatX = pathX(boatS);
      boatYaw = -Math.atan(pathDX(boatS));
      boatSpeed = speed;
    } else if (mode === 'peel') {
      if (fin === 0) {
        // Still towing: swing wide toward the right bank before the beach.
        const L = RELEASE_S - PEEL_S;
        const k = clamp((dist - PEEL_S) / L, 0, 1);
        boatS = dist + ROPE;
        boatX = Math.min(RIVER - 2.2, pathX(boatS) + 4 * k * k);
        boatYaw = -Math.atan(pathDX(boatS) + (8 * k) / L);
        boatSpeed = speed;
      } else {
        // Rope dropped: turn off, slow down and idle near the bank.
        boatYaw = lerp(boatYaw, -1.3, Math.min(1, dt * 2));
        boatSpeed = Math.max(0, boatSpeed - 7 * dt);
        boatS = Math.min(SHORE_S - 3, boatS + Math.cos(boatYaw) * boatSpeed * dt);
        boatX = Math.min(RIVER - 2.2, boatX - Math.sin(boatYaw) * boatSpeed * dt);
      }
    } else boatSpeed = 0;
    boat.position.set(boatX, -0.14 + Math.sin(t * 5) * 0.04, -boatS);
    boat.rotation.set(-0.05 + Math.sin(t * 3) * 0.02, boatYaw, -boatYaw * 0.15);
    boat.updateMatrixWorld();
    // Wake: two foam trails spreading from the stern, plus churn in the middle.
    emitAcc += boatSpeed * dt;
    A.set(0, 0, 1.35);
    boat.localToWorld(A);
    let guard = 0;
    if (boatSpeed < 0.5) emitAcc = 0;
    while (emitAcc > 0.34 && guard++ < 8) {
      emitAcc -= 0.34;
      const back = emitAcc;
      for (const sd of [-1, 1]) foam(A.x + sd * 0.55, A.z + back, sd * 0.2 * boatSpeed + rnd(-0.12, 0.12), 1.5, rnd(0.15, 0.25));
      if (Math.random() < 0.6) foam(A.x + rnd(-0.35, 0.35), A.z + back + 0.25, rnd(-0.3, 0.3), 0.6, rnd(0.18, 0.32));
    }
    if (boatSpeed > 3 && Math.random() < 0.3) {
      B.set(Math.random() < 0.5 ? -0.6 : 0.6, 0.15, -1.6);
      boat.localToWorld(B);
      ctx.emit(SPLASH, B, 1, { speed: 0.8, up: 1.8, life: 0.4, size: 0.1 });
    }
  }
  function updateRope() {
    const on = fin === 0 && !(dead && deadT < 0.6);
    rope.visible = handle.visible = on;
    if (!on) return;
    A.set(0, 1.0, 1.0);
    boat.localToWorld(A);
    B.set(px, rider.position.y + 0.62, rz - 0.42);
    rope.position.copy(A).lerp(B, 0.5);
    rope.scale.z = A.distanceTo(B);
    rope.lookAt(B);
    handle.position.copy(B);
    handle.lookAt(A);
  }
  function poseRider(dt, t) {
    const bob = air || rail || py > 0.05 ? 0 : Math.sin(t * 6) * 0.03;
    let sink = 0;
    let roll = air ? 0 : clamp(-vx * 0.05, -0.4, 0.4);
    if (tumble > 0) {
      const k = 1 - tumble / 0.8;
      roll += Math.sin(k * PI) * 1.3 * tumbleDir;
      sink = -Math.sin(k * PI) * 0.45;
    }
    if (dead) {
      roll = 1.4 * tumbleDir;
      sink = -0.5;
    }
    slideYaw = lerp(slideYaw, rail ? PI / 2 : 0, Math.min(1, dt * 14));
    rider.position.set(px, py + bob + sink, rz);
    yawG.rotation.y = baseYaw + spin + slideYaw + (air ? 0 : clamp(-vx * 0.045, -0.35, 0.35));
    pivot.rotation.set(flip, 0, roll);
    const crouch = grabbing ? 0.82 : air ? 0.92 : 1;
    basil.body.scale.y = lerp(basil.body.scale.y, crouch, Math.min(1, dt * 14));
    basil.armR.rotation.z = fin ? Math.sin(t * 10) * 0.4 + 2.6 : 1.15;
    basil.armL.rotation.z = fin ? 0 : 0.55;
    basil.armL.rotation.x = grabbing ? 0.9 : 0;
    rider.visible = dead || inv <= 0 || tumble > 0 || Math.floor(inv * 12) % 2 === 0;
  }

  function placeCamera(dt, mode) {
    const cam = ctx.camera;
    const asp = cam.aspect || 1.5;
    const k = clamp((1.15 - asp) / 0.6, 0, 1); // 0 wide screens, 1 tall phones
    const fov = lerp(56, 72, k);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const follow = lerp(0.5, 0.85, k);
    const tx = clamp(lerp(fin ? px : boatX, px, follow), -RIVER + 2.5, RIVER - 2.5);
    camX += (tx - camX) * Math.min(1, dt * 3.5);
    const baseZ = -dist;
    if (mode === 'title') {
      // Basil off to the left of the title card, the boat up ahead.
      cam.position.set(px + 2.5, 4.2, rz + 7);
      cam.lookAt(px + 4, 0.8, rz - 5);
    } else {
      const h = lerp(8.5, 10, k);
      const back = lerp(8.6, 5.6, k);
      const ahead = lerp(5, 5.2, k);
      const lift = Math.max(0, py);
      cam.position.set(camX, h + lift * 0.3, baseZ + back);
      cam.lookAt(camX, 0.3 + lift * 0.2, baseZ - ahead);
    }
    ctx.followSun({ x: camX, y: 0, z: baseZ - 6 });
  }

  function updateWorld(dt, t) {
    const baseZ = -dist;
    water.position.set(0, 0, baseZ - WL / 2 + 40);
    stripeTex.offset.y = (((-water.position.z / PERIOD) % 1) + 1) % 1;
    banks.position.z = water.position.z;
    updateDecor(baseZ, t);
    updateFoam(dt, t, baseZ);
    // Lichen waves from the beach once she can see you.
    const wave = dist > D - 120;
    shore.lichen.armR.rotation.z = wave ? 2.7 + Math.sin(t * 9) * 0.35 : 0.1;
    shore.lichen.root.position.y = 0.35 + (fin === 2 ? Math.abs(Math.sin(t * 7)) * 0.25 : 0);
  }

  function updateEntities(dt, t) {
    const baseZ = -dist;
    const closing = speed;
    for (const e of active) {
      if (!e.on) continue;
      const a0 = e.prevA ?? prevRz - e.z;
      if (e.type === 'dolphin' || e.type === 'salmon') {
        if (!e.going) {
          const ahead = rz - e.z;
          const cl = closing + (e.dZ > 0 ? e.sp : 0);
          if (ahead / Math.max(cl, 1) <= e.trig || ahead < 4) e.going = true;
        }
        if (e.going) {
          e.t += dt;
          e.x += e.dX * e.sp * dt;
          e.z += e.dZ * e.sp * dt;
          const cyc = e.leap + e.gap;
          const prevU = e.u;
          e.u = ((e.t % cyc) + cyc) % cyc / e.leap;
          if (e.u <= 1) {
            e.y = -0.65 + Math.sin(e.u * PI) * e.H;
            e.m.visible = e.y > -0.6;
            e.m.position.set(e.x, e.y, e.z);
            e.m.rotation.x = (0.5 - e.u) * 1.8;
            const near = Math.abs(e.z - baseZ) < 70;
            if (near && ((prevU < 0.08 && e.u >= 0.08) || (prevU < 0.92 && e.u >= 0.92))) {
              splash(e.x, 0.05, e.z, e.type === 'dolphin' ? 8 : 4, { speed: 1.2, up: 2.4, life: 0.5, size: 0.12 });
            }
          } else {
            e.y = -1;
            e.m.visible = false;
          }
          if (e.dX && Math.abs(e.x) > RIVER - 0.4 && e.x * e.dX > 0 && !e.m.visible) e.done = true;
        }
        // Collision: in the leaper's own frame (along its heading / across it).
        const a1 = rz - e.z;
        const crossed = a0 > 0 && a1 <= 0;
        if (e.m.visible && e.y > -0.38 && !e.hit && !dead) {
          const dz = (a0 > 0) !== (a1 > 0) ? 0 : a1;
          const relX = px - e.x;
          const along = Math.abs(relX * e.dX + dz * e.dZ);
          const perp = Math.abs(relX * e.dZ - dz * e.dX);
          if (along < e.hl + 0.3 && perp < e.hw + 0.3 && py < e.y + e.top && inv <= 0) {
            e.hit = true;
            wipe(e.type);
          }
        }
        if (crossed && !e.passed) {
          e.passed = true;
          const lat = Math.abs(px - e.x) - (e.dX ? e.hl : e.hw) - 0.3;
          if (!e.hit && e.m.visible && e.y > -0.4 && lat < 1.1 && inv <= 0 && !dead) ctx.addScore(25, 'CLOSE CALL!');
        }
        e.prevA = a1;
        if (e.done || e.z > baseZ + 14) {
          e.on = false;
          e.m.visible = false;
        }
        continue;
      }
      // Static features
      if (e.type === 'buoy') {
        e.m.position.y = Math.sin(t * 2.4 + e.ph) * 0.06;
        e.m.rotation.z = Math.sin(t * 1.9 + e.ph) * 0.08;
      } else if (e.type === 'log') {
        if (boatS > e.s + 2) e.x += (e.drift || 0) * dt;
        e.m.position.set(e.x, Math.sin(t * 1.8 + e.ph) * 0.05, e.z);
        e.m.rotation.y = Math.sin(t * 0.7 + e.ph) * 0.06;
      } else {
        e.m.position.y = Math.sin(t * 1.5 + e.ph) * 0.03;
      }
      if (e.hx != null) {
        const a1 = rz - e.z;
        const dz = (a0 > 0) !== (a1 > 0) ? 0 : Math.min(Math.abs(a0), Math.abs(a1));
        const lat = Math.abs(px - e.x);
        if (!e.hit && !dead && inv <= 0 && dz < e.hz + 0.3 && lat < e.hx + 0.3 && py < e.top) {
          e.hit = true;
          wipe(e.type);
        }
        if (a0 > 0 && a1 <= 0 && !e.passed) {
          e.passed = true;
          if (!e.hit && inv <= 0 && !dead) {
            if (py >= e.top && lat < e.hx + 0.4) ctx.addScore(40, e.type === 'log' ? 'LOG HOP!' : 'BUOY HOP!');
            else if (lat < e.hx + 1.3) ctx.addScore(25, 'CLOSE CALL!');
          }
        }
        e.prevA = a1;
      }
      const far = e.z - (e.railLen || 0) - (e.len || 0);
      if (far > baseZ + 14) {
        e.on = false;
        e.m.visible = false;
      }
    }
    for (let i = active.length - 1; i >= 0; i--) if (!active[i].on) active.splice(i, 1);
  }

  // Simple autopilot for ?auto screenshots.
  function autopilot(dt) {
    autoT += dt;
    const o = { left: false, right: false, up: false, down: false, action: false, pressed: new Set() };
    let target = boatX + 3.2 * Math.sin(autoT * 0.8);
    let threat = null;
    for (const e of active) {
      const ahead = rz - e.z;
      if (e.ramp && ahead > 0 && ahead < 28) target = e.x;
      if (!e.ramp && ahead > -1 && ahead < 9 && Math.abs(e.x - px) < 1.6) threat = e;
    }
    if (threat) target = px + (px > threat.x ? 2.5 : -2.5);
    if (target < px - 0.3) o.left = true;
    else if (target > px + 0.3) o.right = true;
    if (air && airTime > 0.05 && airTime < 0.1 && Math.random() < 0.7) o.pressed.add(Math.random() < 0.5 ? 'left' : 'right');
    if (air && airTime > 0.1 && vy > 3) o.action = true;
    return o;
  }

  function updatePlay(dt, input, t) {
    if (AUTO) input = autopilot(dt);
    inp = input;
    const p = clamp(dist / D, 0, 1);
    // Speed: ramps with progress, dips after a wipeout, coasts to a stop at the end.
    slow = Math.max(0, slow - dt * 0.5);
    if (fin === 0) {
      speed = speedAt(p) * (1 - 0.5 * slow) * (dead ? 0.4 : 1);
      if (dist >= RELEASE_S && !dead) {
        fin = 1;
        coastA = Math.max(2, (speed * speed - 30) / (2 * (SHORE_S - dist)));
        ctx.toast('LET GO!');
      }
    } else if (fin === 1) {
      speed = Math.max(1.2, speed - coastA * dt);
    } else {
      speed = Math.max(0, speed - 14 * dt);
    }
    const dd = speed * dt;
    dist += dd;
    if (!dead && fin < 2) ctx.addScore(dd);

    // Input
    const steerIn = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const grounded = !air && !rail;
    if (grounded && !dead) {
      if (input.pressed.has('left')) {
        cutT = 0.28;
        cutDir = -1;
      }
      if (input.pressed.has('right')) {
        cutT = 0.28;
        cutDir = 1;
      }
    }
    cutT -= dt;
    const steer = dead || tumble > 0 ? 0 : steerIn || (cutT > 0 ? cutDir : 0);
    const jump = !dead && tumble <= 0 && (input.pressed.has('up') || input.pressed.has('action'));
    inv = Math.max(0, inv - dt);
    tumble = Math.max(0, tumble - dt);

    // Lateral
    const prevPx = px;
    if (!rail) {
      const target = steer * VX_MAX;
      const grip = air ? (groundHold.left || groundHold.right ? 1.5 : 0) : steer ? 5 : 2.6;
      vx += (target - vx) * Math.min(1, dt * grip);
      px += vx * dt;
    }
    const lo = fin || boatS > PEEL_S + ROPE ? -XMAX : reachLo(boatX);
    const hi = fin || boatS > PEEL_S + ROPE ? XMAX : reachHi(boatX);
    if (px < lo) {
      px = lo;
      vx = Math.max(vx, 0);
    }
    if (px > hi) {
      px = hi;
      vx = Math.min(vx, 0);
    }
    // Rope swing: out wide, Basil runs up beside the boat a little.
    const dx = clamp(px - boatX, -RMAX, RMAX);
    const swingT = fin ? swing : ROPE - Math.sqrt(ROPE * ROPE - dx * dx);
    swing += (swingT - swing) * Math.min(1, dt * 6);
    prevRz = rz;
    rz = -dist - swing;

    // Vertical
    if (rail) {
      const e = rail;
      px += (e.x - px) * Math.min(1, dt * 14);
      py = RAIL_H;
      railT += dt;
      if (Math.random() < 0.5) ctx.emit(['#ffffff', C.teal, '#bdeeff'], { x: px, y: RAIL_H + 0.05, z: rz + 0.3 }, 1, { speed: 1, up: 1.5, life: 0.35, size: 0.08 });
      if (jump) leaveRail(7.5, 0);
      else if (input.pressed.has('left') || input.pressed.has('right')) leaveRail(3.5, input.pressed.has('left') ? -4.5 : 4.5);
      else if (rz < e.z - e.len - e.railLen) leaveRail(5, 0);
    } else if (!air) {
      const r = fin ? null : rampAt(px, rz);
      if (r) {
        py = r.h;
        onRamp = r.e;
      } else if (onRamp) {
        const e = onRamp;
        onRamp = null;
        const aligned = Math.abs(px - e.x) <= e.w / 2 + 0.35;
        const pastLip = rz < e.z - e.len;
        if (pastLip && aligned && e.type === 'slider' && Math.abs(px - e.x) < 0.6) startRail(e);
        else if (pastLip && aligned && e.type === 'kicker') takeoff(10.5 + speed * 0.1, 'kicker');
        else if (pastLip && aligned && e.type === 'side') {
          takeoff(8.6 + speed * 0.06, 'side');
          vx = -Math.sign(e.x) * 2.5;
        } else takeoff(0, 'drop');
      } else {
        py = fin && -rz > SHORE_S ? lerp(py, 0.3, Math.min(1, dt * 10)) : 0;
      }
      // Wake: cut across a wake line with speed and it pops you up.
      if (!air && !rail && !onRamp && fin === 0 && !dead && tumble <= 0) {
        const c = pathX(-rz);
        const hw = wakeHalf();
        const lines = [c - hw, c + hw];
        const nearWake = lines.some((l) => Math.abs(px - l) < 0.9) && Math.abs(vx) > 2.5;
        if (jump) takeoff(nearWake ? 4 + Math.abs(vx) * 0.85 : 6.2, nearWake ? 'wake' : 'ollie');
        else if (Math.abs(vx) > 3.2 && lines.some((l) => (prevPx - l) * (px - l) < 0)) {
          takeoff(2.6 + Math.abs(vx) * 0.75, 'wake');
        }
      } else if (jump && !air && !rail) {
        takeoff(onRamp ? 7 : 6.2, 'ollie');
      }
      // Board spray when carving hard
      if (!air && !rail && py < 0.05 && Math.abs(vx) > 4.2 && Math.random() < 0.6) {
        ctx.emit(SPLASH, { x: px - Math.sign(vx) * 0.35, y: 0.12, z: rz + 0.3 }, 1, { speed: 1.4, up: 2.4, life: 0.45, size: 0.1 });
      }
    }
    if (air) {
      airTime += dt;
      const prevPy = py;
      vy -= G * dt;
      py += vy * dt;
      // Spins: fresh presses in the air add a 180; keep holding to keep spinning.
      for (const [key, dir] of [['left', 1], ['right', -1]]) {
        if (!input[key]) groundHold[key] = false;
        if (groundHold[key] || dead) continue;
        if (input.pressed.has(key)) {
          spinT += dir * PI;
          holdT[key] = 0;
        } else if (input[key]) {
          holdT[key] += dt;
          if (holdT[key] > 0.18 && Math.abs(spinT - spin) < 0.35 * PI) spinT += dir * PI;
        }
      }
      if (input.pressed.has('up') && airTime > 0.08 && Math.abs(flipT - flip) < 0.01) flipT += TAU;
      grabbing = (input.action || input.down) && airTime > 0.12;
      if (grabbing) grabT += dt;
      const ds = spinT - spin;
      spin += Math.sign(ds) * Math.min(Math.abs(ds), SPIN_RATE * dt);
      const df = flipT - flip;
      flip += Math.sign(df) * Math.min(Math.abs(df), FLIP_RATE * dt);
      // Landing: rail, ramp or water
      let landed = false;
      if (vy <= 0) {
        for (const e of active) {
          if (e.type !== 'slider' || !e.on) continue;
          const onRail = Math.abs(px - e.x) < 0.5 && rz <= e.z - e.len + 0.2 && rz >= e.z - e.len - e.railLen;
          if (onRail && prevPy >= RAIL_H - 0.3 && py <= RAIL_H) {
            py = RAIL_H;
            if (land()) startRail(e);
            landed = true;
            break;
          }
        }
        if (!landed) {
          const r = rampAt(px, rz);
          const floor = r ? r.h : fin && -rz > SHORE_S ? 0.3 : 0;
          if (py <= floor) {
            py = floor;
            land();
            if (r) onRamp = r.e;
          }
        }
      }
    } else grabbing = false;

    updateBoat(dt, t, fin === 0 && dist < PEEL_S ? 'tow' : 'peel');
    updateEntities(dt, t);

    // Board trail on the water
    if (!air && !rail && py < 0.05 && fin < 2) {
      trailAcc += speed * dt;
      while (trailAcc > 0.3) {
        trailAcc -= 0.3;
        foam(px + rnd(-0.05, 0.05), rz + 0.55 + trailAcc, -vx * 0.1, 0.8, rnd(0.15, 0.2));
      }
    }

    // Checkpoints
    if (cpIdx < CHECKPOINTS.length && dist >= CHECKPOINTS[cpIdx]) {
      cpIdx++;
      if (!dead) ctx.addScore(100, 'CHECKPOINT!');
    }

    // Spawning
    while (nextRow < dist + AHEAD && nextRow < D - 70) nextRow += spawnRow(nextRow);

    // Finish: coast onto the beach, then celebrate.
    if (fin === 1 && -rz > SHORE_S + 0.6) {
      fin = 2;
      finT = 0;
      air = false;
      vy = 0;
    }
    if (fin === 2) {
      finT += dt;
      if (finT > 0.35 && finT - dt <= 0.35) {
        const bonus = 1500;
        ctx.addScore(bonus, 'MADE IT TO SHORE!');
        ctx.emit([C.teal, C.pink, C.yellow, '#ffffff'], { x: px, y: 1.6, z: rz - 1 }, 60, { speed: 3.5, up: 6, gravity: 7, life: 1.6, size: 0.16 });
      }
      if (lives > 0 && finT > 1.3 && finT - dt <= 1.3) ctx.addScore(lives * 500, `${lives} ♥ BONUS`);
      if (finT > 2.6) {
        phase = 'over';
        ctx.end(`Made it to shore! ${tricks} trick${tricks === 1 ? '' : 's'} landed with ${lives} ${lives === 1 ? 'life' : 'lives'} to spare.`);
      }
    }
    if (dead) {
      deadT -= dt;
      if (deadT <= 0) {
        phase = 'over';
        ctx.end(`${CAUSE[cause] || 'Wiped out'} ${fmt(Math.max(0, D - dist))}m from shore.`);
      }
    }

    // HUD
    // Meter label in 10 m steps so the DOM only changes a few times a second.
    const left = Math.max(0, Math.ceil((D - dist) / 10) * 10);
    const key = fin ? -1 : left;
    if (key !== meterTxt) {
      meterTxt = key;
      ctx.setMeter(dist / D, fin ? 'COAST IN!' : `${fmt(left)}M TO SHORE`);
    } else if (fin === 0) ctx.setMeter(dist / D);

    poseRider(dt, t);
    updateRope();
    updateWorld(dt, t);
    placeCamera(dt, 'play');
  }

  // Title screen: a gentle demo ride behind the boat.
  function updateDemo(dt, t) {
    dist += 7 * dt;
    speed = 7;
    boatS = dist + ROPE;
    boatX = pathX(boatS);
    boatYaw = -Math.atan(pathDX(boatS));
    const target = boatX + 3 * Math.sin(t * 0.7);
    vx = (target - px) * 1.5;
    px = target;
    const dx = clamp(px - boatX, -RMAX, RMAX);
    swing = ROPE - Math.sqrt(ROPE * ROPE - dx * dx);
    prevRz = rz;
    rz = -dist - swing;
    updateBoat(dt, t, 'tow');
    trailAcc += speed * dt;
    while (trailAcc > 0.3) {
      trailAcc -= 0.3;
      foam(px, rz + 0.55 + trailAcc, 0, 0.8, 0.18);
    }
    poseRider(dt, t);
    updateRope();
    updateWorld(dt, t);
    placeCamera(dt, 'title');
  }

  resetRun(0);
  if (params.has('debug')) {
    window.__wake = {
      get: () => ({ dist, speed, px, py, lives, fin, air, rail: !!rail, active: active.length, tricks }),
      hit: (why = 'dolphin') => {
        inv = 0;
        wipe(why);
      },
    };
  }

  return {
    reset() {
      phase = 'play';
      resetRun(SKIP * D);
      ctx.setLives(lives);
      ctx.setMeter(dist / D, `${fmt(D - dist)}M TO SHORE`);
      meterTxt = '';
    },
    update(dt, input, t) {
      updatePlay(dt, input, t);
    },
    idle(dt, t) {
      if (phase === 'title') return updateDemo(dt, t);
      // Game over: keep the river alive behind the card.
      updateBoat(dt, t, 'idle');
      updateEntities(dt, t);
      poseRider(dt, t);
      updateRope();
      updateWorld(dt, t);
      placeCamera(dt, 'over');
    },
  };
}
