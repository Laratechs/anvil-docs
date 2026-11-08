#!/usr/bin/env node
// Mirrors an upstream repository's docs into upstream/<source>/, verbatim.
// Which files are copied is decided by site.structure.mjs: every file a
// page is generated from. The mirror is desired state: files no page uses
// any more are removed, and running it twice changes nothing.
//
//   node scripts/sync-upstream.mjs --source anvil --from ../anvil
//   node scripts/sync-upstream.mjs --source anvil --from ./anvil --ref main --commit "$GITHUB_SHA"
//
// Files are read from --commit (default HEAD), not the working tree, so the
// mirror is exactly what SOURCE.json says. --worktree reads the working
// tree instead, to preview uncommitted upstream docs locally (don't commit
// a mirror made that way). --ref (default: the checked-out branch) is the
// branch "Edit page" links point at.
// SOURCE.json records them, and is only rewritten when a mirrored file
// changed, so a sync with no doc changes leaves the tree clean.
//
// It also warns about Markdown files upstream that no page uses and
// `ignore` doesn't list, so new upstream docs don't go unnoticed.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { pages, sources } from '../site.structure.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { values: args } = parseArgs({
  options: {
    source: { type: 'string', default: 'anvil' },
    from: { type: 'string' },
    ref: { type: 'string' },
    commit: { type: 'string' },
    worktree: { type: 'boolean', default: false },
  },
});

const die = (msg) => {
  console.error(`sync-upstream: ${msg}`);
  process.exit(1);
};

const source = sources[args.source];
if (!source) die(`unknown source "${args.source}"; sources are: ${Object.keys(sources).join(', ')}`);
if (!args.from) die('--from <path to a checkout> is required');
const from = path.resolve(args.from);
if (!fs.existsSync(from)) die(`${from} does not exist`);

const git = (...a) => execFileSync('git', ['-C', from, ...a], { encoding: 'utf8' }).trim();
const ref = args.ref ?? git('rev-parse', '--abbrev-ref', 'HEAD');
const commit = args.commit ?? git('rev-parse', 'HEAD');
const read = (file) => {
  if (args.worktree) {
    const p = path.join(from, file);
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  }
  try {
    return execFileSync('git', ['-C', from, 'show', `${commit}:${file}`], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};

const mirror = path.join(root, 'upstream', args.source);
const wanted = [...new Set(pages.filter((p) => p.from?.source === args.source).map((p) => p.from.file))].sort();

// Copy what's wanted, noting whether anything changed.
let changed = false;
const missing = [];
for (const file of wanted) {
  const next = read(file);
  if (next === null) {
    missing.push(file);
    continue;
  }
  const dst = path.join(mirror, file);
  if (fs.existsSync(dst) && fs.readFileSync(dst).equals(next)) continue;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, next);
  console.log(`  updated ${file}`);
  changed = true;
}
if (missing.length) die(`site.structure.mjs uses files that ${args.source} doesn't have: ${missing.join(', ')}`);

// Remove what isn't wanted any more.
const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : [path.relative(mirror, p).split(path.sep).join('/')];
      })
    : [];
for (const file of walk(mirror)) {
  if (file === 'SOURCE.json' || wanted.includes(file)) continue;
  fs.rmSync(path.join(mirror, file));
  console.log(`  removed ${file}`);
  changed = true;
}
for (const dir of fs.existsSync(mirror) ? fs.readdirSync(mirror, { recursive: true }).reverse() : []) {
  const p = path.join(mirror, dir);
  if (fs.statSync(p).isDirectory() && fs.readdirSync(p).length === 0) fs.rmdirSync(p);
}

const sourceFile = path.join(mirror, 'SOURCE.json');
if (changed || !fs.existsSync(sourceFile)) {
  const info = { repo: source.repo, ref, commit: args.worktree ? `${commit}+worktree` : commit };
  fs.mkdirSync(mirror, { recursive: true });
  fs.writeFileSync(sourceFile, `${JSON.stringify(info, null, 2)}\n`);
  console.log(`sync-upstream: mirrored ${source.repo}@${commit.slice(0, 12)} (${ref}) into upstream/${args.source}/`);
} else {
  console.log(`sync-upstream: upstream/${args.source}/ already matches ${source.repo}; nothing changed`);
}

// Warn about upstream Markdown that nothing uses.
const globToRegExp = (g) =>
  new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*')}$`);
const ignored = (source.ignore ?? []).map(globToRegExp);
let tracked = [];
try {
  tracked = git('ls-tree', '-r', '--name-only', commit).split('\n').filter((f) => f.endsWith('.md'));
} catch {
  // Not a git checkout: skip the check.
}
const unused = tracked.filter((f) => !wanted.includes(f) && !ignored.some((r) => r.test(f)));
if (unused.length) {
  console.warn(
    `sync-upstream: warning: ${args.source} has Markdown no page uses. Map it in site.structure.mjs, or add it to sources.${args.source}.ignore:\n  ${unused.join('\n  ')}`,
  );
}
