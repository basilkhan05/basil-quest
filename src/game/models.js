import * as THREE from 'three';
import { box, group, mat, rand, pick } from './voxel.js';

// All models face -z ("forward" / the future).

export const PALETTE = {
  skin: '#c68a64',
  hair: '#1c1512',
  beard: '#2b1e18',
  shirt: '#15c2b0',
  shirtDark: '#0f9486',
  pants: '#2c3a57',
  shoe: '#f4f4f4',
  bronco: '#e8692c',
  broncoDark: '#b84d1c',
};

export const LICHEN = {
  skin: '#e2b08c',
  hair: '#141012',
  shirt: '#ff7a8a',
  shirtDark: '#e0566a',
  pants: '#3b3355',
  beard: null,
  longHair: true,
  helmet: '#ffd23f',
  beanie: '#7b61ff',
};

// Basil by default; pass LICHEN (or any overrides) for other characters.
export function makePlayer(look = {}) {
  const P = { ...PALETTE, longHair: false, helmet: '#ff3b5c', beanie: '#ff8a1f', ...look };
  const root = group();
  const body = group(root); // squash/stretch pivot
  const legs = group(body);
  box(legs, 0.17, 0.28, 0.2, P.pants, -0.1, 0.04, 0);
  box(legs, 0.17, 0.28, 0.2, P.pants, 0.1, 0.04, 0);
  box(legs, 0.18, 0.06, 0.24, P.shoe, -0.1, 0, -0.02);
  box(legs, 0.18, 0.06, 0.24, P.shoe, 0.1, 0, -0.02);
  box(body, 0.5, 0.4, 0.3, P.shirt, 0, 0.32, 0);
  box(body, 0.5, 0.06, 0.31, P.shirtDark, 0, 0.32, 0);
  const armL = box(body, 0.12, 0.34, 0.18, P.shirt, -0.31, 0.36, 0);
  const armR = box(body, 0.12, 0.34, 0.18, P.shirt, 0.31, 0.36, 0);
  box(body, 0.11, 0.08, 0.16, P.skin, -0.31, 0.3, 0);
  box(body, 0.11, 0.08, 0.16, P.skin, 0.31, 0.3, 0);
  // Head
  box(body, 0.44, 0.4, 0.42, P.skin, 0, 0.72, 0);
  box(body, 0.46, 0.12, 0.46, P.hair, 0, 1.08, 0.01);
  box(body, 0.46, 0.26, 0.08, P.hair, 0, 0.86, 0.2);
  box(body, 0.06, 0.18, 0.3, P.hair, -0.225, 0.9, 0.06);
  box(body, 0.06, 0.18, 0.3, P.hair, 0.225, 0.9, 0.06);
  if (P.beard) {
    box(body, 0.46, 0.12, 0.06, P.beard, 0, 0.72, -0.2);
    box(body, 0.06, 0.16, 0.3, P.beard, -0.225, 0.72, -0.05);
    box(body, 0.06, 0.16, 0.3, P.beard, 0.225, 0.72, -0.05);
    box(body, 0.14, 0.04, 0.04, '#7a3b2e', 0, 0.8, -0.215);
  } else {
    box(body, 0.14, 0.04, 0.04, '#c0504d', 0, 0.76, -0.215);
    box(body, 0.06, 0.04, 0.02, '#f08a8a', -0.15, 0.82, -0.215);
    box(body, 0.06, 0.04, 0.02, '#f08a8a', 0.15, 0.82, -0.215);
  }
  if (P.longHair) {
    box(body, 0.48, 0.5, 0.1, P.hair, 0, 0.56, 0.21);
    box(body, 0.07, 0.42, 0.3, P.hair, -0.24, 0.66, 0.08);
    box(body, 0.07, 0.42, 0.3, P.hair, 0.24, 0.66, 0.08);
  }
  box(body, 0.07, 0.07, 0.02, '#111', -0.1, 0.93, -0.215);
  box(body, 0.07, 0.07, 0.02, '#111', 0.1, 0.93, -0.215);

  // Accessories, toggled per zone.
  const gear = {};
  gear.shades = group(body);
  box(gear.shades, 0.4, 0.08, 0.03, '#111', 0, 0.91, -0.225);
  gear.helmet = group(body);
  box(gear.helmet, 0.52, 0.16, 0.52, P.helmet, 0, 1.1, 0);
  box(gear.helmet, 0.52, 0.05, 0.12, '#222', 0, 1.1, -0.28);
  gear.beanie = group(body);
  box(gear.beanie, 0.5, 0.18, 0.5, P.beanie, 0, 1.1, 0);
  box(gear.beanie, 0.14, 0.12, 0.14, '#fff', 0, 1.28, 0);
  box(gear.beanie, 0.48, 0.1, 0.04, '#7fdcff', 0, 0.92, -0.225);
  gear.scuba = group(body);
  box(gear.scuba, 0.26, 0.5, 0.2, '#ffd23f', 0, 0.22, 0.26);
  box(gear.scuba, 0.1, 0.1, 0.1, '#555', 0, 0.72, 0.26);
  box(gear.scuba, 0.48, 0.18, 0.05, '#2ec4ff', 0, 0.84, -0.23);
  box(gear.scuba, 0.06, 0.36, 0.06, '#ff8a1f', 0.25, 0.8, -0.1);
  gear.suit = group(body);
  box(gear.suit, 0.56, 0.56, 0.56, '#ffffff', 0, 0.68, 0, { material: new THREE.MeshLambertMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.45 }) });
  Object.values(gear).forEach((g) => (g.visible = false));

  return { root, body, legs, armL, armR, gear };
}

