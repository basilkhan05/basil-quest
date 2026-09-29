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

// Where Lichen waits until Basil reaches her. In the personal route they meet
// at Vidyard; in the professional route she joins when they found Freshly.
export const LICHEN_SPOTS = {
  personal: { x: 1.3, L: -16 },
  pro: { x: 1.4, L: 0.2 },
};

// Per-route copy lives under `personal` / `pro` on a stop and overrides the base.
export function storyFor(mode) {
  return STOPS.map((s) => ({ ...s, ...(s[mode] || {}) }));
}

export const STOPS = [
  {
    id: 'uw',
    era: 'past',
    year: '2016',
    label: 'UWaterloo',
    pos: { x: 0, L: -28 },
    title: 'University of Waterloo',
    role: 'BASc, Chemical Engineering + Management Sciences',
    blurb: 'Where it started. Studied reactors, ended up shipping code.',
    bubbles: [
      { text: 'Chem Eng grad who ended up writing code', at: [-4.2, 3.9, -28.3] },
      { text: "Startup Weekend + UW Apprentice '15", at: [3.8, 1.4, -29.5] },
      { text: 'Honk.', at: [2.8, 1.2, -28.2] },
    ],
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
    blurb: 'Moved to Waterloo for Vidyard. Built custom video integrations for big customers.',
    bubbles: [
      { text: 'Integrations for days', at: [3, 2.4, -16] },
      { text: 'Moving to Waterloo', at: [5.6, 2.2, -16.6] },
    ],
    personal: {
      title: 'Vidyard, and meeting Lichen',
      blurb: 'Moved to Waterloo for Vidyard and met Lichen, now my spouse and co-founder. Everything after this, we did together.',
      bubbles: [
        { text: 'Hi, Lichen', at: [1.3, 1.9, -16] },
        { text: 'Moving to Waterloo', at: [5.6, 2.2, -16.6] },
      ],
    },
    path: hops(0, -22, -16),
  },
  {
    id: 'asteroidx',
    era: 'past',
    year: '2018',
    label: 'AsteroidX',
    pos: { x: 0, L: -11 },
    title: 'AsteroidX, back to Toronto',
    role: 'Lead Software Developer',
    blurb: 'Amazon PPC analytics with a fleet of background workers. Living under the CN Tower.',
    bubbles: [
      { text: '40+ workers crunching ad data', at: [3, 3.2, -11] },
      { text: 'Hello again, Toronto', at: [6.6, 9.6, -12.5] },
    ],
    path: hops(0, -16, -11),
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
    path: hops(0, -11, -6),
  },
  {
    id: 'founded',
    era: 'company',
    year: '2020',
    label: 'App Challenge',
    pos: { x: 0, L: 0 },
    title: 'Shopify App Challenge',
    role: 'Freshly Commerce is born',
    milestone: '3rd place, Commerce and COVID-19',
    blurb: "Lichen and I built Freshly for Shopify's COVID-19 App Challenge and placed third. That kickstarted everything: Freshly Inventory became our first app.",
    links: [{ text: 'The winners', href: 'https://www.shopify.com/ca/partners/blog/shopify-app-challenge-winners', ext: true }],
    bubbles: [
      { text: "Let's build this together", at: [1.4, 1.9, 0.2] },
      { text: 'Freshly Inventory ships', at: [4.2, 2.4, 0.6] },
    ],
    personal: {
      bubbles: [
        { text: 'Day one', at: [-4.6, 3.8, 1.4] },
        { text: 'Freshly Inventory ships', at: [4.2, 2.4, 0.6] },
      ],
    },
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
    blurb: 'Simple Bundles took off and carried us across the first big road: $10K in monthly recurring revenue.',
    bubbles: [
      { text: '$10K MRR!', at: [5.6, 4.2, 9.2] },
      { text: 'Look both ways', at: [-2.5, 1.2, 5] },
    ],
    path: [...hops(0, 0, 8), hop(-0.4, 9), hop(-0.8, 10)],
  },
  {
    id: 'roadtrip',
    era: 'company',
    year: '2022',
    label: 'Camp',
    gear: 'shades',
    pos: { x: -0.2, L: 21 },
    // TODO(basil): what started in 2022?
    title: 'Setting up camp',
    role: 'Through the mud',
    milestone: 'Kept shipping',
    blurb: 'We put it in 4x4, got through the mud and set up camp.',
    bubbles: [
      { text: 'Campfire debugging', at: [-1.5, 1.4, 21.2] },
      { text: '4x4 engaged', at: [1.3, 2.1, 20.6] },
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
    label: 'SB 2.0',
    gear: 'shades',
    pos: { x: 0, L: 32 },
    title: 'Simple Bundles 2.0',
    role: 'The boat launch',
    milestone: 'Simple Bundles 2.0 + Simple Discounts',
    blurb: 'We rebuilt our biggest app from the ground up and launched Simple Discounts. I wakeboarded, Lichen surfed.',
    bubbles: [
      { text: 'Launch day', at: [-4, 2.4, 31.6] },
      { text: 'Next: bigger merchants', at: [1.2, 1.6, 32.4] },
    ],
    path: [
      ...hops(0, 21, 22),
      hop(0.8, 23),
      mount('boat'),
      drive(0.8, 24.6, { dur: 0.9, ease: 'in', fx: 'splash' }),
      jump(0.4, 26.8, { h: 0.9, dur: 0.8, fx: 'splash' }),
      jump(1.0, 29.0, { h: 1.4, dur: 1.0, spin: TAU, fx: 'splash' }),
      drive(0.8, 31, { dur: 0.9, ease: 'out', fx: 'splash' }),
      dismount('boat'),
      hop(0, 32),
    ],
  },
  {
    id: 'trail',
    era: 'company',
    year: '2024',
    label: 'Scale',
    gear: 'helmet',
    pos: { x: 0, L: 46 },
    title: 'The first big step up',
    role: 'Glossier, STANLEY, Yamaha',
    milestone: 'Built for Shopify',
    blurb: 'Household names came on board, so we scaled the apps and did a lot of security work to match. Every jump got bigger.',
    bubbles: [
      { text: 'Send it. Then write the postmortem.', at: [0.3, 1.8, 42] },
      { text: 'Up to basecamp', at: [2.6, 4.6, 46.3] },
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
    id: 'now',
    era: 'now',
    year: '2026',
    label: 'Now',
    gear: 'beanie',
    pos: { x: 0, L: 57 },
    title: 'Freshly Commerce today',
    role: 'Co-founder & CTO',
    milestone: '25,000 merchants',
    blurb: 'Three apps and 25,000 merchants. This is where we are right now, and we are still climbing.',
    links: [
      { text: 'See the products', href: 'work/' },
      { text: 'freshlycommerce.com', href: 'https://www.freshlycommerce.com/', ext: true },
    ],
    bubbles: [
      { text: 'You are here', at: [0, 1.9, 57] },
      { text: '25,000 merchants', at: [-4.5, 3.6, 57.6] },
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
    id: 'launch',
    era: 'future',
    year: 'NEXT',
    label: 'Moon',
    gear: 'suit',
    pos: { x: 2.6, L: 74, alt: 40 },
    title: 'To the moon',
    role: 'We are still going up',
    milestone: "We're hiring",
    blurb: 'Building something ambitious in commerce. Want to build it with us, or just say hi? Come find us.',
    links: [
      { text: 'Say hi', href: 'contact/' },
      { text: 'Read my thoughts', href: 'thoughts/' },
    ],
    bubbles: [],
    path: [
      hop(0.8, 57),
      mount('board'),
      drive(0.4, 59.8, { dur: 0.8, ease: 'in', fx: 'snow', rot: 0.5 }),
      jump(0.4, 61.3, { h: 1.1, dur: 0.7, spin: TAU, fx: 'snow' }),
      drive(0.4, 62.5, { dur: 0.45, ease: 'linear', fx: 'snow' }),
      jump(0.4, 63.9, { h: 1.1, dur: 0.7, spin: -TAU, fx: 'snow' }),
      drive(0.4, 65.6, { dur: 0.5, ease: 'linear', alt: 0.75 }),
      jump(0.4, 67.8, { h: 2.4, dur: 1.2, alt: 0, spin: TAU * 2, fx: 'snow' }),
      dismount('board'),
      hop(0, 68),
      ...hops(0, 68, 73),
      hop(1.3, 73.5),
      hop(2.6, 74),
      mount('rocket'),
      wait(0.9),
      // Turn the porthole (Basil and Lichen) toward the camera as it lifts off.
      { type: 'move', x: 2.6, L: 74, alt: 40, dur: 3.6, ease: 'in', fx: 'flame', rot: -2.9 },
    ],
  },
];

export const START = STOPS.findIndex((s) => s.id === 'now');
export const FOUNDED = STOPS.findIndex((s) => s.id === 'founded');

// Side milestones: small flags beside the route. Add one line per milestone.
// `L` is the lane (the stop list above shows roughly where each year sits),
// `x` is how far left (-) or right (+) of the path.
export const MARKERS = [
  { year: '2023', text: 'Simple Discounts launches', x: -2.1, L: 32.9, color: '#7b61ff' },
  { year: '2024', text: 'Security + scaling up', x: 2.3, L: 34.4, color: '#2b6cff' },
  { year: '2024', text: 'Built for Shopify', x: -2.7, L: 44.4, color: '#1f8f4e' },
];
