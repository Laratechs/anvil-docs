// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import { groups } from './site.structure.mjs';
import { theme } from './theme/theme.config.mjs';

// GitHub Pages serves this repository at https://<owner>.github.io/<repo>/.
// The Pages workflow passes the real values (an empty BASE_PATH means a
// custom domain at the root); without them, these defaults match it.
const fromPages = Boolean(process.env.SITE_URL);
const site = fromPages ? process.env.SITE_URL : 'https://laratechs.github.io';
const base = fromPages ? process.env.BASE_PATH || '/' : '/anvil-docs';

export default defineConfig({
  site,
  base,
  integrations: [
    starlight({
      title: 'Anvil',
      description: 'Documentation for Anvil, the Laratechs Internal Developer Platform.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/Laratechs/anvil' }],
      // Authored pages are edited here; generated pages set their own
      // editUrl pointing at the upstream file.
      editLink: { baseUrl: 'https://github.com/Laratechs/anvil-docs/edit/main/' },
      // Navigation comes from the one structure file.
      sidebar: groups.map((g) => ({
        label: g.label,
        items: g.pages.map((p) =>
          p.link ? { label: p.label, link: `/${p.link}` } : { label: p.label, slug: p.slug },
        ),
      })),
      // Everything visual comes from theme/.
      ...theme,
    }),
  ],
});
