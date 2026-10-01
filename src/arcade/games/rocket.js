// To the Moon: Basil and Lichen fly the rocket from the launch pad to the Moon.
// Dodge geese, space junk, Freshly satellites, asteroids, comets and things that
// blow up, then flip, burn and land it softly on the lunar pad.
//
// Debug: ?skip=0.95 starts the run 95% of the way to the Moon; ?skip=1 jumps
// straight to the landing; ?god makes the hull indestructible (testing only).
import {
  makeAsteroid, makeDebris, makeFreshlySat, makeBundlesSat, makeBrokenSat, makeFuelTank, makeComet,
  makeGoose, makeBalloon, makeCloud, makeStar, makeFuelCell, makeHeart, makeLaunchSite, makeMoonSet,
  makeEarth, makeMoonBall, makeFlag, addLegs, setLegs, cbox,
} from './rocket-models.js';

const L = 8000; // world units from the pad to the Moon (~13 min at normal play)
const KM = 384400;
const FIELD = 5.3; // how far left/right the rocket can fly
const ATMO = 0.035; // share of the trip spent in the atmosphere
const LAND_Y = -4000; // the landing set lives far below the flight path
const PAD_HW = 2.2; // on-pad tolerance (the pad is 5 wide)
const SAFE_V = 3.2; // max touchdown speed
const MAX_TILT = 12; // degrees before it tips over
const GRAV = 3.2; // lunar gravity (game units)
const THRUST = 7.4;
const BOOST = 1.6;
const NEAR = 0.6; // near-miss gap
const ZONES = [
  [ATMO, 'SPACE!', 250],
  [0.1, 'SATELLITE ALLEY', 0],
  [0.25, 'QUARTER WAY', 500],
  [0.36, 'ASTEROID FIELD', 0],
  [0.5, 'HALFWAY THERE', 500],
  [0.6, 'DEEP SPACE', 0],
  [0.75, 'THREE QUARTERS', 500],
  [0.87, 'LUNAR APPROACH', 0],
  [0.965, 'PREPARE TO LAND', 250],
];
const FIRE = ['#ffb020', '#ff5a1f', '#ffe14d'];
const SMOKE = ['#ffffff', '#e6e9f0', '#cfd5df'];
const DUST = ['#d4d4df', '#b5b5c3', '#e4e4ee'];
const SHARD = ['#ffb020', '#ff5a1f', '#9aa0a8', '#ffe14d', '#555c68'];

const C = (x, y, r) => ({ c: 1, x, y, r });
const Rect = (x, y, hw, hh) => ({ c: 0, x, y, hw, hh });