function wheel(parent, x, y, z, r = 0.25, w = 0.28, sideways = false) {
  if (sideways) {
    box(parent, r * 2, r * 2, w, '#1d1d22', x, y, z);
    box(parent, r * 0.9, r * 0.9, w + 0.02, '#9aa0a8', x, y + r * 0.55, z);
    return;
  }
  box(parent, w, r * 2, r * 2, '#1d1d22', x, y, z);
  box(parent, w + 0.02, r * 0.9, r * 0.9, '#9aa0a8', x, y + r * 0.55, z);
}

export function makeBronco(color = PALETTE.bronco) {
  const g = group();
  box(g, 1.0, 0.18, 1.9, '#26262b', 0, 0.22, 0);
  box(g, 1.12, 0.46, 2.0, color, 0, 0.36, 0);
  box(g, 1.12, 0.08, 2.02, PALETTE.broncoDark, 0, 0.36, 0);
  // Grille + headlights
  box(g, 1.0, 0.3, 0.06, '#1b1b1f', 0, 0.42, -1.02);
  box(g, 0.2, 0.2, 0.04, '#fff7c2', -0.33, 0.47, -1.06);
  box(g, 0.2, 0.2, 0.04, '#fff7c2', 0.33, 0.47, -1.06);
  box(g, 0.34, 0.08, 0.04, '#f3f3f3', 0, 0.5, -1.06);
  // Bumpers
  box(g, 1.22, 0.14, 0.14, '#222', 0, 0.26, -1.06);
  box(g, 1.22, 0.14, 0.14, '#222', 0, 0.26, 1.06);
  // Windshield frame + roll bar (open top)
  box(g, 1.1, 0.42, 0.06, '#1b1b1f', 0, 0.82, -0.3);
  box(g, 0.96, 0.32, 0.03, '#9fdcff', 0, 0.86, -0.32, { shadow: false });
  box(g, 0.06, 0.52, 0.06, '#1b1b1f', -0.52, 0.82, 0.5);
  box(g, 0.06, 0.52, 0.06, '#1b1b1f', 0.52, 0.82, 0.5);
  box(g, 1.1, 0.06, 0.06, '#1b1b1f', 0, 1.3, 0.5);
  box(g, 0.06, 0.06, 0.86, '#1b1b1f', -0.52, 1.24, 0.08);
  box(g, 0.06, 0.06, 0.86, '#1b1b1f', 0.52, 1.24, 0.08);
  // Seats
  box(g, 0.34, 0.14, 0.34, '#3a2a22', -0.24, 0.82, 0.05);
  box(g, 0.34, 0.14, 0.34, '#3a2a22', 0.24, 0.82, 0.05);
  // Spare tire
  box(g, 0.5, 0.5, 0.2, '#1d1d22', 0, 0.52, 1.14);
  // Roof rack gear: a board strapped on top
  box(g, 0.3, 0.06, 1.2, '#ffe14d', 0.3, 1.34, 0.1);
  wheel(g, -0.56, 0, -0.62, 0.28, 0.3);
  wheel(g, 0.56, 0, -0.62, 0.28, 0.3);
  wheel(g, -0.56, 0, 0.66, 0.28, 0.3);
  wheel(g, 0.56, 0, 0.66, 0.28, 0.3);
  // Mud splatter
  [[-0.57, 0.3, 0.3], [0.57, 0.26, -0.4], [-0.57, 0.24, -0.8], [0.57, 0.32, 0.7]].forEach(([x, y, z]) =>
    box(g, 0.02, 0.1, 0.22, '#6b4a2f', x, y, z, { shadow: false }),
  );
  return g;
}

