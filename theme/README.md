# Theme

Everything about how the site **looks** lives in this directory, and
nothing about what it **says** or how it's **organized** does. Restyle the
site by changing files here only.

| File | What it controls |
| --- | --- |
| [`tokens.css`](tokens.css) | The palette, fonts and radius, for dark and light themes, as `--anvil-*` variables, and their mapping onto Starlight's `--sl-*` variables. Start here. |
| [`base.css`](base.css) | Global rules that tokens can't express (heading font, table corners). Keep it small. |
| [`markdown.mjs`](markdown.mjs), [`status.css`](status.css) | Status tables: an upstream Markdown table with a `State` column gets badges, issue chips, a tally under its heading and a summary at the top of the page (the roadmap). `markdown.mjs` adds the markup when pages are generated, and holds which tone each state is shown in. |
| [`components/`](components) | Markup and style for custom pieces: `PersonaCards.astro` (the home page's "where do you want to start" cards). Also where replacements for Starlight's own components go. |
| [`assets/logo-light.svg`](assets/logo-light.svg), [`assets/logo-dark.svg`](assets/logo-dark.svg) | The header logo (placeholder), one per theme, inked in that theme's `--anvil-accent`. `public/favicon.svg` is the same mark, switching ink with the browser's colour scheme. Change all three together. |
| [`theme.config.mjs`](theme.config.mjs) | Wires the above into Starlight: logo, favicon, stylesheets, component overrides. |

The colours come from the **Anvil Design System**: slate blue monochrome
(`#44637A`) with rose and olive marks for the Run and Catalogs personas.
Each `--anvil-*` colour is the system's semantic token of the same name,
with the primitive step it aliases in a comment, so a palette change there
is copied here value for value. Type and shape are still the original
neutral values, and the logo is still a placeholder.

## Restyling (for example, with Claude Design)

1. Give the design tool `tokens.css` and a screenshot or two of the running
   site (`npm run dev`, then <http://localhost:4321/anvil-docs/>). Pages
   worth showing: the home page, a persona overview (`/run/`), and a long
   reference page (`/catalogs/contract/`), in both dark and light.
2. Bring back new token values. Change only the `--anvil-*` block in
   `tokens.css`; the mapping onto Starlight below it rarely needs to change.
3. For a font: add the `@font-face` or Google Fonts `@import` at the top of
   `tokens.css` (or a new `fonts.css` listed first in `theme.config.mjs`)
   and set `--anvil-font-*`.
4. For a change tokens can't make, such as a different header or footer,
   override a Starlight component: write it in `components/` and register
   it under `components` in `theme.config.mjs`. Starlight's list of
   overridable components:
   <https://starlight.astro.build/reference/overrides/>.

## Rules

- No colours, font names or sizes outside `tokens.css`. Components and
  `base.css` use variables.
- Every colour has a dark value (`:root`) and a light value
  (`:root[data-theme='light']`). Check both: the theme picker is in the
  header.
- The three persona colours (`--anvil-persona-use`, `-run`, `-catalogs`)
  identify the three audiences wherever they appear.
- Content pages don't carry styling. If a page needs a visual element, add a
  component here and use it from the page.
