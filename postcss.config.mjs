/**
 * PostCSS config — Tailwind v4 build pipeline.
 *
 * IMPORTANT: previously this had `plugins: []` which meant Tailwind never ran
 * at build time. The repo shipped a frozen precompiled `globals.css` (8239
 * lines) that was missing utilities used by newer pages (login gradients,
 * signup page, etc.). Enabling `@tailwindcss/postcss` regenerates the CSS
 * on every build from the source `globals.css` (which now uses
 * `@import "tailwindcss"` + `@theme inline`).
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