export function makeBike() {
  const g = group();
  const frame = '#20c997';
  box(g, 0.08, 0.56, 0.56, '#1d1d22', 0, 0, -0.5);
  box(g, 0.08, 0.56, 0.56, '#1d1d22', 0, 0, 0.5);
  box(g, 0.1, 0.1, 0.9, frame, 0, 0.4, 0);
  box(g, 0.1, 0.4, 0.1, frame, 0, 0.3, 0.12);
  box(g, 0.1, 0.46, 0.1, frame, 0, 0.26, -0.44);
  box(g, 0.5, 0.06, 0.08, '#222', 0, 0.72, -0.44);
  box(g, 0.16, 0.06, 0.26, '#222', 0, 0.7, 0.14);
  return g;
}

export function makeSurfboard() {
  const g = group();
  box(g, 0.5, 0.08, 1.5, '#ffffff', 0, 0, 0);
  box(g, 0.5, 0.085, 0.14, '#ff4d8d', 0, 0, -0.3);
  box(g, 0.34, 0.08, 0.2, '#ffffff', 0, 0, -0.82);
  box(g, 0.08, 0.16, 0.16, '#ff4d8d', 0, -0.12, 0.6);
  return g;
}

export function makeSnowboard() {
  const g = group();
  box(g, 0.44, 0.06, 1.3, '#7b61ff', 0, 0, 0);
  box(g, 0.3, 0.06, 0.12, '#7b61ff', 0, 0.03, -0.68);
  box(g, 0.3, 0.06, 0.12, '#7b61ff', 0, 0.03, 0.68);
  box(g, 0.45, 0.065, 0.2, '#ffe14d', 0, 0, 0);
  box(g, 0.3, 0.12, 0.14, '#111', 0, 0.06, -0.25);
  box(g, 0.3, 0.12, 0.14, '#111', 0, 0.06, 0.25);
  return g;
}

export function makeChair() {
  const g = group();
  box(g, 1.2, 0.1, 0.5, '#2f3b4c', 0, 0, 0);
  box(g, 1.2, 0.5, 0.08, '#2f3b4c', 0, 0.05, 0.25);
  box(g, 0.06, 1.7, 0.06, '#6b7686', 0, 0.55, 0.2);
  box(g, 0.3, 0.12, 0.12, '#6b7686', 0, 2.2, 0.2);
  box(g, 1.2, 0.05, 0.05, '#6b7686', 0, 0.6, -0.3);
  return g;
}

export function makeRocket(crew = false) {
  const g = group();
  const white = '#f7f7fb';
  const red = '#ff3b5c';
  box(g, 1.2, 0.4, 1.2, '#444', 0, 0, 0);
  box(g, 1.0, 2.6, 1.0, white, 0, 0.4, 0);
  box(g, 1.02, 0.22, 1.02, red, 0, 1.2, 0);
  box(g, 0.8, 0.5, 0.8, white, 0, 3.0, 0);
  box(g, 0.56, 0.4, 0.56, red, 0, 3.5, 0);
  box(g, 0.3, 0.3, 0.3, red, 0, 3.9, 0);
  box(g, 0.1, 0.3, 0.1, '#ffe14d', 0, 4.2, 0);
  // Porthole (with Basil and Lichen inside when crewed)
  box(g, 0.74, 0.5, 0.04, '#1b1b1f', 0, 2.05, -0.51);
  box(g, 0.62, 0.38, 0.04, '#7fdcff', 0, 2.11, -0.53);
  if (crew) {
    [[-0.15, PALETTE.skin, PALETTE.hair], [0.15, LICHEN.skin, LICHEN.hair]].forEach(([x, skin, hair]) => {
      box(g, 0.18, 0.16, 0.04, skin, x, 2.13, -0.55, { shadow: false });
      box(g, 0.2, 0.07, 0.045, hair, x, 2.28, -0.55, { shadow: false });
    });
  }
  // Fins
  box(g, 0.2, 0.9, 0.6, red, -0.6, 0.2, 0);
  box(g, 0.2, 0.9, 0.6, red, 0.6, 0.2, 0);
  box(g, 0.6, 0.9, 0.2, red, 0, 0.2, 0.6);
  box(g, 0.6, 0.9, 0.2, red, 0, 0.2, -0.6);
  const flame = group(g);
  box(flame, 0.7, 0.5, 0.7, '#ffb020', 0, -0.5, 0, { shadow: false });
  box(flame, 0.45, 0.5, 0.45, '#ff5a1f', 0, -0.9, 0, { shadow: false });
  flame.visible = false;
  g.userData.flame = flame;
  return g;
}

