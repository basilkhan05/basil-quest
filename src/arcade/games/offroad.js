// Bronco Off-Road: Basil (and Lichen, riding shotgun like on the roadtrip stop)
// takes the orange Bronco down an endless backcountry trail. Steer around bears,
// moose, rocks, fallen logs and cacti, splash through mud, hit kickers for air
// and grab Freshly Commerce supply crates. Three lives; boost is a meter that
// refills slowly and from jerry cans.
//
// Coordinates: the trail runs along -z. `s` is distance travelled (z = -s) and
// `u` is the sideways offset from the trail centre, so world x = cx(s) + u.
// Everything (Bronco, obstacles, pickups) lives in (s, u) and is placed in the
// world each frame.
//
// Debug (?debug): &autopilot drives itself, &warp=SEC simulates SEC seconds on
// the first frame, &only=bear,moose limits which trail events spawn. Final run
// stats are logged to the console.
import { createTerrain, biomeAt, nextBoundary, BIOMES, W, EDGE, AHEAD } from './offroad-terrain.js';
import {
  makeBear, makeMoose, makeTumbleweed, makeLog, makeRamp, makeBump, makeMud, shapeMud,
  makeCrate, makeCan, makeBillboard, makeWarning, makeCamp, TEAL, INK,
} from './offroad-models.js';

const PHX = 0.46; // Bronco hitbox half-width (the body is ~0.6: a little forgiveness)
const PHZ = 0.86; // and half-length
const G = 22;
const NEAR = 0.55; // gap that counts as a near miss
const launchV = (speed) => 6 + speed * 0.2; // kicker take-off speed
const LOG_LENS = [2.6, 3.1, 3.6];
const BRONCO_BITS = ['#e8692c', '#b84d1c', '#26262b', '#ffffff', '#9aa0a8'];
const MUD = ['#6b4a2f', '#4f3521', '#5e4028', '#7a5636'];

const DEATH = {
  rock: 'Rocks 1, Bronco 0.',
  cactus: 'Cactus 1, tires 0.',
  log: 'Timber! The Bronco needs a tow.',
  bear: 'The bear had right of way.',
  moose: 'Never argue with a moose.',
  tumble: 'Taken out by a tumbleweed. Really.',
};

