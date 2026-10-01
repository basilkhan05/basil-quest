// Powder Day: Basil snowboards down an endless, sponsored terrain park.
// Carve around ski-school kids, pines, rocks and snowmen, spin off kickers, slide the
// SIMPLE BUNDLES fun box, and stay ahead of the avalanche rolling down behind you.
//
// World: +x right, -z downhill. Ground is y = 0 apart from kickers and fun boxes.
// Debug (with ?debug): &sbbot plays itself, &sbsim=60 fast-forwards 60 s on start,
// &sbgap=8 starts with the avalanche 8 m behind.
import {
  BRAND, makeArch, makeAvalanche, makeBackdrop, makeBanner, makeChunk, makeCoach, makeFunbox,
  makeKicker, makeKid, makePineObstacle, makeRockObstacle, makeSnowman,
} from './snowboard-models.js';

const HALF = 7.2; // rideable half-width (the race fence is at 7.75)
const G = 24; // gravity
const OLLIE = 7.2;
const SPIN_START = 6; // rad/s when a spin begins
const SPIN_ACC = 30;
const SPIN_MAX = 12.5; // ~720 deg/s
const LAND_TOL = 0.45; // rad off a clean 180 multiple before it's a wipeout
const CH = 20; // scenery chunk length
const NCH = 9;
const MAX_GAP = 40; // avalanche can't fall further behind than this
const SPIN_PTS = [0, 75, 200, 400, 650, 950, 1300, 1700, 2200, 2800];
const COMBO_MAX = 3;
const DIST_PTS = 2; // points per metre
const BANNER_GAP = 22;
const ARCH_GAP = 500;

// Collision shapes (radius on the ground plane, height you need to clear).
const SHAPE = {
  pine: { r: 0.5, h: 2.3 },
  rock: { r: 0.45, h: 0.62 },
  snowman: { r: 0.48, h: 1.9 },
  kid: { r: 0.3, h: 0.92 },
  coach: { r: 0.36, h: 1.45 },
};

