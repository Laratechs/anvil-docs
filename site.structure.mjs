// The site's information architecture: every page, where it sits in the
// navigation, and where its words come from. This is the one file to edit
// when a page is added, moved or renamed.
//
// A page is either
//   - authored here: { slug, label } with a matching file under
//     src/content/docs/<slug>.mdx (or <slug>/index.mdx), or
//   - generated from an upstream mirror: { slug, label, from } where
//     `from` names a file in upstream/<source>/ and, optionally, one
//     heading in it. scripts/build-content.mjs turns it into a page.
//
// `from` fields:
//   source       key in `sources`
//   file         path inside the upstream repository
//   section      omit for the whole file; a heading's exact text for that
//                heading and everything under it; null for the text before
//                the first `##`
//   title        page title (default: the file's `#` heading, or the section)
//   description  optional summary for search results and link previews
//
// Files that aren't Markdown (such as .hcl) are shown as one code block
// and need a `title`.
//
// A sidebar-only cross-link to a page that lives in another group is
// { label, link: '<slug>/#anchor' }. Use it instead of mapping the same
// upstream text twice.
//
// Nothing here is about how the site looks. That lives in theme/.

/** Upstream repositories whose docs are mirrored into upstream/<name>/. */
export const sources = {
  anvil: {
    repo: 'Laratechs/anvil',
    // Markdown files the sync script expects to find mapped below or listed
    // here as deliberately left out, so a new upstream doc isn't missed.
    ignore: ['AGENTS.md', 'CLAUDE.md', 'docs/agents/**'],
  },
};

/**
 * Links in the header bar, beside the site title. `link` is a path
 * relative to the site root, like a sidebar cross-link.
 */
export const header = [{ label: 'Docs', link: 'concepts/overview/' }];

/**
 * The navigation, in order. Each group is one persona (or a shared
 * section) and becomes one sidebar group. Upstream pages are whole files:
 * Anvil keeps one file per page under docs/, so a page only breaks when
 * its file moves. The README's opening (`section: null`) is the one cut.
 */
export const groups = [
  {
    id: 'concepts',
    label: 'Concepts',
    summary: 'The model every persona shares.',
    pages: [
      {
        slug: 'concepts/overview',
        label: 'What Anvil is',
        // `section: null` takes what comes before the file's first `##`.
        from: { source: 'anvil', file: 'README.md', section: null, title: 'What Anvil is' },
      },
      {
        slug: 'concepts/glossary',
        label: 'Glossary',
        from: { source: 'anvil', file: 'CONTEXT.md', title: 'Glossary' },
      },
      {
        slug: 'concepts/how-it-works',
        label: 'How Anvil works',
        from: { source: 'anvil', file: 'docs/how-it-works.md' },
      },
      {
        slug: 'concepts/testing',
        label: 'How Anvil is tested',
        from: { source: 'anvil', file: 'docs/testing.md' },
      },
      {
        slug: 'concepts/decisions',
        label: 'Decisions and limitations',
        from: { source: 'anvil', file: 'docs/decisions.md' },
      },
    ],
  },
  {
    id: 'use',
    label: 'Use Anvil',
    persona: 'Engineers using Anvil',
    summary:
      'Create a service, give it somewhere to run, and change or retire it.',
    pages: [
      { slug: 'use', label: 'Overview' },
      {
        slug: 'use/cli',
        label: 'Using the CLI',
        from: { source: 'anvil', file: 'docs/cli.md' },
      },
      {
        slug: 'use/cloud-run',
        label: 'Running on Cloud Run',
        from: { source: 'anvil', file: 'docs/gcp.md' },
      },
      {
        slug: 'use/api',
        label: 'HTTP API',
        from: { source: 'anvil', file: 'docs/api.md' },
      },
    ],
  },
  {
    id: 'run',
    label: 'Run Anvil',
    persona: 'Platform engineers running Anvil',
    summary:
      'Deploy and configure the server, connect it to GitHub and your clouds, and upgrade it.',
    pages: [
      { slug: 'run', label: 'Overview' },
      {
        slug: 'run/server',
        label: 'Running the server',
        from: { source: 'anvil', file: 'docs/server.md' },
      },
      {
        slug: 'run/configuration',
        label: 'Configuration file',
        from: {
          source: 'anvil',
          file: 'anvil.example.hcl',
          title: 'Configuration file reference',
          description: 'Every anvil server configuration attribute with its default.',
        },
      },
      {
        slug: 'run/github-app',
        label: 'GitHub App',
        from: { source: 'anvil', file: 'docs/github-app.md' },
      },
      {
        slug: 'run/cloud-run',
        label: 'Cloud Run setup',
        from: { source: 'anvil', file: 'docs/gcp-setup.md' },
      },
      {
        slug: 'run/releases',
        label: 'Releases and upgrades',
        from: { source: 'anvil', file: 'docs/releases.md' },
      },
      {
        label: 'Known limitations',
        link: 'concepts/decisions/#known-limitations',
      },
    ],
  },
  {
    id: 'catalogs',
    label: 'Build a catalog',
    persona: 'Catalog authors',
    summary:
      'Define what a service and each cloud are made of, and test it against Anvil.',
    pages: [
      { slug: 'catalogs', label: 'Overview' },
      {
        slug: 'catalogs/contract',
        label: 'Catalog contract',
        from: { source: 'anvil', file: 'docs/catalog-contract.md' },
      },
      {
        label: 'Testing a catalog',
        link: 'concepts/testing/#testing-a-catalog',
      },
    ],
  },
  {
    id: 'reference',
    label: 'Reference',
    pages: [
      {
        slug: 'reference/changelog',
        label: 'Changelog',
        from: { source: 'anvil', file: 'CHANGELOG.md' },
      },
      {
        slug: 'reference/validation-harness',
        label: 'Validation harness',
        from: { source: 'anvil', file: 'e2e/README.md' },
      },
    ],
  },
];

/** Every page in navigation order, with its group id (cross-links left out). */
export const pages = groups.flatMap((g) =>
  g.pages.filter((p) => p.slug !== undefined).map((p) => ({ ...p, group: g.id })),
);
