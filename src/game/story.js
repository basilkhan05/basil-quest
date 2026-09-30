// The story is a list of stops. Each stop's `path` is the cinematic that plays
// when travelling from the previous stop to it. Going backwards replays that
// path in reverse (as a VHS rewind).
//
// `milestone` shows as a badge on the card. Stops marked TODO are placeholders.

const hop = (x, L) => ({ type: 'hop', x, L });
const hops = (x, from, to) => {
  const out = [];
  const dir = Math.sign(to - from);
  for (let L = from + dir; dir > 0 ? L <= to : L >= to; L += dir) out.push(hop(x, L));
  return out;
};
const drive = (x, L, o = {}) => ({ type: 'move', x, L, dur: 1, ...o });
const jump = (x, L, o = {}) => ({ type: 'move', x, L, dur: 0.8, h: 1, ease: 'linear', ...o });
const mount = (name) => ({ type: 'mount', name });
const dismount = (name) => ({ type: 'dismount', name });
const wait = (dur) => ({ type: 'wait', dur });
const TAU = Math.PI * 2;

const CAREERS = 'https://careers.freshlycommerce.com/?utm_source=basilkhan.ca&utm_medium=referral&utm_campaign=personal_site#open-roles';

// Where Lichen waits until Basil reaches her. In the personal route they meet
// at Vidyard; in the professional route she joins when they found Freshly.
export const LICHEN_SPOTS = {
  personal: { x: 1.3, L: -16 },
  pro: { x: 1.4, L: 0.2 },
};

// One story, two routes. /personal/ is the regular journey plus extras:
// - A `personal: { ... }` block on a stop can swap text (title, role,
//   milestone, blurb) and ADD bubbles/links with `addBubbles` / `addLinks`.
//   Everything else on the stop, including its bubbles, carries over.
// - Stops with `only: 'personal'` are extra stops on the personal route
//   (trips, life moments); every other stop appears on both routes.
export function storyFor(mode) {
  return STOPS.filter((s) => !s.only || s.only === mode).map((s) => {
    const { addBubbles = [], addLinks = [], ...swap } = s[mode] || {};
    return {
      ...s,
      ...swap,
      bubbles: [...(s.bubbles || []), ...addBubbles],
      links: s.links || addLinks.length ? [...(s.links || []), ...addLinks] : undefined,
    };
  });
}

