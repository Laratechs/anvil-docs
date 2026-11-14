#!/usr/bin/env node
// Turns the upstream mirrors (upstream/<source>/) into site pages, as
// site.structure.mjs describes. Output goes to src/content/docs/upstream/,
// which is generated, git-ignored and rebuilt from scratch on every run.
//
//   node scripts/build-content.mjs
//
// Fails (exit 1) if a mapped file or heading is missing, or an authored
// page named in the structure doesn't exist, so a renamed upstream heading
// breaks the build instead of silently dropping a page.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pages, sources } from '../site.structure.mjs';
import { cut, headings, join, parse, plain, rewriteLinks, shiftHeadings } from './lib/markdown.mjs';
import { decorate } from '../theme/markdown.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(root, 'src/content/docs');
const outDir = path.join(docsDir, 'upstream');

const errors = [];
const fail = (page, msg) => errors.push(`${page.slug}: ${msg}`);

// --- Source metadata (written by scripts/sync-upstream.mjs) --------------

const sourceInfo = {};
for (const [name, src] of Object.entries(sources)) {
  const file = path.join(root, 'upstream', name, 'SOURCE.json');
  const info = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  sourceInfo[name] = { repo: src.repo, ref: info.ref ?? 'main', commit: info.commit ?? info.ref ?? 'main' };
}

const upstreamPath = (source, file) => path.join(root, 'upstream', source, file);
const githubUrl = (source, file, kind = 'blob') => {
  const { repo, commit, ref } = sourceInfo[source];
  return `https://github.com/${repo}/${kind}/${kind === 'edit' ? ref : commit}/${file}`;
};

// --- Index: which page shows which part of which upstream file -----------
//
// For every mapped file: the whole-file page (if any) and, for section
// pages, the line range each covers, so a link to file#anchor can find the
// page that ended up holding that heading.

const parsedFiles = new Map(); // "source:file" → parsed lines
const index = new Map(); // "source:file" → { whole, cuts: [{slug, start, end, heading}] }

function load(source, file) {
  const key = `${source}:${file}`;
  if (!parsedFiles.has(key)) {
    const p = upstreamPath(source, file);
    parsedFiles.set(key, fs.existsSync(p) ? parse(fs.readFileSync(p, 'utf8')) : null);
  }
  return parsedFiles.get(key);
}

for (const page of pages) {
  if (!page.from) continue;
  const { source, file, section } = page.from;
  if (!sources[source]) {
    fail(page, `unknown source "${source}"`);
    continue;
  }
  const parsed = load(source, file);
  if (!parsed) {
    fail(page, `upstream/${source}/${file} not found (run the sync, or fix site.structure.mjs)`);
    continue;
  }
  const key = `${source}:${file}`;
  if (!index.has(key)) index.set(key, { whole: null, cuts: [] });
  const entry = index.get(key);
  if (!file.endsWith('.md') || section === undefined) {
    entry.whole = page.slug;
    continue;
  }
  try {
    const c = cut(parsed, section);
    entry.cuts.push({ slug: page.slug, start: c.start, end: c.end, heading: c.heading });
  } catch (e) {
    fail(page, `upstream/${source}/${file}: ${e.message}`);
  }
}

// --- Link resolution ------------------------------------------------------

/** Relative URL from one page to another (pages are /<slug>/). */
function relativeUrl(fromSlug, toSlug, anchor) {
  const from = `/${fromSlug}/`.replace(/\/+/g, '/');
  const to = `/${toSlug}/`.replace(/\/+/g, '/');
  let rel = path.posix.relative(from, to);
  rel = rel === '' ? './' : `${rel}/`;
  return anchor ? `${rel}#${anchor}` : rel;
}

/** The page holding `anchor` (a heading id) of an upstream file, if mapped. */
function pageFor(source, file, anchor) {
  const entry = index.get(`${source}:${file}`);
  if (!entry) return null;
  if (entry.whole) return { slug: entry.whole, anchor };
  const parsed = load(source, file);
  if (anchor) {
    const h = headings(parsed).find((x) => x.id === anchor);
    if (h) {
      const c = entry.cuts.find((c) => c.heading?.index === h.index);
      if (c) return { slug: c.slug, anchor: null }; // the cut's own heading is the page title
      const inside = entry.cuts.find((c) => h.index >= c.start && h.index < c.end);
      if (inside) return { slug: inside.slug, anchor };
    }
    return null;
  }
  // No anchor: the file's opening, if a page shows it.
  const intro = entry.cuts.find((c) => c.heading === null || c.heading.level === 1);
  return intro ? { slug: intro.slug, anchor: null } : null;
}

