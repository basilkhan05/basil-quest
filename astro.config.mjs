import { defineConfig } from 'astro/config';

// SITE / BASE let the same build serve from a project path
// (basilkhan05.github.io/basil-quest) or a custom domain root.
export default defineConfig({
  site: process.env.SITE || 'https://www.basilkhan.ca',
  base: process.env.BASE || '/',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
});
