# Upstream mirrors

Each directory here is a **verbatim copy** of docs from another repository.
Don't edit them: changes are overwritten by the next sync. Fix the text in
the upstream repository instead; every generated page's "Edit page" link
goes there.

| Directory | Repository |
| --- | --- |
| `anvil/` | [Laratechs/anvil](https://github.com/Laratechs/anvil) |

## The contract

- **What is copied:** exactly the files `site.structure.mjs` builds pages
  from, at their upstream paths. The site, not the upstream repository,
  decides what's published and where it appears.
- **`SOURCE.json`:** the repository, branch (`ref`) and `commit` the files
  were copied from. Links to upstream files that aren't on the site point
  at that commit, so they keep working as upstream changes.
- **How it's written:** only by `scripts/sync-upstream.mjs`, which reads
  the files from the commit (not a working tree), removes files no page
  uses any more, and changes nothing if the docs are unchanged.
- **Who runs it:** the upstream repository. Anvil's `publish-docs`
  workflow runs `make docs-publish` on every push to its `main` that
  changes docs: it runs this sync on that commit, builds the site, commits
  the mirror here and pushes with a deploy key. Anvil's CI runs
  `make docs-check`, the same sync and build without the commit, on every
  change. [`publish-docs.workflow.yml`](publish-docs.workflow.yml) is the
  same for an upstream without `make docs-publish`. By hand:

  ```sh
  npm run sync -- --source anvil --from ../anvil --ref main
  ```

  Add `--worktree` to preview uncommitted upstream docs locally. Don't
  commit a mirror made that way: its `SOURCE.json` commit ends in
  `+worktree`.

## Adding an upstream doc to the site

1. Add a page with a `from` to `site.structure.mjs`.
2. Run the sync. It copies the new file.
3. `npm run dev` to check it.

The sync warns about upstream Markdown that no page uses and that
`sources.<name>.ignore` doesn't list, so new upstream docs get a decision.

## Adding another upstream repository

Add it to `sources` in `site.structure.mjs`, map its pages, and install
`publish-docs.workflow.yml` in that repository with `SOURCE` set to its key.