export const STOPS = [
  {
    id: 'canada',
    only: 'personal',
    era: 'past',
    year: '2005',
    label: 'Canada',
    pos: { x: 0, L: -36 },
    title: 'Moving to Canada',
    role: 'From Saudi Arabia',
    blurb: 'Moved from Saudi Arabia to Canada in 2005. This is where the journey starts.',
    bubbles: [
      { text: 'Hello, Canada', at: [-2.2, 3.2, -35.6] },
      { text: 'Next stop: Canada', at: [-4.5, 2.6, -40] },
    ],
  },
  {
    id: 'uw',
    era: 'past',
    year: '2016',
    label: 'UWaterloo',
    pos: { x: 0, L: -28 },
    title: 'University of Waterloo',
    role: 'BASc, Chemical Engineering + Management Sciences',
    blurb: "Studied Chem Eng. In 2015 I watched Tobi's fireside chat at E5 about Shopify Plus and Shopify's new Waterloo office, and got hooked on commerce.",
    bubbles: [
      { text: 'Chem Eng grad who ended up writing code', at: [-4.2, 3.9, -28.3] },
      { text: '2015, E5: Tobi on Shopify Plus and a Waterloo office. Inspired.', at: [4.4, 3.4, -25.8] },
      { text: 'Honk.', at: [2.8, 1.2, -28.2] },
    ],
    path: hops(0, -36, -28),
  },
  {
    id: 'lansa',
    era: 'past',
    year: '2016',
    label: 'LANSA',
    pos: { x: 0, L: -22 },
    title: 'LANSA, Toronto',
    role: 'Application Developer',
    blurb: 'First real job, in the big city. Commerce platforms for enterprise clients.',
    bubbles: [{ text: 'First production deploy (gulp)', at: [-4, 4, -22.3] }],
    path: hops(0, -28, -22),
  },
  {
    id: 'vidyard',
    era: 'past',
    year: '2017',
    label: 'Vidyard',
    pos: { x: 0, L: -16 },
    title: 'Vidyard',
    role: 'Developer, Professional Services',
    blurb: 'Moved to Waterloo for Vidyard and built custom video integrations. On the side, I co-founded AsteroidX, an Amazon PPC startup that earned my first dollar online.',
    bubbles: [
      { text: 'Moving to Waterloo', at: [5.6, 2.2, -16.6] },
      { text: 'AsteroidX on the side: my first dollar online, with Amazon PPC', at: [-4, 2.6, -11.3] },
      { text: "Co-founded a PPC startup. It didn't take off, but I learned a lot.", at: [3, 3.2, -11] },
    ],
    personal: {
      title: 'Vidyard, and meeting Lichen',
      blurb: 'Moved to Waterloo for Vidyard and met Lichen, now my spouse and co-founder. Everything after this, we did together. On the side: AsteroidX, my first dollar online.',
      addBubbles: [{ text: 'Hi, Lichen', at: 'me' }],
    },
    path: hops(0, -22, -16),
  },
  {
    id: 'podia',
    era: 'past',
    year: '2019',
    label: 'Podia',
    pos: { x: 0, L: -6 },
    title: 'Podia',
    role: 'Product Developer, then Senior Product Developer',
    blurb: 'First fully remote job. Helped creators sell courses, and built longboards in the garage after hours.',
    bubbles: [
      { text: 'First fully remote job', at: [3, 2.2, -6.2] },
      { text: 'Garage longboard shop', at: [6.2, 1.8, -6] },
    ],
    path: hops(0, -16, -6),
  },
  {
    id: 'founded',
    era: 'company',
    year: '2020',
    label: 'App Challenge',
    pos: { x: 0, L: 0 },
    title: 'Shopify App Challenge',
    role: 'Freshly Commerce is born',
    milestone: 'Shopify App Challenge winners',
    blurb: "Lichen and I built Freshly for Shopify's COVID-19 App Challenge and were named one of the winners. That kickstarted everything: Freshly Inventory became our first app.",
    links: [{ text: 'The winners', href: 'https://www.shopify.com/ca/partners/blog/shopify-app-challenge-winners', ext: true }],
    bubbles: [
      { text: "Lichen, let's build this together!", at: 'me' },
      { text: 'Freshly Inventory ships', at: [4.2, 2.4, 0.6] },
    ],
    path: hops(0, -6, 0),
  },
  {
    id: 'road',
    era: 'company',
    year: '2021',
    label: '$10K MRR',
    pos: { x: -0.8, L: 10 },
    title: 'Simple Bundles launches',
    role: 'Our first $10K MRR',
    milestone: '$10K MRR',
    blurb: 'Freshly Inventory showed us a gap: bundles and inventory did not play well together on Shopify. We launched Simple Bundles to fix it, and it took us to our first $10K MRR.',
    bubbles: [],
    path: [...hops(0, 0, 8), hop(-0.4, 9), hop(-0.8, 10)],
  },
  {
    id: 'roadtrip',
    era: 'company',
    year: '2022',
    label: 'Camp',
    gear: 'shades',
    pos: { x: -0.2, L: 21 },
    title: 'Building a global team',
    role: 'Remote, around the world',
    milestone: 'Hiring worldwide',
    blurb: 'After we passed $10K MRR, we started hiring and built a remote team around the world.',
    links: [{ text: 'Join us: open roles', href: CAREERS, ext: true }],
    bubbles: [
      { text: 'Campfire debugging', at: [-1.5, 1.4, 21.2] },
      { text: "We're hiring: open roles", at: [-6.8, 2.4, 21.6], href: CAREERS },
    ],
    path: [
      hop(0.2, 10),
      hop(1, 10),
      mount('bronco'),
      drive(0.2, 13.2, { dur: 1.2, ease: 'in' }),
      drive(0.2, 15.5, { dur: 0.9, bumpy: 0.2, fx: 'mud', ease: 'linear' }),
      jump(0.3, 16.5, { h: 0.5, dur: 0.4, fx: 'mud' }),
      drive(0.2, 18, { dur: 0.7, bumpy: 0.2, fx: 'mud', ease: 'linear' }),
      drive(1.3, 20.6, { dur: 1, ease: 'out', rot: -0.3 }),
      dismount('bronco'),
      hop(0.5, 21),
      hop(-0.2, 21),
    ],
  },
  {
    id: 'wake',
    era: 'company',
    year: '2023',
    label: 'Bundles 2.0',
    gear: 'shades',
    pos: { x: 0, L: 32 },
    title: 'Simple Bundles 2.0',
    role: 'A ground-up rebuild',
    milestone: 'Simple Bundles 2.0 + Simple Discounts',
    blurb: 'We rebuilt Simple Bundles from the ground up and launched Simple Discounts, our third app.',
    bubbles: [
      { text: 'Launch day: Simple Bundles 2.0', at: [-4, 2.4, 31.6] },
      { text: 'Next: scaling our apps for enterprise merchants', at: [1.2, 1.6, 32.4] },
    ],
    path: [
      ...hops(0, 21, 22),
      hop(0.8, 23),
      mount('boat'),
      drive(0.8, 24.6, { dur: 0.9, ease: 'in', fx: 'splash' }),
      jump(0.4, 26.8, { h: 0.9, dur: 0.8, fx: 'splash' }),
      // A dolphin scoops Basil up for the big one.
      jump(1.0, 29.0, { h: 2.0, dur: 1.3, spin: TAU, fx: 'splash', dolphin: true }),
      drive(0.8, 31, { dur: 0.9, ease: 'out', fx: 'splash' }),
      dismount('boat'),
      hop(0, 32),
    ],
  },
  {
    id: 'now',
    era: 'now',
    year: '2026',
    label: 'Now',
    gear: 'helmet',
    pos: { x: 0, L: 46 },
    title: 'Freshly Commerce today',
    role: 'Co-founder & CTO',
    milestone: '25,000 merchants',
    blurb: '25,000 merchants on three apps, including Glossier, STANLEY and Yamaha. We scaled up, hardened security and built to handle huge volumes of order data reliably, and we have thrived through five BFCMs of peak traffic.',
    links: [
      { text: 'See the products', href: 'work/' },
      { text: 'freshlycommerce.com', href: 'https://www.freshlycommerce.com/', ext: true },
    ],
    bubbles: [
      { text: 'You are here', at: 'me' },
      { text: 'Next: up the lift', at: [2.6, 4.6, 46.3] },
    ],
    path: [
      hop(1.2, 32),
      mount('bike'),
      drive(0.3, 35.3, { dur: 1.0, ease: 'in', fx: 'dirt' }),
      jump(0.3, 36.8, { h: 0.8, dur: 0.5, fx: 'dirt' }),
      drive(0.3, 38.3, { dur: 0.45, ease: 'linear', fx: 'dirt' }),
      jump(0.3, 39.8, { h: 0.8, dur: 0.5, fx: 'dirt' }),
      drive(0.3, 41.9, { dur: 0.6, ease: 'linear', alt: 0.85 }),
      jump(0.3, 45.2, { h: 2.6, dur: 1.3, alt: 0, flip: -TAU, fx: 'dirt' }),
      drive(0.8, 45.8, { dur: 0.5, ease: 'out' }),
      dismount('bike'),
      hop(0, 46),
    ],
  },
  {
    id: 'scale',
    era: 'future',
    year: 'NEXT',
    label: '100K',
    gear: 'beanie',
    pos: { x: 0, L: 57 },
    title: 'The logistics brain of ecommerce',
    role: 'Next stop: 100,000 merchants',
    milestone: '100,000 merchants',
    blurb: "Bundles, discounts and inventory already run through our apps for 25,000 merchants. Next, we connect them into one brain that knows what's in stock, what's selling and what ships next.",
    bubbles: [
      { text: '100,000 merchants', at: [-4.5, 3.6, 57.6] },
      { text: 'Built for Shopify', at: [-2.2, 2.6, 59.2] },
    ],
    path: [
      hop(1.2, 46),
      hop(2.3, 46),
      mount('chair'),
      drive(2.3, 46.2, { dur: 0.5, alt: 1.9, ease: 'inout' }),
      drive(2.3, 55.8, { dur: 4, alt: 1.9, ease: 'linear' }),
      drive(2.3, 56.2, { dur: 0.5, alt: 0, ease: 'inout' }),
      dismount('chair'),
      hop(1.2, 56.6),
      hop(0, 57),
    ],
  },
  {
    id: 'launchpad',
    era: 'future',
    year: 'NEXT',
    label: 'Ops team',
    gear: 'beanie',
    pos: { x: 0, L: 73 },
    title: 'An ops team for every merchant',
    role: 'It plans the work, then does it',
    milestone: 'Set the goal, we handle the rest',
    blurb: 'Tell it the goal, like lift AOV by 17% or cut fulfillment issues by 30%. It builds the plan, shows you the tradeoffs and makes the changes in your store, so a five-person brand can run like a fifty-person one.',
    bubbles: [
      { text: 'Increase my AOV by 17%', at: [4.2, 1.8, 72.6] },
      { text: 'Cut fulfillment issues by 30%', at: [6.8, 2.5, 74.2] },
      { text: 'Reduce missed orders 13% vs last week', at: [5.2, 3.3, 75.4] },
    ],
    path: [
      hop(0.8, 57),
      mount('board'),
      drive(0.4, 59.8, { dur: 0.8, ease: 'in', fx: 'snow', rot: 0.5 }),
      jump(0.4, 61.5, { h: 1.9, dur: 0.95, spin: TAU, fx: 'snow' }),
      drive(0.4, 62.3, { dur: 0.35, ease: 'linear', fx: 'snow' }),
      jump(0.4, 64.0, { h: 1.9, dur: 0.95, spin: -TAU, fx: 'snow' }),
      drive(0.4, 65.6, { dur: 0.5, ease: 'linear', alt: 1.3 }),
      jump(0.4, 67.8, { h: 3.4, dur: 1.5, alt: 0, spin: TAU * 2, fx: 'snow' }),
      dismount('board'),
      hop(0, 68),
      ...hops(0, 68, 73),
    ],
  },
  {
    id: 'launch',
    era: 'future',
    year: '???',
    label: 'Moon',
    gear: 'suit',
    pos: { x: 2.6, L: 74, alt: 40 },
    title: 'To the moon',
    role: 'Then a Dyson swarm',
    milestone: 'No ceiling',
    blurb: 'Lichen and I are still going up. Building something ambitious in commerce? Say hi, or come build it with us.',
    links: [
      { text: 'Say hi', href: 'contact/' },
      { text: 'Join us', href: CAREERS, ext: true },
    ],
    bubbles: [],
    path: [
      hop(1.3, 73.5),
      hop(2.6, 74),
      mount('rocket'),
      wait(0.9),
      // Turn the porthole (Basil and Lichen) toward the camera as it lifts off.
      { type: 'move', x: 2.6, L: 74, alt: 40, dur: 3.6, ease: 'in', fx: 'flame', rot: -2.9 },
    ],
  },
];


// Side milestones: small flags beside the route. Add one line per milestone.
// `L` is the lane (the stop list above shows roughly where each year sits),
// `x` is how far left (-) or right (+) of the path.
export const MARKERS = [
  { year: '2023', text: 'Simple Discounts launches', x: -2.4, L: 33.9, color: '#7b61ff' },
  { year: '2024', text: 'Security + scaling up', x: 2.3, L: 34.4, color: '#2b6cff' },
  { year: '2024', text: 'Built for Shopify', x: -2.7, L: 44.4, color: '#1f8f4e' },
];
