# anvil-docs

The documentation site for [Anvil](https://github.com/Laratechs/anvil), the
Laratechs Internal Developer Platform, published with GitHub Pages at
<https://laratechs.github.io/anvil-docs/>.

It is written for three people, each with their own section:

| Section | For | Does |
| --- | --- | --- |
| **Use Anvil** (`/use/`) | Engineers using Anvil | Create services, add clouds, archive and restore |
| **Run Anvil** (`/run/`) | Platform engineers running Anvil | Deploy, configure and upgrade the server; GitHub App; cloud bindings |
| **Build a catalog** (`/catalogs/`) | Catalog authors | The catalog contract and how to test a catalog |

plus **Concepts** and **Reference** that all three share.

## How it fits together

The site is built with [Astro Starlight](https://starlight.astro.build/).
Content, structure and look are kept apart, so each can change without the
others:

```
upstream/anvil/        WHAT IT SAYS   docs mirrored verbatim from Laratechs/anvil (never edit)
src/content/docs/      WHAT IT SAYS   pages written here: home and persona overviews
site.structure.mjs     HOW IT'S ORGANIZED  every page, its place in the nav, and its source
theme/                 HOW IT LOOKS   tokens, logo, components (see theme/README.md)
scripts/               build-content.mjs: mirror + structure → pages
                       sync-upstream.mjs: upstream checkout → mirror
```

Most of the words come from the Anvil repository. On every push to its
`main` that changes docs, its `publish-docs` workflow runs
`make docs-publish`, which mirrors the docs this site uses into
`upstream/anvil/` and commits here, and pushes; this repository's Pages
workflow then builds and publishes the site. Anvil's CI builds this site from every
change's docs, so a change there that would break it fails there first.
[upstream/README.md](upstream/README.md) describes that contract.

At build time, `scripts/build-content.mjs` turns the mirror into pages
under `src/content/docs/upstream/` (generated, not committed). A page can be
a whole upstream file or one section of one. Anvil keeps one file per page
under `docs/`, so the only section page is the README's opening. Links between upstream files become links between site
pages; links to upstream files that aren't on the site go to GitHub at the
mirrored commit. If a mapped file or heading disappears upstream, the build
fails and names it.

## Working on it

Needs Node (version in `.nvmrc`).

```sh
npm ci
npm run dev        # http://localhost:4321/anvil-docs/
npm run build      # the site, in dist/
```

| To… | Change |
| --- | --- |
| Fix or add words that come from Anvil | the Anvil repository, then sync |
| Add an upstream doc, move a page, rename a nav entry | `site.structure.mjs` |
| Write a page that only this site has | `src/content/docs/<slug>.mdx`, and list it in `site.structure.mjs` |
| Change colours, fonts, logo or layout | `theme/` only ([theme/README.md](theme/README.md)) |
| Pull Anvil's docs by hand | `npm run sync -- --source anvil --from ../anvil --ref main` |

## Publishing

`.github/workflows/pages.yml` builds every pull request and deploys every
push to `main`. One-time setup, in this repository's settings: **Pages →
Build and deployment → Source: GitHub Actions**.

New Anvil docs reach the site on their own: Anvil's `publish-docs`
workflow pushes here with a deploy key that has write access on this
repository only (Anvil's README, "Publishing the docs", sets it up). By
hand, from an Anvil checkout of `main` with this repository beside it:

```sh
make docs-publish        # checks, mirrors HEAD's docs, builds, commits here
git -C ../anvil-docs push
```

[`upstream/publish-docs.workflow.yml`](upstream/publish-docs.workflow.yml)
is a template for another upstream repository that doesn't have
`make docs-publish`.

## Known limitations

- **Upstream links to private files.** Laratechs/anvil is private, so links
  to its files that aren't on the site (source directories, test data)
  only work for organization members.
- **Pages depend on upstream paths.** Moving or renaming a mapped Anvil
  file (or the README's first `##` heading) breaks this site's build until
  `site.structure.mjs` is updated. That is deliberate: a loud failure
  instead of a silently missing page, and Anvil's CI reports it on the
  change that causes it.
- **A deploy key can push here.** Anyone who can run workflows in
  Laratechs/anvil can use its `ANVIL_DOCS_DEPLOY_KEY` to push to this
  repository's `main`. Rotate it from Anvil's README if it leaks.
- **One page per heading.** Duplicate heading text in one upstream file
  can't be mapped as a section.
