# basil-quest

Personal site for Basil Khan: a Crossy Road style voxel world built with Astro and Three.js.

## Develop

```sh
npm install
npm run dev
```

Requires Node 22+.

## Where things live

- `src/game/story.js`: every stop (copy, bubbles, year) and the cinematic path between stops. Edit this to change the story.
- `src/game/world.js`: terrain, scenery and landmarks.
- `src/game/models.js`: voxel models (Basil, Bronco, bike, boards, lift chair, rocket).
- `src/game/engine.js`: camera, playback, particles, voxelized logos, HUD.
- `src/content/thoughts/*.md`: blog posts. Set `draft: true` to hide one.
- `src/pages/work.astro`: Freshly Commerce products page.

Add `?debug` to the URL to expose `window.__quest` (`go(i)`, `step(seconds)`, `state()`).

## Deploy

Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`.
Set the `CUSTOM_DOMAIN` repository variable (for example `www.basilkhan.ca`) to build for a domain root and write the CNAME file.