const CAR_COLORS = ['#ff5a5f', '#2ec4ff', '#ffd23f', '#8a5cff', '#3ddc84', '#ff8fb1'];
export function makeCar() {
  const g = group();
  const c = pick(CAR_COLORS);
  box(g, 1.6, 0.4, 0.9, c, 0, 0.16, 0);
  box(g, 0.9, 0.36, 0.8, '#f4f6fb', -0.05, 0.56, 0);
  box(g, 0.2, 0.26, 0.82, '#2c3240', 0.4, 0.6, 0, { shadow: false });
  box(g, 0.2, 0.26, 0.82, '#2c3240', -0.5, 0.6, 0, { shadow: false });
  wheel(g, -0.5, 0, 0.42, 0.16, 0.12, true);
  wheel(g, 0.5, 0, 0.42, 0.16, 0.12, true);
  wheel(g, -0.5, 0, -0.42, 0.16, 0.12, true);
  wheel(g, 0.5, 0, -0.42, 0.16, 0.12, true);
  return g;
}

export function makeTruck() {
  const g = group();
  box(g, 1.7, 1.0, 0.95, '#ffffff', 0.3, 0.2, 0);
  box(g, 1.72, 0.2, 0.96, '#15c2b0', 0.3, 0.7, 0);
  box(g, 0.7, 0.7, 0.9, '#ff8a1f', -0.95, 0.2, 0);
  box(g, 0.12, 0.3, 0.8, '#2c3240', -1.3, 0.55, 0, { shadow: false });
  wheel(g, -0.9, 0, 0.45, 0.17, 0.12, true);
  wheel(g, 0.7, 0, 0.45, 0.17, 0.12, true);
  wheel(g, -0.9, 0, -0.45, 0.17, 0.12, true);
  wheel(g, 0.7, 0, -0.45, 0.17, 0.12, true);
  return g;
}

export function tree(parent, x, y, z, s = 1) {
  const g = group(parent, x, y, z);
  const h = 0.3 + Math.floor(rand() * 3) * 0.3;
  box(g, 0.3, h, 0.3, '#7a4b33', 0, 0, 0);
  box(g, 0.8 * s, (0.7 + rand() * 0.6) * s, 0.8 * s, pick(['#8fd14f', '#7cc242', '#9bde5a']), 0, h, 0);
  return g;
}

export function autumnTree(parent, x, y, z) {
  const g = group(parent, x, y, z);
  box(g, 0.3, 0.5, 0.3, '#6b3f2a', 0, 0, 0);
  box(g, 0.85, 0.85, 0.85, pick(['#f2a541', '#e8743b', '#f6c453']), 0, 0.5, 0);
  return g;
}

export function pine(parent, x, y, z, snowy = false) {
  const g = group(parent, x, y, z);
  box(g, 0.24, 0.4, 0.24, '#6b3f2a', 0, 0, 0);
  const c = snowy ? '#2f7d5b' : '#3c9a5f';
  box(g, 0.9, 0.4, 0.9, c, 0, 0.4, 0);
  box(g, 0.66, 0.4, 0.66, c, 0, 0.8, 0);
  box(g, 0.4, 0.4, 0.4, c, 0, 1.2, 0);
  if (snowy) {
    box(g, 0.92, 0.08, 0.92, '#ffffff', 0, 0.8, 0);
    box(g, 0.68, 0.08, 0.68, '#ffffff', 0, 1.2, 0);
    box(g, 0.42, 0.1, 0.42, '#ffffff', 0, 1.6, 0);
  }
  return g;
}

export function rock(parent, x, y, z, color = '#b9b3c9') {
  const g = group(parent, x, y, z);
  box(g, 0.7, 0.35, 0.6, color, 0, 0, 0);
  box(g, 0.45, 0.2, 0.4, '#d6d0e3', 0.05, 0.35, 0);
  return g;
}

