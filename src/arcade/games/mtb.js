// Send It: Basil mountain bikes down an endless forest trail.
// Steer to stay on the dirt, hop logs and rock gardens, launch off kickers over
// the brand banners and hold jump in the air to backflip. Land upright or crash.
//
// The trail is generated in mtb-track.js and baked into one mesh per 24-row
// chunk (mtb-bake.js), so the forest stays cheap enough for phones.
import { Baker, template } from './mtb-bake.js';
import { createTrack, SLOPE, VERGE, BRANDS, baseSpeed } from './mtb-track.js';

const TAU = Math.PI * 2;
const G = 22; // gravity
const HOP_V = 6.5; // bunny hop launch speed
const FLIP_RATE = 9; // rad/s while holding flip
const CHUNK = 24;
const AHEAD = 96;
const BEHIND = 12;
const DIRT = ['#b27b4f', '#a8714a'];
const GRASS = ['#86c95a', '#7cbf51'];
const DUST = ['#b27b4f', '#c89163', '#d9b38c', '#8f5f3a'];
const LEAVES = ['#3c9a5f', '#7cc242', '#8fd14f', '#2f7d5b'];
const VERGE_FX = ['#5fa83a', '#86c95a', '#7a4b33'];
const FLIP_NAMES = ['', 'BACKFLIP!', 'DOUBLE FLIP!', 'TRIPLE FLIP!', 'QUAD FLIP!'];
const FLIP_PTS = [0, 300, 800, 1500, 2500];
const LAND_NAMES = ['SKETCHY!', 'CLEAN LANDING', 'PERFECT LANDING'];
const LAND_PTS = [0, 50, 100];
const CRASH = {
  tree: ['Hugged a tree.', 'The forest won that one.', 'Stay on the dirt.'],
  log: ['Clipped a log. Hop it next time.', 'Log 1, Basil 0.'],
  rock: ['The rock garden won.', 'Find the gap in the rocks.'],
  under: ['Under-rotated. Face, meet dirt.', 'Not quite all the way round.'],
  over: ['Over-rotated. Looped out.', 'Too much flip.'],
};
const FAN_LOOKS = [
  { shirt: '#15c2b0', shirtDark: '#0f9486', beard: null, cap: '#111111' },
  { shirt: '#ff4d6d', shirtDark: '#d93a57', skin: '#e2b08c', beard: null, longHair: true, hair: '#5a3825' },
  { shirt: '#ffd23f', shirtDark: '#e0b52a', skin: '#8d5a3b', beard: null, pants: '#3b3355' },
  { shirt: '#7b61ff', shirtDark: '#5d47d6', skin: '#f1c7a5', beard: null, cap: '#ff8a1f', hair: '#c9a15a' },
  { shirt: '#f6c6d0', shirtDark: '#e3a3b2', pants: '#1e6b3a' },
  { shirt: '#ffffff', shirtDark: '#dddddd', beard: null, longHair: true, hair: '#2b1e18' },
];

