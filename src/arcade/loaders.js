// One lazy import per game so each page only downloads its own game.
export const loaders = {
  offroad: () => import('./games/offroad.js'),
  wakeboard: () => import('./games/wakeboard.js'),
  mtb: () => import('./games/mtb.js'),
  snowboard: () => import('./games/snowboard.js'),
  rocket: () => import('./games/rocket.js'),
};
