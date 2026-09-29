---
title: Why my website is a game now
date: 2026-09-28
summary: I rebuilt this site as a little voxel world. Here is why, and how it works.
tag: meta
---

My old site was a Gatsby template listing every job I've had. It answered "what has Basil done" and nothing else.

This version flips that. The past is still there if you rewind, but it takes up a few lanes. Most of the world is about what comes next: road trips in the Bronco, surfing, mountain biking, snowboarding, and the $100M mountain we're climbing at Freshly Commerce.

## How it's built

- [Astro](https://astro.build) builds everything to static HTML, and these posts are Markdown files in the repo.
- The world is [Three.js](https://threejs.org). Every object is made of boxes, and the static scenery is merged into a few dozen meshes so it runs on phones.
- The Freshly and Simple Bundles logos are real PNGs sampled pixel by pixel into 3D blocks.
- It's hosted on GitHub Pages.

Hit next on the home page and see where it goes.