function resolveLink(page, target, isImage) {
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(target)) return target; // absolute URL
  const { source, file } = page.from;
  const [rawPath, anchor = ''] = target.split('#');
  let file2 = file;
  if (rawPath) {
    if (rawPath.startsWith('/')) file2 = rawPath.slice(1);
    else file2 = path.posix.normalize(path.posix.join(path.posix.dirname(file), rawPath));
    file2 = file2.replace(/\/$/, '');
  }
  if (!isImage) {
    const hit = pageFor(source, file2, anchor || null);
    if (hit) return hit.slug === page.slug && hit.anchor ? `#${hit.anchor}` : relativeUrl(page.slug, hit.slug, hit.anchor);
    if (!rawPath) return target; // an anchor on this page
  }
  if (file2.startsWith('..')) return target; // outside the repository; leave it
  if (isImage) {
    const { repo, commit } = sourceInfo[source];
    return `https://raw.githubusercontent.com/${repo}/${commit}/${file2}`;
  }
  // Not on the site: link to the file on GitHub at the mirrored commit.
  return githubUrl(source, file2) + (anchor ? `#${anchor}` : '');
}

// --- Render ---------------------------------------------------------------

const yamlString = (s) => JSON.stringify(s); // JSON strings are valid YAML

function render(page) {
  const { source, file, section, title, description } = page.from;
  const parsed = load(source, file);
  let body;
  let pageTitle = title;

  if (!file.endsWith('.md')) {
    if (!title) fail(page, `a ${path.extname(file) || 'non-Markdown'} file needs a title in site.structure.mjs`);
    const lang = path.extname(file).slice(1) || 'text';
    const text = join(parsed).replace(/\n+$/, '');
    const longest = Math.max(2, ...(text.match(/`+/g) ?? ['']).map((r) => r.length));
    const fence = '`'.repeat(longest + 1);
    body = `This is \`${file}\` from [${sources[source].repo}](${githubUrl(source, file)}).\n\n${fence}${lang} title="${path.basename(file)}"\n${text}\n${fence}`;
  } else {
    const c = cut(parsed, section);
    pageTitle ??= c.heading ? plain(c.heading.text) : page.label;
    let lines = parsed.slice(c.start, c.end);
    lines = shiftHeadings(lines, c.shift);
    lines = rewriteLinks(lines, (t, img) => resolveLink(page, t, img));
    // The theme may wrap what it styles (status tables); the words don't change.
    lines = decorate(lines);
    body = join(lines).replace(/^\n+/, '').replace(/\n+$/, '');
  }

  const front = [
    '---',
    `title: ${yamlString(pageTitle ?? page.label)}`,
    description ? `description: ${yamlString(description)}` : null,
    `slug: ${yamlString(page.slug)}`,
    `editUrl: ${yamlString(githubUrl(source, file, 'edit'))}`,
    '---',
    '',
    `<!-- Generated from ${sources[source].repo}/${file} by scripts/build-content.mjs. Edit it upstream. -->`,
  ].filter((l) => l !== null);

  return `${front.join('\n')}\n\n${body}\n`;
}

// Plain .md, not MDX: upstream prose may contain `<` or `{`, which MDX
// would try to parse.
function write(page, content) {
  const out = path.join(outDir, `${page.slug}.md`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, content);
}

fs.rmSync(outDir, { recursive: true, force: true });

let generated = 0;
for (const page of pages) {
  if (!page.from) {
    const candidates = [`${page.slug}.md`, `${page.slug}.mdx`, `${page.slug}/index.md`, `${page.slug}/index.mdx`];
    if (!candidates.some((c) => fs.existsSync(path.join(docsDir, c)))) {
      fail(page, `authored page missing: create src/content/docs/${page.slug}.mdx`);
    }
    continue;
  }
  if (errors.some((e) => e.startsWith(`${page.slug}:`))) continue; // already reported
  try {
    write(page, render(page));
    generated++;
  } catch (e) {
    fail(page, e.message);
  }
}

if (errors.length) {
  console.error(`build-content: ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`build-content: ${generated} page(s) generated from upstream into ${path.relative(root, outDir)}/`);
