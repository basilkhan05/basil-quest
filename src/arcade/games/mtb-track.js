// Send It: endless trail generator. The trail is a list of 1-unit rows going
// downhill along -z (row r covers distance d in [r, r + 1), world z = -d).
// Each row has a center x and half-width; features (logs, rock gardens,
// kickers) and decorations (banners, signs, fans) hang off row indices.

export const SLOPE = 0.12; // downhill drop per unit of distance
export const VERGE = 0.6; // grass between the dirt and the tree wall
export const BRANDS = [
  ['GLOSSIER', '#f6c6d0', '#1b1b1f'],
  ['STANLEY', '#1e6b3a', '#ffffff'],
  ['YAMAHA', '#4b2a7b', '#ffffff'],
  ['SIMPLE BUNDLES', '#ff4d6d', '#ffffff'],
  ['FRESHLY COMMERCE', '#15c2b0', '#111111'],
];
export const FRESHLY = 4;

// Cruising speed (units/s) the rider settles into at distance d.
export const baseSpeed = (d) => 9 + 13 * (1 - Math.exp(-d / 2200));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createTrack(rnd = Math.random) {
  const T = {
    rows: [],
    obstacles: [], // { type: 'log' | 'rock', row, d, x?, h, s? }
    kickers: [], // { d0, d1, H, vy, big }
    gardens: [], // { d0, d1, gap }
    marks: [], // { type: 'banner' | 'sign' | 'fans', row, ... }
  };
  let gen;
  let ki = 0; // kicker search hint (moves with the rider)

  const diff = () => clamp(T.rows.length / 2600, 0, 1);

  function pushRows(n, cxEnd) {
    const cx0 = gen.cx;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const k = t * t * (3 - 2 * t);
      const r = T.rows.length;
      T.rows.push({ cx: cx0 + (cxEnd - cx0) * k, w: 1.75 - 0.42 * clamp(r / 2600, 0, 1) });
      if (r >= gen.nextSign) {
        gen.signSide = -gen.signSide;
        T.marks.push({ type: 'sign', row: r, side: gen.signSide });
        gen.nextSign = r + 15 + Math.floor(rnd() * 10);
      }
    }
    gen.cx = cxEnd;
  }

  function wind(n = 12 + Math.floor(rnd() * 16)) {
    const amp = 1.1 + 2.6 * diff();
    let to = gen.cx + (rnd() < 0.5 ? -1 : 1) * amp * (0.6 + rnd() * 0.4);
    if (Math.abs(to) > 5) to = gen.cx - Math.sign(to) * amp * 0.8;
    // Never shift more than ~0.26 per row so the tree walls stay continuous.
    n = Math.max(n, Math.ceil((Math.abs(to - gen.cx) * 1.5) / 0.26));
    pushRows(n, to);
  }

  function logs() {
    const count = 1 + (rnd() < 0.35 + diff() * 0.4 ? 1 : 0) + (diff() > 0.45 && rnd() < 0.35 ? 1 : 0);
    pushRows(5, gen.cx);
    for (let i = 0; i < count; i++) {
      const r = T.rows.length + 1;
      pushRows(3, gen.cx);
      T.obstacles.push({ type: 'log', row: r, d: r + 0.5, h: 0.36 });
      if (rnd() < 0.3) {
        // A double: two logs close enough to clear with one hop.
        pushRows(2, gen.cx);
        T.obstacles.push({ type: 'log', row: r + 3, d: r + 3.5, h: 0.36 });
        pushRows(2, gen.cx);
      }
      // Room to land and hop again at the speed you'll be doing here.
      const gap = Math.ceil(baseSpeed(r) * 0.62) + 4 + Math.floor(rnd() * 5);
      if (i < count - 1) pushRows(gap, gen.cx + (rnd() - 0.5) * 0.8);
    }
    pushRows(4, gen.cx);
  }

  function rocks() {
    pushRows(5, gen.cx);
    const depth = 2 + (rnd() < 0.3 + diff() * 0.5 ? 1 : 0);
    const r0 = T.rows.length;
    pushRows(depth + 3, gen.cx);
    const { w } = T.rows[r0];
    const cx = gen.cx;
    let gap = cx + (rnd() - 0.5) * (2 * w - 1.5);
    const garden = { d0: r0 + 1, d1: r0 + 1 + depth, gap, done: false };
    for (let k = 0; k < depth; k++) {
      const r = r0 + 1 + k;
      for (let x = cx - w + 0.35; x <= cx + w - 0.25; x += 0.72) {
        if (Math.abs(x - gap) < 0.95) continue;
        T.obstacles.push({
          type: 'rock', row: r, d: r + 0.5 + (rnd() - 0.5) * 0.3, x: x + (rnd() - 0.5) * 0.12,
          h: 0.5, s: 0.85 + rnd() * 0.3,
        });
      }
    }
    T.obstacles.sort((a, b) => a.d - b.d);
    T.gardens.push(garden);
    pushRows(3, gen.cx);
  }

  function kicker(big) {
    pushRows(big ? 10 : 7, gen.cx);
    const d0 = T.rows.length + 0.2;
    const L = big ? 5 : 2.6;
    const k = { d0, d1: d0 + L, H: big ? 1.7 : 0.85, vy: big ? 12.5 : 8.6, big };
    T.kickers.push(k);
    pushRows(Math.ceil(L) + 1, gen.cx);
    if (big) {
      const lip = Math.floor(k.d1);
      T.marks.push({ type: 'banner', row: lip + 6, brand: gen.brand });
      gen.brand = (gen.brand + 1) % BRANDS.length;
      T.marks.push({ type: 'fans', row: lip - 2 });
      T.marks.push({ type: 'fans', row: lip + 17 });
    }
    // Straight, clear run-out long enough to land at the speed you'll be doing.
    const s = baseSpeed(T.rows.length) + 1;
    pushRows(Math.ceil(s * (big ? 1.65 : 1.05)) + 6, gen.cx);
  }

  function next() {
    wind();
    gen.sinceBig++;
    if ((gen.sinceBig >= 3 && rnd() < 0.5) || gen.sinceBig >= 5) {
      gen.sinceBig = 0;
      return kicker(true);
    }
    const r = rnd();
    if (r < 0.32) logs();
    else if (r < 0.6) rocks();
    else if (r < 0.86) kicker(false);
    else wind();
  }

  T.reset = () => {
    T.rows.length = 0;
    T.obstacles.length = 0;
    T.kickers.length = 0;
    T.gardens.length = 0;
    T.marks.length = 0;
    ki = 0;
    gen = { cx: 0, sinceBig: 2, brand: 0, nextSign: 12, signSide: 1 };
    pushRows(24, 0);
    // Start gate.
    T.marks.push({ type: 'banner', row: 7, brand: FRESHLY });
    wind(16);
    kicker(false);
  };

  T.ensure = (n) => {
    while (T.rows.length < n) next();
  };

  const row = (i) => T.rows[clamp(i, 0, T.rows.length - 1)];
  T.cxAt = (d) => {
    const f = d - 0.5;
    const i = Math.floor(f);
    const a = row(i).cx;
    return a + (row(i + 1).cx - a) * (f - i);
  };
  T.wAt = (d) => row(Math.floor(d)).w;

  T.kickerAt = (d) => {
    const K = T.kickers;
    while (ki > 0 && K[ki - 1].d1 >= d) ki--;
    while (ki < K.length - 1 && K[ki].d1 < d) ki++;
    const k = K[ki];
    return k && d >= k.d0 && d <= k.d1 ? k : null;
  };
  // Next kicker whose lip is still ahead of d.
  T.nextKicker = (d) => {
    for (const k of T.kickers) if (k.d1 >= d) return k;
    return null;
  };
  T.groundAt = (d) => {
    let y = -SLOPE * d;
    const k = T.kickerAt(d);
    if (k) {
      const u = (d - k.d0) / (k.d1 - k.d0);
      y += k.H * u * u;
    }
    return y;
  };
  T.groundAngle = (d) => {
    let s = -SLOPE;
    const k = T.kickerAt(d);
    if (k) {
      const L = k.d1 - k.d0;
      s += (2 * k.H * (d - k.d0)) / (L * L);
    }
    return Math.atan(s);
  };

  T.reset();
  return T;
}