const wrapPi = (a) => a - TAU * Math.round(a / TAU);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export default function create(ctx) {
  const { THREE, scene, models, sign, clamp, lerp } = ctx;
  const rnd = Math.random;
  const botPlay = new URLSearchParams(location.search).has('mtbbot'); // test hook: autopilot in play
  const V = new THREE.Vector3();

  scene.background = new THREE.Color('#bdeeff');
  scene.fog = new THREE.Fog('#bdeeff', 42, 94);

  // ---------- Voxel templates (the site's models, baked) ----------
  function fan(look) {
    const p = models.makePlayer(look);
    // Cheering: arms up, hands on top.
    p.armL.position.set(-0.37, 0.8, 0);
    p.armL.rotation.z = 0.35;
    p.armR.position.set(0.37, 0.8, 0);
    p.armR.rotation.z = -0.35;
    p.body.children.forEach((m) => {
      if (m.isMesh && Math.abs(m.scale.x - 0.11) < 1e-3 && Math.abs(m.scale.y - 0.08) < 1e-3) {
        m.position.set(Math.sign(m.position.x) * 0.44, 1.0, 0);
      }
    });
    return template(p.root);
  }
  const TPL = {
    pines: [0, 1, 2].map(() => template(models.pine(null, 0, 0, 0))),
    trees: [0, 1, 2, 3, 4].map(() => template(models.tree(null, 0, 0, 0))),
    rock: template(models.rock(null, 0, 0, 0)),
    fans: FAN_LOOKS.map(fan),
  };

  // ---------- Pooled signs (canvas textures, so not baked) ----------
  const pool = (make, n) =>
    Array.from({ length: n }, () => {
      const o = make();
      o.visible = false;
      o.userData.free = true;
      return o;
    });
  const take = (list) => {
    const o = list.find((x) => x.userData.free);
    if (o) {
      o.userData.free = false;
      o.visible = true;
    }
    return o;
  };
  const banners = BRANDS.map(([name, bg, fg]) =>
    pool(() => sign(scene, [name], { w: 5.4, h: 0.9, post: 2.15, bg, fg, size: 40 }), 2),
  );
  const boards = pool(
    () => sign(scene, ['FRESHLY', 'COMMERCE'], { w: 1.7, h: 0.8, post: 0.55, bg: '#111', fg: '#15c2b0', size: 14 }),
    8,
  );

  // ---------- Trail chunks ----------
  const track = createTrack(rnd);
  const voxMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const baker = new Baker();
  const chunks = new Map();

  function buildChunk(c) {
    const r0 = c * CHUNK;
    const r1 = r0 + CHUNK;
    track.ensure(r1 + 90);
    const { rows } = track;
    const used = [];

    // Keep trees off banner posts, signs and spectators.
    const marks = track.marks.filter((m) => m.row >= r0 - 3 && m.row < r1 + 3);
    const keep = new Map();
    const block = (row, side, rad) => {
      for (let i = row - rad; i <= row + rad; i++) {
        const k = keep.get(i) || { l: false, r: false };
        if (side <= 0) k.l = true;
        if (side >= 0) k.r = true;
        keep.set(i, k);
      }
    };
    for (const m of marks) {
      if (m.type === 'banner') block(m.row, 0, 1);
      else if (m.type === 'sign') block(m.row, m.side, 1);
      else block(m.row, 0, 2);
    }

    // Ground: grass rows with the dirt strip winding through them.
    for (let r = r0; r < r1; r++) {
      const { cx, w } = rows[r];
      const z = -(r + 0.5);
      const y = -SLOPE * (r + 0.5);
      baker.box(90, 3, 1, GRASS[r & 1], cx, y - 3, z);
      baker.box(2 * w, 0.04, 1, DIRT[r & 1], cx, y, z);
      baker.box(0.16, 0.05, 1, '#8f5f3a', cx - w + 0.08, y, z);
      baker.box(0.16, 0.05, 1, '#8f5f3a', cx + w - 0.08, y, z);
      if (r % 3 === 0) baker.box(0.1, 0.045, 0.6, '#9a6640', cx + (rnd() - 0.5) * w, y, z);
    }
    const ground = new THREE.Mesh(baker.geometry(), voxMat);
    ground.receiveShadow = true;

    // Props: forest, verge, course flags, obstacles, kickers, fans.
    for (let r = r0; r < r1; r++) {
      const { cx, w } = rows[r];
      const z = -(r + 0.5);
      const y = -SLOPE * (r + 0.5);
      const k = keep.get(r);
      for (const side of [-1, 1]) {
        const blocked = k && (side < 0 ? k.l : k.r);
        if (!blocked && rnd() < 0.85) {
          const isPine = rnd() < 0.62;
          const s = 1 + rnd() * 0.5;
          const half = (isPine ? 0.45 : 0.4) * s;
          const x = cx + side * (w + VERGE + 0.25 + half + rnd() * 0.35);
          baker.put(isPine ? pick(TPL.pines) : pick(TPL.trees), x, y, z + (rnd() - 0.5) * 0.5, 0, s);
        }
        if (rnd() < 0.75) {
          const x = cx + side * (w + 2.7 + rnd() * 2.6);
          baker.put(rnd() < 0.6 ? pick(TPL.pines) : pick(TPL.trees), x, y, z + (rnd() - 0.5) * 0.6, 0, 1.3 + rnd() * 0.7);
        }
        if (rnd() < 0.7) {
          const x = cx + side * (w + 5.6 + rnd() * 11);
          baker.put(rnd() < 0.65 ? pick(TPL.pines) : pick(TPL.trees), x, y, z + (rnd() - 0.5) * 0.6, 0, 1.5 + rnd() * 1.1);
        }
        if (rnd() < 0.06) baker.put(TPL.rock, cx + side * (w + 3 + rnd() * 8), y, z, 0, 1 + rnd() * 0.8);
        if (rnd() < 0.35) baker.box(0.12, 0.14 + rnd() * 0.12, 0.12, '#5fa83a', cx + side * (w + 0.12 + rnd() * 0.42), y, z + (rnd() - 0.5) * 0.8);
        if (rnd() < 0.08) {
          const fc = pick(['#ff6fa8', '#ffd23f', '#ffffff', '#b28dff']);
          const fx = cx + side * (w + 0.2 + rnd() * 0.3);
          baker.box(0.1, 0.1, 0.1, fc, fx, y, z);
          baker.box(0.1, 0.1, 0.1, fc, fx + 0.18, y, z + 0.15);
        }
      }
      // Freshly-teal course flags marking the edge of the dirt.
      if (r % 6 === 0) {
        for (const side of [-1, 1]) {
          const fx = cx + side * (w + 0.22);
          baker.box(0.05, 0.75, 0.05, '#f4f4f4', fx, y, z);
          baker.box(0.03, 0.22, 0.32, '#15c2b0', fx, y + 0.5, z - 0.17);
        }
      }
    }
    for (const o of track.obstacles) {
      if (o.row < r0 || o.row >= r1) continue;
      const y = -SLOPE * o.d;
      if (o.type === 'log') {
        const { cx, w } = rows[o.row];
        baker.box(2 * w + 0.9, 0.36, 0.38, '#7a4b33', cx, y - 0.02, -o.d);
        baker.box(2 * w + 0.92, 0.06, 0.4, '#6b3f2a', cx, y + 0.22, -o.d);
        baker.box(0.06, 0.3, 0.3, '#d9a36b', cx - w - 0.46, y + 0.01, -o.d);
        baker.box(0.06, 0.3, 0.3, '#d9a36b', cx + w + 0.46, y + 0.01, -o.d);
      } else {
        baker.put(TPL.rock, o.x, y, -o.d, rnd() < 0.5 ? 0 : Math.PI / 2, o.s);
      }
    }
    for (const k of track.kickers) {
      if (k.d0 < r0 || k.d0 >= r1) continue;
      const { cx, w } = rows[Math.floor(k.d0)];
      const W = 2 * w + 0.3;
      const n = Math.round((k.d1 - k.d0) / 0.2);
      let top = 0;
      for (let i = 0; i < n; i++) {
        const dm = k.d0 + (i + 0.5) * 0.2;
        const base = -SLOPE * dm - 0.3;
        top = track.groundAt(dm);
        baker.box(W, top - base, 0.2, '#9b6b43', cx, base, -dm);
        baker.box(W, 0.05, 0.2, '#c89163', cx, top - 0.03, -dm);
      }
      // Teal lip so you can read the takeoff from far away.
      baker.box(W + 0.04, 0.1, 0.12, '#15c2b0', cx, top - 0.06, -(k.d1 - 0.07));
      if (k.big) {
        for (const side of [-1, 1]) baker.box(0.16, k.H + 0.3, 0.16, '#6b3f2a', cx + side * (W / 2 - 0.1), -SLOPE * k.d1 - 0.3, -(k.d1 + 0.12));
      }
    }
    for (const m of marks) {
      if (m.row < r0 || m.row >= r1) continue;
      const { cx, w } = rows[m.row];
      const y = -SLOPE * (m.row + 0.5);
      const z = -(m.row + 0.5);
      if (m.type === 'banner') {
        const o = take(banners[m.brand]);
        if (o) {
          o.position.set(cx, y, z);
          used.push(o);
        }
      } else if (m.type === 'sign') {
        const o = take(boards);
        if (o) {
          o.position.set(cx + m.side * (w + VERGE + 0.95), y, z);
          o.rotation.y = -m.side * 0.55;
          used.push(o);
        }
      } else {
        for (const side of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            const x = cx + side * (w + VERGE + 0.4 + i * 0.5 + rnd() * 0.2);
            const rot = side < 0 ? -Math.PI / 2 - 0.45 : Math.PI / 2 + 0.45;
            baker.put(pick(TPL.fans), x, y, z + (i - 1) * 0.75, rot + (rnd() - 0.5) * 0.4);
          }
        }
      }
    }
    const props = new THREE.Mesh(baker.geometry(), voxMat);

    props.castShadow = true;
    props.receiveShadow = true;
    scene.add(ground, props);
    chunks.set(c, { ground, props, used });
  }

  function disposeChunk(c) {
    const ch = chunks.get(c);
    scene.remove(ch.ground, ch.props);
    ch.ground.geometry.dispose();
    ch.props.geometry.dispose();
    ch.used.forEach((o) => {
      o.visible = false;
      o.userData.free = true;
    });
    chunks.delete(c);
  }

  function updateChunks(d, budget = 99) {
    const first = Math.max(0, Math.floor((d - BEHIND) / CHUNK));
    const last = Math.floor((d + AHEAD) / CHUNK);
    for (const c of [...chunks.keys()]) if (c < first || c > last) disposeChunk(c);
    for (let c = first; c <= last && budget > 0; c++) {
      if (!chunks.has(c)) {
        buildChunk(c);
        budget--;
      }
    }
  }

  // ---------- Basil on the bike ----------
  // rig (position) > yaw (steer) > roll (lean) > pitch (flips, pivot at the bike's middle)
  const rig = new THREE.Group();
  const yawG = new THREE.Group();
  const rollG = new THREE.Group();
  const pitchG = new THREE.Group();
  const content = new THREE.Group();
  scene.add(rig);
  rig.add(yawG);
  yawG.add(rollG);
  rollG.add(pitchG);
  pitchG.add(content);
  pitchG.position.y = 0.72;
  content.position.y = -0.72;
  content.add(models.makeBike());
  const rider = models.makePlayer();
  rider.gear.helmet.visible = true;
  function seat() {
    content.add(rider.root);
    rider.root.position.set(0, 0.42, 0.08);
    rider.root.rotation.set(0, 0, 0);
    rider.body.rotation.set(-0.2, 0, 0);
    rider.body.scale.set(1, 1, 1);
    rider.armL.rotation.x = 0.7;
    rider.armR.rotation.x = 0.7;
  }

  // ---------- Run state ----------
  const S = {};
  let demo = true; // title-screen attract mode: the bot rides, nothing scores
  let played = false;
  let oi = 0; // obstacle cursor
  let gi = 0; // rock garden cursor (bot)
  let gs = 0; // rock garden cursor (scoring)
  let dustT = 0;
  let meterKey = '';

  function resetRun(isDemo) {
    demo = isDemo;
    for (const c of [...chunks.keys()]) disposeChunk(c);
    track.reset();
    Object.assign(S, {
      d: 2, x: 0, y: -SLOPE * 2, vx: 0, vy: 0, speed: 9, pitch: -Math.atan(SLOPE), angVel: 0,
      air: false, kick: null, airT: 0, launchPitch: 0, armed: true, boost: 0, pop: false,
      jumpBuf: 0, nudge: 0, verge: false, inv: 0, mode: 'ride', crashT: 0, lives: 3, kind: 'tree',
      squash: 0, botN: -1, distPts: 0, crashV: 0, rvx: 0, rvy: 0, rvz: 0, rspin: 0, bspin: 0, broll: 0,
    });
    oi = gi = gs = 0;
    seat();
    rig.visible = true;
    rollG.rotation.set(0, 0, 0);
    rollG.position.y = 0;
    yawG.rotation.set(0, 0, 0);
    updateChunks(S.d);
    place();
    frameCamera(0, true);
  }

  // ---------- Input ----------
  function readInput(input) {
    const p = input.pressed;
    const hold = input.up || input.action;
    if (!hold) S.armed = true;
    let steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    // Swipes arrive as one-shot presses with nothing held: a short nudge.
    if (p.has('left') && !input.left) S.nudge = -0.2;
    if (p.has('right') && !input.right) S.nudge = 0.2;
    if (S.nudge) steer = Math.sign(S.nudge);
    const jump = p.has('up') || p.has('action');
    const tap = (p.has('up') && !input.up) || (p.has('action') && !input.action);
    if (jump) {
      S.jumpBuf = 0.12;
      if (S.air && tap) S.boost = 0.3; // a tap or swipe in the air flips like a short hold
    }
    return { steer, hold, brake: input.down };
  }

  // Autopilot for the title screen (and ?mtbbot testing).
  function botInput() {
    let tx = track.cxAt(S.d + 1.2 + S.speed * 0.16);
    const gardens = track.gardens;
    while (gi < gardens.length && gardens[gi].d1 < S.d - 1) gi++;
    const g = gardens[gi];
    if (g && g.d0 - S.d < 12) tx = g.gap;
    const steer = clamp((tx - S.x) * 3 - S.vx * 0.2, -1, 1);
    let jump = false;
    const ob = track.obstacles;
    for (let j = oi; j < ob.length && ob[j].d < S.d + S.speed * 0.3; j++) {
      const o = ob[j];
      if (o.type === 'log' && o.d > S.d && (o.d - S.d) / S.speed < 0.12) jump = true;
    }
    const k = track.nextKicker(S.d);
    if (k && S.d > k.d0 - 1 && (k.d1 - S.d) / S.speed < 0.25) jump = true;
    if (jump && !S.air) S.jumpBuf = 0.05;
    let flip = false;
    if (S.air && S.kick) {
      if (S.botN < 0) {
        const b = S.vy + SLOPE * S.speed;
        const c = S.y + SLOPE * S.d;
        const T = (b + Math.sqrt(b * b + 2 * G * c)) / G;
        S.botN = Math.max(0, Math.floor(((T - 0.42) * FLIP_RATE + 1.0) / TAU));
      }
      flip = S.pitch - S.launchPitch < S.botN * TAU - 1.0;
    }
    return { steer, bot: true, flip, brake: false };
  }

  // ---------- Physics ----------
  function simulate(dt, inp) {
    if (S.mode === 'crash') return crashStep(dt);
    if (S.mode !== 'ride') return;
    S.inv = Math.max(0, S.inv - dt);
    S.squash = Math.max(0, S.squash - dt * 4);
    if (S.nudge) {
      const s = Math.sign(S.nudge);
      S.nudge -= s * dt;
      if (Math.sign(S.nudge) !== s) S.nudge = 0;
    }
    const n = Math.max(1, Math.ceil(dt * 120));
    for (let i = 0; i < n && S.mode === 'ride'; i++) {
      step(dt / n, inp);
      if (S.mode === 'ride') collide();
    }
    S.boost = Math.max(0, S.boost - dt);
    S.jumpBuf = Math.max(0, S.jumpBuf - dt);
    // Distance: 1 point per unit, added in whole points (the HUD re-formats on every add).
    if (!demo && S.mode === 'ride') {
      S.distPts += S.speed * dt;
      if (S.distPts >= 1) {
        const p = Math.floor(S.distPts);
        S.distPts -= p;
        ctx.addScore(p);
      }
    }
  }

  function step(h, inp) {
    const target = baseSpeed(S.d) * (inp.brake ? 0.7 : 1) * (S.verge && !S.air ? 0.8 : 1);
    S.speed += clamp(target - S.speed, -8 * h, 2.4 * h);
    const maxLat = 3.6 + S.speed * 0.24;
    S.vx += (inp.steer * maxLat - S.vx) * Math.min(1, h * (S.air ? 3.5 : 11));
    S.x += S.vx * h;
    const prev = S.d;
    S.d += S.speed * h;
    if (S.air) airStep(h, inp);
    else groundStep(h, prev);
  }

  function groundStep(h, prev) {
    const k = track.kickerAt(prev);
    if (k && S.d > k.d1) return launch(k);
    S.y = track.groundAt(S.d);
    S.pitch += (track.groundAngle(S.d) - S.pitch) * Math.min(1, h * 16);
    if (S.jumpBuf > 0) {
      S.jumpBuf = 0;
      const nk = track.nextKicker(S.d);
      if (nk && S.d > nk.d0 - 1.5) {
        // On (or about to hit) a kicker: jump = pop off the lip, if it's timed late.
        if ((nk.d1 - S.d) / S.speed < 0.45) S.pop = true;
      } else hop();
    }
  }

  function launch(k) {
    S.air = true;
    S.kick = k;
    S.airT = 0;
    S.vy = k.vy + (S.pop ? 2.5 : 0);
    S.y = -SLOPE * k.d1 + k.H;
    S.launchPitch = S.pitch;
    S.angVel = 0;
    S.botN = -1;
    if (S.pop) ctx.emit(['#ffd23f', '#ffffff', '#15c2b0'], V.set(S.x, S.y + 0.2, -S.d), 14, { speed: 2.5, up: 2, life: 0.5 });
    S.pop = false;
  }

  function hop() {
    S.air = true;
    S.kick = null;
    S.airT = 0;
    S.vy = HOP_V;
    S.launchPitch = S.pitch;
    S.angVel = 0;
    S.armed = false; // the press that hopped doesn't also flip; release and press again
  }

  function airStep(h, inp) {
    S.vy -= G * h;
    S.y += S.vy * h;
    S.airT += h;
    const flipping = inp.bot ? inp.flip : (inp.hold && S.armed) || S.boost > 0;
    if (flipping) S.angVel += (FLIP_RATE - S.angVel) * Math.min(1, h * 10);
    else {
      // Let go: the nose settles to follow the arc when it's near upright,
      // otherwise the spin bleeds off and you're stuck mid-rotation.
      const path = Math.atan2(S.vy, S.speed) * 0.35;
      const err = path + TAU * Math.round((S.pitch - path) / TAU) - S.pitch;
      if (Math.abs(err) < 0.9) S.angVel += (err * 12 - S.angVel) * Math.min(1, h * 9);
      else S.angVel *= Math.exp(-3.5 * h);
    }
    S.pitch += S.angVel * h;
    const g = track.groundAt(S.d);
    if (S.y <= g && (S.vy < 0 || S.airT > 0.05)) land(g);
  }

  function land(g) {
    S.y = g;
    S.air = false;
    S.vy = 0;
    S.angVel = 0;
    const ga = track.groundAngle(S.d);
    const err = wrapPi(S.pitch - ga);
    const flips = Math.max(0, Math.round((S.pitch - S.launchPitch) / TAU));
    if (Math.abs(err) > 0.85) return crash(err < 0 ? 'under' : 'over');
    S.pitch = ga + err;
    S.squash = 1;
    const kick = S.kick;
    S.kick = null;
    ctx.emit(DUST, V.set(S.x, g + 0.1, -S.d), kick ? 18 : 6, { speed: 2.2, up: 1.6, life: 0.5, size: 0.14 });
    if (!kick) return;
    if (kick.big) ctx.shake(0.15);
    if (demo) return;
    const a = Math.abs(err);
    const q = a < 0.2 ? 2 : a < 0.45 ? 1 : 0;
    const pts = Math.round(S.airT * 60) + LAND_PTS[q] + FLIP_PTS[Math.min(flips, 4)];
    ctx.addScore(pts);
    ctx.toast(`${flips ? FLIP_NAMES[Math.min(flips, 4)] : LAND_NAMES[q]} +${pts}`);
  }

  function collide() {
    const w = track.wAt(S.d);
    if (!S.air) {
      const off = Math.abs(S.x - track.cxAt(S.d));
      if (off > w + VERGE) return crash('tree');
      S.verge = off > w;
    }
    const ob = track.obstacles;
    while (oi < ob.length && ob[oi].d < S.d - 3) oi++;
    const ha = S.y - track.groundAt(S.d);
    for (let j = oi; j < ob.length && ob[j].d < S.d + 1; j++) {
      const o = ob[j];
      if (o.type === 'log') {
        if (S.inv <= 0 && Math.abs(S.d - o.d) < 0.4 && ha < o.h) return crash('log');
        if (!o.done && S.d > o.d + 0.5) {
          o.done = true;
          if (!demo && S.inv <= 0) {
            ctx.addScore(25);
            ctx.toast('LOG HOP +25');
          }
        }
      } else if (S.inv <= 0 && Math.abs(S.d - o.d) < 0.5 && Math.abs(S.x - o.x) < 0.48 * o.s && ha < o.h * o.s) {
        return crash('rock');
      }
    }
    const gardens = track.gardens;
    const g = gardens[gs];
    if (g && S.d > g.d1 + 0.4) {
      gs++;
      if (!g.done && !demo) {
        ctx.addScore(40);
        ctx.toast('ROCK GARDEN +40');
      }
    }
  }

  // ---------- Crashes ----------
  function crash(kind) {
    if (S.mode !== 'ride') return;
    S.mode = 'crash';
    S.crashT = 0;
    S.kind = kind;
    ctx.emit(DUST, V.set(S.x, S.y + 0.4, -S.d), 40, { speed: 3.2, up: 4.5, life: 0.9, size: 0.18 });
    if (kind === 'tree') ctx.emit(LEAVES, V.set(S.x, S.y + 1.4, -S.d), 24, { speed: 2.5, up: 2, life: 1.1, size: 0.16, gravity: 5 });
    ctx.shake(0.8);
    S.crashV = S.speed * (kind === 'tree' ? 0.2 : 0.4);
    yawG.attach(rider.root);
    S.rvz = -S.speed * 0.3;
    S.rvy = kind === 'tree' ? 3 : 4.5;
    S.rvx = (rnd() - 0.5) * 2;
    S.rspin = 6 + rnd() * 5;
    S.bspin = (kind === 'over' ? 1 : -1) * (5 + rnd() * 4);
    S.broll = (rnd() < 0.5 ? -1 : 1) * 1.45;
    S.air = false;
    S.verge = false;
    S.kick = null;
    // Whatever you crashed in doesn't score.
    for (const o of track.obstacles) if (Math.abs(o.d - S.d) < 8) o.done = true;
    for (const gd of track.gardens) if (gd.d0 < S.d + 8 && gd.d1 > S.d - 4) gd.done = true;
    if (!demo) {
      S.lives--;
      ctx.setLives(S.lives);
    }
  }

  function crashStep(dt) {
    S.crashT += dt;
    S.crashV *= Math.exp(-2.5 * dt);
    S.d += S.crashV * dt;
    S.y = track.groundAt(S.d);
    // The bike tumbles, then lies on its side.
    S.bspin *= Math.exp(-4 * dt);
    S.pitch += S.bspin * dt;
    const k = 1 - Math.exp(-6 * dt);
    if (S.crashT > 0.4) S.pitch += (TAU * Math.round(S.pitch / TAU) - S.pitch) * k;
    rollG.rotation.z += (S.broll - rollG.rotation.z) * k;
    rollG.position.y += (-0.5 - rollG.position.y) * k;
    // Basil goes over the bars.
    const r = rider.root.position;
    S.rvy -= G * dt;
    r.x += S.rvx * dt;
    r.y += S.rvy * dt;
    r.z += S.rvz * dt;
    const floor = SLOPE * r.z + 0.05;
    if (r.y < floor) {
      r.y = floor;
      S.rvy = Math.abs(S.rvy) * 0.25;
      S.rvz *= 0.5;
      S.rvx *= 0.5;
      S.rspin *= 0.5;
    }
    rider.root.rotation.x -= S.rspin * dt;
    if (S.crashT > 1.35) {
      if (demo || S.lives > 0) respawn();
      else {
        S.mode = 'dead';
        ctx.end(pick(CRASH[S.kind]));
      }
    }
  }

  function clearAt(d) {
    const k = track.nextKicker(d - 1);
    if (k && k.d0 < d + 9) return false;
    const ob = track.obstacles;
    for (let j = oi; j < ob.length && ob[j].d < d + 9; j++) if (ob[j].d > d - 1.5) return false;
    return true;
  }

  function respawn() {
    let d = S.d + 1;
    for (let i = 0; i < 400 && !clearAt(d); i++) d += 1;
    Object.assign(S, {
      d, x: track.cxAt(d), y: track.groundAt(d), vx: 0, vy: 0, speed: Math.max(9, S.speed * 0.75),
      pitch: track.groundAngle(d), angVel: 0, air: false, kick: null, pop: false, mode: 'ride', inv: 1.5,
      jumpBuf: 0, boost: 0, nudge: 0, armed: false,
    });
    seat();
    rollG.rotation.set(0, 0, 0);
    rollG.position.y = 0;
  }

  // ---------- Presentation ----------
  function place() {
    rig.position.set(S.x, S.y, -S.d);
    pitchG.rotation.x = S.pitch;
    if (S.mode !== 'ride') return;
    const maxLat = 3.6 + S.speed * 0.24;
    yawG.rotation.y = -Math.atan2(S.vx, S.speed) * 0.9;
    rollG.rotation.z = (-S.vx / maxLat) * 0.32;
    rider.body.scale.y = 1 - 0.14 * S.squash;
    const tuck = S.air && Math.abs(S.angVel) > 2 ? 0.45 : 0;
    rider.body.rotation.x += (-0.2 - tuck - rider.body.rotation.x) * 0.25;
    rig.visible = S.inv > 0 ? Math.floor(S.inv * 10) % 2 === 0 : true;
  }

  function fx(dt) {
    if (S.mode !== 'ride' || S.air) return;
    dustT -= dt;
    if (dustT > 0) return;
    dustT = S.verge ? 0.03 : 0.07;
    V.set(S.x, S.y + 0.05, -S.d + 0.5);
    ctx.emit(S.verge ? VERGE_FX : DUST, V, 1, { speed: 0.6, up: 1.2, gravity: 5, life: 0.45, size: 0.11 });
    if (S.verge && !demo) ctx.shake(0.04);
  }

  const cam = { x: 0, y: 5, side: 0 };
  const LOOK = new THREE.Vector3();
  function frameCamera(dt, snap = false) {
    const camera = ctx.camera;
    // Basil sits about two thirds down the screen with the trail ahead above
    // him; tall phones sit higher and further back so the next jump shows.
    const tall = camera.aspect < 0.8;
    const back = tall ? 8 : 7;
    const up = tall ? 6.2 : 5;
    const ahead = tall ? 10 : 9;
    const lookH = tall ? 0.3 : 0;
    const cxA = track.cxAt(S.d + ahead);
    const gy = -SLOPE * S.d;
    const air = Math.max(0, S.y - gy - 0.6);
    // Trick cam: swing out to a 3/4 view while airborne off a kicker so flips read.
    const sideT = S.mode === 'ride' && S.air && S.kick ? (tall ? 1.8 : 2.8) : 0;
    const ks = snap ? 1 : 1 - Math.exp(-dt * 2.5);
    cam.side += (sideT - cam.side) * ks;
    const kx = snap ? 1 : 1 - Math.exp(-dt * 4);
    const ky = snap ? 1 : 1 - Math.exp(-dt * 6);
    cam.x += (lerp(S.x, cxA, 0.4) - cam.x) * kx;
    cam.y += (gy + up + air * 0.85 - cam.y) * ky;
    camera.position.set(cam.x + cam.side, cam.y, -S.d + back);
    const sf = Math.min(1, cam.side / 1.5);
    LOOK.set(lerp(lerp(cam.x, cxA, 0.4), S.x, sf), gy - SLOPE * ahead + lookH + air * 0.7, -S.d - ahead);
    camera.lookAt(LOOK);
    ctx.followSun(V.set(S.x, gy, -S.d - 5));
  }

  function hud() {
    if (demo) return;
    const kmh = Math.round(S.speed * 2.6);
    const key = String(kmh);
    if (key === meterKey) return;
    meterKey = key;
    ctx.setMeter((S.speed - 6) / 18, `${kmh} KM/H`);
  }

  function frame(dt, inp) {
    simulate(dt, inp);
    place();
    fx(dt);
    updateChunks(S.d, 1);
    frameCamera(dt);
    hud();
  }

  resetRun(true);

  return {
    // Test hook (?debug): live run state + trail.
    debug: { S, track },
    reset() {
      played = true;
      meterKey = '';
      resetRun(false);
      ctx.setLives(S.lives);
      hud();
    },
    update(dt, input) {
      frame(dt, botPlay ? botInput() : readInput(input));
    },
    idle(dt, t) {
      if (!played) return frame(dt, botInput());
      // Game over: leave the wreck where it is and drift the camera a little.
      frameCamera(dt);
      ctx.camera.position.x += Math.sin(t * 0.5) * 0.6;
    },
  };
}