export default function create(ctx) {
  const { THREE, scene, models, clamp, lerp } = ctx;
  scene.background = new THREE.Color('#8fd3ff');
  scene.fog = new THREE.Fog('#e3f1ff', 55, 135);

  const params = new URLSearchParams(location.search);
  const DEBUG = params.has('debug');
  const BOT = DEBUG && params.has('sbbot');
  const SIM = DEBUG ? Number(params.get('sbsim')) || 0 : 0;
  const START_GAP = DEBUG && params.get('sbgap') ? Number(params.get('sbgap')) : 11;

  // ---------- Scenery ----------
  const backdrop = makeBackdrop();
  scene.add(backdrop);
  const chunks = [];
  for (let i = 0; i < NCH; i++) {
    const c = makeChunk(CH);
    scene.add(c);
    chunks.push(c);
  }
  const banners = [];
  for (let i = 0; i < 8; i++) {
    const g = makeBanner(i);
    scene.add(g);
    banners.push({ g, z: 0 });
  }
  const arches = [
    makeArch([{ text: 'FRESHLY COMMERCE', size: 30 }, { text: 'POWDER DAY', size: 20 }]),
    makeArch([{ text: 'SIMPLE BUNDLES', size: 30 }, { text: 'CHECKPOINT', size: 18 }], BRAND.teal, BRAND.black),
    makeArch([{ text: 'SIMPLE DISCOUNTS', size: 30 }, { text: 'CHECKPOINT', size: 18 }], BRAND.purple, '#ffffff'),
    makeArch([{ text: 'FRESHLY COMMERCE', size: 30 }, { text: 'CHECKPOINT', size: 18 }], BRAND.pink, '#ffffff'),
  ].map((g) => {
    scene.add(g);
    return { g, z: 0, on: false, counted: false };
  });
  const av = makeAvalanche();
  scene.add(av.group);

  // ---------- Basil ----------
  const rig = new THREE.Group(); // position + carve heading
  const tilt = new THREE.Group(); // lean / tumble
  const spinG = new THREE.Group(); // stance + spin
  rig.add(tilt);
  tilt.add(spinG);
  scene.add(rig);
  const board = models.makeSnowboard();
  spinG.add(board);
  const player = models.makePlayer();
  player.gear.beanie.visible = true;
  player.root.position.y = 0.08;
  player.root.rotation.y = 0.7;
  spinG.add(player.root);

  // ---------- Obstacle pools ----------
  const pools = {};
  const active = [];
  function addPool(kind, n, make) {
    pools[kind] = [];
    for (let i = 0; i < n; i++) {
      const m = make(i);
      const o = { kind, g: m.g || m, data: m.g ? m : null, active: false, ...(SHAPE[kind] || { r: 0, h: 0 }) };
      o.g.visible = false;
      scene.add(o.g);
      pools[kind].push(o);
    }
  }
  addPool('pine', 26, makePineObstacle);
  addPool('rock', 14, makeRockObstacle);
  addPool('snowman', 10, makeSnowman);
  addPool('kid', 18, makeKid);
  addPool('coach', 4, makeCoach);
  addPool('kicker', 4, () => makeKicker(false));
  addPool('bigkicker', 3, () => makeKicker(true));
  addPool('funbox', 3, makeFunbox);
  const RAMPS = new Set(['kicker', 'bigkicker', 'funbox']);

  function spawn(kind, x, z, extra) {
    const o = pools[kind].find((p) => !p.active);
    if (!o) return null;
    Object.assign(o, { active: true, hit: false, passed: false, x, z, vx: 0, vz: 0, fall: 0, ph: Math.random() * 6 }, extra);
    o.g.visible = true;
    o.g.position.set(x, 0, z);
    o.g.rotation.set(0, 0, 0);
    active.push(o);
    return o;
  }
  function clearActive() {
    active.forEach((o) => {
      o.active = false;
      o.g.visible = false;
    });
    active.length = 0;
  }

  // ---------- Run state ----------
  const S = {};
  const v3 = { x: 0, y: 0, z: 0 };
  const at = (x, y, z) => ((v3.x = x), (v3.y = y), (v3.z = z), v3);
  const SNOWFX = ['#ffffff', '#e8f2ff', '#d6e6f8'];

  function resetWorld() {
    clearActive();
    Object.assign(S, {
      t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, v: 9, air: false, airT: 0,
      spin: 0, spinTarget: 0, spinVel: 0, spinDir: 0, spinArmed: false, stance: 0,
      grab: 0, grabTime: 0, crashT: 0, invuln: 0, ramp: null, entry: null, grind: null, grindT: 0, bailT: 0,
      nudgeT: 0, nudgeDir: 0, jumpBuf: 0, pop: false, tuck: false, combo: 1, lives: 3,
      dist: 0, score: 0, avZ: START_GAP, gap: START_GAP, dying: 0, dyingMsg: '', ended: false,
      squash: 0, lastToast: -9, camX: 0, camY: 0, nextRow: -60, nextBanner: -16, nextArch: -ARCH_GAP,
      archIdx: 1, minGap: 99, idleRise: 0, hinted: false, meterKey: '', started: false, botSpin: 0, trickCount: 0, hits: 0, wipeouts: 0,
    });
    chunks.forEach((c, i) => {
      c.position.set(0, 0, 20 - i * CH);
      c.scale.x = i % 2 ? -1 : 1;
    });
    banners.forEach((b) => (b.z = 99));
    placeBanners();
    arches.forEach((a) => {
      a.on = false;
      a.g.visible = false;
    });
    const a0 = arches[0];
    Object.assign(a0, { on: true, z: -10, counted: true });
    a0.g.position.set(0, 0, -10);
    a0.g.visible = true;
    // A friendly first kicker so everyone gets to try a spin.
    spawn('kicker', 0, -38);
    rig.visible = true;
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    tilt.rotation.set(0, 0, 0);
    tilt.position.set(0, 0, 0);
    spinG.rotation.set(0, 0, 0);
    av.group.position.set(0, 0, S.avZ);
    backdrop.position.set(0, 0, -175);
    spawnAhead();
  }

  // ---------- Course generation ----------
  const rx = (w = 13.6) => (Math.random() - 0.5) * w;
  const vtAt = (t) => 12 + 18 * (1 - Math.exp(-t / 90));

  function spawnLine(z, count, kinds) {
    const free = rx(10);
    const xs = [];
    for (let tries = 0; xs.length < count && tries < 40; tries++) {
      const x = rx();
      if (Math.abs(x - free) < 1.7 || xs.some((v) => Math.abs(v - x) < 1.4)) continue;
      xs.push(x);
    }
    xs.forEach((x) => spawn(kinds[(Math.random() * kinds.length) | 0], x, z + (Math.random() - 0.5) * 1.6));
  }

  function spawnRow() {
    const z = S.nextRow;
    const d = Math.min(1, -z / 3000);
    const vEst = vtAt(S.t) + 3;
    let adv = lerp(15, 7.5, d) + Math.random() * 5;
    const r = Math.random();
    if (r < 0.15) {
      const big = Math.random() < 0.4;
      const kx = rx(8);
      const o = spawn(big ? 'bigkicker' : 'kicker', kx, z);
      if (o) {
        const k = o.data;
        if (Math.random() < 0.45) {
          [-1, 1].forEach((sd) => {
            const px = kx + sd * (k.w / 2 + 1.5);
            if (Math.abs(px) < HALF) spawn('pine', px, z + 0.6);
          });
        }
        adv = k.len + vEst * (big ? 1.25 : 1.0) + 4;
      }
    } else if (r < 0.23) {
      const o = spawn('funbox', rx(9), z);
      if (o) adv = o.data.L + 9;
    } else if (r < 0.37) {
      // Ski school crossing: a coach (sometimes) and a train of kids.
      const dir = Math.random() < 0.5 ? -1 : 1;
      const n = 2 + ((Math.random() * (2 + d * 2)) | 0);
      const sp = lerp(1.1, 2.0, d) + Math.random() * 0.4;
      let x = rx(9);
      const vz = -0.5 - Math.random() * 0.5;
      if (Math.random() < 0.6) {
        spawn('coach', x, z, { vx: dir * sp, vz });
        x -= dir * 1.2;
      }
      for (let i = 0; i < n; i++) {
        spawn('kid', clamp(x, -HALF, HALF), z + (Math.random() - 0.5) * 0.6, { vx: dir * sp, vz });
        x -= dir * 1.05;
      }
    } else if (r < 0.46) {
      const sd = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0; i < 3; i++) spawn('pine', sd * (i % 2 ? -1 : 1) * (2 + Math.random() * 2.5), z - i * 7);
      adv += 14;
    } else if (r < 0.56) {
      spawnLine(z, 3 + ((Math.random() * 2) | 0), ['rock']);
    } else if (r < 0.64) {
      spawnLine(z, 2 + ((Math.random() * 2) | 0), ['snowman']);
    } else {
      const count = 1 + ((Math.random() * (1.4 + d * 2.6)) | 0);
      spawnLine(z, count, ['pine', 'pine', 'rock', 'snowman', 'snowman']);
    }
    S.nextRow -= adv;
  }
  function spawnAhead() {
    while (S.nextRow > S.z - 125) spawnRow();
  }

  function placeBanners() {
    for (const b of banners) {
      if (b.z < S.z + 22) continue;
      const sd = Math.round(-S.nextBanner / BANNER_GAP) % 2 ? 1 : -1;
      b.z = S.nextBanner;
      b.g.position.set(sd * 9.0, 0, b.z);
      b.g.rotation.y = -sd * 0.3;
      S.nextBanner -= BANNER_GAP;
    }
  }

  // ---------- Feedback helpers ----------
  function say(text, force = true) {
    if (!force && S.t - S.lastToast < 1.1) return;
    ctx.toast(text);
    S.lastToast = S.t;
  }
  function award(pts, text) {
    const n = Math.round(pts * S.combo);
    S.score += n;
    say(`${text} +${n.toLocaleString('en-CA')}${S.combo > 1 ? ` x${S.combo}` : ''}`);
    return n;
  }

  // ---------- Physics helpers ----------
  // Highest ride-able surface under (x, z): kicker ramps, fun box ramp and deck.
  const surf = { y: 0, ramp: null, entry: null, box: null };
  function surface(x, z, yNow) {
    surf.y = 0;
    surf.ramp = surf.entry = surf.box = null;
    for (const o of active) {
      if (!RAMPS.has(o.kind) || Math.abs(o.z - z) > 6) continue;
      const k = o.data;
      if (o.kind === 'funbox') {
        if (Math.abs(x - o.x) > 0.55) continue;
        const top = o.z + k.L / 2;
        const deck = top - k.ramp;
        if (z <= top && z > deck) {
          const ry = (k.H * (top - z)) / k.ramp;
          if (ry > surf.y) {
            surf.y = ry;
            surf.entry = o;
          }
        } else if (z <= deck && z >= o.z - k.L / 2 && yNow >= k.H - 0.3) {
          surf.y = k.H + 0.01;
          surf.box = o;
        }
      } else if (Math.abs(x - o.x) < k.w / 2) {
        const top = o.z + k.len / 2;
        if (z <= top && z >= o.z - k.len / 2) {
          const ry = (k.h * (top - z)) / k.len;
          if (ry > surf.y) {
            surf.y = ry;
            surf.ramp = o;
          }
        }
      }
    }
    return surf;
  }

  function takeoff() {
    S.air = true;
    S.airT = 0;
    S.spin = S.spinTarget = S.spinVel = 0;
    S.spinDir = 0;
    S.spinArmed = false;
    S.grab = S.grabTime = 0;
    S.ramp = S.entry = null;
    S.jumpBuf = 0;
  }
  function ollie() {
    takeoff();
    S.vy = OLLIE;
    ctx.emit(SNOWFX, at(S.x, S.y + 0.1, S.z + 0.3), 6, { speed: 1.2, up: 1.5, life: 0.4, size: 0.12 });
  }
  function launch(o) {
    const pop = S.pop;
    takeoff();
    S.vy = (o.data.big ? 12.5 : 9.8) + (pop ? 2.2 : 0);
    S.v += 1;
    S.pop = false;
    if (pop) say('POP!', false);
    ctx.emit(SNOWFX, at(S.x, S.y, S.z), 14, { speed: 2, up: 3, life: 0.6, size: 0.16 });
  }
  function spinPress(dir) {
    if (S.crashT > 0) return;
    const rem = S.spinTarget - S.spin;
    if (S.spinDir && S.spinDir !== dir && Math.abs(rem) > 1e-3) return;
    if (Math.abs(rem) > 1.2) return;
    S.spinDir = dir;
    S.spinArmed = true;
    if (S.spinVel < SPIN_START) S.spinVel = SPIN_START;
    S.spinTarget += dir * Math.PI;
  }

  function startGrind(o) {
    S.grind = o;
    S.grindT = 0;
    S.bailT = 0;
    S.air = false;
    S.vy = 0;
    S.vx = 0;
    S.entry = null;
  }
  function endGrind() {
    if (S.grindT > 0.25) {
      award(Math.round(S.grindT * 100), 'BOARDSLIDE!');
      S.combo = Math.min(COMBO_MAX, S.combo + 1);
      S.trickCount++;
    }
    S.grind = null;
  }

  function wipeout(msg) {
    S.crashT = 0.75;
    S.invuln = Math.max(S.invuln, 1.2);
    S.v = Math.max(4, S.v * 0.35);
    S.vx *= 0.3;
    S.combo = 1;
    S.spin = S.spinTarget = 0;
    S.grind = null;
    S.wipeouts++;
    ctx.shake(0.45);
    ctx.emit(SNOWFX, at(S.x, S.y + 0.3, S.z), 26, { speed: 3, up: 3, life: 0.8, size: 0.18 });
    say(msg);
  }

  function land(s) {
    S.air = false;
    S.vy = 0;
    S.jumpBuf = 0;
    S.y = s.y;
    S.squash = 1;
    ctx.emit(SNOWFX, at(S.x, S.y + 0.05, S.z), 10, { speed: 2, up: 1.6, life: 0.45, size: 0.14 });
    if (S.crashT > 0) {
      S.spin = S.spinTarget = 0;
      return;
    }
    const k = Math.round(S.spin / Math.PI);
    if (Math.abs(S.spin - k * Math.PI) > LAND_TOL) {
      wipeout('SKETCHY! WIPEOUT');
      return;
    }
    S.stance = (S.stance + k * Math.PI) % (Math.PI * 2);
    S.spin = S.spinTarget = 0;
    const n = Math.abs(k);
    let pts = SPIN_PTS[Math.min(n, SPIN_PTS.length - 1)];
    let name = n ? `${n * 180}` : '';
    const grabbed = S.grabTime >= 0.25;
    if (grabbed) {
      pts += S.grabTime > 0.6 ? 125 : 75;
      name = name ? `${name} INDY` : 'INDY GRAB';
    }
    if (S.airT > 1.05) {
      pts += 50;
      if (!name) name = 'BIG AIR';
    }
    if (pts) {
      award(pts, `${name}!`);
      if (n || grabbed) {
        S.combo = Math.min(COMBO_MAX, S.combo + 1);
        S.trickCount++;
        S.v = Math.min(vtAt(S.t) + 7, S.v + 1 + n * 0.7);
      }
    }
    if (s.box) startGrind(s.box);
  }

  function hit(o) {
    o.hit = true;
    S.hits++;
    S.lives -= 1;
    ctx.setLives(S.lives);
    S.v = Math.max(5, S.v * 0.45);
    S.vx = -S.vx * 0.3 + (S.x < o.x ? -2 : 2);
    S.crashT = 0.7;
    S.invuln = 2.2;
    S.combo = 1;
    S.spin = S.spinTarget = 0;
    S.grind = null;
    ctx.shake(0.7);
    const p = at(o.x, 0.6, o.z);
    if (o.kind === 'kid' || o.kind === 'coach') {
      o.fall = 0.001;
      o.vx = o.vz = 0;
      ctx.emit(['#ff4d6d', '#ffd23f', '#2ec4ff', '#ffffff'], p, 18, { speed: 2.5, up: 3, life: 0.7, size: 0.14 });
      say(o.kind === 'kid' ? 'SORRY, KID!' : 'SORRY, COACH!');
    } else if (o.kind === 'snowman') {
      o.g.visible = false;
      ctx.emit(['#ffffff', '#ffffff', '#ff8a1f', '#111111', BRAND.pink, BRAND.teal], at(o.x, 1, o.z), 40, { speed: 3, up: 4, life: 0.9, size: 0.22 });
      say('SNOWMAN DOWN!');
    } else if (o.kind === 'pine') {
      ctx.emit(['#ffffff', '#ffffff', '#2f7d5b'], at(o.x, 1.8, o.z), 30, { speed: 2, up: 1, life: 1, size: 0.18 });
      say('TREE!');
    } else {
      ctx.emit(['#a3aec0', '#ffffff', '#d6d0e3'], p, 20, { speed: 2.5, up: 3, life: 0.6, size: 0.14 });
      say('ROCK!');
    }
    if (S.lives <= 0) die('Out of lives. Time for hot chocolate.');
  }

  function die(msg) {
    if (S.dying > 0) return;
    S.dying = 1.1;
    S.dyingMsg = msg;
  }

  // ---------- Per-step simulation ----------
  function step(dt, input) {
    S.t += dt;
    const vt = vtAt(S.t);
    const pressed = input.pressed;

    if (S.dying > 0) {
      S.dying -= dt;
      S.v = Math.max(0, S.v - 20 * dt);
      S.vx *= 0.9;
      if (S.dyingMsg.startsWith('Caught')) {
        S.avZ -= Math.max(14, vt) * dt;
        if (S.avZ < S.z + 1.5) rig.visible = false;
        if (Math.random() < 0.5) ctx.emit(SNOWFX, at(S.x + (Math.random() - 0.5) * 3, 0.6, S.z + 0.5), 4, { speed: 3, up: 4, life: 0.8, size: 0.26 });
        ctx.shake(0.25);
      }
      S.z -= S.v * dt;
      S.x += S.vx * dt;
      if (S.dying <= 0 && !S.ended) {
        S.ended = true;
        ctx.end(S.dyingMsg);
      }
      visuals(dt);
      return;
    }

    // ----- Input -----
    S.invuln = Math.max(0, S.invuln - dt);
    if (S.crashT > 0) S.crashT -= dt;
    const control = S.crashT <= 0;
    ['left', 'right'].forEach((k) => {
      if (!pressed.has(k) || !control) return;
      const d = k === 'left' ? -1 : 1;
      if (S.air) spinPress(d);
      else {
        S.nudgeDir = d;
        S.nudgeT = 0.24;
      }
    });
    S.nudgeT -= dt;
    let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (!dir && S.nudgeT > 0) dir = S.nudgeDir;
    if (!control) dir = 0;
    const jump = control && (pressed.has('up') || pressed.has('action'));
    S.jumpBuf = jump ? 0.14 : Math.max(0, S.jumpBuf - dt);

    // ----- Lateral + forward speed -----
    if (!S.air && !S.grind) {
      S.tuck = control && input.down;
      const lat = Math.min(9.5, 5 + S.v * 0.17) * (S.tuck ? 0.55 : 1);
      const acc = (dir ? 36 : 20) * dt;
      S.vx += clamp(dir * lat - S.vx, -acc, acc);
      if (!control) S.v = Math.max(3, S.v - 3 * dt);
      else {
        const tgt = vt + (S.tuck ? 2.5 : 0);
        S.v += S.v < tgt ? Math.min(tgt - S.v, (S.v < tgt * 0.8 ? 7 : 5) * dt) : -Math.min(S.v - tgt, 1.6 * dt);
      }
    } else if (S.air) {
      S.tuck = false;
      S.vx *= 1 - 0.4 * dt;
    }
    S.z -= S.v * dt;
    S.x += S.vx * dt;
    S.dist += S.v * dt;
    S.score += S.v * dt * DIST_PTS;
    if (Math.abs(S.x) > HALF) {
      S.x = Math.sign(S.x) * HALF;
      S.vx = 0;
      if (!S.air) {
        S.v = Math.max(5, S.v - 5 * dt);
        if (Math.random() < 0.5) ctx.emit(SNOWFX, at(S.x, 0.2, S.z), 2, { speed: 1.5, up: 2, life: 0.4 });
      }
    }

    // ----- Vertical: grind / ground / air -----
    if (S.grind) {
      const o = S.grind;
      const f = o.data;
      S.x += (o.x - S.x) * Math.min(1, dt * 14);
      S.y = f.H + 0.01;
      S.grindT += dt;
      S.bailT = dir ? S.bailT + dt : 0;
      if (Math.random() < 0.6) ctx.emit([BRAND.teal, '#ffffff', '#ffe14d'], at(S.x, S.y + 0.05, S.z + 0.4), 2, { speed: 1.2, up: 1.5, life: 0.35, size: 0.08 });
      if (S.jumpBuf > 0) {
        endGrind();
        ollie();
      } else if (S.bailT > 0.18) {
        endGrind();
        takeoff();
        S.vy = 3;
        S.vx = dir * 5;
      } else if (S.z < o.z - f.L / 2) {
        endGrind();
        takeoff();
        S.vy = 4.5;
      }
    } else if (!S.air) {
      const s = surface(S.x, S.z, S.y);
      if (S.ramp && s.ramp !== S.ramp) {
        // Rolled off a kicker: off the lip it launches, off the side it just drops.
        const o = S.ramp;
        if (S.z <= o.z - o.data.len / 2 + 0.05) launch(o);
        else {
          takeoff();
          S.vy = 0;
        }
      } else if (S.entry && !s.entry && !s.box) {
        takeoff();
        S.vy = 2;
      } else {
        S.ramp = s.ramp;
        S.entry = s.entry;
        S.y = s.y;
        if (s.box) startGrind(s.box);
        else if (S.jumpBuf > 0) {
          if (S.ramp) {
            S.pop = true;
            S.jumpBuf = 0;
          } else ollie();
        }
        // Fun box walls: bump off the side instead of riding through it.
        for (const o of active) {
          if (o.kind !== 'funbox' || S.grind) continue;
          const f = o.data;
          const deck = o.z + f.L / 2 - f.ramp;
          if (S.z <= deck && S.z >= o.z - f.L / 2 && Math.abs(S.x - o.x) < 0.75 && S.y < f.H) {
            S.x = o.x + Math.sign(S.x - o.x || 1) * 0.75;
            S.vx = 0;
          }
        }
      }
    }
    if (S.air) {
      S.vy -= G * dt;
      S.y += S.vy * dt;
      S.airT += dt;
      if (control) {
        // Spins: a tap queues a 180, holding keeps winding it up.
        const held = (S.spinDir < 0 && input.left) || (S.spinDir > 0 && input.right);
        if (S.spinArmed && held && Math.abs(S.spinTarget - S.spin) < 1.0) S.spinTarget += S.spinDir * Math.PI;
        // Grab: fresh press of up / action / down in the air; hold to keep it.
        if (pressed.has('up') || pressed.has('action') || pressed.has('down')) S.grab = 0.4;
        else if (S.grab > 0 && (input.up || input.action || input.down)) S.grab = Math.max(S.grab, 0.08);
        if (S.grab > 0) {
          S.grab -= dt;
          S.grabTime += dt;
        }
      }
      const rem = S.spinTarget - S.spin;
      if (Math.abs(rem) > 1e-4) {
        S.spinVel = Math.min(SPIN_MAX, S.spinVel + SPIN_ACC * dt);
        S.spin += Math.sign(rem) * Math.min(Math.abs(rem), S.spinVel * dt);
      }
      const s = surface(S.x, S.z, S.y);
      if (S.vy <= 0 && S.y <= s.y) land(s);
    }

    // ----- Obstacles -----
    for (let i = active.length - 1; i >= 0; i--) {
      const o = active[i];
      if (o.z > S.z + 18) {
        o.active = false;
        o.g.visible = false;
        active.splice(i, 1);
        continue;
      }
      if (RAMPS.has(o.kind)) continue;
      if (o.kind === 'kid' || o.kind === 'coach') moveSkier(o, dt);
      if (!o.hit && S.invuln <= 0 && S.dying <= 0 && Math.abs(o.z - S.z) < 1.2) {
        const dx = S.x - o.x;
        const dz = S.z - o.z;
        if (dx * dx + dz * dz < (o.r + 0.3) ** 2 && S.y < o.h) {
          hit(o);
          continue;
        }
      }
      if (!o.passed && o.z > S.z + 0.2) {
        o.passed = true;
        if (o.hit || S.crashT > 0) continue;
        const lat = Math.abs(S.x - o.x);
        if (S.air && S.y >= o.h - 0.05 && lat < o.r + 0.5) {
          S.score += 100;
          say(o.kind === 'kid' ? 'KID HOP! +100' : o.kind === 'rock' ? 'ROCK HOP! +100' : 'CLEARED IT! +100');
        } else if (lat - o.r < 0.75 && S.invuln <= 0) {
          S.score += 25 * S.combo;
          S.v += 0.4;
          say(`CLOSE CALL +${25 * S.combo}`, false);
        }
      }
    }

    // ----- Avalanche -----
    const k = 0.72 + 0.22 * Math.min(1, S.t / 25) + 0.05 * Math.min(1, S.t / 300);
    S.avZ -= vt * k * dt;
    S.gap = S.avZ - S.z;
    if (S.t > 15) S.minGap = Math.min(S.minGap, S.gap);
    if (S.gap > MAX_GAP) {
      S.avZ = S.z + MAX_GAP;
      S.gap = MAX_GAP;
    }
    if (S.gap < 1.2) {
      ctx.shake(1);
      die('Caught by the avalanche!');
    }
    if (S.gap < 16) {
      ctx.shake(0.03 + (16 - S.gap) * 0.012);
      if (Math.random() < 0.7) ctx.emit(SNOWFX, at(S.x + (Math.random() - 0.5) * 16, 0.5, S.avZ - 0.4), 2, { speed: 2.5, up: 3.5, life: 0.9, size: 0.25 });
    }

    if (!S.hinted && S.z < -22) {
      S.hinted = true;
      say('KICKER! SPIN IN THE AIR');
    }

    // ----- Course upkeep -----
    spawnAhead();
    placeBanners();
    for (const c of chunks) {
      if (c.position.z - CH / 2 > S.z + 24) {
        c.position.z -= NCH * CH;
        c.scale.x = Math.random() < 0.5 ? -1 : 1;
      }
    }
    if (S.nextArch > S.z - 160) {
      const a = arches[S.archIdx];
      S.archIdx = (S.archIdx % 3) + 1;
      Object.assign(a, { on: true, z: S.nextArch, counted: false });
      a.g.position.set(0, 0, a.z);
      a.g.visible = true;
      S.nextArch -= ARCH_GAP;
    }
    for (const a of arches) {
      if (!a.on) continue;
      if (!a.counted && a.z > S.z) {
        a.counted = true;
        S.score += 250;
        say('CHECKPOINT +250');
      }
      if (a.z > S.z + 25) {
        a.on = false;
        a.g.visible = false;
      }
    }

    // ----- HUD -----
    ctx.setScore(S.score);
    const key = `AVALANCHE ${Math.max(0, Math.round(S.gap))}M BEHIND`;
    if (key !== S.meterKey) {
      S.meterKey = key;
      ctx.setMeter(S.gap / MAX_GAP, key);
    }
    visuals(dt);
  }

  function moveSkier(o, dt) {
    if (o.fall > 0) {
      o.fall = Math.min(1, o.fall + dt * 4);
      o.g.rotation.z = (o.fall * Math.PI) / 2 * (o.vx >= 0 ? 1 : -1);
      return;
    }
    o.x += o.vx * dt;
    o.z += o.vz * dt;
    if (Math.abs(o.x) > HALF - 0.3) {
      o.x = Math.sign(o.x) * (HALF - 0.3);
      o.vx = -o.vx;
    }
    o.g.position.set(o.x, Math.abs(Math.sin(S.t * 6 + o.ph)) * 0.04, o.z);
    o.g.rotation.set(0, Math.atan2(-o.vx, -o.vz), Math.sin(S.t * 5 + o.ph) * 0.08);
  }

  // ---------- Visuals ----------
  function visuals(dt) {
    rig.position.set(S.x, S.y, S.z);
    const carve = S.air || S.grind ? 0 : Math.atan2(-S.vx, Math.max(4, S.v)) * 1.1;
    rig.rotation.y += (carve - rig.rotation.y) * Math.min(1, dt * 10);
    spinG.rotation.y = S.stance - S.spin;
    const b = player.body;
    if (S.dying > 0 && !S.dyingMsg.startsWith('Caught')) {
      const p = Math.min(1, (1.1 - S.dying) / 0.5);
      tilt.rotation.set(p * Math.PI * 2.5, 0, p * 0.6);
      tilt.position.y = Math.sin(p * Math.PI) * 0.6;
    } else if (S.crashT > 0 && S.dying <= 0) {
      const p = 1 - S.crashT / 0.75;
      tilt.rotation.set(p * Math.PI * 3, 0, Math.sin(p * 9) * 0.5);
      tilt.position.y = Math.abs(Math.sin(p * Math.PI * 2)) * 0.5;
    } else {
      tilt.rotation.x = S.air && S.grab > 0 ? -0.15 : 0;
      tilt.rotation.z = S.air || S.grind ? 0 : clamp(-S.vx * 0.045, -0.4, 0.4);
      tilt.position.y = 0;
    }
    S.squash = Math.max(0, S.squash - dt * 5);
    const crouch = S.tuck ? 0.18 : S.air && S.grab > 0 ? 0.22 : 0;
    b.scale.set(1 + S.squash * 0.12, 1 - S.squash * 0.18 - crouch, 1 + S.squash * 0.12);
    b.rotation.x = S.tuck ? 0.35 : S.air && S.grab > 0 ? 0.4 : 0;
    board.rotation.x = S.air && S.grab > 0 ? 0.25 : 0;
    const arms = S.air ? 0.9 : S.grind ? 1.2 : 0.15 + Math.abs(S.vx) * 0.03;
    player.armL.rotation.z = -arms;
    player.armR.rotation.z = S.air && S.grab > 0 ? -0.8 : arms;
    rig.visible = S.dying > 0 ? rig.visible : S.invuln > 0 && S.crashT <= 0 ? Math.floor(S.t * 14) % 2 === 0 : true;
    if (!S.air && !S.grind && S.dying <= 0 && S.v > 2) {
      const n = Math.abs(S.vx) > 4 || S.tuck ? 2 : 1;
      ctx.emit(SNOWFX, at(S.x - S.vx * 0.03, 0.06, S.z + 0.55), n, { speed: 0.6 + Math.abs(S.vx) * 0.15, up: 1.2, life: 0.4, size: 0.11 });
    }
    av.group.position.set(0, 0, S.avZ);
    backdrop.position.set(S.camX * 0.8, 0, S.z - 175);
    camera(dt);
    ctx.followSun(at(S.x, 0, S.z - 6));
  }

  function camera(dt) {
    const cam = ctx.camera;
    const f = clamp((1.25 - (cam.aspect || 1.6)) / 0.7, 0, 1); // 0 landscape, 1 tall phone
    const close = clamp((18 - S.gap) / 12, 0, 1);
    S.camX += (S.x * lerp(0.55, 0.8, f) - S.camX) * Math.min(1, dt * 4);
    S.camY += (S.y - S.camY) * Math.min(1, dt * 3);
    let back = lerp(8.5, 11, f) + (S.v - 12) * 0.08;
    // When the avalanche closes in, pull back over its crest so it fills the bottom of the frame.
    back = lerp(back, Math.max(back, S.gap + 9), close);
    const up = lerp(6.2, 10.5, f) + close * 4;
    cam.position.set(S.camX, up + S.camY * 0.5, S.z + back);
    cam.lookAt(S.camX * 0.85, S.camY * 0.4 + 0.3, S.z - lerp(9, 13, f));
  }

  // ---------- Autopilot (debug only) ----------
  const botIn = { left: false, right: false, up: false, down: false, action: false, pressed: new Set() };
  function bot() {
    const b = botIn;
    b.pressed.clear();
    b.left = b.right = b.up = b.down = b.action = false;
    if (S.air) {
      if (S.airT < 0.05 && S.vy > 8 && !S.botSpin) {
        S.botSpin = Math.random() < 0.5 ? -1 : 1;
        b.pressed.add(S.botSpin < 0 ? 'left' : 'right');
      }
      const tLand = (S.vy + Math.sqrt(S.vy * S.vy + 2 * G * Math.max(0, S.y))) / G;
      const rem = Math.abs(S.spinTarget - S.spin);
      if (S.botSpin && tLand > (rem + Math.PI) / SPIN_MAX + 0.15) b[S.botSpin < 0 ? 'left' : 'right'] = true;
      if (S.airT > 0.05 && S.airT < 0.07 && tLand > 0.5) b.pressed.add('down');
      return b;
    }
    S.botSpin = 0;
    let best = S.x;
    let bestCost = Infinity;
    const look = S.v * 1.1 + 4;
    for (let cx = -6.5; cx <= 6.5; cx += 0.5) {
      let cost = Math.abs(cx - S.x) * 0.05;
      for (const o of active) {
        const dz = S.z - o.z;
        if (dz < -0.5 || dz > look) continue;
        if (o.kind === 'kicker' || o.kind === 'bigkicker') {
          if (Math.abs(cx - o.x) < o.data.w / 2 - 0.5) cost -= 2;
          continue;
        }
        if (o.kind === 'funbox') {
          if (Math.abs(cx - o.x) < 0.3 && dz > 3) cost -= 1.5;
          else if (Math.abs(cx - o.x) < 1.0) cost += 3;
          continue;
        }
        const ox = o.x + (o.vx || 0) * (dz / Math.max(4, S.v));
        if (Math.abs(cx - ox) < o.r + 0.8) cost += 10 / (1 + dz * 0.1);
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = cx;
      }
    }
    if (best > S.x + 0.3) b.right = true;
    else if (best < S.x - 0.3) b.left = true;
    for (const o of active) {
      if (RAMPS.has(o.kind) || o.h > 1.0) continue;
      const dz = S.z - o.z;
      if (Math.abs(S.x - o.x) < o.r + 0.4 && dz > S.v * 0.2 && dz < S.v * 0.36) b.pressed.add('up');
    }
    return b;
  }
  const stats = () => ({
    t: +S.t.toFixed(1), dist: Math.round(S.dist), score: Math.round(S.score), lives: S.lives, gap: +S.gap.toFixed(1),
    v: +S.v.toFixed(1), tricks: S.trickCount, hits: S.hits, wipeouts: S.wipeouts, minGap: +S.minGap.toFixed(1),
  });
  let simDone = false;
  let lastLog = 0;

  resetWorld();
  av.update(0);

  return {
    debugState: () => S,
    reset() {
      resetWorld();
      S.started = true;
      ctx.setLives(3);
      ctx.setScore(0);
      ctx.setMeter(S.gap / MAX_GAP, 'AVALANCHE!');
      say('GO GO GO!');
      simDone = false;
      lastLog = 0;
    },
    update(dt, input, t) {
      av.update(t);
      if (SIM && !simDone) {
        simDone = true;
        for (let i = 0; i < SIM * 60 && !S.ended; i++) step(1 / 60, BOT ? bot() : { ...botIn, pressed: new Set() });
        console.log('[snowboard sim]', JSON.stringify(stats()));
        return;
      }
      step(dt, BOT ? bot() : input);
      if (BOT && (S.t - lastLog > 10 || S.ended)) {
        lastLog = S.t;
        console.log('[snowboard]', JSON.stringify(stats()));
      }
    },
    idle(dt, t) {
      av.update(t);
      for (const o of active) if (o.kind === 'kid' || o.kind === 'coach') moveSkier(o, dt);
      S.t += dt;
      const cam = ctx.camera;
      if (!S.started) {
        // Title: look back up the hill at Basil with the avalanche looming behind him.
        rig.position.set(S.x, 0, S.z);
        rig.rotation.y = 0;
        // Basil sits below the title card; the look target rises on tall screens.
        const f = clamp((1.25 - (cam.aspect || 1.6)) / 0.7, 0, 1);
        cam.position.set(Math.sin(t * 0.3) * 2, 2, S.z - 9.5);
        cam.lookAt(0, lerp(4.8, 5.8, f), S.z + 4);
        av.group.position.set(0, 0, S.avZ);
      } else {
        if (S.dyingMsg.startsWith('Caught')) {
          S.avZ -= 6 * dt;
          av.group.position.z = S.avZ;
        }
        // Game over: hold the last framing and drift up a touch.
        if (S.idleRise < 2.5) {
          S.idleRise += dt * 0.25;
          cam.position.y += dt * 0.25;
        }
      }
    },
  };
}
