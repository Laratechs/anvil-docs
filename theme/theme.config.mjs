// The visual layer's hook into Starlight. astro.config.mjs spreads this
// object into the Starlight config, so the theme can change the logo,
// stylesheets, fonts or replace whole components without touching site
// structure or content.
//
// Paths are relative to the project root.

/** @type {Partial<import('@astrojs/starlight/types').StarlightUserConfig>} */
export const theme = {
  logo: {
    src: './theme/assets/logo.svg',
    // Hide the text title beside the logo by setting this to true once the
    // logo includes the wordmark.
    replacesTitle: false,
  },
  favicon: '/favicon.svg',
  customCss: [
    // Order matters: tokens first, then anything that uses them.
    './theme/tokens.css',
    './theme/base.css',
  ],
  // Replace Starlight's built-in components here, e.g.
  //   components: { Footer: './theme/components/Footer.astro' },
  // The full list: https://starlight.astro.build/reference/overrides/
  components: {},
};
