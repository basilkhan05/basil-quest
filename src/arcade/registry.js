// Arcade games: metadata only (no three.js), so the hub page stays light.
// `basilBest` is Basil's high score: about 70-80% of what a great run can reach.
// `stop` links back to the matching stop on the journey.
export const GAMES = [
  {
    id: 'offroad',
    title: 'Bronco Off-Road',
    year: '2022',
    stop: 'roadtrip',
    blurb: 'Take the Bronco through the backcountry. Dodge bears and moose, splash through mud, keep it on the trail.',
    controls: 'Steer left and right. Boost with up or the boost button.',
    basilBest: 6500,
    units: 'pts',
  },
  {
    id: 'wakeboard',
    title: 'Wake Run',
    year: '2023',
    stop: 'wake',
    blurb: 'Get towed to shore. Hit kickers and side hits for tricks, and dodge the dolphins and salmon jumping out of the water.',
    controls: 'Cut left and right. Jump with up, space or the jump button.',
    basilBest: 10000,
    units: 'pts',
  },
  {
    id: 'mtb',
    title: 'Send It',
    year: '2024',
    stop: 'now',
    blurb: 'Mountain bike the brand trail. Clear the big jumps, land your tricks and stay off the edges.',
    controls: 'Steer left and right. Jump with up or space; hold it in the air to flip.',
    basilBest: 15000,
    units: 'pts',
  },
  {
    id: 'snowboard',
    title: 'Powder Day',
    year: 'NEXT',
    stop: 'launchpad',
    blurb: 'Ride the terrain park. Jump for points, dodge the ski-school kids, and outrun the avalanche.',
    controls: 'Carve left and right. Jump with up or space; spin with left/right in the air.',
    basilBest: 18000,
    units: 'pts',
  },
  {
    id: 'rocket',
    title: 'To the Moon',
    year: '???',
    stop: 'launch',
    blurb: 'Fly to the Moon. Dodge space debris and satellites, then land it softly on the surface.',
    controls: 'Steer left and right, thrust with up. Land slow and level.',
    basilBest: 21000,
    units: 'pts',
  },
];

export const gameById = (id) => GAMES.find((g) => g.id === id);