export default function create(ctx) {
  const { THREE, scene, models, clamp, lerp } = ctx;
  const R = Math.random;
  const params = new URLSearchParams(location.search);
  const SKIP = clamp(parseFloat(params.get('skip')) || 0, 0, 1);
  const GOD = params.has('god');

  const SKY = new THREE.Color('#8fd3ff');
  const SPACE = new THREE.Color('#0a0f2c');
  scene.background = SKY.clone();
  // Space fill: a soft light from the camera side so dark junk still reads on the night sky.
  const fill = new THREE.DirectionalLight('#dfe6ff', 0);
  fill.position.set(0, -0.4, 1);
  const amb = new THREE.AmbientLight('#8f9bff', 0);
  scene.add(fill, amb);

  // ---------- Sets ----------
  const site = makeLaunchSite();
  scene.add(site);
  const moonSet = makeMoonSet();
  moonSet.root.position.y = LAND_Y;
  scene.add(moonSet.root);
  const clouds = ctx.group(scene);
  for (let i = 0; i < 18; i++) {
    const c = makeCloud();
    c.position.set((R() - 0.5) * 30, 24 + i * 15 + R() * 8, -4 - R() * 8);
    clouds.add(c);
  }

  // ---------- Ship ----------
  const ship = ctx.group(scene);
  const rocket = models.makeRocket(true);
  rocket.rotation.y = Math.PI; // porthole (Basil + Lichen) toward the camera
  ship.add(rocket);
  const flame = rocket.userData.flame;
  const legs = addLegs(rocket);
  // Landing marker: a yellow bracket on the ground under the rocket.
  const marker = ctx.group(moonSet.root);
  cbox(marker, 1.4, 0.04, 0.12, '#ffe14d', 0, -0.26, 0.7, { shadow: false });
  cbox(marker, 1.4, 0.04, 0.12, '#ffe14d', 0, -0.26, -0.7, { shadow: false });
  cbox(marker, 0.12, 0.04, 1.4, '#ffe14d', 0.7, -0.26, 0, { shadow: false });
  cbox(marker, 0.12, 0.04, 1.4, '#ffe14d', -0.7, -0.26, 0, { shadow: false });
  const crew = [models.makePlayer(), models.makePlayer(models.LICHEN)];
  crew.forEach((c) => {
    c.gear.suit.visible = true;
    c.root.rotation.y = Math.PI;
    c.root.visible = false;
    scene.add(c.root);
  });
  const flag = makeFlag();
  flag.visible = false;
  scene.add(flag);

  // ---------- Background: stars, Earth and Moon, locked to the (un-rolled) camera ----------
  const bg = ctx.group(scene);
  const earth = makeEarth();
  const moonBall = makeMoonBall();
  bg.add(earth, moonBall);
  function starLayer(n, size, color, depth, speed) {
    const pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    bg.add(pts);
    const seeds = Array.from({ length: n }, () => ({ u: R() * 2 - 1, v: R() * 2 - 1, d: depth * (0.8 + R() * 0.4), k: 0.6 + R() * 0.8 }));
    return { pos, geo, mat, seeds, speed };
  }
  const layers = [starLayer(520, 2, '#ffffff', 160, 0.0012), starLayer(90, 3.5, '#fff3c4', 150, 0.0016), starLayer(70, 2.5, '#8f9bff', 40, 0.012)];
  let scroll = 0;

  // ---------- Pools ----------
  const KINDS = {
    debris: { build: makeDebris, shapes: [C(0, 0, 0.42)], spin: 2.2 },
    astS: { build: () => makeAsteroid(0.75), shapes: [C(0, 0, 0.72)], spin: 1 },
    astM: { build: () => makeAsteroid(1.1), shapes: [C(0, 0, 1.05)], spin: 0.7 },
    astL: { build: () => makeAsteroid(1.5), shapes: [C(0, 0, 1.42)], spin: 0.45 },
    sat: { build: makeFreshlySat, shapes: [Rect(0, 0.05, 0.62, 0.68), Rect(0, 0, 2.4, 0.4)], wobble: 1 },
    bundles: { build: makeBundlesSat, shapes: [Rect(0, 0, 1.85, 0.85), Rect(0, 0, 3.1, 0.3)], wobble: 0.5 },
    broken: { build: makeBrokenSat, shapes: [C(0, 0, 0.8)], boom: true, spin: 0.5 },
    tank: { build: makeFuelTank, shapes: [Rect(0, 0, 0.48, 0.95)], boom: true, wobble: 1 },
    comet: { build: makeComet, shapes: [C(0, 0, 0.6)], spin: 3 },
    goose: { build: makeGoose, shapes: [C(0.1, 0.05, 0.45)] },
    balloon: { build: makeBalloon, shapes: [C(0, 0.9, 0.78), Rect(0, -0.3, 0.18, 0.16)] },
    star: { build: makeStar, pick: 'star', shapes: [C(0, 0, 0.55)] },
    fuel: { build: makeFuelCell, pick: 'fuel', shapes: [C(0, 0, 0.55)] },
    heart: { build: makeHeart, pick: 'heart', shapes: [C(0, 0, 0.55)] },
  };
  for (const k of Object.values(KINDS)) {
    k.top = Math.max(...k.shapes.map((s) => s.y + (s.c ? s.r : s.hh)));
    k.bot = Math.min(...k.shapes.map((s) => s.y - (s.c ? s.r : s.hh)));
  }
  const pools = {};
  function take(kind) {
    const pool = pools[kind] || (pools[kind] = []);
    let m = pool.pop();
    if (!m) {
      m = KINDS[kind].build();
      scene.add(m.root);
    }
    m.root.visible = true;
    return m;
  }
  // Pre-build the sign-carrying satellites so their textures are ready before launch.
  ['sat', 'sat', 'sat', 'sat', 'sat', 'bundles', 'bundles'].forEach((k) => (pools[k] = pools[k] || []).push(take(k)));
  Object.values(pools).forEach((p) => p.forEach((m) => (m.root.visible = false)));

  // Shrapnel from explosions: real hazards, unlike ctx.emit particles.
  const shardMeshes = [];
  for (let i = 0; i < 70; i++) {
    const m = ctx.box(scene, 0.26, 0.26, 0.26, SHARD[i % SHARD.length], 0, 0, 0, { shadow: false });
    m.visible = false;
    shardMeshes.push(m);
  }

  // ---------- State ----------
  let phase = 'title';
  let phaseT = 0;
  let rx = 0;
  let ry = 0.4;
  let vx = 0;
  let spd = 0;
  let lives = 3;
  let inv = 0;
  let thrust = false;
  let steer = 0;
  let pulse = 0;
  let burst = 0;
  let nudge = 0;
  let nudgeDir = 0;
  let nextY = 40;
  let zoneIdx = 0;
  let combo = 0;
  let comboT = 0;
  let bundlesY = 700;
  let heartY = 0;
  let chainId = 0;
  const chains = new Map();
  let meterT = 0;
  let roll = 0;
  let camX = 0;
  // landing
  let alt = 0;
  let lvx = 0;
  let lvy = 0;
  let tilt = 0;
  let legK = 0;
  let warned = false;
  const queue = [];
  const ents = [];
  const shards = [];
  let elapsed = 0;

  const prog = () => clamp(ry / L, 0, 1);
  const cruise = (p) => lerp(6.5, 11, p);
  const fmt = (n) => Math.round(n).toLocaleString('en-CA');
  const kmLeft = () => Math.round(((1 - prog()) * KM) / 100) * 100;
  const later = (dt, fn) => queue.push({ at: elapsed + dt, fn });

  // ---------- Entities ----------
  function add(kind, x, y, o = {}) {
    const K = KINDS[kind];
    const m = take(kind);
    const e = {
      kind, K, m, x, y, vx: o.vx || 0, vy: o.vy || 0,
      sx: (R() - 0.5) * 2 * (K.spin || 0), sy: (R() - 0.5) * 2 * (K.spin || 0), sz: (R() - 0.5) * 2 * (K.spin || 0),
      // Hazards hold still until they're about to scroll into view, so drift can't pile up off-screen.
      ph: R() * 10, near: 9, passed: false, t: 0, armed: false, wait: o.wait || (o.vx || o.vy ? 28 : 0), chain: o.chain || 0, dir: o.dir || 1,
    };
    if (m.spin) m.spin.rotation.set(0, 0, 0);
    m.root.rotation.set(0, 0, 0);
    if (kind === 'goose') m.root.rotation.y = e.dir > 0 ? 0 : Math.PI;
    if (m.light) m.light.visible = true;
    m.root.position.set(x, y, 0);
    ents.push(e);
    return e;
  }
  function drop(i) {
    const e = ents[i];
    e.m.root.visible = false;
    pools[e.kind].push(e.m);
    ents.splice(i, 1);
  }
  function clearAll() {
    for (let i = ents.length - 1; i >= 0; i--) drop(i);
    shards.forEach((s) => (s.m.visible = false));
    shards.length = 0;
    queue.length = 0;
  }

  // ---------- Spawning ----------
  const drift = (p) => (R() - 0.5) * 2 * (0.25 + p * 1.3);
  const randX = (m = 0) => (R() * 2 - 1) * (FIELD - m);
  function pickW(w) {
    let tot = 0;
    for (const k in w) tot += w[k];
    let r = R() * tot;
    for (const k in w) if ((r -= w[k]) <= 0) return k;
    return Object.keys(w)[0];
  }
  function maybeFuel(x, y, r, p) {
    if (R() > 0.1 + p * 0.06) return;
    const s = x > 0 ? -1 : 1;
    add('fuel', clamp(x + s * (r + 1.4), -FIELD, FIELD), y);
  }
  const PATTERNS = {
    debris(y, p) {
      const n = 1 + ((R() * (1.5 + p * 2.2)) | 0);
      let last = 99;
      for (let i = 0; i < n; i++) {
        let x = randX(0.3);
        for (let k = 0; k < 6 && Math.abs(x - last) < 2.2; k++) x = randX(0.3);
        last = x;
        add('debris', x, y + R() * 2.5, { vx: drift(p) });
        if (i === 0) maybeFuel(x, y + 1, 0.5, p);
      }
      return 2.5;
    },
    asteroid(y, p) {
      const r = 0.6 + R() * 0.5 + p * 0.7;
      const kind = r < 0.95 ? 'astS' : r < 1.35 ? 'astM' : 'astL';
      const x = randX(0.5);
      add(kind, x, y + 1, { vx: drift(p) * 0.8, vy: -R() * p * 1.2 });
      maybeFuel(x, y + 1, 1.4, p);
      return 2.5;
    },
    sat(y, p) {
      // Kept near the middle so there's always room to pass on either side.
      const s = R() < 0.5 ? -1 : 1;
      add('sat', s * R() * 1.6, y + 1, { vx: -s * (0.1 + R() * 0.25) * (1 + p) });
      return 2.5;
    },
    bundles(y) {
      const s = R() < 0.5 ? -1 : 1;
      add('bundles', s * (1.6 + R() * 1.6), y + 2, { vx: -s * 0.25 });
      return 5;
    },
    wall(y, p) {
      const gap = lerp(3.7, 2.7, p);
      const gx = randX(gap / 2 + 0.2);
      for (let x = -FIELD - 0.6; x <= FIELD + 0.7; x += 1.15) if (Math.abs(x - gx) > gap / 2 + 0.42) add('debris', x, y + 4 + (R() - 0.5) * 0.5);
      if (R() < 0.5) add('star', gx, y + 4);
      return 10;
    },
    shower(y, p) {
      const lane = randX(1.5);
      const n = 3 + ((R() * (1.5 + p)) | 0);
      for (let i = 0; i < n; i++) {
        const big = R() < 0.4;
        const r = big ? 1.05 : 0.72;
        let x = randX(0.4);
        for (let k = 0; k < 12 && Math.abs(x - lane) < r + 1.5; k++) x = randX(0.4);
        if (Math.abs(x - lane) < r + 1.5) continue;
        add(big ? 'astM' : 'astS', x, y + (i * 11) / n + R(), { vx: drift(p) * 0.4, vy: -0.5 - R() });
      }
      return 11;
    },
    boom(y, p) {
      add(R() < 0.5 ? 'broken' : 'tank', randX(1), y + 2, { vx: drift(p) * 0.5 });
      return 4;
    },
    comet(y, p) {
      const s = R() < 0.5 ? -1 : 1;
      add('comet', -s * 26, y + 4, { vx: s * (7.5 + p * 3), vy: -0.8, wait: 30 });
      return 3;
    },
    geese(y) {
      const s = R() < 0.5 ? -1 : 1;
      const x0 = randX(1) - s * 2;
      const n = 3 + ((R() * 2) | 0);
      for (let i = 0; i < n; i++) {
        const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
        add('goose', x0 - s * Math.abs(k) * 0.9, y + 2 + k * 0.6, { vx: s * (1.1 + R() * 0.4), dir: s });
      }
      return 3;
    },
    balloon(y) {
      add('balloon', randX(0.8), y + 1, { vx: (R() - 0.5) * 1.2, vy: 0.7 });
      return 3;
    },
    stars(y) {
      const id = ++chainId;
      const n = 5;
      const shape = (R() * 3) | 0;
      const xc = randX(2.2);
      const xe = randX(1);
      chains.set(id, { left: n, got: 0 });
      for (let i = 0; i < n; i++) {
        const x = shape === 0 ? xc : shape === 1 ? lerp(xc, xe, i / (n - 1)) : xc + Math.sin(i * 1.1) * 1.8;
        add('star', clamp(x, -FIELD, FIELD), y + i * 1.6, { chain: id });
      }
      return 7;
    },
    none() {
      return 4;
    },
    heart(y) {
      add('heart', randX(1), y + 1);
      return 3;
    },
  };
  function spawnRow() {
    const y = nextY;
    const p = clamp(y / L, 0, 1);
    let kind;
    if (p > 0.995) {
      nextY = Infinity;
      return;
    }
    if (p > 0.965) kind = R() < 0.5 ? 'stars' : 'none'; // clear skies for the run-in
    else if (p < ATMO) kind = pickW({ geese: 3, balloon: 2.2, stars: 1 });
    else if (lives < 3 && y - heartY > 450 && R() < 0.3) {
      kind = 'heart';
      heartY = y;
    } else if (p > 0.05 && y > bundlesY) {
      kind = 'bundles';
      bundlesY = y + 650 + R() * 400;
    } else {
      kind = pickW({
        debris: 3.2,
        asteroid: p > 0.06 ? 1.6 + p * 2.4 : 0.5,
        sat: p < 0.36 ? 3 : 1.6,
        wall: p > 0.12 ? 0.8 + p * 1.4 : 0,
        boom: p > 0.16 ? 0.7 + p * 1.6 : 0,
        shower: p > 0.36 ? 0.8 + p * 1.4 : 0,
        comet: p > 0.55 ? 0.6 + p : 0,
        stars: 1.3,
      });
    }
    const h = PATTERNS[kind](y, p);
    nextY = y + h + lerp(12.5, 7.2, Math.pow(p, 0.8)) * (0.85 + R() * 0.3);
  }

  // ---------- Collision ----------
  // Rocket hitbox: the body plus the fins near the base.
  function shipGap(e) {
    let best = 9;
    const b0x = rx - 0.48, b1x = rx + 0.48, b0y = ry + 0.3, b1y = ry + 4.0;
    const f0x = rx - 0.68, f1x = rx + 0.68, f0y = ry + 0.15, f1y = ry + 1.1;
    for (const s of e.K.shapes) {
      const cx = e.x + s.x * (e.dir || 1);
      const cy = e.y + s.y;
      for (let k = 0; k < 2; k++) {
        const x0 = k ? f0x : b0x, x1 = k ? f1x : b1x, y0 = k ? f0y : b0y, y1 = k ? f1y : b1y;
        let d;
        if (s.c) {
          const dx = Math.max(x0 - cx, 0, cx - x1);
          const dy = Math.max(y0 - cy, 0, cy - y1);
          d = Math.hypot(dx, dy) - s.r;
        } else {
          const dx = Math.max(x0 - (cx + s.hw), 0, cx - s.hw - x1);
          const dy = Math.max(y0 - (cy + s.hh), 0, cy - s.hh - y1);
          d = dx > 0 || dy > 0 ? Math.hypot(dx, dy) : -1;
        }
        if (d < best) best = d;
      }
    }
    return best;
  }
  function pointGap(x, y, r) {
    const dx = Math.max(rx - 0.48 - x, 0, x - rx - 0.48);
    const dy = Math.max(ry + 0.3 - y, 0, y - ry - 4.0);
    const fx = Math.max(rx - 0.68 - x, 0, x - rx - 0.68);
    const fy = Math.max(ry + 0.15 - y, 0, y - ry - 1.1);
    return Math.min(Math.hypot(dx, dy), Math.hypot(fx, fy)) - r;
  }

  const at = (x, y, z = 0) => ({ x, y, z });
  function burstAt(x, y, colors, n = 24, s = 3) {
    ctx.emit(colors, at(x, y), n, { speed: s, up: s, gravity: 0, life: 0.7, size: 0.26 });
    ctx.emit(colors, at(x, y), n, { speed: s, up: -s, gravity: 0, life: 0.7, size: 0.26 });
  }

  function hurt(e) {
    if (inv > 0 || phase !== 'fly') return;
    if (!GOD) lives--;
    ctx.setLives(lives);
    combo = 0;
    ctx.shake(0.7);
    burstAt(rx, ry + 2, ['#ffffff', '#ff3b5c', '#9aa0a8', '#ffb020'], 18);
    if (e) {
      burstAt(e.x, e.y, ['#9aa0a8', '#d9d9e3', '#ffb020'], 14);
      const i = ents.indexOf(e);
      if (i >= 0) drop(i);
    }
    if (lives <= 0) return die();
    inv = 2.2;
    spd *= 0.45;
    ctx.toast(['OUCH!', 'HULL HIT!', 'BONK!', 'THAT LEFT A DENT'][(R() * 4) | 0]);
  }
  function die() {
    phase = 'dead';
    phaseT = 0;
    rocket.visible = false;
    ctx.shake(1.2);
    burstAt(rx, ry + 2, [...FIRE, '#ffffff', '#ff3b5c'], 50, 5);
    ctx.toast('KABOOM');
  }
  function nearMiss() {
    combo = comboT > 0 ? Math.min(combo + 1, 5) : 1;
    comboT = 3;
    ctx.addScore(40 * combo, combo > 1 ? `CLOSE CALL x${combo}` : 'CLOSE CALL');
  }
  function collect(e, i) {
    const p = e.K.pick;
    if (p === 'star') {
      ctx.addScore(20);
      ctx.emit(['#ffd23f', '#fff7c2'], at(e.x, e.y), 8, { speed: 2, up: 2, gravity: 0, life: 0.4, size: 0.14 });
      const c = chains.get(e.chain);
      if (c) {
        c.got++;
        if (c.got === c.left) ctx.addScore(100, 'STAR CHAIN');
      }
    } else if (p === 'fuel') {
      ctx.addScore(150, 'FUEL CELL');
      ctx.emit(['#15c2b0', '#ffffff', '#ffe14d'], at(e.x, e.y), 14, { speed: 2.5, up: 2.5, gravity: 0, life: 0.5, size: 0.16 });
    } else if (p === 'heart') {
      if (lives < 3) {
        lives++;
        ctx.setLives(lives);
        ctx.toast('HULL REPAIRED');
      } else ctx.addScore(300, 'SPARE PARTS');
      ctx.emit(['#ff3b5c', '#ffb3c0'], at(e.x, e.y), 16, { speed: 2.5, up: 2.5, gravity: 0, life: 0.5, size: 0.16 });
    }
    drop(i);
  }
  function explode(e, i) {
    const n = 10;
    const a0 = R() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const m = shardMeshes.find((s) => !s.visible);
      if (!m) break;
      const a = a0 + (k / n) * Math.PI * 2;
      m.visible = true;
      m.position.set(e.x, e.y, 0);
      shards.push({ m, x: e.x, y: e.y, vx: Math.cos(a) * 4.6 + e.vx, vy: Math.sin(a) * 4.6, life: 1.25 });
    }
    burstAt(e.x, e.y, [...FIRE, '#ffffff'], 30, 4);
    ctx.shake(Math.abs(e.y - ry) < 10 ? 0.45 : 0.15);
    if (pointGap(e.x, e.y, 1.4) < 0) hurt(null);
    drop(i);
  }

  // ---------- Input ----------
  function readInput(input, dt) {
    const P = input.pressed;
    // Swipes and taps only arrive as one-shot presses (held keys/buttons also set the flag).
    if (P.has('left') && !input.left) (nudge = 0.24), (nudgeDir = -1);
    if (P.has('right') && !input.right) (nudge = 0.24), (nudgeDir = 1);
    if (P.has('action') && !input.action) pulse = 0.35;
    if (P.has('up') && !input.up) burst = 1.2;
    if (P.has('down') && !input.down) burst = 0;
    pulse = Math.max(0, pulse - dt);
    burst = Math.max(0, burst - dt);
    nudge = Math.max(0, nudge - dt);
    steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (!steer && nudge > 0) steer = nudgeDir;
    thrust = input.up || input.action || pulse > 0 || burst > 0;
  }

  // ---------- Phases ----------
  function updatePad(dt) {
    const before = Math.floor(phaseT);
    phaseT += dt;
    const now = Math.floor(phaseT);
    if (now !== before || phaseT === dt) {
      if (now < 3) ctx.toast(String(3 - now));
    }
    if (R() < 0.5) ctx.emit(SMOKE, at(rx + (R() - 0.5) * 1.6, 0.5, (R() - 0.5) * 1.6), 1, { speed: 1.5, up: 0.6, gravity: -0.5, life: 1.2, size: 0.4 });
    flame.visible = phaseT > 2.2;
    if (phaseT >= 3) {
      phase = 'fly';
      ctx.toast('LIFTOFF!');
      ctx.shake(0.4);
      ctx.emit(SMOKE, at(rx, 0.5), 40, { speed: 4, up: 1, gravity: 0, life: 1.4, size: 0.5 });
    }
  }

  function updateFly(dt) {
    const p = prog();
    const target = cruise(p) * (thrust ? BOOST : 1);
    spd += (target - spd) * Math.min(1, dt * (spd < 2 ? 1.2 : 2.5));
    ry += spd * dt;
    vx += clamp(steer * 8.5 - vx, -40 * dt, 40 * dt);
    rx += vx * dt;
    if (Math.abs(rx) > FIELD) {
      rx = Math.sign(rx) * FIELD;
      vx = 0;
    }
    inv = Math.max(0, inv - dt);
    comboT = Math.max(0, comboT - dt);
    ctx.addScore(spd * dt * (thrust ? 2 : 1) * 0.5);

    while (zoneIdx < ZONES.length && p >= ZONES[zoneIdx][0]) {
      const [, label, pts] = ZONES[zoneIdx++];
      if (pts) ctx.addScore(pts, label);
      else ctx.toast(label);
    }
    while (nextY < ry + 70) spawnRow();

    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i];
      if (e.y + e.K.top < ry - 20 || Math.abs(e.x) > 40) {
        drop(i);
        continue;
      }
      if (e.K.pick) {
        if (shipGap(e) < 0.3) collect(e, i);
        continue;
      }
      if (e.K.boom) {
        if (!e.armed && e.y - (ry + 4) < 10) {
          e.armed = true;
          e.t = 0.75;
        }
        if (e.armed && (e.t -= dt) <= 0) {
          explode(e, i);
          continue;
        }
      }
      const gap = shipGap(e);
      if (gap < 0) {
        hurt(e);
        if (phase !== 'fly') return;
        continue;
      }
      if (e.y + e.K.bot < ry + 4 && e.y + e.K.top > ry) e.near = Math.min(e.near, gap);
      if (!e.passed && e.y + e.K.top < ry + 0.2) {
        e.passed = true;
        if (e.near < NEAR && inv <= 0) nearMiss();
      }
    }
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      if (s.life <= 0) continue;
      if (pointGap(s.x, s.y, 0.16) < 0) {
        s.life = 0;
        hurt(null);
        if (phase !== 'fly') return;
      }
    }

    if ((meterT -= dt) <= 0) {
      meterT = 0.12;
      ctx.setMeter(p, `${fmt(kmLeft())} km to the Moon`);
    }
    if (p >= 1) startFlip();
  }

  function startFlip() {
    phase = 'flip';
    phaseT = 0;
    ctx.setMeter(1, 'Flip and burn');
    ctx.toast('FLIP AND BURN!');
  }
  function updateFlip(dt) {
    phaseT += dt;
    const k = clamp(phaseT / 2.2, 0, 1);
    roll = Math.PI * k * k * (3 - 2 * k);
    spd += (3 - spd) * Math.min(1, dt * 1.2);
    ry += spd * dt;
    inv = 0;
    if (phaseT > 2.9) startLanding();
  }

  function startLanding(retry = false) {
    clearAll();
    phase = 'land';
    phaseT = 0;
    roll = 0;
    alt = 42;
    lvy = -7.5;
    lvx = 0;
    rx = (R() < 0.5 ? -1 : 1) * (3 + R() * 3.5);
    tilt = 0;
    legK = 0;
    warned = false;
    setLegs(legs, 0);
    rocket.visible = true;
    ctx.sun.castShadow = true;
    // Start the landing camera where the flip left it: rocket centred.
    camTgt.set(rx, LAND_Y + alt + 2, 0);
    camPos.set(rx, LAND_Y + alt + 2, 26);
    ctx.toast(retry ? 'ONE MORE TRY' : 'LAND ON THE PAD');
    ctx.emit(['#ffffff', '#9fe6ff'], at(rx, LAND_Y + alt + 2), 30, { speed: 6, up: 3, gravity: 0, life: 0.5, size: 0.3 });
  }

  function updateLand(dt) {
    phaseT += dt;
    lvy += (-GRAV + (thrust ? THRUST : 0)) * dt;
    lvx += steer * 6 * dt;
    lvx *= Math.exp(-dt * 0.9);
    lvx = clamp(lvx, -4.5, 4.5);
    tilt += (steer * 0.27 - tilt) * Math.min(1, dt * 6);
    alt += lvy * dt;
    rx = clamp(rx + lvx * dt, -16, 16);
    if (alt < 17) {
      if (legK === 0) ctx.toast('LEGS OUT');
      legK = Math.min(1, legK + dt * 1.6);
      setLegs(legs, legK);
    }
    if (!warned && alt < 14 && -lvy > SAFE_V * 1.8) {
      warned = true;
      ctx.toast('TOO FAST! THRUST!');
    }
    if (thrust && alt < 6) ctx.emit(DUST, at(rx + (R() - 0.5) * 2, LAND_Y, (R() - 0.5) * 2), 2, { speed: 4, up: 1, gravity: 0, life: 0.6, size: 0.3 });
    const dx = Math.abs(rx);
    const onPad = dx <= PAD_HW;
    const ground = onPad ? 0 : -0.3;
    if ((meterT -= dt) <= 0) {
      meterT = 0.1;
      const v = Math.max(0, -lvy);
      const tiltDeg = Math.abs(tilt) * 57.3;
      const status = v > SAFE_V ? 'FAST' : tiltDeg > MAX_TILT ? 'LEVEL' : 'OK';
      ctx.setMeter(clamp(alt / 42, 0, 1), `ALT ${Math.max(0, alt).toFixed(0)}  ${v.toFixed(1)} m/s  ${status}`);
    }
    if (alt <= ground) touchdown(onPad, dx, ground);
  }

  function touchdown(onPad, dx, ground) {
    const v = -lvy;
    const tiltDeg = Math.abs(tilt) * 57.3;
    alt = ground;
    if (v > SAFE_V || tiltDeg > MAX_TILT) return crash(v, tiltDeg > MAX_TILT && v <= SAFE_V);
    phase = 'landed';
    phaseT = 0;
    flame.visible = false;
    ctx.shake(0.2);
    ctx.emit(DUST, at(rx, LAND_Y + ground), 40, { speed: 4, up: 0.8, gravity: 0, life: 1, size: 0.35 });
    const soft = Math.round(2500 * clamp(1 - (v - 0.6) / (SAFE_V - 0.6), 0, 1));
    const level = Math.round(1500 * clamp(1 - tiltDeg / MAX_TILT, 0, 1));
    const centre = onPad ? Math.round(2500 * clamp(1 - dx / PAD_HW, 0, 1)) : 0;
    const base = onPad ? 3000 : 1000;
    const crewBonus = lives * 1000;
    ctx.toast(onPad ? 'TOUCHDOWN!' : 'TOUCHDOWN (OFF THE PAD)');
    later(1.1, () => ctx.addScore(base + soft + level, v < 1.5 ? 'BUTTER SMOOTH' : 'SOFT LANDING'));
    if (onPad) later(2.2, () => ctx.addScore(centre, dx < 0.5 ? 'BULLSEYE' : 'ON THE PAD'));
    later(onPad ? 3.3 : 2.2, () => ctx.addScore(crewBonus, 'CREW BONUS'));
    const msg = onPad
      ? `Touchdown! ${v.toFixed(1)} m/s, ${tiltDeg.toFixed(0)}° tilt, ${dx.toFixed(1)} m from centre. Basil and Lichen are on the Moon.`
      : `Touchdown, just off the pad (${v.toFixed(1)} m/s). Basil and Lichen are walking the rest of the way.`;
    later(onPad ? 5 : 4, () => ctx.end(msg));
  }

  function crash(v, tipped) {
    phase = 'crash';
    phaseT = 0;
    rocket.visible = false;
    flame.visible = false;
    lives--;
    ctx.setLives(lives);
    ctx.shake(1.2);
    burstAt(rx, LAND_Y + 1.5, [...FIRE, '#ffffff', '#ff3b5c'], 50, 5);
    ctx.emit(DUST, at(rx, LAND_Y), 40, { speed: 5, up: 2, gravity: 2, life: 1.2, size: 0.4 });
    ctx.toast(tipped ? 'TIPPED OVER!' : 'TOO FAST!');
    if (lives > 0) later(2.4, () => startLanding(true));
    else later(2.2, () => ctx.end(tipped ? 'Tipped over on the Moon. Land it level next time.' : `Hit the Moon at ${v.toFixed(1)} m/s. So close! Touch down under ${SAFE_V} m/s.`));
  }

  // ---------- Camera ----------
  const UP = new THREE.Vector3(0, 1, 0);
  const camPos = new THREE.Vector3();
  const camTgt = new THREE.Vector3();
  const wantPos = new THREE.Vector3();
  const wantTgt = new THREE.Vector3();
  const tmpM = new THREE.Matrix4();
  const tanHalf = () => Math.tan((ctx.camera.fov * Math.PI) / 360);
  function flyView(out, tgt, look = 1, pitch = 0.3) {
    const t = tanHalf();
    const asp = ctx.camera.aspect;
    const dist = Math.max(7.2 / (t * asp), 10.5 / t);
    tgt.set(camX, ry + 2 + dist * t * 0.4 * look, 0);
    out.set(camX, tgt.y - Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    if (out.y < 3) out.y = 3;
  }
  function landView(out, tgt) {
    const t = tanHalf();
    const asp = ctx.camera.aspect;
    const a = Math.max(0, alt);
    const spanX = Math.abs(rx) / 2 + 4.5;
    const spanY = a / 2 + 4.2;
    const dist = Math.max(spanX / (t * asp), spanY / t, 11);
    tgt.set(rx / 2, LAND_Y + a / 2 + 1.6, 0);
    out.set(tgt.x, tgt.y + Math.sin(0.2) * dist, Math.cos(0.2) * dist);
  }
  function applyCamera() {
    const cam = ctx.camera;
    cam.position.copy(camPos);
    cam.up.set(-Math.sin(roll), Math.cos(roll), 0);
    cam.lookAt(camTgt);
    // Background follows the un-rolled camera, so the roll shows on the stars.
    tmpM.lookAt(camPos, camTgt, UP);
    bg.position.copy(camPos);
    bg.quaternion.setFromRotationMatrix(tmpM);
  }
  function updateCamera(dt) {
    camX += (rx * 0.3 - camX) * Math.min(1, dt * 4);
    if (phase === 'pad' || phase === 'fly' || phase === 'dead') {
      flyView(camPos, camTgt);
    } else if (phase === 'flip') {
      const k = clamp(phaseT / 1.2, 0, 1);
      flyView(camPos, camTgt, 1 - k, 0.3 * (1 - k));
    } else {
      landView(wantPos, wantTgt);
      const k = 1 - Math.exp(-dt * (phase === 'land' ? 2.5 : 1.5));
      camPos.lerp(wantPos, k);
      camTgt.lerp(wantTgt, k);
      if (phase === 'landed') {
        // Ease in on the crew.
        wantTgt.set(rx, LAND_Y + 1.6, 0);
        wantPos.set(rx, LAND_Y + 4, 13);
        camPos.lerp(wantPos, k * Math.min(1, phaseT / 2));
        camTgt.lerp(wantTgt, k * Math.min(1, phaseT / 2));
      }
    }
    applyCamera();
    ctx.followSun(ship.position);
  }

  // ---------- Background ----------
  const tmpC = new THREE.Color();
  function updateBackground(dt) {
    const landing = phase === 'land' || phase === 'landed' || phase === 'crash';
    const sky = landing ? 1 : clamp((ry - 20) / 260, 0, 1);
    scene.background.copy(SKY).lerp(SPACE, sky);
    fill.intensity = sky * 1.1;
    amb.intensity = sky * 0.35;
    site.visible = !landing && ry < 160;
    clouds.visible = !landing && ry < 420;
    moonSet.root.visible = landing;
    if (!landing && ctx.sun.castShadow !== ry < 140) ctx.sun.castShadow = ry < 140;
    const t = tanHalf();
    const asp = ctx.camera.aspect;
    const diag = Math.sqrt(1 + asp * asp);
    scroll += (phase === 'title' ? 0.5 : landing ? 0 : spd) * dt;
    layers.forEach((l, li) => {
      l.mat.opacity = li === 2 ? sky * (landing ? 0 : 0.7) : sky;
      for (let i = 0; i < l.seeds.length; i++) {
        const s = l.seeds[i];
        let v = s.v - scroll * l.speed * s.k;
        v = ((((v + 1) % 2) + 2) % 2) - 1;
        const half = s.d * t * diag;
        l.pos[i * 3] = s.u * half;
        l.pos[i * 3 + 1] = v * half;
        l.pos[i * 3 + 2] = -s.d;
      }
      l.geo.attributes.position.needsUpdate = true;
    });
    // Earth below on the way out; the Moon grows ahead.
    const place = (o, u, v, d, s) => {
      o.position.set(u * d * t * asp, v * d * t, -d);
      o.scale.setScalar(s);
    };
    const p = prog();
    if (landing) {
      earth.visible = true;
      moonBall.visible = false;
      place(earth, 0.55, 0.62, 170, 0.45);
    } else {
      earth.visible = ry > 200 && p < 0.2;
      if (earth.visible) place(earth, -0.1, -1.12 - Math.max(0, p - 0.03) * 3.5, 150, 3);
      moonBall.visible = sky > 0.2;
      const a = clamp((p - 0.85) / 0.15, 0, 1);
      const e = a * a;
      place(moonBall, lerp(0.55, 0, e), lerp(0.6, 0.95, e), 160, lerp(1 + p * 0.8, 6.5, e));
    }
    earth.rotation.y += dt * 0.05;
    moonBall.rotation.y += dt * 0.02;
  }

  // ---------- Animation (runs on the title/game-over screens too) ----------
  function animate(dt, t) {
    elapsed += dt;
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].at <= elapsed) queue.splice(i, 1)[0].fn();
    }
    for (const e of ents) {
      if (e.wait) {
        if (e.y - (ry + 2) < e.wait && phase === 'fly') e.wait = 0;
      } else {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      }
      e.m.root.position.set(e.x, e.y, 0);
      const sp = e.m.spin;
      if (sp) {
        if (e.K.wobble) {
          sp.rotation.x = Math.sin(t * 0.8 + e.ph) * 0.35 * e.K.wobble;
          sp.rotation.z = Math.sin(t * 0.6 + e.ph) * 0.08 * e.K.wobble;
        } else if (e.K.pick) {
          sp.rotation.y += dt * 2.5;
          sp.position.y = Math.sin(t * 3 + e.ph) * 0.12;
        } else {
          sp.rotation.x += e.sx * dt;
          sp.rotation.y += e.sy * dt;
          sp.rotation.z += e.sz * dt;
        }
      }
      if (e.m.light) {
        const rate = e.armed ? 14 : e.K.boom ? 3 : 1.2;
        e.m.light.visible = Math.sin(t * rate * Math.PI + e.ph) > 0;
        if (e.armed) e.m.root.position.x += (R() - 0.5) * 0.12;
      }
      if (e.m.wings) e.m.wings.forEach((w) => (w.rotation.x = Math.sin(t * 11 + e.ph) * 0.6 * w.userData.s));
      if (e.kind === 'comet' && !e.wait && R() < 0.8)
        ctx.emit(['#dff6ff', '#9fe6ff', '#ffffff'], at(e.x, e.y), 1, { speed: 0.3, up: 0.3, gravity: 0, life: 0.8, size: 0.3 });
      if (e.kind === 'broken' && R() < 0.04) ctx.emit(['#ffe14d', '#ffffff'], at(e.x - 0.8, e.y), 3, { speed: 1.5, up: 1, gravity: 0, life: 0.3, size: 0.08 });
    }
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.m.position.set(s.x, s.y, 0);
      s.m.rotation.x += dt * 9;
      s.m.rotation.y += dt * 7;
      const k = clamp(s.life / 0.3, 0, 1);
      s.m.scale.setScalar(0.26 * k + 0.01);
      if (s.life <= 0) {
        s.m.visible = false;
        shards.splice(i, 1);
      }
    }
    moonSet.lights.forEach((l, i) => (l.visible = Math.sin(t * 4 + i * 1.6) > -0.3));

    // Ship pose
    const flying = phase === 'fly' || phase === 'pad' || phase === 'flip';
    if (flying) {
      const off = phase === 'flip' ? 2 : 0;
      ship.position.set(rx + off * Math.sin(roll), ry + off - off * Math.cos(roll), 0);
      ship.rotation.z = phase === 'flip' ? roll : -vx * 0.035;
      rocket.visible = inv <= 0 || Math.floor(inv * 12) % 2 === 0;
    } else if (phase === 'land' || phase === 'landed') {
      ship.position.set(rx, LAND_Y + alt, 0);
      ship.rotation.z = phase === 'landed' ? tilt * Math.max(0, 1 - phaseT * 3) : -tilt;
    }
    const burning = (phase === 'fly' || (phase === 'pad' && phaseT > 2.2) || (phase === 'flip' && phaseT > 1.4) || (phase === 'land' && thrust)) && rocket.visible;
    flame.visible = burning;
    if (burning) {
      const big = phase === 'fly' ? (thrust ? 1.7 : 1) : 1.3;
      flame.scale.set(1, big * (0.8 + R() * 0.4), 1);
      // Engine sits 0.9 below the ship origin, rotated with the flip.
      const r = phase === 'flip' ? roll : 0;
      const dir = Math.cos(r);
      const bx = ship.position.x + 0.9 * Math.sin(r);
      const by = ship.position.y - 0.9 * dir;
      ctx.emit(FIRE, at(bx + (R() - 0.5) * 0.3, by), thrust ? 2 : 1, { speed: 0.5, up: -3.5 * dir, gravity: 0, life: 0.35, size: 0.24 });
    }

    // Landing set details
    marker.visible = phase === 'land';
    marker.position.set(rx, Math.abs(rx) < 2.6 ? 0.3 : 0, 0);
    if (phase === 'landed') {
      phaseT += dt;
      const show = phaseT > 1.2;
      crew.forEach((c, i) => {
        c.root.visible = show;
        const hop = Math.abs(Math.sin(t * 5 + i * 1.3)) * 0.35;
        const cx = rx + (i ? 1.5 : -1.5);
        c.root.position.set(cx, LAND_Y + (Math.abs(cx) < 2.5 ? 0 : -0.3) + hop, 0.9);
        c.armL.rotation.z = Math.sin(t * 8 + i) * 0.8 - 0.6;
        c.armR.rotation.z = -Math.sin(t * 8 + i) * 0.8 + 0.6;
      });
      flag.visible = phaseT > 1.8;
      flag.position.set(rx + 3, LAND_Y - 0.3, -0.6);
      if (phaseT > 1 && R() < 0.25) ctx.emit(['#ffd23f', '#ff4d8d', '#15c2b0', '#7b61ff', '#ffffff'], at(rx + (R() - 0.5) * 4, LAND_Y + 5), 3, { speed: 2, up: 2, gravity: 3, life: 1.5, size: 0.14 });
    }
    if (phase === 'crash' || phase === 'dead') phaseT += dt;
    if (phase === 'dead' && phaseT > 1.8 && phaseT - dt <= 1.8) ctx.end(`Lost in space, ${fmt(kmLeft())} km short of the Moon.`);
  }

  // ---------- Reset ----------
  function reset() {
    clearAll();
    elapsed = 0;
    lives = 3;
    ctx.setLives(3);
    inv = 0;
    vx = 0;
    rx = 0;
    combo = 0;
    comboT = 0;
    roll = 0;
    camX = 0;
    pulse = burst = nudge = 0;
    zoneIdx = 0;
    heartY = 0;
    chains.clear();
    meterT = 0;
    tilt = 0;
    rocket.visible = true;
    ship.rotation.set(0, 0, 0);
    setLegs(legs, 0);
    crew.forEach((c) => (c.root.visible = false));
    flag.visible = false;
    ctx.sun.castShadow = true;
    if (SKIP >= 0.999) {
      ry = L;
      bundlesY = Infinity;
      ctx.setMeter(1, 'Landing');
      startLanding();
      return;
    }
    ry = SKIP > 0 ? SKIP * L : 0.4;
    bundlesY = Math.max(ry, L * 0.05) + 300;
    heartY = ry;
    nextY = SKIP > 0 ? ry + 18 : 40;
    zoneIdx = ZONES.findIndex((z) => z[0] > prog());
    if (zoneIdx < 0) zoneIdx = ZONES.length;
    phase = SKIP > 0 ? 'fly' : 'pad';
    phaseT = 0;
    spd = SKIP > 0 ? cruise(SKIP) : 0;
    ctx.setMeter(prog(), `${fmt(kmLeft())} km to the Moon`);
  }

  // Title screen: rocket waiting on the pad.
  ship.position.set(0, 0.4, 0);
  setLegs(legs, 0);
  flame.visible = false;

  return {
    reset,
    // Read-only peek for ?debug tooling (window.__arcade.inst.debug()) and tests.
    debug: () => ({ phase, p: prog(), rx, ry, spd, alt, lvx, lvy, tilt, lives, inv, ents, shards, FIELD, PAD_HW, SAFE_V }),
    update(dt, input, t) {
      readInput(input, dt);
      if (phase === 'pad') updatePad(dt);
      else if (phase === 'fly') updateFly(dt);
      else if (phase === 'flip') updateFlip(dt);
      else if (phase === 'land') updateLand(dt);
      animate(dt, t);
      updateCamera(dt);
      updateBackground(dt);
    },
    idle(dt, t) {
      animate(dt, t);
      if (phase === 'title') {
        // Rocket off to the side of the title card on wide screens.
        const a = Math.sin(t * 0.15) * 0.4;
        const half = 16 * tanHalf() * ctx.camera.aspect;
        const off = ctx.camera.aspect > 1 ? Math.min(half * 0.52, 7) : 0;
        camTgt.set(-off, 3.2, 0);
        camPos.set(-off + Math.sin(a) * 16, 3.6, Math.cos(a) * 16);
        applyCamera();
        ctx.followSun(ship.position);
      }
      updateBackground(dt);
    },
  };
}