export function cactus(parent, x, y, z) {
  const g = group(parent, x, y, z);
  const c = '#3fae6a';
  box(g, 0.3, 1.2, 0.3, c, 0, 0, 0);
  box(g, 0.2, 0.2, 0.2, c, -0.25, 0.5, 0);
  box(g, 0.2, 0.4, 0.2, c, -0.35, 0.6, 0);
  box(g, 0.2, 0.2, 0.2, c, 0.25, 0.7, 0);
  box(g, 0.2, 0.3, 0.2, c, 0.35, 0.8, 0);
  box(g, 0.1, 0.1, 0.1, '#ff6fa8', 0, 1.2, 0);
  return g;
}

export function mesa(parent, x, y, z, w = 3, h = 2.5) {
  const g = group(parent, x, y, z);
  box(g, w, h, w * 0.8, '#d9774a', 0, 0, 0);
  box(g, w * 1.05, 0.25, w * 0.85, '#c4623a', 0, h * 0.4, 0);
  box(g, w * 0.8, 0.5, w * 0.6, '#e38b5c', 0, h, 0);
  return g;
}

export function flowers(parent, x, y, z) {
  const g = group(parent, x, y, z);
  const c = pick(['#ff6fa8', '#ffd23f', '#ffffff', '#b28dff']);
  box(g, 0.1, 0.1, 0.1, c, 0, 0, 0, { shadow: false });
  box(g, 0.1, 0.1, 0.1, c, 0.2, 0, 0.15, { shadow: false });
  box(g, 0.1, 0.1, 0.1, c, -0.15, 0, 0.2, { shadow: false });
  return g;
}

export function makeWakeboard() {
  const g = group();
  box(g, 0.4, 0.06, 1.1, '#ffd23f', 0, 0, 0);
  box(g, 0.3, 0.05, 0.1, '#ffd23f', 0, 0.02, -0.58);
  box(g, 0.3, 0.05, 0.1, '#ffd23f', 0, 0.02, 0.58);
  box(g, 0.41, 0.065, 0.3, '#1b1b1f', 0, 0, 0);
  box(g, 0.28, 0.12, 0.14, '#ff3b5c', 0, 0.06, -0.22);
  box(g, 0.28, 0.12, 0.14, '#ff3b5c', 0, 0.06, 0.22);
  return g;
}

export function makeBoat() {
  const g = group();
  box(g, 1.3, 0.45, 2.6, '#ffffff', 0, 0, 0);
  box(g, 1.32, 0.12, 2.62, '#15c2b0', 0, 0.12, 0);
  box(g, 0.9, 0.35, 0.6, '#ffffff', 0, 0, -1.5);
  box(g, 0.5, 0.25, 0.3, '#ffffff', 0, 0, -1.9);
  box(g, 1.0, 0.1, 1.2, '#2b3240', 0, 0.45, 0.3);
  box(g, 1.0, 0.36, 0.06, '#9fdcff', 0, 0.45, -0.3, { shadow: false });
  // Wakeboard tower
  box(g, 0.08, 0.8, 0.08, '#9aa0a8', -0.55, 0.45, 0.2);
  box(g, 0.08, 0.8, 0.08, '#9aa0a8', 0.55, 0.45, 0.2);
  box(g, 1.18, 0.08, 0.08, '#9aa0a8', 0, 1.25, 0.2);
  box(g, 0.3, 0.2, 0.3, '#2b3240', 0, 0.45, 1.1);
  return g;
}

// Faces -z. Origin at the belly so it can sit under a rider.
export function makeDolphin() {
  const g = group();
  box(g, 0.5, 0.45, 1.5, '#6f8fb3', 0, 0.05, 0);
  box(g, 0.42, 0.12, 1.2, '#dfe9f5', 0, 0, -0.05);
  box(g, 0.34, 0.3, 0.3, '#6f8fb3', 0, 0.1, -0.85);
  box(g, 0.18, 0.12, 0.3, '#8fa9c8', 0, 0.1, -1.1);
  box(g, 0.08, 0.3, 0.3, '#5d7ca0', 0, 0.5, 0.1);
  box(g, 0.2, 0.2, 0.4, '#6f8fb3', 0, 0.15, 0.9);
  box(g, 0.8, 0.06, 0.26, '#5d7ca0', 0, 0.2, 1.15);
  box(g, 0.52, 0.08, 0.08, '#1b1b1f', 0, 0.3, -0.72, { shadow: false });
  box(g, 0.7, 0.06, 0.24, '#5d7ca0', 0, 0.02, -0.3);
  return g;
}