export default function create(ctx) {
  const { THREE, scene, models, group, box, clamp, lerp } = ctx;
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has('debug');
  const AUTO = DEBUG && params.has('autopilot');
  const WARP = DEBUG ? Number(params.get('warp')) || 0 : 0;
  const ONLY = DEBUG && params.get('only') ? params.get('only').split(',') : null;
  const rand = Math.random;

  const skyA = new THREE.Color(BIOMES[0].sky);
  const skyB = new THREE.Color(BIOMES[1].sky);
  scene.background = skyA.clone();
  scene.fog = new THREE.Fog(skyA.clone(), 45, 96);

  const terrain = createTerrain(scene);
  const { cx } = terrain;

  // ---------- The Bronco ----------
  const car = group(scene); // position + heading
  const body = group(car); // bounce, lean, pitch, blink
  const bronco = models.makeBronco();
  body.add(bronco);
  const seat = (look, x) => {
    const p = models.makePlayer(look);
    p.root.position.set(x, 0.66, 0.05);
    p.legs.rotation.x = -Math.PI / 2;
    p.legs.position.set(0, 0.3, 0.05);
    p.gear.shades.visible = true;
    bronco.add(p.root);
    return p;
  };
  seat(undefined, -0.24); // Basil drives
  seat(models.LICHEN, 0.24);
  box(bronco, 0.26, 0.22, 0.05, '#1b1b1f', -0.24, 0.98, -0.22); // steering wheel
  box(bronco, 0.12, 0.12, 0.2, '#555', 0.42, 0.22, 1.1); // exhaust
  const flame = group(body, 0.42, 0.2, 1.25);
  box(flame, 0.22, 0.22, 0.34, '#ffb020', 0, 0, 0.12, { shadow: false });
  box(flame, 0.14, 0.14, 0.34, '#ff5a1f', 0, 0.04, 0.42, { shadow: false });
  flame.visible = false;

  // ---------- Object kinds ----------
  const scaled = (fn, sc) => {
    const g = group();
    fn(g);
    g.scale.setScalar(sc);
    return g;
  };
  const ROCK_SC = [1.3, 1.75];
  const KIND = {
    rock: {
      build: (v) => scaled((g) => models.rock(g, 0, 0, 0, v >= 2 ? '#d9a36b' : undefined), ROCK_SC[v % 2]),
      dims: (v) => [0.35 * ROCK_SC[v % 2], 0.3 * ROCK_SC[v % 2], 0.55 * ROCK_SC[v % 2]],
      hit: true,
      colors: (v) => (v >= 2 ? ['#d9a36b', '#d6d0e3', '#c4623a'] : ['#b9b3c9', '#d6d0e3', '#8f8aa0']),
    },
    cactus: { build: () => scaled((g) => models.cactus(g, 0, 0, 0), 1.25), dims: () => [0.42, 0.22, 1.6], hit: true, colors: () => ['#3fae6a', '#2f8a52', '#ff6fa8'] },
    log: { build: (v) => makeLog(LOG_LENS[v]), dims: (v) => [LOG_LENS[v] / 2, 0.26, 0.5], hit: true, colors: () => ['#7a4b33', '#e0b98a', '#5f9e3a'] },
    bear: { build: (v) => makeBear(v === 1), dims: () => [0.92, 0.42, 1.15], off: 0.24, hit: true, animal: true, colors: () => ['#c99a6b', '#ffffff'] },
    moose: { build: () => makeMoose(), dims: () => [1.45, 0.48, 2.3], off: 0.5, hit: true, animal: true, colors: () => ['#c99a6b', '#ffffff'] },
    tumble: { build: () => makeTumbleweed(), dims: () => [0.4, 0.4, 0.8], hit: true, colors: () => ['#c9a66b', '#b08850', '#d8b97e'] },
    crate: { build: () => makeCrate(), dims: () => [0.4, 0.4, 0.8], pickup: true },
    can: { build: () => makeCan(), dims: () => [0.3, 0.3, 0.7], pickup: true },
    ramp: { build: () => makeRamp(), dims: () => [1.2, 1.25, 0.7] },
    bump: { build: () => makeBump(), dims: () => [1.4, 0.7, 0.25] },
    mud: { build: () => makeMud(), dims: () => [1, 1, 0] },
    billboard: { build: (v) => makeBillboard(v), dims: () => [0, 0, 0], deco: true },
    warn: { build: (v) => makeWarning(v), dims: () => [0, 0, 0], deco: true },
    camp: { build: () => makeCamp(), dims: () => [0, 0, 0], deco: true },
  };

  const pools = new Map();
  const objs = [];
  const zones = []; // spots kept free of scenery (signs, camps)

  function spawn(kind, s, u, extra = {}) {
    const def = KIND[kind];
    const v = extra.v ?? 0;
    const key = `${kind}:${v}`;
    const pool = pools.get(key);
    let mesh = pool && pool.pop();
    if (!mesh) {
      mesh = def.build(v);
      scene.add(mesh);
    }
    mesh.visible = true;
    mesh.rotation.set(0, 0, 0);
    const [hx, hz, h] = def.dims(v);
    const o = { kind, key, def, v, s, u, y: 0, hx, hz, h, mesh, vu: 0, dir: 1, state: 'idle', t: rand() * 10, minGap: 9, done: false, hit: false, ...extra };
    objs.push(o);
    place(o);
    return o;
  }
  function release(o) {
    o.mesh.visible = false;
    if (!pools.has(o.key)) pools.set(o.key, []);
    pools.get(o.key).push(o.mesh);
  }

  terrain.setClear((s, u) => zones.every((z) => s < z.s0 || s > z.s1 || u < z.u0 || u > z.u1));

  // ---------- Run state ----------
  let sp = 0; // distance along the trail
  let pu = 0; // sideways offset
  let py = 0; // height above the ground (air)
  let vu = 0;
  let vy = 0;
  let speed = 0;
  let yaw = 0;
  let boost = 1;
  let boostPulse = 0;
  let brakePulse = 0;
  let nudge = 0;
  let lives = 3;
  let invuln = 0;
  let dying = 0;
  let deathMsg = '';
  let over = false;
  let airT = 0;
  let cleared = 0;
  let squash = 0;
  let dustT = 0;
  let inMud = null;
  let skyT = 0;
  let biomeNow = 0;
  let camX = 0;
  let nextEvent = 0;
  let nextCrate = 0;
  let nextCan = 0;
  let nextSign = 0;
  let nextCamp = 0;
  let signIdx = 0;
  let warped = false;
  let clock = 0;
  let stats = {};
  const sunTarget = new THREE.Vector3();

  const baseSpeed = (s) => 13 + 12 * clamp(s / 4500, 0, 1) + 3 * clamp((s - 4500) / 4000, 0, 1);

  function resetWorld() {
    for (const o of objs) release(o);
    objs.length = 0;
    zones.length = 0;
    sp = pu = py = vu = vy = 0;
    speed = 13;
    yaw = 0;
    boost = 1;
    boostPulse = brakePulse = nudge = 0;
    lives = 3;
    invuln = dying = 0;
    over = false;
    airT = cleared = squash = 0;
    inMud = null;
    skyT = biomeNow = 0;
    nextEvent = 55;
    nextCrate = 28;
    nextCan = 160;
    nextSign = 40;
    nextCamp = nextBoundary(0) - 34;
    signIdx = 0;
    stats = { time: 0, crates: 0, near: 0, cleared: 0, air: 0, hits: 0, cans: 0 };
    car.rotation.set(0, 0, 0);
    body.visible = true;
    spawnLandmarks();
    terrain.reset(rand);
    camX = 0;
  }

  // ---------- Spawning ----------
  const weighted = (table) => {
    let sum = 0;
    for (const [, w] of table) sum += w;
    let r = rand() * sum;
    for (const [k, w] of table) if ((r -= w) <= 0) return k;
    return table[0][0];
  };
  const lane = () => (rand() - 0.5) * (W - 1.3);

  function warn(kind, s, side) {
    const u = side * (EDGE + 0.55);
    spawn('warn', s, u, { v: kind, deco: true });
    zones.push({ s0: s - 6, s1: s + 1, u0: u - 1.2, u1: u + 1.2 });
  }

  function animal(kind, s, side, diff) {
    const bear = kind === 'bear';
    const u0 = side * (W / 2 + (bear ? 2.2 : 2.8) + rand());
    const sp0 = bear ? 1.7 + diff * 1.6 + rand() * 0.8 : 1.1 + diff * 1.1 + rand() * 0.5;
    const o = spawn(kind, s, u0, { v: bear && rand() < 0.45 ? 1 : 0 });
    o.dir = -side;
    o.vu = o.dir * sp0;
    o.state = 'wait';
    // Start walking so the animal reaches the trail centre roughly as you arrive.
    o.trig = (Math.abs(u0) / sp0) * (0.5 + rand() * 0.8);
    if (!bear && rand() < 0.4) o.pauseAt = (rand() - 0.5) * 2.4;
    return o;
  }

  function spawnEvent(s) {
    const bi = biomeAt(s);
    const diff = clamp(s / 5000, 0, 1);
    let table =
      bi === 0
        ? [['rock', 3], ['rocks', 1 + diff * 2], ['log', 2], ['bear', 2.4], ['moose', 1.5], ['mud', 1.2], ['ramp', 1.1], ['whoops', 0.8]]
        : [['rock', 2.4], ['rocks', 1 + diff * 2], ['cactus', 3], ['cacti', 1 + diff * 2], ['tumble', 2], ['mud', 0.6], ['ramp', 1.3], ['whoops', 1]];
    if (ONLY) table = table.filter(([k]) => ONLY.includes(k)).concat(ONLY.includes('*') ? table : []);
    if (!table.length) return;
    const kind = weighted(table);
    const side = rand() < 0.5 ? -1 : 1;
    const rockV = () => (bi ? 2 : 0) + (rand() < 0.35 ? 1 : 0);
    switch (kind) {
      case 'rock':
        spawn('rock', s, lane(), { v: rockV() });
        break;
      case 'rocks':
      case 'cacti': {
        const k = kind === 'rocks' ? 'rock' : 'cactus';
        const u1 = lane();
        let u2 = u1 + side * (2.5 + rand() * 1.2);
        if (Math.abs(u2) > W / 2 - 0.5) u2 = u1 - side * (2.5 + rand() * 1.2);
        spawn(k, s, u1, { v: k === 'rock' ? rockV() : 0 });
        spawn(k, s + 1 + rand() * 4, clamp(u2, -W / 2 + 0.5, W / 2 - 0.5), { v: k === 'rock' ? rockV() : 0 });
        break;
      }
      case 'cactus':
        spawn('cactus', s, lane());
        break;
      case 'log': {
        const v = (rand() * 3) | 0;
        spawn('log', s, side * (W / 2 - LOG_LENS[v] / 2 + 0.3), { v });
        break;
      }
      case 'bear':
      case 'moose':
        if (rand() < (kind === 'moose' ? 0.8 : 0.4)) warn(kind, s - 18, side);
        animal(kind, s, side, diff);
        break;
      case 'tumble': {
        const o = spawn('tumble', s, side * 10);
        o.dir = -side;
        o.vu = o.dir * (4.2 + rand() * 2.5 + diff * 2);
        o.state = 'wait';
        o.trig = (10 / Math.abs(o.vu)) * (0.55 + rand() * 0.7);
        break;
      }
      case 'mud': {
        const w = 3 + rand() * 3;
        const l = 4 + rand() * 4;
        const u = w > W - 0.6 ? 0 : side * (W / 2 - w / 2) * rand();
        const o = spawn('mud', s, u, { w, l });
        o.hx = w / 2;
        o.hz = l / 2;
        shapeMud(o.mesh, w, l, rand);
        warn('mud', s - l / 2 - 10, side);
        break;
      }
      case 'ramp': {
        const u = lane() * 0.7;
        spawn('ramp', s, u);
        if (rand() < 0.5) warn('ramp', s - 14, side);
        // Crates up in the air at the top of the jump, and something to clear.
        const v = baseSpeed(s);
        const vy0 = launchV(v);
        const tTop = vy0 / G;
        const top = s - 1.3 + v * tTop; // where the jump peaks at cruising speed
        if (rand() < 0.55) {
          spawn('rock', top, u, { v: bi ? 2 : 0 });
          spawn('crate', top + 3, u, { y: (vy0 * vy0) / (2 * G) - 0.6 });
        } else spawn('crate', top, u, { y: (vy0 * vy0) / (2 * G) - 0.5 });
        break;
      }
      case 'whoops': {
        const u = lane() * 0.6;
        for (let i = 0; i < 3; i++) spawn('bump', s + i * 3.6, u);
        break;
      }
    }
  }

  function freeSpot(s, u, r = 1) {
    return objs.every((o) => !(o.def.hit || o.kind === 'ramp' || o.kind === 'mud') || Math.abs(o.s - s) > o.hz + 2.5 || Math.abs(o.u - u) > o.hx + r);
  }

  function spawnPickup(kind, s) {
    for (let i = 0; i < 8; i++) {
      const u = lane();
      if (freeSpot(s, u)) {
        if (kind === 'crate' && rand() < 0.25) {
          // A short line of crates
          for (let k = 0; k < 3; k++) if (freeSpot(s + k * 3.5, u)) spawn('crate', s + k * 3.5, u);
        } else spawn(kind, s, u);
        return;
      }
    }
  }

  // Billboards and camps are decided well ahead so the scenery can leave room.
  function spawnLandmarks() {
    const horizon = sp + AHEAD + 40;
    while (nextSign < horizon) {
      if (Math.abs(nextSign - nextCamp) < 30) {
        nextSign += 45;
        continue;
      }
      const side = signIdx % 2 ? 1 : -1;
      const u = side * (EDGE + 2.1);
      const o = spawn('billboard', nextSign, u, { v: [0, 1, 3][signIdx % 3] });
      o.mesh.rotation.y = -side * 0.35;
      zones.push({ s0: nextSign - 9, s1: nextSign + 2.5, u0: u - 2.4, u1: u + 2.4 });
      signIdx++;
      nextSign += 150 + rand() * 90;
    }
    while (nextCamp < horizon) {
      const side = rand() < 0.5 ? -1 : 1;
      const ub = side * (EDGE + 2.1);
      const b = spawn('billboard', nextCamp, ub, { v: 2 });
      b.mesh.rotation.y = -side * 0.35;
      const c = spawn('camp', nextCamp + 3, side * (EDGE + 5.6));
      c.mesh.rotation.y = side > 0 ? 0.4 : -0.4;
      zones.push({ s0: nextCamp - 9, s1: nextCamp + 6, u0: Math.min(ub, side * 12) - 2.5, u1: Math.max(ub, side * 12) + 2.5 });
      const at = nextCamp + 40;
      nextCamp = at + nextBoundary(at) - 34;
    }
  }

  function spawnAhead() {
    const horizon = sp + AHEAD - 6;
    while (nextEvent < horizon) {
      spawnEvent(nextEvent);
      const diff = clamp(nextEvent / 5000, 0, 1);
      nextEvent += lerp(25, 11, diff) + rand() * lerp(12, 6, diff);
    }
    while (nextCrate < horizon) {
      spawnPickup('crate', nextCrate);
      nextCrate += 45 + rand() * 40;
    }
    while (nextCan < horizon) {
      spawnPickup('can', nextCan);
      nextCan += 220 + rand() * 120;
    }
    spawnLandmarks();
  }

  // ---------- Placement + per-object behaviour ----------
  function place(o) {
    const x = cx(o.s) + o.u;
    o.mesh.position.set(x, o.y, -o.s);
    if (o.def.animal || o.kind === 'tumble') o.mesh.rotation.y = o.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    else if (o.kind === 'ramp' || o.kind === 'bump') o.mesh.rotation.y = -Math.atan(terrain.slope(o.s));
  }

  function animate(o, dt) {
    o.t += dt;
    if (o.state === 'wait') {
      if ((o.s - sp) / Math.max(speed, 6) < o.trig) o.state = 'walk';
    } else if (o.state === 'walk') {
      if (o.pauseAt != null && (o.u - o.pauseAt) * o.dir >= 0) {
        o.pause = 1.1 + rand() * 0.6;
        o.pauseAt = null;
      }
      if (o.pause > 0) o.pause -= dt;
      else o.u += o.vu * dt;
      if (Math.abs(o.u) > 16) o.state = 'gone';
    } else if (o.state === 'flee') {
      o.u += o.vu * dt;
      o.y = Math.abs(Math.sin(o.t * 9)) * 0.35;
    }
    o.moving = (o.state === 'walk' && !(o.pause > 0)) || o.state === 'flee';
    if (o.def.animal) {
      const legs = o.mesh.userData.legs;
      const rate = o.kind === 'bear' ? 11 : 7;
      legs.forEach((l, i) => (l.position.y = o.moving ? Math.max(0, Math.sin(o.t * rate + (i === 0 || i === 3 ? 0 : Math.PI))) * 0.12 : 0));
    } else if (o.kind === 'tumble') {
      if (o.moving) {
        o.y = Math.abs(Math.sin(o.t * 5)) * 0.45;
        o.mesh.userData.ball.rotation.x = -o.t * 7;
      }
    } else if (o.def.pickup) {
      const spin = o.mesh.userData.spin;
      spin.rotation.y = o.t * 2;
      spin.position.y = 0.14 + Math.sin(o.t * 3) * 0.08;
    } else if (o.kind === 'camp') {
      const [f1, f2] = o.mesh.userData.flame;
      f1.scale.y = 0.3 + Math.abs(Math.sin(o.t * 9)) * 0.15;
      f2.position.y = 0.42 + Math.sin(o.t * 13) * 0.05;
    }
  }

  const tmpV = new THREE.Vector3();
  const at = (s, u, y) => tmpV.set(cx(s) + u, y, -s);

  function crash(o, demo) {
    o.hit = true;
    const away = Math.sign(o.u - pu) || 1;
    if (o.def.animal) {
      o.state = 'flee';
      o.dir = away;
      o.vu = away * 9;
    } else {
      o.mesh.visible = false;
      ctx.emit(o.def.colors(o.v), at(o.s, o.u, 0.4), 26, { speed: 3.5, up: 5, gravity: 14, life: 0.9, size: 0.18 });
    }
    if (demo) return;
    stats.hits++;
    stats.by = `${stats.by || ''}${o.kind}${o.state === 'walk' ? '(walk)' : ''}@${Math.round(sp)} `;
    ctx.emit(BRONCO_BITS, at(sp, pu, 0.7), 34, { speed: 4, up: 5.5, gravity: 14, life: 0.9, size: 0.16 });
    ctx.emit(['#ffffff', '#d8d8d8'], at(sp, pu, 1), 12, { speed: 1.5, up: 2, gravity: -1, life: 1, size: 0.3 });
    ctx.shake(0.8);
    speed *= 0.3;
    vu = -away * 5;
    lives--;
    ctx.setLives(lives);
    if (lives <= 0) {
      dying = 1.1;
      deathMsg = DEATH[o.kind] || 'The Bronco needs a tow.';
      ctx.toast('WRECKED!');
    } else {
      invuln = 1.8;
      ctx.toast(lives === 1 ? 'LAST LIFE!' : 'CRASH!');
    }
  }

  function collect(o, demo) {
    o.done = true;
    o.mesh.visible = false;
    const p = at(o.s, o.u, o.y + 0.5);
    if (o.kind === 'crate') {
      ctx.emit([TEAL, INK, '#ffffff', '#0f9486'], p, 18, { speed: 3, up: 4, gravity: 10, life: 0.7, size: 0.14 });
      if (!demo) {
        stats.crates++;
        ctx.addScore(50, 'CRATE');
      }
    } else {
      ctx.emit(['#d7263d', '#ffd23f', '#ffb020'], p, 16, { speed: 3, up: 4, gravity: 10, life: 0.7, size: 0.14 });
      boost = Math.min(1, boost + 0.6);
      if (!demo) {
        stats.cans++;
        ctx.toast('BOOST REFILL!');
      }
    }
  }

  // ---------- Autopilot (title screen demo + ?autopilot testing) ----------
  function autoInput() {
    let best = pu;
    let bestCost = Infinity;
    let danger = false;
    for (let c = -2.7; c <= 2.71; c += 0.3) {
      let cost = Math.abs(c - pu) * 0.25 + Math.abs(c) * 0.15;
      for (const o of objs) {
        const ds = o.s - sp;
        if (ds < -1.6 || ds > 34 || o.done || o.hit) continue;
        const ta = Math.max(0, ds) / Math.max(speed, 4);
        const ou = o.u + (o.moving ? o.vu * ta : 0) + (o.def.off || 0) * o.dir;
        const w = 6 / (ds + 4);
        const d = Math.abs(c - ou);
        if (o.def.hit) {
          if (o.state === 'gone') continue;
          if (d < o.hx + PHX + 0.45) {
            cost += 60 * w;
            if (ds < 25 && Math.abs(pu - ou) < o.hx + PHX + 0.4) danger = true;
          }
        } else if (o.def.pickup) {
          if (d < 0.6 && o.y < 0.6) cost -= (o.kind === 'can' ? 14 : 8) * w;
        } else if (o.kind === 'mud') {
          if (d < o.hx + PHX) cost += 6 * w;
        } else if (o.kind === 'ramp') {
          if (d < o.hx - 0.3) cost -= 5 * w;
        }
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
      }
    }
    return { steer: clamp((best - pu) * 1.8, -1, 1), boost: boost > 0.5 && !danger, brake: false };
  }

  // ---------- One simulation step ----------
  function step(dt, inp, demo) {
    stats.time += demo ? 0 : dt;
    clock += dt;
    const air = py > 0.001 || vy > 0;
    const offTrail = Math.abs(pu) > W / 2 + 0.15;

    // Speed
    let target = demo ? 12 : baseSpeed(sp);
    const boosting = !dying && inp.boost && boost > 0.02;
    if (boosting) {
      target *= 1.45;
      boost = Math.max(0, boost - dt * 0.33);
    } else boost = Math.min(1, boost + dt * 0.03);
    if (inp.brake) target *= 0.55;
    if (offTrail && !air) target *= 0.72;
    if (inMud && !air) target *= 0.45;
    if (dying) target = 0;
    const rate = target > speed ? (boosting ? 16 : 6) : dying ? 14 : 10;
    speed += clamp(target - speed, -rate * dt, rate * dt);

    // Steering (lateral speed scales a little with forward speed)
    const maxLat = 6 + speed * 0.14;
    const steer = dying ? 0 : inp.steer;
    vu += (steer * maxLat * (air ? 0.6 : 1) - vu) * Math.min(1, dt * (air ? 4 : 11));
    // Curves push you to the outside: counter-steer at speed.
    const drift = air ? 0 : -terrain.curv(sp) * speed * speed * 0.05;
    const du = (vu + drift) * dt;
    pu += du;
    if (nudge && Math.sign(du) === Math.sign(nudge)) nudge = Math.abs(du) >= Math.abs(nudge) ? 0 : nudge - du;
    if (Math.abs(pu) > EDGE) {
      pu = Math.sign(pu) * EDGE;
      if (Math.abs(vu) > 2 && !demo) ctx.shake(0.12);
      vu = 0;
      nudge = 0;
    }

    const ds = speed * dt;
    sp += ds;
    if (!demo && !dying) ctx.addScore(ds * 0.4);

    // Air
    if (air) {
      vy -= G * dt;
      py += vy * dt;
      airT += dt;
      if (py <= 0) {
        py = 0;
        if (vy < -5) {
          squash = 1;
          ctx.emit(BIOMES[biomeNow].dust, at(sp, pu, 0.1), 14, { speed: 3, up: 1.5, gravity: 6, life: 0.6, size: 0.2 });
          if (!demo) ctx.shake(Math.min(0.35, -vy * 0.03));
        }
        vy = 0;
        if (!demo && !dying && airT > 0.5) {
          const pts = Math.round(airT * 40) + cleared * 75;
          stats.air += pts;
          ctx.addScore(pts, cleared ? (cleared > 1 ? `CLEARED x${cleared}!` : 'CLEARED IT!') : 'AIR TIME');
        }
        airT = 0;
        cleared = 0;
      }
    }

    // World + objects
    terrain.update(sp);
    spawnAhead();
    let mud = null;
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.s < sp - 14) {
        release(o);
        objs.splice(i, 1);
        continue;
      }
      animate(o, dt);
      place(o);
      if (o.done || o.hit) continue;
      const dS = o.s - sp;
      if (o.def.hit) {
        if (o.state === 'gone') continue;
        const ou = o.u + (o.def.off || 0) * o.dir;
        const reach = o.hz + PHZ;
        const gap = Math.abs(ou - pu) - (o.hx + PHX);
        if (Math.abs(dS) < reach + 0.4) o.minGap = Math.min(o.minGap, gap);
        if (Math.abs(dS) < reach && gap < 0) {
          if (py > o.h + o.y - 0.1) o.jumped = true;
          else if (invuln > 0 || dying || demo) o.ghost = true;
          else crash(o, demo);
        }
        if (dS < -reach && !o.hit) {
          o.done = true;
          if (demo || o.ghost) continue;
          if (o.jumped) {
            cleared++;
            stats.cleared++;
          } else if (o.minGap < NEAR) {
            stats.near++;
            ctx.addScore(o.def.animal ? 40 : 25, o.def.animal ? 'CLOSE CALL!' : 'NEAR MISS!');
          }
        }
      } else if (o.def.pickup) {
        if (Math.abs(dS) < 0.95 && Math.abs(o.u - pu) < 0.85 && Math.abs(py + 0.6 - (o.y + 0.5)) < 1.1) collect(o, demo);
      } else if (o.kind === 'ramp') {
        if (!air && Math.abs(dS) < 1.3 && Math.abs(o.u - pu) < 1.25) {
          vy = launchV(speed);
          py = 0.001;
          airT = 0;
          ctx.emit(BIOMES[biomeNow].dust, at(sp, pu, 0.1), 10, { speed: 2, up: 2, gravity: 6, life: 0.5, size: 0.18 });
        }
      } else if (o.kind === 'bump') {
        if (!air && Math.abs(dS) < 0.75 && Math.abs(o.u - pu) < 1.45) {
          vy = 2.8 + speed * 0.06;
          py = 0.001;
          airT = 0;
        }
      } else if (o.kind === 'mud') {
        if (Math.abs(dS) < o.hz && Math.abs(o.u - pu) < o.hx + 0.25 && !air) mud = o;
      }
    }
    if (mud && mud !== inMud) {
      ctx.emit(MUD, at(sp, pu, 0.2), 24, { speed: 3.5, up: 4.5, gravity: 14, life: 0.7, size: 0.16 });
      if (!demo && !mud.splashed) ctx.toast('MUD!');
      mud.splashed = true;
    }
    inMud = mud;

    // Timers
    invuln = Math.max(0, invuln - dt);
    boostPulse = Math.max(0, boostPulse - dt);
    brakePulse = Math.max(0, brakePulse - dt);
    squash = Math.max(0, squash - dt * 5);

    // Biome + sky
    const bn = biomeAt(sp);
    if (bn !== biomeNow) {
      biomeNow = bn;
      if (!demo && sp > 10) ctx.toast(bn ? 'DESERT STRETCH' : 'BACK IN THE WOODS');
    }
    skyT += ((biomeAt(sp + 30) ? 1 : 0) - skyT) * Math.min(1, dt * 0.8);

    // Bronco pose
    const heading = terrain.slope(sp) + (0.6 * (vu + drift)) / Math.max(speed, 6);
    yaw += (clamp(-Math.atan(heading), -0.6, 0.6) - yaw) * Math.min(1, dt * 10);
    car.position.set(cx(sp) + pu, py, -sp);
    car.rotation.y = dying ? car.rotation.y + dt * 9 * dying : yaw;
    const rumble = !air && (offTrail || inMud) ? Math.abs(Math.sin(clock * 31)) * 0.06 : 0;
    body.position.y = rumble;
    body.rotation.z = clamp(vu * 0.014, -0.12, 0.12);
    body.rotation.x = air ? clamp(vy * 0.035, -0.28, 0.25) : 0;
    body.scale.set(1 + squash * 0.06, 1 - squash * 0.12, 1 + squash * 0.04);
    body.visible = invuln > 0 ? Math.floor(invuln * 12) % 2 === 0 : true;
    flame.visible = boosting && Math.floor(sp * 3) % 2 === 0;

    // Particles: dust from the rear wheels, mud spray, boost flame
    dustT += dt;
    if (dustT > 0.05 && !air && speed > 3) {
      dustT = 0;
      const c = Math.cos(car.rotation.y);
      const sn = Math.sin(car.rotation.y);
      const side = rand() < 0.5 ? -0.56 : 0.56;
      tmpV.set(car.position.x + side * c + 0.95 * sn, 0.12, car.position.z - side * sn + 0.95 * c);
      if (inMud) ctx.emit(MUD, tmpV, 3, { speed: 2.2, up: 4, gravity: 13, life: 0.6, size: 0.14 });
      else ctx.emit(offTrail ? ['#9cbf5e', '#7cbf51', '#b5c463'] : BIOMES[biomeNow].dust, tmpV, 1, { speed: 0.7, up: 1.3, gravity: 2.5, life: 0.6, size: 0.2 });
    }
    if (boosting && rand() < 0.6) {
      const c = Math.cos(car.rotation.y);
      const sn = Math.sin(car.rotation.y);
      tmpV.set(car.position.x + 0.42 * c + 1.5 * sn, py + 0.3, car.position.z - 0.42 * sn + 1.5 * c);
      ctx.emit(['#ffb020', '#ff5a1f', '#ffe14d'], tmpV, 1, { speed: 0.5, up: 0.6, gravity: -1, life: 0.3, size: 0.18 });
    }

    if (dying) {
      dying = Math.max(0, dying - dt);
      if (!dying && !demo && !over) {
        over = true;
        if (DEBUG) console.log('[offroad] run', JSON.stringify({ score: Math.round(ctx.score), dist: Math.round(sp), ...stats, time: +stats.time.toFixed(1) }));
        ctx.end(deathMsg);
      }
    }
  }

  // ---------- Camera ----------
  function sky() {
    scene.background.lerpColors(skyA, skyB, skyT);
    scene.fog.color.copy(scene.background);
  }

  function placeCamera(dt, snap = false) {
    const cam = ctx.camera;
    if (cam.view && cam.view.enabled) cam.clearViewOffset();
    const tall = clamp((1.3 - (cam.aspect || 1.5)) / 0.75, 0, 1);
    const H = lerp(7.6, 10.5, tall);
    const B = lerp(8.8, 8.2, tall);
    const f = lerp(0.4, 0.44, tall);
    const half = (cam.fov * Math.PI) / 360;
    const pitch = Math.atan2(H, B) - Math.atan(f * Math.tan(half));
    const wCar = lerp(0.55, 0.75, tall);
    const tx = car.position.x * wCar + cx(sp + 16) * (1 - wCar);
    camX = snap ? tx : camX + (tx - camX) * Math.min(1, dt * 4);
    cam.position.set(camX, H + py * 0.35, car.position.z + B);
    cam.rotation.set(-pitch, 0, 0);
    ctx.followSun(sunTarget.set(car.position.x, 0, car.position.z - 7));
    sky();
  }

  // Title / game-over screens: a three-quarter view of Basil at the wheel, pushed
  // off to the side (landscape) or the bottom (portrait) so the card doesn't hide it.
  const idleCam = { pos: new THREE.Vector3(), tx: 0, ty: 0 };
  const idleGoal = new THREE.Vector3();
  function placeIdleCamera(dt, snap = false) {
    const cam = ctx.camera;
    const tall = clamp((1.3 - (cam.aspect || 1.5)) / 0.75, 0, 1);
    const p = car.position;
    const ang = -0.6 + Math.sin(clock * 0.2) * 0.18;
    const dist = lerp(7, 8.5, tall);
    idleGoal.set(p.x + Math.sin(ang) * dist, lerp(3.4, 4.2, tall), p.z + Math.cos(ang) * dist);
    const k = snap ? 1 : Math.min(1, dt * 2.5);
    idleCam.pos.lerp(idleGoal, k);
    idleCam.tx += (lerp(-0.6, 0, tall) - idleCam.tx) * k;
    idleCam.ty += (lerp(-0.12, -0.66, tall) - idleCam.ty) * k;
    cam.position.copy(idleCam.pos);
    cam.lookAt(p.x, 0.9, p.z - 1);
    const a = cam.aspect;
    cam.setViewOffset(a, 1, (-idleCam.tx * a) / 2, idleCam.ty / 2, a, 1);
    ctx.followSun(sunTarget.set(p.x, 0, p.z - 4));
    sky();
  }

  resetWorld();
  placeIdleCamera(0, true);
  if (DEBUG) {
    window.__offroad = {
      objs,
      // Simulate without rendering until fn() is true (or sec runs out).
      sim(sec, fn = () => false, inp = null) {
        for (let i = 0; i < sec * 60 && !over && !fn(); i++) step(1 / 60, inp || autoInput(), false);
        placeCamera(0, true);
        return { sp, pu, speed, lives, boost, score: ctx.score };
      },
      state: () => ({ sp, pu, py, lives, dying, invuln, airT, cleared, stats }),
      ahead: (kind) => objs.filter((o) => o.kind === kind && o.s > sp).map((o) => ({ ds: o.s - sp, u: o.u, state: o.state })),
    };
  }

  return {
    reset() {
      resetWorld();
      ctx.setLives(lives);
      ctx.setMeter(boost, 'BOOST');
      placeCamera(0, true);
      ctx.toast('HIT THE TRAIL!');
      warped = false;
    },
    update(dt, input) {
      if (WARP && !warped) {
        warped = true;
        for (let i = 0; i < WARP * 60 && !over; i++) step(1 / 60, autoInput(), false);
      }
      if (over) return;
      let inp;
      if (AUTO) inp = autoInput();
      else {
        const P = input.pressed;
        if (P.has('left') && !input.left) nudge = Math.min(nudge, 0) - 1.8;
        if (P.has('right') && !input.right) nudge = Math.max(nudge, 0) + 1.8;
        if ((P.has('up') && !input.up) || (P.has('action') && !input.action)) boostPulse = 0.7;
        if (P.has('down') && !input.down) brakePulse = 0.45;
        let steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        if (steer) nudge = 0;
        else if (Math.abs(nudge) > 0.05) steer = Math.sign(nudge);
        inp = { steer, boost: input.up || input.action || boostPulse > 0, brake: input.down || brakePulse > 0 };
      }
      step(dt, inp, false);
      ctx.setMeter(boost, boost < 0.05 ? 'BOOST: EMPTY' : 'BOOST');
      placeCamera(dt);
    },
    idle(dt) {
      if (dying || over) {
        // Crash finished: let the Bronco limp back into a demo drive.
        idleCam.pos.copy(ctx.camera.position);
        idleCam.tx = idleCam.ty = 0;
        dying = 0;
        over = false;
        invuln = 0;
        body.visible = true;
      }
      step(dt, autoInput(), true);
      placeIdleCamera(dt);
    },
  };
}
